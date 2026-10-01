"use client";
import { useEffect, useState } from "react";
import { bridge, type Customer, type OrderKind } from "../../lib/bridge";
import { useOrderContext } from "../../lib/useOrderContext";
import { supabaseBrowser } from "../../lib/supabase/browser";

// Agent selects a customer to order for. An agent sees ONLY their own customers
// (filtered by Accounts.Agent on the bridge). An admin searches ALL customers.
export default function CustomerPage() {
  const { ctx, select, exit } = useOrderContext();
  const [role, setRole] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bridgeErr, setBridgeErr] = useState<string>("");
  const [manual, setManual] = useState({ accountKey: "", name: "" });
  const [kind, setKind] = useState<OrderKind>("picking");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBridgeErr("יש להתחבר מחדש"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, agent_id").eq("id", user.id).single();
      setRole(prof?.role ?? "");
      // Admin: wait for a search. Agent: load their own customers immediately.
      if (prof?.role === "admin") return;
      const agentId = prof?.agent_id;
      if (agentId == null) { setBridgeErr("למשתמש לא משויך קוד סוכן"); return; }
      bridge.customers(agentId).then(setCustomers).catch(() => setBridgeErr("הגשר עדיין לא מחובר — הזנה ידנית זמנית"));
    })();
  }, []);

  const adminSearch = async () => {
    if (q.trim().length < 2) return;
    setSearching(true); setBridgeErr("");
    try {
      setCustomers(await bridge.customers(0, { q: q.trim() }));
    } catch {
      setBridgeErr("הגשר עדיין לא מחובר — הזנה ידנית זמנית");
    } finally {
      setSearching(false);
    }
  };

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

      {role === "admin" && (
        <div style={{ margin: "12px 0", display: "flex", gap: 8 }}>
          <input placeholder="חיפוש לקוח (שם או מפתח)…" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") adminSearch(); }}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", minWidth: 280 }} />
          <button onClick={adminSearch} disabled={searching || q.trim().length < 2}
            style={{ background: "#1e2a78", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>
            {searching ? "מחפש…" : "חיפוש"}
          </button>
        </div>
      )}

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
          {role === "admin" && !bridgeErr && <p style={{ color: "#555", fontSize: 13 }}>חפש לקוח כדי להזמין עבורו.</p>}
          {bridgeErr && <p style={{ color: "#a60", fontSize: 13 }}>{bridgeErr}. הזנה ידנית זמנית:</p>}
          {bridgeErr && (
            <>
              <input placeholder="מפתח לקוח" value={manual.accountKey}
                onChange={(e) => setManual({ ...manual, accountKey: e.target.value })} style={{ marginInlineEnd: 8 }} />
              <input placeholder="שם לקוח" value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })} style={{ marginInlineEnd: 8 }} />
              <button disabled={!manual.accountKey} onClick={() => choose(manual.accountKey, manual.name || manual.accountKey)}>
                כניסה ללקוח
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
