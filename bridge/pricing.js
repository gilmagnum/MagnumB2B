import { query, key, sql } from './db.js';

const trim = (v) => (typeof v === 'string' ? v.trim() : v);

/**
 * Price + discount for a customer, per item, as of `date` (default today):
 *   1. special  = customer special price ("מחיר מיוחד ללקוח"): header row in SpecialPrices
 *                 (AccountKey, ItemKey, ValidDate..EndDate) + price/discount in
 *                 SpecialPricesMoves (SPID = SpecialPrices.ID, Price, DiscountPrc, MinQuantity).
 *                 Looked up on the customer and on its central account (Accounts.AssignKey,
 *                 "חשבון מרכז" - chains); the customer's own row wins, then the latest ValidDate,
 *                 then the highest MinQuantity tier <= quantity.
 *                 SpecialPrices.Price itself is always 0 - the price lives in the moves.
 *   2. list     = price list from the customer's Discounts row (default list 1 = Items.Price),
 *                 latest DatF <= date, minus Discounts % for (AccountKey, Items.DiscountCode).
 *
 * options.quantities: { [itemKey]: units } for quantity tiers (default 0).
 * options.activeOnly: only rows with Active=1 (diagnostics; Active=1 actually means NOT active).
 *
 * Returns Map<itemKey, { price, discountPrc, source, priceListNumber }>
 */
// Special price = valid AND active (Gil, replies 72/73): ValidDate <= date <= EndDate and the
// "פעיל" flag on. In the DB the flag is SpecialPrices.Active stored INVERTED: Active = 0 is פעיל
// (11724 x BR11506 8.55 is charged with Active = 0; 10505's 2017-19 specials have Active = 1 and
// Hashavshevet ignores them on 117144). Backtest (reply 60, 5,319 lines of 300 Hashavshevet docs):
// 'valid' 89.4% (agent orders 94.4%, 117144 12/12) vs 'always' 84.6%, 'newer' 89.1%.
// PRICE_SPECIAL_RULE=always|newer selects an older rule.
const SPECIAL_RULES = ['valid', 'always', 'newer'];
const SPECIAL_RULE = SPECIAL_RULES.includes(process.env.PRICE_SPECIAL_RULE) ? process.env.PRICE_SPECIAL_RULE : 'valid';

const PRICE_BATCH = 500;

