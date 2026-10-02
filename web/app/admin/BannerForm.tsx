"use client";
import { useActionState } from "react";
import { saveBannerAction, type AdminState } from "./actions";

type Banner = { title?: string; subtitle?: string; image_url?: string; cta_text?: string; cta_link?: string };

export default function BannerForm({ banner }: { banner: Banner }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveBannerAction, {});
  return (
    <form action={action} className="card card-pad" style={{ display: "grid", gap: 10, maxWidth: 460 }}>
      <h3 style={{ margin: 0, color: "var(--brand-strong)" }}>באנר דף הבית</h3>
      <label style={lbl}>כותרת<input name="title" defaultValue={banner.title ?? ""} className="input" style={{ marginTop: 4 }} /></label>
      <label style={lbl}>כותרת משנה<input name="subtitle" defaultValue={banner.subtitle ?? ""} className="input" style={{ marginTop: 4 }} /></label>
      <label style={lbl}>קישור תמונת רקע (URL)<input name="image_url" defaultValue={banner.image_url ?? ""} className="input" style={{ marginTop: 4 }} placeholder="https://… (אופציונלי)" /></label>
      <div style={{ display: "flex", gap: 10 }}>
        <label style={{ ...lbl, flex: 1 }}>טקסט כפתור<input name="cta_text" defaultValue={banner.cta_text ?? ""} className="input" style={{ marginTop: 4 }} /></label>
        <label style={{ ...lbl, flex: 1 }}>קישור כפתור<input name="cta_link" defaultValue={banner.cta_link ?? ""} className="input" style={{ marginTop: 4 }} placeholder="/catalog" /></label>
      </div>
      {state.error && <p className="chip chip-danger" style={{ margin: 0 }}>{state.error}</p>}
      {state.ok && <p className="chip chip-ok" style={{ margin: 0 }}>{state.ok} ✓</p>}
      <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "שומר…" : "שמירת באנר"}</button>
    </form>
  );
}

const lbl = { fontSize: 13, fontWeight: 600, color: "var(--ink)", display: "block" } as const;
