"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge, type Stats, type SeriesPoint } from "../../lib/bridge";
import { useOrderContext } from "../../lib/useOrderContext";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { managerOrAbove } from "../../lib/roles";

type Preset = "today" | "month" | "quarter" | "year" | "custom";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ils = (n: number | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("he-IL")} ₪`);
const num = (n: number | undefined) => (n == null ? "—" : n.toLocaleString("he-IL"));

function rangeFor(preset: Preset, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  const today = iso(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (preset === "quarter") { const q = Math.floor(now.getMonth() / 3) * 3; return { from: iso(new Date(now.getFullYear(), q, 1)), to: today }; }
  if (preset === "year") return { from: iso(new Date(now.getFullYear(), 0, 1)), to: today };
  return custom;
}

const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function addMonthsClamp(d: Date, delta: number) {
  const t = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d.getDate(), last));
  return t;
}
// The PARALLEL previous period: shifted by one unit of the preset and ending at the
// equivalent date (e.g. year = last year up to the same day, not the full last year).
function prevRangeFor(preset: Preset, range: { from: string; to: string }): { from: string; to: string } {
  const f = parse(range.from), t = parse(range.to);
  if (preset === "today") return { from: iso(addDays(f, -1)), to: iso(addDays(t, -1)) };
  if (preset === "month") return { from: iso(addMonthsClamp(f, -1)), to: iso(addMonthsClamp(t, -1)) };
  if (preset === "quarter") return { from: iso(addMonthsClamp(f, -3)), to: iso(addMonthsClamp(t, -3)) };
  if (preset === "year") return { from: iso(addMonthsClamp(f, -12)), to: iso(addMonthsClamp(t, -12)) };
  const len = Math.round((t.getTime() - f.getTime()) / 864e5); // custom: same length right before
  const pt = addDays(f, -1); const pf = addDays(pt, -len);
  return { from: iso(pf), to: iso(pt) };
}

export default function DataPage() {
  const { ctx } = useOrderContext();
  const [role, setRole] = useState("");
  const [agentId, setAgentId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ from: iso(new Date(Date.now() - 30 * 864e5)), to: iso(new Date()) });
  const [compare, setCompare] = useState(false);
  const [metric, setMetric] = useState<"value" | "qty">("value");

  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (user) {
        const { data: prof } = await supabaseBrowser().from("profiles").select("role, agent_id").eq("id", user.id).single();
        setRole(prof?.role ?? ""); setAgentId(prof?.agent_id ?? null);
      }
      setReady(true);
    })();
  }, []);

  // Scope: inside a customer → that account; manager/admin → all; agent → their customers.
  const scope = useMemo(() => {
    if (ctx) return { kind: "account" as const, label: `לקוח: ${ctx.customerName}`, q: { scope: "account" as const, account: ctx.accountKey } };
    if (managerOrAbove(role)) return { kind: "all" as const, label: "כלל הלקוחות", q: { scope: "all" as const, central: true } };
    return { kind: "agent" as const, label: "הלקוחות שלי", q: { scope: "agent" as const, agent: agentId } };
  }, [ctx, role, agentId]);

  const range = rangeFor(preset, custom);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const primary = await bridge.stats({ ...scope.q, from: range.from, to: range.to });
      let previous;
      if (compare) {
        const pr = prevRangeFor(preset, range);
        const p = await bridge.stats({ ...scope.q, from: pr.from, to: pr.to });
        previous = { sales: p.sales, returns: p.returns, ordersCount: p.ordersCount, payments: p.payments, activeCustomers: p.activeCustomers };
      }
      setData({ ...primary, previous });
    } catch (e) {
      const m = (e as Error).message || "";
      setErr(/404|not found/i.test(m) ? "נקודת הנתונים בגשר עדיין לא פעילה — תוצג כשתעלה." : "שגיאה בטעינת נתונים — ייתכן שהגשר לא מחובר.");
      setData(null);
    } finally { setLoading(false); }
  }, [scope.q, range.from, range.to, compare, preset]);

  useEffect(() => { if (ready) void load(); }, [ready, preset, custom, compare, scope.kind, scope.q.account, scope.q.agent]); // eslint-disable-line react-hooks/exhaustive-deps

  const presets: [Preset, string][] = [["today", "היום"], ["month", "החודש"], ["quarter", "הרבעון"], ["year", "השנה"], ["custom", "טווח"]];

  const avg = data && data.ordersCount ? data.sales / data.ordersCount : 0;
  const prevAvg = data?.previous && data.previous.ordersCount ? data.previous.sales / data.previous.ordersCount : undefined;

  return (
    <>
      <h1>נתונים</h1>
      <p style={{ color: "var(--ink-muted)", fontSize: 14, marginTop: 2 }}>{scope.label} · {range.from} — {range.to}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
        {presets.map(([p, label]) => (
          <button key={p} onClick={() => setPreset(p)} className="btn btn-sm"
            style={{ background: preset === p ? "var(--brand)" : "var(--surface)", color: preset === p ? "#fff" : "var(--brand)", border: "1px solid var(--brand)" }}>
            {label}
          </button>
        ))}
        {preset === "custom" && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="input" style={{ width: 150 }} />
            <span>—</span>
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="input" style={{ width: 150 }} />
          </span>
        )}
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14, marginInlineStart: "auto" }}>
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> השוואה לתקופה קודמת
        </label>
      </div>

      {err && <p className="chip chip-warn" style={{ display: "block", padding: 12 }}>{err}</p>}
      {loading && <p>טוען…</p>}

      {data && !loading && (
        <>
          {/* dense metric tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
            <Metric label="מכירות" value={ils(data.sales)} prev={compare ? data.previous?.sales : undefined} cur={data.sales} money />
            <Metric label="הזמנות" value={num(data.ordersCount)} prev={compare ? data.previous?.ordersCount : undefined} cur={data.ordersCount} />
            <Metric label="תשלומים" value={ils(data.payments)} prev={compare ? data.previous?.payments : undefined} cur={data.payments} money />
            <Metric label="ממוצע הזמנה" value={ils(avg)} prev={compare ? prevAvg : undefined} cur={avg} money />
            {data.returns != null && <Metric label="זיכויים" value={ils(data.returns)} prev={compare ? data.previous?.returns : undefined} cur={data.returns} money />}
            {data.activeCustomers != null && <Metric label="לקוחות פעילים" value={num(data.activeCustomers)} prev={compare ? data.previous?.activeCustomers : undefined} cur={data.activeCustomers} />}
            {data.openBalance != null && <Metric label="יתרות לתשלום" value={ils(-data.openBalance)} cur={-data.openBalance} />}
            {data.pipeline?.awaitingPicking && <Metric label="ממתינות לליקוט" value={num(data.pipeline.awaitingPicking.count)} hint={ils(data.pipeline.awaitingPicking.value)} />}
            {data.pipeline?.awaitingProduction && <Metric label="ממתינות להפקה" value={num(data.pipeline.awaitingProduction.count)} hint={ils(data.pipeline.awaitingProduction.value)} />}
          </div>

          {/* trend chart — full width */}
          {data.series && data.series.length > 1 && (
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <h3 style={{ color: "var(--brand-strong)", margin: "0 0 8px" }}>מגמת מכירות</h3>
              <TrendChart series={data.series} />
            </div>
          )}

          {/* graphical top-lists — tiled across the screen; toggle sum vs quantity */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>מובילים</h2>
            <div style={{ display: "inline-flex", border: "1px solid var(--brand)", borderRadius: 999, overflow: "hidden", marginInlineStart: 4 }}>
              {([["value", "סכום ₪"], ["qty", "כמות"]] as const).map(([m, label]) => (
                <button key={m} onClick={() => setMetric(m)}
                  style={{ border: 0, padding: "5px 14px", cursor: "pointer", fontSize: 13, background: metric === m ? "var(--brand)" : "var(--surface)", color: metric === m ? "#fff" : "var(--brand)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, marginTop: 12, alignItems: "start" }}>
            {data.topItems?.length > 0 && (
              <BarList title="פריטים מובילים" metric={metric} qtyLabel="יחידות" items={data.topItems.map((t) => ({ label: t.name, sub: t.itemkey, value: t.value, qty: t.qty }))} />
            )}
            {data.topCategories && data.topCategories.length > 0 && (
              <BarList title="קטגוריות מובילות" metric={metric} qtyLabel="יחידות" items={data.topCategories.map((c) => ({ label: c.name, value: c.sales, qty: c.qty }))} />
            )}
            {data.topCustomers && data.topCustomers.length > 0 && (
              <BarList title="לקוחות מובילים" metric={metric} qtyLabel="הזמנות" items={data.topCustomers.map((c) => ({ label: c.name, sub: `(${c.accountKey})`, value: c.sales, qty: c.ordersCount }))} />
            )}
            {data.byAgent && data.byAgent.length > 0 && (
              <BarList title="לפי סוכן" metric={metric} qtyLabel="הזמנות" items={data.byAgent.map((a) => ({ label: a.agentName, sub: `(${a.agentId})`, value: a.sales, qty: a.ordersCount }))} />
            )}
          </div>
        </>
      )}
    </>
  );
}

type BarItem = { label: string; sub?: string; value: number; qty?: number };
// Horizontal bar list — a compact graphical "top N". `metric` picks sum (₪) or quantity;
// bars re-sort by the chosen metric. `qtyLabel` names the quantity (e.g. "הזמנות").
function BarList({ title, items, metric, qtyLabel }: { title: string; items: BarItem[]; metric: "value" | "qty"; qtyLabel?: string }) {
  const hasQty = items.some((i) => i.qty != null);
  const useQty = metric === "qty" && hasQty;
  const pick = (it: BarItem) => (useQty ? (it.qty ?? 0) : it.value);
  const rows = [...items].sort((a, b) => pick(b) - pick(a));
  const max = Math.max(1, ...rows.map(pick));
  const fmt = (n: number) => (useQty ? n.toLocaleString("he-IL") : `${Math.round(n).toLocaleString("he-IL")} ₪`);
  return (
    <div className="card card-pad">
      <h3 style={{ color: "var(--brand-strong)", margin: "0 0 10px" }}>{title}{useQty && qtyLabel ? <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-muted)" }}> · {qtyLabel}</span> : null}</h3>
      <div style={{ display: "grid", gap: 9 }}>
        {rows.map((it, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, marginBottom: 3 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.label}{it.sub ? <span style={{ color: "var(--ink-muted)" }}> {it.sub}</span> : null}
              </span>
              <b style={{ whiteSpace: "nowrap" }}>{fmt(pick(it))}</b>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "var(--surface-muted)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(2, Math.round((pick(it) / max) * 100))}%`, background: "var(--brand)", borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Lightweight inline SVG bar chart (no external libs) for the sales trend.
