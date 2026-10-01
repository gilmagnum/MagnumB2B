"use client";
import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login, type LoginState } from "./actions";

function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const next = useSearchParams().get("next") ?? "/customer";

  return (
    <div className="card card-pad" style={{ maxWidth: 380, margin: "8vh auto", textAlign: "center", boxShadow: "var(--shadow-lg)" }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: "var(--brand-strong)", letterSpacing: "-0.02em" }}>מגנום</div>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-muted)", marginTop: 4 }}>כניסת סוכנים</h1>
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20, textAlign: "right" }}>
        <input type="hidden" name="next" value={next} />
        <label style={lbl}>אימייל
          <input name="email" type="email" autoComplete="username" required className="input" style={{ marginTop: 6 }} />
        </label>
        <label style={lbl}>סיסמה
          <input name="password" type="password" autoComplete="current-password" required className="input" style={{ marginTop: 6 }} />
        </label>
        {state.error && <p className="chip chip-danger" style={{ margin: 0 }}>{state.error}</p>}
        <button type="submit" disabled={pending} className="btn btn-primary" style={{ padding: "11px 18px", fontSize: 15 }}>
          {pending ? "מתחבר…" : "כניסה"}
        </button>
      </form>
      <p style={{ color: "var(--ink-muted)", fontSize: 12, marginTop: 20 }}>הגישה לסוכנים בלבד. חשבון נפתח על ידי המנהל.</p>
    </div>
  );
}

const lbl = { fontSize: 13, fontWeight: 600, color: "var(--ink)", display: "block" } as const;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
