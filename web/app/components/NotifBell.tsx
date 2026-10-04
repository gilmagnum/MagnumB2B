"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/browser";

// Header bell: shows the count of unread in-app notifications, links to /notifications.
export default function NotifBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data: { user } } = await supabaseBrowser().auth.getUser();
        if (!user) return;
        const { count } = await supabaseBrowser()
          .from("notifications").select("id", { count: "exact", head: true })
          .eq("profile_id", user.id).is("read_at", null);
        if (alive) setUnread(count ?? 0);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, []);

  return (
    <a href="/notifications" className="icon-btn" title="התראות" aria-label="התראות" style={{ position: "relative" }}>
      <Bell />
      {unread > 0 && (
        <span style={{ position: "absolute", top: -4, insetInlineEnd: -4, background: "var(--danger)", color: "#fff", borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, display: "grid", placeItems: "center", padding: "0 4px" }}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </a>
  );
}

function Bell() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
