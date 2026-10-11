import { redirect } from "next/navigation";
import { getProfile } from "../../../lib/auth";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { canEditRulers } from "../../../lib/roles";
import { COLOR_OVERRIDES_KEY } from "../../../lib/colorOverrides";
import ColorsEditor from "./ColorsEditor";

export const dynamic = "force-dynamic";

// Manager tool: set the hue shown for each color name (catalog matrix + picking).
export default async function ColorsSettingsPage() {
  const me = await getProfile();
  if (!me) redirect("/login?next=/settings/colors");
  if (!canEditRulers(me.role)) redirect("/settings");

  const admin = supabaseAdmin();

  // Distinct color names from the catalog variants, by frequency (so the common ones are on top).
  const counts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("item_variants").select("color_label").range(from, from + 999);
    const batch = data ?? [];
    for (const r of batch as { color_label: string | null }[]) {
      const c = (r.color_label ?? "").trim();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    if (batch.length < 1000) break;
  }
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  const { data: ovRow } = await admin.from("app_settings").select("value").eq("key", COLOR_OVERRIDES_KEY).maybeSingle();
  const overrides = (ovRow?.value as Record<string, string> | null) ?? {};

  return (
    <>
      <h1>גווני צבעים</h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 14, marginTop: 4, maxWidth: 560 }}>
        קבע את הגוון שמוצג לכל שם צבע — בקטלוג (מטריצה) ובמסך הליקוט. שינוי חל על כל שם שמכיל את הטקסט (למשל “נייבי” חל גם על “נייבי 104”). שמות שלא שונו משתמשים בגוון ברירת המחדל.
      </p>
      <ColorsEditor names={names} initialOverrides={overrides} />
    </>
  );
}
