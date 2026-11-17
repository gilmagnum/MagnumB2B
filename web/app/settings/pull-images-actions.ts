"use server";
import { revalidatePath } from "next/cache";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import { managerOrAbove } from "../../lib/roles";

const BUCKET = "product-images";
const EXT = new Set(["png", "jpg", "jpeg", "webp"]);

// A filename maps to a SKU only when, after a STRICT character check, its base is exactly a catalog
// itemkey (or a `_<n>` camera angle of one, e.g. K365336_BLACK_2.png). We never prefix-match a model
// onto its colour siblings (the bug that bled one colour onto K365336_BLACK_CAMEL), and we never
// sanitise-by-removal — dropping a space/Hebrew char could glue a name onto a *different* real SKU,
// so an unclean name is simply skipped. Only images truly tied to a real SKU are pulled into storage.
function parsePath(filename: string): { base: string; path: string } | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  let ext = filename.slice(dot + 1).toLowerCase();
  if (!EXT.has(ext)) return null;
  if (ext === "jpeg") ext = "jpg";
  const base = filename.slice(0, dot).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(base)) return null; // reject (skip), never strip characters
  return { base, path: `${base}.${ext}` };
}

// Resolve the real catalog SKU a clean base belongs to: an exact itemkey wins; only if the base is
// NOT itself an item do we strip a trailing `_<n>` angle and try that. null = no real SKU (skip).
async function resolveSku(admin: ReturnType<typeof supabaseAdmin>, base: string): Promise<string | null> {
  const stripped = base.replace(/_\d+$/, "");
  for (const k of stripped === base ? [base] : [base, stripped]) {
    const { data } = await admin.from("items").select("itemkey").eq("itemkey", k).maybeSingle();
    if (data) return data.itemkey as string;
  }
  return null;
}

type Prep = { ok?: true; token?: string; path?: string; unmatched?: boolean; error?: string };

// Step 1 (per file): verify the file is tied to a real SKU and hand the browser a scoped,
// single-path signed upload URL. No image bytes pass through the server, and no URL is handed to
// the client — commit rebuilds it from the path, so the client can't bind an arbitrary URL.
export async function prepareImagePull(filename: string): Promise<Prep> {
  const me = await getProfile().catch(() => null);
  if (!me || !managerOrAbove(me.role)) return { error: "אין הרשאה" };
  const p = parsePath(String(filename ?? ""));
  if (!p) return { ok: true, unmatched: true }; // unsupported type or unclean name → skip, listed
  const admin = supabaseAdmin();
  const sku = await resolveSku(admin, p.base);
  if (!sku) return { ok: true, unmatched: true }; // not a real SKU → skip, nothing uploaded
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(p.path, { upsert: true });
  if (error || !data?.token) return { error: `${sku}: ${error?.message ?? "signed url"}` };
  return { ok: true, token: data.token, path: p.path };
}

type Commit = { ok?: true; error?: string };

// Step 2 (per file, after the browser uploaded the bytes): record the image on the item. The client
// sends only the storage PATH — not a SKU, not a URL. The server re-parses it, requires it to be
// already canonical, resolves the SKU itself, and builds the public URL itself, so a client can
// never bind an arbitrary URL or a mismatched SKU to an item. Primary file sets image_url; angles append.
export async function commitImagePull(pathRaw: string, isPrimary: boolean): Promise<Commit> {
  const me = await getProfile().catch(() => null);
  if (!me || !managerOrAbove(me.role)) return { error: "אין הרשאה" };
  const path = String(pathRaw ?? "").trim();
  const p = parsePath(path);
  if (!p || p.path !== path) return { error: "נתיב תמונה לא חוקי" }; // must be exactly our canonical path
  const admin = supabaseAdmin();
  const sku = await resolveSku(admin, p.base);
  if (!sku) return { error: "המק״ט לא נמצא בקטלוג" };
  const { data: cur } = await admin.from("items").select("image_url, images").eq("itemkey", sku).maybeSingle();
  if (!cur) return { error: `${sku} לא נמצא בקטלוג` };
  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(p.path).data.publicUrl; // built server-side, not trusted from client
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
