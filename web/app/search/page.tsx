"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase/browser";
import type { CatalogItem } from "../../lib/supabase";
import CatalogView from "../components/CatalogView";
import { soldOutMatrixParents } from "../order-actions";

function SearchView() {
  const initial = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [soldOut, setSoldOut] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fully sold-out matrix/carton parents, so the gate hides them here too (like the catalog pages).
  useEffect(() => { soldOutMatrixParents().then((ks) => setSoldOut(new Set(ks))).catch(() => {}); }, []);

  const run = useCallback(async (raw: string) => {
    const term = raw.replace(/[,()*%]/g, " ").trim();
    if (term.length < 2) { setItems([]); setSearched(false); return; }
    setLoading(true);
    // Dynamic search across name, SKU, brand, barcode.
    const { data } = await supabaseBrowser()
      .from("items")
      .select("itemkey,item_name,category_main,category_sub,brand,season,group_name,price,per_carton,per_bundle,image_url,shown_on_site,matrix_flag,is_carton_size_item,ruler_code,stock,ignore_stock")
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

  const cats = (() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.category_main) m.set(i.category_main, (m.get(i.category_main) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  })();

  // Tag matrix/carton parents with an aggregate stock (0 = sold out) so the ordering gate can hide them.
  const shownItems = items.map((i) =>
    (i.matrix_flag || i.is_carton_size_item) ? { ...i, variant_stock: soldOut.has(i.itemkey) ? 0 : 1 } : i);

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
          : <CatalogView items={shownItems} allCategories={cats} hideSearch heading="" />}
    </>
  );
}

export default function SearchPage() {
  return <Suspense><SearchView /></Suspense>;
}
