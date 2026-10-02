"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bridge, type Customer, type OrderKind } from "../../lib/bridge";
import { useOrderContext } from "../../lib/useOrderContext";
import { useCart } from "../../lib/useCart";
import { supabaseBrowser } from "../../lib/supabase/browser";

// Agent selects a customer to order for. Agent sees ONLY their own customers;
// admin searches ALL. Search is dynamic (updates as you type).
export default function CustomerPage() {
  const { ctx, select, exit } = useOrderContext();
  const { count, clear } = useCart();
  const router = useRouter();
  const exitCustomer = () => {
    if (count > 0 && !window.confirm(`יציאה מהלקוח תרוקן את סל ההזמנה (${count} פריטים) ותחזור למחירון הכללי. להמשיך?`)) return;
    clear(); exit(); router.push("/");
  };
  const [role, setRole] = useState<string>("");
  const [all, setAll] = useState<Customer[]>([]);       // agent's full list (client-filtered)
  const [results, setResults] = useState<Customer[]>([]); // admin search results
  const [bridgeErr, setBridgeErr] = useState<string>("");
  const [manual, setManual] = useState({ accountKey: "", name: "" });
  const [kind, setKind] = useState<OrderKind>("picking");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBridgeErr("יש להתחבר מחדש"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, agent_id").eq("id", user.id).single();
      setRole(prof?.role ?? "");
      if (prof?.role === "admin") return; // admin searches on type
      const agentId = prof?.agent_id;
      if (agentId == null) { setBridgeErr("למשתמש לא משויך קוד סוכן"); return; }
      bridge.customers(agentId).then(setAll).catch(() => setBridgeErr("הגשר עדיין לא מחובר — הזנה ידנית זמנית"));
    })();
  }, []);

  // Admin: debounced live search as you type.
  useEffect(() => {
    if (role !== "admin") return;
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true); setBridgeErr("");
      try { setResults(await bridge.customers(0, { q: term })); }
      catch { setBridgeErr("הגשר עדיין לא מחובר — הזנה ידנית זמנית"); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, role]);

  // Agent: filter their own list client-side as you type.
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = role === "admin"
      ? results
      : (!term ? all : all.filter((c) => c.fullName?.toLowerCase().includes(term) || String(c.accountKey).includes(term)));
    // If the query is a number, prefer customer-number matches (exact → starts-with → contains → rest).
    if (/^\d+$/.test(term)) {
      const rank = (c: Customer) => {
        const k = String(c.accountKey);
        return k === term ? 0 : k.startsWith(term) ? 1 : k.includes(term) ? 2 : 3;
      };
      list = [...list].sort((a, b) => rank(a) - rank(b));
    }
    return list;
  }, [role, results, all, q]);

  const choose = (accountKey: string, customerName: string) => select({ accountKey, customerName, orderKind: kind });

  return (
    <>
      <h1>בחירת לקוח</h1>
      {ctx && (
        <p className="card card-pad" style={{ background: "var(--brand-soft)", borderColor: "var(--brand-soft)", padding: "10px 14px" }}>
          לקוח נבחר: <b>{ctx.customerName}</b> ({ctx.accountKey}) · {ctx.orderKind === "picking" ? "לליקוט" : "עתידי"}{" "}
          <button onClick={exitCustomer} className="btn btn-sm" style={{ marginInlineStart: 8 }}>יציאה מהלקוח</button>
        </p>
      )}

      <label style={{ display: "block", margin: "12px 0" }}>
        סוג הזמנה:{" "}
        <select value={kind} onChange={(e) => setKind(e.target.value as OrderKind)} className="select" style={{ maxWidth: 220, display: "inline-block" }}>
          <option value="picking">לליקוט (הזמנת סוכן)</option>
          <option value="future">עתידי (הזמנה)</option>
        </select>
      </label>

      <input placeholder="חיפוש לקוח (שם או מפתח)…" value={q} onChange={(e) => setQ(e.target.value)}
        className="input" style={{ maxWidth: 360, margin: "4px 0 14px" }} />
      {searching && <span style={{ marginInlineStart: 8, color: "var(--ink-muted)", fontSize: 13 }}>מחפש…</span>}

      {shown.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {shown.map((c) => (
            <li key={c.accountKey} className="card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{c.fullName} <span style={{ color: "var(--ink-muted)" }}>({c.accountKey})</span></span>
              <button onClick={() => choose(c.accountKey, c.fullName)} className="btn btn-primary btn-sm">בחר</button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ border: "1px dashed var(--border)", padding: 12, borderRadius: 10 }}>
          {role === "admin" && !bridgeErr && q.trim().length < 2 && <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>הקלד לפחות 2 תווים לחיפוש לקוח.</p>}
          {role === "admin" && !bridgeErr && q.trim().length >= 2 && !searching && <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>לא נמצאו לקוחות.</p>}
          {bridgeErr && (
            <>
              <p className="chip chip-warn" style={{ marginBottom: 8 }}>{bridgeErr}. הזנה ידנית זמנית:</p>
              <input placeholder="מפתח לקוח" value={manual.accountKey} onChange={(e) => setManual({ ...manual, accountKey: e.target.value })} className="input" style={{ maxWidth: 160, display: "inline-block", marginInlineEnd: 8 }} />
              <input placeholder="שם לקוח" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} className="input" style={{ maxWidth: 200, display: "inline-block", marginInlineEnd: 8 }} />
              <button disabled={!manual.accountKey} onClick={() => choose(manual.accountKey, manual.name || manual.accountKey)} className="btn btn-primary btn-sm">כניסה ללקוח</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
