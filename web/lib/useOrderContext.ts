"use client";
import { useEffect, useState } from "react";
import type { OrderKind } from "./bridge";

// The agent "enters" a customer: all ordering happens in this context.
export type OrderContext = { accountKey: string; customerName: string; orderKind: OrderKind };

const KEY = "magnumb2b_ctx";
const EVT = "magnumb2b_ctx_change";

function read(): OrderContext | null {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as OrderContext) : null; } catch { return null; }
}

// Shared across every component instance: writing fires an event so the header
// (and any other reader) updates immediately — no page reload — and "storage"
// keeps other tabs in sync too.
export function useOrderContext() {
  const [ctx, setCtx] = useState<OrderContext | null>(null);

  useEffect(() => {
    const sync = () => setCtx(read());
    sync();
    const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) sync(); };
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const select = (next: OrderContext) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setCtx(next);
    window.dispatchEvent(new Event(EVT));
  };
  // Change only the order kind on the already-selected customer (the "start order" step).
  const setKind = (orderKind: OrderKind) => {
    const cur = read();
    if (!cur) return;
    select({ ...cur, orderKind });
  };
  const exit = () => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    setCtx(null);
    window.dispatchEvent(new Event(EVT));
  };
  return { ctx, select, setKind, exit };
}
