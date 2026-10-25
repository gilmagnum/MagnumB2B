"use server";
import { supabaseServer } from "../lib/supabase/server";
import { supabaseAdmin } from "../lib/supabase/admin";
import { managerOrAbove } from "../lib/roles";

// Surplus approvals: a picker's over-pick is recorded here (document written at ordered); a MANAGER
// approves it on the approvals screen, which triggers a manager finish that writes the increase.
// See docs/surplus-approvals.sql.

async function who(): Promise<{ id: string; role: string; name: string } | null> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabaseAdmin().from("profiles").select("role, full_name").eq("id", user.id).single();
  const role = (prof?.role as string) ?? "";
  if (!(role === "picker" || managerOrAbove(role))) return null;
  return { id: user.id, role, name: (prof?.full_name as string) || user.email || "" };
}

export type SurplusLine = { itemkey: string; size?: string; ordered: number; picked: number; surplus: number; unitPrice?: number; discountPct?: number; amount: number };
export type SurplusRow = {
  id: string; stockId: number; docNumber: number | null; accountKey: string | null; customerName: string | null;
  lines: SurplusLine[]; units: number; amount: number; picker: string | null; status: string;
  approvedBy: string | null; createdAt: string;
};

const net = (unitPrice?: number, discountPct?: number) => (unitPrice ?? 0) * (1 - (discountPct ?? 0) / 100);

// Called when a non-manager finishes with a surplus: record it as pending (amounts recomputed here).
export async function recordSurplusApproval(p: {
  stockId: number; docNumber?: number | null; accountKey?: string | null; customerName?: string | null;
  lines: { itemkey: string; size?: string; ordered: number; picked: number; unitPrice?: number; discountPct?: number }[];
}): Promise<{ ok?: boolean; error?: string }> {
  const u = await who();
  if (!u) return { error: "unauthorized" };
  const lines: SurplusLine[] = (p.lines ?? [])
    .map((l) => {
      const ordered = Math.max(0, Math.floor(Number(l.ordered) || 0));
      const picked = Math.max(0, Math.floor(Number(l.picked) || 0));
      const surplus = Math.max(0, picked - ordered);
      return { itemkey: String(l.itemkey), size: l.size, ordered, picked, surplus, unitPrice: l.unitPrice, discountPct: l.discountPct, amount: Math.round(surplus * net(l.unitPrice, l.discountPct) * 100) / 100 };
    })
    .filter((l) => l.surplus > 0);
  if (!lines.length) return { ok: true };
  const units = lines.reduce((s, l) => s + l.surplus, 0);
  const amount = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const { error } = await supabaseAdmin().from("surplus_approvals").insert({
    stock_id: p.stockId, doc_number: p.docNumber ?? null, account_key: p.accountKey ?? null, customer_name: p.customerName ?? null,
    lines, units, amount, picker: u.name, created_by: u.id, status: "pending",
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function listPendingSurplus(): Promise<SurplusRow[]> {
  const u = await who();
  if (!u || !managerOrAbove(u.role)) return [];
  const { data } = await supabaseAdmin().from("surplus_approvals")
    .select("id, stock_id, doc_number, account_key, customer_name, lines, units, amount, picker, status, approved_by, created_at")
    .eq("status", "pending").order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string, stockId: r.stock_id as number, docNumber: (r.doc_number as number) ?? null,
    accountKey: (r.account_key as string) ?? null, customerName: (r.customer_name as string) ?? null,
    lines: (r.lines as SurplusLine[]) ?? [], units: (r.units as number) ?? 0, amount: (r.amount as number) ?? 0,
    picker: (r.picker as string) ?? null, status: r.status as string, approvedBy: (r.approved_by as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function pendingSurplusCount(): Promise<number> {
  const u = await who();
  if (!u || !managerOrAbove(u.role)) return 0;
  const { count } = await supabaseAdmin().from("surplus_approvals").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

// Mark a pending surplus approved/rejected (manager only). On approve, the CLIENT first writes the
// increase to Hashavshevet (a manager finishPicking) and then calls this to record the decision.
export async function resolveSurplus(id: string, approve: boolean): Promise<{ ok?: boolean; error?: string }> {
  const u = await who();
  if (!u || !managerOrAbove(u.role)) return { error: "אין הרשאה" };
  const { error } = await supabaseAdmin().from("surplus_approvals")
    .update({ status: approve ? "approved" : "rejected", resolved_by: u.id, resolved_at: new Date().toISOString(), approved_by: approve ? u.name : null })
    .eq("id", id).eq("status", "pending");
  if (error) return { error: error.message };
  return { ok: true };
}
