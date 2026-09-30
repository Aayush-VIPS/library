import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { connectDB } from "@/lib/db";
import { env } from "@/lib/env";
import { CDCAdmin } from "@/lib/models";

const COOKIE = "vips_cdc_session";
const encoder = new TextEncoder();

type CDCSessionPayload = { sub: string; email: string; sv: number };
export type CDCAdminSession = { id: string; email: string; name: string };

function secret() {
  return encoder.encode(env().SESSION_SECRET);
}

export async function createCDCSession(payload: CDCSessionPayload) {
  return new SignJWT({ email: payload.email, sv: payload.sv, scope: "CDC" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function setCDCSessionCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 60 * 60,
    priority: "high",
  });
}

export async function clearCDCSessionCookie() {
  const store = await cookies();
  store.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "strict" });
}

export async function currentCDCAdmin(): Promise<CDCAdminSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.scope !== "CDC" || !payload.sub || typeof payload.sv !== "number") return null;
    await connectDB();
    const admin: any = await CDCAdmin.findById(payload.sub).lean();
    if (!admin || !admin.active || admin.sessionVersion !== payload.sv) return null;
    return { id: String(admin._id), email: admin.email, name: admin.name };
  } catch {
    return null;
  }
}

export async function requireCDC() {
  const admin = await currentCDCAdmin();
  if (!admin) redirect("/cdc/login");
  return admin;
}

export async function requireCDCApi() {
  return currentCDCAdmin();
}
