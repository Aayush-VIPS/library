import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCDCApi } from "@/lib/cdc-auth";
import { connectDB } from "@/lib/db";
import { CDCAttendance, CDCSession, CDCStudent } from "@/lib/models";
import { normalizeEnrollmentNumber } from "@/lib/cdc";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({ identifier: z.string().trim().min(1).max(50) });

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
  const session: any = await CDCSession.findById(id).lean();
  if (!session) return jsonError("Session not found.", 404);
  if (session.status !== "OPEN") return jsonError("This placement session is closed.", 409);

  const choices: any[] = [{ cardId: digits }];
  if (enrollmentNumber) choices.push({ enrollmentNumber });
  const student: any = await CDCStudent.findOne({ active: true, $or: choices }).lean();
  if (!student) return jsonError("No active CDC student matches this Card ID or enrollment number.", 404);

  if (session.eligibleProgramCodes?.length && !session.eligibleProgramCodes.includes(student.programCode)) {
    return jsonError(`${student.name} is not eligible for this session.`, 403, "NOT_ELIGIBLE");
  }

  try {
    await CDCAttendance.create({
      sessionId: session._id,
      studentId: student._id,
      cardId: student.cardId,
      markedAt: new Date(),
      markedBy: admin.id,
      method: "SCAN",
    });
  } catch (error: any) {
    if (error?.code === 11000) return jsonError(`${student.name} is already marked present for this session.`, 409, "DUPLICATE_ATTENDANCE");
    throw error;
  }

  return Response.json({
    success: true,
    student: {
      name: student.name,
      enrollmentNumber: student.enrollmentNumber,
      program: student.program,
    },
  }, { status: 201 });
}
