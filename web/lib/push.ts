import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "./supabase/admin";
import { PUSH_EVENTS, effectivePref, effectiveEmailPref, type Role } from "./pushEvents";
import { isEmailConfigured, sendMail } from "./email";

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@magnum", pub, priv);
  configured = true;
}

type Payload = { title: string; body?: string; url?: string };

// Send a push to specific profiles (or everyone if profileIds is null). Prunes dead subs.
export async function sendPush(profileIds: string[] | null, payload: Payload) {
  configure();
  const admin = supabaseAdmin();
  let qb = admin.from("push_subscriptions").select("endpoint, keys");
  if (profileIds) qb = qb.in("profile_id", profileIds);
  const { data: subs } = await qb;
  if (!subs?.length) return { sent: 0, failed: 0 };

  let sent = 0, failed = 0;
  const dead: string[] = [];
  await Promise.all(subs.map(async (s: { endpoint: string; keys: { p256dh: string; auth: string } }) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        JSON.stringify(payload),
      );
      sent++;
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.endpoint); // gone — remove
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead);
  return { sent, failed };
}

// Fire an event: push to users whose role+prefs opt in, AND email those who opted into
// email for it (agent-scoped events go only to the matching customer's agent).
export async function sendEvent(key: string, ctx: { agentId?: number | null; payload: Payload }) {
  const ev = PUSH_EVENTS.find((e) => e.key === key);
  if (!ev) return { sent: 0, failed: 0, emailed: 0 };
  const admin = supabaseAdmin();
  // superadmin inherits admin events, so include it whenever admin is targeted.
  const roles = ev.roles.includes("admin") ? [...ev.roles, "superadmin"] : ev.roles;
  let qb = admin.from("profiles").select("id, role, push_prefs, email_prefs").in("role", roles);
  if (ev.agentScoped && ctx.agentId != null) qb = qb.eq("agent_id", ctx.agentId);
  const { data: profiles } = await qb;
  const rows = profiles ?? [];

  const pushIds = rows
    .filter((p) => effectivePref(p.role as Role, p.push_prefs as Record<string, boolean> | null, key))
    .map((p) => p.id);
  const emailIds = rows
    .filter((p) => effectiveEmailPref(p.email_prefs as Record<string, boolean> | null, key))
    .map((p) => p.id);

  // In-app notification center: persist for the same recipients as push (same prefs).
  if (pushIds.length) {
    const rows = pushIds.map((id) => ({
      profile_id: id, event_key: key,
      title: ctx.payload.title, body: ctx.payload.body ?? null, url: ctx.payload.url ?? null,
    }));
    await admin.from("notifications").insert(rows);
  }

  const push = pushIds.length ? await sendPush(pushIds, ctx.payload) : { sent: 0, failed: 0 };
  const emailed = await sendEventEmails(emailIds, ctx.payload);
  return { ...push, emailed };
}

// Resolve recipient emails (from auth) and send — best-effort, never throws.
async function sendEventEmails(profileIds: string[], payload: Payload): Promise<number> {
  if (!profileIds.length || !isEmailConfigured()) return 0;
  const admin = supabaseAdmin();
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map((data?.users ?? []).map((u) => [u.id, u.email]));
  const targets = profileIds.map((id) => emailById.get(id)).filter((e): e is string => !!e);
  if (!targets.length) return 0;
  const results = await Promise.all(
    targets.map((to) => sendMail({ to, subject: payload.title, title: payload.title, body: payload.body, url: payload.url })),
  );
  return results.filter((r) => r.ok).length;
}
