"use client";
import { use, useEffect, useMemo, useState } from "react";
import { bridge, type DocumentDetail, type DocLine } from "../../../lib/bridge";

// Per-order picking screen. The picker enters the picked quantity per line;
// the screen flags shortages (whole item missing vs partial). Writing back to
// Hashavshevet is DEFERRED until Gil examines a live pick — "finish" is disabled.
export default function PickOrderPage({ params }: { params: Promise<{ stockId: string }> }) {
  const { stockId } = use(params);
  const id = Number(stockId);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({});

  useEffect(() => {
    bridge.document(id)
      .then((d) => {
        setDoc(d);
        // default picked = ordered qty (picker reduces where short)
        const init: Record<string, number> = {};
        for (const l of d.lines ?? []) if (!l.isShipping) init[l.itemkey] = l.qty;
        setPicked(init);
      })
      .catch(() => setErr("הגשר עדיין לא מחובר — פרטי ההזמנה ייטענו כשהגשר יעלה."));
  }, [id]);

  // Pick in SKU order (no warehouse bins in Hashavshevet).
  const lines = useMemo(
    () => (doc?.lines ?? []).filter((l) => !l.isShipping).sort((a, b) => a.itemkey.localeCompare(b.itemkey)),
    [doc],
  );

  const shortageOf = (l: DocLine): "none" | "full" | "partial" => {
    const p = picked[l.itemkey] ?? 0;
    if (p >= l.qty) return "none";
    return p <= 0 ? "full" : "partial";
  };
  const shortages = lines.filter((l) => shortageOf(l) !== "none");

  if (err) return <p style={{ color: "#a60" }}>{err} <a href="/picking">← לתור</a></p>;
  if (!doc) return <p>טוען…</p>;

  return (
    <>
      <p><a href="/picking" style={{ color: "#1e2a78" }}>← תור הליקוט</a></p>
      <h1>ליקוט: {doc.docTypeName} {doc.docNumber ? `#${doc.docNumber}` : `(זמני ${doc.stockId})`}</h1>
      <p style={{ color: "#555" }}>לקוח: <b>{doc.customerName}</b> ({doc.accountKey}){doc.customer?.address ? ` · ${doc.customer.address}` : ""}</p>

      <div className="table-wrap">
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "2px solid #1e2a78" }}>
              <th style={{ padding: 8 }}>מק״ט</th><th>תיאור</th><th>הוזמן</th><th>לוקט</th><th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const sh = shortageOf(l);
              return (
                <tr key={l.itemkey} style={{ borderBottom: "1px solid #eee", background: sh === "full" ? "#fdecea" : sh === "partial" ? "#fff6e5" : undefined }}>
                  <td style={{ padding: 8, fontWeight: 700 }}>{l.itemkey}</td>
                  <td>{l.name}</td>
                  <td>{l.qty}{l.unit ? ` ${l.unit}` : ""}</td>
                  <td>
                    <input type="number" min={0} max={l.qty} value={picked[l.itemkey] ?? 0}
                      onChange={(e) => setPicked({ ...picked, [l.itemkey]: Math.max(0, Math.min(l.qty, Number(e.target.value))) })}
                      style={{ width: 64 }} />
                  </td>
                  <td>
                    {sh === "none" && <span style={{ color: "#0a7" }}>✓ מלא</span>}
                    {sh === "partial" && <span style={{ color: "#a60" }}>חוסר כמותי ({l.qty - (picked[l.itemkey] ?? 0)} חסר)</span>}
                    {sh === "full" && <span style={{ color: "#b00" }}>חסר לגמרי</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#f7f7f7" }}>
        <b>סיכום:</b> {lines.length} שורות · {shortages.length ? `${shortages.length} עם חוסר` : "ללא חוסרים"}
        {shortages.length > 0 && (
          <ul style={{ margin: "6px 0 0", fontSize: 13 }}>
            {shortages.map((l) => (
              <li key={l.itemkey}>{l.itemkey} — {shortageOf(l) === "full" ? "חסר לגמרי" : `חסרות ${l.qty - (picked[l.itemkey] ?? 0)} מתוך ${l.qty}`}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <button disabled title="יופעל לאחר בדיקת ליקוט פעיל מול חשבשבת"
          style={{ background: "#ccc", color: "#666", border: 0, borderRadius: 8, padding: "10px 18px", cursor: "not-allowed" }}>
          סיום ליקוט (בקרוב)
        </button>
        <p style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
          הסימון בחשבשבת (לוקט ע״י…) ורישום החוסרים יופעלו לאחר בדיקת ליקוט פעיל — כדי לקבוע נכון את ההתנהגות בין
          "חסר לגמרי" ל"חוסר כמותי".
        </p>
      </div>
    </>
  );
}
