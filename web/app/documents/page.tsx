"use client";
import { useCallback, useEffect, useState } from "react";
import { bridge, type Document } from "../../lib/bridge";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { exportExcel, exportPdf } from "../../lib/docExport";

// Documents screen. Admin sees ALL documents; an agent sees only their customers'.
// A row = the order (הזמנה/הזמנת סוכן) + the document(s) produced from it.
export default function DocumentsPage() {
  const [role, setRole] = useState<string>("");
  const [agentId, setAgentId] = useState<number | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
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
      // Admin => agent 0 (all). Agent => their agent_id.
      setAgentId(prof?.role === "admin" ? 0 : (prof?.agent_id ?? null));
    })();
  }, []);

  const load = useCallback(async () => {
    if (agentId == null) { setLoading(false); if (role && role !== "admin") setErr("למשתמש לא משויך קוד סוכן"); return; }
    setLoading(true); setErr("");
    try {
      setDocs(await bridge.documents(agentId, { status: status === "all" ? undefined : status, q: q.trim() || undefined, limit: 100 }));
    } catch {
      setErr("הגשר עדיין לא מחובר — רשימת המסמכים תיטען כשהגשר יעלה.");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, role, status, q]);

  useEffect(() => { void load(); }, [agentId, status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <h1>מסמכים</h1>
      <p style={{ color: "#777", fontSize: 13 }}>{role === "admin" ? "מציג את כל המסמכים" : "מציג את המסמכים של הלקוחות שלך"}</p>

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <input placeholder="חיפוש (לקוח או מספר מסמך)…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", minWidth: 260 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}>
          <option value="all">הכל</option>
          <option value="open">פתוחות (טרם הופקו)</option>
          <option value="produced">הופקו</option>
        </select>
        <button onClick={load} style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>רענון</button>
      </div>

      {err && <p style={{ color: "#a60", fontSize: 13 }}>{err}</p>}
      {loading ? <p>טוען…</p> : (
        <div className="table-wrap">
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "2px solid #1e2a78" }}>
              <th style={{ padding: 8 }}>מסמך</th><th>לקוח</th><th>תאריך</th><th>סכום</th><th>סטטוס</th><th>הופק</th><th>הורדה</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && !err && <tr><td colSpan={7} style={{ padding: 16, color: "#888" }}>אין מסמכים להצגה.</td></tr>}
            {docs.map((d) => (
              <tr key={d.stockId} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                <td style={{ padding: 8 }}>
                  {d.docTypeName} {d.docNumber ? `#${d.docNumber}` : <span style={{ color: "#888" }}>(זמני {d.stockId})</span>}
                </td>
                <td>{d.customerName} <span style={{ color: "#888" }}>({d.accountKey})</span></td>
                <td>{d.date ? new Date(d.date).toLocaleDateString("he-IL") : ""}</td>
                <td>{d.total != null ? `${d.total.toFixed(2)} ₪` : ""}</td>
                <td>{d.status === "produced"
                  ? <span style={{ color: "#0a7" }}>הופק</span>
                  : <span style={{ color: "#a60" }}>פתוח</span>}</td>
                <td>
                  {(d.producedDocs ?? []).length === 0 ? <span style={{ color: "#bbb" }}>—</span> : (
                    <ul style={{ margin: 0, paddingInlineStart: 16 }}>
                      {d.producedDocs!.map((p, i) => (
                        <li key={i} style={{ fontSize: 13 }}>
                          {p.docTypeName} #{p.docNumber}{p.total != null ? ` · ${p.total.toFixed(2)} ₪` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button title="הורדת PDF" onClick={() => doExport(d.stockId, "pdf")} disabled={busyExport === d.stockId}
                    style={iconBtn}>📄 PDF</button>
                  <button title="הורדת Excel" onClick={() => doExport(d.stockId, "excel")} disabled={busyExport === d.stockId}
                    style={{ ...iconBtn, marginInlineStart: 6 }}>📊 Excel</button>
                </td>
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
  padding: "4px 8px", cursor: "pointer", fontSize: 12,
} as const;
