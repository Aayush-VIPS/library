"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CDC_PROGRAMS } from "@/lib/cdc";

export function CDCSessionCreator() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: String(fd.get("title") || ""),
      company: String(fd.get("company") || ""),
      venue: String(fd.get("venue") || ""),
      scheduledAt: String(fd.get("scheduledAt") || ""),
      notes: String(fd.get("notes") || ""),
      eligibleProgramCodes: fd.getAll("eligibleProgramCodes").map(String),
    };
    const res = await fetch("/api/cdc/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({ message: "Could not create session." }));
    setBusy(false);
    if (!res.ok) {
      setMessage(body.message || "Could not create session.");
      return;
    }
    setOpen(false);
    router.push(`/cdc/sessions/${body.id}`);
    router.refresh();
  }

  return <>
    <button className="btn primary" onClick={() => { setMessage(""); setOpen(true); }}>Create session</button>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={save}>
        <h3>New placement session</h3>
        <p>Create one attendance register for a placement, training, pre-placement talk or CDC session.</p>
        <div className="form-grid">
          <div className="field full"><label>Session title</label><input className="input" name="title" required placeholder="e.g. TCS Pre-Placement Talk" /></div>
          <div className="field"><label>Company / organizer</label><input className="input" name="company" placeholder="Optional" /></div>
          <div className="field"><label>Venue</label><input className="input" name="venue" placeholder="Auditorium / Room" /></div>
          <div className="field full"><label>Date & time</label><input className="input" name="scheduledAt" type="datetime-local" required /></div>
          <div className="field full"><label>Eligible programmes</label><div className="check-grid">{CDC_PROGRAMS.map((program) => <label className="check-row" key={program.code}><input type="checkbox" name="eligibleProgramCodes" value={program.code} /><span>{program.label} · {program.code}</span></label>)}</div><div className="subtle" style={{marginTop:6}}>Leave all unchecked to allow all CDC students.</div></div>
          <div className="field full"><label>Notes</label><textarea className="input" name="notes" rows={3} placeholder="Optional instructions or session details" /></div>
        </div>
        {message && <p className="error" style={{marginTop:10}}>{message}</p>}
        <div className="modal-actions"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create session"}</button></div>
      </form>
    </div>}
  </>;
}
