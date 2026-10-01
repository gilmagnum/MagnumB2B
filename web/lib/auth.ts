import { supabaseServer } from "./supabase/server";

export type Profile = {
  id: string;
  role: "agent" | "customer" | "picker" | "admin";
  agent_id: number | null;
  full_name: string | null;
};

// Returns the logged-in user's profile (role + agent_id), or null if not signed in.
export async function getProfile(): Promise<Profile | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, role, agent_id, full_name")
    .eq("id", user.id)
    .single();
  return (data as Profile) ?? null;
}
