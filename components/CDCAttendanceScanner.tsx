"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ScanResult = { name: string; enrollmentNumber: string; program: string };

export function CDCAttendanceScanner({ sessionId, status }: { sessionId: string; status: "OPEN" | "CLOSED" }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => { if (status === "OPEN") inputRef.current?.focus(); }, [status]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = identifier.trim();
    if (!value || busy || status !== "OPEN") return;
    setBusy(true);
    setMessage("");
    setResult(null);
    const res = await fetch(`/api/cdc/sessions/${sessionId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: value }),
    });
    const body = await res.json().catch(() => ({ message: "Attendance request failed." }));
    setBusy(false);
    setIdentifier("");
    if (!res.ok) {
      setMessage(body.message || "Attendance could not be recorded.");
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    setResult(body.student);
    setMessage("Attendance recorded.");
    router.refresh();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function changeStatus(next: "OPEN" | "CLOSED") {
    setBusy(true);
    const res = await fetch(`/api/cdc/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Could not update session." }));
      setMessage(body.message || "Could not update session.");
      return;
    }
    router.refresh();
  }

  return <div className="cdc-scan-panel">
    <div className="cdc-scan-head">
      <div><span className="eyebrow">Attendance capture</span><h3>{status === "OPEN" ? "Scan card or enter enrollment" : "Session is closed"}</h3><p>Card ID from the CDC roster and normalized enrollment number are both accepted. Duplicate attendance is blocked.</p></div>
      <button className={`btn ${status === "OPEN" ? "danger" : "green"}`} disabled={busy} onClick={() => changeStatus(status === "OPEN" ? "CLOSED" : "OPEN")}>{status === "OPEN" ? "Close attendance" : "Reopen attendance"}</button>
    </div>
    <form className="cdc-scan-form" onSubmit={submit}>
      <input ref={inputRef} className="input cdc-scan-input" inputMode="numeric" autoComplete="off" disabled={status !== "OPEN" || busy} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Scan Card ID or type enrollment number" />
      <button className="btn primary" disabled={status !== "OPEN" || busy}>{busy ? "Recording…" : "Mark present"}</button>
    </form>
    {message && <div className={result ? "notice cdc-scan-success" : "notice warn"}><b>{message}</b>{result && <span>{result.name} · {result.enrollmentNumber} · {result.program}</span>}</div>}
  </div>;
}
