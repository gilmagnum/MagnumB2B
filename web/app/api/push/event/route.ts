import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { getProfile } from "../../../../lib/auth";
import { sendEvent } from "../../../../lib/push";
import { PUSH_EVENTS, buildPayload, canFire, type Role } from "../../../../lib/pushEvents";

export const dynamic = "force-dynamic";

// Constant-time compare that also tolerates length/undefined differences.
function secretEqual(a: string | null, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Fire a push event. The title/body/url are built on the SERVER from the event key — the client only
// names the event, an optional agentId, and a small context ({ customerName, ref }) woven into the body.
// Source is authorized per event: bridge events need x-push-secret; the rest need a signed-in role.
// Body: { key, agentId?, context?: { customerName?, ref? } }.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-push-secret");
  let source: "bridge" | Role;
  if (secret != null) {
    if (!secretEqual(secret, process.env.PUSH_EVENT_SECRET)) return Response.json({ error: "unauthorized" }, { status: 401 });
    source = "bridge";
  } else {
    const me = await getProfile().catch(() => null);
    if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
    source = (me.role as Role) || "";
  }

  const b = await req.json().catch(() => ({}));
  const ev = PUSH_EVENTS.find((e) => e.key === b.key);
  if (!ev) return Response.json({ error: "unknown event" }, { status: 400 });
  if (!canFire(ev, source)) return Response.json({ error: "forbidden" }, { status: 403 });

  const payload = buildPayload(ev, b.context);
  const agentId = ev.agentScoped && Number.isFinite(Number(b.agentId)) ? Number(b.agentId) : null;
  const res = await sendEvent(ev.key, { agentId, payload });
  return Response.json(res);
}
