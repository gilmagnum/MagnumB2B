"use client";
import { useCallback, useEffect, useState } from "react";
import { bridge, type Document } from "../../lib/bridge";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { exportExcel, exportPdf } from "../../lib/docExport";
import { useOrderContext } from "../../lib/useOrderContext";

// Documents screen. Admin sees ALL documents; an agent sees only their customers'.
// When a customer is "entered" (order context), the list auto-filters to them.
// A row = the order (הזמנה/הזמנת סוכן) + the document(s) produced from it.
export default function DocumentsPage() {
  const { ctx } = useOrderContext();
  const [role, setRole] = useState<string>("");
  const [agentId, setAgentId] = useState<number | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [onlyCustomer, setOnlyCustomer] = useState(true); // filter to the entered customer
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyExport, setBusyExport] = useState<number | null>(null);

  const doExport = async (stockId: number, kind: "pdf" | "excel") => {
    setBusyExport(stockId);
    try {
      const detail = await bridge.document(stockId);
      if (kind === "pdf") exportPdf(detail); else exportExcel(detail);
    } catch {
      alert("לא ניתן לטעון את פרטי המסמך (ייתכן שהגשר עדיין לא מחובר).");
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
      setAgentId(prof?.role === "admin" ? 0 : (prof?.agent_id ?? null));
    })();
  }, []);

  const load = useCallback(async () => {
    if (agentId == null) { setLoading(false); if (role && role !== "admin") setErr("למשתמש לא משויך קוד סוכן"); return; }
    setLoading(true); setErr("");
    // Inside a customer: filter to their accountKey unless the user cleared it.
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

  const hasDelivery = (d: Document) => d.documentId === 4 || (d.producedDocs ?? []).some((p) => p.documentId === 4);

  return (
    <>
      <h1>היסטוריית מסמכים</h1>
      {ctx && onlyCustomer
        ? <p style={{ color: "#1e2a78", fontSize: 14 }}>מסמכי <b>{ctx.customerName}</b> ({ctx.accountKey}) · <button onClick={() => setOnlyCustomer(false)} style={linkBtn}>הצג את כל המסמכים</button></p>
        : <p style={{ color: "#777", fontSize: 13 }}>
            {role === "admin" ? "מציג את כל המסמכים" : "מציג את המסמכים של הלקוחות שלך"}
            {ctx && <> · <button onClick={() => setOnlyCustomer(true)} style={linkBtn}>רק {ctx.customerName}</button></>}
          </p>}

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <input placeholder="חיפוש (לקוח או מספר אסמכתא)…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setOnlyCustomer(false); load(); } }}
          disabled={!!(ctx && onlyCustomer)}
          style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", minWidth: 260, opacity: ctx && onlyCustomer ? 0.5 : 1 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}>
          <option value="all">כל הסטטוסים</option>
          <option value="open">ממתין (טרם הופק)</option>
          <option value="produced">הופק</option>
        </select>
        <button onClick={load} style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>רענון</button>
      </div>

      {err && <p style={{ color: "#a60", fontSize: 13 }}>{err}</p>}
      {loading ? <p>טוען…</p> : (
        <div className="table-wrap">
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820 }}>
            <thead>
              <tr style={{ textAlign: "right", borderBottom: "2px solid #1e2a78", color: "#444" }}>
                <th style={{ padding: 8 }}>#</th>
                {!(ctx && onlyCustomer) && <th>לקוח</th>}
                <th>סוג</th><th>ת.ערך</th><th>אסמכתא</th><th>סך בתנועה</th><th>סטטוס</th><th>הופק</th><th>PDF/Excel</th><th>שילוח</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && !err && <tr><td colSpan={10} style={{ padding: 16, color: "#888" }}>אין מסמכים להצגה.</td></tr>}
              {docs.map((d) => (
                <tr key={d.stockId} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                  <td style={{ padding: 8, color: "#888" }}>{d.stockId}</td>
                  {!(ctx && onlyCustomer) && <td>{d.customerName} <span style={{ color: "#888" }}>({d.accountKey})</span></td>}
                  <td>{d.docTypeName}</td>
                  <td>{d.date ? new Date(d.date).toLocaleDateString("he-IL") : ""}</td>
                  <td>{d.docNumber ? d.docNumber : <span style={{ color: "#bbb" }}>—</span>}</td>
                  <td>{d.total != null ? `${d.total.toFixed(2)} ₪` : ""}</td>
                  <td>{d.status === "produced"
                    ? <span style={{ background: "#e8f7ee", color: "#0a7", borderRadius: 6, padding: "2px 8px", fontSize: 13 }}>הופק</span>
                    : <span style={{ background: "#eef", color: "#55e", borderRadius: 6, padding: "2px 8px", fontSize: 13 }}>ממתין</span>}</td>
                  <td>
                    {(d.producedDocs ?? []).length === 0 ? <span style={{ color: "#bbb" }}>—</span> : (
                      <ul style={{ margin: 0, paddingInlineStart: 16 }}>
                        {d.producedDocs!.map((p, i) => (
                          <li key={i} style={{ fontSize: 13 }}>{p.docTypeName} #{p.docNumber}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button title="הורדת PDF" onClick={() => doExport(d.stockId, "pdf")} disabled={busyExport === d.stockId} style={iconBtn}>📄</button>
                    <button title="הורדת Excel" onClick={() => doExport(d.stockId, "excel")} disabled={busyExport === d.stockId} style={{ ...iconBtn, marginInlineStart: 6 }}>📊</button>
                  </td>
                  <td>{hasDelivery(d)
                    ? <span title="מעקב משלוח (בקרוב)" style={{ cursor: "default", fontSize: 18 }}>📦</span>
                    : <span style={{ color: "#ddd" }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const iconBtn = {
  background: "#fff", border: "1px solid #ccc", borderRadius: 6,
  padding: "4px 8px", cursor: "pointer", fontSize: 14,
} as const;
const linkBtn = {
  background: "none", border: 0, color: "#1e2a78", cursor: "pointer", textDecoration: "underline", fontSize: 13, padding: 0,
} as const;
