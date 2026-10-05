"use client";
import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listAppOrders, type AppOrderRow } from "../order-actions";
import { useCart, type CartLine, type Unit } from "../../lib/useCart";
import { useOrderContext } from "../../lib/useOrderContext";

// Copy intent carried to /customer when copying an order to a DIFFERENT customer.
const COPY_KEY = "magnumb2b_copy";
type CopyLine = { itemkey: string; title?: string; qty: number; unit: string; sizeLabel?: string; packSize?: number; unitPrice?: number };
const toCartLine = (l: CopyLine): CartLine => ({ itemkey: l.itemkey, title: l.title || l.itemkey, qty: l.qty, unit: (l.unit === "carton" ? "carton" : "bundle") as Unit, unitPrice: l.unitPrice, packSize: l.packSize, sizeLabel: l.sizeLabel });

// "App documents" — the backup copies of submitted orders (the original, as ordered).
export default function AppOrdersList() {
  const [rows, setRows] = useState<AppOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const router = useRouter();
  const { setAll } = useCart();
  const { select } = useOrderContext();

  useEffect(() => { listAppOrders().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false)); }, []);

  // Copy to the SAME customer: load the lines into the cart and go review.
  const copySame = (r: AppOrderRow) => {
    select({ accountKey: r.account_key, customerName: r.customer_name ?? r.account_key, orderKind: (r.order_kind as "picking" | "future") || "picking" });
    setAll((r.lines as CopyLine[]).map(toCartLine));
    router.push("/cart");
  };
  // Copy to ANOTHER customer: stash the lines, pick a customer; prices resolve for them in the cart.
  const copyOther = (r: AppOrderRow) => {
    try { localStorage.setItem(COPY_KEY, JSON.stringify({ lines: r.lines, orderKind: r.order_kind })); } catch { /* ignore */ }
    router.push("/customer");
  };

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
                    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button onClick={() => copySame(r)} className="btn btn-primary btn-sm">העתק הזמנה לאותו לקוח</button>
                      <button onClick={() => copyOther(r)} className="btn btn-sm">העתק ללקוח אחר</button>
                    </div>
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
