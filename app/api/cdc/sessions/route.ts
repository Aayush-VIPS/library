import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCDCApi } from "@/lib/cdc-auth";
import { connectDB } from "@/lib/db";
import { CDCSession } from "@/lib/models";
import { CDC_PROGRAM_CODES } from "@/lib/cdc";
import { jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  title: z.string().trim().min(2).max(160),
  company: z.string().trim().max(120).optional().default(""),
  venue: z.string().trim().max(160).optional().default(""),
  scheduledAt: z.string().min(10).max(30),
  notes: z.string().trim().max(1000).optional().default(""),
  eligibleProgramCodes: z.array(z.string()).max(20).optional().default([]),
});

function parseISTLocal(value: string) {
  const normalized = value.length === 16 ? `${value}:00` : value;
  return new Date(`${normalized}+05:30`);
}

export async function POST(req: NextRequest) {
  const admin = await requireCDCApi();
  if (!admin) return jsonError("Forbidden", 403);
  if (!requireSameOrigin(req)) return jsonError("Forbidden", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid placement session data.", 400);

  const invalidCode = parsed.data.eligibleProgramCodes.find((code) => !CDC_PROGRAM_CODES.has(code));
  if (invalidCode) return jsonError(`Unknown CDC programme code: ${invalidCode}`, 400);
  const scheduledAt = parseISTLocal(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) return jsonError("Invalid session date or time.", 400);

  await connectDB();
  const session = await CDCSession.create({
    title: parsed.data.title,
    company: parsed.data.company,
    venue: parsed.data.venue,
    scheduledAt,
    notes: parsed.data.notes,
    eligibleProgramCodes: [...new Set(parsed.data.eligibleProgramCodes)],
    status: "OPEN",
    createdBy: admin.id,
  });
  return Response.json({ success: true, id: String(session._id) }, { status: 201 });
}
