// Typed client for the bridge HTTP API (see /shared/contract.md).
// Calls go through our same-origin server proxy (/api/bridge/*), which injects
// the secret BRIDGE_TOKEN server-side. The token is NEVER in client code.

const BASE = "/api/bridge";

export type Item = {
  itemkey: string; itemName: string; foreignName?: string;
  price: number; barcode?: string;
  brand?: string; categoryMain?: string; categorySub?: string; season?: string;
  rulerCode?: string; color?: string;
  perCarton?: number; perBundle?: number;
  shownOnSite: boolean; ignoreStock: boolean; isMatrix: boolean;
  imageUrl?: string; cells?: MatrixCell[];
};
export type MatrixCell = {
  itemkey: string; sizeLabel?: string; colorLabel?: string;
  line: number; col: number; stock?: number;
};
export type Customer = {
  accountKey: string; fullName: string; agent?: number;
  discountCode?: string; totalDiscountPct?: number; forPicking: boolean;
};
export type PriceResult = {
  itemkey: string; accountKey: string; qty: number;
  unitPrice: number; discountPct: number;
  source: "special" | "wsprice" | "pricelist" | "promo" | "computed";
};
export type OrderKind = "picking" | "future";
export type NewOrder = {
  accountKey: string; orderKind: OrderKind;
  lines: { itemkey: string; qty: number; unit: "carton" | "bundle"; price?: number }[];
  shipping?: { carton?: number; pallet?: number };
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`bridge ${path} -> ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const bridge = {
  items: (q: { category?: string; shownOnSite?: boolean; search?: string } = {}) => {
    const p = new URLSearchParams();
    if (q.category) p.set("category", q.category);
    if (q.shownOnSite) p.set("shownOnSite", "1");
    if (q.search) p.set("search", q.search);
    return call<Item[]>(`/items?${p.toString()}`);
  },
  item: (itemkey: string) => call<Item>(`/items/${encodeURIComponent(itemkey)}`),
  // agentId 0 => all customers (admin). q => optional name/accountKey search.
  customers: (agentId: number, opts: { q?: string } = {}) => {
    const p = new URLSearchParams({ agent: String(agentId) });
    if (opts.q) p.set("q", opts.q);
    return call<Customer[]>(`/customers?${p.toString()}`);
  },
  stock: (itemkey: string) => call<{ itemkey: string; qty: number }>(`/stock/${encodeURIComponent(itemkey)}`),
  price: (accountKey: string, item: string, qty: number) =>
    call<PriceResult>(`/price?account=${encodeURIComponent(accountKey)}&item=${encodeURIComponent(item)}&qty=${qty}`),
  createOrder: (order: NewOrder) =>
    call<{ stockId: number }>(`/orders`, { method: "POST", body: JSON.stringify(order) }),
};
