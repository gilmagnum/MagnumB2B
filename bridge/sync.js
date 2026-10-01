// Catalog sync: Hashavshevet (magnum12, read-only) -> Supabase (items, item_variants, rulers).
// FULL refresh: upsert every active item by itemkey; items that are no longer active in
// Hashavshevet are marked active=false / shown_on_site=false (never deleted).
// Images, colors (short codes) and categories (app ids) are app-layer data and are not touched.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { read } from './index.js';

const BATCH = 500;

function supabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const keyValue = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !keyValue) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local');
  const headers = { apikey: keyValue, Authorization: `Bearer ${keyValue}`, 'Content-Type': 'application/json' };
  const call = async (method, path, body, extraHeaders = {}) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: { ...headers, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 || method !== 'GET' ? null : res.json();
  };
  return {
    async upsert(table, rows, onConflict) {
      for (let i = 0; i < rows.length; i += BATCH) {
        await call('POST', `${table}?on_conflict=${onConflict}`, rows.slice(i, i + BATCH), {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        });
      }
    },
    async keys(table, column, filter = '') {
      const out = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await call('GET', `${table}?select=${column}${filter}&order=${column}&limit=1000&offset=${offset}`);
        out.push(...page.map((r) => r[column]));
        if (page.length < 1000) return out;
      }
    },
    async patchIn(table, column, values, patch) {
      const quote = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      for (let i = 0; i < values.length; i += 100) {
        const list = encodeURIComponent(`(${values.slice(i, i + 100).map(quote).join(',')})`);
        await call('PATCH', `${table}?${column}=in.${list}`, patch, { Prefer: 'return=minimal' });
      }
    },
  };
}

const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

function toRow(i, matrixKeys, syncedAt) {
  return {
    itemkey: i.itemKey,
    item_name: i.name ?? null,
    foreign_name: i.foreignName || null,
    sort_group: i.sortGroup ?? null,
    price: num(i.price),
    discount_code: i.discountCode || null,
    barcode: i.barCode || null,
    active: true,
    matrix_flag: matrixKeys.has(i.itemKey), // real matrix detection (IMatrixItems), not Items.MatrixFlag
    per_pack: num(i.packQuantity),
    per_carton: num(i.perCarton),
    per_bundle: num(i.perPack), // NOTE: bridge field perPack = ExtraSums SuFID 6 (בחבילה)
    carton_volume: num(i.cartonVolume),
    royalties_pct: num(i.royaltyPrc),
    brand: i.brand ?? null,
    brand_owner: i.brandOwner ?? null,
    brand_group: i.brandGroup ?? null,
    category_main: i.mainCategory ?? null,
    category_sub: i.subCategory ?? null,
    group_name: i.group ?? null,
    season: i.season ?? null,
    ruler_code: i.sizeRulerCode ?? null,
    color: i.color ?? null,
    matrix_size: i.matrixSize ?? null,
    parent_itemkey: i.parentSku ?? null,
    is_color_item: Boolean(i.colorItem),
    is_carton_size_item: Boolean(i.cartonSizeItem),
    category_keds: i.kedsCategory ?? null,
    shown_on_site: Boolean(i.shownOnSite),
    ignore_stock: Boolean(i.ignoreStock),
    synced_at: syncedAt,
  };
}

/**
 * Full catalog refresh. dryRun: read and map only, nothing sent to Supabase.
 * Returns a summary { items, shown, variants, rulers, deactivated, ms }.
 */
export async function syncCatalog({ dryRun = false } = {}) {
  const started = Date.now();
  const syncedAt = new Date().toISOString();
  const [items, cells] = await Promise.all([read.getItems(), read.getAllMatrixCells()]);
  const matrixKeys = new Set(cells.map((c) => c.fatherKey));
  const rows = items.map((i) => toRow(i, matrixKeys, syncedAt));
  const variants = cells.map((c) => ({
    itemkey: c.itemKey,
    parent_itemkey: c.fatherKey,
    line: c.line,
    col: c.col,
    size_label: c.sizeLabel,
    color_label: c.colorLabel,
  }));
  // items.ruler_code references rulers(code): make sure every code exists (name/sizes stay app-layer).
  const rulers = [...new Set(rows.map((r) => r.ruler_code).filter(Boolean))].map((code) => ({ code }));

  const summary = {
    items: rows.length,
    shown: rows.filter((r) => r.shown_on_site).length,
    variants: variants.length,
    rulers: rulers.length,
    deactivated: 0,
    dryRun,
  };
  if (dryRun) return { ...summary, sample: rows.find((r) => r.shown_on_site && r.ruler_code) ?? rows[0], ms: Date.now() - started };

  const db = supabase();
  await db.upsert('rulers', rulers, 'code');
  await db.upsert('items', rows, 'itemkey');
  await db.upsert('item_variants', variants, 'itemkey');

  // Items active in Supabase but no longer active in Hashavshevet -> hide, never delete.
  const current = new Set(rows.map((r) => r.itemkey));
  const stale = (await db.keys('items', 'itemkey', '&active=eq.true')).filter((k) => !current.has(k));
  await db.patchIn('items', 'itemkey', stale, { active: false, shown_on_site: false, synced_at: syncedAt });
  summary.deactivated = stale.length;

  return { ...summary, ms: Date.now() - started };
}
