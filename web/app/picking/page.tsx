"use client";
import { useCallback, useEffect, useState } from "react";
import { bridge, type Document } from "../../lib/bridge";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { managerOrAbove } from "../../lib/roles";
import { getActiveLocks } from "../picking-actions";

// Picking queue. Warehouse screen (role picker/admin). Read-only for now —
// "finish picking" (marking Hashavshevet) is deferred until Gil examines a live pick.
export default function PickingPage() {
  const [role, setRole] = useState<string>("");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [state, setState] = useState<"waiting" | "picked">("waiting");
  const [rows, setRows] = useState<Document[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [locks, setLocks] = useState<Record<number, string>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (!user) { setAllowed(false); return; }
      const { data: prof } = await supabaseBrowser().from("profiles").select("role").eq("id", user.id).single();
      setRole(prof?.role ?? "");
      setAllowed(prof?.role === "picker" || managerOrAbove(prof?.role));
    })();
  }, []);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true); setErr("");
    try {
      // Managers also see orders produced today in the "picked" tab.
      const includeProducedToday = state === "picked" && managerOrAbove(role);
      const r = await bridge.pickingQueue(0, { state, q: q.trim() || undefined, includeProducedToday });
      setRows(r);
      getActiveLocks(r.map((d) => d.stockId)).then(setLocks).catch(() => {});
    } catch {
      setErr("הגשר עדיין לא מחובר — תור הליקוט ייטען כשהגשר יעלה.");
      setRows([]);
    } finally { setLoading(false); }
  }, [allowed, state, q, role]);

  useEffect(() => { void load(); }, [allowed, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (allowed === false) return <p style={{ color: "#a60" }}>הדף מיועד למלקטים ולמנהלים בלבד.</p>;

  return (
    <>
      <h1>ליקוט</h1>
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <button onClick={() => setState("waiting")} style={tab(state === "waiting")}>ממתינות לליקוט</button>
        <button onClick={() => setState("picked")} style={tab(state === "picked")}>לוקטו</button>
        <input placeholder="חיפוש (לקוח/מספר)…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", minWidth: 200 }} />
        <button onClick={load} style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>רענון</button>
      </div>

      {err && <p style={{ color: "#a60", fontSize: 13 }}>{err}</p>}
      {loading ? <p>טוען…</p> : rows.length === 0 && !err ? (
        <p style={{ color: "#888", padding: 12 }}>אין הזמנות {state === "waiting" ? "ממתינות לליקוט" : "שלוקטו"}.</p>
      ) : (
        /* Responsive card list — no horizontal scroll on mobile/tablet. */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
          {rows.map((d) => {
            // Produced orders are view-only for daily tracking — no re-opening picking.
            const canOpen = (state === "waiting" || managerOrAbove(role)) && !d.produced;
            const href = `/picking/${d.stockId}`;
            const inner = (
              <div className="card card-pad" style={{ display: "grid", gap: 6, height: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <b style={{ color: "var(--brand-strong)" }}>{d.docNumber ? `#${d.docNumber}` : `זמני ${d.stockId}`}</b>
                  <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{d.date ? new Date(d.date).toLocaleDateString("he-IL") : ""}</span>
                </div>
                <div style={{ fontWeight: 600 }}>{d.customerName} <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>({d.accountKey})</span></div>
                <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>{d.docTypeName}{d.total != null ? ` · ${d.total.toFixed(2)} ₪` : ""}</div>
                {d.produced && <span className="chip chip-ok" style={{ width: "fit-content" }}>הופק{d.producedDate ? ` · ${new Date(d.producedDate).toLocaleDateString("he-IL")}` : ""}</span>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span style={{ color: canOpen ? "var(--brand)" : "var(--ink-muted)", fontWeight: 700 }}>
                    {d.produced ? "הופק — למעקב" : state === "waiting" ? "ליקוט ←" : managerOrAbove(role) ? "פתח מחדש ←" : `לוקט${d.picker ? ` · ${d.picker}` : ""}`}
                  </span>
                  {locks[d.stockId] && <span className="chip chip-warn" title="בליקוט כעת">🔒 {locks[d.stockId]}</span>}
                </div>
              </div>
            );
            return canOpen
              ? <a key={d.stockId} href={href} style={{ textDecoration: "none", color: "inherit" }}>{inner}</a>
              : <div key={d.stockId}>{inner}</div>;
          })}
        </div>
      )}
    </>
  );
}

const tab = (active: boolean) => ({
  background: active ? "#1e2a78" : "#fff", color: active ? "#fff" : "#1e2a78",
  border: "1px solid #1e2a78", borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 14,
});
