"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client (cookie-based auth session).
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
