"use client";
// Available stock (warehouse 1), shown to staff who may see it. For matrix / carton-size
// items the parent has no meaningful total (stock lives on the size cells), so we say so.
export default function StockLine({ stock, perSize, size = "sm" }: {
  stock?: number | null; perSize?: boolean; size?: "sm" | "md";
}) {
  const fs = size === "md" ? 13 : 12;
  if (perSize) return <div style={{ fontSize: fs, color: "var(--ink-muted)" }}>מלאי לפי מידה</div>;
  const n = stock ?? 0;
  const color = n > 0 ? "var(--ok)" : "var(--danger)";
  return <div style={{ fontSize: fs, color, fontWeight: 600 }}>מלאי: {n}</div>;
}
