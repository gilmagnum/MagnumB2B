"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "../../lib/supabase/server";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/customer") || "/customer";
  if (!email || !password) return { error: "נא למלא אימייל וסיסמה" };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "פרטי התחברות שגויים" };

  redirect(next.startsWith("/") ? next : "/customer");
}

export async function logout() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
