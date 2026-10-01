"use client";
import { useState } from "react";
import { useCart } from "../../lib/useCart";
import { useOrderContext } from "../../lib/useOrderContext";

export default function CartPage() {
  const { lines, setQty, remove, clear } = useCart();
  const { ctx } = useOrderContext();
  const [sent, setSent] = useState<string>("");

  if (!ctx) return <p>יש לבחור לקוח לפני הזמנה. <a href="/customer">← בחירת לקוח</a></p>;
  if (!lines.length) return <p>הסל ריק. <a href="/catalog">← לקטלוג</a></p>;

  // Builds the POST /orders payload (bridge). Wired to the live bridge once NEXT_PUBLIC_BRIDGE_URL is set.
  const submit = () => {
    const payload = {
      accountKey: ctx.accountKey,
      orderKind: ctx.orderKind,
      lines: lines.map((l) => ({ itemkey: l.itemkey, qty: l.qty, unit: l.unit, price: l.unitPrice })),
    };
    setSent(JSON.stringify(payload, null, 2));
    // TODO: await bridge.createOrder(payload); then clear() and show the order number (Stock.ID).
  };

  return (
    <>
      <h1>סל הזמנה</h1>
      <p style={{ color: "#555" }}>ללקוח: <b>{ctx.customerName}</b> ({ctx.accountKey}) · {ctx.orderKind === "picking" ? "לליקוט" : "עתידי"}</p>
      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 700 }}>
        <thead>
          <tr style={{ textAlign: "right", borderBottom: "2px solid #1e2a78" }}>
            <th style={{ padding: 8 }}>פריט</th><th>יחידה</th><th>כמות</th><th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.itemkey + l.unit} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{l.title}<div style={{ fontSize: 11, color: "#888" }}>{l.itemkey}</div></td>
              <td>{l.unit === "carton" ? "קרטון" : "חבילה"}</td>
              <td>
                <input type="number" min={1} value={l.qty}
                  onChange={(e) => setQty(l.itemkey, l.unit, Number(e.target.value))}
                  style={{ width: 56 }} />
              </td>
              <td><button onClick={() => remove(l.itemkey, l.unit)} style={{ color: "#b00", border: 0, background: "none", cursor: "pointer" }}>הסר</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button onClick={submit} style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>שלח הזמנה</button>
        <button onClick={clear} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "10px 18px", cursor: "pointer", background: "#fff" }}>רוקן סל</button>
      </div>
      {sent && (
        <pre style={{ marginTop: 16, background: "#f5f5f5", padding: 12, borderRadius: 8, direction: "ltr", fontSize: 12 }}>
          {"// payload ל-POST /orders (יישלח לגשר כשה-URL מוגדר):\n" + sent}
        </pre>
      )}
    </>
  );
}
