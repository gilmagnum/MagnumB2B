import { supabase, type CatalogItem } from "../../../lib/supabase";
import CatalogView from "../../components/CatalogView";
import ImageUploader from "../../components/ImageUploader";

export const dynamic = "force-dynamic";

// Category page: sub-category sidebar + filters (brand/group/season/search) + product grid.
export default async function CategoryPage({ params }: { params: Promise<{ main: string }> }) {
  const { main } = await params;
  const name = decodeURIComponent(main);
  // Newest first: item_seq (true creation order from Hashavshevet) when populated;
  // until then, items that have a photo (the new collection) float up, then SKU desc.
  const { data, error } = await supabase
    .from("items")
    .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,shown_on_site,matrix_flag,is_carton_size_item")
    .eq("shown_on_site", true)
    .eq("category_main", name)
    .order("item_seq", { ascending: false, nullsFirst: false })
    .order("image_url", { ascending: false, nullsFirst: false })
    .order("itemkey", { ascending: false })
    .limit(3000);

  if (error) return <p>שגיאה: {error.message}</p>;

  // All main categories (for the top category bar), ordered by item count.
  const { data: catRows } = await supabase
    .from("items").select("category_main").eq("shown_on_site", true).not("category_main", "is", null).limit(5000);
  const counts = new Map<string, number>();
  for (const r of catRows ?? []) { const k = (r as { category_main: string }).category_main; counts.set(k, (counts.get(k) ?? 0) + 1); }
  const allCategories = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

  return (
    <>
      <ImageUploader kind="category" id={name} compact />
      <CatalogView categoryMain={name} items={(data ?? []) as CatalogItem[]} allCategories={allCategories} />
    </>
  );
}
