import Link from "next/link";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { CDCSession, CDCAttendance, CDCStudent, Device } from "@/lib/models";
import { cdcProgramLabel } from "@/lib/cdc";
import { formatDateIST, formatIST } from "@/lib/time";
import { CDCAttendanceScanner } from "@/components/CDCAttendanceScanner";

export default async function CDCSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) notFound();
  await connectDB();
  const session: any = await CDCSession.findById(id).lean();
  if (!session) notFound();

  const eligibleFilter: any = { active: true };
  if (session.eligibleProgramCodes?.length) eligibleFilter.programCode = { $in: session.eligibleProgramCodes };
  const onlineSince = new Date(Date.now() - 15_000);
  const [eligibleCount, attendance, onlineReaders]: [number, any[], number] = await Promise.all([
    CDCStudent.countDocuments(eligibleFilter),
    CDCAttendance.find({ sessionId: session._id }).sort({ markedAt: -1 }).populate("studentId").lean(),
    Device.countDocuments({ deviceType: "CDC_GATE", active: true, lastSeenAt: { $gte: onlineSince } }),
  ]);

  const percent = eligibleCount ? Math.round((attendance.length / eligibleCount) * 100) : 0;
  return <main className="page-wrap">
    <div className="page-heading"><span className="eyebrow">Placement attendance</span><h2>{session.title}</h2><p>{session.company || "CDC"} · {formatDateIST(session.scheduledAt)} at {formatIST(session.scheduledAt)}{session.venue ? ` · ${session.venue}` : ""}</p><div style={{marginTop:12}}><Link className="btn" href={`/api/cdc/sessions/${id}/export`}>Export attendance CSV</Link></div></div>
    <section className="grid-4">
      <div className="card metric-card"><span className="metric-label">Present</span><strong className="metric-value green">{attendance.length}</strong><span className="metric-foot">Unique students marked</span></div>
      <div className="card metric-card"><span className="metric-label">Eligible roster</span><strong className="metric-value">{eligibleCount}</strong><span className="metric-foot">{session.eligibleProgramCodes?.length ? session.eligibleProgramCodes.map(cdcProgramLabel).join(", ") : "All CDC programmes"}</span></div>
      <div className="card metric-card"><span className="metric-label">Attendance rate</span><strong className="metric-value blue">{percent}%</strong><span className="metric-foot">Present / eligible</span></div>
      <div className="card metric-card"><span className="metric-label">RFID readers</span><strong className="metric-value" style={{fontSize:22}}>{session.scannerActive ? `${onlineReaders} ONLINE` : "OFF"}</strong><span className="metric-foot">{session.scannerActive ? "Online readers are bound to this session" : session.status === "OPEN" ? "Activate when ready to scan" : "Attendance locked"}</span></div>
    </section>

    <section className="card section-card" style={{marginTop:15}}><CDCAttendanceScanner sessionId={id} status={session.status} scannerActive={Boolean(session.scannerActive)} /></section>

    <section className="card table-card">
      <div className="toolbar"><div className="toolbar-title"><b>Attendance register</b><span>Newest attendance first · duplicate students are prevented at database level</span></div></div>
      <div className="table-scroll"><table><thead><tr><th>Student</th><th>Enrollment</th><th>Card ID</th><th>Programme</th><th>Marked at</th><th>Method</th></tr></thead><tbody>
        {attendance.length ? attendance.map((row: any) => { const student: any = row.studentId; return <tr key={String(row._id)}><td><b>{student?.name || "Unknown student"}</b></td><td>{student?.enrollmentNumber || "—"}</td><td>{row.cardId}</td><td>{student?.program || "—"}</td><td>{formatDateIST(row.markedAt)} · {formatIST(row.markedAt, true)}</td><td><span className="badge blue">{row.method}</span></td></tr>; }) : <tr><td colSpan={6} className="empty">No attendance recorded for this session yet.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
