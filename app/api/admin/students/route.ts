import { NextRequest } from "next/server";
import { z } from "zod";
import { requireOperationsManagerApi } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Student, StudentState } from "@/lib/models";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  enrollmentNumber: z.string().min(2).max(50),
  name: z.string().min(2).max(120),
  rfidUid: z.string().regex(/^\d{1,15}$/),
  course: z.string().max(80).optional().default(""),
  batch: z.string().max(40).optional().default(""),
  section: z.string().max(20).optional().default(""),
});

export async function POST(req: NextRequest) {
  if (!(await requireOperationsManagerApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid student data.", 400);
  await connectDB();
  try {
    const student = await Student.create({ ...parsed.data, active: true });
    await StudentState.updateOne({ studentId: student._id }, { $setOnInsert: { state: "OUT", version: 0 } }, { upsert: true });
    return Response.json({ success: true, id: String(student._id) }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) return jsonError("Enrollment number or RFID UID already exists.", 409);
    throw error;
  }
}
