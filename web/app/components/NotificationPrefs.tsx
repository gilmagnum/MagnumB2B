"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { eventsForRole, effectivePref, type Role } from "../../lib/pushEvents";
import { saveMyPrefs } from "../notif-actions";

export default function NotificationPrefs() {
  const [role, setRole] = useState<Role>("");
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (!user) return;
      const { data } = await supabaseBrowser().from("profiles").select("role, push_prefs").eq("id", user.id).single();
      setRole((data?.role as Role) ?? "");
      setPrefs((data?.push_prefs as Record<string, boolean>) ?? {});
    })();
  }, []);

  const events = eventsForRole(role);
  if (!events.length) return null;

  const toggle = async (key: string, on: boolean) => {
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    const res = await saveMyPrefs(next);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 420 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", fontWeight: 700, color: "var(--brand-strong)", padding: 0 }}>
        ⚙️ אילו התראות לקבל {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {events.map((e) => (
            <label key={e.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={effectivePref(role, prefs, e.key)} onChange={(ev) => toggle(e.key, ev.target.checked)} />
              {e.label}
            </label>
          ))}
          {saved && <span className="chip chip-ok" style={{ width: "fit-content" }}>נשמר ✓</span>}
        </div>
      )}
    </div>
  );
}
