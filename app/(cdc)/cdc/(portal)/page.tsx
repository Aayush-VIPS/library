import Link from "next/link";
import { connectDB } from "@/lib/db";
import { CDCStudent, CDCSession, CDCAttendance } from "@/lib/models";
import { CDC_PROGRAMS, cdcProgramLabel } from "@/lib/cdc";
import { formatDateIST, formatIST } from "@/lib/time";

export default async function CDCOverviewPage() {
  await connectDB();
  const [studentCount, openSessions, totalSessions, attendanceCount, programRows, recentSessions] = await Promise.all([
    CDCStudent.countDocuments({ active: true }),
    CDCSession.countDocuments({ status: "OPEN" }),
    CDCSession.countDocuments({}),
    CDCAttendance.countDocuments({}),
    CDCStudent.aggregate([{ $match: { active: true } }, { $group: { _id: "$programCode", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    CDCSession.find({}).sort({ scheduledAt: -1 }).limit(6).lean(),
  ]);

  const sessionIds = recentSessions.map((session: any) => session._id);
  const attendanceRows = sessionIds.length ? await CDCAttendance.aggregate([
    { $match: { sessionId: { $in: sessionIds } } },
    { $group: { _id: "$sessionId", count: { $sum: 1 } } },
  ]) : [];
  const attendanceBySession = new Map(attendanceRows.map((row: any) => [String(row._id), row.count]));
  const programCounts = new Map(programRows.map((row: any) => [String(row._id), row.count]));

  return <main className="page-wrap">
    <div className="page-heading"><span className="eyebrow">Career Development Centre</span><h2>Placement attendance overview</h2><p>CDC attendance is maintained independently from library visits. The initial roster is the confirmed B.Tech 2023 cohort.</p></div>
    <section className="grid-4">
      <div className="card metric-card"><span className="metric-label">CDC students</span><strong className="metric-value">{studentCount}</strong><span className="metric-foot">Active roster records</span></div>
      <div className="card metric-card"><span className="metric-label">Open sessions</span><strong className="metric-value green">{openSessions}</strong><span className="metric-foot">Accepting attendance now</span></div>
      <div className="card metric-card"><span className="metric-label">Placement sessions</span><strong className="metric-value blue">{totalSessions}</strong><span className="metric-foot">All CDC registers</span></div>
      <div className="card metric-card"><span className="metric-label">Attendance records</span><strong className="metric-value">{attendanceCount}</strong><span className="metric-foot">Across all sessions</span></div>
    </section>

    <section className="card table-card">
      <div className="toolbar"><div className="toolbar-title"><b>2023 B.Tech roster</b><span>Confirmed programme codes only</span></div><div className="toolbar-actions"><Link className="btn" href="/cdc/students">Open roster</Link></div></div>
      <div className="table-scroll"><table><thead><tr><th>Programme</th><th>Code</th><th>Students</th></tr></thead><tbody>
        {CDC_PROGRAMS.map((program) => <tr key={program.code}><td><b>{program.name}</b><div className="subtle">{program.label}</div></td><td>{program.code}</td><td>{programCounts.get(program.code) || 0}</td></tr>)}
      </tbody></table></div>
    </section>

    <section className="card table-card">
      <div className="toolbar"><div className="toolbar-title"><b>Recent sessions</b><span>Newest scheduled sessions first</span></div><div className="toolbar-actions"><Link className="btn primary" href="/cdc/sessions">Manage sessions</Link></div></div>
      <div className="table-scroll"><table><thead><tr><th>Session</th><th>Schedule</th><th>Eligible</th><th>Attendance</th><th>Status</th></tr></thead><tbody>
        {recentSessions.length ? recentSessions.map((session: any) => <tr key={String(session._id)}><td><Link href={`/cdc/sessions/${session._id}`}><b>{session.title}</b></Link><div className="subtle">{session.company || session.venue || "CDC session"}</div></td><td>{formatDateIST(session.scheduledAt)} · {formatIST(session.scheduledAt)}</td><td>{session.eligibleProgramCodes?.length ? session.eligibleProgramCodes.map(cdcProgramLabel).join(", ") : "All programmes"}</td><td>{attendanceBySession.get(String(session._id)) || 0}</td><td><span className={`badge ${session.status === "OPEN" ? "green" : "gray"}`}>{session.status}</span></td></tr>) : <tr><td colSpan={5} className="empty">No CDC sessions created yet.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
