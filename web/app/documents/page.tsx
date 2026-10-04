"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { bridge, type Document, type DocumentDetail } from "../../lib/bridge";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { exportExcel, exportPdf } from "../../lib/docExport";
import { fetchImages } from "../../lib/images";
import { useOrderContext } from "../../lib/useOrderContext";
import { managerOrAbove } from "../../lib/roles";

// Documents screen. Admin sees ALL; an agent sees only their customers'. A "+" per
// row expands the document's lines (with product images) inline. When a customer is
// entered, the list auto-filters to them.
export default function DocumentsPage() {
  const { ctx } = useOrderContext();
  const [role, setRole] = useState<string>("");
  const [agentId, setAgentId] = useState<number | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [onlyCustomer, setOnlyCustomer] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyExport, setBusyExport] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<Record<number, DocumentDetail>>({});
  const [images, setImages] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  // Inside a customer: show their open balance (best-effort; hidden if the bridge endpoint isn't up).
  useEffect(() => {
    if (!(ctx && onlyCustomer)) { setBalance(null); return; }
    let alive = true;
    bridge.balance(ctx.accountKey).then((r) => { if (alive) setBalance(r.balance); }).catch(() => { if (alive) setBalance(null); });
    return () => { alive = false; };
  }, [ctx, onlyCustomer]);

  // Load a document's lines + images once; cache them.
  const ensureDetail = async (stockId: number): Promise<DocumentDetail | null> => {
    if (detail[stockId]) return detail[stockId];
    setLoadingId(stockId);
    try {
      const d = await bridge.document(stockId);
      const imgs = await fetchImages((d.lines ?? []).map((l) => l.itemkey));
      setDetail((m) => ({ ...m, [stockId]: d }));
      setImages((m) => ({ ...m, ...imgs }));
      return d;
    } catch {
      return null;
    } finally {
      setLoadingId(null);
    }
  };

  const toggleExpand = async (stockId: number) => {
    const next = new Set(expanded);
    if (next.has(stockId)) { next.delete(stockId); setExpanded(next); return; }
    const d = await ensureDetail(stockId);
    if (!d) { alert("לא ניתן לטעון את שורות המסמך (ייתכן שהגשר עדיין לא מחובר)."); return; }
    next.add(stockId); setExpanded(next);
  };

  const doExport = async (stockId: number, kind: "pdf" | "excel") => {
    setBusyExport(stockId);
    try {
      const d = await ensureDetail(stockId);
      if (!d) { alert("לא ניתן לטעון את פרטי המסמך."); return; }
      const imgs = await fetchImages((d.lines ?? []).map((l) => l.itemkey));
      if (kind === "pdf") exportPdf(d, imgs); else await exportExcel(d, imgs);
    } finally {
      setBusyExport(null);
    }
  };

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErr("יש להתחבר מחדש"); setLoading(false); return; }
      const { data: prof } = await supabase.from("profiles").select("role, agent_id").eq("id", user.id).single();
      setRole(prof?.role ?? "");
      setAgentId(managerOrAbove(prof?.role) ? 0 : (prof?.agent_id ?? null));
    })();
  }, []);

  const load = useCallback(async () => {
    if (agentId == null) { setLoading(false); if (role && !managerOrAbove(role)) setErr("למשתמש לא משויך קוד סוכן"); return; }
    setLoading(true); setErr(""); setExpanded(new Set());
    const effectiveQ = (ctx && onlyCustomer) ? ctx.accountKey : (q.trim() || undefined);
    try {
      setDocs(await bridge.documents(agentId, { status: status === "all" ? undefined : status, q: effectiveQ, limit: 100 }));
    } catch {
      setErr("הגשר עדיין לא מחובר — רשימת המסמכים תיטען כשהגשר יעלה.");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, role, status, q, ctx, onlyCustomer]);

  useEffect(() => { void load(); }, [agentId, status, onlyCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  const colCount = (ctx && onlyCustomer) ? 8 : 9;
  // Inside a customer, the bridge q is a LIKE match — enforce the exact accountKey here.
  const visible = (ctx && onlyCustomer) ? docs.filter((d) => String(d.accountKey) === String(ctx.accountKey)) : docs;

  return (
    <>
      <h1>היסטוריית מסמכים</h1>
      {ctx && onlyCustomer
        ? <p style={{ color: "var(--brand-strong)", fontSize: 14 }}>מסמכי <b>{ctx.customerName}</b> ({ctx.accountKey})
            {balance != null && (() => {
              const debt = -balance; // negative balance = the customer owes us
              if (Math.abs(balance) < 0.5) return <span className="chip" style={{ marginInlineStart: 8, background: "var(--surface-muted)" }}>אין יתרה</span>;
              return debt > 0
                ? <span className="chip" style={{ marginInlineStart: 8, background: "var(--danger-soft)", color: "var(--danger)" }}>יתרה לתשלום: {Math.round(debt).toLocaleString("he-IL")} ₪</span>
                : <span className="chip" style={{ marginInlineStart: 8, background: "var(--surface-muted)", color: "var(--ok)" }}>יתרת זכות: {Math.round(-debt).toLocaleString("he-IL")} ₪</span>;
            })()}
            {" "}· <button onClick={() => setOnlyCustomer(false)} style={linkBtn}>הצג את כל המסמכים</button></p>
        : <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>
            {managerOrAbove(role) ? "מציג את כל המסמכים" : "מציג את המסמכים של הלקוחות שלך"}
            {ctx && <> · <button onClick={() => setOnlyCustomer(true)} style={linkBtn}>רק {ctx.customerName}</button></>}
          </p>}

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <input placeholder="חיפוש (לקוח או מספר אסמכתא)…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setOnlyCustomer(false); load(); } }}
          disabled={!!(ctx && onlyCustomer)} className="input" style={{ maxWidth: 280, opacity: ctx && onlyCustomer ? 0.5 : 1 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="select" style={{ maxWidth: 190 }}>
          <option value="all">כל הסטטוסים</option>
          <option value="open">ממתין (טרם הופק)</option>
          <option value="produced">הופק</option>
        </select>
        <button onClick={load} className="btn btn-primary">רענון</button>
      </div>

      {err && <p className="chip chip-warn">{err}</p>}
      {loading ? <p>טוען…</p> : (
        <div className="table-wrap">
          <table className="data-table" style={{ minWidth: 780 }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>#</th>
                {!(ctx && onlyCustomer) && <th>לקוח</th>}
                <th>סוג</th><th>ת.ערך</th><th>אסמכתא</th><th>סך בתנועה</th><th>סטטוס</th><th>הורדה</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && !err && <tr><td colSpan={colCount} style={{ padding: 16, color: "var(--ink-muted)" }}>אין מסמכים להצגה.</td></tr>}
              {visible.map((d) => {
                const open = expanded.has(d.stockId);
                const dd = detail[d.stockId];
                return (
                  <Fragment key={d.stockId}>
                    <tr>
                      <td>
                        <button onClick={() => toggleExpand(d.stockId)} title="הצג שורות" className="btn btn-sm" style={{ padding: "2px 9px", fontWeight: 700 }}>
                          {loadingId === d.stockId ? "…" : open ? "−" : "+"}
                        </button>
                      </td>
                      <td style={{ color: "var(--ink-muted)" }}>{d.stockId}</td>
                      {!(ctx && onlyCustomer) && <td>{d.customerName} <span style={{ color: "var(--ink-muted)" }}>({d.accountKey})</span></td>}
                      <td>{d.docTypeName}</td>
                      <td>{d.date ? new Date(d.date).toLocaleDateString("he-IL") : ""}</td>
                      <td>{d.docNumber ? d.docNumber : <span style={{ color: "var(--ink-muted)" }}>—</span>}</td>
                      <td>{d.total != null ? `${d.total.toFixed(2)} ₪` : ""}</td>
                      <td>{d.status === "produced" ? <span className="chip chip-ok">הופק</span> : <span className="chip chip-info">ממתין</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button title="הורדת PDF" onClick={() => doExport(d.stockId, "pdf")} disabled={busyExport === d.stockId} className="btn btn-sm">📄</button>
                        <button title="הורדת Excel" onClick={() => doExport(d.stockId, "excel")} disabled={busyExport === d.stockId} className="btn btn-sm" style={{ marginInlineStart: 6 }}>📊</button>
                      </td>
                    </tr>
                    {open && dd && (
                      <tr>
                        <td colSpan={colCount} style={{ background: "var(--surface-muted)", padding: 12 }}>
                          {d.producedDocs && d.producedDocs.length > 0 && (
                            <div style={{ fontSize: 13, marginBottom: 8 }}>הופק: {d.producedDocs.map((p) => `${p.docTypeName} #${p.docNumber}`).join(" · ")}</div>
                          )}
                          {(dd.picked || dd.pickNotes) && (
                            <div style={{ fontSize: 13, marginBottom: 8, color: "var(--ink-muted)" }}>
                              {dd.picked && <span className="chip chip-ok" style={{ marginInlineEnd: 8 }}>לוקט{dd.picker ? ` ע״י ${dd.picker}` : ""}</span>}
                              {dd.pickNotes && <>הערות ליקוט: {dd.pickNotes}</>}
                            </div>
                          )}
                          <table className="data-table" style={{ background: "var(--surface)", borderRadius: 8 }}>
                            <thead><tr><th style={{ width: 54 }}>תמונה</th><th>מק״ט</th><th>תיאור</th><th>כמות</th><th>מחיר יח׳</th><th>סה״כ</th></tr></thead>
                            <tbody>
                              {(dd.lines ?? []).filter((l) => !l.isShipping).map((l, i) => (
                                <tr key={i}>
                                  <td>{images[l.itemkey] ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={images[l.itemkey]} alt="" style={{ width: 44, height: 44, objectFit: "contain" }} />
                                  ) : (
                                    <div style={{ width: 44, height: 44, background: "var(--surface-muted)", borderRadius: 6 }} />
                                  )}</td>
                                  <td style={{ fontWeight: 600 }}>{l.itemkey}{l.size ? <span className="chip chip-info" style={{ marginInlineStart: 6 }}>מידה {l.size}</span> : null}</td>
                                  <td>{l.name}</td>
                                  <td>{l.qty}{l.unit ? ` ${l.unit}` : ""}</td>
                                  <td>{l.unitPrice != null ? `${l.unitPrice.toFixed(2)} ₪` : ""}</td>
                                  <td>{l.lineTotal != null ? `${l.lineTotal.toFixed(2)} ₪` : ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const linkBtn = {
  background: "none", border: 0, color: "var(--brand)", cursor: "pointer", textDecoration: "underline", fontSize: 13, padding: 0,
} as const;
