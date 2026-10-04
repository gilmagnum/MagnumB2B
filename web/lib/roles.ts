// Role hierarchy (top → bottom): superadmin > admin > (picker | agent).
// - superadmin ("אדמין"): the owner. Only role that manages users and sees the ניהול panel.
// - admin ("מנהל"): manager. Sees הגדרות; may edit size rulers; orders for all customers.
// - picker ("מלקט"): picking screen only.
// - agent ("סוכן"): their own customers.
export type AppRole = "superadmin" | "admin" | "picker" | "agent" | "";

export const ROLE_LABELS: Record<string, string> = {
  superadmin: "אדמין",
  admin: "מנהל",
  picker: "מלקט",
  agent: "סוכן",
};
export const roleLabel = (r?: string | null) => (r && ROLE_LABELS[r]) || r || "";

export const isSuperadmin = (r?: string | null) => r === "superadmin";
export const canManageUsers = (r?: string | null) => r === "superadmin";
export const canSeeAdminPanel = (r?: string | null) => r === "superadmin";
export const managerOrAbove = (r?: string | null) => r === "admin" || r === "superadmin";
export const canEditRulers = (r?: string | null) => r === "admin" || r === "superadmin";

// Roles that can be assigned/created from the user-management UI.
export const ASSIGNABLE_ROLES: { value: string; label: string }[] = [
  { value: "agent", label: "סוכן" },
  { value: "picker", label: "מלקט" },
  { value: "admin", label: "מנהל" },
  { value: "superadmin", label: "אדמין" },
];
