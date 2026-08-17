import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateDevice } from "@/lib/device-auth";
import { jsonError } from "@/lib/http";

const schema = z.object({
  firmwareVersion: z.string().max(40).optional(),
  deviceType: z.literal("LIBRARY_GATE"),
  queueDepth: z.number().int().min(0).max(10000).optional(),
  rssi: z.number().int().min(-150).max(10).optional(),
  clockReady: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const device = await authenticateDevice(req);
  if (!device) return jsonError("Device authentication failed.", 401, "DEVICE_AUTH_FAILED");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid heartbeat.", 400, "BAD_REQUEST");

  const d = parsed.data;
  device.lastSeenAt = new Date();
  if (d.firmwareVersion !== undefined) device.firmwareVersion = d.firmwareVersion;
  if (d.queueDepth !== undefined) device.queueDepth = d.queueDepth;
  if (d.rssi !== undefined) device.rssi = d.rssi;
  if (d.clockReady !== undefined) device.clockReady = d.clockReady;
  await device.save();
  return Response.json({ success: true });
}
