"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase/browser";

// The signed-in user's role, fetched once per mount. "" until known (or if signed out).
export function useRole(): string {
  const [role, setRole] = useState<string>("");
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (!user) return;
      const { data } = await supabaseBrowser().from("profiles").select("role").eq("id", user.id).single();
      if (alive) setRole((data?.role as string) ?? "");
    })();
    return () => { alive = false; };
  }, []);
  return role;
}
