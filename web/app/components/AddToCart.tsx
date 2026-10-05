"use client";
import { useCart, type Unit } from "../../lib/useCart";
import { useOrderContext } from "../../lib/useOrderContext";

export default function AddToCart({
  itemkey, title, perCarton, perBundle, price, only, stock,
}: {
  itemkey: string; title: string;
  perCarton?: number | null; perBundle?: number | null; price?: number | null;
  only?: Unit; // restrict to a single order unit (e.g. carton only, for ruler cards in the grid)
  stock?: number | null;
}) {
  const { add, setQty, remove, qtyOf } = useCart();
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

  const label = (u: Unit) => (u === "carton" ? "קרטון" : "חבילה");
  const packOf = (u: Unit) => (u === "carton" ? (perCarton ?? undefined) : (perBundle ?? undefined)) ?? undefined;
  const inc = (u: Unit) => add({ itemkey, title, qty: 1, unit: u, unitPrice: price ?? undefined, packSize: packOf(u), stock: stock ?? undefined });
  const dec = (u: Unit) => {
    const cur = qtyOf(itemkey, u);
    if (cur <= 1) remove(itemkey, u);
    else setQty(itemkey, u, cur - 1);
  };

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
      {units.map((u) => {
        const qty = qtyOf(itemkey, u);
        return qty > 0 ? (
          <div key={u} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--brand)", borderRadius: "var(--radius-sm)", padding: "2px 4px" }}>
            <button onClick={() => dec(u)} className="btn btn-sm" style={{ padding: "2px 9px", border: 0, background: "transparent", color: "var(--brand)", fontSize: 16 }}>−</button>
            <span style={{ minWidth: 48, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{qty} {label(u)}</span>
            <button onClick={() => inc(u)} className="btn btn-sm" style={{ padding: "2px 9px", border: 0, background: "transparent", color: "var(--brand)", fontSize: 16 }}>+</button>
          </div>
        ) : (
          <button key={u} onClick={() => inc(u)} className="btn btn-primary btn-sm">+ {label(u)}</button>
        );
      })}
    </div>
  );
}
