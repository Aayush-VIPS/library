import { currentInside } from "@/lib/services/dashboard";
import { allowedLibraryIds, currentAdmin } from "@/lib/auth";
import { PersonCell } from "@/components/PersonCell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatIST } from "@/lib/time";
import { librariesList, libraryName } from "@/lib/libraries";

function duration(from: Date | string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
}

export default async function InsidePage({ searchParams }: { searchParams: Promise<{ library?: string }> }) {
  const sp = await searchParams;
  const admin = await currentAdmin();
  const libraries = await librariesList();
  const visibleLibraries = admin?.role === "SUPER_ADMIN" ? libraries : libraries.filter((library) => admin?.assignedLibraryIds.includes(library.id));
  const showAll = admin?.role === "SUPER_ADMIN" || visibleLibraries.length > 1;
  const selectedLibrary = sp.library && visibleLibraries.some((library) => library.id === sp.library) ? sp.library : (admin?.role === "SUPER_ADMIN" ? "all" : (visibleLibraries[0]?.id ?? "all"));
  const visits:any[] = await currentInside(new Date(), admin ? allowedLibraryIds(admin, selectedLibrary) : []);
  return <main className="page-wrap"><AutoRefresh ms={20000}/><div className="page-heading"><span className="eyebrow">Live occupancy</span><h2>Currently inside</h2><p>Students with an open visit in {selectedLibrary === "all" ? "any library" : libraryName(selectedLibrary)}.</p></div>
    <form className="toolbar filter-toolbar" method="get"><div className="toolbar-title"><b>{visits.length} active visits</b><span>Filter by library branch</span></div><div className="toolbar-actions"><select className="select" name="library" defaultValue={selectedLibrary}>{showAll&&<option value="all">All Libraries</option>}{visibleLibraries.map((library)=><option key={library.id} value={library.id}>{library.name}</option>)}</select><button className="btn" type="submit">Apply</button></div></form>
    <div className="notice">{visits.length} student{visits.length===1?" is":"s are"} currently recorded inside this scope.</div>
    <section className="card table-card"><div className="table-scroll"><table><thead><tr><th>Student</th><th>Enrollment</th><th>RFID</th><th>Library</th><th>Entered</th><th>Duration</th><th>Reader</th></tr></thead><tbody>{visits.length?visits.map((v:any)=>{const s=v.studentId;return <tr key={String(v._id)}><td><PersonCell name={s.name} sub={`${s.course}${s.section?` · ${s.section}`:""}`}/></td><td>{s.enrollmentNumber}</td><td>{s.rfidUid}</td><td>{libraryName(v.inLibraryId || v.inDeviceId?.libraryId)}</td><td>{formatIST(v.inAt,true)}</td><td>{duration(v.inAt)}</td><td>{v.inDeviceId?.name || "—"}</td></tr>}):<tr><td colSpan={7} className="empty">Nobody is currently recorded inside.</td></tr>}</tbody></table></div></section>
  </main>;
}
