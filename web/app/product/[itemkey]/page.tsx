"use client";
import { use, useEffect, useMemo, useState } from "react";
import { bridge, type Item, type MatrixCell } from "../../../lib/bridge";
import { useCart, type Unit } from "../../../lib/useCart";
import { useOrderContext } from "../../../lib/useOrderContext";

export default function ProductPage({ params }: { params: Promise<{ itemkey: string }> }) {
  const { itemkey } = use(params);
  const key = decodeURIComponent(itemkey);
  const { ctx } = useOrderContext();
  const { add } = useCart();
  const [item, setItem] = useState<Item | null>(null);
  const [err, setErr] = useState("");
  const [unit, setUnit] = useState<Unit>("carton");
  const [cellQty, setCellQty] = useState<Record<string, number>>({});

  useEffect(() => {
    // Calls the server proxy; returns 503 until the bridge URL is configured.
    bridge.item(key).then(setItem).catch(() => setErr("הגשר עדיין לא מחובר — פרטי הפריט וגריד המטריצה ייטענו כשהגשר יעלה."));
  }, [key]);

  // 2D: group cells by col (color axis); 1D: one group (col 0).
  const colorGroups = useMemo(() => {
    const cells = item?.cells ?? [];
    const by = new Map<number, MatrixCell[]>();
    for (const c of cells) { const g = by.get(c.col) ?? []; g.push(c); by.set(c.col, g); }
    for (const g of by.values()) g.sort((a, b) => a.line - b.line);
    return [...by.entries()].sort((a, b) => a[0] - b[0]);
  }, [item]);

  if (err) return <p style={{ color: "#a60" }}>{err}</p>;
  if (!item) return <p>טוען…</p>;

  const addCell = (c: MatrixCell) => {
    const qty = cellQty[c.itemkey] ?? 0;
    if (qty < 1) return;
    add({ itemkey: c.itemkey, title: `${item.itemName} ${c.colorLabel ?? ""} ${c.sizeLabel ?? ""}`.trim(), qty, unit, unitPrice: item.price });
    setCellQty({ ...cellQty, [c.itemkey]: 0 });
  };

  return (
    <>
      <h1>{item.itemName}</h1>
      <div style={{ color: "#666", marginBottom: 12 }}>
        מק״ט: {item.itemkey}{item.brand ? ` · מותג: ${item.brand}` : ""}{item.price != null ? ` · ${item.price} ₪` : ""}
      </div>
      {!ctx && <p style={{ color: "#a60" }}>בחר לקוח לפני הזמנה (<a href="/customer">בחירת לקוח</a>).</p>}

      {(item.perCarton || item.perBundle) && (
        <label style={{ display: "block", margin: "8px 0" }}>
          יחידה:{" "}
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {(item.perCarton ?? 0) > 0 && <option value="carton">קרטון ({item.perCarton})</option>}
            {(item.perBundle ?? 0) > 0 && <option value="bundle">חבילה ({item.perBundle})</option>}
          </select>
        </label>
      )}

      {item.isMatrix && item.cells?.length ? (
        <div style={{ overflowX: "auto" }}>
          {colorGroups.map(([col, cells]) => (
            <div key={col} style={{ marginBottom: 16 }}>
              {cells[0]?.colorLabel && <h3 style={{ margin: "8px 0", color: "#1e2a78" }}>{cells[0].colorLabel}</h3>}
              <table style={{ borderCollapse: "collapse" }}>
                <tbody>
                  <tr>{cells.map((c) => <td key={c.itemkey} style={th}>{c.sizeLabel ?? c.itemkey}</td>)}</tr>
                  <tr>{cells.map((c) => <td key={c.itemkey} style={td}>מלאי: {c.stock ?? "-"}</td>)}</tr>
                  <tr>{cells.map((c) => (
                    <td key={c.itemkey} style={td}>
                      <input type="number" min={0} value={cellQty[c.itemkey] ?? 0}
                        onChange={(e) => setCellQty({ ...cellQty, [c.itemkey]: Number(e.target.value) })}
                        style={{ width: 48 }} />
                      <button onClick={() => addCell(c)} disabled={!ctx} style={addBtn}>+</button>
                    </td>
                  ))}</tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <button
          disabled={!ctx}
          onClick={() => add({ itemkey: item.itemkey, title: item.itemName, qty: 1, unit, unitPrice: item.price })}
          style={{ ...addBtn, padding: "8px 16px" }}
        >הוסף לסל</button>
      )}
    </>
  );
}

const th = { border: "1px solid #ddd", padding: "4px 8px", background: "#f5f5f5", fontSize: 13, fontWeight: 700 as const };
const td = { border: "1px solid #ddd", padding: "4px 8px", textAlign: "center" as const, fontSize: 13 };
const addBtn = { background: "#1e2a78", color: "#fff", border: 0, borderRadius: 6, padding: "4px 8px", cursor: "pointer", marginInlineStart: 4 };
