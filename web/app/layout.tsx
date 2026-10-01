import type { ReactNode } from "react";

export const metadata = { title: "מגנום B2B", description: "הזמנות סיטונאות" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: "system-ui, Arial, sans-serif", margin: 0 }}>
        <header style={{ background: "#1e2a78", color: "#fff", padding: "12px 20px", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>מגנום — הזמנות סיטונאות</span>
          <span style={{ fontSize: 14, fontWeight: 400 }}>
            <a href="/customer" style={{ color: "#fff", marginInlineStart: 16 }}>לקוח</a>
            <a href="/catalog" style={{ color: "#fff", marginInlineStart: 16 }}>קטלוג</a>
            <a href="/cart" style={{ color: "#fff", marginInlineStart: 16 }}>🛒 סל</a>
          </span>
        </header>
        <main style={{ padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
