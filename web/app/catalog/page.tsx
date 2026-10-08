import { supabase, type CatalogItem } from "../../lib/supabase";
import CatalogView from "../components/CatalogView";

// Read fresh from Supabase each request (catalog is synced from Hashavshevet, not build-time).
export const dynamic = "force-dynamic";

// Catalog landing: the same browse layout as a category (main+sub bars, search, filters, sort)
// over the whole catalog, newest first. The main-category bar filters in-page.
export default async function CatalogHome() {
  // Supabase REST caps a single response at 1000 rows regardless of .limit(),
  // so the full catalog (>1000 items) must be read page by page — otherwise the
  // oldest items (lowest item_seq) silently drop out of every category.
  const PAGE = 1000;
  const items: CatalogItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("items")
      .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,shown_on_site,matrix_flag,is_carton_size_item,ruler_code,stock,ignore_stock,barcode")
      .eq("shown_on_site", true)
      .order("item_seq", { ascending: false, nullsFirst: false })
      .order("image_url", { ascending: false, nullsFirst: false })
      .order("itemkey", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return <p>שגיאה בטעינת הקטלוג: {error.message}</p>;
    const batch = (data ?? []) as CatalogItem[];
    items.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Main categories ordered by product count (for the top bar).
  const counts = new Map<string, number>();
  for (const i of items) { const k = i.category_main; if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
  const allCategories = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

  if (!items.length) return <p>אין מוצרים להצגה (סנכרן את הקטלוג).</p>;

  return <CatalogView items={items} allCategories={allCategories} heading="קטלוג מוצרים" />;
}
