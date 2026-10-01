import { supabaseBrowser } from "./supabase/browser";

// Look up product image URLs for a set of SKUs (images live in Supabase, not Hashavshevet).
// Used to show thumbnails in cart / picking / document lines.
export async function fetchImages(itemkeys: (string | null | undefined)[]): Promise<Record<string, string>> {
  const keys = [...new Set(itemkeys.filter(Boolean) as string[])];
  if (!keys.length) return {};
  const out: Record<string, string> = {};
  const sb = supabaseBrowser();
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const { data } = await sb.from("items").select("itemkey,image_url").in("itemkey", chunk);
    for (const r of (data ?? []) as { itemkey: string; image_url: string | null }[]) {
      if (r.image_url) out[r.itemkey] = r.image_url;
    }
  }
  return out;
}
