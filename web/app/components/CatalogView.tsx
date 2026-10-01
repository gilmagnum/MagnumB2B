"use client";
import { useMemo, useState } from "react";
import type { CatalogItem } from "../../lib/supabase";
import { useOrderContext } from "../../lib/useOrderContext";
import AddToCart from "./AddToCart";

const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();

export default function CatalogView({ categoryMain, items }: { categoryMain: string; items: CatalogItem[] }) {
  const { ctx } = useOrderContext();
  const [sub, setSub] = useState<string>("");       // selected sub-category
  const [brand, setBrand] = useState<string>("");
  const [season, setSeason] = useState<string>("");
  const [group, setGroup] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const subs = useMemo(() => uniq(items.map((i) => i.category_sub)), [items]);
  const brands = useMemo(() => uniq(items.map((i) => i.brand)), [items]);
  const seasons = useMemo(() => uniq(items.map((i) => i.season)), [items]);
  const groups = useMemo(() => uniq(items.map((i) => i.group_name)), [items]);

  const shown = useMemo(() => items.filter((i) =>
    (!sub || i.category_sub === sub) &&
    (!brand || i.brand === brand) &&
    (!season || i.season === season) &&
    (!group || i.group_name === group) &&
    (!q || i.item_name?.includes(q) || i.itemkey?.toLowerCase().includes(q.toLowerCase()))
  ), [items, sub, brand, season, group, q]);

  return (
    <div className="cat-layout">
      {/* sidebar: sub-categories */}
      <aside>
        <h2 style={{ color: "#1e2a78", borderBottom: "3px solid #f1c40f", paddingBottom: 4 }}>{categoryMain}</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0" }}>
          <li><button onClick={() => setSub("")} style={linkBtn(!sub)}>הכל</button></li>
          {subs.map((s) => (
            <li key={s}><button onClick={() => setSub(s)} style={linkBtn(sub === s)}>{s}</button></li>
          ))}
        </ul>
      </aside>

      <section>
        <div className="card" style={{ marginBottom: 14, padding: "10px 14px", fontSize: 13, background: ctx ? "var(--brand-soft)" : "var(--surface-muted)", color: "var(--ink)", borderColor: ctx ? "var(--brand-soft)" : "var(--border)" }}>
          {ctx
            ? <>מזמין עבור <b>{ctx.customerName}</b>. הקטלוג מציג מחירון כללי — המחיר הסופי של הלקוח מוצג בעמוד המוצר ובסל.</>
            : <>מוצג <b>מחירון כללי</b>. לכניסה למחיר לקוח — <a href="/customer">בחר לקוח</a>.</>}
        </div>
        {/* filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <input placeholder="חיפוש חופשי…" value={q} onChange={(e) => setQ(e.target.value)} className="input" style={{ maxWidth: 220 }} />
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="select" style={{ maxWidth: 170 }}><option value="">סינון קבוצה</option>{groups.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className="select" style={{ maxWidth: 170 }}><option value="">סינון מותג</option>{brands.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={season} onChange={(e) => setSeason(e.target.value)} className="select" style={{ maxWidth: 170 }}><option value="">סינון עונה</option>{seasons.map((x) => <option key={x}>{x}</option>)}</select>
        </div>

        <div style={{ color: "var(--ink-muted)", fontSize: 13, marginBottom: 10 }}>{shown.length} מוצרים</div>
        <div className="card-grid">
          {shown.map((it) => (
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
                {it.price != null ? `${it.price} ₪` : ""} {it.per_carton ? <span style={{ fontWeight: 400, color: "var(--ink-muted)", fontSize: 12 }}>· {it.per_carton} בקרטון</span> : ""}
              </div>
              {it.matrix_flag && <span className="chip chip-info" style={{ marginTop: 6 }}>מטריצה</span>}
              <AddToCart itemkey={it.itemkey} title={it.item_name} perCarton={it.per_carton} perBundle={it.per_bundle} price={it.price} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

const linkBtn = (active: boolean) => ({
  background: "none", border: 0, cursor: "pointer", padding: "5px 0", fontSize: 14,
  color: active ? "var(--brand)" : "var(--ink-muted)", fontWeight: active ? 700 : 500, textAlign: "right" as const, width: "100%",
});
