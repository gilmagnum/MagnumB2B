import type { ReactNode } from "react";
import { getProfile } from "../lib/auth";
import { logout } from "./login/actions";
import HeaderSearch from "./components/HeaderSearch";
import "./globals.css";

export const metadata = { title: "מגנום B2B", description: "הזמנות סיטונאות" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const me = await getProfile();
  const agentName = me?.full_name ?? "";
  const isAdmin = me?.role === "admin";
  const canPick = me?.role === "picker" || me?.role === "admin";

  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: "system-ui, Arial, sans-serif", margin: 0 }}>
        <header className="app-header" style={{ background: "#1e2a78", color: "#fff", padding: "12px 20px", fontWeight: 700 }}>
          <a href="/catalog" style={{ color: "#fff", textDecoration: "none" }}>מגנום — הזמנות סיטונאות</a>
          {me && (
            <span className="header-nav">
              <HeaderSearch />
              <a href="/customer">לקוח</a>
              <a href="/catalog">קטלוג</a>
              <a href="/cart">🛒 סל</a>
              <a href="/documents">מסמכים</a>
              {canPick && <a href="/picking">ליקוט</a>}
              {isAdmin && <a href="/admin">ניהול</a>}
              {agentName && <span style={{ opacity: 0.85 }}>{agentName}</span>}
              <form action={logout} style={{ display: "inline" }}>
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
