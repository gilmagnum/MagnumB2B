import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// SMTP is optional: if it isn't configured, email sends are skipped (no throw),
// so push keeps working on its own.
export function isEmailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport: Transporter | null = null;
function tx(): Transporter {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true", // false → STARTTLS on 587
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

const FROM = () => process.env.SMTP_FROM || process.env.SMTP_USER || "";
const APP = () => (process.env.APP_URL || "https://magnum-b2-b.vercel.app").replace(/\/+$/, "");

type Mail = { to: string | string[]; subject: string; title: string; body?: string; url?: string };

// Branded HTML wrapper, RTL.
function render({ title, body, url }: { title: string; body?: string; url?: string }) {
  const link = url ? (url.startsWith("http") ? url : APP() + url) : APP();
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f3f4f8;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#1e2a78;color:#fff;border-radius:12px 12px 0 0;padding:16px 20px;font-weight:700;font-size:18px;">מגנום · סיטונאות</div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:20px;">
      <h2 style="margin:0 0 8px;color:#1e2a78;font-size:18px;">${esc(title)}</h2>
      ${body ? `<p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.5;">${esc(body)}</p>` : ""}
      <a href="${esc(link)}" style="display:inline-block;background:#1e2a78;color:#fff;text-decoration:none;border-radius:8px;padding:10px 18px;font-weight:700;">פתיחה באפליקציה ←</a>
    </div>
    <p style="color:#9aa0b4;font-size:12px;text-align:center;margin:14px 0 0;">הודעה אוטומטית ממערכת ההזמנות. לניהול התראות: <a href="${esc(APP())}/settings" style="color:#9aa0b4;">הגדרות</a></p>
  </div></body></html>`;
}
function esc(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

export async function sendMail(m: Mail): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: "SMTP not configured" };
  try {
    await tx().sendMail({
      from: FROM(),
      to: m.to,
      subject: m.subject,
      text: `${m.title}\n\n${m.body ?? ""}\n\n${m.url ? (m.url.startsWith("http") ? m.url : APP() + m.url) : APP()}`,
      html: render(m),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
