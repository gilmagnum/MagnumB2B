"use client";
import { useEffect, useState } from "react";

// Home-page nudge: shown ONLY until the user has set notifications up.
// One button, one click → the Settings screen (where the real enable + prefs live).
// Hidden once a push subscription exists, or when push is unsupported/blocked.
export default function HomeNotifyPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return; // unsupported → nothing to nudge
    if (Notification.permission === "denied") return; // blocked → a nudge can't help
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (!sub) setShow(true); }) // not subscribed yet → nudge
      .catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <a href="/settings" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      🔔 הפעלת התראות
    </a>
  );
}
