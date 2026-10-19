"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bridge, type DocumentDetail, type DocLine } from "../../../lib/bridge";
import { fetchImages, fetchVariantMeta } from "../../../lib/images";
import { colorHex, textOn } from "../../../lib/colorName";
import { getColorOverrides } from "../../../lib/colorOverrides";
import { supabaseBrowser } from "../../../lib/supabase/browser";
import { managerOrAbove } from "../../../lib/roles";
import { getSharedPickingEnabled } from "../../../lib/flags";
import { openPickingSession, savePickingSession, releasePickingSession, handoffPickingSession, saveAndReleasePickingSession } from "../../picking-actions";
import { getSharedState, splitPickingSession, claimRemainingLines, saveSharedLine, markPartDone, cleanupSharedPicking, type SharedState } from "../../shared-picking-actions";

// Per-order picking (mobile/tablet first). The order is locked to one picker; picking starts
// from 0; each line can be marked full in one click or typed; progress can be saved & resumed,
// or reset & released. "סיום ליקוט" writes the marker + shortages to Hashavshevet.
export default function PickOrderPage({ params }: { params: Promise<{ stockId: string }> }) {
  const { stockId } = use(params);
  const id = Number(stockId);
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [err, setErr] = useState("");
  const [lockedBy, setLockedBy] = useState("");
  const [tookOver, setTookOver] = useState(false);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [images, setImages] = useState<Record<string, string>>({});
  const [parents, setParents] = useState<Record<string, string>>({}); // variant SKU -> main SKU
  const [colors, setColors] = useState<Record<string, string>>({});   // variant SKU -> color name
  const [colorOv, setColorOv] = useState<Record<string, string>>({}); // manager hue overrides
  useEffect(() => { getColorOverrides().then(setColorOv).catch(() => {}); }, []);
  const [picker, setPicker] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");
  const [handoff, setHandoff] = useState("");
  const [viewOnly, setViewOnly] = useState(false);              // manager viewing a pick in progress
  const [lockedProg, setLockedProg] = useState<Record<string, number>>({}); // the current picker's saved state
  // --- shared picking (split lines) — only active when the flag is on ---
  const [flagOn, setFlagOn] = useState(false);
  const [shared, setShared] = useState<SharedState | null>(null); // null = solo
  const [splitting, setSplitting] = useState(false);              // selecting my lines
  const [splitSel, setSplitSel] = useState<Set<string>>(new Set());
  const [myId, setMyId] = useState("");

  const lineKey = (l: DocLine) => String(l.lineId ?? `${l.itemkey}|${l.size ?? ""}`);
  const pickedRef = useRef(picked); pickedRef.current = picked;
  const notesRef = useRef(notes); notesRef.current = notes;

  useEffect(() => {
    (async () => {
      let pn = "", rl = "";
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (user) {
        setMyId(user.id);
        const { data: prof } = await supabaseBrowser().from("profiles").select("full_name, role").eq("id", user.id).single();
        pn = prof?.full_name ?? user.email ?? ""; rl = prof?.role ?? "";
        setPicker(pn); setRole(rl);
      }
      const flag = await getSharedPickingEnabled().catch(() => false);
      setFlagOn(flag);
      let d: DocumentDetail;
      try { d = await bridge.document(id); } catch { setErr("הגשר עדיין לא מחובר — פרטי ההזמנה ייטענו כשהגשר יעלה."); return; }
      setDoc(d);
      fetchImages((d.lines ?? []).map((l) => l.itemkey)).then(setImages).catch(() => {});
      fetchVariantMeta((d.lines ?? []).map((l) => l.itemkey)).then((meta) => {
        const p: Record<string, string> = {}, c: Record<string, string> = {};
        for (const [k, m] of Object.entries(meta)) { if (m.parent) p[k] = m.parent; if (m.color) c[k] = m.color; }
        setParents(p); setColors(c);
      }).catch(() => {});
      // Shared mode: if this order is already split, enter it (no exclusive lock) instead of solo.
      if (flag) {
        const sh = await getSharedState(id).catch(() => null);
        if (sh) {
          setShared(sh);
          const init: Record<string, number> = {};
          for (const sl of sh.lines) init[sl.lineKey] = sl.pickedQty;
          // packing lines live only in solo state; seed them from the doc for the owner's close.
          for (const l of d.lines ?? []) if (l.isPacking && init[lineKey(l)] == null) init[lineKey(l)] = l.qty;
          setPicked(init);
          return;
        }
      }
      // Acquire the picking session (lock). Managers reopening a produced pick still lock it.
      const sess = await openPickingSession(id, pn).catch(() => ({} as { lockedBy?: string }));
      if (sess.lockedBy) {
        setLockedBy(sess.lockedBy);
        if ("progress" in sess && sess.progress) setLockedProg(sess.progress);
        return;
      }
      if ("takenOver" in sess && sess.takenOver) setTookOver(true);
      const prog = ("progress" in sess ? sess.progress : undefined) ?? {};
      const init: Record<string, number> = {};
      // Fresh pick starts from 0 (or a saved draft). A REOPENED (already-picked) order starts
      // from the current line quantities, so a manager review that finishes unchanged keeps them.
      // Product lines start at 0; packing lines (M1001/M1002) start at the agent's seed, the picker adjusts.
      for (const l of d.lines ?? []) if (!l.isShipping || l.isPacking) init[lineKey(l)] = d.picked ? l.qty : (prog[lineKey(l)] ?? (l.isPacking ? l.qty : 0));
      setPicked(init);
      if ("notes" in sess && sess.notes) setNotes(sess.notes);
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = useMemo(() => {
    const all = (doc?.lines ?? []).filter((l) => !l.isShipping || l.isPacking);
    const products = all.filter((l) => !l.isPacking).sort((a, b) => (a.itemkey.localeCompare(b.itemkey) || (a.size ?? "").localeCompare(b.size ?? "")));
    const packing = all.filter((l) => l.isPacking); // M1001 / M1002 — always last, picker sets them
    return [...products, ...packing];
  }, [doc]);

  const alreadyPicked = doc?.picked === true;
  const isAdmin = managerOrAbove(role);
  const readOnly = (!!doc && alreadyPicked && !isAdmin) || viewOnly; // no editing in view-only
  const reopened = !!doc && alreadyPicked && isAdmin && !viewOnly;

  // Heartbeat: keep the lock alive + autosave progress while picking (not when just viewing).
  // In shared mode saves are per-line (saveSharedLine), so the blob autosave is off.
  useEffect(() => {
    if (!doc || lockedBy || readOnly || viewOnly || done || shared) return;
    const t = setInterval(() => { savePickingSession(id, pickedRef.current, notesRef.current).catch(() => {}); }, 120000);
    return () => clearInterval(t);
  }, [doc, lockedBy, readOnly, viewOnly, done, id, shared]);

  const shortageOf = (l: DocLine): "none" | "full" | "partial" => {
    if (l.isPacking) return "none"; // packing lines aren't a shortage — the picker sets them freely
    const p = picked[lineKey(l)] ?? 0;
    if (p >= l.qty) return "none";
    return p <= 0 ? "full" : "partial";
  };
  const shortages = lines.filter((l) => shortageOf(l) !== "none");

  // --- shared-mode ownership (solo => everything is "mine") ---
  const sharedByKey = useMemo(() => {
    const m = new Map<string, { assignedId: string | null; assignedName: string | null }>();
    if (shared) for (const sl of shared.lines) m.set(sl.lineKey, { assignedId: sl.assignedId, assignedName: sl.assignedName });
    return m;
  }, [shared]);
  const mineLine = (l: DocLine) => !shared || sharedByKey.get(lineKey(l))?.assignedId === myId;
  const assigneeName = (l: DocLine) => sharedByKey.get(lineKey(l))?.assignedName ?? null;
  const hasFreeLines = !!shared && shared.lines.some((sl) => !sl.assignedId);
  const iAmParticipant = !!shared && shared.participants.some((p) => p.pickerId === myId);
  const isOwnerOrMgr = !!shared && (shared.ownerId === myId || isAdmin);

  // Product lines cap at the ordered qty; packing lines may go above the seed.
  const setQty = (l: DocLine, v: number) => {
    if (shared && !mineLine(l)) return; // not my line — read-only
    const nv = l.isPacking ? Math.max(0, v) : Math.max(0, Math.min(l.qty, v));
    setPicked((p) => ({ ...p, [lineKey(l)]: nv }));
    if (shared) saveSharedLine(id, lineKey(l), nv).catch(() => {}); // per-line save, no clobber
  };
  const fillAll = () => setPicked(Object.fromEntries(lines.filter(mineLine).map((l) => [lineKey(l), l.qty])));

  // Refresh shared state (others' assignments + quantities); keep my own local edits.
  const reloadShared = async () => {
    const sh = await getSharedState(id).catch(() => null);
    if (!sh) return;
    setShared(sh);
    setPicked((p) => { const n = { ...p }; for (const sl of sh.lines) if (sl.assignedId !== myId) n[sl.lineKey] = sl.pickedQty; return n; });
  };
  const confirmSplit = async () => {
    const assign = lines.map((l) => ({ lineKey: lineKey(l), mine: !!l.isPacking || splitSel.has(lineKey(l)), qty: picked[lineKey(l)] ?? 0 }));
    setSaving(true); const res = await splitPickingSession(id, picker, assign); setSaving(false);
    if (res.error) { setErr(res.error); return; }
    setSplitting(false); await reloadShared();
  };
  const claimRest = async () => {
    setSaving(true); const res = await claimRemainingLines(id, picker); setSaving(false);
    if (res.error) { setErr(res.error); return; }
    await reloadShared();
  };
  const myPartDone = !!shared?.participants.find((p) => p.pickerId === myId)?.partDone;
  const togglePartDone = async () => { await markPartDone(id, !myPartDone, notes.trim() || undefined).catch(() => {}); await reloadShared(); };

  const saveAndBack = async () => {
    // Save the current state AND release the lock, so another picker can continue from here.
    setSaving(true); await saveAndReleasePickingSession(id, picked, notes).catch(() => {}); setSaving(false);
    router.push("/picking");
  };
  const resetRelease = async () => {
    if (!window.confirm("לאפס את הליקוט ולשחרר את ההזמנה למלקטים אחרים?")) return;
    setSaving(true); await releasePickingSession(id).catch(() => {}); setSaving(false);
    router.push("/picking");
  };

  const confirmFinish = async () => {
    if (!doc) return;
    setSaving(true);
    // Shared pick → "לוקט ע״י A + B"; the picked map already holds every participant's per-line qty.
    const finishPicker = shared ? (shared.participants.map((p) => p.pickerName).filter(Boolean).join(" + ") || picker) : picker;
    const shortageRows = shortages.map((l) => ({ itemkey: l.itemkey, size: l.size, name: l.name, ordered: l.qty, picked: picked[lineKey(l)] ?? 0, kind: shortageOf(l) }));
    try {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      await supabaseBrowser().from("picking_logs").insert({
        stock_id: doc.stockId, doc_number: doc.docNumber, account_key: doc.accountKey,
        picker: finishPicker, notes: notes.trim() || null,
        lines: lines.map((l) => ({ itemkey: l.itemkey, size: l.size, ordered: l.qty, picked: picked[lineKey(l)] ?? 0 })),
        shortages: shortageRows, created_by: user?.id ?? null,
      });
    } catch { /* log best-effort */ }
    let hashavshevetOk = false, note = "";
    try {
      await bridge.finishPicking(doc.stockId, {
        picker: finishPicker, notes: notes.trim() || undefined,
        lines: lines.map((l) => ({ itemkey: l.itemkey, size: l.size, pickedQty: picked[lineKey(l)] ?? 0 })),
      });
      hashavshevetOk = true;
      fetch("/api/push/event", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "pick_finished", context: { customerName: doc.customerName, ref: doc.docNumber ? "#" + doc.docNumber : String(doc.stockId) } }) }).catch(() => {});
      if (doc.agent != null) fetch("/api/push/event", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "agent_order_picked", agentId: doc.agent, context: { customerName: doc.customerName } }) }).catch(() => {});
    } catch (e) {
      const m = (e as Error).message || "";
      note = /NO_PERMISSION|501/.test(m) ? "חסרות הרשאות בשרת (GRANT ל-magnumapp) — יוחל לאחר ההרשאה."
        : /WRITE_DISABLED|403/.test(m) ? "כתיבה לחשבשבת מושבתת כרגע (מצב בדיקה / ORDER_WRITE_ENABLED)."
        : /NOT_OPEN|409/.test(m) ? "המסמך אינו פתוח (ייתכן שכבר הופק)."
        : /TREE_UNSUPPORTED/.test(m) ? "הזמנת מטריצה מחשבשבת — יש לסיים אותה בחשבשבת."
        : /ITEM_NOT_IN_ORDER|422/.test(m) ? "פריט שאינו בהזמנה."
        : "הגשר לא זמין כרגע.";
    }
    // Release the lock (solo) or drop the shared rows (split).
    await (shared ? cleanupSharedPicking(id) : releasePickingSession(id)).catch(() => {});
    setSaving(false); setConfirm(false);
    setDone(hashavshevetOk
      ? `הליקוט הושלם ונכתב לחשבשבת ✓ · לוקט ע״י ${finishPicker}`
      : `התיעוד נשמר באפליקציה ✓ · לוקט ע״י ${finishPicker}. (${note})`);
    // Every exit from picking returns to the queue; a short pause lets the picker read the result.
    setTimeout(() => router.push("/picking"), hashavshevetOk ? 1800 : 3500);
  };

  if (err) return <p className="chip chip-warn">{err} <a href="/picking">← לתור</a></p>;
  if (!doc) return <p>טוען…</p>;
  if (lockedBy) return (
    <>
      <p><a href="/picking" style={{ color: "var(--brand)" }}>← תור הליקוט</a></p>
      <p className="chip chip-warn" style={{ display: "block", padding: 14, fontSize: 15 }}>
        ההזמנה בליקוט כעת אצל <b>{lockedBy}</b> — נעולה למלקטים אחרים.{isAdmin ? "" : " נסה שוב מאוחר יותר."}
      </p>
      {isAdmin && !handoff && (
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" disabled={saving}
            onClick={() => {
              // View the order read-only, with the current picker's saved progress, without taking the lock.
              const init: Record<string, number> = {};
              for (const l of (doc?.lines ?? [])) if (!l.isShipping) init[lineKey(l)] = lockedProg[lineKey(l)] ?? 0;
              setPicked(init); setViewOnly(true); setLockedBy("");
            }}>צפה בהזמנה (ללא נעילה)</button>
          <button className="btn btn-primary" disabled={saving}
            onClick={async () => {
              setSaving(true);
              const r = await handoffPickingSession(id).catch(() => ({ error: "שגיאה" }));
              setSaving(false);
              if ("ok" in r && r.ok) setHandoff(`הנעילה שוחררה${lockedBy ? ` מ${lockedBy}` : ""} — מלקט אחר יכול להיכנס כעת ולהמשיך מהמצב השמור.`);
              else window.alert(("error" in r && r.error) || "לא ניתן לשחרר");
            }}>שחרר למלקט אחר (מנהל)</button>
          <span style={{ fontSize: 13, color: "var(--ink-muted)", alignSelf: "center" }}>ההתקדמות שנשמרה תישמר — המלקט הבא ימשיך מאותו מצב.</span>
        </div>
      )}
      {handoff && (
        <p className="chip chip-ok" style={{ display: "block", padding: 12, marginTop: 12 }}>
          {handoff}{" "}
          <a href="/picking" style={{ color: "inherit", textDecoration: "underline" }}>לתור</a>
          {" · "}
          <a href={`/picking/${id}`} onClick={() => setTimeout(() => window.location.reload(), 0)} style={{ color: "inherit", textDecoration: "underline" }}>היכנס אתה והמשך</a>
        </p>
      )}
    </>
  );

  return (
    <>
      <p><a href="/picking" style={{ color: "var(--brand)" }}>← תור הליקוט</a></p>
      <h1 style={{ marginBottom: 4 }}>ליקוט {doc.docNumber ? `#${doc.docNumber}` : `(זמני ${doc.stockId})`}</h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
        <b>{doc.customerName}</b> ({doc.accountKey}){doc.customer?.address ? ` · ${doc.customer.address}` : ""}{picker ? ` · מלקט: ${picker}` : ""}
      </p>

      {/* Agent/order note from the visible "הערות" field (incl. orders typed directly in Hashavshevet). */}
      {doc.orderNote?.trim() && (
        <p className="chip chip-warn" style={{ display: "block", padding: 12, whiteSpace: "pre-wrap", fontWeight: 600 }}>
          📝 הערות הזמנה: {doc.orderNote.trim()}
        </p>
      )}

      {tookOver && <p className="chip chip-info" style={{ display: "block", padding: 10 }}>הליקוט נלקח מהמלקט הקודם (לא היה פעיל) — המשך מהמצב השמור.</p>}
      {viewOnly && <p className="chip chip-info" style={{ display: "block", padding: 12 }}>צפייה בלבד — ההזמנה בליקוט כעת אצל מלקט אחר. מוצג המצב השמור; אין עריכה.</p>}
      {readOnly && !viewOnly && <p className="chip chip-warn" style={{ display: "block", padding: 12 }}>הזמנה זו כבר לוקטה{doc.picker ? ` ע״י ${doc.picker}` : ""}. פתיחה מחדש לעדכון מתאפשרת למנהל בלבד.</p>}
      {reopened && !done && <p className="chip chip-info" style={{ display: "block", padding: 12 }}>הזמנה זו כבר לוקטה{doc.picker ? ` ע״י ${doc.picker}` : ""} ונפתחה מחדש. שינוי יעדכן את הליקוט בחשבשבת. (שורה שנמחקה בעבר לא חוזרת.)</p>}
      {done && <p className="chip chip-ok" style={{ display: "block", padding: 12 }}>{done} <a href="/picking" style={{ color: "inherit", textDecoration: "underline" }}>לתור</a></p>}

      {/* --- shared picking (split lines) controls --- */}
      {flagOn && !done && !shared && !readOnly && !viewOnly && !lockedBy && !splitting && lines.filter((l) => !l.isPacking).length > 1 && (
        <button onClick={() => { setSplitting(true); setSplitSel(new Set()); }} className="btn" style={{ margin: "4px 0 8px" }}>👥 פצל ליקוט (עבודה משותפת)</button>
      )}
      {splitting && (
        <div className="card card-pad" style={{ margin: "4px 0 10px", display: "grid", gap: 8, borderInlineStart: "4px solid var(--brand)" }}>
          <b>בחר את השורות שלך — השאר ישוחררו למלקט נוסף</b>
          <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>חבילות/משטחים נשארים אצלך (הפותח), ותסגור אותם בסיום.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={confirmSplit} disabled={saving || splitSel.size === 0} className="btn btn-primary">אשר פיצול ({splitSel.size})</button>
            <button onClick={() => setSplitting(false)} disabled={saving} className="btn">ביטול</button>
          </div>
        </div>
      )}
      {shared && !done && (
        <div className="card card-pad" style={{ margin: "4px 0 10px", display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>👥 ליקוט חלקי{shared.ownerName ? ` · פתח: ${shared.ownerName}` : ""}</div>
          <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>
            {shared.participants.map((p) => `${p.pickerName}${p.partDone ? " ✓ סיים" : ""}`).join(" · ") || "—"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {hasFreeLines && shared.ownerId !== myId && <button onClick={claimRest} disabled={saving} className="btn btn-primary btn-sm">קח את יתר השורות</button>}
            {iAmParticipant && !isOwnerOrMgr && <button onClick={togglePartDone} disabled={saving} className={myPartDone ? "btn btn-sm" : "btn btn-primary btn-sm"}>{myPartDone ? "בטל סימון סיום" : "סיימתי את החלק שלי"}</button>}
          </div>
        </div>
      )}

      {!done && !readOnly && !splitting && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 0 8px" }}>
          <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>{lines.length} שורות · {shortages.length ? `${shortages.length} עם חוסר` : "הכל מלא"}</span>
          <button onClick={fillAll} className="btn btn-sm">סמן הכל מלא{shared ? " (שלי)" : ""} ✓</button>
        </div>
      )}

      {/* Responsive card list — no horizontal scroll on mobile/tablet. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10 }}>
        {lines.map((l) => {
          const sh = shortageOf(l);
          const q = picked[lineKey(l)] ?? 0;
          const isPacking = !!l.isPacking;
          const overStock = !isPacking && (l.onHand ?? Infinity) < l.qty;
          const packStep = (l.packSize ?? 0) > 1 && !!l.packLabel; // step by a whole pack when we know the pack
          const step = packStep ? (l.packSize as number) : 1;
          const border = isPacking ? "var(--brand)" : sh === "none" ? "var(--ok)" : sh === "full" ? "var(--danger)" : "var(--warn)";
          // Warehouse picking screen — enlarge image / SKU / quantity for everyone.
          const isPicker = true;
          const imgSz = 96;
          // Shared: a line not assigned to me is read-only; in split-select it's a checkbox.
          const lineRO = readOnly || (!!shared && !mineLine(l));
          const otherName = shared && !mineLine(l) ? assigneeName(l) : null;
          const selectable = splitting && !isPacking;
          const sel = splitSel.has(lineKey(l));
          return (
            <div key={lineKey(l)} onClick={selectable ? () => setSplitSel((s) => { const n = new Set(s); if (n.has(lineKey(l))) n.delete(lineKey(l)); else n.add(lineKey(l)); return n; }) : undefined}
              className="card card-pad" style={{ display: "grid", gap: 8, borderInlineStart: `4px solid ${selectable && sel ? "var(--brand-strong)" : border}`, cursor: selectable ? "pointer" : undefined, outline: selectable && sel ? "2px solid var(--brand)" : undefined }}>
              {selectable && <div style={{ fontWeight: 700, color: sel ? "var(--brand-strong)" : "var(--ink-muted)" }}>{sel ? "☑ השורה שלי" : "☐ בחר כשלי"}</div>}
              {otherName && <div className="chip chip-info" style={{ width: "fit-content" }}>אצל {otherName}</div>}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {isPacking
                  ? <div style={{ width: imgSz, height: imgSz, borderRadius: 8, background: "var(--brand-soft)", display: "grid", placeItems: "center", fontSize: isPicker ? 48 : 26, flex: "0 0 auto" }}>📦</div>
                  : images[l.itemkey]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={images[l.itemkey]} alt="" style={{ width: imgSz, height: imgSz, objectFit: "contain", borderRadius: 8, background: "var(--surface-muted)", flex: "0 0 auto" }} />
                    : <div style={{ width: imgSz, height: imgSz, borderRadius: 8, background: "var(--surface-muted)", flex: "0 0 auto" }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  {isPacking
                    ? <div style={{ fontWeight: 700, fontSize: isPicker ? 22 : undefined }}>{l.packingLabel ?? "אריזה"}</div>
                    : <>
                        {/* Pickers see only the MAIN (parent) SKU — size/color are in the name below. */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 24 }}>{parents[l.itemkey] ?? l.itemkey}</span>
                          {l.size ? <span className="chip chip-info" style={{ fontSize: 15, padding: "3px 12px" }}>מידה {l.size}</span> : null}
                          {colors[l.itemkey] && (() => {
                            const hex = colorHex(colors[l.itemkey], colorOv);
                            return hex
                              ? <span style={{ fontWeight: 700, fontSize: 14, background: hex, color: textOn(hex), padding: "2px 12px", borderRadius: 999, border: "1px solid var(--border)" }}>{colors[l.itemkey]}</span>
                              : <span className="chip chip-info">{colors[l.itemkey]}</span>;
                          })()}
                        </div>
                        <div style={{ fontSize: 16, color: "var(--ink-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
                      </>}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: isPicker ? 19 : 14 }}>{isPacking
                  ? "כמות למשלוח (קובע המלקט):"
                  : <>הוזמן: {l.packs != null && l.packLabel
                      ? <><b>{l.packs} {l.packLabel}</b> <span style={{ color: "var(--ink-muted)" }}>({l.units ?? l.qty} יח׳)</span></>
                      : <><b>{l.units ?? l.qty}</b>{l.unit ? ` ${l.unit}` : " יח׳"}</>}</>}</span>
                {/* Stepper jumps by one pack (packSize units); the number stays editable for a manual fix. + on the right (RTL). */}
                <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setQty(l, q + step)} disabled={lineRO || splitting} className="btn btn-primary btn-sm" style={{ padding: isPicker ? "11px 17px" : "8px 13px", fontSize: isPicker ? 24 : 18 }} title={packStep ? `+${l.packLabel}` : "+1"}>+</button>
                  <input type="number" inputMode="numeric" min={0} max={isPacking ? undefined : l.qty} value={q} disabled={lineRO || splitting}
                    onChange={(e) => setQty(l, Number(e.target.value))}
                    style={{ width: isPicker ? 96 : 72, padding: isPicker ? "10px" : "8px", fontSize: isPicker ? 26 : 16, fontWeight: isPicker ? 700 : undefined, textAlign: "center", borderRadius: 8, border: "1px solid var(--border)" }} />
                  <button onClick={() => setQty(l, q - step)} disabled={lineRO || splitting || q <= 0} className="btn btn-sm" style={{ padding: isPicker ? "11px 17px" : "8px 13px", fontSize: isPicker ? 24 : 18 }} title={packStep ? `−${l.packLabel}` : "−1"}>−</button>
                  {/* Fine ±1-unit control — mobile/tablet only (desktop has the native number-spinner), stacked +1 over −1. */}
                  {packStep && (
                    <span className="pick-fine">
                      <button onClick={() => setQty(l, q + 1)} disabled={lineRO || splitting} className="btn btn-sm" style={{ padding: "6px 9px", fontSize: 13 }} title="יחידה אחת">+1</button>
                      <button onClick={() => setQty(l, q - 1)} disabled={lineRO || splitting || q <= 0} className="btn btn-sm" style={{ padding: "6px 9px", fontSize: 13 }} title="יחידה אחת">−1</button>
                    </span>
                  )}
                  {!isPacking && <button onClick={() => setQty(l, l.qty)} disabled={lineRO || splitting} className="btn btn-sm" style={{ padding: "8px 12px" }}>מלא</button>}
                </span>
              </div>
              {packStep && (
                <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                  קפיצה: {l.packLabel} ({step} יח׳) · לוקטו: <b>{Math.round((q / step) * 100) / 100}</b> {l.packLabel}
                </div>
              )}

              {!isPacking && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {sh === "none" && <span className="chip chip-ok">✓ לוקט במלואו</span>}
                  {sh === "partial" && <span className="chip chip-warn">חוסר: {l.qty - q}</span>}
                  {sh === "full" && <span className="chip chip-danger">טרם לוקט</span>}
                  {overStock && <span className="chip chip-danger" style={{ fontWeight: 700 }}>⚠ הוזמן יותר מהמלאי{l.onHand != null ? ` (מלאי ${l.onHand})` : ""}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!done && !readOnly && !splitting && (
        <div style={{ position: "sticky", bottom: 0, background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "12px 0", marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", zIndex: 10 }}>
          {/* Shared: only the owner/manager closes the order; a participant just leaves (their lines are saved). */}
          {(!shared || isOwnerOrMgr) && <button onClick={() => setConfirm(true)} className="btn btn-primary" style={{ padding: "12px 20px", fontSize: 16 }}>{reopened ? "עדכון ליקוט" : "סיום ליקוט"}</button>}
          <button onClick={shared ? () => router.push("/picking") : saveAndBack} disabled={saving} className="btn" style={{ padding: "12px 18px" }}>{shared ? "חזרה לתור" : "שמור וחזור"}</button>
          {!shared && <button onClick={resetRelease} disabled={saving} className="btn" style={{ padding: "12px 18px", color: "var(--danger)" }}>אפס ושחרר</button>}
        </div>
      )}

      {/* confirmation dialog */}
      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }} onClick={() => !saving && setConfirm(false)}>
          <div className="card card-pad" style={{ maxWidth: 480, width: "100%", maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{reopened ? "אישור עדכון ליקוט" : "אישור סיום ליקוט"}</h2>
            <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>מלקט: <b>{(shared ? shared.participants.map((p) => p.pickerName).filter(Boolean).join(" + ") : picker) || "—"}</b></p>
            {shared && shared.participants.some((p) => !p.partDone) && (
              <p className="chip chip-warn" style={{ display: "block", padding: 10 }}>⚠ לא כל המלקטים סימנו שסיימו את חלקם ({shared.participants.filter((p) => p.partDone).map((p) => p.pickerName).join(", ") || "אף אחד"} סיימו). סגירה תנעל את ההזמנה עם המצב הנוכחי — שורות שלא לוקטו ייחשבו חוסר.</p>
            )}
            {shortages.length === 0
              ? <p className="chip chip-ok">אין חוסרים — כל השורות סופקו במלואן.</p>
              : (
                <>
                  <p style={{ fontWeight: 700, marginBottom: 6 }}>חוסרים לאישור ({shortages.length}):</p>
                  <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 14 }}>
                    {shortages.map((l) => (
                      <li key={lineKey(l)} style={{ marginBottom: 4 }}>
                        <b>{l.itemkey}</b>{l.size ? ` (מידה ${l.size})` : ""} — {shortageOf(l) === "full"
                          ? <span style={{ color: "var(--danger)" }}>לא לוקט (השורה תימחק)</span>
                          : <span style={{ color: "var(--warn)" }}>לוקטו {picked[lineKey(l)]} מתוך {l.qty} (השורה תעודכן)</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            <label style={{ display: "block", marginTop: 14, fontSize: 13, fontWeight: 600 }}>הערות מלקט (יוצגו באפליקציה וירשמו בחשבשבת)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input" style={{ marginTop: 4, resize: "vertical" }} placeholder="לא חובה…" />
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirm(false)} disabled={saving} className="btn">ביטול</button>
              <button onClick={confirmFinish} disabled={saving} className="btn btn-primary">{saving ? "שומר…" : reopened ? "אשר ועדכן ליקוט" : "אשר וסיים ליקוט"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
