"use server";
import { supabaseServer } from "../lib/supabase/server";
import { supabaseAdmin } from "../lib/supabase/admin";
import { managerOrAbove } from "../lib/roles";
import { callBridge, BridgeError } from "../lib/bridgeServer";
import type { DocumentDetail, DocLine } from "../lib/bridge";

// Surplus approvals. A picker's over-pick is recorded here as 'pending' (the document is written
// at the ordered quantity by finishPicking). A MANAGER approves it; approval runs ENTIRELY on the
// server: claim the row atomically, read the lines from the DB, then call the bridge's dedicated
// approve-surplus op (an ABSOLUTE set of only those lines, with a staleness guard). Money numbers
// (ordered/price) come from the Hashavshevet document, never from the client. See docs/surplus-approvals.sql.

type Me = { id: string; role: string; agentId: number | null; name: string };
async function who(): Promise<Me | null> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabaseAdmin().from("profiles").select("role, full_name, agent_id").eq("id", user.id).single();
  const role = (prof?.role as string) ?? "";
  if (!(role === "picker" || managerOrAbove(role))) return null;
  return { id: user.id, role, agentId: (prof?.agent_id as number | null) ?? null, name: (prof?.full_name as string) || user.email || "" };
}

export type SurplusLine = { itemkey: string; size?: string; ordered: number; picked: number; surplus: number; unitPrice: number; discountPct: number; amount: number };
export type SurplusRow = {
  id: string; stockId: number; docNumber: number | null; accountKey: string | null; customerName: string | null;
  lines: SurplusLine[]; units: number; amount: number; picker: string | null; status: string;
  approvedBy: string | null; createdAt: string;
};

const net = (unitPrice: number, discountPct: number) => unitPrice * (1 - (discountPct || 0) / 100);
const round2 = (n: number) => Math.round(n * 100) / 100;
const keyOf = (itemkey: string, size?: string) => `${itemkey}\u0000${size ?? ""}`;

