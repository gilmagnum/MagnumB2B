import { redirect } from "next/navigation";
import { getProfile } from "../lib/auth";
import { supabase } from "../lib/supabase";
import HomeNotifyPrompt from "./components/HomeNotifyPrompt";
import Icon from "./components/Icon";
import { managerOrAbove, canSeeAdminPanel } from "../lib/roles";
import { isSafeHref, httpsOrUndef } from "../lib/url";

export const dynamic = "force-dynamic";

type Banner = { title?: string; subtitle?: string; image_url?: string; cta_text?: string; cta_link?: string };

export default async function Home() {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role === "picker") redirect("/picking");

  const { data } = await supabase.from("app_settings").select("value").eq("key", "home_banner").single();
  const b: Banner = (data?.value as Banner) ?? {};
  const bannerImg = httpsOrUndef(b.image_url);

  const tiles = [
    { href: "/customer", icon: "customers", label: "בחירת לקוח" },
    { href: "/start", icon: "plus", label: "התחלת הזמנה" },
    { href: "/catalog", icon: "catalog", label: "קטלוג" },
    { href: "/documents", icon: "docs", label: "מסמכים" },
    ...(managerOrAbove(me.role) ? [{ href: "/data", icon: "chart", label: "נתונים" }] : []),
    ...(managerOrAbove(me.role) ? [{ href: "/picking", icon: "picking", label: "ליקוט" }] : []),
    ...(canSeeAdminPanel(me.role) ? [{ href: "/admin", icon: "admin", label: "ניהול" }] : []),
    { href: "/settings", icon: "user", label: "הגדרות" },
  ];

  return (
    <>
      {/* admin-controlled banner */}
      <section style={{
        borderRadius: "var(--radius)", overflow: "hidden", marginBottom: 24,
        background: bannerImg
          ? `linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.15)), url("${bannerImg.replace(/"/g, "%22")}") center/cover`
          : "linear-gradient(110deg, var(--brand-strong), var(--brand))",
        color: "#fff", padding: "40px 28px", minHeight: 160,
      }}>
        <h1 style={{ color: "#fff", margin: 0, fontSize: 28 }}>{b.title || "ברוכים הבאים"}</h1>
        {b.subtitle && <p style={{ margin: "8px 0 0", opacity: 0.95, fontSize: 16 }}>{b.subtitle}</p>}
        {b.cta_text && isSafeHref(b.cta_link) && (
          <a href={b.cta_link} className="btn" style={{ marginTop: 16, background: "#fff", color: "var(--brand-strong)", border: 0, fontWeight: 700 }}>{b.cta_text}</a>
        )}
      </section>

      <div style={{ margin: "0 0 16px" }}>
        <HomeNotifyPrompt />
      </div>

      {/* menu tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 16 }}>
        {tiles.map((t) => (
          <a key={t.href} href={t.href} className="product-card" style={{ textDecoration: "none", color: "inherit", textAlign: "center", padding: "28px 12px", display: "grid", justifyItems: "center", gap: 12 }}>
            <span style={{ color: "var(--brand)" }}><Icon name={t.icon} size={40} /></span>
            <div style={{ fontWeight: 700, color: "var(--brand-strong)" }}>{t.label}</div>
          </a>
        ))}
      </div>
    </>
  );
}
