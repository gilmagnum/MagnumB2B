import { supabase, type CatalogItem } from "../../../lib/supabase";
import CatalogView from "../../components/CatalogView";

export const dynamic = "force-dynamic";

// Category page: sub-category sidebar + filters (brand/group/season/search) + product grid.
export default async function CategoryPage({ params }: { params: Promise<{ main: string }> }) {
  const { main } = await params;
  const name = decodeURIComponent(main);
  const { data, error } = await supabase
    .from("items")
    .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,shown_on_site,matrix_flag")
    .eq("shown_on_site", true)
    .eq("category_main", name)
    .order("category_sub")
    .limit(2000);

  if (error) return <p>שגיאה: {error.message}</p>;
  return <CatalogView categoryMain={name} items={(data ?? []) as CatalogItem[]} />;
}
