"use client";
import { use, useEffect, useMemo, useState } from "react";
import { bridge, type Item, type MatrixCell } from "../../../lib/bridge";
import { useCart, type Unit } from "../../../lib/useCart";
import { useOrderContext } from "../../../lib/useOrderContext";
import { supabaseBrowser } from "../../../lib/supabase/browser";
import type { CatalogItem } from "../../../lib/supabase";
import AddToCart from "../../components/AddToCart";
import ImageUploader from "../../components/ImageUploader";

export default function ProductPage({ params }: { params: Promise<{ itemkey: string }> }) {
  const { itemkey } = use(params);
  const key = decodeURIComponent(itemkey);
  const { ctx } = useOrderContext();
  const [cat, setCat] = useState<CatalogItem | null>(null);
  const [catLoading, setCatLoading] = useState(true);
  const [item, setItem] = useState<Item | null>(null);
  const [bridgeErr, setBridgeErr] = useState(false);
  const [unit, setUnit] = useState<Unit>("carton");
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [rulerSizes, setRulerSizes] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser()
        .from("items")
        .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,images,shown_on_site,matrix_flag,is_carton_size_item")
        .eq("itemkey", key).single();
      setCat((data as CatalogItem) ?? null);
      setCatLoading(false);
    })();
  }, [key]);

  useEffect(() => {
    bridge.item(key).then(setItem).catch(() => setBridgeErr(true));
  }, [key]);

  // Ruler products (one SKU, sizes from the in-app ruler): load the ruler's size list.
  useEffect(() => {
    const code = item?.rulerCode;
    if (!code || item?.isMatrix) { setRulerSizes([]); return; }
    let alive = true;
    supabaseBrowser().from("rulers").select("sizes").eq("code", code).single()
      .then(({ data }) => { if (alive) setRulerSizes(((data?.sizes as string[] | null) ?? []).filter(Boolean)); });
    return () => { alive = false; };
  }, [item?.rulerCode, item?.isMatrix]);

  // Default the unit to the smallest available pack (bundle if it exists) once the item loads.
  useEffect(() => {
    if (!item) return;
    if ((item.perBundle ?? 0) > 0) setUnit("bundle");
    else if ((item.perCarton ?? 0) > 0) setUnit("carton");
  }, [item?.itemkey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ctx) { setFinalPrice(null); return; }
    let cancelled = false;
    bridge.price(ctx.accountKey, key, 1)
      .then((r) => { if (!cancelled) setFinalPrice(r.unitPrice); })
      .catch(() => { if (!cancelled) setFinalPrice(null); });
    return () => { cancelled = true; };
  }, [ctx, key]);

  // Build the matrix label-driven: rows = colors, columns = sizes. Hashavshevet gives
  // a regular grid where one axis (col/line) is the size and the other the color, but it
  // labels only some cells — so we detect the size axis and reconstruct the missing labels
  // from each cell's row/column index. Works for 1-D (single-colour) items too.
  const matrix = useMemo(() => {
    // Drop malformed/empty matrix slots (e.g. SKU ends with "-", no size code).
    const cells = (item?.cells ?? []).filter((c) => c.itemkey && !c.itemkey.endsWith("-"));
    if (!cells.length) return null;
    const distinctSizesPer = (axis: "col" | "line") => {
      const m = new Map<number, Set<string>>();
      for (const c of cells) if (c.sizeLabel) { const s = m.get(c[axis]) ?? new Set(); s.add(c.sizeLabel); m.set(c[axis], s); }
      return Math.max(0, ...[...m.values()].map((s) => s.size));
    };
    // The size axis is the one where each index maps to a single size label.
    const sizeAxis: "col" | "line" = distinctSizesPer("col") <= 1 ? "col" : "line";
    const colorAxis: "col" | "line" = sizeAxis === "col" ? "line" : "col";
    const sizeByIdx = new Map<number, string>(), colorByIdx = new Map<number, string>();
    for (const c of cells) {
      if (c.sizeLabel) sizeByIdx.set(c[sizeAxis], c.sizeLabel);
      if (c.colorLabel) colorByIdx.set(c[colorAxis], c.colorLabel);
    }
    // Only real sizes (those with a label); unlabeled slots are junk/placeholders, not shown.
    const sizeIdx = [...new Set(cells.map((c) => c[sizeAxis]))].filter((i) => sizeByIdx.has(i)).sort((a, b) => a - b);
    const colorIdx = [...new Set(cells.map((c) => c[colorAxis]))].sort((a, b) => a - b);
    const grid = new Map<string, MatrixCell>();
    for (const c of cells) grid.set(`${c[colorAxis]}|${c[sizeAxis]}`, c);
    const multiColor = colorIdx.length > 1;
    return {
      grid,
      sizes: sizeIdx.map((i) => ({ i, label: sizeByIdx.get(i) ?? `מידה ${i + 1}` })),
      colors: colorIdx.map((i) => ({ i, label: colorByIdx.get(i) ?? (multiColor ? `צבע ${i + 1}` : "") })),
      colorAxis, sizeAxis, multiColor,
    };
  }, [item]);

  if (catLoading) return <p>טוען…</p>;
  if (!cat) return <p className="chip chip-warn">הפריט לא נמצא. <a href="/catalog">← לקטלוג</a></p>;

  const name = item?.itemName ?? cat.item_name;
  const perCarton = item?.perCarton ?? cat.per_carton ?? 0;
  const perBundle = item?.perBundle ?? cat.per_bundle ?? 0;
  const basePrice = item?.price ?? cat.price;
  const effPrice = ctx && finalPrice != null ? finalPrice : basePrice;
  const isMatrix = (item?.isMatrix ?? (cat.matrix_flag || cat.is_carton_size_item)) || false;
  // Ruler product: single SKU, order per size (bundle) via the in-app ruler, or a whole carton (mixed).
  const isRuler = !isMatrix && rulerSizes.length > 0;

  // Stock gating: out-of-stock can't be ordered — except a future order of an "ignore stock" item.
  const canIgnoreStock = ctx?.orderKind === "future" && !!item?.ignoreStock;
  const soldOut = (s?: number | null) => s != null && !canIgnoreStock && s <= 0;
  const canOrder = !!ctx?.orderKind; // customer chosen AND order kind picked
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
        <ImageUploader kind="product" id={key} onDone={(url) => {
          setCat((c) => (c ? { ...c, image_url: url, images: [url, ...((c.images ?? []).filter((u) => u !== url))] } : c));
          setActiveImg(0);
        }} />
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
        {ctx && !ctx.orderKind && <p className="chip chip-warn" style={{ marginBottom: 12 }}>בחר סוג הזמנה לפני הוספה לסל — <a href="/start" style={{ color: "inherit", textDecoration: "underline" }}>התחלת הזמנה</a></p>}

        {(isMatrix || isRuler) && (perCarton > 0 || perBundle > 0) && (
          <label style={{ display: "block", margin: "8px 0" }}>
            {isRuler ? "בחר יחידת מידה:" : "יחידה:"}{" "}
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="select" style={{ maxWidth: 200, display: "inline-block" }}>
              {perCarton > 0 && <option value="carton">קרטון ({perCarton})</option>}
              {perBundle > 0 && <option value="bundle">חבילה ({perBundle})</option>}
            </select>
          </label>
        )}

        {isMatrix ? (
          item?.cells?.length && matrix ? (
            <div className="table-wrap">
              <table style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {matrix.multiColor && <th style={th}>צבע \ מידה</th>}
                    {matrix.sizes.map((s) => <th key={s.i} style={th}>{s.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {matrix.colors.map((color) => (
                    <tr key={color.i}>
                      {matrix.multiColor && <td style={{ ...td, fontWeight: 700, textAlign: "start", whiteSpace: "nowrap", background: "var(--surface-muted)" }}>{color.label}</td>}
                      {matrix.sizes.map((s) => {
                        const cell = matrix.grid.get(`${color.i}|${s.i}`);
                        if (!cell) return <td key={s.i} style={{ ...td, color: "var(--ink-muted)" }}>—</td>;
                        const label = `${color.label} ${s.label}`.trim();
                        const low = (cell.stock ?? 0) <= 0;
                        return (
                          <td key={s.i} style={td}>
                            <div style={{ fontSize: 11, color: low ? "var(--danger)" : "var(--ink-muted)" }}>מלאי: {cell.stock ?? "-"}</div>
                            <div style={{ display: "flex", justifyContent: "center", marginTop: 2 }}>
                              {soldOut(cell.stock)
                                ? <span className="chip chip-danger">אזל</span>
                                : <Stepper itemkey={cell.itemkey} unit={unit} title={`${name} ${label}`.trim()} packSize={unit === "carton" ? perCarton : perBundle} price={effPrice} disabled={!canOrder} stock={cell.stock} />}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : bridgeErr
            ? <p className="chip chip-warn">גריד המידות והמלאי ייטענו כשהגשר יחובר.</p>
            : <p>טוען מידות…</p>
        ) : isRuler ? (
          soldOut(item?.stock) ? (
            <p className="chip chip-danger">אזל מהמלאי{ctx?.orderKind === "picking" ? " — לא ניתן להזמין לליקוט" : ""}</p>
          ) : unit === "bundle" ? (
            <div style={{ display: "grid", gap: 8 }}>
              {!ctx && <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>בחר לקוח כדי להזמין.</span>}
              {(item?.stock != null && item.stock > 0) && <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>מלאי כולל: {item.stock}</span>}
              {rulerSizes.map((size) => (
                <div key={size} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "6px 10px" }}>
                  <span style={{ minWidth: 54, fontWeight: 700 }}>{size}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>חבילה{perBundle ? ` (${perBundle} יח׳)` : ""}</span>
                  <span style={{ marginInlineStart: "auto" }}>
                    <Stepper itemkey={key} unit="bundle" sizeLabel={size} title={name} packSize={perBundle} price={effPrice} disabled={!canOrder} addLabel="חבילה" stock={item?.stock} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Stepper itemkey={key} unit="carton" title={name} packSize={perCarton} price={effPrice} disabled={!canOrder} addLabel={`קרטון${perCarton ? ` (${perCarton})` : ""}`} stock={item?.stock} />
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>קרטון מעורב — לפירוט לפי מידה בחר "חבילה"</span>
            </div>
          )
        ) : soldOut(item?.stock) ? (
          <p className="chip chip-danger">אזל מהמלאי{ctx?.orderKind === "picking" ? " — לא ניתן להזמין לליקוט" : ""}</p>
        ) : (
          <AddToCart itemkey={cat.itemkey} title={name} perCarton={perCarton} perBundle={perBundle} price={effPrice} stock={item?.stock} />
        )}
      </div>
    </div>
  );
}

// One-click stepper: every +/- changes the cart immediately (no separate qty box).
function Stepper({ itemkey, unit, title, packSize, price, sizeLabel, disabled, addLabel, stock }: {
  itemkey: string; unit: Unit; title: string; packSize?: number; price?: number | null; sizeLabel?: string; disabled?: boolean; addLabel?: string; stock?: number;
}) {
  const { add, setQty, remove, qtyOf } = useCart();
  const q = qtyOf(itemkey, unit, sizeLabel);
  const inc = () => add({ itemkey, title, qty: 1, unit, unitPrice: price ?? undefined, packSize: packSize || undefined, sizeLabel, stock });
  const dec = () => { if (q <= 1) remove(itemkey, unit, sizeLabel); else setQty(itemkey, unit, q - 1, sizeLabel); };
  if (q > 0) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--brand)", borderRadius: "var(--radius-sm)", padding: "2px 4px" }}>
        <button onClick={dec} className="btn btn-sm" style={{ padding: "2px 9px", border: 0, background: "transparent", color: "var(--brand)", fontSize: 16 }}>−</button>
        <span style={{ minWidth: 24, textAlign: "center", fontWeight: 700 }}>{q}</span>
        <button onClick={inc} className="btn btn-sm" style={{ padding: "2px 9px", border: 0, background: "transparent", color: "var(--brand)", fontSize: 16 }}>+</button>
      </div>
    );
  }
  return <button onClick={inc} disabled={disabled} className="btn btn-primary btn-sm">+ {addLabel ?? "הוספה"}</button>;
}

const th = { border: "1px solid var(--border)", padding: "4px 8px", background: "var(--surface-muted)", fontSize: 13, fontWeight: 700 as const };
const td = { border: "1px solid var(--border)", padding: "4px 8px", textAlign: "center" as const, fontSize: 13 };
