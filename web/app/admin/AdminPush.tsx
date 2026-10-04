"use client";
import { useState } from "react";
import type { ManagedUser } from "./UserManager";

export default function AdminPush({ users }: { users: ManagedUser[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [targetType, setTargetType] = useState<"all" | "role" | "user">("all");
  const [role, setRole] = useState("agent");
  const [userId, setUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    if (!title.trim()) { setMsg({ ok: false, text: "נא למלא כותרת" }); return; }
    setSending(true); setMsg(null);
    const target = targetType === "all" ? { type: "all" }
      : targetType === "role" ? { type: "role", value: role }
      : { type: "user", value: userId };
    try {
      const r = await fetch("/api/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url: url.trim() || "/", target }),
      });
      const j = await r.json();
      setMsg(r.ok ? { ok: true, text: `נשלח ל-${j.sent} מכשירים${j.failed ? `, ${j.failed} נכשלו` : ""}` } : { ok: false, text: j.error || "שגיאה" });
    } catch { setMsg({ ok: false, text: "שגיאת רשת" }); }
    finally { setSending(false); }
  };

  return (
    <div className="card card-pad" style={{ display: "grid", gap: 10, maxWidth: 520 }}>
      <h3 style={{ margin: 0, color: "var(--brand-strong)" }}>שליחת התראת פוש</h3>
      <label style={lbl}>כותרת<input value={title} onChange={(e) => setTitle(e.target.value)} className="input" style={{ marginTop: 4 }} /></label>
      <label style={lbl}>תוכן<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="input" style={{ marginTop: 4, resize: "vertical" }} /></label>
      <label style={lbl}>קישור בלחיצה<input value={url} onChange={(e) => setUrl(e.target.value)} className="input" style={{ marginTop: 4 }} placeholder="/" /></label>
      <label style={lbl}>יעד
        <select value={targetType} onChange={(e) => setTargetType(e.target.value as "all" | "role" | "user")} className="select" style={{ marginTop: 4 }}>
          <option value="all">כל המשתמשים</option>
          <option value="role">לפי תפקיד</option>
          <option value="user">משתמש מסוים</option>
        </select>
      </label>
      {targetType === "role" && (
        <select value={role} onChange={(e) => setRole(e.target.value)} className="select">
          <option value="agent">סוכנים</option>
          <option value="picker">מלקטים</option>
          <option value="admin">מנהלים</option>
          <option value="superadmin">אדמינים</option>
        </select>
      )}
      {targetType === "user" && (
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className="select">
          <option value="">— בחר משתמש —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName || u.email}</option>)}
        </select>
      )}
      {msg && <p className={msg.ok ? "chip chip-ok" : "chip chip-danger"} style={{ margin: 0 }}>{msg.text}</p>}
      <button onClick={send} disabled={sending} className="btn btn-primary">{sending ? "שולח…" : "שלח התראה"}</button>
      <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: 0 }}>נשלח רק למשתמשים שהפעילו התראות (🔔 בדף הבית).</p>
    </div>
  );
}

const lbl = { fontSize: 13, fontWeight: 600, color: "var(--ink)", display: "block" } as const;
