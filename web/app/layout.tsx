import type { ReactNode } from "react";
import { Heebo } from "next/font/google";
import { getProfile } from "../lib/auth";
import AppHeader from "./components/AppHeader";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

export const metadata = { title: "מגנום B2B", description: "הזמנות סיטונאות" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const me = await getProfile();

  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body>
        {me && <AppHeader role={me.role} name={me.full_name ?? ""} />}
        <main>{children}</main>
      </body>
    </html>
  );
}
