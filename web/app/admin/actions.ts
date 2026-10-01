"use server";
import { revalidatePath } from "next/cache";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";

export type AdminState = { error?: string; ok?: string };

async function requireAdmin() {
  const me = await getProfile();
  if (!me || me.role !== "admin") throw new Error("forbidden");
  return me;
}

// Create an agent or admin user (admin-provisioned; no self-signup).
export async function createUserAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try {
    await requireAdmin();
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
  if (role !== "agent" && role !== "admin") return { error: "תפקיד לא תקין" };
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
  return { ok: `נוצר ${role === "admin" ? "מנהל" : "סוכן"}: ${email}` };
}

// Reset a user's password.
export async function resetPasswordAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try { await requireAdmin(); } catch { return { error: "אין הרשאה" }; }
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!id || password.length < 8) return { error: "סיסמה חדשה (8+ תווים) נדרשת" };
  const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password });
  if (error) return { error: error.message };
  return { ok: "הסיסמה עודכנה" };
}
