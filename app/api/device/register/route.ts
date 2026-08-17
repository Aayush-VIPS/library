import { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { Device } from "@/lib/models";
import { env } from "@/lib/env";
import { randomSecret, safeEqual, sha256 } from "@/lib/crypto";
import { jsonError } from "@/lib/http";

const schema = z.object({
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/),
  name: z.string().min(2).max(80),
  firmwareVersion: z.string().max(40).optional().default(""),
  deviceType: z.literal("LIBRARY_GATE"),
});

export async function POST(req: NextRequest) {
  const enrollment = req.headers.get("x-enrollment-key") || "";
  if (!safeEqual(enrollment, env().DEVICE_ENROLLMENT_KEY)) return jsonError("Enrollment denied.", 401, "ENROLLMENT_DENIED");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid device registration payload.", 400, "BAD_REQUEST");

  await connectDB();
  const secret = randomSecret(32);
  const macAddress = parsed.data.macAddress.toUpperCase();
  const device = await Device.findOneAndUpdate(
    { macAddress },
    {
      $set: {
        name: parsed.data.name,
        deviceType: "LIBRARY_GATE",
        firmwareVersion: parsed.data.firmwareVersion,
        secretHash: sha256(secret),
        active: true,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  return Response.json({ success: true, deviceId: String(device._id), secret }, { status: 201 });
}
