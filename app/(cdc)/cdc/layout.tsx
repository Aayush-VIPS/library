import type { ReactNode } from "react";
import { requireCDC } from "@/lib/cdc-auth";
import { CDCSidebar } from "@/components/CDCSidebar";
import { LogoutButton } from "@/components/LogoutButton";

export default async function CDCLayout({ children }: { children: ReactNode }) {
  const admin = await requireCDC();
  return <div className="shell">
    <CDCSidebar />
    <div className="workspace">
      <header className="topbar">
        <div><h1>VIPS CDC Placement Attendance</h1><p>Placement sessions, eligible student rosters and auditable attendance · Asia/Kolkata</p></div>
        <div className="userbox"><div className="user-meta"><b>{admin.name}</b><span>CDC ADMIN · {admin.email}</span></div><LogoutButton /></div>
      </header>
      {children}
    </div>
  </div>;
}
