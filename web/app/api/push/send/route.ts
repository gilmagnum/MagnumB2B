import { NextRequest } from "next/server";
import { getProfile } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { sendPush } from "../../../../lib/push";
import { canManageUsers } from "../../../../lib/roles";
import { isInternalUrl } from "../../../../lib/pushEvents";

export const dynamic = "force-dynamic";

// Superadmin: send a push to all / a role / a specific user.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !canManageUsers(me.role)) return Response.json({ error: "forbidden" }, { status: 403 });

  const { title, body, url, target } = await req.json().catch(() => ({}));
  if (!title) return Response.json({ error: "חסרה כותרת" }, { status: 400 });

  let profileIds: string[] | null = null; // null = everyone
  if (target?.type === "role") {
    const { data } = await supabaseAdmin().from("profiles").select("id").eq("role", target.value);
    profileIds = (data ?? []).map((r) => r.id);
  } else if (target?.type === "user") {
    profileIds = [String(target.value)];
  }
  const res = await sendPush(profileIds, { title, body: body || "", url: isInternalUrl(url) ? url : "/" });
  return Response.json(res);
}
