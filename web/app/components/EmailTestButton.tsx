"use client";
import { useState } from "react";

// Admin-only: send a test email to yourself to verify SMTP.
export default function EmailTestButton() {
  const [state, setState] = useState<"idle" | "working" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  const run = async () => {
    setState("working"); setMsg("");
    try {
      const res = await fetch("/api/email/test", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) { setState("ok"); setMsg("נשלח ✓ — בדוק את תיבת המייל"); }
      else { setState("err"); setMsg(j.error ? `שגיאה: ${j.error}` : "שליחה נכשלה"); }
    } catch (e) { setState("err"); setMsg((e as Error).message); }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={run} disabled={state === "working"} className="btn">
        {state === "working" ? "שולח…" : "שליחת מייל בדיקה"}
      </button>
      {msg && <span className={`chip ${state === "ok" ? "chip-ok" : "chip-danger"}`} style={{ marginInlineStart: 8 }}>{msg}</span>}
    </div>
  );
}
