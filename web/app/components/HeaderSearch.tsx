"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Global catalog search box (in the header). Fast: backed by pg_trgm indexes.
export default function HeaderSearch() {
  const [q, setQ] = useState("");
  const router = useRouter();
  const go = () => { const t = q.trim(); if (t.length >= 2) router.push(`/search?q=${encodeURIComponent(t)}`); };
  return (
    <input
      value={q}
      onChange={(e) => setQ(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") go(); }}
      placeholder="חיפוש מוצר…"
      aria-label="חיפוש מוצר"
      className="header-search"
    />
  );
}
