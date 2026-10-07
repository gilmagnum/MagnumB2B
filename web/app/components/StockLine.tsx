"use client";
// Available stock (warehouse 1), shown to staff who may see it. For matrix / carton-size
// items the parent has no meaningful total (stock lives on the size cells), so we say so.
export default function StockLine({ stock, perSize, size = "sm" }: {
  stock?: number | null; perSize?: boolean; size?: "sm" | "md";
}) {
  const fs = size === "md" ? 13 : 12;
  if (perSize) return <div style={{ fontSize: fs, color: "var(--ink-muted)" }}>מלאי לפי מידה</div>;
  const n = stock ?? 0;
  // Never show a confusing negative balance (oversold / parent-SKU artefact) — floor at 0.
  if (n <= 0) return <div style={{ fontSize: fs, color: "var(--danger)", fontWeight: 600 }}>אזל מהמלאי</div>;
  return <div style={{ fontSize: fs, color: "var(--ok)", fontWeight: 600 }}>מלאי: {n}</div>;
}
