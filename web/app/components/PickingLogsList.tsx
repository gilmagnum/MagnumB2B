"use client";
import { Fragment, useEffect, useState } from "react";
import { listPickingLogs, type PickLogRow } from "../order-actions";

type Preset = "today" | "month" | "quarter" | "year" | "all";
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function rangeFor(p: Preset): { from?: string; to?: string } {
  if (p === "all") return {};
  const now = new Date(), to = isoDay(now);
  if (p === "today") return { from: to, to };
  if (p === "month") return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (p === "quarter") { const q = Math.floor(now.getMonth() / 3) * 3; return { from: isoDay(new Date(now.getFullYear(), q, 1)), to }; }
  return { from: isoDay(new Date(now.getFullYear(), 0, 1)), to }; // year
}
const PRESETS: [Preset, string][] = [["today", "היום"], ["month", "החודש"], ["quarter", "רבעון"], ["year", "שנה"], ["all", "הכל"]];

// Picking logs: picker + notes + shortages saved on each finish.
export default function PickingLogsList() {
  const [rows, setRows] = useState<PickLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("month");

  useEffect(() => {
    setLoading(true);
    listPickingLogs(rangeFor(preset)).then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false));
  }, [preset]);
  const dt = (s: string) => new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  const dateBar = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      {PRESETS.map(([p, label]) => (
        <button key={p} onClick={() => setPreset(p)} className={preset === p ? "btn btn-primary btn-sm" : "btn btn-sm"}>{label}</button>
      ))}
    </div>
  );

  if (loading) return <>{dateBar}<p>טוען…</p></>;
  if (!rows.length) return <>{dateBar}<p style={{ color: "var(--ink-muted)" }}>אין רישומי ליקוט בטווח זה.</p></>;

  return (
    <>
    {dateBar}
    <div className="table-wrap">
      <table className="data-table" style={{ minWidth: 640 }}>
        <thead>
          <tr><th></th><th>תאריך</th><th>הזמנה</th><th>לקוח</th><th>מלקט</th><th>חוסרים</th><th>הערה</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = open === r.id;
            return (
              <Fragment key={r.id}>
                <tr>
                  <td><button onClick={() => setOpen(isOpen ? null : r.id)} className="btn btn-sm" style={{ padding: "2px 9px" }}>{isOpen ? "−" : "+"}</button></td>
                  <td style={{ whiteSpace: "nowrap" }}>{dt(r.created_at)}</td>
                  <td>{r.doc_number ? `#${r.doc_number}` : r.stock_id}</td>
                  <td>{r.account_key}</td>
                  <td>{r.picker ?? "—"}</td>
                  <td>{r.shortages?.length ? <span className="chip chip-warn">{r.shortages.length}</span> : <span className="chip chip-ok">0</span>}</td>
                  <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notes || ""}</td>
                </tr>
                {isOpen && (
                  <tr><td colSpan={7} style={{ background: "var(--surface-muted)" }}>
                    {r.notes && <p style={{ margin: "0 0 8px" }}><b>הערת מלקט:</b> {r.notes}</p>}
                    {r.shortages?.length ? (
                      <>
                        <b>חוסרים ({r.shortages.length}):</b>
                        <ul style={{ margin: "6px 0 0", paddingInlineStart: 18, fontSize: 14 }}>
                          {r.shortages.map((s, i) => (
                            <li key={i}>
                              <b>{s.itemkey}</b>{s.size ? ` (מידה ${s.size})` : ""} — {s.kind === "full"
                                ? <span style={{ color: "var(--danger)" }}>לא לוקט (הוזמן {s.ordered})</span>
                                : <span style={{ color: "var(--warn)" }}>לוקטו {s.picked} מתוך {s.ordered}</span>}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : <span style={{ color: "var(--ok)" }}>אין חוסרים — כל השורות סופקו במלואן.</span>}
                  </td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
