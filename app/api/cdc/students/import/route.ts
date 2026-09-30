import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { requireCDCApi } from "@/lib/cdc-auth";
import { connectDB } from "@/lib/db";
import { CDCStudent } from "@/lib/models";
import { parseCsv } from "@/lib/csv";
import { CDC_PROGRAM_CODES, cdcProgramLabel, decodeEnrollmentNumber } from "@/lib/cdc";
import { jsonError, requireSameOrigin } from "@/lib/http";

const REQUIRED = ["enrollmentNumber", "name", "cardId"];

export async function POST(req: NextRequest) {
  if (!(await requireCDCApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);

  const raw = await req.text();
  if (raw.length > 2_000_000) return jsonError("CSV is too large.", 413);
  const rows = parseCsv(raw);
  if (rows.length < 2) return jsonError("CSV has no data rows.", 400);

  const headers = rows[0].map((value) => value.trim());
  for (const key of REQUIRED) if (!headers.includes(key)) return jsonError(`Missing CSV column: ${key}`, 400);
  const idx = Object.fromEntries(headers.map((header, index) => [header, index]));

  const seenEnrollment = new Set<string>();
  const seenCard = new Set<string>();
  const errors: string[] = [];
  const data = rows.slice(1).map((row, index) => {
    const decoded = decodeEnrollmentNumber(row[idx.enrollmentNumber] || "");
    const cardId = String(row[idx.cardId] || "").replace(/\D/g, "");
    const name = String(row[idx.name] || "").trim();
    const department = idx.department == null ? "" : String(row[idx.department] || "").trim();
    const sourceProgram = idx.program == null ? "" : String(row[idx.program] || "").trim();
    const item = { row: index + 2, decoded, cardId, name, department, sourceProgram };
    if (!decoded || !name || !/^\d{1,20}$/.test(cardId)) errors.push(`Row ${item.row}: invalid enrollment, name or Card ID.`);
    if (decoded && decoded.instituteCode !== "177") errors.push(`Row ${item.row}: institute code ${decoded.instituteCode} is not VIPS 177.`);
    if (decoded && !CDC_PROGRAM_CODES.has(decoded.programCode)) errors.push(`Row ${item.row}: programme code ${decoded.programCode} is not in the approved CDC B.Tech list.`);
    if (decoded && seenEnrollment.has(decoded.enrollmentNumber)) errors.push(`Row ${item.row}: duplicate enrollment number in file.`);
    if (seenCard.has(cardId)) errors.push(`Row ${item.row}: duplicate Card ID in file.`);
    if (decoded) seenEnrollment.add(decoded.enrollmentNumber);
    if (cardId) seenCard.add(cardId);
    return item;
  });

  if (errors.length) return Response.json({ success: false, message: "CDC roster validation failed.", errors: errors.slice(0, 50) }, { status: 400 });

  await connectDB();
  let imported = 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of data) {
        const decoded = item.decoded!;
        await CDCStudent.findOneAndUpdate(
          { enrollmentNumber: decoded.enrollmentNumber },
          { $set: {
            name: item.name,
            cardId: item.cardId,
            rollNumber: decoded.rollNumber,
            instituteCode: decoded.instituteCode,
            programCode: decoded.programCode,
            program: item.sourceProgram || cdcProgramLabel(decoded.programCode),
            admissionYear: decoded.admissionYear,
            department: item.department,
            active: true,
          } },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, session },
        );
        imported++;
      }
    });
  } catch (error: any) {
    imported = 0;
    if (error?.code === 11000) return jsonError("Import rolled back: a Card ID is already assigned to another CDC student.", 409);
    throw error;
  } finally {
    await session.endSession();
  }

  return Response.json({ success: true, imported });
}
