import Link from "next/link";
import { connectDB } from "@/lib/db";
import { CDCSession, CDCAttendance } from "@/lib/models";
import { cdcProgramLabel } from "@/lib/cdc";
import { formatDateIST, formatIST } from "@/lib/time";
import { CDCSessionCreator } from "@/components/CDCSessionCreator";

export default async function CDCSessionsPage() {
  await connectDB();
  const sessions: any[] = await CDCSession.find({}).sort({ scheduledAt: -1 }).limit(200).lean();
  const ids = sessions.map((session) => session._id);
  const countRows = ids.length ? await CDCAttendance.aggregate([{ $match: { sessionId: { $in: ids } } }, { $group: { _id: "$sessionId", count: { $sum: 1 } } }]) : [];
  const counts = new Map(countRows.map((row: any) => [String(row._id), row.count]));

  return <main className="page-wrap">
    <div className="page-heading"><span className="eyebrow">Placement operations</span><h2>Placement sessions</h2><p>Each session has its own attendance register. A student can be marked present only once per session.</p></div>
    <section className="card table-card">
      <div className="toolbar"><div className="toolbar-title"><b>{sessions.length} sessions</b><span>Create a register before students begin scanning.</span></div><div className="toolbar-actions"><CDCSessionCreator /></div></div>
      <div className="table-scroll"><table><thead><tr><th>Session</th><th>Date & time</th><th>Venue</th><th>Eligible</th><th>Present</th><th>Status</th><th></th></tr></thead><tbody>
        {sessions.length ? sessions.map((session) => <tr key={String(session._id)}><td><b>{session.title}</b><div className="subtle">{session.company || "CDC"}</div></td><td>{formatDateIST(session.scheduledAt)} · {formatIST(session.scheduledAt)}</td><td>{session.venue || "—"}</td><td>{session.eligibleProgramCodes?.length ? session.eligibleProgramCodes.map(cdcProgramLabel).join(", ") : "All"}</td><td>{counts.get(String(session._id)) || 0}</td><td><span className={`badge ${session.status === "OPEN" ? "green" : "gray"}`}>{session.status}</span></td><td><Link className="btn" href={`/cdc/sessions/${session._id}`}>{session.status === "OPEN" ? "Take attendance" : "View"}</Link></td></tr>) : <tr><td colSpan={7} className="empty">No placement sessions yet.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
