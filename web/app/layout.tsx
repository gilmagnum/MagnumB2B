import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { getProfile } from "../lib/auth";
import AppHeader from "./components/AppHeader";
import SWRegister from "./components/SWRegister";
import BackToTop from "./components/BackToTop";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

export const metadata: Metadata = {
  title: "מגנום · סיטונאות",
  description: "פורטל הזמנות סיטונאות",
  applicationName: "מגנום",
  appleWebApp: { capable: true, title: "מגנום", statusBarStyle: "default" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f2a78",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const me = await getProfile();

  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <head>
        {/* Apply the saved light/dark choice before paint (no flash). "system" leaves it to the OS. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();` }} />
      </head>
      <body>
        <SWRegister />
        {me && <AppHeader role={me.role} name={me.full_name ?? ""} />}
        <main>{children}</main>
        <BackToTop />
      </body>
    </html>
  );
}
