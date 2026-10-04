"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { managerOrAbove } from "../../lib/roles";
import { uploadProductImageAction, setCategoryImageAction } from "../catalog/image-actions";

// Manager+ control to replace the MAIN image of a product or a category.
// Renders nothing for users without permission.
export default function ImageUploader({ kind, id, onDone, compact }: {
  kind: "product" | "category"; id: string; onDone?: (url: string) => void; compact?: boolean;
}) {
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (!user) return;
      const { data } = await supabaseBrowser().from("profiles").select("role").eq("id", user.id).single();
      setAllowed(managerOrAbove(data?.role));
    })();
  }, []);

  if (!allowed) return null;

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    let res;
    if (kind === "product") { fd.set("itemkey", id); res = await uploadProductImageAction({}, fd); }
    else { fd.set("category", id); res = await setCategoryImageAction({}, fd); }
    setBusy(false);
    if (res.ok && res.url) { setMsg({ ok: true, text: "התמונה עודכנה ✓" }); onDone?.(res.url); }
    else setMsg({ ok: false, text: res.error ?? "שגיאה" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div style={{ marginTop: compact ? 6 : 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={(e) => onPick(e.target.files?.[0])} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn btn-sm">
        {busy ? "מעלה…" : kind === "product" ? "החלף תמונת מוצר" : "החלף תמונת קטגוריה"}
      </button>
      {msg && <span className={`chip ${msg.ok ? "chip-ok" : "chip-danger"}`}>{msg.text}</span>}
    </div>
  );
}
