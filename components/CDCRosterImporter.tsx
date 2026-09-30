"use client";
import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export function CDCRosterImporter() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function importCsv(file: File) {
    setBusy(true);
    setMessage("");
    const text = await file.text();
    const res = await fetch("/api/cdc/students/import", {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: text,
    });
    const body = await res.json().catch(() => ({ message: "Import failed." }));
    setBusy(false);
    if (!res.ok) {
      setMessage(`${body.message || "Import failed."}${body.errors?.length ? ` ${body.errors.slice(0, 3).join(" ")}` : ""}`);
      return;
    }
    setMessage(`Roster import complete: ${body.imported} records processed.`);
    router.refresh();
  }

  return <div className="toolbar-actions">
    <input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={(e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) importCsv(file);
      e.currentTarget.value = "";
    }} />
    <button type="button" className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Importing…" : "Import CDC roster"}</button>
    {message && <span className={message.startsWith("Roster import complete") ? "success" : "error"}>{message}</span>}
  </div>;
}
