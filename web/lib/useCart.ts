"use client";
import { useEffect, useState } from "react";

export type Unit = "carton" | "bundle";
export type CartLine = { itemkey: string; title: string; qty: number; unit: Unit; unitPrice?: number };

const KEY = "magnumb2b_cart";
const EVT = "magnumb2b-cart-change";

function read(): CartLine[] {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function write(next: CartLine[]) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(EVT)); } catch { /* ignore */ }
}

// Per-viewer cart in localStorage, reactive across all components on the page
// (so the header badge and the catalog steppers stay in sync).
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    const sync = () => setLines(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);

  // Mutations read the freshest state from localStorage to avoid stale closures.
  const persist = (next: CartLine[]) => { write(next); setLines(next); };

  const add = (line: CartLine) => {
    const cur = read();
    const i = cur.findIndex((l) => l.itemkey === line.itemkey && l.unit === line.unit);
    if (i >= 0) cur[i] = { ...cur[i], qty: cur[i].qty + line.qty };
    else cur.push(line);
    persist(cur);
  };
  const setQty = (itemkey: string, unit: Unit, qty: number) =>
    persist(read().map((l) => (l.itemkey === itemkey && l.unit === unit ? { ...l, qty: Math.max(1, qty) } : l)));
  const remove = (itemkey: string, unit: Unit) =>
    persist(read().filter((l) => !(l.itemkey === itemkey && l.unit === unit)));
  const clear = () => persist([]);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const qtyOf = (itemkey: string, unit: Unit) => lines.find((l) => l.itemkey === itemkey && l.unit === unit)?.qty ?? 0;
  return { lines, add, setQty, remove, clear, count, qtyOf };
}
