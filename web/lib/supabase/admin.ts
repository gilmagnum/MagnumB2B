import "server-only";
import { createClient } from "@supabase/supabase-js";

// SERVICE-ROLE client — bypasses RLS. Server-side ONLY (never import into a client
// component). Requires SUPABASE_SERVICE_ROLE_KEY (a NON-public server env var).
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server env)");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
