"use client";
import { useState } from "react";

export function CDCLogoutButton() {
  const [busy, setBusy] = useState(false);
  return <button className="btn" disabled={busy} onClick={async () => {
    setBusy(true);
    await fetch("/api/cdc/auth/logout", { method: "POST" });
    location.href = "/cdc/login";
  }}>{busy ? "Signing out…" : "Sign out"}</button>;
}
