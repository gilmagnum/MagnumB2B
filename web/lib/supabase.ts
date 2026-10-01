import { createClient } from "@supabase/supabase-js";

// Catalog/presentation data lives in Supabase (synced from Hashavshevet by the bridge).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
);

export type CatalogItem = {
  itemkey: string;
  item_name: string;
  category_main: string | null;
  category_sub: string | null;
  brand: string | null;
  season: string | null;
  group_name: string | null;
  price: number | null;
  per_carton: number | null;
  per_bundle: number | null;
  image_url: string | null;
  shown_on_site: boolean;
  matrix_flag: boolean;
};
