import { supabase } from "./supabase";

// Total warehouse-1 stock of each matrix/carton parent, summed over its variant SKUs.
// Catalog rows carry the parent SKU whose own Items.Quantity is ~0 (stock lives on the cells),
// so to hide a parent that is fully sold out we aggregate its variants' items.stock — the same
// warehouse-1 rolled balance the product page shows per cell. Cached briefly: stock syncs often,
// and recomputing on every catalog render is ~8 paged reads.
type Cache = { at: number; map: Map<string, number> };
let cache: Cache | null = null;
const TTL = 5 * 60_000;
const PAGE = 1000;

async function compute(): Promise<Map<string, number>> {
  // 1) variant -> parent (every parent that has variants, so a fully-out parent still gets a 0).
  const parentOf = new Map<string, string>();
  const parents = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("item_variants").select("itemkey,parent_itemkey").range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const v of batch as { itemkey: string; parent_itemkey: string }[]) {
      if (!v.itemkey || !v.parent_itemkey) continue;
      parentOf.set(v.itemkey, v.parent_itemkey);
      parents.add(v.parent_itemkey);
    }
    if (batch.length < PAGE) break;
  }

  // 2) in-stock SKUs (warehouse 1). Only stock > 0 to keep the set small.
  const stockOf = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("items").select("itemkey,stock").gt("stock", 0).range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const r of batch as { itemkey: string; stock: number | null }[]) {
      if (r.itemkey) stockOf.set(r.itemkey, Number(r.stock ?? 0));
    }
    if (batch.length < PAGE) break;
  }

  // 3) sum each parent's variant stock (0 when all variants are out).
  const sum = new Map<string, number>();
  for (const p of parents) sum.set(p, 0);
  for (const [variant, parent] of parentOf) {
    const s = stockOf.get(variant);
    if (s) sum.set(parent, (sum.get(parent) ?? 0) + s);
  }
  return sum;
}

// parent itemkey -> total warehouse-1 stock across its variants. Parents without variant rows are absent.
export async function getVariantStock(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  try {
    const map = await compute();
    cache = { at: Date.now(), map };
    return map;
  } catch {
    return cache?.map ?? new Map(); // on failure keep the last good map (or empty -> nothing hidden)
  }
}

// Annotate matrix/carton parents in place with variant_stock (aggregate warehouse-1 stock).
// Non-parents and parents without variant rows stay null, so they are never hidden by this.
export function applyVariantStock<T extends { itemkey: string; matrix_flag: boolean; is_carton_size_item?: boolean; variant_stock?: number | null }>(
  items: T[], map: Map<string, number>,
): T[] {
  for (const it of items) {
    if ((it.matrix_flag || it.is_carton_size_item) && map.has(it.itemkey)) {
      it.variant_stock = map.get(it.itemkey) ?? null;
    }
  }
  return items;
}
