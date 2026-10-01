"use client";
import { useCart, type Unit } from "../../lib/useCart";

export default function AddToCart({
  itemkey, title, perCarton, perBundle, price,
}: {
  itemkey: string; title: string;
  perCarton?: number | null; perBundle?: number | null; price?: number | null;
}) {
  const { add } = useCart();
  const units: Unit[] = [];
  if ((perCarton ?? 0) > 0) units.push("carton");
  if ((perBundle ?? 0) > 0) units.push("bundle");
  if (!units.length) return <span style={{ fontSize: 12, color: "#999" }}>לא פתוח להזמנה</span>;

  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      {units.map((u) => (
        <button
          key={u}
          onClick={() => add({ itemkey, title, qty: 1, unit: u, unitPrice: price ?? undefined })}
          style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 13 }}
        >
          + {u === "carton" ? "קרטון" : "חבילה"}
        </button>
      ))}
    </div>
  );
}
