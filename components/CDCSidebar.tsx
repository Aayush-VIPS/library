"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/cdc", "Overview"],
  ["/cdc/students", "Students"],
  ["/cdc/sessions", "Placement Sessions"],
  ["/cdc/readers", "RFID Readers"],
] as const;

export function CDCSidebar() {
  const path = usePathname();
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">CDC</div><div><div className="brand-title">VIPS CDC</div><span className="brand-sub">Placement Attendance</span></div></div>
    <nav className="nav" aria-label="CDC navigation">
      {links.map(([href,label]) => {
        const active = href === "/cdc" ? path === href : path.startsWith(href);
        return <Link className={`nav-link ${active ? "active" : ""}`} href={href} key={href}><span className="nav-icon" />{label}</Link>;
      })}
    </nav>
    <div className="sidebar-footer"><span className="brand-sub">System</span><div className="system-live"><i /> CDC operational</div></div>
  </aside>;
}
