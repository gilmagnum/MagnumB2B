"use server";
import { supabaseServer } from "../lib/supabase/server";
import { supabaseAdmin } from "../lib/supabase/admin";
import { managerOrAbove } from "../lib/roles";

// Shared picking (split lines) — only used when the shared_picking_enabled flag is on. Per-line
// ownership + per-line quantity, so two pickers never write the same line. See docs/shared-picking.md.

const LOCK_MIN = 10;
const isActive = (updatedAt: string) => Date.now() - new Date(updatedAt).getTime() < LOCK_MIN * 60000;

async function pickingUser(): Promise<{ id: string; role: string; name: string } | null> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabaseAdmin().from("profiles").select("role, full_name").eq("id", user.id).single();
  const role = (prof?.role as string) ?? "";
  if (!(role === "picker" || managerOrAbove(role))) return null;
  // Name is taken from the server profile — never from the client — so no one records under another's name.
  return { id: user.id, role, name: (prof?.full_name as string) || user.email || "" };
}

export type SharedLine = { lineKey: string; assignedId: string | null; assignedName: string | null; pickedQty: number };
export type SharedParticipant = { pickerId: string; pickerName: string; partDone: boolean; notes: string | null };
export type SharedState = { mode: "split"; ownerId: string | null; ownerName: string | null; myId: string; lines: SharedLine[]; participants: SharedParticipant[] };

// Current shared state for an order, or null if it isn't in split mode.
export async function getSharedState(stockId: number): Promise<SharedState | null> {
  const u = await pickingUser();
  if (!u) return null;
  const admin = supabaseAdmin();
  const { data: s } = await admin.from("picking_sessions").select("mode, owner_id, owner_name").eq("stock_id", stockId).maybeSingle();
  if (!s || s.mode !== "split") return null;
  const [{ data: lines }, { data: parts }] = await Promise.all([
    admin.from("picking_lines").select("line_key, assigned_picker_id, assigned_picker_name, picked_qty").eq("stock_id", stockId),
    admin.from("picking_participants").select("picker_id, picker_name, part_done, notes").eq("stock_id", stockId),
  ]);
  return {
    mode: "split", ownerId: (s.owner_id as string) ?? null, ownerName: (s.owner_name as string) ?? null, myId: u.id,
    lines: (lines ?? []).map((l) => ({ lineKey: l.line_key as string, assignedId: (l.assigned_picker_id as string) ?? null, assignedName: (l.assigned_picker_name as string) ?? null, pickedQty: (l.picked_qty as number) ?? 0 })),
    participants: (parts ?? []).map((p) => ({ pickerId: p.picker_id as string, pickerName: (p.picker_name as string) ?? "", partDone: !!p.part_done, notes: (p.notes as string) ?? null })),
  };
}

// The opener splits: assign chosen lines to themselves, release the rest. `assign` carries every order
// line with a `mine` flag and its current picked qty (to seed the opener's lines).
export async function splitPickingSession(stockId: number, _clientName: string, assign: { lineKey: string; mine: boolean; qty: number }[]): Promise<{ ok?: boolean; error?: string }> {
  const u = await pickingUser();
  if (!u) return { error: "unauthorized" };
  const name = u.name;
  const admin = supabaseAdmin();
  const { data: s } = await admin.from("picking_sessions").select("picker_id, owner_id, mode, updated_at").eq("stock_id", stockId).maybeSingle();
  if (s && s.mode === "split" && s.owner_id && s.owner_id !== u.id && !managerOrAbove(u.role)) return { error: "ההזמנה כבר בפיצול" };
  if (s && s.picker_id && s.picker_id !== u.id && isActive(s.updated_at as string) && !managerOrAbove(u.role)) return { error: "ההזמנה ננעלה על ידי מלקט אחר" };
  const now = new Date().toISOString();
  await admin.from("picking_sessions").upsert({ stock_id: stockId, picker_id: u.id, picker_name: name, owner_id: u.id, owner_name: name, mode: "split", updated_at: now }, { onConflict: "stock_id" });
  const rows = assign.map((a) => ({
    stock_id: stockId, line_key: a.lineKey,
    assigned_picker_id: a.mine ? u.id : null, assigned_picker_name: a.mine ? name : null,
    picked_qty: a.mine ? Math.max(0, a.qty | 0) : 0, updated_at: now,
  }));
  const { error } = await admin.from("picking_lines").upsert(rows, { onConflict: "stock_id,line_key" });
  if (error) return { error: error.message };
  await admin.from("picking_participants").upsert({ stock_id: stockId, picker_id: u.id, picker_name: name, part_done: false, updated_at: now }, { onConflict: "stock_id,picker_id" });
  return { ok: true };
}

