import type { ReactNode } from "react";
import { canManageSystem, requireAdmin } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { LogoutButton } from "@/components/LogoutButton";
import { publicConfig } from "@/lib/env";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return <div className="shell">
    <Sidebar canManageSystem={canManageSystem(admin)} />
    <div className="workspace">
      <header className="topbar">
        <div><h1>{publicConfig.institutionName} RFID</h1><p>Entry, exit and occupancy administration · Asia/Kolkata</p></div>
        <div className="userbox"><div className="user-meta"><b>{admin.name}</b><span>{admin.role.replace("_", " ")} · {admin.email}</span></div><LogoutButton /></div>
      </header>
      {children}
    </div>
  </div>;
}
