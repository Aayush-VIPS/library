import { redirect } from "next/navigation";
import { currentCDCAdmin } from "@/lib/cdc-auth";
import { CDCLoginForm } from "@/components/CDCLoginForm";

export default async function CDCLoginPage() {
  if (await currentCDCAdmin()) redirect("/cdc");
  return <main className="login-page cdc-login-page">
    <section className="login-visual cdc-login-visual">
      <div><div className="brand"><div className="brand-mark">CDC</div><div><div className="brand-title">VIPS CDC</div><span className="brand-sub">Placement Attendance Portal</span></div></div></div>
      <div><span className="eyebrow" style={{color:"#8fa0b8"}}>Career Development Centre</span><h1>Placement attendance, independently managed.</h1><p>Manage placement sessions, eligible cohorts and auditable student attendance without entering the Library administration system.</p><div className="login-chips"><span className="login-chip">Placement sessions</span><span className="login-chip">Card attendance</span><span className="login-chip">Eligibility rules</span><span className="login-chip">CSV reporting</span></div></div>
      <span className="brand-sub">Authorized CDC staff only</span>
    </section>
    <section className="login-panel"><div className="login-card"><span className="eyebrow">CDC Administration</span><h2>Sign in</h2><p>Use your CDC administrator credentials.</p><CDCLoginForm /></div></section>
  </main>;
}
