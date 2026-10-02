import { redirect } from "next/navigation";
import { getProfile } from "../../../lib/auth";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import RulerCard from "./RulerCard";

export const dynamic = "force-dynamic";

type Ruler = { code: string; name: string | null; sizes: string[] | null };

export default async function RulersPage() {
  const me = await getProfile();
  if (!me) redirect("/login?next=/admin/rulers");
  if (me.role !== "admin") redirect("/");

  const admin = supabaseAdmin();
  const { data: rulers } = await admin.from("rulers").select("code, name, sizes").order("code");

  // item count per ruler_code (paged read of the ruler_code column)
  const counts: Record<string, number> = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("items").select("ruler_code").not("ruler_code", "is", null).range(from, from + 999);
    if (!data || !data.length) break;
    for (const r of data as { ruler_code: string }[]) counts[r.ruler_code] = (counts[r.ruler_code] ?? 0) + 1;
    if (data.length < 1000) break;
  }

  const list = (rulers ?? []) as Ruler[];
  const filled = list.filter((r) => (r.sizes?.length ?? 0) > 0).length;

  return (
    <>
      <p><a href="/admin" style={{ color: "var(--brand)" }}>← ניהול</a></p>
      <h1>סרגלי מידות</h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
        {list.length} סרגלים · {filled} עם ערכים. כל סרגל מקבל רשימת מידות (בסדר) שתוצג לבחירה בהזמנות ובליקוט למוצרים עם אותו קוד סרגל.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16, marginTop: 16 }}>
        {list.map((r) => (
          <RulerCard key={r.code} code={r.code} name={r.name} itemCount={counts[r.code] ?? 0} initialSizes={r.sizes ?? []} />
        ))}
      </div>
    </>
  );
}
