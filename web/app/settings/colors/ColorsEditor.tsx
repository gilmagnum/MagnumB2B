"use client";
import { useMemo, useState } from "react";
import { colorHex, textOn } from "../../../lib/colorName";
import { saveColorOverrides } from "../actions";

type NameRow = { name: string; count: number };

export default function ColorsEditor({ names, initialOverrides }: { names: NameRow[]; initialOverrides: Record<string, string> }) {
  const [overrides, setOverrides] = useState<Record<string, string>>(initialOverrides);
  const [q, setQ] = useState("");
  const [onlyColors, setOnlyColors] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return names.filter((r) =>
      (!term || r.name.toLowerCase().includes(term)) &&
      (!onlyColors || colorHex(r.name, overrides) != null));
  }, [names, q, onlyColors, overrides]);

  const set = (name: string, hex: string) => setOverrides((o) => ({ ...o, [name]: hex.toLowerCase() }));
  const reset = (name: string) => setOverrides((o) => { const n = { ...o }; delete n[name]; return n; });

  const save = async () => {
    setSaving(true); setMsg("");
    const res = await saveColorOverrides(overrides);
    setSaving(false);
    setMsg(res.ok ? "נשמר ✓ (הגוונים יתעדכנו בקטלוג ובליקוט)" : res.error || "שגיאה בשמירה");
  };

  return (
    <div style={{ marginTop: 16, maxWidth: 560 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם צבע…" className="input" style={{ maxWidth: 220 }} />
        <label style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={onlyColors} onChange={(e) => setOnlyColors(e.target.checked)} />
          רק צבעים מזוהים
        </label>
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ marginInlineStart: "auto" }}>{saving ? "שומר…" : "שמירה"}</button>
      </div>
      {msg && <p className="chip chip-ok" style={{ display: "inline-block", marginBottom: 10 }}>{msg}</p>}

      <div style={{ display: "grid", gap: 6 }}>
        {shown.map((r) => {
          const eff = colorHex(r.name, overrides);
          const val = eff ?? "#cccccc";
          const overridden = r.name in overrides;
          return (
            <div key={r.name} className="card" style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "inline-block", width: 22, height: 22, borderRadius: "50%", background: eff ?? "transparent", border: "1px solid var(--border)", flex: "0 0 auto" }} />
              <span style={{ fontWeight: 600 }}>{eff ? <span style={{ background: eff, color: textOn(eff), padding: "1px 8px", borderRadius: 999 }}>{r.name}</span> : r.name}</span>
              <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>({r.count})</span>
              <input type="color" value={val} onChange={(e) => set(r.name, e.target.value)}
                style={{ marginInlineStart: "auto", width: 40, height: 30, border: "none", background: "none", cursor: "pointer" }} />
              {overridden && <button onClick={() => reset(r.name)} className="btn btn-sm">איפוס</button>}
            </div>
          );
        })}
        {shown.length === 0 && <p style={{ color: "var(--ink-muted)" }}>אין תוצאות.</p>}
      </div>
    </div>
  );
}
