"use client";
import { useEffect, useState } from "react";

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function EnableNotifications() {
  const [state, setState] = useState<"idle" | "unsupported" | "on" | "blocked" | "working" | "error">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("blocked"); return; }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (sub) setState("on"); })
      .catch(() => {});
  }, []);

  const enable = async () => {
    setState("working");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "idle"); return; }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(key),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub),
      });
      setState(res.ok ? "on" : "error");
    } catch { setState("error"); }
  };

  if (state === "unsupported") return null;
  if (state === "on") return <span className="chip chip-ok">🔔 התראות פעילות</span>;
  if (state === "blocked") return <span className="chip chip-warn">ההתראות חסומות בדפדפן — יש לאפשר בהגדרות האתר</span>;

  return (
    <button onClick={enable} disabled={state === "working"} className="btn">
      🔔 {state === "working" ? "מפעיל…" : state === "error" ? "נסה שוב" : "הפעלת התראות"}
    </button>
  );
}
