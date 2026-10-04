import { getProfile } from "../../../../lib/auth";
import { sendPush } from "../../../../lib/push";
import { supabaseServer } from "../../../../lib/supabase/server";
import { canManageUsers } from "../../../../lib/roles";

export const dynamic = "force-dynamic";

// Superadmin-only: send a test push to yourself (verifies the whole chain).
export async function POST() {
  const me = await getProfile();
  if (!me || !canManageUsers(me.role)) return Response.json({ error: "forbidden" }, { status: 403 });
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  const res = await sendPush([user!.id], { title: "מגנום — בדיקת התראה", body: "התראות הפוש עובדות ✓", url: "/" });
  return Response.json(res);
}
