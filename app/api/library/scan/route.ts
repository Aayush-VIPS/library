import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateDevice } from "@/lib/device-auth";
import { jsonError } from "@/lib/http";
import { processLibraryScan } from "@/lib/services/scan";

const schema = z.object({
  eventId: z.string().min(12).max(120),
  rfidUid: z.string().regex(/^\d{1,15}$/),
  scannedAt: z.string().datetime({ offset: true }),
  firmwareVersion: z.string().max(40).optional(),
});

export async function POST(req: NextRequest) {
  const device = await authenticateDevice(req);
  if (!device) return jsonError("Reader is not authorized.", 401, "DEVICE_AUTH_FAILED");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid scan payload.", 400, "BAD_REQUEST");
  if (parsed.data.firmwareVersion && parsed.data.firmwareVersion !== device.firmwareVersion) {
    device.firmwareVersion = parsed.data.firmwareVersion;
  }
  device.lastSeenAt = new Date();
  await device.save();

  const result = await processLibraryScan({
    eventId: parsed.data.eventId,
    rfidUid: parsed.data.rfidUid,
    scannedAt: new Date(parsed.data.scannedAt),
    deviceId: device._id,
    libraryId: device.libraryId,
  });
  return Response.json(result.body, { status: result.status });
}
