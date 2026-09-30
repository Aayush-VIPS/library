import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCDCApi } from "@/lib/cdc-auth";
import { connectDB } from "@/lib/db";
import { CDCSession } from "@/lib/models";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  scannerActive: z.boolean().optional(),
}).refine((value) => value.status !== undefined || value.scannerActive !== undefined, {
  message: "No session change requested.",
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireCDCApi())) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid session update.", 400);

  const { id } = await ctx.params;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return jsonError("Session not found.", 404);

  await connectDB();
  const session: any = await CDCSession.findById(id);
  if (!session) return jsonError("Session not found.", 404);

  if (parsed.data.status === "CLOSED") {
    session.status = "CLOSED";
    session.closedAt = new Date();
    session.scannerActive = false;
  } else if (parsed.data.status === "OPEN") {
    session.status = "OPEN";
    session.closedAt = undefined;
  }

  if (parsed.data.scannerActive === true) {
    if (session.status !== "OPEN") return jsonError("Open the session before activating RFID readers.", 409);
    await CDCSession.updateMany({ _id: { $ne: session._id }, scannerActive: true }, { $set: { scannerActive: false } });
    session.scannerActive = true;
  } else if (parsed.data.scannerActive === false) {
    session.scannerActive = false;
  }

  try {
    await session.save();
  } catch (error: any) {
    if (error?.code === 11000) return jsonError("Another CDC session is already active on the RFID readers.", 409);
    throw error;
  }

  return Response.json({
    success: true,
    status: session.status,
    scannerActive: session.scannerActive,
  });
}
