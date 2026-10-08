"use server";
import { supabaseServer } from "../lib/supabase/server";
import { supabaseAdmin } from "../lib/supabase/admin";
import { getProfile } from "../lib/auth";
import { managerOrAbove } from "../lib/roles";
import { getVariantStock } from "../lib/variantStock";

// Matrix/carton parents whose variants are all sold out (warehouse 1) — for the live search to hide
// them in the ordering catalog, the same way the server-rendered catalog pages do.
export async function soldOutMatrixParents(): Promise<string[]> {
  const map = await getVariantStock();
  const out: string[] = [];
  for (const [k, v] of map) if (v <= 0) out.push(k);
  return out;
}

type Line = { itemkey: string; title?: string; qty: number; unit: string; sizeLabel?: string; packSize?: number; unitPrice?: number };
type OrderPayload = { accountKey: string; customerName?: string; orderKind?: string; stockId?: number; lines: Line[]; totals?: Record<string, number> };

// Backup copy of a submitted order (the original, as ordered).
export async function saveAppOrder(p: OrderPayload): Promise<{ ok?: boolean; error?: string }> {
  const me = await getProfile().catch(() => null);
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { error: "unauthorized" };
  const { error } = await supabaseAdmin().from("app_orders").insert({
    created_by: user.id, agent_id: me?.agent_id ?? null,
    account_key: p.accountKey, customer_name: p.customerName ?? null, order_kind: p.orderKind ?? null,
    stock_id: p.stockId ?? null, lines: p.lines, totals: p.totals ?? null,
  });
  return error ? { error: error.message } : { ok: true };
}

export type AppOrderRow = {
  id: string; account_key: string; customer_name: string | null; order_kind: string | null;
  stock_id: number | null; lines: Line[]; totals: Record<string, number> | null; created_at: string; agent_id: number | null;
};

// Role-filtered list of app order copies.
export async function listAppOrders(): Promise<AppOrderRow[]> {
  const me = await getProfile().catch(() => null);
  if (!me) return [];
  let qb = supabaseAdmin().from("app_orders")
    .select("id, account_key, customer_name, order_kind, stock_id, lines, totals, created_at, agent_id")
    .order("created_at", { ascending: false }).limit(200);
  if (!managerOrAbove(me.role)) {
    if (me.role === "agent" && me.agent_id != null) qb = qb.eq("agent_id", me.agent_id);
    else return []; // pickers etc. see none
  }
  const { data } = await qb;
  return (data as AppOrderRow[]) ?? [];
}

// --- Cart drafts (one per user+customer) ---
export async function saveDraft(p: { accountKey: string; customerName?: string; orderKind?: string; lines: Line[] }): Promise<{ ok?: boolean; error?: string }> {
  const me = await getProfile().catch(() => null);
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { error: "unauthorized" };
  const { error } = await supabaseAdmin().from("order_drafts").upsert({
    created_by: user.id, agent_id: me?.agent_id ?? null,
    account_key: p.accountKey, customer_name: p.customerName ?? null, order_kind: p.orderKind ?? null,
    lines: p.lines, updated_at: new Date().toISOString(),
  }, { onConflict: "created_by,account_key" });
  return error ? { error: error.message } : { ok: true };
}

export async function getDraft(accountKey: string): Promise<{ lines: Line[]; updated_at: string } | null> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return null;
  const { data } = await supabaseAdmin().from("order_drafts")
    .select("lines, updated_at").eq("created_by", user.id).eq("account_key", accountKey).maybeSingle();
  return data ? { lines: (data.lines as Line[]) ?? [], updated_at: data.updated_at as string } : null;
}

// --- Picking logs (picker notes + shortages, saved on finish) ---
export type PickLogLine = { itemkey: string; size?: string; ordered: number; picked: number };
export type PickShortage = { itemkey: string; size?: string; name?: string; ordered: number; picked: number; kind: "full" | "partial" };
export type PickLogRow = {
  id: string; stock_id: number | null; doc_number: number | null; account_key: string | null;
  picker: string | null; notes: string | null; lines: PickLogLine[]; shortages: PickShortage[]; created_at: string;
};
export async function listPickingLogs(opts: { from?: string; to?: string } = {}): Promise<PickLogRow[]> {
  const me = await getProfile().catch(() => null);
  if (!me) return [];
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  let qb = supabaseAdmin().from("picking_logs")
    .select("id, stock_id, doc_number, account_key, picker, notes, lines, shortages, created_at")
    .order("created_at", { ascending: false }).limit(200);
  // Managers see all; a picker sees their own.
  if (!managerOrAbove(me.role)) qb = qb.eq("created_by", user?.id ?? "");
  if (opts.from) qb = qb.gte("created_at", `${opts.from}T00:00:00`);
  if (opts.to) qb = qb.lte("created_at", `${opts.to}T23:59:59`);
  const { data } = await qb;
  return (data as PickLogRow[]) ?? [];
}

export async function deleteDraft(accountKey: string): Promise<{ ok?: boolean }> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { ok: true };
  await supabaseAdmin().from("order_drafts").delete().eq("created_by", user.id).eq("account_key", accountKey);
  return { ok: true };
}
