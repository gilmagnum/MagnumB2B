"use client";
import { useEffect } from "react";

// Registers the service worker (required for PWA install + push).
export default function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
