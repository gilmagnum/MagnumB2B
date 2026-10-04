"use server";
import { revalidatePath } from "next/cache";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import { canManageUsers, canEditRulers, roleLabel } from "../../lib/roles";

export type AdminState = { error?: string; ok?: string };

const ROLES = ["agent", "admin", "picker", "superadmin"];

// User management is superadmin-only.
async function requireSuperadmin() {
  const me = await getProfile();
  if (!me || !canManageUsers(me.role)) throw new Error("forbidden");
  return me;
}

// Create a user (superadmin-provisioned; no self-signup).
export async function createUserAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try {
    await requireSuperadmin();
  } catch {
    return { error: "אין הרשאה" };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "agent");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const agentIdRaw = String(formData.get("agent_id") ?? "").trim();

  if (!email || !password) return { error: "אימייל וסיסמה נדרשים" };
  if (password.length < 8) return { error: "סיסמה חייבת לפחות 8 תווים" };
  if (!ROLES.includes(role)) return { error: "תפקיד לא תקין" };
  const agent_id = role === "agent" ? Number(agentIdRaw) : null;
  if (role === "agent" && !Number.isInteger(agent_id)) return { error: "קוד סוכן חייב להיות מספר" };

  const admin = supabaseAdmin();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr) return { error: cErr.message.includes("already") ? "אימייל כבר קיים" : cErr.message };

  const { error: pErr } = await admin.from("profiles").upsert(
    { id: created.user.id, role, agent_id, full_name: fullName || email },
    { onConflict: "id" },
  );
  if (pErr) return { error: "המשתמש נוצר אך שמירת הפרופיל נכשלה: " + pErr.message };

  revalidatePath("/admin");
  return { ok: `נוצר ${roleLabel(role)}: ${email}` };
}

// Save the home-page banner (superadmin-controlled; lives in the ניהול panel).
export async function saveBannerAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try { await requireSuperadmin(); } catch { return { error: "אין הרשאה" }; }
  const value = {
    title: String(formData.get("title") ?? "").trim(),
    subtitle: String(formData.get("subtitle") ?? "").trim(),
    image_url: String(formData.get("image_url") ?? "").trim(),
    cta_text: String(formData.get("cta_text") ?? "").trim(),
    cta_link: String(formData.get("cta_link") ?? "").trim(),
  };
  const { error } = await supabaseAdmin().from("app_settings")
    .upsert({ key: "home_banner", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: "הבאנר נשמר" };
}

// Save a ruler's size values (ordered). Managers and above may edit rulers.
export async function saveRulerAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const me = await getProfile().catch(() => null);
  if (!me || !canEditRulers(me.role)) return { error: "אין הרשאה" };
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "קוד סרגל חסר" };
  const sizes = JSON.parse(String(formData.get("sizes") ?? "[]")) as string[];
  const clean = sizes.map((s) => String(s).trim()).filter(Boolean);
  const { error } = await supabaseAdmin().from("rulers")
    .update({ sizes: clean }).eq("code", code);
  if (error) return { error: error.message };
  revalidatePath("/settings/rulers");
  return { ok: `נשמר (${clean.length} מידות)` };
}

// Reset a user's password.
export async function resetPasswordAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try { await requireSuperadmin(); } catch { return { error: "אין הרשאה" }; }
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!id || password.length < 8) return { error: "סיסמה חדשה (8+ תווים) נדרשת" };
  const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password });
  if (error) return { error: error.message };
  return { ok: "הסיסמה עודכנה" };
}

// Change a user's role (and agent_id for agents).
export async function changeRoleAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const me = await getProfile().catch(() => null);
  if (!me || !canManageUsers(me.role)) return { error: "אין הרשאה" };
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!id || !ROLES.includes(role)) return { error: "תפקיד לא תקין" };
  if (id === me.id && role !== "superadmin") return { error: "אי אפשר לשנות את התפקיד של עצמך" };
  const agent_id = role === "agent" ? Number(formData.get("agentId")) : null;
  if (role === "agent" && !Number.isInteger(agent_id)) return { error: "קוד סוכן נדרש לסוכן" };
  const { error } = await supabaseAdmin().from("profiles").update({ role, agent_id }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { ok: "התפקיד עודכן" };
}

// Update a user's details (full name + email).
export async function updateUserAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const me = await getProfile().catch(() => null);
  if (!me || !canManageUsers(me.role)) return { error: "אין הרשאה" };
  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!id) return { error: "משתמש חסר" };
  const admin = supabaseAdmin();
  if (email) {
    const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
    if (error) return { error: error.message.includes("already") ? "אימייל כבר קיים" : error.message };
  }
  const { error: pErr } = await admin.from("profiles").update({ full_name: fullName || null }).eq("id", id);
  if (pErr) return { error: pErr.message };
  revalidatePath("/admin");
  return { ok: "הפרטים עודכנו" };
}

// Permanently delete a user (auth + profile cascade).
export async function deleteUserAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const me = await getProfile().catch(() => null);
  if (!me || !canManageUsers(me.role)) return { error: "אין הרשאה" };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "משתמש חסר" };
  if (id === me.id) return { error: "אי אפשר למחוק את עצמך" };
  const { error } = await supabaseAdmin().auth.admin.deleteUser(id);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { ok: "המשתמש נמחק" };
}

// Activate / deactivate a user (ban blocks login; "none" re-enables).
export async function setActiveAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const me = await getProfile().catch(() => null);
  if (!me || !canManageUsers(me.role)) return { error: "אין הרשאה" };
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "1";
  if (!id) return { error: "משתמש חסר" };
  if (id === me.id && !active) return { error: "אי אפשר להשבית את עצמך" };
  const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { ok: active ? "המשתמש הופעל" : "המשתמש הושבת" };
}
