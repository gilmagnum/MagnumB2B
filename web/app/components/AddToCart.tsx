"use client";
import { useState } from "react";
import { useCart, type Unit } from "../../lib/useCart";
import { useOrderContext } from "../../lib/useOrderContext";

export default function AddToCart({
  itemkey, title, perCarton, perBundle, price,
}: {
  itemkey: string; title: string;
  perCarton?: number | null; perBundle?: number | null; price?: number | null;
}) {
  const { add, setQty, remove, qtyOf } = useCart();
  const { ctx } = useOrderContext();
  const [err, setErr] = useState(false);

  const units: Unit[] = [];
  if ((perCarton ?? 0) > 0) units.push("carton");
  if ((perBundle ?? 0) > 0) units.push("bundle");
  if (!units.length) return <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>לא פתוח להזמנה</span>;

  const label = (u: Unit) => (u === "carton" ? "קרטון" : "חבילה");

  const inc = (u: Unit) => {
    if (!ctx) { setErr(true); setTimeout(() => setErr(false), 2500); return; }
    add({ itemkey, title, qty: 1, unit: u, unitPrice: price ?? undefined });
  };
  const dec = (u: Unit) => {
    const cur = qtyOf(itemkey, u);
    if (cur <= 1) remove(itemkey, u);
    else setQty(itemkey, u, cur - 1);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
      {err && (
        <div className="chip chip-danger" style={{ marginTop: 6 }}>
          יש לבחור לקוח — <a href="/customer" style={{ color: "inherit", textDecoration: "underline" }}>בחירת לקוח</a>
        </div>
      )}
    </div>
  );
}
