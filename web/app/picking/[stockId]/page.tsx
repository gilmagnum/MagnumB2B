"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bridge, type DocumentDetail, type DocLine } from "../../../lib/bridge";
import { fetchImages } from "../../../lib/images";
import { supabaseBrowser } from "../../../lib/supabase/browser";
import { managerOrAbove } from "../../../lib/roles";
import { openPickingSession, savePickingSession, releasePickingSession, handoffPickingSession, saveAndReleasePickingSession } from "../../picking-actions";

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
  const [picker, setPicker] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");
  const [handoff, setHandoff] = useState("");
  const [viewOnly, setViewOnly] = useState(false);              // manager viewing a pick in progress
  const [lockedProg, setLockedProg] = useState<Record<string, number>>({}); // the current picker's saved state

  const lineKey = (l: DocLine) => String(l.lineId ?? `${l.itemkey}|${l.size ?? ""}`);
  const pickedRef = useRef(picked); pickedRef.current = picked;
  const notesRef = useRef(notes); notesRef.current = notes;

  useEffect(() => {
    (async () => {
      let pn = "", rl = "";
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (user) {
        const { data: prof } = await supabaseBrowser().from("profiles").select("full_name, role").eq("id", user.id).single();
        pn = prof?.full_name ?? user.email ?? ""; rl = prof?.role ?? "";
        setPicker(pn); setRole(rl);
      }
      let d: DocumentDetail;
      try { d = await bridge.document(id); } catch { setErr("הגשר עדיין לא מחובר — פרטי ההזמנה ייטענו כשהגשר יעלה."); return; }
      setDoc(d);
      fetchImages((d.lines ?? []).map((l) => l.itemkey)).then(setImages).catch(() => {});
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
  useEffect(() => {
    if (!doc || lockedBy || readOnly || viewOnly || done) return;
    const t = setInterval(() => { savePickingSession(id, pickedRef.current, notesRef.current).catch(() => {}); }, 120000);
    return () => clearInterval(t);
  }, [doc, lockedBy, readOnly, viewOnly, done, id]);

  const shortageOf = (l: DocLine): "none" | "full" | "partial" => {
    if (l.isPacking) return "none"; // packing lines aren't a shortage — the picker sets them freely
    const p = picked[lineKey(l)] ?? 0;
    if (p >= l.qty) return "none";
    return p <= 0 ? "full" : "partial";
  };
  const shortages = lines.filter((l) => shortageOf(l) !== "none");
  // Product lines cap at the ordered qty; packing lines may go above the seed.
  const setQty = (l: DocLine, v: number) => setPicked((p) => ({ ...p, [lineKey(l)]: l.isPacking ? Math.max(0, v) : Math.max(0, Math.min(l.qty, v)) }));
  const fillAll = () => setPicked(Object.fromEntries(lines.map((l) => [lineKey(l), l.qty])));

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
    const shortageRows = shortages.map((l) => ({ itemkey: l.itemkey, size: l.size, name: l.name, ordered: l.qty, picked: picked[lineKey(l)] ?? 0, kind: shortageOf(l) }));
    try {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      await supabaseBrowser().from("picking_logs").insert({
        stock_id: doc.stockId, doc_number: doc.docNumber, account_key: doc.accountKey,
        picker, notes: notes.trim() || null,
        lines: lines.map((l) => ({ itemkey: l.itemkey, size: l.size, ordered: l.qty, picked: picked[lineKey(l)] ?? 0 })),
        shortages: shortageRows, created_by: user?.id ?? null,
      });
    } catch { /* log best-effort */ }
    let hashavshevetOk = false, note = "";
    try {
      await bridge.finishPicking(doc.stockId, {
        picker, notes: notes.trim() || undefined,
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
    await releasePickingSession(id).catch(() => {}); // picking done → release the lock
    setSaving(false); setConfirm(false);
    setDone(hashavshevetOk
      ? `הליקוט הושלם ונכתב לחשבשבת ✓ · לוקט ע״י ${picker}`
      : `התיעוד נשמר באפליקציה ✓ · לוקט ע״י ${picker}. (${note})`);
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

      {tookOver && <p className="chip chip-info" style={{ display: "block", padding: 10 }}>הליקוט נלקח מהמלקט הקודם (לא היה פעיל) — המשך מהמצב השמור.</p>}
      {viewOnly && <p className="chip chip-info" style={{ display: "block", padding: 12 }}>צפייה בלבד — ההזמנה בליקוט כעת אצל מלקט אחר. מוצג המצב השמור; אין עריכה.</p>}
      {readOnly && !viewOnly && <p className="chip chip-warn" style={{ display: "block", padding: 12 }}>הזמנה זו כבר לוקטה{doc.picker ? ` ע״י ${doc.picker}` : ""}. פתיחה מחדש לעדכון מתאפשרת למנהל בלבד.</p>}
      {reopened && !done && <p className="chip chip-info" style={{ display: "block", padding: 12 }}>הזמנה זו כבר לוקטה{doc.picker ? ` ע״י ${doc.picker}` : ""} ונפתחה מחדש. שינוי יעדכן את הליקוט בחשבשבת. (שורה שנמחקה בעבר לא חוזרת.)</p>}
      {done && <p className="chip chip-ok" style={{ display: "block", padding: 12 }}>{done} <a href="/picking" style={{ color: "inherit", textDecoration: "underline" }}>לתור</a></p>}

      {!done && !readOnly && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 0 8px" }}>
          <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>{lines.length} שורות · {shortages.length ? `${shortages.length} עם חוסר` : "הכל מלא"}</span>
          <button onClick={fillAll} className="btn btn-sm">סמן הכל מלא ✓</button>
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
          return (
            <div key={lineKey(l)} className="card card-pad" style={{ display: "grid", gap: 8, borderInlineStart: `4px solid ${border}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {isPacking
                  ? <div style={{ width: 52, height: 52, borderRadius: 8, background: "var(--brand-soft)", display: "grid", placeItems: "center", fontSize: 26, flex: "0 0 auto" }}>📦</div>
                  : images[l.itemkey]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={images[l.itemkey]} alt="" style={{ width: 52, height: 52, objectFit: "contain", borderRadius: 8, background: "var(--surface-muted)", flex: "0 0 auto" }} />
                    : <div style={{ width: 52, height: 52, borderRadius: 8, background: "var(--surface-muted)", flex: "0 0 auto" }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  {isPacking
                    ? <div style={{ fontWeight: 700 }}>{l.packingLabel ?? "אריזה"}</div>
                    : <>
                        <div style={{ fontWeight: 700 }}>{l.itemkey}{l.size ? <span className="chip chip-info" style={{ marginInlineStart: 6 }}>מידה {l.size}</span> : null}</div>
                        <div style={{ fontSize: 13, color: "var(--ink-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
                      </>}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14 }}>{isPacking
                  ? "כמות למשלוח (קובע המלקט):"
                  : <>הוזמן: {l.packs != null && l.packLabel
                      ? <><b>{l.packs} {l.packLabel}</b> <span style={{ color: "var(--ink-muted)" }}>({l.units ?? l.qty} יח׳)</span></>
                      : <><b>{l.units ?? l.qty}</b>{l.unit ? ` ${l.unit}` : " יח׳"}</>}</>}</span>
                {/* Stepper jumps by one pack (packSize units); the number stays editable for a manual fix. + on the right (RTL). */}
                <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setQty(l, q + step)} disabled={readOnly} className="btn btn-primary btn-sm" style={{ padding: "8px 13px", fontSize: 18 }} title={packStep ? `+${l.packLabel}` : "+1"}>+</button>
                  <input type="number" inputMode="numeric" min={0} max={isPacking ? undefined : l.qty} value={q} disabled={readOnly}
                    onChange={(e) => setQty(l, Number(e.target.value))}
                    style={{ width: 72, padding: "8px", fontSize: 16, textAlign: "center", borderRadius: 8, border: "1px solid var(--border)" }} />
                  <button onClick={() => setQty(l, q - step)} disabled={readOnly || q <= 0} className="btn btn-sm" style={{ padding: "8px 13px", fontSize: 18 }} title={packStep ? `−${l.packLabel}` : "−1"}>−</button>
                  {!isPacking && <button onClick={() => setQty(l, l.qty)} disabled={readOnly} className="btn btn-sm" style={{ padding: "8px 12px" }}>מלא</button>}
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

      {!done && !readOnly && (
        <div style={{ position: "sticky", bottom: 0, background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "12px 0", marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", zIndex: 10 }}>
          <button onClick={() => setConfirm(true)} className="btn btn-primary" style={{ padding: "12px 20px", fontSize: 16 }}>{reopened ? "עדכון ליקוט" : "סיום ליקוט"}</button>
          <button onClick={saveAndBack} disabled={saving} className="btn" style={{ padding: "12px 18px" }}>שמור וחזור</button>
          <button onClick={resetRelease} disabled={saving} className="btn" style={{ padding: "12px 18px", color: "var(--danger)" }}>אפס ושחרר</button>
        </div>
      )}

      {/* confirmation dialog */}
      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }} onClick={() => !saving && setConfirm(false)}>
          <div className="card card-pad" style={{ maxWidth: 480, width: "100%", maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{reopened ? "אישור עדכון ליקוט" : "אישור סיום ליקוט"}</h2>
            <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>מלקט: <b>{picker || "—"}</b></p>
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
