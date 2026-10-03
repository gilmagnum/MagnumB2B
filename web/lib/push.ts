import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "./supabase/admin";

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
