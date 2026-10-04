"use client";
import { use, useEffect, useMemo, useState } from "react";
import { bridge, type DocumentDetail, type DocLine } from "../../../lib/bridge";
import { fetchImages } from "../../../lib/images";
import { supabaseBrowser } from "../../../lib/supabase/browser";
import { managerOrAbove } from "../../../lib/roles";

// Per-order picking. Picker enters picked qty; shortages are flagged (full vs partial).
// "סיום ליקוט" opens a confirmation of the shortages + a notes field, saves app
// documentation, and (when the bridge endpoint is live) marks לוקט ע"י + applies shortages.
export default function PickOrderPage({ params }: { params: Promise<{ stockId: string }> }) {
  const { stockId } = use(params);
  const id = Number(stockId);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [images, setImages] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (user) {
        const { data: prof } = await supabaseBrowser().from("profiles").select("full_name, role").eq("id", user.id).single();
        setPicker(prof?.full_name ?? user.email ?? "");
        setRole(prof?.role ?? "");
      }
    })();
    bridge.document(id)
      .then((d) => {
        setDoc(d);
        const init: Record<string, number> = {};
        for (const l of d.lines ?? []) if (!l.isShipping) init[l.itemkey] = l.qty;
        setPicked(init);
        fetchImages((d.lines ?? []).map((l) => l.itemkey)).then(setImages).catch(() => {});
      })
      .catch(() => setErr("הגשר עדיין לא מחובר — פרטי ההזמנה ייטענו כשהגשר יעלה."));
  }, [id]);

  const lines = useMemo(
    () => (doc?.lines ?? []).filter((l) => !l.isShipping).sort((a, b) => a.itemkey.localeCompare(b.itemkey)),
    [doc],
  );

  const shortageOf = (l: DocLine): "none" | "full" | "partial" => {
    const p = picked[l.itemkey] ?? 0;
    if (p >= l.qty) return "none";
    return p <= 0 ? "full" : "partial";
  };
  const shortages = lines.filter((l) => shortageOf(l) !== "none");

  const confirmFinish = async () => {
    if (!doc) return;
    setSaving(true);
    const shortageRows = shortages.map((l) => ({ itemkey: l.itemkey, name: l.name, ordered: l.qty, picked: picked[l.itemkey] ?? 0, kind: shortageOf(l) }));
    // 1) App documentation — always saved.
    let hashavshevetOk = false;
    try {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      await supabaseBrowser().from("picking_logs").insert({
        stock_id: doc.stockId, doc_number: doc.docNumber, account_key: doc.accountKey,
        picker, notes: notes.trim() || null,
        lines: lines.map((l) => ({ itemkey: l.itemkey, ordered: l.qty, picked: picked[l.itemkey] ?? 0 })),
        shortages: shortageRows, created_by: user?.id ?? null,
      });
    } catch { /* log best-effort */ }
    // 2) Hashavshevet write (marker + shortages + notes).
    let note = "";
    try {
      await bridge.finishPicking(doc.stockId, {
        picker, notes: notes.trim() || undefined,
        lines: lines.map((l) => ({ itemkey: l.itemkey, pickedQty: picked[l.itemkey] ?? 0 })),
      });
      hashavshevetOk = true;
      // Fire push events: pick finished (admins) + the customer's agent — best-effort.
      fetch("/api/push/event", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "pick_finished", body: `${doc.customerName} · ${doc.docNumber ? "#" + doc.docNumber : doc.stockId}`, url: "/documents" }) }).catch(() => {});
      if (doc.agent != null) fetch("/api/push/event", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "agent_order_picked", agentId: doc.agent, body: `הזמנת ${doc.customerName} לוקטה`, url: "/documents" }) }).catch(() => {});
    } catch (e) {
      const m = (e as Error).message || "";
      note = /NO_PERMISSION|501/.test(m) ? "חסרות הרשאות בשרת (GRANT ל-magnumapp) — יוחל לאחר ההרשאה."
        : /WRITE_DISABLED|403/.test(m) ? "כתיבה לחשבשבת מושבתת כרגע (מצב בדיקה / ORDER_WRITE_ENABLED)."
        : /NOT_OPEN|409/.test(m) ? "המסמך אינו פתוח (ייתכן שכבר הופק)."
        : /TREE_UNSUPPORTED/.test(m) ? "הזמנת מטריצה מחשבשבת — יש לסיים אותה בחשבשבת."
        : /ITEM_NOT_IN_ORDER|422/.test(m) ? "פריט שאינו בהזמנה."
        : "הגשר לא זמין כרגע.";
    }
    setSaving(false); setConfirm(false);
    setDone(hashavshevetOk
      ? `הליקוט הושלם ונכתב לחשבשבת ✓ · לוקט ע״י ${picker}`
      : `התיעוד נשמר באפליקציה ✓ · לוקט ע״י ${picker}. (${note})`);
  };

  if (err) return <p className="chip chip-warn">{err} <a href="/picking">← לתור</a></p>;
  if (!doc) return <p>טוען…</p>;

  const alreadyPicked = doc.picked === true;
  const isAdmin = managerOrAbove(role);
  const readOnly = alreadyPicked && !isAdmin; // picker can't touch a closed pick
  const reopened = alreadyPicked && isAdmin;  // admin re-opening a closed pick

  return (
    <>
      <p><a href="/picking" style={{ color: "var(--brand)" }}>← תור הליקוט</a></p>
      <h1>ליקוט: {doc.docTypeName} {doc.docNumber ? `#${doc.docNumber}` : `(זמני ${doc.stockId})`}</h1>
      <p style={{ color: "var(--ink-muted)" }}>לקוח: <b>{doc.customerName}</b> ({doc.accountKey}){doc.customer?.address ? ` · ${doc.customer.address}` : ""}{picker ? ` · מלקט: ${picker}` : ""}</p>

      {readOnly && (
        <p className="chip chip-warn" style={{ display: "block", padding: 12 }}>
          הזמנה זו כבר לוקטה{doc.picker ? ` ע״י ${doc.picker}` : ""}. פתיחה מחדש לעדכון מתאפשרת למנהל בלבד.
        </p>
      )}
      {reopened && !done && (
        <p className="chip chip-info" style={{ display: "block", padding: 12 }}>
          הזמנה זו כבר לוקטה{doc.picker ? ` ע״י ${doc.picker}` : ""} ונפתחה מחדש לעדכון. שינוי יעדכן את הליקוט בחשבשבת.
          <br />שים לב: שורה שנמחקה בליקוט קודם (חוסר מלא) לא חוזרת — יש להוסיף אותה מחדש בחשבשבת.
        </p>
      )}

      {done && <p className="chip chip-ok" style={{ display: "block", padding: 12 }}>{done} <a href="/picking" style={{ color: "inherit", textDecoration: "underline" }}>לתור</a></p>}

      <div className="table-wrap">
        <table className="data-table" style={{ minWidth: 640 }}>
          <thead>
            <tr><th style={{ width: 54 }}>תמונה</th><th>מק״ט</th><th>תיאור</th><th>מלאי</th><th>הוזמן</th><th>לוקט</th><th>סטטוס</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const sh = shortageOf(l);
              return (
                <tr key={l.itemkey} style={{ background: sh === "full" ? "var(--danger-soft)" : sh === "partial" ? "var(--warn-soft)" : undefined }}>
                  <td style={{ padding: 6 }}>{images[l.itemkey] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={images[l.itemkey]} alt="" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6, background: "var(--surface-muted)" }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 6, background: "var(--surface-muted)" }} />
                  )}</td>
                  <td style={{ fontWeight: 700 }}>{l.itemkey}</td>
                  <td>{l.name}</td>
                  <td style={{ color: (l.onHand ?? 0) < l.qty ? "var(--danger)" : "var(--ok)" }}>{l.onHand ?? "—"}</td>
                  <td>{l.qty}{l.unit ? ` ${l.unit}` : ""}</td>
                  <td>
                    <input type="number" min={0} max={l.qty} value={picked[l.itemkey] ?? 0} disabled={readOnly}
                      onChange={(e) => setPicked({ ...picked, [l.itemkey]: Math.max(0, Math.min(l.qty, Number(e.target.value))) })}
                      style={{ width: 64 }} />
                  </td>
                  <td>
                    {sh === "none" && <span className="chip chip-ok">✓ מלא</span>}
                    {sh === "partial" && <span className="chip chip-warn">חוסר ({l.qty - (picked[l.itemkey] ?? 0)})</span>}
                    {sh === "full" && <span className="chip chip-danger">חסר לגמרי</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card card-pad" style={{ marginTop: 16, background: "var(--surface-muted)" }}>
        <b>סיכום:</b> {lines.length} שורות · {shortages.length ? `${shortages.length} עם חוסר` : "ללא חוסרים"}
      </div>

      {!done && !readOnly && (
        <div style={{ marginTop: 16 }}>
          <button onClick={() => setConfirm(true)} className="btn btn-primary" style={{ padding: "10px 20px" }}>{reopened ? "עדכון ליקוט" : "סיום ליקוט"}</button>
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
                      <li key={l.itemkey} style={{ marginBottom: 4 }}>
                        <b>{l.itemkey}</b> — {shortageOf(l) === "full"
                          ? <span style={{ color: "var(--danger)" }}>חסר לגמרי (השורה תימחק)</span>
                          : <span style={{ color: "var(--warn)" }}>לוקטו {picked[l.itemkey]} מתוך {l.qty} (השורה תעודכן)</span>}
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
