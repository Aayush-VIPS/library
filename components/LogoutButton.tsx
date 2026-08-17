"use client";
import { useState } from "react";
export function LogoutButton() {
  const [busy,setBusy] = useState(false);
  return <button className="btn" disabled={busy} onClick={async()=>{ setBusy(true); await fetch("/api/auth/logout",{method:"POST"}); location.href="/login"; }}>{busy?"Signing out…":"Sign out"}</button>;
}
