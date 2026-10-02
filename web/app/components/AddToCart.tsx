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
  const { add } = useCart();
  const { ctx } = useOrderContext();
  const [flash, setFlash] = useState<Unit | null>(null);
  const [err, setErr] = useState(false);

  const units: Unit[] = [];
  if ((perCarton ?? 0) > 0) units.push("carton");
  if ((perBundle ?? 0) > 0) units.push("bundle");
  if (!units.length) return <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>לא פתוח להזמנה</span>;

  const addUnit = (u: Unit) => {
    if (!ctx) { setErr(true); setTimeout(() => setErr(false), 2500); return; }
    add({ itemkey, title, qty: 1, unit: u, unitPrice: price ?? undefined });
    setFlash(u);
    setTimeout(() => setFlash((f) => (f === u ? null : f)), 1200);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {units.map((u) => (
          <button
            key={u}
            onClick={() => addUnit(u)}
            className={flash === u ? "btn btn-sm" : "btn btn-primary btn-sm"}
            style={flash === u ? { borderColor: "var(--ok)", color: "var(--ok)", background: "var(--ok-soft)" } : undefined}
          >
            {flash === u ? "✓ נוסף" : `+ ${u === "carton" ? "קרטון" : "חבילה"}`}
          </button>
        ))}
      </div>
      {err && (
        <div className="chip chip-danger" style={{ marginTop: 6 }}>
          יש לבחור לקוח — <a href="/customer" style={{ color: "inherit", textDecoration: "underline" }}>בחירת לקוח</a>
        </div>
      )}
    </div>
  );
}
