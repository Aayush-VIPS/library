import { connectDB } from "@/lib/db";
import { CDCStudent } from "@/lib/models";
import { CDC_PROGRAMS, CDC_PROGRAM_CODES, escapeRegex } from "@/lib/cdc";
import { CDCRosterImporter } from "@/components/CDCRosterImporter";

export default async function CDCStudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; program?: string }> }) {
  const { q = "", program = "" } = await searchParams;
  await connectDB();
  const filter: any = { active: true };
  if (program && CDC_PROGRAM_CODES.has(program)) filter.programCode = program;
  if (q.trim()) {
    const pattern = new RegExp(escapeRegex(q.trim()), "i");
    filter.$or = [{ name: pattern }, { enrollmentNumber: pattern }, { cardId: pattern }];
  }
  const [students, total, programRows] = await Promise.all([
    CDCStudent.find(filter).sort({ programCode: 1, enrollmentNumber: 1 }).limit(1000).lean(),
    CDCStudent.countDocuments({ active: true }),
    CDCStudent.aggregate([{ $match: { active: true } }, { $group: { _id: "$programCode", count: { $sum: 1 } } }]),
  ]);
  const counts = new Map(programRows.map((row: any) => [String(row._id), row.count]));

  return <main className="page-wrap">
    <div className="page-heading"><span className="eyebrow">CDC roster</span><h2>B.Tech students</h2><p>The CDC roster is separate from the library student directory. Card ID is the attendance identifier supplied by the source export.</p></div>
    <div className="notice">Initial production roster: <b>481 confirmed 2023 B.Tech students</b> from programme codes 027, 116, 117, 119 and 160. Codes 072, 084 and 085 are intentionally excluded pending verification.</div>
    <section className="grid-4">
      <div className="card metric-card"><span className="metric-label">Total roster</span><strong className="metric-value">{total}</strong><span className="metric-foot">Active CDC students</span></div>
      {CDC_PROGRAMS.slice(0,3).map((item) => <div className="card metric-card" key={item.code}><span className="metric-label">{item.label}</span><strong className="metric-value">{counts.get(item.code) || 0}</strong><span className="metric-foot">Programme code {item.code}</span></div>)}
    </section>
    <section className="card table-card">
      <form className="toolbar" method="get">
        <div className="toolbar-title"><b>{students.length} matching students</b><span>Search by name, enrollment number or Card ID</span></div>
        <div className="toolbar-actions">
          <input className="input search" name="q" defaultValue={q} placeholder="Search student…" />
          <select className="select cdc-program-select" name="program" defaultValue={program}><option value="">All programmes</option>{CDC_PROGRAMS.map((item) => <option value={item.code} key={item.code}>{item.label} · {item.code}</option>)}</select>
          <button className="btn" type="submit">Apply</button>
          <CDCRosterImporter />
        </div>
      </form>
      <div className="table-scroll"><table><thead><tr><th>Student</th><th>Enrollment</th><th>Card ID</th><th>Programme</th><th>Admission</th></tr></thead><tbody>
        {students.length ? students.map((student: any) => <tr key={String(student._id)}><td><div className="person"><div className="avatar">{student.name.split(/\s+/).slice(0,2).map((x:string)=>x[0]).join("")}</div><div><b>{student.name}</b><div className="subtle">Roll {student.rollNumber}</div></div></div></td><td>{student.enrollmentNumber}</td><td>{student.cardId}</td><td><span className="badge blue">{student.program}</span><div className="subtle">Code {student.programCode}</div></td><td>{student.admissionYear}</td></tr>) : <tr><td colSpan={5} className="empty">No matching CDC students.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
