"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { eventsForRole, effectivePref, effectiveEmailPref, type Role } from "../../lib/pushEvents";
import { saveMyPrefs, saveMyEmailPrefs } from "../notif-actions";

type Channel = "push" | "email";

// Self-service event preferences for one channel (push or email).
export default function NotificationPrefs({ channel = "push", defaultOpen = false }: { channel?: Channel; defaultOpen?: boolean }) {
  const [role, setRole] = useState<Role>("");
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(defaultOpen);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (!user) return;
      const { data } = await supabaseBrowser().from("profiles").select("role, push_prefs, email_prefs").eq("id", user.id).single();
      setRole((data?.role as Role) ?? "");
      const col = channel === "email" ? data?.email_prefs : data?.push_prefs;
      setPrefs((col as Record<string, boolean>) ?? {});
    })();
  }, [channel]);

  const events = eventsForRole(role);
  if (!events.length) return null;

  const isOn = (key: string) => (channel === "email" ? effectiveEmailPref(prefs, key) : effectivePref(role, prefs, key));
  const title = channel === "email" ? "אילו התראות לקבל במייל" : "אילו התראות לקבל (פוש)";

  const toggle = async (key: string, on: boolean) => {
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    const res = channel === "email" ? await saveMyEmailPrefs(next) : await saveMyPrefs(next);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 440 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", fontWeight: 700, color: "var(--brand-strong)", padding: 0 }}>
        {channel === "email" ? "✉️" : "🔔"} {title} {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {events.map((e) => (
            <label key={e.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={isOn(e.key)} onChange={(ev) => toggle(e.key, ev.target.checked)} />
              {e.label}
            </label>
          ))}
          {saved && <span className="chip chip-ok" style={{ width: "fit-content" }}>נשמר ✓</span>}
        </div>
      )}
    </div>
  );
}
