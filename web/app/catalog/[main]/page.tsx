import { supabase, type CatalogItem } from "../../../lib/supabase";
import CatalogView from "../../components/CatalogView";

export const dynamic = "force-dynamic";

// Category page: sub-category sidebar + filters (brand/group/season/search) + product grid.
export default async function CategoryPage({ params }: { params: Promise<{ main: string }> }) {
  const { main } = await params;
  const name = decodeURIComponent(main);
  // Newest first: item_seq (true creation order from Hashavshevet) when populated;
  // until then, items that have a photo (the new collection) float up, then SKU desc.
  const { data, error } = await supabase
    .from("items")
    .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,shown_on_site,matrix_flag")
    .eq("shown_on_site", true)
    .eq("category_main", name)
    .order("item_seq", { ascending: false, nullsFirst: false })
    .order("image_url", { ascending: false, nullsFirst: false })
    .order("itemkey", { ascending: false })
    .limit(3000);

  if (error) return <p>שגיאה: {error.message}</p>;
  return <CatalogView categoryMain={name} items={(data ?? []) as CatalogItem[]} />;
}
