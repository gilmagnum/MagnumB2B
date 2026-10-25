"use client";
import { useCallback, useEffect, useState } from "react";
import { bridge, type Document } from "../../lib/bridge";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { managerOrAbove } from "../../lib/roles";
import { getActiveLocks } from "../picking-actions";
import { getSplitOrders } from "../shared-picking-actions";
import { pendingSurplusCount } from "../surplus-approvals-actions";
import { listPickingLogs, type PickLogRow } from "../order-actions";

type Tab = "waiting" | "picked" | "produced" | "all";
const TAB_LABEL: Record<Tab, string> = { waiting: "ממתין לליקוט", picked: "לוקט", produced: "הופק", all: "הכל" };

// Picking queue. Warehouse screen (picker/manager). Managers get four filters
// (waiting / picked / produced-today / all); pickers see waiting + picked only.
export default function PickingPage() {
  const [role, setRole] = useState<string>("");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [state, setState] = useState<Tab>("waiting");
  const [rows, setRows] = useState<Document[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [locks, setLocks] = useState<Record<number, string>>({});
  const [splits, setSplits] = useState<Record<number, string>>({}); // split-mode orders by owner
  const [logs, setLogs] = useState<Record<number, PickLogRow>>({}); // picker notes + shortages by stockId
  const [openLog, setOpenLog] = useState<number | null>(null);
  const [surplusCount, setSurplusCount] = useState(0); // pending surplus approvals (managers)

  const mgr = managerOrAbove(role);
  const tabs: Tab[] = mgr ? ["waiting", "picked", "produced", "all"] : ["waiting", "picked"];

  useEffect(() => { if (mgr) pendingSurplusCount().then(setSurplusCount).catch(() => {}); }, [mgr]);

  // Load picking logs (notes + shortages) so a manager can expand picked/produced rows.
  useEffect(() => {
    if (!mgr || state === "waiting") { setLogs({}); return; }
    let alive = true;
    listPickingLogs().then((ls) => {
      if (!alive) return;
      const by: Record<number, PickLogRow> = {};
      for (const l of ls) if (l.stock_id != null && !by[l.stock_id]) by[l.stock_id] = l; // latest per order
      setLogs(by);
    }).catch(() => {});
    return () => { alive = false; };
  }, [state, mgr]);

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
    const term = q.trim() || undefined;
    const isMgr = managerOrAbove(role);
    try {
      let r: Document[];
      if (state === "waiting") {
        r = await bridge.pickingQueue(0, { state: "waiting", q: term });
      } else if (state === "picked") {
        r = (await bridge.pickingQueue(0, { state: "picked", q: term })).filter((d) => !d.produced);
      } else if (state === "produced") {
        r = (await bridge.pickingQueue(0, { state: "picked", q: term, includeProducedToday: true })).filter((d) => d.produced);
      } else { // all
        const [w, p] = await Promise.all([
          bridge.pickingQueue(0, { state: "waiting", q: term }),
          bridge.pickingQueue(0, { state: "picked", q: term, includeProducedToday: isMgr }),
        ]);
        const seen = new Set<number>();
        r = [...w, ...p].filter((d) => (seen.has(d.stockId) ? false : (seen.add(d.stockId), true)));
      }
      setRows(r);
      const ids = r.map((d) => d.stockId);
      getActiveLocks(ids).then(setLocks).catch(() => {});
      getSplitOrders(ids).then(setSplits).catch(() => {});
    } catch {
      setErr("הגשר עדיין לא מחובר — תור הליקוט ייטען כשהגשר יעלה.");
      setRows([]);
    } finally { setLoading(false); }
  }, [allowed, state, q, role]);

  useEffect(() => { void load(); }, [allowed, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (allowed === false) return <p style={{ color: "#a60" }}>הדף מיועד למלקטים ולמנהלים בלבד.</p>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>ליקוט</h1>
        {mgr && surplusCount > 0 && (
          <a href="/picking/approvals" className="btn btn-primary btn-sm" style={{ background: "var(--danger)", borderColor: "var(--danger)" }}>⚠ אישורי עודף ({surplusCount})</a>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setState(t)} style={tab(state === t)}>{TAB_LABEL[t]}</button>
        ))}
        <input placeholder="חיפוש (לקוח/מספר)…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", minWidth: 200 }} />
        <button onClick={load} style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>רענון</button>
      </div>

      {err && <p style={{ color: "#a60", fontSize: 13 }}>{err}</p>}
      {loading ? <p>טוען…</p> : rows.length === 0 && !err ? (
        <p style={{ color: "#888", padding: 12 }}>אין הזמנות ({TAB_LABEL[state]}).</p>
      ) : (
        /* Responsive card list — no horizontal scroll on mobile/tablet. */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
          {rows.map((d) => {
            // Produced orders are view-only; a picked order can be reopened by a manager; waiting is open to all.
            // A split (shared) order is always open to join (not locked).
            const split = splits[d.stockId];
            const canOpen = split ? !d.produced : (!d.produced && (!d.picked || mgr));
            const href = `/picking/${d.stockId}`;
            const inner = (
              <div className="card card-pad" style={{ display: "grid", gap: 6, height: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <b style={{ color: "var(--brand-strong)" }}>{d.docNumber ? `#${d.docNumber}` : `זמני ${d.stockId}`}</b>
                  <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{d.date ? new Date(d.date).toLocaleDateString("he-IL") : ""}</span>
                </div>
                <div style={{ fontWeight: 600 }}>{d.customerName} <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>({d.accountKey})</span></div>
                <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>{d.docTypeName}{d.total != null ? ` · ${d.total.toFixed(2)} ₪` : ""}</div>
                {d.orderNote?.trim() && (
                  <div className="chip chip-warn" style={{ width: "fit-content", maxWidth: "100%", whiteSpace: "pre-wrap", fontWeight: 600 }}>📝 {d.orderNote.trim()}</div>
                )}
                {d.produced && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="chip chip-ok" style={{ width: "fit-content" }}>הופק{d.producedDate ? ` · ${new Date(d.producedDate).toLocaleDateString("he-IL")}` : ""}</span>
                    {/* The permanent reference numbers produced from the order (ת.משלוח / חשבונית). */}
                    {d.producedDocs?.filter((p) => p.docNumber).map((p) => (
                      <span key={p.documentId} className="chip" style={{ width: "fit-content" }}>אסמכתא: {p.docTypeName} #{p.docNumber}</span>
                    ))}
                  </div>
                )}
                {mgr && (logs[d.stockId] || d.produced) && (
                  <div>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenLog(openLog === d.stockId ? null : d.stockId); }}
                      className="btn btn-sm" style={{ padding: "2px 10px" }}>{openLog === d.stockId ? "− הערות וחוסרים" : "+ הערות וחוסרים"}</button>
                    {openLog === d.stockId && (() => { const lg = logs[d.stockId]; const surp = (lg?.lines ?? []).filter((x) => (x.picked ?? 0) > (x.ordered ?? 0)); return (
                      <div style={{ marginTop: 6, fontSize: 13, background: "var(--surface-muted)", borderRadius: 8, padding: 8 }}>
                        {lg?.picker && <div>מלקט: <b>{lg.picker}</b></div>}
                        {lg?.notes && <div>הערת מלקט: {lg.notes}</div>}
                        {lg
                          ? (lg.shortages?.length
                            ? <div style={{ marginTop: 4 }}><b>חוסרים ({lg.shortages.length}):</b>
                                <ul style={{ margin: "2px 0 0", paddingInlineStart: 16 }}>
                                  {lg.shortages.map((s, i) => <li key={i}>{s.itemkey}{s.size ? ` (${s.size})` : ""} — לוקט {s.picked}/{s.ordered}</li>)}
                                </ul></div>
                            : <div style={{ color: "var(--ok)" }}>אין חוסרים</div>)
                          : <div style={{ color: "var(--ink-muted)" }}>אין תיעוד ליקוט באפליקציה למסמך זה.</div>}
                        {surp.length > 0 && <div style={{ marginTop: 4, color: "var(--danger)" }}><b>⚠ עודף ({surp.length}):</b>
                          <ul style={{ margin: "2px 0 0", paddingInlineStart: 16 }}>
                            {surp.map((s, i) => <li key={i}>{s.itemkey}{s.size ? ` (${s.size})` : ""} — לוקט {s.picked} (הוזמן {s.ordered}, +{s.picked - s.ordered})</li>)}
                          </ul></div>}
                      </div>
                    ); })()}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span style={{ color: canOpen ? "var(--brand)" : "var(--ink-muted)", fontWeight: 700 }}>
                    {d.produced ? "הופק — למעקב" : split ? "ליקוט חלקי — הצטרף ←" : !d.picked ? "ליקוט ←" : mgr ? "פתח מחדש ←" : `לוקט${d.picker ? ` · ${d.picker}` : ""}`}
                  </span>
                  {split
                    ? <span className="chip chip-info" title="ליקוט משותף">👥 {split}</span>
                    : locks[d.stockId] && <span className="chip chip-warn" title="בליקוט כעת">🔒 {locks[d.stockId]}</span>}
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
