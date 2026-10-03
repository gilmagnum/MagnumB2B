import { NextRequest } from "next/server";
import { supabaseServer } from "../../../../lib/supabase/server";
import { sendEvent } from "../../../../lib/push";
import { PUSH_EVENTS } from "../../../../lib/pushEvents";

export const dynamic = "force-dynamic";

// Fire a push event. Allowed from: a logged-in session (app flows) OR the bridge
// (x-push-secret header). Body: { key, agentId?, title?, body?, url? }.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-push-secret");
  const authed = secret
    ? secret === process.env.PUSH_EVENT_SECRET
    : !!(await (await supabaseServer()).auth.getUser()).data.user;
  if (!authed) return Response.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const ev = PUSH_EVENTS.find((e) => e.key === b.key);
  if (!ev) return Response.json({ error: "unknown event" }, { status: 400 });

  const payload = {
    title: b.title || ev.label,
    body: b.body || "",
    url: b.url || "/",
  };
  const res = await sendEvent(ev.key, { agentId: b.agentId ?? null, payload });
  return Response.json(res);
}
