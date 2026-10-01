import type { ReactNode } from "react";
import { supabaseServer } from "../lib/supabase/server";
import { logout } from "./login/actions";

export const metadata = { title: "מגנום B2B", description: "הזמנות סיטונאות" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  let agentName = "";
  if (user) {
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    agentName = prof?.full_name ?? user.email ?? "";
  }

  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: "system-ui, Arial, sans-serif", margin: 0 }}>
        <header style={{ background: "#1e2a78", color: "#fff", padding: "12px 20px", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>מגנום — הזמנות סיטונאות</span>
          {user && (
            <span style={{ fontSize: 14, fontWeight: 400, display: "flex", alignItems: "center" }}>
              <a href="/customer" style={{ color: "#fff", marginInlineStart: 16 }}>לקוח</a>
              <a href="/catalog" style={{ color: "#fff", marginInlineStart: 16 }}>קטלוג</a>
              <a href="/cart" style={{ color: "#fff", marginInlineStart: 16 }}>🛒 סל</a>
              {agentName && <span style={{ marginInlineStart: 16, opacity: 0.85 }}>{agentName}</span>}
              <form action={logout} style={{ display: "inline", marginInlineStart: 12 }}>
                <button type="submit" style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.5)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13 }}>יציאה</button>
              </form>
            </span>
          )}
        </header>
        <main style={{ padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
