import { NextRequest } from "next/server";

export function jsonError(message: string, status: number, code?: string) {
  return Response.json({ success: false, message, ...(code ? { code } : {}) }, { status });
}

export function requestIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export function requireSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return false;
  return origin === `${proto}://${host}`;
}
