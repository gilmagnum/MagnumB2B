"use client";
import type { CatalogItem } from "../../lib/supabase";
import AddToCart from "./AddToCart";

// Shared product grid (used by search results; the category page has its own layout).
export default function ProductGrid({ items }: { items: CatalogItem[] }) {
  if (!items.length) return <p style={{ color: "#888" }}>לא נמצאו מוצרים.</p>;
  return (
    <div className="card-grid">
      {items.map((it) => (
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
          <AddToCart itemkey={it.itemkey} title={it.item_name} perCarton={it.per_carton} perBundle={it.per_bundle} price={it.price} />
        </article>
      ))}
    </div>
  );
}
