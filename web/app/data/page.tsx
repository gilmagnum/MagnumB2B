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

export default function DataPage() {
  const { ctx } = useOrderContext();
  const [role, setRole] = useState("");
  const [agentId, setAgentId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ from: iso(new Date(Date.now() - 30 * 864e5)), to: iso(new Date()) });
  const [compare, setCompare] = useState(false);

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
    if (managerOrAbove(role)) return { kind: "all" as const, label: "כלל הלקוחות", q: { scope: "all" as const } };
    return { kind: "agent" as const, label: "הלקוחות שלי", q: { scope: "agent" as const, agent: agentId } };
  }, [ctx, role, agentId]);

  const range = rangeFor(preset, custom);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      setData(await bridge.stats({ ...scope.q, from: range.from, to: range.to, compare }));
    } catch (e) {
      const m = (e as Error).message || "";
      setErr(/404|not found/i.test(m) ? "נקודת הנתונים בגשר עדיין לא פעילה — תוצג כשתעלה." : "שגיאה בטעינת נתונים — ייתכן שהגשר לא מחובר.");
      setData(null);
    } finally { setLoading(false); }
  }, [scope.q, range.from, range.to, compare]);

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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 14 }}>
            <Metric label="מכירות" value={ils(data.sales)} prev={compare ? data.previous?.sales : undefined} cur={data.sales} money />
            <Metric label="הזמנות" value={num(data.ordersCount)} prev={compare ? data.previous?.ordersCount : undefined} cur={data.ordersCount} />
            <Metric label="תשלומים" value={ils(data.payments)} prev={compare ? data.previous?.payments : undefined} cur={data.payments} money />
            <Metric label="ממוצע הזמנה" value={ils(avg)} prev={compare ? prevAvg : undefined} cur={avg} money />
            {data.returns != null && <Metric label="זיכויים" value={ils(data.returns)} prev={compare ? data.previous?.returns : undefined} cur={data.returns} money />}
            {data.activeCustomers != null && <Metric label="לקוחות פעילים" value={num(data.activeCustomers)} prev={compare ? data.previous?.activeCustomers : undefined} cur={data.activeCustomers} />}
            {data.openBalance != null && <Metric label="יתרות פתוחות" value={ils(data.openBalance)} cur={data.openBalance} />}
          </div>

          {data.pipeline && (data.pipeline.awaitingPicking || data.pipeline.awaitingProduction) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 14, marginTop: 14 }}>
              {data.pipeline.awaitingPicking && <Metric label="ממתינות לליקוט" value={`${num(data.pipeline.awaitingPicking.count)} · ${ils(data.pipeline.awaitingPicking.value)}`} />}
              {data.pipeline.awaitingProduction && <Metric label="ממתינות להפקה" value={`${num(data.pipeline.awaitingProduction.count)} · ${ils(data.pipeline.awaitingProduction.value)}`} />}
            </div>
          )}

          {data.series && data.series.length > 1 && (
            <section style={{ marginTop: 24 }}>
              <h3 style={{ color: "var(--brand-strong)" }}>מגמת מכירות</h3>
              <TrendChart series={data.series} />
            </section>
          )}

          {data.topItems?.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h3 style={{ color: "var(--brand-strong)" }}>פריטים מובילים</h3>
              <div className="table-wrap">
                <table className="data-table" style={{ minWidth: 420 }}>
                  <thead><tr><th>מק״ט</th><th>תיאור</th><th>כמות</th><th>שווי</th></tr></thead>
                  <tbody>
                    {data.topItems.map((t) => (
                      <tr key={t.itemkey}><td style={{ fontWeight: 700 }}>{t.itemkey}</td><td>{t.name}</td><td>{num(t.qty)}</td><td>{ils(t.value)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.topCategories && data.topCategories.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h3 style={{ color: "var(--brand-strong)" }}>קטגוריות מובילות</h3>
              <div className="table-wrap">
                <table className="data-table" style={{ minWidth: 340 }}>
                  <thead><tr><th>קטגוריה</th><th>מכירות</th>{data.topCategories.some((c) => c.qty != null) && <th>כמות</th>}</tr></thead>
                  <tbody>
                    {data.topCategories.map((c) => (
                      <tr key={c.name}><td style={{ fontWeight: 600 }}>{c.name}</td><td>{ils(c.sales)}</td>{c.qty != null && <td>{num(c.qty)}</td>}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.topCustomers && data.topCustomers.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h3 style={{ color: "var(--brand-strong)" }}>לקוחות מובילים</h3>
              <div className="table-wrap">
                <table className="data-table" style={{ minWidth: 380 }}>
                  <thead><tr><th>לקוח</th><th>מכירות</th>{data.topCustomers.some((c) => c.ordersCount != null) && <th>הזמנות</th>}</tr></thead>
                  <tbody>
                    {data.topCustomers.map((c) => (
                      <tr key={c.accountKey}><td>{c.name} <span style={{ color: "var(--ink-muted)" }}>({c.accountKey})</span></td><td>{ils(c.sales)}</td>{c.ordersCount != null && <td>{num(c.ordersCount)}</td>}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.byAgent && data.byAgent.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h3 style={{ color: "var(--brand-strong)" }}>לפי סוכן</h3>
              <div className="table-wrap">
                <table className="data-table" style={{ minWidth: 480 }}>
                  <thead><tr><th>סוכן</th><th>מכירות</th><th>הזמנות</th><th>תשלומים</th></tr></thead>
                  <tbody>
                    {data.byAgent.map((a) => (
                      <tr key={a.agentId}><td>{a.agentName} <span style={{ color: "var(--ink-muted)" }}>({a.agentId})</span></td><td>{ils(a.sales)}</td><td>{num(a.ordersCount)}</td><td>{ils(a.payments)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </>
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

function Metric({ label, value, prev, cur, money }: { label: string; value: string; prev?: number; cur?: number; money?: boolean }) {
  let delta: { pct: number; up: boolean } | null = null;
  if (prev != null && cur != null && prev !== 0) delta = { pct: Math.round(((cur - prev) / Math.abs(prev)) * 100), up: cur >= prev };
  return (
    <div className="card card-pad">
      <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--brand-strong)", marginTop: 4 }}>{value}</div>
      {delta && (
        <div style={{ fontSize: 13, marginTop: 4, color: delta.up ? "var(--ok)" : "var(--danger)" }}>
          {delta.up ? "▲" : "▼"} {Math.abs(delta.pct)}% <span style={{ color: "var(--ink-muted)" }}>מהתקופה הקודמת {money && prev != null ? `(${ils(prev)})` : prev != null ? `(${num(prev)})` : ""}</span>
        </div>
      )}
    </div>
  );
}