// Entering picker takes all still-unassigned lines (atomic). Capped at 2 participants.
export async function claimRemainingLines(stockId: number, _clientName: string): Promise<{ ok?: boolean; error?: string; claimed?: number }> {
  const u = await pickingUser();
  if (!u) return { error: "unauthorized" };
  const name = u.name;
  const admin = supabaseAdmin();
  // Count-then-upsert: two parallel joins could in theory both pass (cosmetic — max 2 is a soft cap).
  const { data: parts } = await admin.from("picking_participants").select("picker_id").eq("stock_id", stockId);
  if ((parts ?? []).filter((p) => p.picker_id !== u.id).length >= 2) return { error: "כבר שני מלקטים על ההזמנה" };
  const { data: claimed, error } = await admin.from("picking_lines")
    .update({ assigned_picker_id: u.id, assigned_picker_name: name, updated_at: new Date().toISOString() })
    .eq("stock_id", stockId).is("assigned_picker_id", null).select("line_key");
  if (error) return { error: error.message };
  await admin.from("picking_participants").upsert({ stock_id: stockId, picker_id: u.id, picker_name: name, part_done: false, updated_at: new Date().toISOString() }, { onConflict: "stock_id,picker_id" });
  return { ok: true, claimed: (claimed ?? []).length };
}

// Save my line's picked qty — only if the line is assigned to me (conditional update).
export async function saveSharedLine(stockId: number, lineKey: string, qty: number): Promise<{ ok?: boolean; error?: string }> {
  const u = await pickingUser();
  if (!u) return { error: "unauthorized" };
  const admin = supabaseAdmin();
  const { data } = await admin.from("picking_lines")
    .update({ picked_qty: Math.max(0, qty | 0), updated_at: new Date().toISOString() })
    .eq("stock_id", stockId).eq("line_key", lineKey).eq("assigned_picker_id", u.id).select("line_key");
  if (!data || !data.length) return { error: "השורה אינה משויכת אליך" };
  await admin.from("picking_participants").update({ updated_at: new Date().toISOString() }).eq("stock_id", stockId).eq("picker_id", u.id);
  return { ok: true };
}

// A participant marks (or unmarks) "my part is done" + saves their note.
export async function markPartDone(stockId: number, done: boolean, notes?: string): Promise<{ ok?: boolean }> {
  const u = await pickingUser();
  if (!u) return { ok: false };
  const note = notes ? String(notes).slice(0, 500) : null; // cap length
  await supabaseAdmin().from("picking_participants")
    .update({ part_done: !!done, notes: note, updated_at: new Date().toISOString() })
    .eq("stock_id", stockId).eq("picker_id", u.id);
  return { ok: true };
}

// Only the owner (opener) or a manager may finalize the shared pick.
export async function canFinalizeShared(stockId: number): Promise<{ allowed: boolean; ownerName?: string }> {
  const u = await pickingUser();
  if (!u) return { allowed: false };
  const { data: s } = await supabaseAdmin().from("picking_sessions").select("owner_id, owner_name").eq("stock_id", stockId).maybeSingle();
  return { allowed: !!s && ((s.owner_id as string) === u.id || managerOrAbove(u.role)), ownerName: (s?.owner_name as string) ?? undefined };
}

// After the owner/manager wrote the finish to Hashavshevet, drop the shared rows + session.
export async function cleanupSharedPicking(stockId: number): Promise<{ ok?: boolean; error?: string }> {
  const u = await pickingUser();
  if (!u) return { error: "unauthorized" };
  const admin = supabaseAdmin();
  const { data: s } = await admin.from("picking_sessions").select("owner_id").eq("stock_id", stockId).maybeSingle();
  if (!(s && ((s.owner_id as string) === u.id || managerOrAbove(u.role)))) return { error: "רק הפותח או מנהל יכולים לסגור" };
  await admin.from("picking_lines").delete().eq("stock_id", stockId);
  await admin.from("picking_participants").delete().eq("stock_id", stockId);
  await admin.from("picking_sessions").delete().eq("stock_id", stockId);
  return { ok: true };
}

// For the queue: which of these orders are in split mode (shown as "partial", not locked), by owner.
export async function getSplitOrders(stockIds: number[]): Promise<Record<number, string>> {
  if (!stockIds.length) return {};
  if (!(await pickingUser())) return {};
  const { data } = await supabaseAdmin().from("picking_sessions").select("stock_id, owner_name, mode").in("stock_id", stockIds).eq("mode", "split");
  const out: Record<number, string> = {};
  for (const r of data ?? []) out[r.stock_id as number] = (r.owner_name as string) || "מלקט";
  return out;
}
