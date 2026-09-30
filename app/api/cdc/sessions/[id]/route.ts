import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCDCApi } from "@/lib/cdc-auth";
import { connectDB } from "@/lib/db";
import { CDCSession } from "@/lib/models";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireCDCApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid session status.", 400);
  const { id } = await ctx.params;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return jsonError("Session not found.", 404);

  await connectDB();
  const update = parsed.data.status === "CLOSED"
    ? { status: "CLOSED", closedAt: new Date() }
    : { status: "OPEN", $unset: { closedAt: 1 } };
  const session = await CDCSession.findByIdAndUpdate(id, update, { returnDocument: "after" });
  if (!session) return jsonError("Session not found.", 404);
  return Response.json({ success: true, status: session.status });
}
