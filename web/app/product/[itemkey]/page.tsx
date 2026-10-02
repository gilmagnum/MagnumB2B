"use client";
import { use, useEffect, useMemo, useState } from "react";
import { bridge, type Item, type MatrixCell } from "../../../lib/bridge";
import { useCart, type Unit } from "../../../lib/useCart";
import { useOrderContext } from "../../../lib/useOrderContext";
import { supabaseBrowser } from "../../../lib/supabase/browser";
import type { CatalogItem } from "../../../lib/supabase";
import AddToCart from "../../components/AddToCart";

export default function ProductPage({ params }: { params: Promise<{ itemkey: string }> }) {
  const { itemkey } = use(params);
  const key = decodeURIComponent(itemkey);
  const { ctx } = useOrderContext();
  const { add } = useCart();
  const [cat, setCat] = useState<CatalogItem | null>(null);
  const [catLoading, setCatLoading] = useState(true);
  const [item, setItem] = useState<Item | null>(null);
  const [bridgeErr, setBridgeErr] = useState(false);
  const [unit, setUnit] = useState<Unit>("carton");
  const [cellQty, setCellQty] = useState<Record<string, number>>({});
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser()
        .from("items")
        .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,images,shown_on_site,matrix_flag")
        .eq("itemkey", key).single();
      setCat((data as CatalogItem) ?? null);
      setCatLoading(false);
    })();
  }, [key]);

  useEffect(() => {
    bridge.item(key).then(setItem).catch(() => setBridgeErr(true));
  }, [key]);

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
  if (!cat) return <p className="chip chip-warn">הפריט לא נמצא. <a href="/catalog">← לקטלוג</a></p>;

  const name = item?.itemName ?? cat.item_name;
  const perCarton = item?.perCarton ?? cat.per_carton ?? 0;
  const perBundle = item?.perBundle ?? cat.per_bundle ?? 0;
  const basePrice = item?.price ?? cat.price;
  const effPrice = ctx && finalPrice != null ? finalPrice : basePrice;
  const isMatrix = (item?.isMatrix ?? cat.matrix_flag) || false;
  const gallery = (cat.images && cat.images.length ? cat.images : (cat.image_url ? [cat.image_url] : []));
  const mainImg = gallery[activeImg] ?? gallery[0];

  // Each spec on its own line.
  const fields: [string, string | number | null | undefined][] = [
    ["מק״ט", cat.itemkey],
    ["מותג", cat.brand],
    ["קטגוריה", cat.category_main],
    ["תת-קטגוריה", cat.category_sub],
    ["קבוצה", cat.group_name],
    ["עונה", cat.season],
    ["כמות בקרטון", perCarton || null],
    ["כמות בחבילה", perBundle || null],
  ];

  const addCell = (c: MatrixCell) => {
    const qty = cellQty[c.itemkey] ?? 0;
    if (qty < 1) return;
    add({ itemkey: c.itemkey, title: `${name} ${c.colorLabel ?? ""} ${c.sizeLabel ?? ""}`.trim(), qty, unit, unitPrice: effPrice ?? undefined });
    setCellQty({ ...cellQty, [c.itemkey]: 0 });
  };

  return (
    <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
      {/* gallery */}
      <div style={{ flex: "0 0 340px", maxWidth: "100%" }}>
        {mainImg
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={mainImg} alt={name} className="img-square" style={{ border: "1px solid var(--border)" }} />
          : <div style={{ aspectRatio: "1 / 1", background: "var(--surface-muted)", borderRadius: "var(--radius-sm)", display: "grid", placeItems: "center", color: "var(--ink-muted)" }}>אין תמונה</div>}
        {gallery.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {gallery.map((g, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={g} alt="" onClick={() => setActiveImg(i)}
                style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 8, cursor: "pointer", background: "var(--surface-muted)", border: i === activeImg ? "2px solid var(--brand)" : "1px solid var(--border)" }} />
            ))}
          </div>
        )}
      </div>

      {/* details */}
      <div style={{ flex: "1 1 340px", minWidth: 300 }}>
        <h1 style={{ marginTop: 0 }}>{name}</h1>

        <div className="card card-pad" style={{ display: "grid", gap: 2, marginBottom: 16 }}>
          {fields.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0" }}>
            <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>מחיר</span>
            <span style={{ fontWeight: 800, color: "var(--brand-strong)" }}>
              {effPrice != null ? `${Number(effPrice).toFixed(2)} ₪` : "—"}
              <span style={{ fontWeight: 400, fontSize: 12, color: ctx && finalPrice != null ? "var(--ok)" : "var(--ink-muted)", marginInlineStart: 6 }}>
                {ctx && finalPrice != null ? `(מחיר ${ctx.customerName})` : "(מחירון כללי)"}
              </span>
            </span>
          </div>
        </div>

        {!ctx && <p className="chip chip-warn" style={{ marginBottom: 12 }}>בחר לקוח לפני הזמנה — <a href="/customer" style={{ color: "inherit", textDecoration: "underline" }}>בחירת לקוח</a></p>}

        {isMatrix && (perCarton > 0 || perBundle > 0) && (
          <label style={{ display: "block", margin: "8px 0" }}>
            יחידה:{" "}
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="select" style={{ maxWidth: 200, display: "inline-block" }}>
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
                  {cells[0]?.colorLabel && <h3 style={{ margin: "8px 0", color: "var(--brand-strong)" }}>{cells[0].colorLabel}</h3>}
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
            ? <p className="chip chip-warn">גריד המידות והמלאי ייטענו כשהגשר יחובר.</p>
            : <p>טוען מידות…</p>
        ) : (
          <AddToCart itemkey={cat.itemkey} title={name} perCarton={perCarton} perBundle={perBundle} price={effPrice} />
        )}
      </div>
    </div>
  );
}

const th = { border: "1px solid var(--border)", padding: "4px 8px", background: "var(--surface-muted)", fontSize: 13, fontWeight: 700 as const };
const td = { border: "1px solid var(--border)", padding: "4px 8px", textAlign: "center" as const, fontSize: 13 };
const addBtn = { background: "var(--brand)", color: "#fff", border: 0, borderRadius: 6, padding: "4px 8px", cursor: "pointer", marginInlineStart: 4 };
