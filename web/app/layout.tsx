import type { ReactNode } from "react";

export const metadata = { title: "מגנום B2B", description: "הזמנות סיטונאות" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: "system-ui, Arial, sans-serif", margin: 0 }}>
        <header style={{ background: "#1e2a78", color: "#fff", padding: "12px 20px", fontWeight: 700 }}>
          מגנום — הזמנות סיטונאות
        </header>
        <main style={{ padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
