import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { autoCloseDueVisits } from "@/lib/services/auto-close";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${env().CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await autoCloseDueVisits(new Date());
  return Response.json({ success: true, ...result, executedAt: new Date().toISOString() });
}
