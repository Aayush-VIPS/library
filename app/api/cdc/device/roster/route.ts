import { NextRequest } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { connectDB } from "@/lib/db";
import { CDCAttendance, CDCSession, CDCStudent } from "@/lib/models";
import { jsonError } from "@/lib/http";

function parseIntParam(value: string | null, fallback: number) {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(req: NextRequest) {
  const device: any = await authenticateDevice(req);
  if (!device || device.deviceType !== "CDC_GATE") {
    return jsonError("CDC reader authentication failed.", 401, "DEVICE_AUTH_FAILED");
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  if (!/^[0-9a-fA-F]{24}$/.test(sessionId)) return jsonError("Invalid CDC session.", 400);

  const paged = req.nextUrl.searchParams.has("offset") || req.nextUrl.searchParams.has("limit");
  const offset = Math.max(0, parseIntParam(req.nextUrl.searchParams.get("offset"), 0));
  const limit = Math.min(150, Math.max(1, parseIntParam(req.nextUrl.searchParams.get("limit"), 100)));

  await connectDB();
  const session: any = await CDCSession.findById(sessionId).lean();
  if (!session) return jsonError("CDC session not found.", 404);

  const studentFilter: any = { active: true };
  if (session.eligibleProgramCodes?.length) {
    studentFilter.programCode = { $in: session.eligibleProgramCodes };
  }

  // Backward compatibility for already-flashed readers: if they do not request
  // pagination, retain the previous all-at-once response shape.
  if (!paged) {
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

  // High-throughput readers fetch the roster in compact pages. Attendance is
  // resolved only for cards in this page, keeping each response small even on
  // weak Wi-Fi.
  const [total, students] = await Promise.all([
    CDCStudent.countDocuments(studentFilter),
    CDCStudent.find(studentFilter)
      .select({ cardId: 1 })
      .sort({ cardId: 1 })
      .skip(offset)
      .limit(limit)
      .lean(),
  ]);

  const cardIds = students.map((student: any) => student.cardId);
  const present = cardIds.length
    ? await CDCAttendance.find({
        sessionId: session._id,
        cardId: { $in: cardIds },
      }).select({ cardId: 1 }).lean()
    : [];

  device.lastSeenAt = new Date();
  await device.save();

  return Response.json({
    success: true,
    sessionId,
    rosterVersion: `${String(session.updatedAt?.getTime?.() || 0)}:${total}`,
    total,
    offset,
    count: cardIds.length,
    nextOffset: offset + cardIds.length,
    hasMore: offset + cardIds.length < total,
    cardIds,
    presentCardIds: present.map((row: any) => row.cardId),
  }, {
    headers: { "cache-control": "no-store" },
  });
}
