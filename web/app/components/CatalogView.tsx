"use client";
import { useEffect, useMemo, useState } from "react";
import type { CatalogItem } from "../../lib/supabase";
import { useOrderContext } from "../../lib/useOrderContext";
import { useRole } from "../../lib/useRole";
import { canSeeStock } from "../../lib/roles";
import { bridge } from "../../lib/bridge";
import AddToCart from "./AddToCart";
import StockLine from "./StockLine";

const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();

export default function CatalogView({ categoryMain, items, allCategories = [] }: {
  categoryMain: string; items: CatalogItem[]; allCategories?: string[];
}) {
  const { ctx } = useOrderContext();
  const showStock = canSeeStock(useRole());
  const [sub, setSub] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [season, setSeason] = useState<string>("");
  const [group, setGroup] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [discMap, setDiscMap] = useState<Record<string, number>>({}); // customer discount % per item

  const subs = useMemo(() => uniq(items.map((i) => i.category_sub)), [items]);
  const brands = useMemo(() => uniq(items.map((i) => i.brand)), [items]);
  const seasons = useMemo(() => uniq(items.map((i) => i.season)), [items]);
  const groups = useMemo(() => uniq(items.map((i) => i.group_name)), [items]);

  // Customer pricing: when a customer is entered, fetch this category's prices in bulk.
  useEffect(() => {
    if (!ctx) { setPriceMap({}); setDiscMap({}); return; }
    let cancelled = false;
    (async () => {
      const keys = items.map((i) => i.itemkey);
      const map: Record<string, number> = {};
      const disc: Record<string, number> = {};
      for (let i = 0; i < keys.length; i += 500) {
        try {
          const res = await bridge.prices(ctx.accountKey, keys.slice(i, i + 500).map((k) => ({ itemkey: k })));
          for (const r of res) { map[r.itemkey] = r.unitPrice; disc[r.itemkey] = r.discountPct; }
        } catch { /* keep general price on failure */ }
      }
      if (!cancelled) { setPriceMap(map); setDiscMap(disc); }
    })();
    return () => { cancelled = true; };
  }, [ctx, items]);

  // Hide no-stock products for ordering (single-SKU items only; matrix stock lives on cells so
  // the parent is ~0 and is gated on the product page). Guarded: only when stock looks synced.
  const stockSynced = useMemo(() => items.some((i) => (i.stock ?? 0) > 0), [items]);
  // Hide items with no stock when ordering. Matrix / carton-size parents are excluded —
  // their parent-SKU balance isn't the real stock (it lives on the cells), so gating is
  // per-cell on the product page. Rulers ARE single SKUs with a real balance, so they're gated.
  const noStock = (i: CatalogItem) =>
    !!ctx && stockSynced && !i.matrix_flag && !i.is_carton_size_item && (i.stock ?? 0) <= 0
    && !(ctx.orderKind === "future" && i.ignore_stock);

  const shown = useMemo(() => items.filter((i) =>
    (!sub || i.category_sub === sub) &&
    (!brand || i.brand === brand) &&
    (!season || i.season === season) &&
    (!group || i.group_name === group) &&
    (!q || i.item_name?.includes(q) || i.itemkey?.toLowerCase().includes(q.toLowerCase())) &&
    !noStock(i)
  ), [items, sub, brand, season, group, q, ctx, stockSynced]); // eslint-disable-line react-hooks/exhaustive-deps

  const priceOf = (it: CatalogItem) => (ctx && priceMap[it.itemkey] != null ? priceMap[it.itemkey] : it.price);

  return (
    <>
      {/* top category bar — small fixed squares */}
      {allCategories.length > 0 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 14 }}>
          {allCategories.map((c) => (
            <a key={c} href={`/catalog/${encodeURIComponent(c)}`}
              style={{
                flex: "0 0 auto", padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, textDecoration: "none",
                border: "1px solid var(--border)", whiteSpace: "nowrap",
                background: c === categoryMain ? "var(--brand)" : "var(--surface)",
                color: c === categoryMain ? "var(--on-brand)" : "var(--ink)",
              }}>{c}</a>
          ))}
        </div>
      )}

      <h1 style={{ marginBottom: 10 }}>{categoryMain}</h1>

      {/* sub-categories as a chip row (opens below the category bar) */}
      {subs.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button onClick={() => setSub("")} className={!sub ? "btn btn-primary btn-sm" : "btn btn-sm"}>הכל</button>
          {subs.map((s) => (
            <button key={s} onClick={() => setSub(s)} className={sub === s ? "btn btn-primary btn-sm" : "btn btn-sm"}>{s}</button>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 14, padding: "10px 14px", fontSize: 13, background: ctx ? "var(--brand-soft)" : "var(--surface-muted)", borderColor: ctx ? "var(--brand-soft)" : "var(--border)" }}>
        {ctx ? <>מזמין עבור <b>{ctx.customerName}</b> — המחירים בקטלוג הם מחירי הלקוח.</>
             : <>מוצג <b>מחירון כללי</b>. לכניסה למחיר לקוח — <a href="/customer">בחר לקוח</a>.</>}
      </div>

      {/* dynamic search + filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input placeholder="חיפוש דינמי…" value={q} onChange={(e) => setQ(e.target.value)} className="input" style={{ maxWidth: 240 }} />
        <select value={group} onChange={(e) => setGroup(e.target.value)} className="select" style={{ maxWidth: 160 }}><option value="">קבוצה</option>{groups.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className="select" style={{ maxWidth: 160 }}><option value="">מותג</option>{brands.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={season} onChange={(e) => setSeason(e.target.value)} className="select" style={{ maxWidth: 160 }}><option value="">עונה</option>{seasons.map((x) => <option key={x}>{x}</option>)}</select>
      </div>

      <div style={{ color: "var(--ink-muted)", fontSize: 13, marginBottom: 10 }}>{shown.length} מוצרים</div>
      <div className="card-grid">
        {shown.map((it) => {
          const p = priceOf(it);
          return (
            <article key={it.itemkey} className="product-card">
              <a href={`/product/${encodeURIComponent(it.itemkey)}`} style={{ textDecoration: "none", color: "inherit" }}>
                {it.image_url
                  ? // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image_url} alt={it.item_name} loading="lazy" className="img-square" />
                  : <div style={{ aspectRatio: "1 / 1", background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }} />}
                <h3 style={{ fontSize: 14, margin: "10px 0 4px", lineHeight: 1.3 }}>{it.item_name}</h3>
              </a>
              <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>מק״ט: {it.itemkey}{it.brand ? ` · ${it.brand}` : ""}</div>
              <div style={{ marginTop: 6, fontWeight: 800, color: "var(--ink)" }}>
                {p != null ? `${Number(p).toFixed(2)} ₪` : ""} {it.per_carton ? <span style={{ fontWeight: 400, color: "var(--ink-muted)", fontSize: 12 }}>· {it.per_carton} בקרטון</span> : ""}
              </div>
              {ctx && (discMap[it.itemkey] ?? 0) > 0 && <div style={{ fontSize: 12, color: "var(--ok)", fontWeight: 600 }}>הנחת לקוח: {discMap[it.itemkey]}%</div>}
              {showStock && <StockLine stock={it.stock} perSize={!!it.matrix_flag || !!it.is_carton_size_item} />}
              <div className="card-action">
                {(it.matrix_flag || it.is_carton_size_item) ? (
                  <a href={`/product/${encodeURIComponent(it.itemkey)}`} className="btn btn-primary btn-sm" style={{ display: "block", textAlign: "center" }}>בחירת מידות ←</a>
                ) : it.ruler_code ? (
                  <AddToCart itemkey={it.itemkey} title={it.item_name} perCarton={it.per_carton} perBundle={it.per_bundle} price={p} only="carton" />
                ) : (
                  <AddToCart itemkey={it.itemkey} title={it.item_name} perCarton={it.per_carton} perBundle={it.per_bundle} price={p} />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
