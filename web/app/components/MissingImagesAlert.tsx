"use client";
import { useEffect, useState } from "react";
import { countMissingImages } from "../settings/pull-images-actions";

// Warn a manager when shown products are missing an image, so they know to pull some in.
// (Matrix size cells are excluded — their photo comes from the parent model.)
export default function MissingImagesAlert() {
  const [state, setState] = useState<{ total: number; sample: string[] } | null>(null);

  useEffect(() => {
    let alive = true;
    countMissingImages()
      .then((r) => { if (alive && !("error" in r)) setState(r); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!state || state.total === 0) return null;
  return (
    <div style={{ margin: "8px 0" }}>
      <span className="chip chip-warn" style={{ fontWeight: 700 }}>⚠ {state.total} מק״טים ללא תמונה</span>
      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: "pointer", color: "var(--ink-muted)", fontSize: 13 }}>הצג דוגמאות</summary>
        <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4, wordBreak: "break-word" }}>
          {state.sample.join(", ")}{state.total > state.sample.length ? " …" : ""}
        </div>
      </details>
    </div>
  );
}
