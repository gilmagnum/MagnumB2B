import { redirect } from "next/navigation";
import { getProfile } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabase/admin";
import { canEditRulers, canManageUsers } from "../../lib/roles";
import EnableNotifications from "../components/EnableNotifications";
import NotificationPrefs from "../components/NotificationPrefs";
import EmailTestButton from "../components/EmailTestButton";
import DriveImages from "../components/DriveImages";
import Icon from "../components/Icon";

export const dynamic = "force-dynamic";

// User settings. For now: notifications (enable push on this device + which events to receive).
export default async function SettingsPage() {
  const me = await getProfile();
  if (!me) redirect("/login");

  let driveUrl = "";
  if (canEditRulers(me.role)) {
    const { data } = await supabaseAdmin().from("app_settings").select("value").eq("key", "images_drive_url").single();
    driveUrl = ((data?.value as { url?: string } | null)?.url) ?? "";
  }

  return (
    <>
      <h1>הגדרות</h1>

      <section style={{ marginTop: 16 }}>
        <h3 style={{ color: "var(--brand-strong)" }}>התראות פוש</h3>
        <p style={{ color: "var(--ink-muted)", fontSize: 14, marginTop: 4 }}>
          הפעל התראות במכשיר זה, ובחר אילו אירועים לקבל. ניתן להפעיל בכל מכשיר בנפרד.
        </p>
        <div style={{ marginTop: 12, display: "grid", gap: 14, maxWidth: 440 }}>
          <EnableNotifications />
          <NotificationPrefs channel="push" defaultOpen />
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h3 style={{ color: "var(--brand-strong)" }}>התראות מייל</h3>
        <p style={{ color: "var(--ink-muted)", fontSize: 14, marginTop: 4 }}>
          בחר אילו אירועים לקבל גם לתיבת המייל (כבוי כברירת מחדל).
        </p>
        <div style={{ marginTop: 12, maxWidth: 440 }}>
          <NotificationPrefs channel="email" defaultOpen />
          {canManageUsers(me.role) && <EmailTestButton />}
        </div>
      </section>

      {canEditRulers(me.role) && (
        <section style={{ marginTop: 28 }}>
          <h3 style={{ color: "var(--brand-strong)" }}>ניהול מערכת</h3>
          <div style={{ marginTop: 12 }}>
            <a href="/settings/rulers" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="ruler" size={18} /> סרגלי מידות ←
            </a>
          </div>

          <h4 style={{ margin: "20px 0 0", color: "var(--brand-strong)" }}>תמונות מוצרים</h4>
          <DriveImages url={driveUrl} canEdit={canManageUsers(me.role)} />
        </section>
      )}
    </>
  );
}
