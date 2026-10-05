"use server";
import { supabaseServer } from "../lib/supabase/server";
import { supabaseAdmin } from "../lib/supabase/admin";

const LOCK_MIN = 10; // a session is "held" while touched within this window
const isActive = (updatedAt: string) => Date.now() - new Date(updatedAt).getTime() < LOCK_MIN * 60000;

type Progress = Record<string, number>;
type OpenResult = { progress?: Progress; notes?: string; takenOver?: boolean; lockedBy?: string };

// Acquire/resume the picking session for an order. Blocks if another picker holds it (active).
export async function openPickingSession(stockId: number, pickerName: string): Promise<OpenResult> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { lockedBy: "לא מחובר" };
  const admin = supabaseAdmin();
  const { data: s } = await admin.from("picking_sessions").select("*").eq("stock_id", stockId).maybeSingle();
  if (!s) {
    await admin.from("picking_sessions").insert({ stock_id: stockId, picker_id: user.id, picker_name: pickerName, progress: {}, updated_at: new Date().toISOString() });
    return { progress: {}, notes: "" };
  }
  if (s.picker_id === user.id) {
    await admin.from("picking_sessions").update({ updated_at: new Date().toISOString(), picker_name: pickerName }).eq("stock_id", stockId);
    return { progress: (s.progress as Progress) ?? {}, notes: (s.notes as string) ?? "" };
  }
  if (isActive(s.updated_at as string)) return { lockedBy: (s.picker_name as string) || "מלקט אחר" };
  // stale lock → take over, keep whatever progress was saved
  await admin.from("picking_sessions").update({ picker_id: user.id, picker_name: pickerName, updated_at: new Date().toISOString() }).eq("stock_id", stockId);
  return { progress: (s.progress as Progress) ?? {}, notes: (s.notes as string) ?? "", takenOver: true };
}

// Save progress + heartbeat (keeps the lock). Only the holder may save.
export async function savePickingSession(stockId: number, progress: Progress, notes: string): Promise<{ ok?: boolean; error?: string }> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { error: "unauthorized" };
  const admin = supabaseAdmin();
  const { data: s } = await admin.from("picking_sessions").select("picker_id, updated_at").eq("stock_id", stockId).maybeSingle();
  if (s && s.picker_id !== user.id && isActive(s.updated_at as string)) return { error: "ההזמנה ננעלה על ידי מלקט אחר" };
  await admin.from("picking_sessions").upsert({ stock_id: stockId, picker_id: user.id, progress, notes, updated_at: new Date().toISOString() }, { onConflict: "stock_id" });
  return { ok: true };
}

// Reset + release the session (delete).
export async function releasePickingSession(stockId: number): Promise<{ ok: boolean }> {
  await supabaseAdmin().from("picking_sessions").delete().eq("stock_id", stockId);
  return { ok: true };
}

// For the queue: which of these orders are actively held, and by whom.
export async function getActiveLocks(stockIds: number[]): Promise<Record<number, string>> {
  if (!stockIds.length) return {};
  const { data } = await supabaseAdmin().from("picking_sessions").select("stock_id, picker_name, updated_at").in("stock_id", stockIds);
  const out: Record<number, string> = {};
  for (const r of data ?? []) if (isActive(r.updated_at as string)) out[r.stock_id as number] = (r.picker_name as string) || "מלקט";
  return out;
}
