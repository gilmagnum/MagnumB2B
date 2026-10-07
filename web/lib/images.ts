import { supabaseBrowser } from "./supabase/browser";

// Look up product image URLs for a set of SKUs (images live in Supabase, not Hashavshevet).
// Used to show thumbnails in cart / picking / document lines.
// Matrix lines carry a variant SKU whose own row has no image — the photo lives on the
// PARENT product — so for any key still without an image we resolve its parent via
// item_variants and use the parent's image.
export async function fetchImages(itemkeys: (string | null | undefined)[]): Promise<Record<string, string>> {
  const keys = [...new Set(itemkeys.filter(Boolean) as string[])];
  if (!keys.length) return {};
  const out: Record<string, string> = {};
  const sb = supabaseBrowser();

  const fetchInto = async (lookup: string[], target: Record<string, string>) => {
    for (let i = 0; i < lookup.length; i += 200) {
      const chunk = lookup.slice(i, i + 200);
      const { data } = await sb.from("items").select("itemkey,image_url").in("itemkey", chunk);
      for (const r of (data ?? []) as { itemkey: string; image_url: string | null }[]) {
        if (r.image_url) target[r.itemkey] = r.image_url;
      }
    }
  };

  // 1) direct image on the SKU's own row (plain + ruler items, whose line SKU is the parent)
  await fetchInto(keys, out);

  // 2) for keys still missing, map variant SKU -> parent and use the parent's image
  const missing = keys.filter((k) => !out[k]);
  if (missing.length) {
    const parentOf: Record<string, string> = {};
    for (let i = 0; i < missing.length; i += 200) {
      const chunk = missing.slice(i, i + 200);
      const { data } = await sb.from("item_variants").select("itemkey,parent_itemkey").in("itemkey", chunk);
      for (const r of (data ?? []) as { itemkey: string; parent_itemkey: string | null }[]) {
        if (r.parent_itemkey) parentOf[r.itemkey] = r.parent_itemkey;
      }
    }
    const parents = [...new Set(Object.values(parentOf))];
    if (parents.length) {
      const parentImg: Record<string, string> = {};
      await fetchInto(parents, parentImg);
      for (const k of missing) {
        const p = parentOf[k];
        if (p && parentImg[p]) out[k] = parentImg[p];
      }
    }
  }
  return out;
}
