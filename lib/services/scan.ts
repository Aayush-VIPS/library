import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { LibraryVisit, ScanEvent, Student, StudentState } from "@/lib/models";
import { DEFAULT_LIBRARY_ID } from "@/lib/libraries";
import { dayBoundsIST, isDayClosed, isWithinLibraryHours } from "@/lib/time";

const DUPLICATE_WINDOW_MS = 5000;

type ScanInput = {
  eventId: string;
  rfidUid: string;
  scannedAt: Date;
  deviceId: mongoose.Types.ObjectId;
  libraryId?: string;
};

type Result = { status: number; body: Record<string, unknown> };

function responseForStored(event: any, student: any | null): Result {
  const common = {
    success: event.status === "PROCESSED",
    idempotentReplay: true,
    eventId: event.eventId,
    direction: event.direction ?? null,
    scannedAt: event.scannedAt,
    code: event.reasonCode ?? undefined,
    student: student ? {
      id: String(student._id), name: student.name,
      enrollmentNumber: student.enrollmentNumber, course: student.course,
    } : null,
  };
  if (event.status === "PROCESSED") return { status: 200, body: common };
  if (event.status === "DUPLICATE") return { status: 409, body: { ...common, code: "DUPLICATE_SCAN", message: "Card was just scanned." } };
  if (event.status === "UNKNOWN_CARD") return { status: 404, body: { ...common, code: "CARD_NOT_FOUND", message: "Card is not registered." } };
  return { status: 409, body: { ...common, code: event.reasonCode || "SCAN_REJECTED", message: "Scan was rejected." } };
}

async function storedReplay(eventId: string) {
  const event = await ScanEvent.findOne({ eventId }).lean();
  if (!event) return null;
  const student = event.studentId ? await Student.findById(event.studentId).lean() : null;
  return responseForStored(event, student);
}

