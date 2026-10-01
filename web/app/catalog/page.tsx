import { supabase, type CatalogItem } from "../../lib/supabase";

// Catalog list — reads shown-on-site items from Supabase (synced from Hashavshevet by the bridge).
export default async function CatalogPage() {
  const { data, error } = await supabase
    .from("items")
    .select("itemkey,item_name,category_main,category_sub,brand,price,per_carton,per_bundle,image_url,shown_on_site,matrix_flag")
    .eq("shown_on_site", true)
    .order("category_main")
    .limit(200);

  if (error) return <p>שגיאה בטעינת הקטלוג: {error.message}</p>;
  const items = (data ?? []) as CatalogItem[];
  if (!items.length) return <p>אין פריטים להצגה (ודא שהגשר סנכרן את הקטלוג ל-Supabase).</p>;

  return (
    <>
      <h1>קטלוג מוצרים</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16 }}>
        {items.map((it) => (
          <article key={it.itemkey} style={{ border: "1px solid #e2e2e2", borderRadius: 8, padding: 12 }}>
            {it.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image_url} alt={it.item_name} style={{ width: "100%", height: 140, objectFit: "contain" }} />
            ) : (
              <div style={{ height: 140, background: "#f5f5f5", borderRadius: 4 }} />
            )}
            <h3 style={{ fontSize: 15, margin: "8px 0 4px" }}>{it.item_name}</h3>
            <div style={{ fontSize: 12, color: "#666" }}>מק״ט: {it.itemkey}</div>
            {it.brand && <div style={{ fontSize: 12, color: "#666" }}>מותג: {it.brand}</div>}
            <div style={{ marginTop: 6, fontWeight: 700 }}>
              {it.price != null ? `${it.price} ₪` : ""} {it.per_carton ? `· ${it.per_carton} בקרטון` : ""}
            </div>
            {it.matrix_flag && <span style={{ fontSize: 11, color: "#1e2a78" }}>מטריצה</span>}
          </article>
        ))}
      </div>
    </>
  );
}
