// Catalog of push event types, with the roles each is SUGGESTED for (default-on).
export type Role = "agent" | "customer" | "picker" | "admin" | "superadmin" | "";

// superadmin inherits admin's event set.
const norm = (role: Role): Role => (role === "superadmin" ? "admin" : role);

// Context the server is allowed to weave into a notification body. Everything else
// (title, url, the body template) is fixed server-side per event — never from the client.
export type EventContext = { customerName?: string; ref?: string };

export type PushEvent = {
  key: string;
  label: string;          // also the notification title (fixed)
  roles: Role[];          // suggested recipients
  agentScoped?: boolean;
  url: string;            // fixed internal destination for this event
  fire: "bridge" | Role[]; // who may trigger it: the bridge (x-push-secret) or a signed-in role
  body?: (c: EventContext) => string; // server-built body from sanitized context
};

export const PUSH_EVENTS: PushEvent[] = [
  { key: "order_picking", label: "הזמנה חדשה לליקוט", roles: ["admin", "picker"], url: "/picking",
    fire: ["agent", "admin", "superadmin"], body: (c) => `${c.customerName ?? ""}${c.ref ? ` · הזמנה ${c.ref}` : ""}`.trim() },
  { key: "order_future", label: "הזמנה עתידית חדשה", roles: ["admin"], url: "/picking",
    fire: ["agent", "admin", "superadmin"], body: (c) => `${c.customerName ?? ""}${c.ref ? ` · הזמנה ${c.ref}` : ""}`.trim() },
  { key: "pick_finished", label: "סיום ליקוט", roles: ["admin"], url: "/documents",
    fire: ["picker", "admin", "superadmin"], body: (c) => `${c.customerName ?? ""}${c.ref ? ` · ${c.ref}` : ""}`.trim() },
  { key: "order_produced", label: "הופק מסמך (חשבונית/ת.משלוח)", roles: ["admin"], url: "/documents",
    fire: "bridge", body: (c) => `${c.customerName ?? ""}${c.ref ? ` · ${c.ref}` : ""}`.trim() },
  // agent-scoped: delivered to the specific customer's agent
  { key: "agent_order_received", label: "הזמנת לקוח נקלטה במחסן", roles: ["agent"], agentScoped: true, url: "/documents",
    fire: "bridge", body: (c) => (c.customerName ? `הזמנת ${c.customerName} נקלטה` : "") },
  { key: "agent_order_picked", label: "הזמנת לקוח לוקטה", roles: ["agent"], agentScoped: true, url: "/documents",
    fire: ["picker", "admin", "superadmin"], body: (c) => (c.customerName ? `הזמנת ${c.customerName} לוקטה` : "") },
  { key: "agent_order_produced", label: "הזמנת לקוח הופקה", roles: ["agent"], agentScoped: true, url: "/documents",
    fire: "bridge", body: (c) => (c.customerName ? `הזמנת ${c.customerName} הופקה` : "") },
];

export const eventsForRole = (role: Role) => PUSH_EVENTS.filter((e) => e.roles.includes(norm(role)));

// Whether a user effectively gets an event by PUSH: explicit pref wins; else default-on if suggested for their role.
export function effectivePref(role: Role, prefs: Record<string, boolean> | null | undefined, key: string): boolean {
  if (prefs && key in prefs) return !!prefs[key];
  const ev = PUSH_EVENTS.find((e) => e.key === key);
  return ev ? ev.roles.includes(norm(role)) : false;
}

// Email is opt-in (default OFF), to avoid inboxing people by surprise: only an explicit true counts.
export function effectiveEmailPref(prefs: Record<string, boolean> | null | undefined, key: string): boolean {
  return !!(prefs && prefs[key] === true);
}

// --- Server-side payload building & authorization (H3) -------------------------------------

// A same-origin absolute path only ("/picking", "/documents?x=1") — never "//evil", a scheme, or a
// backslash trick. Used both when a URL is stored and before the client navigates to one.
export function isInternalUrl(u: unknown): u is string {
  return typeof u === "string" && /^\/(?![/\\])[^\s]*$/.test(u);
}

// Trim a short piece of context text that is woven into a notification body (drop control chars, cap length).
export function cleanText(s: unknown, max = 80): string {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// May this source trigger this event? Bridge-only events need the x-push-secret; the rest need a
// signed-in user whose role is in the event's fire list.
export function canFire(ev: PushEvent, source: "bridge" | Role): boolean {
  return ev.fire === "bridge" ? source === "bridge" : source !== "bridge" && ev.fire.includes(source);
}

// Build the notification payload entirely on the server: fixed title + url, body from sanitized context.
export function buildPayload(ev: PushEvent, c: EventContext | undefined): { title: string; body: string; url: string } {
  const ctx: EventContext = { customerName: cleanText(c?.customerName), ref: cleanText(c?.ref, 24) };
  return { title: ev.label, body: ev.body ? cleanText(ev.body(ctx), 120) : "", url: ev.url };
}