function TrendChart({ series }: { series: SeriesPoint[] }) {
  const max = Math.max(1, ...series.map((p) => p.sales));
  const n = series.length;
  const W = 760, H = 180, pad = 24;
  const bw = (W - pad * 2) / n;
  const fmtDate = (s: string) => { const d = new Date(s); return `${d.getDate()}/${d.getMonth() + 1}`; };
  const step = Math.ceil(n / 8); // label density
  return (
    <div className="table-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto" }} role="img" aria-label="מגמת מכירות">
        {series.map((p, i) => {
          const h = Math.round(((H - pad * 2) * p.sales) / max);
          const x = pad + i * bw;
          const y = H - pad - h;
          return (
            <g key={p.date}>
              <rect x={x + bw * 0.15} y={y} width={bw * 0.7} height={h} rx={2} fill="var(--brand)">
                <title>{`${fmtDate(p.date)}: ${Math.round(p.sales).toLocaleString("he-IL")} ₪`}</title>
              </rect>
              {i % step === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ink-muted)">{fmtDate(p.date)}</text>}
            </g>
          );
        })}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--border)" />
      </svg>
    </div>
  );
}

function Metric({ label, value, prev, cur, money, hint }: { label: string; value: string; prev?: number; cur?: number; money?: boolean; hint?: string }) {
  let delta: { pct: number; up: boolean } | null = null;
  if (prev != null && cur != null && prev !== 0) delta = { pct: Math.round(((cur - prev) / Math.abs(prev)) * 100), up: cur >= prev };
  return (
    <div className="card card-pad" style={{ padding: 14 }}>
      <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--brand-strong)", marginTop: 4 }}>{value}{hint && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-muted)", marginInlineStart: 6 }}>{hint}</span>}</div>
      {delta && (
        <div style={{ fontSize: 13, marginTop: 4, color: delta.up ? "var(--ok)" : "var(--danger)" }}>
          {delta.up ? "▲" : "▼"} {Math.abs(delta.pct)}% <span style={{ color: "var(--ink-muted)" }}>מהתקופה הקודמת {money && prev != null ? `(${ils(prev)})` : prev != null ? `(${num(prev)})` : ""}</span>
        </div>
      )}
    </div>
  );
}
