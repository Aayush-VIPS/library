import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { requireCDCApi } from "@/lib/cdc-auth";
import { connectDB } from "@/lib/db";
import { CDCAttendance, CDCSession, CDCStudent } from "@/lib/models";
import { normalizeEnrollmentNumber } from "@/lib/cdc";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({ identifier: z.string().trim().min(1).max(50) });

function codedError(code: string, message: string) {
  return Object.assign(new Error(message), { cdcCode: code });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireCDCApi();
  if (!admin) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Scan a valid Card ID or enrollment number.", 400);

  const { id } = await ctx.params;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return jsonError("Session not found.", 404);

  const digits = parsed.data.identifier.replace(/\D/g, "");
  if (!digits) return jsonError("Card ID or enrollment number must contain digits.", 400);
  const enrollmentNumber = normalizeEnrollmentNumber(digits);

  await connectDB();
  const mongoSession = await mongoose.startSession();
  let responseStudent: { name: string; enrollmentNumber: string; program: string; method: "SCAN" | "MANUAL" } | null = null;

  try {
    await mongoSession.withTransaction(async () => {
      const sessionDoc: any = await CDCSession.findOneAndUpdate(
        { _id: id, status: "OPEN" },
        { $inc: { attendanceVersion: 1 } },
        { returnDocument: "after", session: mongoSession },
      ).lean();

      if (!sessionDoc) {
        const exists = await CDCSession.exists({ _id: id }).session(mongoSession);
        if (!exists) throw codedError("SESSION_NOT_FOUND", "Session not found.");
        throw codedError("SESSION_CLOSED", "This placement session is closed.");
      }

      let student: any = await CDCStudent.findOne({ active: true, cardId: digits }).session(mongoSession).lean();
      let method: "SCAN" | "MANUAL" = "SCAN";

      if (!student && enrollmentNumber) {
        student = await CDCStudent.findOne({ active: true, enrollmentNumber }).session(mongoSession).lean();
        method = "MANUAL";
      }

      if (!student) {
        throw codedError("STUDENT_NOT_FOUND", "No active CDC student matches this Card ID or enrollment number.");
      }

      if (sessionDoc.eligibleProgramCodes?.length && !sessionDoc.eligibleProgramCodes.includes(student.programCode)) {
        throw codedError("NOT_ELIGIBLE", `${student.name} is not eligible for this session.`);
      }

      await CDCAttendance.create([{
        sessionId: sessionDoc._id,
        studentId: student._id,
        cardId: student.cardId,
        markedAt: new Date(),
        markedBy: admin.id,
        method,
      }], { session: mongoSession });

      responseStudent = {
        name: student.name,
        enrollmentNumber: student.enrollmentNumber,
        program: student.program,
        method,
      };
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return jsonError("This student is already marked present for this session.", 409, "DUPLICATE_ATTENDANCE");
    }
    if (error?.cdcCode === "SESSION_NOT_FOUND") return jsonError(error.message, 404);
    if (error?.cdcCode === "SESSION_CLOSED") return jsonError(error.message, 409);
    if (error?.cdcCode === "STUDENT_NOT_FOUND") return jsonError(error.message, 404);
    if (error?.cdcCode === "NOT_ELIGIBLE") return jsonError(error.message, 403, "NOT_ELIGIBLE");
    throw error;
  } finally {
    await mongoSession.endSession();
  }

  return Response.json({ success: true, student: responseStudent }, { status: 201 });
}
