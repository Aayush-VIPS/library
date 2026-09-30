import { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { CDCAdmin } from "@/lib/models";
import { createCDCSession, setCDCSessionCookie } from "@/lib/cdc-auth";
import { verifyPassword } from "@/lib/crypto";
import { jsonError, requestIp, requireSameOrigin } from "@/lib/http";
import { clearLoginFailures, loginAllowed, recordLoginFailure } from "@/lib/login-throttle";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  if (!requireSameOrigin(req)) return jsonError("Invalid request origin.", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Enter a valid CDC email and password.", 400);

  const email = parsed.data.email.toLowerCase();
  const key = `cdc:${requestIp(req)}:${email}`;
  if (!(await loginAllowed(key))) return jsonError("Too many failed attempts. Try again later.", 429);

  await connectDB();
  const admin: any = await CDCAdmin.findOne({ email, active: true });
  if (!admin || !verifyPassword(parsed.data.password, admin.passwordHash)) {
    await recordLoginFailure(key);
    return jsonError("Invalid CDC email or password.", 401);
  }

  await clearLoginFailures(key);
  admin.lastLoginAt = new Date();
  await admin.save();
  const token = await createCDCSession({
    sub: String(admin._id),
    email: admin.email,
    sv: admin.sessionVersion,
  });
  await setCDCSessionCookie(token);
  return Response.json({ success: true });
}
