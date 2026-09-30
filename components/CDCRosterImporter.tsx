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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const text = await file.text();
      const res = await fetch("/api/cdc/students/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({ message: "Import failed." }));

      if (!res.ok) {
        setMessage(`${body.message || "Import failed."}${body.errors?.length ? ` ${body.errors.slice(0, 3).join(" ")}` : ""}`);
        return;
      }

      setMessage(`Roster import complete: ${body.imported} records processed.`);
      router.refresh();
    } catch (error: any) {
      setMessage(
        error?.name === "AbortError"
          ? "Import timed out after 60 seconds. No retry was started automatically."
          : "Network error while importing the CDC roster.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
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
