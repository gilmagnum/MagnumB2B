import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Supabase client — reads/writes the auth session via cookies.
// Next 15: cookies() is async, so this helper is async.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component where cookies are read-only.
            // The middleware refreshes the session cookie, so this is safe to ignore.
          }
        },
      },
    },
  );
}
