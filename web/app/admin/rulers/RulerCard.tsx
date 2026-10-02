"use client";
import { useState } from "react";
import { saveRulerAction, type AdminState } from "../actions";

export default function RulerCard({ code, name, itemCount, initialSizes }: {
  code: string; name: string | null; itemCount: number; initialSizes: string[];
}) {
  const [sizes, setSizes] = useState<string[]>(initialSizes);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<AdminState>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const addVal = () => {
    const v = draft.trim();
    if (!v || sizes.includes(v)) { setDraft(""); return; }
    setSizes([...sizes, v]); setDraft(""); setDirty(true);
  };
  const removeVal = (i: number) => { setSizes(sizes.filter((_, j) => j !== i)); setDirty(true); };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= sizes.length) return;
    const next = [...sizes]; [next[i], next[j]] = [next[j], next[i]]; setSizes(next); setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const fd = new FormData();
    fd.set("code", code); fd.set("sizes", JSON.stringify(sizes));
    const res = await saveRulerAction({}, fd);
    setState(res); setSaving(false);
    if (res.ok) setDirty(false);
  };

  return (
    <div className="card card-pad" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div><b style={{ color: "var(--brand-strong)" }}>{code}</b>{name ? <span style={{ color: "var(--ink-muted)", fontSize: 13 }}> · {name}</span> : null}</div>
        <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{itemCount} פריטים</span>
      </div>

      {sizes.length === 0 && <p style={{ color: "var(--ink-muted)", fontSize: 13, margin: 0 }}>אין מידות — הוסף למטה.</p>}
      <ol style={{ margin: 0, paddingInlineStart: 22, display: "grid", gap: 6 }}>
        {sizes.map((s, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{s}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} className="btn btn-sm" title="מעלה" style={{ padding: "2px 8px" }}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === sizes.length - 1} className="btn btn-sm" title="מטה" style={{ padding: "2px 8px" }}>↓</button>
            <button onClick={() => removeVal(i)} className="btn btn-sm" title="מחק" style={{ padding: "2px 8px", color: "var(--danger)" }}>✕</button>
          </li>
        ))}
      </ol>

      <div style={{ display: "flex", gap: 6 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVal(); } }}
          placeholder="ערך מידה (למשל S / 36 / NB)…" className="input" />
        <button onClick={addVal} className="btn">+ הוסף ערך</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={save} disabled={saving || !dirty} className="btn btn-primary btn-sm">{saving ? "שומר…" : "שמירה"}</button>
        {state.ok && <span className="chip chip-ok">{state.ok}</span>}
        {state.error && <span className="chip chip-danger">{state.error}</span>}
        {dirty && !state.ok && <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>שינויים לא שמורים</span>}
      </div>
    </div>
  );
}
