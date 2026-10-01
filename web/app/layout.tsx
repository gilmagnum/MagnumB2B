import type { ReactNode } from "react";
import { Heebo } from "next/font/google";
import { getProfile } from "../lib/auth";
import { logout } from "./login/actions";
import HeaderSearch from "./components/HeaderSearch";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

export const metadata = { title: "מגנום B2B", description: "הזמנות סיטונאות" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const me = await getProfile();
  const agentName = me?.full_name ?? "";
  const isAdmin = me?.role === "admin";
  const canPick = me?.role === "picker" || me?.role === "admin";

  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body>
        <header className="app-header">
          <a href="/catalog" className="brand-logo">מגנום · סיטונאות</a>
          {me && (
            <span className="header-nav">
              <HeaderSearch />
              <a href="/customer">לקוח</a>
              <a href="/catalog">קטלוג</a>
              <a href="/cart">🛒 סל</a>
              <a href="/documents">מסמכים</a>
              {canPick && <a href="/picking">ליקוט</a>}
              {isAdmin && <a href="/admin">ניהול</a>}
              {agentName && <span style={{ color: "var(--ink-muted)", marginInlineStart: 4 }}>{agentName}</span>}
              <form action={logout} style={{ display: "inline" }}>
                <button type="submit" className="btn btn-sm">יציאה</button>
              </form>
            </span>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