export async function resolvePricesSql(
  accountKey,
  itemKeys,
  { date = new Date(), quantities = {}, activeOnly = false, specialRule = SPECIAL_RULE } = {},
) {
  const keys = [...new Set(itemKeys.map((k) => String(k).trim()))];
  if (!keys.length) return new Map();
  // SQL Server allows 2,100 parameters per request (2 per item): resolve big lists in batches.
  if (keys.length > PRICE_BATCH) {
    const out = new Map();
    for (let i = 0; i < keys.length; i += PRICE_BATCH) {
      const part = await resolvePricesSql(accountKey, keys.slice(i, i + PRICE_BATCH), { date, quantities, activeOnly, specialRule });
      for (const [k, v] of part) out.set(k, v);
    }
    return out;
  }
  const params = {
    acc: key(accountKey),
    asOf: { type: sql.DateTime, value: date },
    ...Object.fromEntries(keys.map((k, i) => [`k${i}`, key(k)])),
    ...Object.fromEntries(keys.map((k, i) => [`q${i}`, { type: sql.Float, value: Number(quantities[k] ?? 0) }])),
  };
  const values = keys.map((_, i) => `(@k${i}, @q${i})`).join(',');
  const active = activeOnly ? 'AND h.Active = 1 AND m.Active = 1' : '';

  // Matrix cells (reply 68/71): special prices are often defined on the MODEL only, so a cell falls
  // back to its father (IMatrixItems): the cell's own special > the father's special > discount by
  // the cell's code (else the father's) > the cell's list price (else the father's).
  const ruleSql = {
    valid: 'AND h.Active = 0', // = פעיל (inverted flag, see SPECIAL_RULE)
    always: '',
    newer: "AND h.ValidDate >= ISNULL(COALESCE(lp.DatF, lpf.DatF), '19000101')", // list change supersedes older specials
  }[specialRule] ?? '';
  const rows = await query(
    `SELECT i.ItemKey, i.Price AS itemPrice, d.PriceListNumber, d.DiscountPrc,
       COALESCE(lp.Price, lpf.Price) AS listPrice,
       sp.Price AS specialPrice, sp.DiscountPrc AS specialDiscount, sp.AccountKey AS specialAccount,
       sp.ItemKey AS specialItem
     FROM (VALUES ${values}) AS want(ItemKey, Qty)
     JOIN Items i ON i.ItemKey = want.ItemKey
     OUTER APPLY (SELECT TOP 1 FItemKey AS father FROM IMatrixItems WHERE ItemKey = i.ItemKey) f
     OUTER APPLY (SELECT COALESCE(NULLIF(LTRIM(RTRIM(i.DiscountCode)), ''),
                    (SELECT NULLIF(LTRIM(RTRIM(DiscountCode)), '') FROM Items WHERE ItemKey = f.father)) AS code) dc
     OUTER APPLY (SELECT NULLIF(LTRIM(RTRIM(AssignKey)), '') AS central FROM Accounts WHERE AccountKey = @acc) a
     OUTER APPLY (SELECT TOP 1 PriceListNumber, DiscountPrc FROM Discounts
                  WHERE AccountKey = @acc AND ItemDiscountCode = dc.code ORDER BY ID DESC) d
     OUTER APPLY (SELECT TOP 1 p.Price, p.DatF FROM PriceLists p
                  WHERE p.ItemKey = i.ItemKey AND p.PriceListNumber = ISNULL(d.PriceListNumber, 1) AND p.DatF <= @asOf
                  ORDER BY p.DatF DESC, p.ID DESC) lp
     OUTER APPLY (SELECT TOP 1 p.Price, p.DatF FROM PriceLists p
                  WHERE p.ItemKey = f.father AND p.PriceListNumber = ISNULL(d.PriceListNumber, 1) AND p.DatF <= @asOf
                  ORDER BY p.DatF DESC, p.ID DESC) lpf
     OUTER APPLY (SELECT TOP 1 m.Price, m.DiscountPrc, h.AccountKey, h.ItemKey
                  FROM SpecialPrices h JOIN SpecialPricesMoves m ON m.SPID = h.ID
                  WHERE h.AccountKey IN (@acc, a.central) AND h.ItemKey IN (i.ItemKey, f.father)
                    AND @asOf >= h.ValidDate AND @asOf < h.EndDate + 1
                    ${ruleSql}
                    AND m.Price > 0 AND ISNULL(m.MinQuantity, 0) <= want.Qty ${active}
                  ORDER BY CASE WHEN h.ItemKey = i.ItemKey THEN 0 ELSE 1 END,
                           CASE WHEN h.AccountKey = @acc THEN 0 ELSE 1 END, h.ValidDate DESC,
                           m.MinQuantity DESC, h.ID DESC) sp`,
    params,
  );

  return new Map(
    rows.map((r) => {
      const priceListNumber = r.PriceListNumber ?? 1;
      if (r.specialPrice > 0) {
        const source = trim(r.specialAccount) === String(accountKey).trim() ? 'special' : 'special-central';
        const fromModel = trim(r.specialItem) !== trim(r.ItemKey);
        return [trim(r.ItemKey), {
          price: r.specialPrice, discountPrc: r.specialDiscount ?? 0, source, priceListNumber,
          ...(fromModel && { specialFrom: trim(r.specialItem) }),
        }];
      }
      const price = r.listPrice > 0 ? r.listPrice : r.itemPrice;
      return [
        trim(r.ItemKey),
        { price, discountPrc: r.DiscountPrc ?? 0, source: r.PriceListNumber == null ? 'base' : 'discount', priceListNumber },
      ];
    }),
  );
}

