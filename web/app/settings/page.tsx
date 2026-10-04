import { redirect } from "next/navigation";
import { getProfile } from "../../lib/auth";
import EnableNotifications from "../components/EnableNotifications";
import NotificationPrefs from "../components/NotificationPrefs";
import EmailTestButton from "../components/EmailTestButton";

export const dynamic = "force-dynamic";

// User settings. For now: notifications (enable push on this device + which events to receive).
export default async function SettingsPage() {
  const me = await getProfile();
  if (!me) redirect("/login");

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
          {me.role === "admin" && <EmailTestButton />}
        </div>
      </section>
    </>
  );
}
