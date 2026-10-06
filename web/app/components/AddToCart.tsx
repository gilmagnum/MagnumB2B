"use client";
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
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, justifyContent: big ? "center" : undefined }}>
      {units.map((u) => {
        const qty = qtyOf(itemkey, u);
        const bs = big ? 22 : 16;
        return qty > 0 ? (
          <div key={u} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--brand)", borderRadius: "var(--radius-sm)", padding: big ? "4px 8px" : "2px 4px" }}>
            <button onClick={() => inc(u)} className="btn btn-sm" style={{ padding: "2px 10px", border: 0, background: "transparent", color: "var(--brand)", fontSize: bs }}>+</button>
            <span style={{ minWidth: big ? 60 : 48, textAlign: "center", fontSize: big ? 15 : 13, fontWeight: 600 }}>{qty} {label(u)}</span>
            <button onClick={() => dec(u)} className="btn btn-sm" style={{ padding: "2px 10px", border: 0, background: "transparent", color: "var(--brand)", fontSize: bs }}>−</button>
          </div>
        ) : (
          <button key={u} onClick={() => inc(u)} className={`btn btn-primary${big ? "" : " btn-sm"}`} style={big ? { padding: "12px 26px", fontSize: 16 } : undefined}>+ הוספת {label(u)}</button>
        );
      })}
    </div>
  );
}
