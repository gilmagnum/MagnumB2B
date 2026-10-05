"use client";
import type { CatalogItem } from "../../lib/supabase";
import { useOrderContext } from "../../lib/useOrderContext";
import AddToCart from "./AddToCart";

// Shared product grid (used by search results; the category page has its own layout).
export default function ProductGrid({ items }: { items: CatalogItem[] }) {
  const { ctx } = useOrderContext();
  const stockSynced = items.some((i) => (i.stock ?? 0) > 0);
  const visible = items.filter((i) => !(
    !!ctx && stockSynced && !i.matrix_flag && !i.is_carton_size_item && (i.stock ?? 0) <= 0
    && !(ctx.orderKind === "future" && i.ignore_stock)
  ));
  if (!visible.length) return <p style={{ color: "#888" }}>לא נמצאו מוצרים.</p>;
  return (
    <div className="card-grid">
      {visible.map((it) => (
        <article key={it.itemkey} className="product-card">
          <a href={`/product/${encodeURIComponent(it.itemkey)}`} style={{ textDecoration: "none", color: "inherit" }}>
            {it.image_url
              ? // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image_url} alt={it.item_name} loading="lazy" className="img-square" />
              : <div style={{ aspectRatio: "1 / 1", background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }} />}
            <h3 style={{ fontSize: 14, margin: "10px 0 4px", lineHeight: 1.3 }}>{it.item_name}</h3>
          </a>
          <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>מק״ט: {it.itemkey}</div>
          {it.category_main && <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>{it.category_main}{it.category_sub ? ` · ${it.category_sub}` : ""}</div>}
          <div style={{ marginTop: 6, fontWeight: 800 }}>
            {it.price != null ? `${it.price} ₪` : ""} {it.per_carton ? <span style={{ fontWeight: 400, color: "var(--ink-muted)", fontSize: 12 }}>· {it.per_carton} בקרטון</span> : ""}
          </div>
          {(it.matrix_flag || it.is_carton_size_item) ? (
            <div style={{ marginTop: 10 }}>
              <span className="chip chip-info">{it.is_carton_size_item ? "קרטון לפי מידה" : "מטריצה"}</span>
              <a href={`/product/${encodeURIComponent(it.itemkey)}`} className="btn btn-primary btn-sm" style={{ display: "block", marginTop: 8, textAlign: "center" }}>בחירת מידות ←</a>
            </div>
          ) : it.ruler_code ? (
            <div style={{ marginTop: 6 }}>
              <AddToCart itemkey={it.itemkey} title={it.item_name} perCarton={it.per_carton} perBundle={it.per_bundle} price={it.price} only="carton" />
              <a href={`/product/${encodeURIComponent(it.itemkey)}`} className="btn btn-sm" style={{ display: "block", marginTop: 6, textAlign: "center" }}>בחירת מידות (חבילה לפי מידה) ←</a>
            </div>
          ) : (
            <AddToCart itemkey={it.itemkey} title={it.item_name} perCarton={it.per_carton} perBundle={it.per_bundle} price={it.price} />
          )}
        </article>
      ))}
    </div>
  );
}
