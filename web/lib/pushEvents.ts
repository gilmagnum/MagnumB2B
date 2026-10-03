// Catalog of push event types, with the roles each is SUGGESTED for (default-on).
export type Role = "agent" | "customer" | "picker" | "admin" | "";

export type PushEvent = { key: string; label: string; roles: Role[]; agentScoped?: boolean };

export const PUSH_EVENTS: PushEvent[] = [
  { key: "order_picking", label: "הזמנה חדשה לליקוט", roles: ["admin", "picker"] },
  { key: "order_future", label: "הזמנה עתידית חדשה", roles: ["admin"] },
  { key: "pick_finished", label: "סיום ליקוט", roles: ["admin"] },
  { key: "order_produced", label: "הופק מסמך (חשבונית/ת.משלוח)", roles: ["admin"] },
  // agent-scoped: delivered to the specific customer's agent
  { key: "agent_order_received", label: "הזמנת לקוח נקלטה במחסן", roles: ["agent"], agentScoped: true },
  { key: "agent_order_picked", label: "הזמנת לקוח לוקטה", roles: ["agent"], agentScoped: true },
  { key: "agent_order_produced", label: "הזמנת לקוח הופקה", roles: ["agent"], agentScoped: true },
];

export const eventsForRole = (role: Role) => PUSH_EVENTS.filter((e) => e.roles.includes(role));

// Whether a user effectively gets an event: explicit pref wins; else default-on if suggested for their role.
export function effectivePref(role: Role, prefs: Record<string, boolean> | null | undefined, key: string): boolean {
  if (prefs && key in prefs) return !!prefs[key];
  const ev = PUSH_EVENTS.find((e) => e.key === key);
  return ev ? ev.roles.includes(role) : false;
}
