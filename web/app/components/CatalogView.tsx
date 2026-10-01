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
        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, fontSize: 13, background: ctx ? "#eef7ff" : "#f7f7f7", color: "#333" }}>
          {ctx
            ? <>מזמין עבור <b>{ctx.customerName}</b>. הקטלוג מציג מחירון כללי — המחיר הסופי של הלקוח מוצג בעמוד המוצר ובסל.</>
            : <>מוצג <b>מחירון כללי</b>. לכניסה למחיר לקוח — <a href="/customer" style={{ color: "#1e2a78" }}>בחר לקוח</a>.</>}
        </div>
        {/* filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <input placeholder="חיפוש חופשי…" value={q} onChange={(e) => setQ(e.target.value)} style={inp} />
          <select value={group} onChange={(e) => setGroup(e.target.value)} style={inp}><option value="">סינון קבוצה</option>{groups.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} style={inp}><option value="">סינון מותג</option>{brands.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={season} onChange={(e) => setSeason(e.target.value)} style={inp}><option value="">סינון עונה</option>{seasons.map((x) => <option key={x}>{x}</option>)}</select>
        </div>

        <div style={{ color: "#888", fontSize: 13, marginBottom: 8 }}>{shown.length} מוצרים</div>
        <div className="card-grid">
          {shown.map((it) => (
            <article key={it.itemkey} style={{ border: "1px solid #e2e2e2", borderRadius: 8, padding: 12 }}>
              {it.image_url
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt={it.item_name} loading="lazy" className="img-square" />
                : <div style={{ aspectRatio: "1 / 1", background: "#f5f5f5", borderRadius: 6 }} />}
              <h3 style={{ fontSize: 15, margin: "8px 0 4px" }}>
                <a href={`/product/${encodeURIComponent(it.itemkey)}`} style={{ color: "#1e2a78", textDecoration: "none" }}>{it.item_name}</a>
              </h3>
              <div style={{ fontSize: 12, color: "#666" }}>מק״ט: {it.itemkey}</div>
              {it.brand && <div style={{ fontSize: 12, color: "#666" }}>מותג: {it.brand}</div>}
              <div style={{ marginTop: 6, fontWeight: 700 }}>
                {it.price != null ? `${it.price} ₪` : ""} {it.per_carton ? `· ${it.per_carton} בקרטון` : ""}
              </div>
              {it.matrix_flag && <span style={{ fontSize: 11, color: "#1e2a78" }}>מטריצה</span>}
              <AddToCart itemkey={it.itemkey} title={it.item_name} perCarton={it.per_carton} perBundle={it.per_bundle} price={it.price} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

const inp = { padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, minWidth: 140 };
const linkBtn = (active: boolean) => ({
  background: "none", border: 0, cursor: "pointer", padding: "4px 0", fontSize: 14,
  color: active ? "#1e2a78" : "#444", fontWeight: active ? 700 : 400, textAlign: "right" as const, width: "100%",
});