// --- cache-first pricing (reply 81: the DB server is a shared office PC) ------------------------
// Same rules as resolvePricesSql, resolved in memory:
//   global (background, bg pool, every 60 min): Items DiscountCode/Price, IMatrixItems fathers,
//     PriceLists list 1 history;
//   per account (first request, then 30 min): Accounts.AssignKey, Discounts, SpecialPrices+Moves
//     of the account and its central account.
// A bulk /prices call for a known account is pure memory. Fallback to SQL (same result) for: items
// not in the cache (created since the load), customers on a price list other than 1, activeOnly,
// and requests made before the global cache is loaded.
const GLOBAL_TTL = 60 * 60_000;
const ACCOUNT_TTL = 30 * 60_000;
const DAY = 24 * 60 * 60_000;
const norm = (v) => (typeof v === 'string' ? v.trim() : v) || null;
const codeKey = (v) => (norm(v) ? norm(v).toUpperCase() : null);

let globalCache;
let globalPending;
function loadGlobal() {
  globalPending ??= (async () => {
    const started = Date.now();
    try {
      const items = await query('SELECT ItemKey, DiscountCode, Price FROM Items', {}, 'bg');
      const fathers = await query('SELECT ItemKey, FItemKey FROM IMatrixItems', {}, 'bg');
      const lists = await query('SELECT ItemKey, Price, DatF, ID FROM PriceLists WHERE PriceListNumber = 1', {}, 'bg');
      const g = { at: Date.now(), items: new Map(), fathers: new Map(), list1: new Map() };
      for (const r of items) g.items.set(norm(r.ItemKey), { code: codeKey(r.DiscountCode), price: r.Price });
      for (const r of fathers) g.fathers.set(norm(r.ItemKey), norm(r.FItemKey));
      for (const r of lists) {
        const k = norm(r.ItemKey);
        if (!g.list1.has(k)) g.list1.set(k, []);
        g.list1.get(k).push({ price: r.Price, datF: r.DatF, id: r.ID });
      }
      for (const rows of g.list1.values()) rows.sort((a, b) => b.datF - a.datF || b.id - a.id);
      globalCache = g;
      console.log(`price cache: ${g.items.size} items, ${lists.length} list-1 prices, ${Date.now() - started}ms`);
      return g;
    } finally {
      globalPending = undefined;
    }
  })();
  return globalPending;
}

const accountCache = new Map();
const accountPending = new Map();
function loadAccount(acc) {
  if (!accountPending.has(acc)) {
    accountPending.set(acc, (async () => {
      try {
        const [a] = await query('SELECT NULLIF(LTRIM(RTRIM(AssignKey)), \'\') AS central FROM Accounts WHERE AccountKey = @acc', { acc: key(acc) });
        const central = norm(a?.central);
        const discounts = new Map();
        const drows = await query('SELECT ItemDiscountCode, PriceListNumber, DiscountPrc, ID FROM Discounts WHERE AccountKey = @acc', { acc: key(acc) });
        for (const d of drows.sort((x, y) => x.ID - y.ID)) discounts.set(codeKey(d.ItemDiscountCode), d); // highest ID wins
        const srows = await query(
          `SELECT h.ID, h.AccountKey, h.ItemKey, h.ValidDate, h.EndDate, h.Active, m.Price, m.DiscountPrc, m.MinQuantity
           FROM SpecialPrices h JOIN SpecialPricesMoves m ON m.SPID = h.ID
           WHERE h.AccountKey IN (@acc, @central) AND m.Price > 0`,
          { acc: key(acc), central: key(central ?? acc) },
        );
        const specials = new Map();
        for (const s of srows) {
          const k = norm(s.ItemKey);
          if (!specials.has(k)) specials.set(k, []);
          specials.get(k).push({ ...s, AccountKey: norm(s.AccountKey), ItemKey: k });
        }
        const entry = { at: Date.now(), central, discounts, specials };
        accountCache.set(acc, entry);
        return entry;
      } finally {
        accountPending.delete(acc);
      }
    })());
  }
  return accountPending.get(acc);
}

