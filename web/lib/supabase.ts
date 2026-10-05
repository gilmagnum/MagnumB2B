import { createClient } from "@supabase/supabase-js";

// Catalog/presentation data lives in Supabase (synced from Hashavshevet by the bridge).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
);

// Serve a resized/compressed thumbnail via Supabase image transforms instead of the
// full-res original (grid images are ~3000px). Falls back to the original if null.
export function thumb(url: string | null | undefined, width = 400): string | undefined {
  if (!url) return undefined;
  if (!url.includes("/object/public/")) return url;
  return url.replace("/object/public/", "/render/image/public/") + `?width=${width}&resize=contain&quality=75`;
}

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
  images?: string[] | null;
  shown_on_site: boolean;
  matrix_flag: boolean;
  is_carton_size_item?: boolean;   // NoteID 26 — each carton a different size (matrix-like); order inside product only
  ruler_code?: string | null;      // size ruler — a single-SKU "ruler product" ordered per size inside the product
  stock?: number | null;           // Items.Quantity (synced); matrix PARENT is ~0 (stock lives on the cells)
  ignore_stock?: boolean | null;   // if true, open for FUTURE orders even with no stock
};
