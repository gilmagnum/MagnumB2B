"use client";
import { useState } from "react";
import { setSharedPicking } from "./actions";

// Superadmin switch for the shared-picking feature flag (off by default).
export default function SharedPickingToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const toggle = async () => {
    setBusy(true); setMsg("");
    const next = !on;
    const res = await setSharedPicking(next);
    setBusy(false);
    if (res.ok) { setOn(next); setMsg(next ? "ליקוט משותף הופעל ✓" : "ליקוט משותף כובה ✓"); }
    else setMsg(res.error || "שגיאה");
  };

  return (
    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button onClick={toggle} disabled={busy} className={on ? "btn btn-primary" : "btn"}>
        {busy ? "…" : on ? "ליקוט משותף: פעיל — לכיבוי" : "ליקוט משותף: כבוי — להפעלה"}
      </button>
      <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>
        מאפשר לשני מלקטים לעבוד על אותה הזמנה (פיצול שורות). כבוי = התנהגות רגילה.
      </span>
      {msg && <span className="chip chip-ok">{msg}</span>}
    </div>
  );
}
