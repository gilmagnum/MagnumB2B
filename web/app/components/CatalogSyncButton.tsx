"use client";
import { useState } from "react";

// Manager+: trigger a full catalog refresh (Hashavshevet → Supabase) so newly-created
// items appear right away instead of waiting for the periodic sync.
export default function CatalogSyncButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const run = async () => {
    setState("running"); setMsg("מסנכרן קטלוג… (עד דקה)");
    try {
      const r = await fetch("/api/bridge/sync", { method: "POST", headers: { "ngrok-skip-browser-warning": "1" } });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setState("done"); setMsg(`סונכרן ✓ · ${j.shown ?? j.items ?? "?"} פריטים מוצגים${j.variants != null ? `, ${j.variants} וריאנטים` : ""}`); }
      else { setState("error"); setMsg(j.error || "שגיאה בסנכרון"); }
    } catch {
      // The proxy may time out while the bridge keeps working — poll the status.
      setMsg("הסנכרון רץ… בודק סטטוס");
      for (let i = 0; i < 25; i++) {
        await sleep(3000);
        try {
          const s = await (await fetch("/api/bridge/sync", { headers: { "ngrok-skip-browser-warning": "1" } })).json();
          if (s && s.running === false) { setState("done"); setMsg(`הסנכרון הסתיים ✓${s.last?.shown != null ? ` · ${s.last.shown} פריטים` : ""}`); return; }
        } catch { /* keep polling */ }
      }
      setState("done"); setMsg("הסנכרון הופעל וממשיך ברקע — רענן בעוד דקה.");
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ color: "var(--ink-muted)", fontSize: 14, margin: "0 0 8px" }}>
        פריט חדש שהוקם בחשבשבת מופיע בקטלוג לאחר הסנכרון התקופתי. ניתן לרענן מיד:
      </p>
      <button onClick={run} disabled={state === "running"} className="btn btn-primary">
        {state === "running" ? "מסנכרן…" : "סנכרן קטלוג עכשיו"}
      </button>
      {msg && <span className={`chip ${state === "error" ? "chip-danger" : "chip-ok"}`} style={{ marginInlineStart: 8 }}>{msg}</span>}
    </div>
  );
}
