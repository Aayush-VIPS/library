import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/dashboard");
  return <main className="login-page">
    <section className="login-visual">
      <div><div className="brand"><div className="brand-mark">VL</div><div><div className="brand-title">VIPS Library</div><span className="brand-sub">RFID Access System</span></div></div></div>
      <div><span className="eyebrow" style={{color:"#8fa0b8"}}>Library operations</span><h1>Every visit, timestamped and auditable.</h1><p>Replace the physical entry register with secure RFID events, live occupancy, device health, searchable history and automatic 6 PM closure.</p><div className="login-chips"><span className="login-chip">RFID IN / OUT</span><span className="login-chip">Live occupancy</span><span className="login-chip">Device monitoring</span><span className="login-chip">Audit history</span></div></div>
      <span className="brand-sub">Authorized library staff only</span>
    </section>
    <section className="login-panel"><div className="login-card"><span className="eyebrow">Administration</span><h2>Sign in</h2><p>Use the administrator account created during deployment.</p><LoginForm /></div></section>
  </main>;
}
