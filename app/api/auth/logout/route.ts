import { NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/http";

export async function POST(req: NextRequest) {
  if (!requireSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  await clearSessionCookie();
  return Response.json({ success: true });
}
