import { connectDB } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(){
  try { await connectDB(); return Response.json({status:"ok",database:"connected",time:new Date().toISOString()},{headers:{"cache-control":"no-store"}}); }
  catch { return Response.json({status:"degraded",database:"unavailable",time:new Date().toISOString()},{status:503,headers:{"cache-control":"no-store"}}); }
}
