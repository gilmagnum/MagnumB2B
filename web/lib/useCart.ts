"use client";
import { useEffect, useState } from "react";

export type Unit = "carton" | "bundle";
// qty = number of cartons/bundles; packSize = units per carton/bundle (so units = qty * packSize).
// sizeLabel = for ruler products (one SKU, ordered per size); each size is its own line so the
// picker picks it separately. Empty for plain/matrix items (matrix uses a distinct SKU per cell).
export type CartLine = { itemkey: string; title: string; qty: number; unit: Unit; unitPrice?: number; packSize?: number; sizeLabel?: string; stock?: number };

const KEY = "magnumb2b_cart";
const EVT = "magnumb2b-cart-change";

function read(): CartLine[] {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function write(next: CartLine[]) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(EVT)); } catch { /* ignore */ }
}
const same = (l: CartLine, itemkey: string, unit: Unit, sizeLabel?: string) =>
  l.itemkey === itemkey && l.unit === unit && (l.sizeLabel ?? "") === (sizeLabel ?? "");

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
    const i = cur.findIndex((l) => same(l, line.itemkey, line.unit, line.sizeLabel));
    if (i >= 0) cur[i] = { ...cur[i], qty: cur[i].qty + line.qty };
    else cur.push(line);
    persist(cur);
  };
  const setQty = (itemkey: string, unit: Unit, qty: number, sizeLabel?: string) =>
    persist(read().map((l) => (same(l, itemkey, unit, sizeLabel) ? { ...l, qty: Math.max(1, qty) } : l)));
  const remove = (itemkey: string, unit: Unit, sizeLabel?: string) =>
    persist(read().filter((l) => !same(l, itemkey, unit, sizeLabel)));
  const clear = () => persist([]);
  const setAll = (next: CartLine[]) => persist(next); // replace the whole cart (e.g. load a draft)

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const qtyOf = (itemkey: string, unit: Unit, sizeLabel?: string) => lines.find((l) => same(l, itemkey, unit, sizeLabel))?.qty ?? 0;
  return { lines, add, setQty, remove, clear, setAll, count, qtyOf };
}
