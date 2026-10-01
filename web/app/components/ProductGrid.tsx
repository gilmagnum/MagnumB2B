"use client";
import type { CatalogItem } from "../../lib/supabase";
import AddToCart from "./AddToCart";

// Shared product grid (used by search results; the category page has its own layout).
export default function ProductGrid({ items }: { items: CatalogItem[] }) {
  if (!items.length) return <p style={{ color: "#888" }}>לא נמצאו מוצרים.</p>;
  return (
    <div className="card-grid">
      {items.map((it) => (
        <article key={it.itemkey} style={{ border: "1px solid #e2e2e2", borderRadius: 8, padding: 12 }}>
          {it.image_url
            ? // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image_url} alt={it.item_name} loading="lazy" className="img-square" />
            : <div style={{ aspectRatio: "1 / 1", background: "#f5f5f5", borderRadius: 6 }} />}
          <h3 style={{ fontSize: 15, margin: "8px 0 4px" }}>
            <a href={`/product/${encodeURIComponent(it.itemkey)}`} style={{ color: "#1e2a78", textDecoration: "none" }}>{it.item_name}</a>
          </h3>
          <div style={{ fontSize: 12, color: "#666" }}>מק״ט: {it.itemkey}</div>
          {it.category_main && <div style={{ fontSize: 12, color: "#666" }}>{it.category_main}{it.category_sub ? ` · ${it.category_sub}` : ""}</div>}
          <div style={{ marginTop: 6, fontWeight: 700 }}>
            {it.price != null ? `${it.price} ₪` : ""} {it.per_carton ? `· ${it.per_carton} בקרטון` : ""}
          </div>
          <AddToCart itemkey={it.itemkey} title={it.item_name} perCarton={it.per_carton} perBundle={it.per_bundle} price={it.price} />
        </article>
      ))}
    </div>
  );
}
