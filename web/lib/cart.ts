// Cart logic (pure) — encodes the ordering business rules, independent of UI.
// Produces the POST /orders body per shared/contract.md.
import type { Item, NewOrder, OrderKind } from "./bridge";

export type Unit = "carton" | "bundle";

export type CartLine = {
  itemkey: string;        // for matrix: the cell SKU; else the model
  title: string;          // display name (+ size/color for matrix cells)
  qty: number;            // count of the chosen unit (>=1)
  unit: Unit;             // min order unit = bundle
  unitPrice?: number;     // display price (resolved via /price); authoritative at production
};

export type Cart = {
  accountKey: string;     // customer being ordered for (agent picks it)
  orderKind: OrderKind;   // picking (doc 11) | future (doc 6)
  lines: CartLine[];
  shipping: { carton: number; pallet: number }; // M1001 / M1002 — picking only
};

export const emptyCart = (accountKey: string, orderKind: OrderKind): Cart => ({
  accountKey, orderKind, lines: [], shipping: { carton: 0, pallet: 0 },
});

// How many units a given unit represents for an item (ExtraSums SuFID 5/6).
export function unitSize(item: Item, unit: Unit): number | undefined {
  return unit === "carton" ? item.perCarton : item.perBundle;
}

// Can this unit be ordered for this item? (min unit = bundle; carton needs perCarton)
export function unitAvailable(item: Item, unit: Unit): boolean {
  return (unitSize(item, unit) ?? 0) > 0;
}

export function addLine(cart: Cart, line: CartLine): Cart {
  if (line.qty < 1) throw new Error("כמות חייבת להיות לפחות 1");
  const i = cart.lines.findIndex((l) => l.itemkey === line.itemkey && l.unit === line.unit);
  const lines = [...cart.lines];
  if (i >= 0) lines[i] = { ...lines[i], qty: lines[i].qty + line.qty };
  else lines.push(line);
  return { ...cart, lines };
}

export function removeLine(cart: Cart, itemkey: string, unit: Unit): Cart {
  return { ...cart, lines: cart.lines.filter((l) => !(l.itemkey === itemkey && l.unit === unit)) };
}

// Total units for a line (qty × unit size) — what Hashavshevet stores as Quantity.
export function lineUnits(item: Item, line: CartLine): number {
  return line.qty * (unitSize(item, line.unit) ?? 0);
}

export function cartTotal(cart: Cart, itemsByKey: Map<string, Item>): number {
  return cart.lines.reduce((sum, l) => {
    const item = itemsByKey.get(l.itemkey);
    const units = item ? lineUnits(item, l) : 0;
    return sum + units * (l.unitPrice ?? item?.price ?? 0);
  }, 0);
}

// Build the POST /orders payload. Shipping only on picking orders.
export function toNewOrder(cart: Cart): NewOrder {
  if (!cart.accountKey) throw new Error("יש לבחור לקוח");
  if (!cart.lines.length) throw new Error("הסל ריק");
  const order: NewOrder = {
    accountKey: cart.accountKey,
    orderKind: cart.orderKind,
    lines: cart.lines.map((l) => ({ itemkey: l.itemkey, qty: l.qty, unit: l.unit, price: l.unitPrice })),
  };
  if (cart.orderKind === "picking" && (cart.shipping.carton > 0 || cart.shipping.pallet > 0)) {
    order.shipping = { carton: cart.shipping.carton, pallet: cart.shipping.pallet };
  }
  return order;
}
