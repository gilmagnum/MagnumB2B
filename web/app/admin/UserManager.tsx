"use client";
import { Fragment, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { setActiveAction, resetPasswordAction, changeRoleAction, updateUserAction, deleteUserAction, cleanupProfileAction } from "./actions";
import { saveUserPrefs, saveUserEmailPrefs } from "../notif-actions";
import { eventsForRole, effectivePref, effectiveEmailPref, type Role } from "../../lib/pushEvents";
import { ASSIGNABLE_ROLES, roleLabel } from "../../lib/roles";

export type ManagedUser = {
  id: string; fullName: string | null; role: string; agentId: number | null;
  email: string | null; lastSignIn: string | null; createdAt: string | null; active: boolean;
  deleted?: boolean; // profile row whose auth login was deleted
  pushPrefs?: Record<string, boolean> | null;
  emailPrefs?: Record<string, boolean> | null;
};
type LogRow = { at: string; user_agent: string | null };

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("he-IL") : "—");

export default function UserManager({ users: initial, meId }: { users: ManagedUser[]; meId: string }) {
  const [users, setUsers] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [openPrefs, setOpenPrefs] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const startEdit = (u: ManagedUser) => {
    if (openEdit === u.id) { setOpenEdit(null); return; }
    setOpenEdit(u.id); setEditName(u.fullName ?? ""); setEditEmail(u.email ?? "");
  };
  const saveEdit = async (u: ManagedUser) => {
    setBusy(u.id);
    const fd = new FormData(); fd.set("id", u.id); fd.set("full_name", editName); fd.set("email", editEmail);
    const res = await updateUserAction({}, fd);
    setBusy(null);
    if (res.ok) {
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, fullName: editName.trim() || null, email: editEmail.trim() || x.email } : x)));
      setOpenEdit(null); flash(u.id, res.ok, true);
    } else flash(u.id, res.error ?? "שגיאה", false);
  };
  const deleteUser = async (u: ManagedUser) => {
    if (!window.confirm(`למחוק לצמיתות את ${u.fullName || u.email}? פעולה זו אינה הפיכה.`)) return;
    setBusy(u.id);
    const fd = new FormData(); fd.set("id", u.id);
    const res = await deleteUserAction({}, fd);
    setBusy(null);
    if (res.ok) setUsers((us) => us.filter((x) => x.id !== u.id));
    else flash(u.id, res.error ?? "שגיאה", false);
  };

  const togglePref = async (u: ManagedUser, key: string, on: boolean) => {
    const next = { ...(u.pushPrefs ?? {}), [key]: on };
    setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, pushPrefs: next } : x)));
    const res = await saveUserPrefs(u.id, next);
    flash(u.id, res.ok ? "העדפות פוש נשמרו" : (res.error ?? "שגיאה"), !!res.ok);
  };

  const toggleEmailPref = async (u: ManagedUser, key: string, on: boolean) => {
    const next = { ...(u.emailPrefs ?? {}), [key]: on };
    setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, emailPrefs: next } : x)));
    const res = await saveUserEmailPrefs(u.id, next);
    flash(u.id, res.ok ? "העדפות מייל נשמרו" : (res.error ?? "שגיאה"), !!res.ok);
  };

  const flash = (id: string, text: string, ok: boolean) => { setMsg({ id, text, ok }); setTimeout(() => setMsg((m) => (m?.id === id ? null : m)), 3000); };

  const toggleActive = async (u: ManagedUser) => {
    setBusy(u.id);
    const fd = new FormData(); fd.set("id", u.id); fd.set("active", u.active ? "0" : "1");
    const res = await setActiveAction({}, fd);
    setBusy(null);
    if (res.ok) { setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, active: !x.active } : x))); flash(u.id, res.ok, true); }
    else flash(u.id, res.error ?? "שגיאה", false);
  };

  const resetPw = async (u: ManagedUser) => {
    const pw = window.prompt(`סיסמה חדשה ל-${u.fullName || u.email} (8+ תווים):`);
    if (!pw) return;
    setBusy(u.id);
    const fd = new FormData(); fd.set("id", u.id); fd.set("password", pw);
    const res = await resetPasswordAction({}, fd);
    setBusy(null);
    flash(u.id, res.ok ?? res.error ?? "שגיאה", !!res.ok);
  };

  const changeRole = async (u: ManagedUser, role: string) => {
    if (role === u.role) return;
    let agentId = "";
    if (role === "agent") {
      const v = window.prompt(`קוד סוכן (Accounts.Agent) ל-${u.fullName || u.email}:`, u.agentId != null ? String(u.agentId) : "");
      if (v == null) return;
      agentId = v;
    }
    setBusy(u.id);
    const fd = new FormData(); fd.set("id", u.id); fd.set("role", role); if (agentId) fd.set("agentId", agentId);
    const res = await changeRoleAction({}, fd);
    setBusy(null);
    if (res.ok) { setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, role, agentId: role === "agent" ? Number(agentId) : null } : x))); flash(u.id, res.ok, true); }
    else flash(u.id, res.error ?? "שגיאה", false);
  };

  const showLog = async (u: ManagedUser) => {
    if (openLog === u.id) { setOpenLog(null); return; }
    setOpenLog(u.id); setLogLoading(true); setLog([]);
    const { data } = await supabaseBrowser().from("login_events").select("at, user_agent").eq("profile_id", u.id).order("at", { ascending: false }).limit(20);
    setLog((data as LogRow[]) ?? []); setLogLoading(false);
  };

  const cleanup = async (u: ManagedUser) => {
    if (!window.confirm(`לנקות את הרשומה היתומה של ${u.fullName || "—"}? (ההתחברות כבר נמחקה)`)) return;
    setBusy(u.id);
    const fd = new FormData(); fd.set("id", u.id);
    const res = await cleanupProfileAction({}, fd);
    setBusy(null);
    if (res.ok) setUsers((us) => us.filter((x) => x.id !== u.id)); else flash(u.id, res.error ?? "שגיאה", false);
  };

  const live = users.filter((u) => !u.deleted && u.active);
  const inactive = users.filter((u) => u.deleted || !u.active);

  return (
    <div className="table-wrap">
      <table className="data-table" style={{ minWidth: 760 }}>
        <thead>
          <tr><th>שם</th><th>אימייל</th><th>תפקיד</th><th>קוד סוכן</th><th>כניסה אחרונה</th><th>סטטוס</th><th>פעולות</th></tr>
        </thead>
        <tbody>
          {live.map((u) => (
            <Fragment key={u.id}>
              <tr>
                <td style={{ fontWeight: 600 }}>{u.fullName || "—"}</td>
                <td style={{ color: "var(--ink-muted)" }}>{u.email || "—"}</td>
                <td>
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} disabled={busy === u.id || u.id === meId}
                    className="select" style={{ padding: "4px 8px", minWidth: 90 }}>
                    {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                <td>{u.agentId ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>{dt(u.lastSignIn)}</td>
                <td>{u.active ? <span className="chip chip-ok">פעיל</span> : <span className="chip chip-danger">מושבת</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button onClick={() => startEdit(u)} disabled={busy === u.id} className="btn btn-sm">{openEdit === u.id ? "סגור עריכה" : "ערוך"}</button>
                  <button onClick={() => toggleActive(u)} disabled={busy === u.id || u.id === meId} className="btn btn-sm" style={{ marginInlineStart: 6 }} title={u.id === meId ? "לא ניתן על עצמך" : ""}>
                    {u.active ? "השבת" : "הפעל"}
                  </button>
                  <button onClick={() => resetPw(u)} disabled={busy === u.id} className="btn btn-sm" style={{ marginInlineStart: 6 }}>איפוס סיסמה</button>
                  <button onClick={() => showLog(u)} className="btn btn-sm" style={{ marginInlineStart: 6 }}>{openLog === u.id ? "סגור לוג" : "לוג כניסות"}</button>
                  <button onClick={() => setOpenPrefs(openPrefs === u.id ? null : u.id)} className="btn btn-sm" style={{ marginInlineStart: 6 }}>{openPrefs === u.id ? "סגור התראות" : "התראות"}</button>
                  <button onClick={() => deleteUser(u)} disabled={busy === u.id || u.id === meId} className="btn btn-sm" style={{ marginInlineStart: 6, color: "var(--danger)" }} title={u.id === meId ? "לא ניתן על עצמך" : ""}>מחק</button>
                </td>
              </tr>
              {msg?.id === u.id && (
                <tr><td colSpan={7}><span className={msg.ok ? "chip chip-ok" : "chip chip-danger"}>{msg.text}</span></td></tr>
              )}
              {openEdit === u.id && (
                <tr><td colSpan={7} style={{ background: "var(--surface-muted)" }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label style={{ fontSize: 13 }}>שם מלא<br />
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" style={{ minWidth: 200 }} />
                    </label>
                    <label style={{ fontSize: 13 }}>אימייל<br />
                      <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input" style={{ minWidth: 240 }} />
                    </label>
                    <button onClick={() => saveEdit(u)} disabled={busy === u.id} className="btn btn-primary btn-sm">{busy === u.id ? "שומר…" : "שמירה"}</button>
                    <button onClick={() => setOpenEdit(null)} disabled={busy === u.id} className="btn btn-sm">ביטול</button>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "6px 0 0" }}>שינוי אימייל מעדכן את כתובת ההתחברות של המשתמש.</p>
                </td></tr>
              )}
              {openLog === u.id && (
                <tr><td colSpan={7} style={{ background: "var(--surface-muted)" }}>
                  {logLoading ? "טוען…" : log.length === 0 ? <span style={{ color: "var(--ink-muted)" }}>אין כניסות מתועדות.</span> : (
                    <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13 }}>
                      {log.map((l, i) => (
                        <li key={i}>{new Date(l.at).toLocaleString("he-IL")}{l.user_agent ? ` · ${l.user_agent.slice(0, 60)}` : ""}</li>
                      ))}
                    </ul>
                  )}
                </td></tr>
              )}
              {openPrefs === u.id && (
                <tr><td colSpan={7} style={{ background: "var(--surface-muted)" }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>התראות עבור {u.fullName || u.email} ({roleLabel(u.role)}):</div>
                  {eventsForRole(u.role as Role).length === 0 ? <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>אין אירועים מוצעים לתפקיד זה.</span> : (
                    <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-strong)", marginBottom: 4 }}>🔔 פוש</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {eventsForRole(u.role as Role).map((e) => (
                            <label key={e.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                              <input type="checkbox" checked={effectivePref(u.role as Role, u.pushPrefs ?? null, e.key)} onChange={(ev) => togglePref(u, e.key, ev.target.checked)} />
                              {e.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-strong)", marginBottom: 4 }}>✉️ מייל</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {eventsForRole(u.role as Role).map((e) => (
                            <label key={e.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                              <input type="checkbox" checked={effectiveEmailPref(u.emailPrefs ?? null, e.key)} onChange={(ev) => toggleEmailPref(u, e.key, ev.target.checked)} />
                              {e.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {inactive.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--ink-muted)" }}>
            משתמשים מושבתים / נמחקים — {inactive.length}
          </summary>
          <table className="data-table" style={{ minWidth: 640, marginTop: 10 }}>
            <thead>
              <tr><th>שם</th><th>אימייל</th><th>תפקיד</th><th>סטטוס</th><th>פעולות</th></tr>
            </thead>
            <tbody>
              {inactive.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.fullName || "—"}</td>
                  <td style={{ color: "var(--ink-muted)" }}>{u.email || "—"}</td>
                  <td>{roleLabel(u.role)}{u.agentId != null ? ` · ${u.agentId}` : ""}</td>
                  <td>{u.deleted ? <span className="chip chip-danger">נמחק</span> : <span className="chip chip-warn">מושבת</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {u.deleted ? (
                      <button onClick={() => cleanup(u)} disabled={busy === u.id} className="btn btn-sm" style={{ color: "var(--danger)" }}>נקה רשומה</button>
                    ) : (
                      <>
                        <button onClick={() => toggleActive(u)} disabled={busy === u.id || u.id === meId} className="btn btn-sm">הפעל</button>
                        <button onClick={() => deleteUser(u)} disabled={busy === u.id || u.id === meId} className="btn btn-sm" style={{ marginInlineStart: 6, color: "var(--danger)" }}>מחק</button>
                      </>
                    )}
                    {msg?.id === u.id && <span className={`chip ${msg.ok ? "chip-ok" : "chip-danger"}`} style={{ marginInlineStart: 8 }}>{msg.text}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