// Called when a non-manager finishes with a surplus. The client sends only the physical picked
// counts; ordered quantity and price are read from the Hashavshevet document (authoritative).
export async function recordSurplusApproval(p: {
  stockId: number;
  lines: { itemkey: string; size?: string; picked: number }[];
}): Promise<{ ok?: boolean; error?: string }> {
  const u = await who();
  if (!u) return { error: "unauthorized" };

  // Read the document from the bridge — ordered qty + price are taken from here, not the client.
  let doc: DocumentDetail;
  try {
    doc = await callBridge<DocumentDetail>(`/documents/${p.stockId}`, { role: u.role, agentId: u.agentId });
  } catch {
    return { error: "לא ניתן לקרוא את המסמך מהגשר כרגע — נסה שוב." };
  }
  const byKey = new Map<string, DocLine>();
  for (const l of doc.lines ?? []) if (!l.isShipping && !l.isPacking) byKey.set(keyOf(l.itemkey, l.size), l);

  const lines: SurplusLine[] = [];
  for (const cl of p.lines ?? []) {
    const picked = Math.max(0, Math.floor(Number(cl.picked) || 0));
    const dl = byKey.get(keyOf(cl.itemkey, cl.size));
    if (!dl) continue; // only lines that exist on the document
    const ordered = Math.max(0, Math.floor(Number(dl.qty) || 0));
    const surplus = Math.max(0, picked - ordered);
    if (surplus <= 0) continue;
    const unitPrice = Number(dl.unitPrice) || 0;
    const discountPct = Number(dl.discountPct) || 0;
    lines.push({ itemkey: String(dl.itemkey), size: dl.size, ordered, picked, surplus, unitPrice, discountPct, amount: round2(surplus * net(unitPrice, discountPct)) });
  }
  if (!lines.length) return { ok: true };
  const units = lines.reduce((s, l) => s + l.surplus, 0);
  const amount = round2(lines.reduce((s, l) => s + l.amount, 0));

  // One open request per document (the partial unique index also enforces this).
  const { error } = await supabaseAdmin().from("surplus_approvals").insert({
    stock_id: p.stockId, doc_number: doc.docNumber ?? null, account_key: doc.accountKey ?? null, customer_name: doc.customerName ?? null,
    lines, units, amount, picker: u.name, created_by: u.id, status: "pending",
  });
  if (error) {
    // 23505 = the partial unique index: an open request already exists for this document.
    if ((error as { code?: string }).code === "23505") return { ok: true };
    return { error: error.message };
  }
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

// Approve a surplus (manager only). Runs entirely server-side and is write-once:
//  1. atomically claim the row (pending -> approving); a second caller gets nothing.
//  2. read the lines from the claimed DB row (never the client).
//  3. call the bridge's approve-surplus op: ABSOLUTE set of each line to newQty, with `ordered`
//     for a staleness guard. The bridge touches only these lines.
//  4. success -> 'approved' (+ log). Definitive 4xx refusal -> back to 'pending'. Anything else
//     (network/5xx/timeout) -> stays 'approving' (UNKNOWN) for manual reconciliation; never auto-released.
export async function approveSurplus(id: string): Promise<{ ok?: boolean; error?: string; unknown?: boolean }> {
  const u = await who();
  if (!u || !managerOrAbove(u.role)) return { error: "אין הרשאה" };

  const admin = supabaseAdmin();
  const { data: claimed, error: claimErr } = await admin.from("surplus_approvals")
    .update({ status: "approving" }).eq("id", id).eq("status", "pending")
    .select("id, stock_id, lines, units, amount").single();
  if (claimErr || !claimed) return { error: "הבקשה כבר טופלה או נתפסה על ידי מנהל אחר." };

  const stockId = claimed.stock_id as number;
  const rowLines = (claimed.lines as SurplusLine[]) ?? [];
  const bridgeLines = rowLines.map((l) => ({ itemkey: l.itemkey, size: l.size, ordered: l.ordered, newQty: l.picked }));

  try {
    await callBridge(`/picking/${stockId}/approve-surplus`, {
      method: "POST", role: u.role, agentId: u.agentId,
      body: { approver: u.name, lines: bridgeLines },
    });
  } catch (e) {
    if (e instanceof BridgeError && e.definitive) {
      // The write did NOT happen — release back to pending so the manager can retry or reject.
      await admin.from("surplus_approvals").update({ status: "pending" }).eq("id", id).eq("status", "approving");
      const stale = /STALE|409/.test(e.message);
      return { error: stale ? "המסמך השתנה מאז הבקשה — נדחה. בדוק מחדש." : "הגשר דחה את ההגדלה — לא בוצע שינוי." };
    }
    // Unknown outcome: leave 'approving' for manual reconciliation.
    return { error: "מצב לא ודאי — ייתכן שהכתיבה בוצעה או לא. בדוק בחשבשבת לפני אישור חוזר.", unknown: true };
  }

  await admin.from("surplus_approvals")
    .update({ status: "approved", resolved_by: u.id, resolved_at: new Date().toISOString(), approved_by: u.name })
    .eq("id", id).eq("status", "approving");
  await admin.from("surplus_approval_log").insert({
    surplus_id: id, stock_id: stockId, action: "approved", units: claimed.units as number, amount: claimed.amount as number, by_name: u.name, by_uid: u.id,
  });
  return { ok: true };
}

// Reject a surplus (manager only). Atomic claim pending -> rejected + audit log. No bridge write.
export async function rejectSurplus(id: string): Promise<{ ok?: boolean; error?: string }> {
  const u = await who();
  if (!u || !managerOrAbove(u.role)) return { error: "אין הרשאה" };
  const { data: r, error } = await supabaseAdmin().from("surplus_approvals")
    .update({ status: "rejected", resolved_by: u.id, resolved_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending").select("stock_id, units, amount").single();
  if (error || !r) return { error: "הבקשה כבר טופלה." };
  await supabaseAdmin().from("surplus_approval_log").insert({
    surplus_id: id, stock_id: r.stock_id as number, action: "rejected", units: r.units as number, amount: r.amount as number, by_name: u.name, by_uid: u.id,
  });
  return { ok: true };
}
