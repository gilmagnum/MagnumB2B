"use client";
import { useActionState, useState } from "react";
import { createUserAction, type AdminState } from "./actions";

export default function CreateUserForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(createUserAction, {});
  const [role, setRole] = useState("agent");

  return (
    <form action={action} style={{ display: "grid", gap: 10, maxWidth: 420, border: "1px solid #e3e3e3", borderRadius: 10, padding: 16 }}>
      <h3 style={{ margin: 0, color: "#1e2a78" }}>הקמת משתמש</h3>
      <label>אימייל<input name="email" type="email" required style={inp} /></label>
      <label>שם מלא<input name="full_name" type="text" style={inp} /></label>
      <label>תפקיד
        <select name="role" value={role} onChange={(e) => setRole(e.target.value)} style={inp}>
          <option value="agent">סוכן</option>
          <option value="admin">מנהל</option>
        </select>
      </label>
      {role === "agent" && (
        <label>קוד סוכן (Accounts.Agent)<input name="agent_id" type="number" required style={inp} /></label>
      )}
      <label>סיסמה ראשונית<input name="password" type="text" required minLength={8} style={inp} /></label>
      {state.error && <p style={{ color: "#b00", margin: 0 }}>{state.error}</p>}
      {state.ok && <p style={{ color: "#0a7", margin: 0 }}>{state.ok} ✓</p>}
      <button type="submit" disabled={pending}
        style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", cursor: "pointer", opacity: pending ? 0.6 : 1 }}>
        {pending ? "מקים…" : "הקם משתמש"}
      </button>
    </form>
  );
}

const inp = { width: "100%", padding: 8, marginTop: 4, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" as const };
