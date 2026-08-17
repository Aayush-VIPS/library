import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { requireOperationsManagerApi } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Student, StudentState } from "@/lib/models";
import { parseCsv } from "@/lib/csv";
import { jsonError, requireSameOrigin } from "@/lib/http";

const REQUIRED = ["enrollmentNumber", "name", "rfidUid"];

export async function POST(req: NextRequest) {
  if (!(await requireOperationsManagerApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const raw = await req.text();
  if (raw.length > 2_000_000) return jsonError("CSV is too large.", 413);
  const rows = parseCsv(raw);
  if (rows.length < 2) return jsonError("CSV has no data rows.", 400);

  const headers = rows[0].map((x) => x.trim());
  for (const key of REQUIRED) if (!headers.includes(key)) return jsonError(`Missing CSV column: ${key}`, 400);
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const seenEnrollment = new Set<string>(), seenRfid = new Set<string>();
  const data = rows.slice(1).map((r, i) => ({
    row: i + 2,
    enrollmentNumber: r[idx.enrollmentNumber]?.trim() || "",
    name: r[idx.name]?.trim() || "",
    rfidUid: r[idx.rfidUid]?.trim() || "",
    course: r[idx.course]?.trim() || "",
    batch: r[idx.batch]?.trim() || "",
    section: r[idx.section]?.trim() || "",
  }));

  const errors: string[] = [];
  for (const x of data) {
    if (!x.enrollmentNumber || !x.name || !/^\d{1,15}$/.test(x.rfidUid)) errors.push(`Row ${x.row}: invalid required values.`);
    if (seenEnrollment.has(x.enrollmentNumber)) errors.push(`Row ${x.row}: duplicate enrollment in file.`);
    if (seenRfid.has(x.rfidUid)) errors.push(`Row ${x.row}: duplicate RFID in file.`);
    seenEnrollment.add(x.enrollmentNumber); seenRfid.add(x.rfidUid);
  }
  if (errors.length) return Response.json({ success: false, message: "CSV validation failed.", errors: errors.slice(0, 50) }, { status: 400 });

  await connectDB();
  let imported = 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const x of data) {
        const student = await Student.findOneAndUpdate(
          { enrollmentNumber: x.enrollmentNumber },
          { $set: { name: x.name, rfidUid: x.rfidUid, course: x.course, batch: x.batch, section: x.section, active: true } },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, session },
        );
        await StudentState.updateOne(
          { studentId: student._id },
          { $setOnInsert: { state: "OUT", version: 0 } },
          { upsert: true, session },
        );
        imported++;
      }
    });
  } catch (error: any) {
    imported = 0;
    if (error?.code === 11000) {
      return Response.json({ success: false, imported: 0, message: "Import rolled back: an RFID UID is already assigned to another student." }, { status: 409 });
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return Response.json({ success: true, imported });
}
