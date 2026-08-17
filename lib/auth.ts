import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { connectDB } from "@/lib/db";
import { env } from "@/lib/env";
import { Admin } from "@/lib/models";

const COOKIE = "vips_library_session";
const encoder = new TextEncoder();

export const ROLES = ["SUPER_ADMIN", "LIBRARY_MANAGER", "STAFF", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];
type StoredRole = Role | "ADMIN";
type SessionPayload = { sub: string; email: string; role: StoredRole; sv: number };
export type AdminSession = { id: string; email: string; name: string; role: Role; assignedLibraryIds: string[] };

function secret() { return encoder.encode(env().SESSION_SECRET); }

export async function createSession(payload: SessionPayload) {
  return new SignJWT({ email: payload.email, role: payload.role, sv: payload.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export function normalizeRole(role: StoredRole | string | undefined): Role {
  if (role === "ADMIN") return "SUPER_ADMIN";
  if (ROLES.includes(role as Role)) return role as Role;
  return "STAFF";
}

export function canManageSystem(admin: AdminSession) {
  return admin.role === "SUPER_ADMIN";
}

export function canManageOperations(admin: AdminSession) {
  return admin.role === "SUPER_ADMIN" || admin.role === "LIBRARY_MANAGER";
}

export function canWriteOperations(admin: AdminSession) {
  return admin.role === "SUPER_ADMIN" || admin.role === "LIBRARY_MANAGER" || admin.role === "STAFF";
}

export function allowedLibraryIds(admin: AdminSession, requested = "all") {
  if (admin.role === "SUPER_ADMIN") return requested === "all" ? "all" : requested;
  if (!admin.assignedLibraryIds.length) return [];
  if (requested === "all") return admin.assignedLibraryIds;
  return admin.assignedLibraryIds.includes(requested) ? requested : [];
}

export async function setSessionCookie(token: string) {
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

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "strict" });
}

export async function currentAdmin() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.role !== "string" || typeof payload.sv !== "number") return null;
    await connectDB();
    const admin = await Admin.findById(payload.sub).lean();
    if (!admin || !admin.active || admin.sessionVersion !== payload.sv) return null;
    return {
      id: String(admin._id),
      email: admin.email,
      name: admin.name,
      role: normalizeRole(admin.role),
      assignedLibraryIds: admin.assignedLibraryIds || [],
    };
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return admin!;
}

export async function requireAdminApi() {
  return currentAdmin();
}

export async function requireSystemAdminApi() {
  const admin = await currentAdmin();
  return admin && canManageSystem(admin) ? admin : null;
}

export async function requireOperationsManagerApi() {
  const admin = await currentAdmin();
  return admin && canManageOperations(admin) ? admin : null;
}
