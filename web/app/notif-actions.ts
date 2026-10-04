"use server";
import { supabaseServer } from "../lib/supabase/server";
import { supabaseAdmin } from "../lib/supabase/admin";
import { getProfile } from "../lib/auth";

// A user saves their OWN notification preferences.
export async function saveMyPrefs(prefs: Record<string, boolean>): Promise<{ ok?: boolean; error?: string }> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { error: "unauthorized" };
  const { error } = await supabaseAdmin().from("profiles").update({ push_prefs: prefs }).eq("id", user.id);
  return error ? { error: error.message } : { ok: true };
}

// Admin saves notification preferences for ANY user.
export async function saveUserPrefs(id: string, prefs: Record<string, boolean>): Promise<{ ok?: boolean; error?: string }> {
  const me = await getProfile().catch(() => null);
  if (!me || me.role !== "admin") return { error: "forbidden" };
  const { error } = await supabaseAdmin().from("profiles").update({ push_prefs: prefs }).eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

// A user saves their OWN email preferences.
export async function saveMyEmailPrefs(prefs: Record<string, boolean>): Promise<{ ok?: boolean; error?: string }> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { error: "unauthorized" };
  const { error } = await supabaseAdmin().from("profiles").update({ email_prefs: prefs }).eq("id", user.id);
  return error ? { error: error.message } : { ok: true };
}

// Admin saves email preferences for ANY user.
export async function saveUserEmailPrefs(id: string, prefs: Record<string, boolean>): Promise<{ ok?: boolean; error?: string }> {
  const me = await getProfile().catch(() => null);
  if (!me || me.role !== "admin") return { error: "forbidden" };
  const { error } = await supabaseAdmin().from("profiles").update({ email_prefs: prefs }).eq("id", id);
  return error ? { error: error.message } : { ok: true };
}
