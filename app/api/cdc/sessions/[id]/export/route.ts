import { requireCDCApi } from "@/lib/cdc-auth";
import { connectDB } from "@/lib/db";
import { CDCAttendance, CDCSession } from "@/lib/models";
import { csvEscape } from "@/lib/csv";
import { formatDateIST, formatIST } from "@/lib/time";
import { jsonError } from "@/lib/http";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireCDCApi())) return jsonError("Forbidden", 403);
  const { id } = await ctx.params;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return jsonError("Session not found.", 404);
  await connectDB();
  const session: any = await CDCSession.findById(id).lean();
  if (!session) return jsonError("Session not found.", 404);

  const attendance: any[] = await CDCAttendance.find({ sessionId: session._id }).sort({ markedAt: 1 }).populate("studentId").lean();
  const rows: unknown[][] = [["Enrollment", "Name", "Card ID", "Programme", "Programme Code", "Admission Year", "Marked Date", "Marked Time", "Method"]];
  for (const row of attendance) {
    const student: any = row.studentId;
    rows.push([
      student?.enrollmentNumber || "",
      student?.name || "",
      row.cardId || "",
      student?.program || "",
      student?.programCode || "",
      student?.admissionYear || "",
      formatDateIST(row.markedAt),
      formatIST(row.markedAt, true),
      row.method || "",
    ]);
  }
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const safeTitle = String(session.title || "session").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "session";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cdc-${safeTitle}-attendance.csv"`,
      "cache-control": "no-store",
    },
  });
}
