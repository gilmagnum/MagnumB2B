"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOrderContext } from "../../lib/useOrderContext";
import type { OrderKind } from "../../lib/bridge";

// Step 2 of the ordering flow: choose the order kind for the selected customer, then go to the catalog.
export default function StartOrderPage() {
  const { ctx, setKind } = useOrderContext();
  const router = useRouter();
  const [kind, setLocalKind] = useState<OrderKind>(ctx?.orderKind ?? "picking");

  if (!ctx) {
    return (
      <>
        <h1>התחלת הזמנה</h1>
        <p className="chip chip-warn" style={{ display: "block", padding: 12, marginTop: 12 }}>
          יש לבחור לקוח תחילה. <a href="/customer" style={{ color: "inherit", textDecoration: "underline" }}>← בחירת לקוח</a>
        </p>
      </>
    );
  }

  const start = () => { setKind(kind); router.push("/catalog"); };

  const Option = ({ value, title, sub }: { value: OrderKind; title: string; sub: string }) => (
    <button onClick={() => setLocalKind(value)}
      className="card card-pad"
      style={{ textAlign: "start", cursor: "pointer", border: kind === value ? "2px solid var(--brand)" : "1px solid var(--border)", background: kind === value ? "var(--brand-soft)" : "var(--surface)" }}>
      <div style={{ fontWeight: 800, color: "var(--brand-strong)", fontSize: 16 }}>{title}</div>
      <div style={{ color: "var(--ink-muted)", fontSize: 13, marginTop: 4 }}>{sub}</div>
    </button>
  );

  return (
    <>
      <h1>התחלת הזמנה</h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
        לקוח: <b>{ctx.customerName}</b> ({ctx.accountKey}) · <a href="/customer" style={{ color: "var(--brand)" }}>החלפת לקוח</a>
      </p>

      <h3 style={{ color: "var(--brand-strong)", marginBottom: 8 }}>סוג הזמנה</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, maxWidth: 520 }}>
        <Option value="picking" title="לליקוט (הזמנת סוכן)" sub="הזמנה שנכנסת מיד לליקוט במחסן. נדרש מלאי." />
        <Option value="future" title="עתידי (הזמנה)" sub="הזמנה עתידית ללא ליקוט מיידי. פריטי 'התעלם ממלאי' פתוחים גם ללא מלאי." />
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={start} className="btn btn-primary" style={{ padding: "10px 22px" }}>המשך לקטלוג ←</button>
      </div>
    </>
  );
}
