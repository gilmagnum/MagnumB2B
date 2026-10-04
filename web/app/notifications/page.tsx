"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/browser";

type Notif = { id: string; title: string; body: string | null; url: string | null; created_at: string; read_at: string | null };

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: { user } } = await supabaseBrowser().auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabaseBrowser()
      .from("notifications").select("id, title, body, url, created_at, read_at")
      .eq("profile_id", user.id).order("created_at", { ascending: false }).limit(60);
    setRows((data as Notif[]) ?? []); setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, read_at: new Date().toISOString() } : r)));
    await supabaseBrowser().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  };
  const markAllRead = () => markRead(rows.filter((r) => !r.read_at).map((r) => r.id));

  const open = async (n: Notif) => {
    if (!n.read_at) await markRead([n.id]);
    if (n.url) window.location.href = n.url;
  };

  const unread = rows.filter((r) => !r.read_at).length;
  const fmt = (s: string) => new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>התראות {unread > 0 && <span className="chip chip-danger" style={{ fontSize: 14 }}>{unread} שלא נקראו</span>}</h1>
        {unread > 0 && <button onClick={markAllRead} className="btn btn-sm">סמן הכל כנקרא</button>}
      </div>

      {loading ? <p style={{ marginTop: 16 }}>טוען…</p> : rows.length === 0 ? (
        <p style={{ marginTop: 16, color: "var(--ink-muted)" }}>אין התראות.</p>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
          {rows.map((n) => (
            <div key={n.id} onClick={() => open(n)}
              className="card"
              style={{
                padding: "12px 14px", cursor: n.url ? "pointer" : "default",
                borderInlineStart: `4px solid ${n.read_at ? "var(--border)" : "var(--brand)"}`,
                background: n.read_at ? "var(--surface)" : "var(--brand-soft)",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <b style={{ color: "var(--brand-strong)" }}>{n.title}</b>
                <span style={{ color: "var(--ink-muted)", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(n.created_at)}</span>
              </div>
              {n.body && <div style={{ fontSize: 14, marginTop: 4 }}>{n.body}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
