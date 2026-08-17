import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Device } from "@/lib/models";
import { safeEqual, sha256 } from "@/lib/crypto";

export async function authenticateDevice(req: NextRequest) {
  const mac = req.headers.get("x-device-mac")?.trim().toUpperCase();
  const secret = req.headers.get("x-device-secret")?.trim();
  if (!mac || !secret) return null;

  await connectDB();
  const device = await Device.findOne({ macAddress: mac, active: true });
  if (!device) return null;

  const candidate = sha256(secret);
  if (!safeEqual(candidate, device.secretHash)) return null;
  return device;
}
