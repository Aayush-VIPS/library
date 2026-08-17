export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ unixSeconds: Math.floor(Date.now() / 1000), timezone: "Asia/Kolkata" });
}
