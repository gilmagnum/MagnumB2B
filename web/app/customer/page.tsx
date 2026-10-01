"use client";
import { useEffect, useState } from "react";
import { bridge, type Customer, type OrderKind } from "../../lib/bridge";
import { useOrderContext } from "../../lib/useOrderContext";

// Agent selects a customer to order for. Lists the agent's customers from the bridge (live);
// until the bridge URL is configured, allows manual entry so the flow is usable.
export default function CustomerPage() {
  const { ctx, select, exit } = useOrderContext();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bridgeErr, setBridgeErr] = useState<string>("");
  const [manual, setManual] = useState({ accountKey: "", name: "" });
  const [kind, setKind] = useState<OrderKind>("picking");

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_BRIDGE_URL) { setBridgeErr("הגשר עדיין לא מוגדר"); return; }
    // TODO: real agentId from auth/profile; 0 for now.
    bridge.customers(0).then(setCustomers).catch(() => setBridgeErr("לא ניתן לטעון לקוחות מהגשר"));
  }, []);

  const choose = (accountKey: string, customerName: string) => select({ accountKey, customerName, orderKind: kind });

  return (
    <>
      <h1>בחירת לקוח</h1>
      {ctx && (
        <p style={{ background: "#eef", padding: 10, borderRadius: 8 }}>
          לקוח נבחר: <b>{ctx.customerName}</b> ({ctx.accountKey}) · {ctx.orderKind === "picking" ? "לליקוט" : "עתידי"}{" "}
          <button onClick={exit} style={{ marginInlineStart: 8 }}>יציאה מהלקוח</button>
        </p>
      )}

      <label style={{ display: "block", margin: "12px 0" }}>
        סוג הזמנה:{" "}
        <select value={kind} onChange={(e) => setKind(e.target.value as OrderKind)}>
          <option value="picking">לליקוט (הזמנת סוכן)</option>
          <option value="future">עתידי (הזמנה)</option>
        </select>
      </label>

      {customers.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {customers.map((c) => (
            <li key={c.accountKey} style={{ padding: 8, borderBottom: "1px solid #eee" }}>
              {c.fullName} <span style={{ color: "#888" }}>({c.accountKey})</span>{" "}
              <button onClick={() => choose(c.accountKey, c.fullName)}>בחר</button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ border: "1px dashed #ccc", padding: 12, borderRadius: 8 }}>
          {bridgeErr && <p style={{ color: "#a60", fontSize: 13 }}>הגשר עדיין לא מחובר ({bridgeErr}). הזנה ידנית זמנית:</p>}
          <input placeholder="מפתח לקוח" value={manual.accountKey}
            onChange={(e) => setManual({ ...manual, accountKey: e.target.value })} style={{ marginInlineEnd: 8 }} />
          <input placeholder="שם לקוח" value={manual.name}
            onChange={(e) => setManual({ ...manual, name: e.target.value })} style={{ marginInlineEnd: 8 }} />
          <button disabled={!manual.accountKey} onClick={() => choose(manual.accountKey, manual.name || manual.accountKey)}>
            כניסה ללקוח
          </button>
        </div>
      )}
    </>
  );
}
