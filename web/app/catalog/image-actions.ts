"use server";
import { revalidatePath } from "next/cache";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import { managerOrAbove } from "../../lib/roles";

const BUCKET = "product-images";

type Res = { ok?: true; url?: string; error?: string };

function extFor(file: File): string {
  const t = file.type;
  if (t === "image/png") return "png";
  if (t === "image/webp") return "webp";
  if (t === "image/jpeg") return "jpg";
  const m = file.name.match(/\.(png|jpe?g|webp)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

async function upload(path: string, file: File): Promise<string> {
  const admin = supabaseAdmin();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw new Error(error.message);
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`; // cache-bust so the new image shows immediately
}

// Replace a product's MAIN image (manager+). Keeps the item's other gallery images.
export async function uploadProductImageAction(_prev: Res, formData: FormData): Promise<Res> {
  const me = await getProfile().catch(() => null);
  if (!me || !managerOrAbove(me.role)) return { error: "אין הרשאה" };
  const itemkey = String(formData.get("itemkey") ?? "").trim();
  const file = formData.get("file");
  if (!itemkey) return { error: "מק״ט חסר" };
  if (!(file instanceof File) || file.size === 0) return { error: "לא נבחר קובץ" };
  if (file.size > 8 * 1024 * 1024) return { error: "הקובץ גדול מדי (עד 8MB)" };
  try {
    const url = await upload(`${itemkey}.${extFor(file)}`, file);
    const admin = supabaseAdmin();
    const { data: cur } = await admin.from("items").select("images").eq("itemkey", itemkey).single();
    const rest = ((cur?.images as string[] | null) ?? []).filter((u) => u && u.split("?")[0] !== url.split("?")[0]);
    await admin.from("items").update({ image_url: url, images: [url, ...rest] }).eq("itemkey", itemkey);
    revalidatePath(`/product/${itemkey}`);
    return { ok: true, url };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Set a category's representative image (manager+), stored as an override in app_settings.
export async function setCategoryImageAction(_prev: Res, formData: FormData): Promise<Res> {
  const me = await getProfile().catch(() => null);
  if (!me || !managerOrAbove(me.role)) return { error: "אין הרשאה" };
  const category = String(formData.get("category") ?? "").trim();
  const file = formData.get("file");
  if (!category) return { error: "קטגוריה חסרה" };
  if (!(file instanceof File) || file.size === 0) return { error: "לא נבחר קובץ" };
  if (file.size > 8 * 1024 * 1024) return { error: "הקובץ גדול מדי (עד 8MB)" };
  try {
    const safe = encodeURIComponent(category).replace(/%/g, "_");
    const url = await upload(`categories/${safe}.${extFor(file)}`, file);
    await supabaseAdmin().from("app_settings")
      .upsert({ key: `category_image:${category}`, value: { url }, updated_at: new Date().toISOString() }, { onConflict: "key" });
    revalidatePath("/catalog");
    return { ok: true, url };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
