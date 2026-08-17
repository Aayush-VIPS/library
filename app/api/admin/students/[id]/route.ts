import { NextRequest } from "next/server";
import { z } from "zod";
import { requireOperationsManagerApi } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { LibraryVisit, Student } from "@/lib/models";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  enrollmentNumber: z.string().min(2).max(50).optional(),
  name: z.string().min(2).max(120).optional(),
  rfidUid: z.string().regex(/^\d{1,15}$/).optional(),
  course: z.string().max(80).optional(),
  batch: z.string().max(40).optional(),
  section: z.string().max(20).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireOperationsManagerApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid student data.", 400);
  const { id } = await ctx.params;
  await connectDB();
  if (parsed.data.active === false) {
    const openVisit = await LibraryVisit.exists({ studentId: id, outAt: { $exists: false } });
    if (openVisit) return jsonError("Student is currently inside. Record an exit before disabling the card.", 409);
  }
  try {
    const student = await Student.findByIdAndUpdate(id, { $set: parsed.data }, { returnDocument: "after" });
    if (!student) return jsonError("Student not found.", 404);
    return Response.json({ success: true });
  } catch (error: any) {
    if (error?.code === 11000) return jsonError("Enrollment number or RFID UID already exists.", 409);
    throw error;
  }
}
