"use client";
import { use, useEffect, useMemo, useState } from "react";
import { bridge, type Item, type MatrixCell } from "../../../lib/bridge";
import { useCart, type Unit } from "../../../lib/useCart";
import { useOrderContext } from "../../../lib/useOrderContext";
import { supabaseBrowser } from "../../../lib/supabase/browser";
import type { CatalogItem } from "../../../lib/supabase";

export default function ProductPage({ params }: { params: Promise<{ itemkey: string }> }) {
  const { itemkey } = use(params);
  const key = decodeURIComponent(itemkey);
  const { ctx } = useOrderContext();
  const { add } = useCart();
  const [cat, setCat] = useState<CatalogItem | null>(null); // base info + image (Supabase)
  const [catLoading, setCatLoading] = useState(true);
  const [item, setItem] = useState<Item | null>(null);      // live matrix/stock (bridge)
  const [bridgeErr, setBridgeErr] = useState(false);
  const [unit, setUnit] = useState<Unit>("carton");
  const [cellQty, setCellQty] = useState<Record<string, number>>({});
  const [finalPrice, setFinalPrice] = useState<number | null>(null);

  // Base product (name/price/image) from Supabase — works even if the bridge is down.
  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser()
        .from("items")
        .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,shown_on_site,matrix_flag")
        .eq("itemkey", key).single();
      setCat((data as CatalogItem) ?? null);
      setCatLoading(false);
    })();
  }, [key]);

  // Live details (matrix cells + stock) from the bridge.
  useEffect(() => {
    bridge.item(key).then(setItem).catch(() => setBridgeErr(true));
  }, [key]);

  // Customer's final price when a customer is entered.
  useEffect(() => {
    if (!ctx) { setFinalPrice(null); return; }
    let cancelled = false;
    bridge.price(ctx.accountKey, key, 1)
      .then((r) => { if (!cancelled) setFinalPrice(r.unitPrice); })
      .catch(() => { if (!cancelled) setFinalPrice(null); });
    return () => { cancelled = true; };
  }, [ctx, key]);

  const colorGroups = useMemo(() => {
    const cells = item?.cells ?? [];
    const by = new Map<number, MatrixCell[]>();
    for (const c of cells) { const g = by.get(c.col) ?? []; g.push(c); by.set(c.col, g); }
    for (const g of by.values()) g.sort((a, b) => a.line - b.line);
    return [...by.entries()].sort((a, b) => a[0] - b[0]);
  }, [item]);

  if (catLoading) return <p>טוען…</p>;
  if (!cat) return <p style={{ color: "#a60" }}>הפריט לא נמצא. <a href="/catalog">← לקטלוג</a></p>;

  const name = item?.itemName ?? cat.item_name;
  const perCarton = item?.perCarton ?? cat.per_carton ?? 0;
  const perBundle = item?.perBundle ?? cat.per_bundle ?? 0;
  const basePrice = item?.price ?? cat.price;
  const effPrice = ctx && finalPrice != null ? finalPrice : basePrice;
  const isMatrix = (item?.isMatrix ?? cat.matrix_flag) || false;

  const addCell = (c: MatrixCell) => {
    const qty = cellQty[c.itemkey] ?? 0;
    if (qty < 1) return;
    add({ itemkey: c.itemkey, title: `${name} ${c.colorLabel ?? ""} ${c.sizeLabel ?? ""}`.trim(), qty, unit, unitPrice: effPrice ?? undefined });
    setCellQty({ ...cellQty, [c.itemkey]: 0 });
  };

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ flex: "0 0 320px", maxWidth: "100%" }}>
        {cat.image_url
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={cat.image_url} alt={name} className="img-square" style={{ border: "1px solid #eee" }} />
          : <div style={{ aspectRatio: "1 / 1", background: "#f5f5f5", borderRadius: 6, display: "grid", placeItems: "center", color: "#bbb" }}>אין תמונה</div>}
      </div>

      <div style={{ flex: "1 1 320px", minWidth: 280 }}>
        <h1 style={{ marginTop: 0 }}>{name}</h1>
        <div style={{ color: "#666", marginBottom: 12 }}>
          מק״ט: {cat.itemkey}{cat.brand ? ` · מותג: ${cat.brand}` : ""}
          {effPrice != null ? <> · <b style={{ color: "#1e2a78" }}>{Number(effPrice).toFixed(2)} ₪</b></> : ""}
          {ctx
            ? (finalPrice != null ? <span style={{ color: "#0a7" }}> (מחיר {ctx.customerName})</span> : <span style={{ color: "#888" }}> (מחירון כללי)</span>)
            : <span style={{ color: "#888" }}> (מחירון כללי)</span>}
        </div>
        {!ctx && <p style={{ color: "#a60" }}>בחר לקוח לפני הזמנה (<a href="/customer">בחירת לקוח</a>).</p>}

        {(perCarton > 0 || perBundle > 0) && (
          <label style={{ display: "block", margin: "8px 0" }}>
            יחידה:{" "}
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {perCarton > 0 && <option value="carton">קרטון ({perCarton})</option>}
              {perBundle > 0 && <option value="bundle">חבילה ({perBundle})</option>}
            </select>
          </label>
        )}

        {isMatrix ? (
          item?.cells?.length ? (
            <div className="table-wrap">
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
          ) : bridgeErr
            ? <p style={{ color: "#a60" }}>גריד המידות והמלאי ייטענו כשהגשר יחובר.</p>
            : <p>טוען מידות…</p>
        ) : (
          <button
            disabled={!ctx}
            onClick={() => add({ itemkey: cat.itemkey, title: name, qty: 1, unit, unitPrice: effPrice ?? undefined })}
            style={{ ...addBtn, padding: "8px 16px" }}
          >הוסף לסל</button>
        )}
      </div>
    </div>
  );
}

const th = { border: "1px solid #ddd", padding: "4px 8px", background: "#f5f5f5", fontSize: 13, fontWeight: 700 as const };
const td = { border: "1px solid #ddd", padding: "4px 8px", textAlign: "center" as const, fontSize: 13 };
const addBtn = { background: "#1e2a78", color: "#fff", border: 0, borderRadius: 6, padding: "4px 8px", cursor: "pointer", marginInlineStart: 4 };
