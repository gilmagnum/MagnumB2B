"use client";
import { useState } from "react";
import { saveImagesDriveUrlAction } from "../admin/actions";

// Settings block: a link to the shared Google-Drive images folder (bulk upload,
// filename = SKU). Superadmin can set/change the URL.
export default function DriveImages({ url: initial, canEdit }: { url: string; canEdit: boolean }) {
  const [url, setUrl] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async () => {
    const fd = new FormData(); fd.set("url", draft);
    const res = await saveImagesDriveUrlAction({}, fd);
    if (res.ok) { setUrl(draft.trim()); setEditing(false); setMsg("נשמר ✓"); setTimeout(() => setMsg(""), 2000); }
    else setMsg(res.error ?? "שגיאה");
  };

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ color: "var(--ink-muted)", fontSize: 14, margin: "0 0 8px" }}>
        עדכון תמונות במרוכז: העלה לתיקיית הדרייב קבצים כאשר <b>שם הקובץ = מק״ט</b> (png/jpg). הסנכרון מושך אותם לאתר.
      </p>
      {url && !editing && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          📁 פתיחת תיקיית התמונות ב-Drive ←
        </a>
      )}
      {!url && !editing && <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>לא הוגדר לינק.</span>}

      {canEdit && !editing && (
        <button onClick={() => { setDraft(url); setEditing(true); }} className="btn btn-sm" style={{ marginInlineStart: 8 }}>
          {url ? "שינוי לינק" : "הגדרת לינק"}
        </button>
      )}
      {canEdit && editing && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://drive.google.com/…" className="input" style={{ minWidth: 280 }} />
          <button onClick={save} className="btn btn-primary btn-sm">שמירה</button>
          <button onClick={() => setEditing(false)} className="btn btn-sm">ביטול</button>
        </div>
      )}
      {msg && <span className="chip chip-ok" style={{ marginInlineStart: 8 }}>{msg}</span>}
    </div>
  );
}
