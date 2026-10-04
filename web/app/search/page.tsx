"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase/browser";
import type { CatalogItem } from "../../lib/supabase";
import ProductGrid from "../components/ProductGrid";

function SearchView() {
  const initial = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (raw: string) => {
    const term = raw.replace(/[,()*%]/g, " ").trim();
    if (term.length < 2) { setItems([]); setSearched(false); return; }
    setLoading(true);
    // Dynamic search across name, SKU, brand, barcode.
    const { data } = await supabaseBrowser()
      .from("items")
      .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,shown_on_site,matrix_flag,is_carton_size_item,ruler_code")
      .eq("shown_on_site", true)
      .or(`item_name.ilike.%${term}%,itemkey.ilike.%${term}%,brand.ilike.%${term}%,barcode.ilike.%${term}%`)
      .order("item_seq", { ascending: false, nullsFirst: false })
      .order("image_url", { ascending: false, nullsFirst: false })
      .order("itemkey", { ascending: false })
      .limit(200);
    setItems((data ?? []) as CatalogItem[]);
    setLoading(false); setSearched(true);
  }, []);

  // Debounced live search as you type.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(q), 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, run]);

  return (
    <>
      <h1>חיפוש מוצרים</h1>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש לפי שם / מק״ט / מותג / ברקוד…" className="input"
        style={{ maxWidth: 480, margin: "4px 0 16px" }} />
      {q.trim().length >= 2 && (
        <p style={{ color: "var(--ink-muted)", fontSize: 13, marginBottom: 12 }}>
          {loading ? "מחפש…" : `${items.length} מוצרים${items.length === 200 ? " (מוצגות 200 הראשונות)" : ""}`}
        </p>
      )}
      {q.trim().length < 2
        ? <p style={{ color: "var(--ink-muted)" }}>הקלד לפחות 2 תווים.</p>
        : searched && items.length === 0 && !loading
          ? <p style={{ color: "var(--ink-muted)" }}>לא נמצאו מוצרים.</p>
          : <ProductGrid items={items} />}
    </>
  );
}

export default function SearchPage() {
  return <Suspense><SearchView /></Suspense>;
}
