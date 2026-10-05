"use client";
import { Fragment, useEffect, useState } from "react";
import { listAppOrders, type AppOrderRow } from "../order-actions";

// "App documents" — the backup copies of submitted orders (the original, as ordered).
export default function AppOrdersList() {
  const [rows, setRows] = useState<AppOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { listAppOrders().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const dt = (s: string) => new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  const kind = (k: string | null) => (k === "future" ? "עתידי" : k === "picking" ? "לליקוט" : k ?? "");

  if (loading) return <p>טוען…</p>;
  if (!rows.length) return <p style={{ color: "var(--ink-muted)" }}>אין עדיין עותקי הזמנות באפליקציה.</p>;

  return (
    <div className="table-wrap">
      <table className="data-table" style={{ minWidth: 640 }}>
        <thead>
          <tr><th></th><th>תאריך</th><th>לקוח</th><th>סוג</th><th>מס׳ הזמנה</th><th>שורות</th><th>סך</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lines = r.lines ?? [];
            const isOpen = open === r.id;
            return (
              <Fragment key={r.id}>
                <tr>
                  <td><button onClick={() => setOpen(isOpen ? null : r.id)} className="btn btn-sm" style={{ padding: "2px 9px" }}>{isOpen ? "−" : "+"}</button></td>
                  <td style={{ whiteSpace: "nowrap" }}>{dt(r.created_at)}</td>
                  <td>{r.customer_name} <span style={{ color: "var(--ink-muted)" }}>({r.account_key})</span></td>
                  <td>{kind(r.order_kind)}</td>
                  <td>{r.stock_id ?? "—"}</td>
                  <td>{lines.length}</td>
                  <td>{r.totals?.total != null ? `${Math.round(r.totals.total).toLocaleString("he-IL")} ₪` : "—"}</td>
                </tr>
                {isOpen && (
                  <tr><td colSpan={7} style={{ background: "var(--surface-muted)" }}>
                    <table className="data-table" style={{ width: "100%" }}>
                      <thead><tr><th>מק״ט</th><th>תיאור</th><th>מידה</th><th>יחידה</th><th>כמות</th><th>מחיר יח׳</th></tr></thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{l.itemkey}</td>
                            <td>{l.title ?? ""}</td>
                            <td>{l.sizeLabel ?? ""}</td>
                            <td>{l.unit === "carton" ? "קרטון" : "חבילה"}</td>
                            <td>{l.qty}{l.packSize ? ` × ${l.packSize}` : ""}</td>
                            <td>{l.unitPrice != null ? `${l.unitPrice} ₪` : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
