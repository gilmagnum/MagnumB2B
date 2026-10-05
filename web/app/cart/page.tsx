"use client";
import { useEffect, useState } from "react";
import { useCart } from "../../lib/useCart";
import { useOrderContext } from "../../lib/useOrderContext";
import { bridge } from "../../lib/bridge";
import { fetchImages } from "../../lib/images";

export default function CartPage() {
  const { lines, setQty, remove, clear } = useCart();
  const { ctx } = useOrderContext();
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  // Final per-unit price for each line, resolved for the entered customer.
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [priceErr, setPriceErr] = useState(false);
  const [images, setImages] = useState<Record<string, string>>({});

  // Thumbnails for the cart lines.
  useEffect(() => {
    if (!lines.length) return;
    fetchImages(lines.map((l) => l.itemkey)).then(setImages).catch(() => {});
  }, [lines]);

  // Resolve the customer's final price for each line (display-only; Hashavshevet
  // recomputes at production). Keyed by itemkey|unit.
  useEffect(() => {
    if (!ctx || !lines.length) { setPrices({}); return; }
    let cancelled = false;
    (async () => {
      setPriceErr(false);
      const entries = await Promise.all(lines.map(async (l) => {
        try {
          const unitsQty = l.qty * (l.packSize ?? 1); // price tiers are by unit quantity
          const r = await bridge.price(ctx.accountKey, l.itemkey, unitsQty);
          return [l.itemkey + l.unit, r.unitPrice] as const;
        } catch {
          return [l.itemkey + l.unit, NaN] as const;
        }
      }));
      if (cancelled) return;
      const map: Record<string, number> = {};
      let anyErr = false;
      for (const [k, v] of entries) { if (Number.isNaN(v)) anyErr = true; else map[k] = v; }
      setPrices(map); setPriceErr(anyErr);
    })();
    return () => { cancelled = true; };
  }, [ctx, lines]);

  if (!ctx) return <p>יש לבחור לקוח לפני הזמנה. <a href="/customer">← בחירת לקוח</a></p>;
  if (!lines.length) return (
    <>
      {msg && <p style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: msg.includes("✓") ? "#e8f7ee" : "#fdecea" }}>{msg}</p>}
      <p>הסל ריק. <a href="/catalog">← לקטלוג</a></p>
    </>
  );

  const priceOf = (itemkey: string, unit: string, fallback?: number) => {
    const p = prices[itemkey + unit];
    return p != null ? p : fallback;
  };
  const unitsOf = (l: typeof lines[number]) => l.qty * (l.packSize ?? 1);
  const total = lines.reduce((s, l) => {
    const p = priceOf(l.itemkey, l.unit, l.unitPrice);
    return s + (p != null ? p * unitsOf(l) : 0);
  }, 0);

  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await bridge.createOrder({
        accountKey: ctx.accountKey,
        orderKind: ctx.orderKind,
        lines: lines.map((l) => ({ itemkey: l.itemkey, qty: l.qty, unit: l.unit, price: priceOf(l.itemkey, l.unit, l.unitPrice), size: l.sizeLabel || undefined })),
      });
      setMsg(`ההזמנה נשלחה ✓ מספר הזמנה: ${res.stockId}`);
      // Fire a push event (new order) — best-effort.
      fetch("/api/push/event", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: ctx.orderKind === "picking" ? "order_picking" : "order_future",
          body: `${ctx.customerName} · הזמנה ${res.stockId}`, url: "/picking",
        }),
      }).catch(() => {});
      clear();
    } catch (e) {
      setMsg("שגיאה בשליחה (ייתכן שהגשר עדיין לא מחובר): " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>סל הזמנה</h1>
      <p style={{ color: "#555" }}>ללקוח: <b>{ctx.customerName}</b> ({ctx.accountKey}) · {ctx.orderKind === "picking" ? "לליקוט" : "עתידי"}</p>
      {priceErr && <p style={{ fontSize: 13, color: "#a60" }}>חלק מהמחירים לא נטענו מהגשר — מוצג מחיר מחירון כללי.</p>}
      <div className="table-wrap">
      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 760, minWidth: 560 }}>
        <thead>
          <tr style={{ textAlign: "right", borderBottom: "2px solid #1e2a78" }}>
            <th style={{ padding: 8 }}>פריט</th><th>יחידה</th><th>כמות</th><th>יח׳</th><th>מחיר יח׳</th><th>סה״כ שורה</th><th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const p = priceOf(l.itemkey, l.unit, l.unitPrice);
            return (
              <tr key={l.itemkey + l.unit + (l.sizeLabel ?? "")} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {images[l.itemkey] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={images[l.itemkey]} alt="" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 6, background: "var(--surface-muted)" }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--surface-muted)" }} />
                    )}
                    <div>{l.title}{l.sizeLabel ? <span className="chip" style={{ marginInlineStart: 6, background: "var(--brand-soft)" }}>מידה {l.sizeLabel}</span> : null}<div style={{ fontSize: 11, color: "var(--ink-muted)" }}>{l.itemkey}</div></div>
                  </div>
                </td>
                <td>{l.unit === "carton" ? "קרטון" : "חבילה"}{l.packSize ? <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>{l.packSize} יח׳</div> : null}</td>
                <td>
                  <input type="number" min={1} value={l.qty}
                    onChange={(e) => setQty(l.itemkey, l.unit, Number(e.target.value), l.sizeLabel)}
                    style={{ width: 56 }} />
                </td>
                <td style={{ fontWeight: 600 }}>{unitsOf(l).toLocaleString("he-IL")}
                  {l.stock != null && unitsOf(l) > l.stock && <div style={{ fontSize: 11, color: "var(--danger)", fontWeight: 400 }}>מלאי {l.stock} — חוסר</div>}
                </td>
                <td>{p != null ? `${p.toFixed(2)} ₪` : "—"}</td>
                <td>{p != null ? `${(p * unitsOf(l)).toFixed(2)} ₪` : "—"}</td>
                <td><button onClick={() => remove(l.itemkey, l.unit, l.sizeLabel)} style={{ color: "#b00", border: 0, background: "none", cursor: "pointer" }}>הסר</button></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #1e2a78", fontWeight: 700 }}>
            <td style={{ padding: 8 }} colSpan={5}>סה״כ</td>
            <td>{total.toFixed(2)} ₪</td><td></td>
          </tr>
        </tfoot>
      </table>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button onClick={submit} disabled={busy} style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "שולח…" : "שלח הזמנה"}</button>
        <button onClick={clear} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "10px 18px", cursor: "pointer", background: "#fff" }}>רוקן סל</button>
      </div>
      {msg && <p style={{ marginTop: 16, padding: 12, borderRadius: 8, background: msg.includes("✓") ? "#e8f7ee" : "#fdecea" }}>{msg}</p>}
    </>
  );
}