// Pure: one item's price from the cached data (null = needs the SQL path). Exported for tests.
export function resolveFromCache(g, acct, accountKey, itemKey, qty, date, specialRule) {
  const it = g.items.get(itemKey);
  if (!it) return null;
  const father = g.fathers.get(itemKey);
  const fi = father ? g.items.get(father) : undefined;
  const code = it.code ?? fi?.code ?? null;
  const d = code ? acct.discounts.get(code) : undefined;
  if ((d?.PriceListNumber ?? 1) !== 1) return null;
  const latest = (rows) => rows?.find((r) => r.datF <= date);
  const lp = latest(g.list1.get(itemKey));
  const lpf = father ? latest(g.list1.get(father)) : undefined;
  const listPrice = lp ? lp.price : lpf ? lpf.price : null;
  const listDatF = lp?.datF ?? lpf?.datF ?? new Date(0);
  const t = date.getTime();
  const candidates = [...(acct.specials.get(itemKey) ?? []), ...(father ? acct.specials.get(father) ?? [] : [])].filter(
    (s) => s.ValidDate && s.EndDate && s.ValidDate.getTime() <= t && t < s.EndDate.getTime() + DAY
      && s.Price > 0 && (s.MinQuantity ?? 0) <= qty
      && (specialRule === 'valid' ? s.Active === 0 : specialRule === 'newer' ? s.ValidDate >= listDatF : true),
  );
  candidates.sort((a, b) => (a.ItemKey === itemKey ? 0 : 1) - (b.ItemKey === itemKey ? 0 : 1)
    || (a.AccountKey === accountKey ? 0 : 1) - (b.AccountKey === accountKey ? 0 : 1)
    || b.ValidDate - a.ValidDate || (b.MinQuantity ?? 0) - (a.MinQuantity ?? 0) || b.ID - a.ID);
  const sp = candidates[0];
  if (sp) {
    return {
      price: sp.Price, discountPrc: sp.DiscountPrc ?? 0, source: sp.AccountKey === accountKey ? 'special' : 'special-central',
      priceListNumber: d?.PriceListNumber ?? 1, ...(sp.ItemKey !== itemKey && { specialFrom: sp.ItemKey }),
    };
  }
  const price = listPrice > 0 ? listPrice : it.price;
  return { price, discountPrc: d?.DiscountPrc ?? 0, source: d ? 'discount' : 'base', priceListNumber: d?.PriceListNumber ?? 1 };
}

export async function resolvePrices(accountKey, itemKeys, opts = {}) {
  const { date = new Date(), quantities = {}, activeOnly = false, specialRule = SPECIAL_RULE } = opts;
  const keys = [...new Set(itemKeys.map((k) => String(k).trim()))];
  if (!keys.length) return new Map();
  const acc = String(accountKey).trim();
  // Global cache: stale-while-revalidate; before the first load, use SQL (and start the load).
  const gAge = globalCache ? Date.now() - globalCache.at : Infinity;
  if (gAge >= GLOBAL_TTL) loadGlobal().catch((err) => console.error(`price cache load failed: ${err.message}`));
  if (!globalCache || activeOnly) return resolvePricesSql(accountKey, keys, opts);
  let acct = accountCache.get(acc);
  if (!acct) acct = await loadAccount(acc);
  else if (Date.now() - acct.at >= ACCOUNT_TTL) loadAccount(acc).catch(() => {});
  const out = new Map();
  const missing = [];
  for (const k of keys) {
    const r = resolveFromCache(globalCache, acct, acc, k, Number(quantities[k] ?? 0), date, specialRule);
    if (r) out.set(k, r);
    else missing.push(k); // new item or a non-default price list -> SQL
  }
  if (missing.length) {
    const sqlPart = await resolvePricesSql(accountKey, missing, opts);
    for (const [k, v] of sqlPart) out.set(k, v);
  }
  return out;
}

// Warm the global price cache (server start-up).
export const warmPriceCache = () => loadGlobal();
