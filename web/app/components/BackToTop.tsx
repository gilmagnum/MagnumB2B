"use client";
import { useEffect, useState } from "react";

// Floating "back to top" button for long, scrollable pages (catalog, documents, product).
// Appears after scrolling down a bit; hidden at the top.
export default function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;
  return (
    <button
      aria-label="חזרה למעלה"
      title="חזרה למעלה"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      style={{
        position: "fixed", insetInlineEnd: 16, bottom: 16, zIndex: 900,
        width: 46, height: 46, borderRadius: "50%", border: "none", cursor: "pointer",
        background: "var(--brand-strong)", color: "#fff", fontSize: 22, lineHeight: 1,
        boxShadow: "0 2px 10px rgba(0,0,0,.25)",
      }}
    >
      ↑
    </button>
  );
}
