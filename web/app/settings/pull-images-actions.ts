"use server";
import { revalidatePath } from "next/cache";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import { managerOrAbove } from "../../lib/roles";

const BUCKET = "product-images";
const EXT = new Set(["png", "jpg", "jpeg", "webp"]);

// A filename maps to a SKU only when it is EXACTLY a catalog itemkey (optionally with a trailing
// `_<n>` camera-angle suffix, e.g. K365336_BLACK_2.png). We never prefix-match a model onto its
// colour siblings — that is the bug that bled one colour's photo onto K365336_BLACK_CAMEL etc.
// Only images truly tied to a real SKU are pulled into our storage.
function parse(filename: string): { sku: string; path: string } | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  let ext = filename.slice(dot + 1).toLowerCase();
  if (!EXT.has(ext)) return null;
  if (ext === "jpeg") ext = "jpg";
  const safe = filename.slice(0, dot).trim().replace(/[^A-Za-z0-9_-]/g, "");
  if (!safe) return null;
  const sku = safe.replace(/_\d+$/, ""); // drop a numeric angle suffix to find the item it belongs to
  return { sku, path: `${safe}.${ext}` };
}

type Prep = { ok?: true; token?: string; path?: string; publicUrl?: string; unmatched?: boolean; error?: string };

// Step 1 (per file): verify the file is tied to a real SKU and hand the browser a scoped,
// single-path signed upload URL. No image bytes pass through the server.
export async function prepareImagePull(filename: string): Promise<Prep> {
  const me = await getProfile().catch(() => null);
  if (!me || !managerOrAbove(me.role)) return { error: "אין הרשאה" };
  const p = parse(String(filename ?? ""));
  if (!p) return { error: `${filename}: סוג קובץ לא נתמך` };
  const admin = supabaseAdmin();
  const { data: item } = await admin.from("items").select("itemkey").eq("itemkey", p.sku).maybeSingle();
  if (!item) return { ok: true, unmatched: true }; // not a real SKU → skip, nothing uploaded
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(p.path, { upsert: true });
  if (error || !data?.token) return { error: `${p.sku}: ${error?.message ?? "signed url"}` };
  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(p.path).data.publicUrl;
  return { ok: true, token: data.token, path: p.path, publicUrl };
}

type Commit = { ok?: true; error?: string };

// Step 2 (per file, after the browser uploaded the bytes): record the image on the item.
// Primary file sets image_url; extra angles append to images[].
export async function commitImagePull(skuRaw: string, publicUrl: string, isPrimary: boolean): Promise<Commit> {
  const me = await getProfile().catch(() => null);
  if (!me || !managerOrAbove(me.role)) return { error: "אין הרשאה" };
  const sku = String(skuRaw ?? "").trim();
  // Defence: only ever store a URL that lives inside our own public bucket.
  const prefix = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET}/`;
  if (!publicUrl || !publicUrl.startsWith(prefix)) return { error: "כתובת תמונה לא חוקית" };
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("items").select("image_url, images").eq("itemkey", sku).maybeSingle();
  if (!cur) return { error: `${sku} לא נמצא בקטלוג` };
  const url = `${publicUrl}?v=${Date.now()}`; // cache-bust so the new image shows at once
  const existing = ((cur.images as string[] | null) ?? (cur.image_url ? [cur.image_url as string] : []));
  const dedup = existing.filter((u) => u && u.split("?")[0] !== url.split("?")[0]);
  const images = isPrimary ? [url, ...dedup] : [...dedup, url];
  const patch: Record<string, unknown> = { images };
  if (isPrimary || !cur.image_url) patch.image_url = url;
  const { error } = await admin.from("items").update(patch).eq("itemkey", sku);
  if (error) return { error: `${sku}: ${error.message}` };
  revalidatePath(`/product/${sku}`);
  return { ok: true };
}

// Shown-on-site products that have no image. Matrix CELL children are excluded — their photo lives
// on the parent model (see fetchImages), so a cell without its own image is not "missing".
export async function countMissingImages(): Promise<{ total: number; sample: string[] } | { error: string }> {
  const me = await getProfile().catch(() => null);
  if (!me || !managerOrAbove(me.role)) return { error: "אין הרשאה" };
  const admin = supabaseAdmin();
  const variants = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("item_variants").select("itemkey").range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) variants.add(r.itemkey as string);
    if (data.length < 1000) break;
  }
  const missing: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("items").select("itemkey").eq("shown_on_site", true).is("image_url", null).range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) { const k = r.itemkey as string; if (!variants.has(k)) missing.push(k); }
    if (data.length < 1000) break;
  }
  missing.sort();
  return { total: missing.length, sample: missing.slice(0, 50) };
}
