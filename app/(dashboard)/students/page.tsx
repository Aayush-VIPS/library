import { redirect } from "next/navigation";
import { canManageOperations, currentAdmin } from "@/lib/auth";
import { studentsList } from "@/lib/services/dashboard";
import { StudentManager } from "@/components/StudentManager";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await currentAdmin();
  if (!admin || !canManageOperations(admin)) redirect("/dashboard");
  const { q = "" } = await searchParams;
  const rows:any[] = await studentsList(q);
  const students = rows.map(s=>({id:String(s._id),enrollmentNumber:s.enrollmentNumber,name:s.name,rfidUid:s.rfidUid,course:s.course||"",batch:s.batch||"",section:s.section||"",active:s.active}));
  return <main className="page-wrap"><div className="page-heading"><span className="eyebrow">Directory</span><h2>Students & RFID cards</h2><p>Maintain the authoritative mapping between a student and the RFID UID read by the library gates.</p></div>
    <div className="notice">CSV headers: <code>enrollmentNumber,name,rfidUid,course,batch,section</code>. Imports update existing students by enrollment number.</div>
    <section className="card table-card"><form className="toolbar" method="get"><div className="toolbar-title"><b>Student directory</b><span>Up to 2,000 matching rows are shown.</span></div><div className="toolbar-actions"><input className="input search" name="q" defaultValue={q} placeholder="Search name, enrollment, RFID…"/><button className="btn" type="submit">Search</button></div></form><StudentManager students={students}/></section>
  </main>;
}
