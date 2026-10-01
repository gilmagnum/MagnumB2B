import { supabase } from "../../lib/supabase";

// Read fresh from Supabase each request (catalog is synced from Hashavshevet, not build-time).
export const dynamic = "force-dynamic";

// Catalog landing = grid of MAIN categories (like the current site's home).
export default async function CatalogHome() {
  const { data, error } = await supabase
    .from("items")
    .select("category_main,image_url")
    .eq("shown_on_site", true)
    .not("category_main", "is", null)
    .limit(5000);

  if (error) return <p>שגיאה בטעינת הקטלוג: {error.message}</p>;

  const map = new Map<string, { count: number; image: string | null }>();
  for (const r of data ?? []) {
    const k = (r as { category_main: string | null }).category_main;
    if (!k) continue;
    const e = map.get(k) ?? { count: 0, image: null };
    e.count++;
    if (!e.image && (r as { image_url: string | null }).image_url) e.image = (r as { image_url: string | null }).image_url;
    map.set(k, e);
  }
  const cats = [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  if (!cats.length) return <p>אין קטגוריות להצגה (סנכרן את הקטלוג).</p>;

  return (
    <>
      <h1>קטלוג מוצרים</h1>
      <form action="/search" style={{ margin: "8px 0 24px" }}>
        <input name="q" placeholder="חיפוש מוצר בכל הקטלוג…" aria-label="חיפוש מוצר"
          className="input" style={{ maxWidth: 440 }} />
      </form>
      <div className="cat-grid">
        {cats.map(([name, info]) => (
          <a key={name} href={`/catalog/${encodeURIComponent(name)}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="product-card" style={{ padding: 0, overflow: "hidden" }}>
              {info.image
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={info.image} alt={name} className="img-square" style={{ borderRadius: 0 }} />
                : <div style={{ aspectRatio: "1 / 1", background: "var(--surface-muted)" }} />}
              <div style={{ textAlign: "center", padding: 14, color: "var(--brand-strong)", fontWeight: 700 }}>
                {name} <span style={{ color: "var(--ink-muted)", fontWeight: 400, fontSize: 13 }}>({info.count})</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
