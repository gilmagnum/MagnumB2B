"use server";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import { canEditRulers } from "../../lib/roles";
import { COLOR_OVERRIDES_KEY } from "../../lib/colorOverrides";

// Manager (admin+) saves the color-name -> hex overrides used by the catalog/picking swatches.
export async function saveColorOverrides(map: Record<string, string>): Promise<{ ok?: boolean; error?: string }> {
  const me = await getProfile().catch(() => null);
  if (!me || !canEditRulers(me.role)) return { error: "אין הרשאה" };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    const name = String(k).trim().slice(0, 40);
    if (name && /^#[0-9a-fA-F]{6}$/.test(String(v))) clean[name] = String(v).toLowerCase();
    if (Object.keys(clean).length >= 300) break;
  }
  const { error } = await supabaseAdmin().from("app_settings")
    .upsert({ key: COLOR_OVERRIDES_KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { error: error.message };
  return { ok: true };
}
