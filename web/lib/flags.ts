import { supabaseBrowser } from "./supabase/browser";

// Feature flags live in app_settings (readable by anon/authenticated). Safe reads: any failure or a
// missing row means "off", so a flag can't break the screen that reads it.
export const SHARED_PICKING_KEY = "shared_picking_enabled";

export async function getFlag(key: string): Promise<boolean> {
  try {
    const { data } = await supabaseBrowser().from("app_settings").select("value").eq("key", key).maybeSingle();
    return data?.value === true;
  } catch {
    return false;
  }
}

export const getSharedPickingEnabled = () => getFlag(SHARED_PICKING_KEY);
