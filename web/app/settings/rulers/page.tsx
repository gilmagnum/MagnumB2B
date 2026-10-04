import { redirect } from "next/navigation";
import { getProfile } from "../../../lib/auth";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { canEditRulers } from "../../../lib/roles";
import RulerCard from "./RulerCard";

export const dynamic = "force-dynamic";

type Ruler = { code: string; name: string | null; sizes: string[] | null; active: boolean | null };

export default async function RulersPage() {
  const me = await getProfile();
  if (!me) redirect("/login?next=/settings/rulers");
  if (!canEditRulers(me.role)) redirect("/");

  const admin = supabaseAdmin();
  const { data: rulers } = await admin.from("rulers").select("code, name, sizes, active").order("code");

  // item count per ruler_code (paged read of the ruler_code column)
  const counts: Record<string, number> = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("items").select("ruler_code").not("ruler_code", "is", null).range(from, from + 999);
    if (!data || !data.length) break;
    for (const r of data as { ruler_code: string }[]) counts[r.ruler_code] = (counts[r.ruler_code] ?? 0) + 1;
    if (data.length < 1000) break;
  }

  const all = (rulers ?? []) as Ruler[];
  // Active (in-use) rulers first; dormant ones collapsed below.
  const list = all.filter((r) => r.active !== false);
  const dormant = all.filter((r) => r.active === false);
  const filled = all.filter((r) => (r.sizes?.length ?? 0) > 0).length;

  return (
    <>
      <p><a href="/settings" style={{ color: "var(--brand)" }}>← הגדרות</a></p>
      <h1>סרגלי מידות</h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
        {all.length} סרגלים · {filled} עם ערכים · {list.length} בשימוש. כל סרגל מקבל רשימת מידות (בסדר) שתוצג לבחירה בהזמנות ובליקוט למוצרים עם אותו קוד סרגל.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16, marginTop: 16 }}>
        {list.map((r) => (
          <RulerCard key={r.code} code={r.code} name={r.name} itemCount={counts[r.code] ?? 0} initialSizes={r.sizes ?? []} />
        ))}
      </div>

      {dormant.length > 0 && (
        <details style={{ marginTop: 28 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--ink-muted)" }}>
            סרגלים לא בשימוש (12 ח׳ אחרונות) — {dormant.length}
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16, marginTop: 16 }}>
            {dormant.map((r) => (
              <RulerCard key={r.code} code={r.code} name={r.name} itemCount={counts[r.code] ?? 0} initialSizes={r.sizes ?? []} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}
