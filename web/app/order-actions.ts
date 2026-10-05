"use server";
import { supabaseServer } from "../lib/supabase/server";
import { supabaseAdmin } from "../lib/supabase/admin";
import { getProfile } from "../lib/auth";
import { managerOrAbove } from "../lib/roles";

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

export async function deleteDraft(accountKey: string): Promise<{ ok?: boolean }> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { ok: true };
  await supabaseAdmin().from("order_drafts").delete().eq("created_by", user.id).eq("account_key", accountKey);
  return { ok: true };
}
