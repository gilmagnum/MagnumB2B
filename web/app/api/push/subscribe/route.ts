import { NextRequest } from "next/server";
import { supabaseServer } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

// Store the browser's push subscription for the logged-in user (RLS: self).
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sub = await req.json().catch(() => null);
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return Response.json({ error: "bad subscription" }, { status: 400 });
  }
  const { error } = await supabase.from("push_subscriptions").upsert({
    endpoint: sub.endpoint,
    profile_id: user.id,
    keys: sub.keys,
    user_agent: req.headers.get("user-agent") ?? null,
  }, { onConflict: "endpoint" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
