"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/dashboard", "Overview"], ["/inside", "Currently Inside"], ["/students", "Students"],
  ["/visits", "Visit History"], ["/devices", "Devices"], ["/events", "Scan Events"],
] as const;

const systemLinks = [["/libraries", "Libraries"], ["/users", "Users & Staff"]] as const;

export function Sidebar({ canManageSystem = false }: { canManageSystem?: boolean }) {
  const path = usePathname();
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">VL</div><div><div className="brand-title">VIPS Library</div><span className="brand-sub">RFID Access System</span></div></div>
    <nav className="nav" aria-label="Dashboard navigation">
      {links.map(([href,label]) => <Link className={`nav-link ${path === href ? "active" : ""}`} href={href} key={href}><span className="nav-icon" />{label}</Link>)}
      {canManageSystem && systemLinks.map(([href,label]) => <Link className={`nav-link ${path === href ? "active" : ""}`} href={href} key={href}><span className="nav-icon" />{label}</Link>)}
    </nav>
    <div className="sidebar-footer"><span className="brand-sub">System</span><div className="system-live"><i /> Backend operational</div></div>
  </aside>;
}
