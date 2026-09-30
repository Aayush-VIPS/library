import { NextRequest } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { connectDB } from "@/lib/db";
import { CDCAttendance, CDCSession, CDCStudent } from "@/lib/models";
import { jsonError } from "@/lib/http";

export async function GET(req: NextRequest) {
  const device: any = await authenticateDevice(req);
  if (!device || device.deviceType !== "CDC_GATE") {
    return jsonError("CDC reader authentication failed.", 401, "DEVICE_AUTH_FAILED");
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  if (!/^[0-9a-fA-F]{24}$/.test(sessionId)) return jsonError("Invalid CDC session.", 400);

  await connectDB();
  const session: any = await CDCSession.findById(sessionId).lean();
  if (!session) return jsonError("CDC session not found.", 404);

  const studentFilter: any = { active: true };
  if (session.eligibleProgramCodes?.length) {
    studentFilter.programCode = { $in: session.eligibleProgramCodes };
  }

  const [students, present] = await Promise.all([
    CDCStudent.find(studentFilter).select({ cardId: 1 }).sort({ cardId: 1 }).lean(),
    CDCAttendance.find({ sessionId: session._id }).select({ cardId: 1 }).lean(),
  ]);

  return Response.json({
    success: true,
    sessionId,
    rosterVersion: `${String(session.updatedAt?.getTime?.() || 0)}:${students.length}`,
    count: students.length,
    cardIds: students.map((student: any) => student.cardId),
    presentCardIds: present.map((row: any) => row.cardId),
  }, {
    headers: { "cache-control": "no-store" },
  });
}
