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
type Sort = "default" | "price-asc" | "price-desc" | "name";

// Catalog browser. Used by a single category (/catalog/[main]), by the whole catalog
// (/catalog) and by search results (/search) — all get the same category/sub bars, search,
// filters and sort. `categoryMain` seeds the main-category filter (switchable in-page);
// `searchMode` shows all results across categories.
export default function CatalogView({ categoryMain, items, allCategories = [], initialQ = "", searchMode = false, heading, hideSearch = false }: {
  categoryMain?: string; items: CatalogItem[]; allCategories?: string[]; initialQ?: string; searchMode?: boolean; heading?: string; hideSearch?: boolean;
}) {
  const { ctx } = useOrderContext();
  const showStock = canSeeStock(useRole());
  // Initial main: the given category, else the largest one (so /catalog lands populated), else all.
  const [mainFilter, setMainFilter] = useState<string>(categoryMain ?? (searchMode ? "" : (allCategories[0] ?? "")));
  const [sub, setSub] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [season, setSeason] = useState<string>("");
  const [group, setGroup] = useState<string>("");
  const [q, setQ] = useState<string>(initialQ);
  const [sortBy, setSortBy] = useState<Sort>("default");
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [discMap, setDiscMap] = useState<Record<string, number>>({}); // customer discount % per item

  // Items in the selected main category (drives the sub-category and filter options).
  const mainItems = useMemo(() => (mainFilter ? items.filter((i) => i.category_main === mainFilter) : items), [items, mainFilter]);
  const subs = useMemo(() => uniq(mainItems.map((i) => i.category_sub)), [mainItems]);
  const brands = useMemo(() => uniq(mainItems.map((i) => i.brand)), [mainItems]);
  const seasons = useMemo(() => uniq(mainItems.map((i) => i.season)), [mainItems]);
  const groups = useMemo(() => uniq(mainItems.map((i) => i.group_name)), [mainItems]);

  // Switching the main category clears the narrower filters (they may not exist under it).
  useEffect(() => { setSub(""); setBrand(""); setSeason(""); setGroup(""); }, [mainFilter]);

  // Customer pricing: when a customer is entered, fetch prices for the loaded items in bulk.
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

  const stockSynced = useMemo(() => items.some((i) => (i.stock ?? 0) > 0), [items]);
  // Hide single-SKU items with no stock when ordering (matrix/carton-size parents gated per cell).
  const noStock = (i: CatalogItem) =>
    !!ctx && stockSynced && !i.matrix_flag && !i.is_carton_size_item && (i.stock ?? 0) <= 0
    && !(ctx.orderKind === "future" && i.ignore_stock);

  const priceOf = (it: CatalogItem) => (ctx && priceMap[it.itemkey] != null ? priceMap[it.itemkey] : it.price);

  const shown = useMemo(() => {
    const list = mainItems.filter((i) =>
      (!sub || i.category_sub === sub) &&
      (!brand || i.brand === brand) &&
      (!season || i.season === season) &&
      (!group || i.group_name === group) &&
      (!q || i.item_name?.includes(q) || i.itemkey?.toLowerCase().includes(q.toLowerCase())) &&
      !noStock(i));
    const pr = (it: CatalogItem) => { const p = priceOf(it); return p == null ? Infinity : Number(p); };
    if (sortBy === "price-asc") return [...list].sort((a, b) => pr(a) - pr(b));
    if (sortBy === "price-desc") return [...list].sort((a, b) => pr(b) - pr(a));
    if (sortBy === "name") return [...list].sort((a, b) => (a.item_name ?? "").localeCompare(b.item_name ?? "", "he"));
    return list; // "default" = as loaded (newest first by item_seq from the query)
  }, [mainItems, sub, brand, season, group, q, sortBy, ctx, stockSynced, priceMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (active: boolean) => (active ? "btn btn-primary btn-sm" : "btn btn-sm");

  return (
    <>
      {/* Main-category bar — filters in place (no page reload). */}
      {allCategories.length > 0 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 14 }}>
          <button onClick={() => setMainFilter("")} className={chip(!mainFilter)} style={{ flex: "0 0 auto" }}>הכל</button>
          {allCategories.map((c) => (
            <button key={c} onClick={() => setMainFilter(c)} className={chip(c === mainFilter)} style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>{c}</button>
          ))}
        </div>
      )}

      {heading !== "" && <h1 style={{ marginBottom: 10 }}>{heading ?? mainFilter ?? "קטלוג"}</h1>}

      {/* Sub-category chips for the selected main */}
      {subs.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button onClick={() => setSub("")} className={chip(!sub)}>הכל</button>
          {subs.map((s) => (
            <button key={s} onClick={() => setSub(s)} className={chip(sub === s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 14, padding: "10px 14px", fontSize: 13, background: ctx ? "var(--brand-soft)" : "var(--surface-muted)", borderColor: ctx ? "var(--brand-soft)" : "var(--border)" }}>
        {ctx ? <>מזמין עבור <b>{ctx.customerName}</b> — המחירים בקטלוג הם מחירי הלקוח.</>
             : <>מוצג <b>מחירון כללי</b>. לכניסה למחיר לקוח — <a href="/customer">בחר לקוח</a>.</>}
      </div>

      {/* search + filters + sort */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {!hideSearch && <input placeholder="חיפוש חופשי…" value={q} onChange={(e) => setQ(e.target.value)} className="input" style={{ maxWidth: 240 }} />}
        <select value={group} onChange={(e) => setGroup(e.target.value)} className="select" style={{ maxWidth: 160 }}><option value="">קבוצה</option>{groups.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className="select" style={{ maxWidth: 160 }}><option value="">מותג</option>{brands.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={season} onChange={(e) => setSeason(e.target.value)} className="select" style={{ maxWidth: 160 }}><option value="">עונה</option>{seasons.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as Sort)} className="select" style={{ maxWidth: 170 }}>
          <option value="default">מיון: חדש קודם</option>
          <option value="price-asc">מחיר: נמוך לגבוה</option>
          <option value="price-desc">מחיר: גבוה לנמוך</option>
          <option value="name">שם: א׳–ת׳</option>
        </select>
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
