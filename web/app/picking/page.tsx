"use client";
import { useCallback, useEffect, useState } from "react";
import { bridge, type Document } from "../../lib/bridge";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { managerOrAbove } from "../../lib/roles";

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
      setRows(await bridge.pickingQueue(0, { state, q: q.trim() || undefined }));
    } catch {
      setErr("הגשר עדיין לא מחובר — תור הליקוט ייטען כשהגשר יעלה.");
      setRows([]);
    } finally { setLoading(false); }
  }, [allowed, state, q]);

  useEffect(() => { void load(); }, [allowed, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (allowed === false) return <p style={{ color: "#a60" }}>הדף מיועד למלקטים ולמנהלים בלבד.</p>;

  return (
    <>
      <h1>ליקוט</h1>
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <button onClick={() => setState("waiting")} style={tab(state === "waiting")}>ממתינות לליקוט</button>
        <button onClick={() => setState("picked")} style={tab(state === "picked")}>לוקטו (ממתינות להפקה)</button>
        <input placeholder="חיפוש (לקוח/מספר)…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", minWidth: 200 }} />
        <button onClick={load} style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>רענון</button>
      </div>

      {err && <p style={{ color: "#a60", fontSize: 13 }}>{err}</p>}
      {loading ? <p>טוען…</p> : (
        <div className="table-wrap">
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr style={{ textAlign: "right", borderBottom: "2px solid #1e2a78" }}>
                <th style={{ padding: 8 }}>הזמנה</th><th>לקוח</th><th>תאריך</th><th>סכום</th>
                {state === "picked" && <th>לוקט ע״י</th>}<th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !err && <tr><td colSpan={6} style={{ padding: 16, color: "#888" }}>אין הזמנות {state === "waiting" ? "ממתינות לליקוט" : "שלוקטו"}.</td></tr>}
              {rows.map((d) => (
                <tr key={d.stockId} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{d.docTypeName} {d.docNumber ? `#${d.docNumber}` : `(זמני ${d.stockId})`}</td>
                  <td>{d.customerName} <span style={{ color: "#888" }}>({d.accountKey})</span></td>
                  <td>{d.date ? new Date(d.date).toLocaleDateString("he-IL") : ""}</td>
                  <td>{d.total != null ? `${d.total.toFixed(2)} ₪` : ""}</td>
                  {state === "picked" && <td>{d.picker ?? "—"}</td>}
                  <td>
                    {state === "waiting"
                      ? <a href={`/picking/${d.stockId}`} style={{ color: "#1e2a78", fontWeight: 700 }}>ליקוט ←</a>
                      : managerOrAbove(role)
                        ? <a href={`/picking/${d.stockId}`} style={{ color: "#1e2a78", fontWeight: 700 }}>פתח מחדש ←</a>
                        : <span style={{ color: "#888" }}>לוקט</span>}
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

const tab = (active: boolean) => ({
  background: active ? "#1e2a78" : "#fff", color: active ? "#fff" : "#1e2a78",
  border: "1px solid #1e2a78", borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 14,
});
