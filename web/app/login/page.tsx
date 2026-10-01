"use client";
import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login, type LoginState } from "./actions";

function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const next = useSearchParams().get("next") ?? "/customer";

  return (
    <div style={{ maxWidth: 360, margin: "60px auto", textAlign: "center" }}>
      <h1 style={{ color: "#1e2a78" }}>מגנום — כניסת סוכנים</h1>
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24, textAlign: "right" }}>
        <input type="hidden" name="next" value={next} />
        <label>
          אימייל
          <input name="email" type="email" autoComplete="username" required style={inp} />
        </label>
        <label>
          סיסמה
          <input name="password" type="password" autoComplete="current-password" required style={inp} />
        </label>
        {state.error && <p style={{ color: "#b00", margin: 0, fontSize: 14 }}>{state.error}</p>}
        <button type="submit" disabled={pending}
          style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", cursor: "pointer", opacity: pending ? 0.6 : 1 }}>
          {pending ? "מתחבר…" : "כניסה"}
        </button>
      </form>
      <p style={{ color: "#888", fontSize: 12, marginTop: 20 }}>הגישה לסוכנים בלבד. חשבון נפתח על ידי המנהל.</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

const inp = { width: "100%", padding: 8, marginTop: 4, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" as const };
