import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSystemAdminApi } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { librariesList } from "@/lib/libraries";
import { Device } from "@/lib/models";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  name: z.string().min(2).max(80).optional(),
  libraryId: z.string().min(1).max(40).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireSystemAdminApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid device data.", 400);
  if (parsed.data.libraryId) {
    const libraries = await librariesList();
    if (!libraries.some((library) => library.id === parsed.data.libraryId)) return jsonError("Library not found.", 404);
  }
  const { id } = await ctx.params;
  await connectDB();
  const device = await Device.findByIdAndUpdate(id, { $set: parsed.data }, { returnDocument: "after" });
  if (!device) return jsonError("Device not found.", 404);
  return Response.json({ success: true });
}
