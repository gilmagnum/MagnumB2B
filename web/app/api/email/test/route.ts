import { getProfile } from "../../../../lib/auth";
import { isEmailConfigured, sendMail } from "../../../../lib/email";
import { supabaseServer } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

// Admin-only: send a test email to yourself (verifies the SMTP settings).
export async function POST() {
  const me = await getProfile();
  if (!me || me.role !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
  if (!isEmailConfigured()) return Response.json({ error: "SMTP not configured" }, { status: 400 });
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user?.email) return Response.json({ error: "no email on your account" }, { status: 400 });
  const res = await sendMail({
    to: user.email,
    subject: "מגנום — בדיקת מייל",
    title: "בדיקת התראות מייל",
    body: "הגדרות ה-SMTP עובדות ✓ — המייל נשלח בהצלחה.",
    url: "/",
  });
  return Response.json(res, { status: res.ok ? 200 : 500 });
}
