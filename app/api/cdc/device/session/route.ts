import { NextRequest } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { connectDB } from "@/lib/db";
import { CDCSession } from "@/lib/models";
import { jsonError } from "@/lib/http";

export async function GET(req: NextRequest) {
  const device: any = await authenticateDevice(req);
  if (!device || device.deviceType !== "CDC_GATE") {
    return jsonError("CDC reader authentication failed.", 401, "DEVICE_AUTH_FAILED");
  }

  await connectDB();
  const session: any = await CDCSession.findOne({ status: "OPEN", scannerActive: true })
    .sort({ updatedAt: -1 })
    .lean();

  device.lastSeenAt = new Date();
  await device.save();

  if (!session) {
    return Response.json({ success: true, active: false });
  }

  return Response.json({
    success: true,
    active: true,
    session: {
      id: String(session._id),
      title: session.title,
      company: session.company || "",
      venue: session.venue || "",
      scheduledAt: session.scheduledAt,
      eligibleProgramCodes: session.eligibleProgramCodes || [],
      updatedAt: session.updatedAt,
    },
  });
}
