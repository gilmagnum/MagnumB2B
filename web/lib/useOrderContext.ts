"use client";
import { useEffect, useState } from "react";
import type { OrderKind } from "./bridge";

// The agent "enters" a customer: all ordering happens in this context.
export type OrderContext = { accountKey: string; customerName: string; orderKind: OrderKind };

const KEY = "magnumb2b_ctx";

export function useOrderContext() {
  const [ctx, setCtx] = useState<OrderContext | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setCtx(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);

  const select = (next: OrderContext) => {
    setCtx(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const exit = () => {
    setCtx(null);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  };
  return { ctx, select, exit };
}
