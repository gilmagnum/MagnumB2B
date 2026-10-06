"use client";
import type { CSSProperties } from "react";
import { useCart, type Unit } from "../../lib/useCart";
import { useOrderContext } from "../../lib/useOrderContext";

export default function AddToCart({
  itemkey, title, perCarton, perBundle, price, only, stock, big,
}: {
  itemkey: string; title: string;
  perCarton?: number | null; perBundle?: number | null; price?: number | null;
  only?: Unit; // restrict to a single order unit (e.g. carton only, for ruler cards in the grid)
  stock?: number | null;
  big?: boolean; // larger, centered add control (e.g. carton-only inside the product page)
}) {
  const { add, decrement, qtyOf } = useCart();
  const { ctx } = useOrderContext();

  const units: Unit[] = [];
  if ((perCarton ?? 0) > 0 && only !== "bundle") units.push("carton");
  if ((perBundle ?? 0) > 0 && only !== "carton") units.push("bundle");
  if (!units.length) return <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>לא פתוח להזמנה</span>;

  // No customer selected → ordering is blocked (choosing a customer is like signing in).
  if (!ctx) {
    return (
      <a href="/customer" className="btn btn-sm" style={{ marginTop: 10, color: "var(--ink-muted)" }}>בחר לקוח להזמנה</a>
    );
  }
  // Customer chosen but no order kind yet → must start the order first.
  if (!ctx.orderKind) {
    return (
      <a href="/start" className="btn btn-sm" style={{ marginTop: 10, color: "var(--ink-muted)" }}>התחל הזמנה (בחר סוג)</a>
    );
  }

  const label = (u: Unit) => (u === "carton" ? "קרטון" : "חבילה");
  const packOf = (u: Unit) => (u === "carton" ? (perCarton ?? undefined) : (perBundle ?? undefined)) ?? undefined;
  const inc = (u: Unit) => add({ itemkey, title, qty: 1, unit: u, unitPrice: price ?? undefined, packSize: packOf(u), stock: stock ?? undefined });
  const dec = (u: Unit) => decrement(itemkey, u);

  // + is on the RIGHT (RTL): the increment button is the first flex child.
  // The stepper and the "+ הוספת" button share the SAME width (they fill the
  // unit slot), so switching between them never widens the card — and the qty
  // reads centre, with room for three digits. box-sizing:border-box is global.
  const bs = big ? 22 : 16;
  const stepBtn: CSSProperties = { flex: "0 0 auto", padding: "2px 10px", border: 0, background: "transparent", color: "var(--brand)", fontSize: bs };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, width: "100%", maxWidth: big ? 300 : undefined, marginInline: big ? "auto" : undefined }}>
      {units.map((u) => {
        const qty = qtyOf(itemkey, u);
        return qty > 0 ? (
          <div key={u} style={{ display: "flex", alignItems: "center", width: "100%", border: "1px solid var(--brand)", borderRadius: "var(--radius-sm)", padding: big ? "4px 6px" : "2px 4px" }}>
            <button onClick={() => inc(u)} className="btn btn-sm" style={stepBtn} aria-label={`הוסף ${label(u)}`}>+</button>
            <span style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: big ? 15 : 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{qty} {label(u)}</span>
            <button onClick={() => dec(u)} className="btn btn-sm" style={stepBtn} aria-label={`הפחת ${label(u)}`}>−</button>
          </div>
        ) : (
          <button key={u} onClick={() => inc(u)} className={`btn btn-primary${big ? "" : " btn-sm"}`} style={{ width: "100%", ...(big ? { padding: "12px 20px", fontSize: 16 } : {}) }}>+ הוספת {label(u)}</button>
        );
      })}
    </div>
  );
}