async function createRejected(input: ScanInput, data: { status: "REJECTED" | "UNKNOWN_CARD"; reasonCode: string; studentId?: mongoose.Types.ObjectId }) {
  try {
    const event = await ScanEvent.create({
      ...input,
      receivedAt: new Date(),
      studentId: data.studentId,
      status: data.status,
      reasonCode: data.reasonCode,
    });
    return event;
  } catch (error: any) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

export async function processLibraryScan(input: ScanInput): Promise<Result> {
  await connectDB();

  const replay = await storedReplay(input.eventId);
  if (replay) return replay;

  if (input.scannedAt.getTime() > Date.now() + 2 * 60_000) {
    await createRejected(input, { status: "REJECTED", reasonCode: "BAD_CLOCK" });
    return { status: 422, body: { success: false, code: "BAD_CLOCK", message: "Reader clock is ahead of server time." } };
  }

  if (!isWithinLibraryHours(input.scannedAt)) {
    await createRejected(input, { status: "REJECTED", reasonCode: "LIBRARY_CLOSED" });
    return { status: 409, body: { success: false, code: "LIBRARY_CLOSED", message: "Library RFID attendance is open from 9:00 AM to 6:00 PM." } };
  }

  const student = await Student.findOne({ rfidUid: input.rfidUid, active: true }).lean();
  if (!student) {
    await createRejected(input, { status: "UNKNOWN_CARD", reasonCode: "CARD_NOT_FOUND" });
    return { status: 404, body: { success: false, code: "CARD_NOT_FOUND", message: "Card is not registered." } };
  }

  // State exists for every registered student. This upsert is a safety net for legacy imports.
  await StudentState.updateOne(
    { studentId: student._id },
    { $setOnInsert: { state: "OUT", version: 0 } },
    { upsert: true },
  );

  const bounds = dayBoundsIST(input.scannedAt);
  const session = await mongoose.startSession();
  let result: Result | null = null;

  try {
    await session.withTransaction(async () => {
      const existing = await ScanEvent.findOne({ eventId: input.eventId }).session(session).lean();
      if (existing) {
        result = responseForStored(existing, student);
        return;
      }

      const state: any = await StudentState.findOne({ studentId: student._id }).session(session);
      if (!state) throw new Error("StudentState missing for registered student");

      // This update makes StudentState the per-student serialization point. Concurrent
      // readers touching the same student cause a transaction conflict/retry, while
      // unrelated students remain independent.
      const locked = await StudentState.updateOne(
        { _id: state._id, version: state.version },
        { $inc: { version: 1 } },
        { session },
      );
      if (locked.modifiedCount !== 1) throw new Error("STUDENT_STATE_RACE");

      await ScanEvent.create([{
        eventId: input.eventId,
        studentId: student._id,
        deviceId: input.deviceId,
        libraryId: input.libraryId || DEFAULT_LIBRARY_ID,
        rfidUid: input.rfidUid,
        scannedAt: input.scannedAt,
        receivedAt: new Date(),
        status: "PENDING",
      }], { session });

      // Rebuild this student's day from immutable scan timestamps. This makes delayed
      // offline uploads safe: if a 10:31 scan arrives at 10:38 (or even after 6 PM),
      // the visit projection follows scannedAt, not network arrival order.
      const candidates: any[] = await ScanEvent.find({
        studentId: student._id,
        scannedAt: { $gte: bounds.open, $lt: bounds.close },
        status: { $in: ["PENDING", "PROCESSED", "DUPLICATE"] },
      }).sort({ scannedAt: 1, eventId: 1 }).session(session).lean();

      const accepted: any[] = [];
      const acceptedIds = new Set<string>();
      let lastAcceptedAt = -Infinity;

      for (const event of candidates) {
        const at = new Date(event.scannedAt).getTime();
        if (at - lastAcceptedAt < DUPLICATE_WINDOW_MS) continue;
        accepted.push(event);
        acceptedIds.add(event.eventId);
        lastAcceptedAt = at;
      }

      if (candidates.length) {
        await ScanEvent.bulkWrite(candidates.map((event) => {
          const acceptedIndex = accepted.findIndex((a) => a.eventId === event.eventId);
          if (acceptedIndex >= 0) {
            return { updateOne: { filter: { _id: event._id }, update: {
              $set: { status: "PROCESSED", direction: acceptedIndex % 2 === 0 ? "IN" : "OUT" },
              $unset: { reasonCode: 1 },
            } } };
          }
          return { updateOne: { filter: { _id: event._id }, update: {
            $set: { status: "DUPLICATE", reasonCode: "DUPLICATE_SCAN" },
            $unset: { direction: 1 },
          } } };
        }), { session });
      }

      // Visits are a projection of the immutable accepted event stream. Rebuilding only
      // one student's one day keeps this small and guarantees correct ordering.
      await LibraryVisit.deleteMany({
        studentId: student._id,
        inAt: { $gte: bounds.open, $lt: bounds.close },
      }).session(session);

      const closedDay = isDayClosed(input.scannedAt, new Date());
      const visitDocs: any[] = [];
      for (let i = 0; i < accepted.length; i += 2) {
        const inEvent = accepted[i];
        const outEvent = accepted[i + 1];
        const doc: any = {
          studentId: student._id,
          inEventId: inEvent.eventId,
          inLibraryId: inEvent.libraryId || DEFAULT_LIBRARY_ID,
          inAt: inEvent.scannedAt,
          inDeviceId: inEvent.deviceId,
        };
        if (outEvent) {
          doc.outEventId = outEvent.eventId;
          doc.outLibraryId = outEvent.libraryId || DEFAULT_LIBRARY_ID;
          doc.outAt = outEvent.scannedAt;
          doc.outDeviceId = outEvent.deviceId;
          doc.outMethod = "RFID_SCAN";
        } else if (closedDay) {
          doc.outAt = bounds.close;
          doc.outMethod = "AUTO_6PM";
        }
        visitDocs.push(doc);
      }

      const createdVisits: any[] = visitDocs.length
        ? await LibraryVisit.insertMany(visitDocs, { session })
        : [];

      const lastAccepted = accepted.at(-1);
      const openVisit = createdVisits.find((visit) => !visit.outAt);
      await StudentState.updateOne(
        { _id: state._id },
        {
          $set: {
            state: openVisit ? "IN" : "OUT",
            ...(openVisit ? { currentVisitId: openVisit._id } : {}),
            ...(lastAccepted ? { lastScanAt: lastAccepted.scannedAt, lastEventId: lastAccepted.eventId } : {}),
          },
          ...(!openVisit ? { $unset: { currentVisitId: 1 } } : {}),
        },
        { session },
      );

      const currentIndex = accepted.findIndex((e) => e.eventId === input.eventId);
      if (currentIndex < 0 || !acceptedIds.has(input.eventId)) {
        result = {
          status: 409,
          body: {
            success: false,
            code: "DUPLICATE_SCAN",
            message: "This card was just scanned on a reader.",
            student: { id: String(student._id), name: student.name, enrollmentNumber: student.enrollmentNumber, course: student.course },
          },
        };
      } else {
        result = {
          status: 200,
          body: {
            success: true,
            eventId: input.eventId,
            direction: currentIndex % 2 === 0 ? "IN" : "OUT",
            scannedAt: input.scannedAt.toISOString(),
            student: { id: String(student._id), name: student.name, enrollmentNumber: student.enrollmentNumber, course: student.course },
          },
        };
      }
    });
  } finally {
    await session.endSession();
  }

  if (!result) {
    const after = await storedReplay(input.eventId);
    if (after) return after;
    throw new Error("Scan transaction completed without a result");
  }
  return result;
}
