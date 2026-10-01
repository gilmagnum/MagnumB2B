"use client";
import { useEffect, useState } from "react";

export type Unit = "carton" | "bundle";
export type CartLine = { itemkey: string; title: string; qty: number; unit: Unit; unitPrice?: number };

const KEY = "magnumb2b_cart";

// Per-viewer cart kept in localStorage (a convenience; the real order is written via the bridge).
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setLines(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);

  const persist = (next: CartLine[]) => {
    setLines(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const add = (line: CartLine) => {
    const i = lines.findIndex((l) => l.itemkey === line.itemkey && l.unit === line.unit);
    const next = [...lines];
    if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + line.qty };
    else next.push(line);
    persist(next);
  };
  const setQty = (itemkey: string, unit: Unit, qty: number) =>
    persist(lines.map((l) => (l.itemkey === itemkey && l.unit === unit ? { ...l, qty: Math.max(1, qty) } : l)));
  const remove = (itemkey: string, unit: Unit) =>
    persist(lines.filter((l) => !(l.itemkey === itemkey && l.unit === unit)));
  const clear = () => persist([]);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  return { lines, add, setQty, remove, clear, count };
}
