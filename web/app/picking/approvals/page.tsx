"use client";
import { useEffect, useState } from "react";
import { bridge } from "../../../lib/bridge";
import { supabaseBrowser } from "../../../lib/supabase/browser";
import { managerOrAbove } from "../../../lib/roles";
import { listPendingSurplus, resolveSurplus, type SurplusRow } from "../../surplus-approvals-actions";

// Manager screen: approve/reject picker surpluses. Approving writes the increase to Hashavshevet
// (a manager finishPicking with the surplus quantities), then records the decision.
export default function SurplusApprovalsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [me, setMe] = useState("");
  const [rows, setRows] = useState<SurplusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ack, setAck] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (!user) { setAllowed(false); return; }
      const { data: prof } = await supabaseBrowser().from("profiles").select("role, full_name").eq("id", user.id).single();
      setMe(prof?.full_name ?? user.email ?? "");
      setAllowed(managerOrAbove(prof?.role));
    })();
  }, []);

  const load = () => { setLoading(true); listPendingSurplus().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false)); };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const dt = (s: string) => new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const approve = async (r: SurplusRow) => {
    setBusy(r.id); setMsg((m) => ({ ...m, [r.id]: "" }));
    try {
      // Write the increase: a MANAGER finishPicking with the surplus quantities (bridge increases those lines).
      await bridge.finishPicking(r.stockId, {
        picker: `עודף אושר ע״י ${me}`,
        lines: r.lines.map((l) => ({ itemkey: l.itemkey, size: l.size, pickedQty: l.picked })),
      });
      const res = await resolveSurplus(r.id, true);
      if (res.error) throw new Error(res.error);
      setRows((rs) => rs.filter((x) => x.id !== r.id));
    } catch (e) {
      const m = (e as Error).message || "";
      setMsg((mm) => ({ ...mm, [r.id]: /NOT_OPEN|409/.test(m) ? "המסמך אינו פתוח (אולי כבר הופק) — לא ניתן להגדיל." : /BAD_QTY|422/.test(m) ? "כמות לא תקינה." : `שגיאה: ${m || "הגשר לא זמין"}` }));
    } finally { setBusy(null); }
  };

  const reject = async (r: SurplusRow) => {
    if (!window.confirm("לדחות את העודף? המסמך יישאר בכמות שהוזמנה.")) return;
    setBusy(r.id);
    const res = await resolveSurplus(r.id, false);
    setBusy(null);
    if (res.error) setMsg((m) => ({ ...m, [r.id]: res.error! }));
    else setRows((rs) => rs.filter((x) => x.id !== r.id));
  };

  if (allowed === false) return <p style={{ color: "#a60" }}>הדף מיועד למנהלים בלבד.</p>;

  return (
    <>
      <p><a href="/picking" style={{ color: "var(--brand)" }}>← תור הליקוט</a></p>
      <h1>אישורי ליקוט עודף</h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>אישור יגדיל את שורת ההזמנה בחשבשבת ואת החיוב בהתאם. בדוק את הסכום לפני אישור.</p>

      {loading ? <p>טוען…</p> : rows.length === 0 ? (
        <p className="chip chip-ok" style={{ display: "inline-block", marginTop: 12 }}>אין עודפים ממתינים לאישור ✓</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {rows.map((r) => (
            <div key={r.id} className="card card-pad" style={{ display: "grid", gap: 8, borderInlineStart: "4px solid var(--danger)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <b style={{ color: "var(--brand-strong)" }}>{r.docNumber ? `#${r.docNumber}` : `זמני ${r.stockId}`} · {r.customerName}{r.accountKey ? ` (${r.accountKey})` : ""}</b>
                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>מלקט: {r.picker ?? "—"} · {dt(r.createdAt)}</span>
              </div>
              <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 14 }}>
                {r.lines.map((l, i) => (
                  <li key={i}><b>{l.itemkey}</b>{l.size ? ` (מידה ${l.size})` : ""} — הוזמן {l.ordered}, לוקט {l.picked} · <span style={{ color: "var(--danger)", fontWeight: 700 }}>עודף +{l.surplus} ({l.amount.toFixed(2)} ₪)</span></li>
                ))}
              </ul>
              <div style={{ fontWeight: 700 }}>סה״כ עודף: {r.units} יח' · <span style={{ color: "var(--danger)" }}>{r.amount.toFixed(2)} ₪</span> (לפני מע״מ)</div>
              <label style={{ display: "flex", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>
                <input type="checkbox" checked={!!ack[r.id]} onChange={(e) => setAck((a) => ({ ...a, [r.id]: e.target.checked }))} />
                אני מאשר הגדלת המסמך ב-{r.units} יח' · {r.amount.toFixed(2)} ₪ (החיוב יגדל)
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => approve(r)} disabled={busy === r.id || !ack[r.id]} className="btn btn-primary">{busy === r.id ? "כותב…" : "אשר והגדל בחשבשבת"}</button>
                <button onClick={() => reject(r)} disabled={busy === r.id} className="btn" style={{ color: "var(--danger)" }}>דחה</button>
                {msg[r.id] && <span className="chip chip-danger">{msg[r.id]}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
