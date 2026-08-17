import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSystemAdminApi } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { invalidateLibrariesCache } from "@/lib/libraries";
import { Library } from "@/lib/models";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  location: z.string().max(160).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireSystemAdminApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid library data.", 400);
  const { id } = await ctx.params;
  await connectDB();
  const library = await Library.findByIdAndUpdate(id, { $set: parsed.data }, { returnDocument: "after" });
  if (!library) return jsonError("Library not found.", 404);
  invalidateLibrariesCache();
  return Response.json({ success: true });
}
