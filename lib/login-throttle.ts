import { connectDB } from "@/lib/db";
import { LoginThrottle } from "@/lib/models";

const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 15 * 60_000;
const MAX_FAILURES = 5;

export async function loginAllowed(key: string) {
  await connectDB();
  const row = await LoginThrottle.findOne({ key }).lean();
  return !row?.blockedUntil || row.blockedUntil <= new Date();
}

export async function recordLoginFailure(key: string) {
  await connectDB();
  const now = new Date();
  let row = await LoginThrottle.findOne({ key });
  if (!row || now.getTime() - row.windowStartedAt.getTime() > WINDOW_MS) {
    row = await LoginThrottle.findOneAndUpdate(
      { key },
      { $set: { failures: 1, windowStartedAt: now }, $unset: { blockedUntil: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    return;
  }
  row.failures += 1;
  if (row.failures >= MAX_FAILURES) row.blockedUntil = new Date(now.getTime() + BLOCK_MS);
  await row.save();
}

export async function clearLoginFailures(key: string) {
  await connectDB();
  await LoginThrottle.deleteOne({ key });
}
