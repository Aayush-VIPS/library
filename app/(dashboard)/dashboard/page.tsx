import type { CSSProperties } from "react";
import { allowedLibraryIds, currentAdmin } from "@/lib/auth";
import { dashboardSummary } from "@/lib/services/dashboard";
import { publicConfig } from "@/lib/env";
import { librariesList, libraryName } from "@/lib/libraries";
import { FootfallChart } from "@/components/FootfallChart";
import { PersonCell } from "@/components/PersonCell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatIST } from "@/lib/time";

function eventBadge(status: string, direction?: string) {
  if (status === "PROCESSED" && direction === "IN") return <span className="badge green">IN</span>;
  if (status === "PROCESSED" && direction === "OUT") return <span className="badge blue">OUT</span>;
  if (status === "DUPLICATE") return <span className="badge amber">DUPLICATE</span>;
  return <span className="badge red">{status}</span>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ library?: string }> }) {
  const sp = await searchParams;
  const admin = await currentAdmin();
  const libraries = await librariesList();
  const visibleLibraries = admin?.role === "SUPER_ADMIN" ? libraries : libraries.filter((library) => admin?.assignedLibraryIds.includes(library.id));
  const showAll = admin?.role === "SUPER_ADMIN" || visibleLibraries.length > 1;
  const selectedLibrary = sp.library && visibleLibraries.some((library) => library.id === sp.library)
    ? sp.library
    : admin?.role === "SUPER_ADMIN" ? "all" : (visibleLibraries[0]?.id ?? "all");
  const scope = admin ? allowedLibraryIds(admin, selectedLibrary) : [];
  const data = await dashboardSummary(new Date(), scope);
  const occupancy = Math.min(100, Math.round((data.inside / publicConfig.capacity) * 100));
  return <main className="page-wrap">
    <AutoRefresh />
    <div className="page-heading"><span className="eyebrow">Live operations</span><h2>{data.selectedLibraryName} overview</h2><p>Current occupancy, today’s footfall and the latest events from the selected library scope.</p></div>
    <form className="toolbar filter-toolbar" method="get">
      <div className="toolbar-title"><b>Library scope</b><span>Use all libraries for campus-wide totals, or choose one branch.</span></div>
      <div className="toolbar-actions">
          <select className="select" name="library" defaultValue={selectedLibrary}>
            {showAll && <option value="all">All Libraries</option>}
          {visibleLibraries.map((library) => <option value={library.id} key={library.id}>{library.name}</option>)}
        </select>
        <button className="btn" type="submit">Apply</button>
      </div>
    </form>
    <section className="grid-4">
      <div className="card metric-card"><span className="metric-label">Currently inside</span><strong className="metric-value green">{data.inside}</strong><span className="metric-foot">Open visits right now</span></div>
      <div className="card metric-card"><span className="metric-label">Unique visitors today</span><strong className="metric-value">{data.uniqueVisitors}</strong><span className="metric-foot">Distinct students</span></div>
      <div className="card metric-card"><span className="metric-label">Visits today</span><strong className="metric-value blue">{data.visitsToday}</strong><span className="metric-foot">Repeat visits included</span></div>
      <div className="card metric-card"><span className="metric-label">Readers online</span><strong className="metric-value">{data.onlineDevices}/{data.totalDevices}</strong><span className="metric-foot">Heartbeat within 5 minutes</span></div>
    </section>
    <section className="card table-card"><div className="toolbar"><div className="toolbar-title"><b>Library-wise status</b><span>One assigned reader per library</span></div></div><div className="table-scroll"><table><thead><tr><th>Library</th><th>Currently inside</th><th>Visits today</th><th>Reader status</th></tr></thead><tbody>{data.perLibrary.map((library) => <tr key={library.id}><td><b>{library.name}</b></td><td>{library.inside}</td><td>{library.visitsToday}</td><td><span className={`badge ${library.onlineDevices ? "green" : "red"}`}>{library.onlineDevices}/{library.totalDevices} ONLINE</span></td></tr>)}</tbody></table></div></section>
    <section className="grid-2">
      <div className="card section-card"><div className="section-head"><div><h3>Footfall by hour</h3><p>Entry events for today</p></div><span className="subtle">09:00–18:00</span></div><FootfallChart data={data.footfall}/></div>
      <div className="card section-card"><div className="section-head"><div><h3>Occupancy</h3><p>Against configured capacity</p></div><span className="subtle">{data.inside}/{publicConfig.capacity}</span></div><div className="gauge-wrap"><div className="gauge" style={{"--pct":occupancy} as CSSProperties}><div className="gauge-inner"><b>{occupancy}%</b><span>occupied</span></div></div></div></div>
    </section>
    <section className="card table-card"><div className="toolbar"><div className="toolbar-title"><b>Recent RFID activity</b><span>Newest events in this scope</span></div></div><div className="table-scroll"><table><thead><tr><th>Student</th><th>RFID</th><th>Result</th><th>Scan time</th><th>Library</th><th>Reader</th></tr></thead><tbody>{data.recent.length ? data.recent.map((e:any)=><tr key={String(e._id)}><td>{e.studentId ? <PersonCell name={e.studentId.name} sub={e.studentId.enrollmentNumber}/> : <span className="subtle">Unknown card</span>}</td><td>{e.rfidUid}</td><td>{eventBadge(e.status,e.direction)}</td><td>{formatIST(e.scannedAt,true)}</td><td>{libraryName(e.libraryId || e.deviceId?.libraryId)}</td><td>{e.deviceId?.name || "—"}</td></tr>) : <tr><td colSpan={6} className="empty">No scan events yet.</td></tr>}</tbody></table></div></section>
  </main>;
}
