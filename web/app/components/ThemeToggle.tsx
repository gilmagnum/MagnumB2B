"use client";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const META: Record<Theme, { icon: string; label: string }> = {
  system: { icon: "🖥️", label: "ברירת מחדל (מערכת)" },
  light: { icon: "☀️", label: "מצב בהיר" },
  dark: { icon: "🌙", label: "מצב כהה" },
};

function apply(t: Theme) {
  const el = document.documentElement;
  if (t === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
  try { localStorage.setItem("theme", t); } catch { /* ignore */ }
}

// Cycles system → light → dark. Choice persists in localStorage and is applied before paint by the
// inline script in the layout (no flash). Icon-only button for the header.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let t: Theme = "system";
    try { const s = localStorage.getItem("theme"); if (s === "light" || s === "dark") t = s; } catch { /* ignore */ }
    setTheme(t);
    setMounted(true);
  }, []);

  const next = () => {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(t);
    apply(t);
  };

  // Avoid SSR/hydration mismatch — render a stable placeholder until mounted.
  if (!mounted) return <button className="icon-btn" aria-label="מצב תצוגה" title="מצב תצוגה" style={{ fontSize: 17 }}>🌓</button>;

  return (
    <button onClick={next} className="icon-btn" aria-label={`מצב תצוגה: ${META[theme].label}`} title={`מצב תצוגה: ${META[theme].label} — לחיצה מחליפה`} style={{ fontSize: 17 }}>
      {META[theme].icon}
    </button>
  );
}
