"use client";
import { useRef, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { prepareImagePull, commitImagePull } from "../settings/pull-images-actions";

const BUCKET = "product-images";
type Row = { file: File; sku: string; primary: boolean };
type Result = { updated: number; unmatched: string[]; errors: string[] };

// Manager tool: pick a LOCAL folder of product images (filename = SKU) and pull them into our
// storage. Bytes upload straight from the browser to Supabase via a per-file signed URL (so there
// is no server body-size limit). Only files that match a real catalog SKU are uploaded.
export default function PullImages() {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 0 });
  const [res, setRes] = useState<Result | null>(null);

  const setRef = (el: HTMLInputElement | null) => {
    ref.current = el;
    if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); } // folder picker
  };

  const run = async (fileList: FileList) => {
    const imgs = [...fileList]
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!imgs.length) { setRes({ updated: 0, unmatched: [], errors: ["לא נמצאו קבצי תמונה בתיקייה"] }); return; }

    // Group by base SKU, stripping only a trailing _<number> angle; first file of a group = primary.
    const byKey = new Map<string, Row[]>();
    for (const file of imgs) {
      const base = file.name.replace(/\.[^.]+$/, "").replace(/_\d+$/, "");
      const arr = byKey.get(base) ?? byKey.set(base, []).get(base)!;
      arr.push({ file, sku: base, primary: arr.length === 0 });
    }
    const rows = [...byKey.values()].flat();

    setBusy(true); setRes(null); setProg({ done: 0, total: rows.length });
    const sb = supabaseBrowser();
    let updated = 0;
    const unmatched = new Set<string>();
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const { file, sku, primary } = rows[i];
      try {
        const prep = await prepareImagePull(file.name);
        if (prep.error) errors.push(prep.error);
        else if (prep.unmatched) unmatched.add(sku);
        else if (prep.token && prep.path && prep.publicUrl) {
          const up = await sb.storage.from(BUCKET).uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined });
          if (up.error) errors.push(`${sku}: ${up.error.message}`);
          else {
            const c = await commitImagePull(sku, prep.publicUrl, primary);
            if (c.error) errors.push(c.error); else updated++;
          }
        }
      } catch (e) { errors.push(`${sku}: ${(e as Error).message}`); }
      setProg({ done: i + 1, total: rows.length });
    }

    setBusy(false);
    setRes({ updated, unmatched: [...unmatched], errors });
    if (ref.current) ref.current.value = "";
  };

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ color: "var(--ink-muted)", fontSize: 14, margin: "0 0 8px" }}>
        בחר תיקייה מקומית של תמונות (<b>שם הקובץ = מק״ט</b>, png/jpg). יועלו <b>רק</b> תמונות שתואמות מק״ט אמיתי בקטלוג — השאר יידלגו. זוויות נוספות: <code>מקט_2</code>, <code>מקט_3</code>.
      </p>
      <input ref={setRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { const f = e.target.files; if (f && f.length) run(f); }} />
      <button onClick={() => ref.current?.click()} disabled={busy} className="btn btn-primary">
        {busy ? `מעלה… ${prog.done}/${prog.total}` : "בחירת תיקייה ומשיכת תמונות"}
      </button>
      {res && (
        <div style={{ marginTop: 10, display: "grid", gap: 6, maxWidth: 520 }}>
          <span className="chip chip-ok" style={{ width: "fit-content" }}>{res.updated} תמונות עודכנו ✓</span>
          {res.unmatched.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", color: "var(--ink-muted)", fontSize: 13 }}>{res.unmatched.length} קבצים ללא מק״ט תואם (דולגו)</summary>
              <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4, wordBreak: "break-word" }}>{res.unmatched.join(", ")}</div>
            </details>
          )}
          {res.errors.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", color: "var(--danger)", fontSize: 13 }}>{res.errors.length} שגיאות</summary>
              <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 4, whiteSpace: "pre-wrap" }}>{res.errors.slice(0, 20).join("\n")}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
