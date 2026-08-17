import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { LibraryVisit, StudentState } from "@/lib/models";
import { dayBoundsIST } from "@/lib/time";

let lastCheckAt = 0;
const CHECK_INTERVAL_MS = 60_000;

export async function autoCloseDueVisits(now = new Date()) {
  if (now.getTime() - lastCheckAt < CHECK_INTERVAL_MS) return { closedCount: 0, skipped: true };
  lastCheckAt = now.getTime();
  await connectDB();
  const today = dayBoundsIST(now);
  const dueBefore = now >= today.close ? today.close : today.open;
  const openVisits: any[] = await LibraryVisit.find({ outAt: { $exists: false }, inAt: { $lt: dueBefore } }).limit(10_000).lean();
  const due = openVisits.filter((visit) => now >= dayBoundsIST(new Date(visit.inAt)).close);
  if (!due.length) return { closedCount: 0 };

  const session = await mongoose.startSession();
  let closedCount = 0;
  try {
    await session.withTransaction(async () => {
      for (const visit of due) {
        const closeAt = dayBoundsIST(new Date(visit.inAt)).close;
        const updated = await LibraryVisit.updateOne(
          { _id: visit._id, outAt: { $exists: false } },
          { $set: { outAt: closeAt, outMethod: "AUTO_6PM" } },
          { session },
        );
        if (!updated.modifiedCount) continue;

        await StudentState.updateOne(
          { studentId: visit.studentId, currentVisitId: visit._id },
          {
            $set: { state: "OUT", lastScanAt: closeAt, lastEventId: `AUTO_6PM:${visit._id}` },
            $unset: { currentVisitId: 1 },
            $inc: { version: 1 },
          },
          { session },
        );
        closedCount++;
      }
    });
    return { closedCount };
  } finally {
    await session.endSession();
  }
}
