import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Device, CDCSession } from "@/lib/models";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatDateIST, formatIST } from "@/lib/time";

export default async function CDCReadersPage() {
  await connectDB();
  const now = Date.now();
  const onlineSince = new Date(now - 15_000);

  const [readers, activeSession]: [any[], any] = await Promise.all([
    Device.find({ deviceType: "CDC_GATE" }).sort({ lastSeenAt: -1, name: 1 }).lean(),
    CDCSession.findOne({ status: "OPEN", scannerActive: true }).sort({ updatedAt: -1 }).lean(),
  ]);

  const onlineCount = readers.filter((reader) =>
    reader.active && reader.lastSeenAt && new Date(reader.lastSeenAt) >= onlineSince
  ).length;

  return <main className="page-wrap">
    <AutoRefresh ms={5000} />
    <div className="page-heading">
      <span className="eyebrow">CDC hardware</span>
      <h2>RFID readers</h2>
      <p>CDC readers enroll themselves once. There is no manual device-to-session pairing: activate a placement session and every online CDC reader automatically binds to it.</p>
    </div>

    <section className="grid-4">
      <div className="card metric-card"><span className="metric-label">Registered readers</span><strong className="metric-value">{readers.length}</strong><span className="metric-foot">CDC_GATE devices</span></div>
      <div className="card metric-card"><span className="metric-label">Online now</span><strong className="metric-value green">{onlineCount}</strong><span className="metric-foot">Contacted backend in last 15 sec</span></div>
      <div className="card metric-card"><span className="metric-label">Active reader session</span><strong className="metric-value" style={{fontSize:22}}>{activeSession ? "ACTIVE" : "NONE"}</strong><span className="metric-foot">{activeSession?.title || "Activate a placement session"}</span></div>
      <div className="card metric-card"><span className="metric-label">Queued scans</span><strong className="metric-value blue">{readers.reduce((sum, reader) => sum + (reader.queueDepth || 0), 0)}</strong><span className="metric-foot">Awaiting backend sync</span></div>
    </section>

    {!activeSession && <div className="notice warn" style={{marginTop:15}}>
      <b>Readers are connected, but no CDC session is active.</b> Open <Link href="/cdc/sessions">Placement Sessions</Link>, enter the session, make sure it is OPEN, then click <b>Activate RFID readers</b>. Readers poll every ~2 seconds while idle.
    </div>}

    {activeSession && <div className="notice" style={{marginTop:15}}>
      <b>RFID readers are attached to:</b> <Link href={`/cdc/sessions/${activeSession._id}`}>{activeSession.title}</Link>. Online readers will download that session roster automatically.
    </div>}

    <section className="card table-card" style={{marginTop:15}}>
      <div className="toolbar"><div className="toolbar-title"><b>CDC reader fleet</b><span>Auto-refreshes every 5 seconds</span></div></div>
      <div className="table-scroll"><table>
        <thead><tr><th>Status</th><th>Reader</th><th>MAC address</th><th>Signal</th><th>Queue</th><th>Clock</th><th>Firmware</th><th>Last contact</th></tr></thead>
        <tbody>
          {readers.length ? readers.map((reader) => {
            const online = !!(reader.active && reader.lastSeenAt && new Date(reader.lastSeenAt) >= onlineSince);
            return <tr key={String(reader._id)}>
              <td><span className={`badge ${online ? "green" : "red"}`}>{online ? "ONLINE" : "OFFLINE"}</span></td>
              <td><b>{reader.name}</b><div className="subtle">{reader.active ? "Authorized" : "Disabled"}</div></td>
              <td><code>{reader.macAddress}</code></td>
              <td>{reader.rssi != null ? `${reader.rssi} dBm` : "—"}</td>
              <td>{reader.queueDepth || 0}</td>
              <td><span className={`badge ${reader.clockReady ? "green" : "amber"}`}>{reader.clockReady ? "READY" : "WAIT"}</span></td>
              <td>{reader.firmwareVersion || "—"}</td>
              <td>{reader.lastSeenAt ? `${formatDateIST(reader.lastSeenAt)} · ${formatIST(reader.lastSeenAt, true)}` : "Never"}</td>
            </tr>;
          }) : <tr><td colSpan={8} className="empty">No CDC reader has enrolled yet. Flash the CDC firmware, configure Wi-Fi, and allow the reader to call the device registration endpoint.</td></tr>}
        </tbody>
      </table></div>
    </section>
  </main>;
}
