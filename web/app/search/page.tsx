import { supabase, type CatalogItem } from "../../lib/supabase";
import ProductGrid from "../components/ProductGrid";

export const dynamic = "force-dynamic";

// Global catalog search. Backed by pg_trgm indexes on item_name + itemkey (fast ilike).
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  // Sanitize: these chars break the PostgREST or-filter grammar.
  const term = q.replace(/[,()*%]/g, " ").trim();

  if (term.length < 2) return <p>הקלד לפחות 2 תווים לחיפוש.</p>;

  const { data, error } = await supabase
    .from("items")
    .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,shown_on_site,matrix_flag")
    .eq("shown_on_site", true)
    .or(`item_name.ilike.%${term}%,itemkey.ilike.%${term}%`)
    .order("item_seq", { ascending: false, nullsFirst: false })
    .order("image_url", { ascending: false, nullsFirst: false })
    .order("itemkey", { ascending: false })
    .limit(200);

  if (error) return <p>שגיאה: {error.message}</p>;
  const items = (data ?? []) as CatalogItem[];

  return (
    <>
      <h1>תוצאות חיפוש: “{q}”</h1>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 12 }}>{items.length} מוצרים{items.length === 200 ? " (מוצגות 200 הראשונות)" : ""}</p>
      <ProductGrid items={items} />
    </>
  );
}
