import { supabaseBrowser } from "./supabase/browser";

// Manager-set color overrides (color name -> hex) live in app_settings under this key.
export const COLOR_OVERRIDES_KEY = "color_overrides";

// Load the overrides map for the catalog/picking color swatches. Safe (read-only); on any
// failure returns an empty map so the built-in colors still apply.
export async function getColorOverrides(): Promise<Record<string, string>> {
  try {
    const { data } = await supabaseBrowser()
      .from("app_settings").select("value").eq("key", COLOR_OVERRIDES_KEY).maybeSingle();
    const v = data?.value as Record<string, string> | null;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
