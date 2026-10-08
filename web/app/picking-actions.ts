"use server";
import { supabaseServer } from "../lib/supabase/server";
import { supabaseAdmin } from "../lib/supabase/admin";
import { managerOrAbove } from "../lib/roles";

const LOCK_MIN = 10; // a session is "held" while touched within this window
const isActive = (updatedAt: string) => Date.now() - new Date(updatedAt).getTime() < LOCK_MIN * 60000;

// Picking is a warehouse screen: only a picker or a manager/admin may touch a picking session.
async function pickingUser(): Promise<{ id: string; role: string } | null> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabaseAdmin().from("profiles").select("role").eq("id", user.id).single();
  const role = (prof?.role as string) ?? "";
  return role === "picker" || managerOrAbove(role) ? { id: user.id, role } : null;
}

type Progress = Record<string, number>;
type OpenResult = { progress?: Progress; notes?: string; takenOver?: boolean; lockedBy?: string };

// Acquire/resume the picking session for an order. Blocks if another picker holds it (active).
export async function openPickingSession(stockId: number, pickerName: string): Promise<OpenResult> {
  const u = await pickingUser();
  if (!u) return { lockedBy: "אין הרשאה" };
  const user = { id: u.id };
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
  if (isActive(s.updated_at as string)) return { lockedBy: (s.picker_name as string) || "מלקט אחר", progress: (s.progress as Progress) ?? {}, notes: (s.notes as string) ?? "" };
  // stale lock → take over, keep whatever progress was saved
  await admin.from("picking_sessions").update({ picker_id: user.id, picker_name: pickerName, updated_at: new Date().toISOString() }).eq("stock_id", stockId);
  return { progress: (s.progress as Progress) ?? {}, notes: (s.notes as string) ?? "", takenOver: true };
}

// Save progress + heartbeat (keeps the lock). Only the holder may save.
export async function savePickingSession(stockId: number, progress: Progress, notes: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await pickingUser();
  if (!user) return { error: "unauthorized" };
  const admin = supabaseAdmin();
  const { data: s } = await admin.from("picking_sessions").select("picker_id, updated_at").eq("stock_id", stockId).maybeSingle();
  if (s && s.picker_id !== user.id && isActive(s.updated_at as string)) return { error: "ההזמנה ננעלה על ידי מלקט אחר" };
  await admin.from("picking_sessions").upsert({ stock_id: stockId, picker_id: user.id, progress, notes, updated_at: new Date().toISOString() }, { onConflict: "stock_id" });
  return { ok: true };
}

// Save current progress AND free the lock, keeping the saved state, so another picker can
// immediately take over and continue ("שמור וחזור"). The holder stales their own heartbeat.
export async function saveAndReleasePickingSession(stockId: number, progress: Progress, notes: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await pickingUser();
  if (!user) return { error: "unauthorized" };
  const admin = supabaseAdmin();
  const { data: s } = await admin.from("picking_sessions").select("picker_id, updated_at").eq("stock_id", stockId).maybeSingle();
  if (s && s.picker_id !== user.id && isActive(s.updated_at as string)) return { error: "ההזמנה ננעלה על ידי מלקט אחר" };
  // updated_at = epoch → the lock is immediately free; progress/notes are kept for the next picker.
  await admin.from("picking_sessions").upsert(
    { stock_id: stockId, picker_id: user.id, progress, notes, updated_at: new Date(0).toISOString() },
    { onConflict: "stock_id" },
  );
  return { ok: true };
}

// Reset + release the session (delete). Only the holder or a manager may reset; an active lock held
// by another picker is left alone (so one picker can't wipe another's in-progress pick).
export async function releasePickingSession(stockId: number): Promise<{ ok: boolean }> {
  const u = await pickingUser();
  if (!u) return { ok: false };
  const admin = supabaseAdmin();
  const { data: s } = await admin.from("picking_sessions").select("picker_id, updated_at").eq("stock_id", stockId).maybeSingle();
  if (s && s.picker_id !== u.id && isActive(s.updated_at as string) && !managerOrAbove(u.role)) return { ok: false };
  await admin.from("picking_sessions").delete().eq("stock_id", stockId);
  return { ok: true };
}

// Manager hands a saved order to another picker: free the lock but KEEP the saved
// progress + notes, so the next picker opening it resumes exactly where this one left off.
// (Done by staling the heartbeat; the next opener takes over per openPickingSession.)
export async function handoffPickingSession(stockId: number): Promise<{ ok?: boolean; error?: string; heldBy?: string }> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { error: "unauthorized" };
  const admin = supabaseAdmin();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!managerOrAbove((prof?.role as string) ?? "")) return { error: "למנהל בלבד" };
  const { data: s } = await admin.from("picking_sessions").select("picker_name").eq("stock_id", stockId).maybeSingle();
  if (!s) return { error: "אין ליקוט פעיל להזמנה זו" };
  // Stale the lock (keep picker_id/progress/notes) → the next picker takes over the saved state.
  await admin.from("picking_sessions").update({ updated_at: new Date(0).toISOString() }).eq("stock_id", stockId);
  return { ok: true, heldBy: (s.picker_name as string) || "" };
}

// For the queue: which of these orders are actively held, and by whom.
export async function getActiveLocks(stockIds: number[]): Promise<Record<number, string>> {
  if (!stockIds.length) return {};
  if (!(await pickingUser())) return {};
  const { data } = await supabaseAdmin().from("picking_sessions").select("stock_id, picker_name, updated_at").in("stock_id", stockIds);
  const out: Record<number, string> = {};
  for (const r of data ?? []) if (isActive(r.updated_at as string)) out[r.stock_id as number] = (r.picker_name as string) || "מלקט";
  return out;
}
