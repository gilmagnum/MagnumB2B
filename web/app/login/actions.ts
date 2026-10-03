"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "../../lib/supabase/server";
import { supabaseAdmin } from "../../lib/supabase/admin";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";
  if (!email || !password) return { error: "נא למלא אימייל וסיסמה" };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "פרטי התחברות שגויים" };

  // Record the login (service_role; best-effort, never blocks login).
  try {
    const ua = (await headers()).get("user-agent") ?? null;
    await supabaseAdmin().from("login_events").insert({ profile_id: data.user?.id, email, user_agent: ua });
  } catch { /* ignore */ }

  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
