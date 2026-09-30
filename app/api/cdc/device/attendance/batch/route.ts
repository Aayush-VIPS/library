import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateDevice } from "@/lib/device-auth";
import { connectDB } from "@/lib/db";
import { CDCAttendance, CDCSession, CDCStudent } from "@/lib/models";
import { jsonError } from "@/lib/http";

const scanSchema = z.object({
  eventId: z.string().min(12).max(120),
  rfidUid: z.string().regex(/^\d{1,15}$/),
  capturedAt: z.string().datetime({ offset: true }),
});

const bodySchema = z.object({
  sessionId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  firmwareVersion: z.string().max(40).optional(),
  scans: z.array(scanSchema).min(1).max(40),
});

type ResultCode =
  | "RECORDED"
  | "ALREADY_PROCESSED"
  | "DUPLICATE_ATTENDANCE"
  | "CARD_NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "SESSION_CLOSED";

export async function POST(req: NextRequest) {
  const device: any = await authenticateDevice(req);
  if (!device || device.deviceType !== "CDC_GATE") {
    return jsonError("CDC reader authentication failed.", 401, "DEVICE_AUTH_FAILED");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid CDC batch payload.", 400, "BAD_REQUEST");

  await connectDB();
  const session: any = await CDCSession.findById(parsed.data.sessionId).lean();
  if (!session) return jsonError("CDC session not found.", 404, "SESSION_NOT_FOUND");

  const scans = parsed.data.scans;
  const uids = [...new Set(scans.map((scan) => scan.rfidUid))];
  const eventIds = [...new Set(scans.map((scan) => scan.eventId))];

  const students: any[] = await CDCStudent.find({ active: true, cardId: { $in: uids } })
    .select({ name: 1, enrollmentNumber: 1, program: 1, programCode: 1, cardId: 1 })
    .lean();
  const studentByCard = new Map(students.map((student) => [student.cardId, student]));

  const studentIds = students.map((student) => student._id);
  const [eventAttendance, existingAttendance]: [any[], any[]] = await Promise.all([
    CDCAttendance.find({ eventId: { $in: eventIds } }).select({ eventId: 1, studentId: 1 }).lean(),
    studentIds.length
      ? CDCAttendance.find({ sessionId: session._id, studentId: { $in: studentIds } })
          .select({ eventId: 1, studentId: 1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const attendanceByEvent = new Map(eventAttendance.map((row) => [row.eventId, row]));
  const attendedStudentIds = new Set(existingAttendance.map((row) => String(row.studentId)));
  const eligible = new Set<string>(session.eligibleProgramCodes || []);
  const closedAt = session.status === "CLOSED" && session.closedAt ? new Date(session.closedAt) : null;

  const preResults = new Map<string, { code: ResultCode; message: string }>();
  const docs: any[] = [];
  const plannedStudents = new Set<string>();
  const plannedEvents = new Set<string>();

  for (const scan of scans) {
    if (attendanceByEvent.has(scan.eventId) || plannedEvents.has(scan.eventId)) {
      preResults.set(scan.eventId, { code: "ALREADY_PROCESSED", message: "Event already processed." });
      continue;
    }

    const student: any = studentByCard.get(scan.rfidUid);
    if (!student) {
      preResults.set(scan.eventId, { code: "CARD_NOT_FOUND", message: "Card is not in the CDC roster." });
      continue;
    }

    if (eligible.size && !eligible.has(student.programCode)) {
      preResults.set(scan.eventId, { code: "NOT_ELIGIBLE", message: "Student is not eligible for this session." });
      continue;
    }

    const capturedAt = new Date(scan.capturedAt);
    if (closedAt && capturedAt.getTime() > closedAt.getTime()) {
      preResults.set(scan.eventId, { code: "SESSION_CLOSED", message: "Session was closed before this scan." });
      continue;
    }

    const studentId = String(student._id);
    if (attendedStudentIds.has(studentId) || plannedStudents.has(studentId)) {
      preResults.set(scan.eventId, { code: "DUPLICATE_ATTENDANCE", message: "Student is already present." });
      continue;
    }

    plannedStudents.add(studentId);
    plannedEvents.add(scan.eventId);
    docs.push({
      sessionId: session._id,
      studentId: student._id,
      cardId: student.cardId,
      eventId: scan.eventId,
      capturedAt,
      markedAt: capturedAt,
      deviceId: device._id,
      method: "SCAN",
    });
  }

  if (docs.length) {
    try {
      await CDCAttendance.insertMany(docs, { ordered: false });
    } catch (error: any) {
      // Concurrent readers can race for the same student. Unique indexes are the
      // final authority; query below determines what committed.
      if (error?.code !== 11000 && !Array.isArray(error?.writeErrors)) throw error;
    }
  }

  const committed: any[] = docs.length
    ? await CDCAttendance.find({ eventId: { $in: docs.map((doc) => doc.eventId) } })
        .select({ eventId: 1 })
        .lean()
    : [];
  const committedEvents = new Set(committed.map((row) => row.eventId));

  device.lastSeenAt = new Date();
  device.queueDepth = Math.max(0, Number(req.headers.get("x-queue-depth") || 0) || 0);
  if (parsed.data.firmwareVersion) device.firmwareVersion = parsed.data.firmwareVersion;
  await device.save();

  const results = scans.map((scan) => {
    const preset = preResults.get(scan.eventId);
    if (preset) return { eventId: scan.eventId, rfidUid: scan.rfidUid, ...preset };

    if (committedEvents.has(scan.eventId)) {
      const student: any = studentByCard.get(scan.rfidUid);
      return {
        eventId: scan.eventId,
        rfidUid: scan.rfidUid,
        code: "RECORDED" as ResultCode,
        message: "Attendance recorded.",
        studentName: student?.name || "",
        enrollmentNumber: student?.enrollmentNumber || "",
      };
    }

    return {
      eventId: scan.eventId,
      rfidUid: scan.rfidUid,
      code: "DUPLICATE_ATTENDANCE" as ResultCode,
      message: "Student attendance was already recorded by another reader.",
    };
  });

  return Response.json({
    success: true,
    sessionId: parsed.data.sessionId,
    processed: results.length,
    results,
  });
}
