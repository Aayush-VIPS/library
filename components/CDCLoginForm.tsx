"use client";
import { FormEvent, useState } from "react";

export function CDCLoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/cdc/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    const body = await res.json().catch(() => ({ message: "Login failed." }));
    if (!res.ok) {
      setError(body.message || "Login failed.");
      setBusy(false);
      return;
    }
    location.href = "/cdc";
  }

  return <form className="login-form" onSubmit={submit}>
    <div className="field"><label htmlFor="cdc-email">CDC email</label><input className="input" id="cdc-email" name="email" type="email" autoComplete="username" required /></div>
    <div className="field"><label htmlFor="cdc-password">Password</label><input className="input" id="cdc-password" name="password" type="password" autoComplete="current-password" required minLength={8} /></div>
    {error && <div className="error" role="alert">{error}</div>}
    <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in to CDC"}</button>
  </form>;
}
