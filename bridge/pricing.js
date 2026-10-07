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
 * options.activeOnly: only special-price rows with Active=1. Off by default: the
 *                 current 8.55 price of chain 11724 sits on an Active=0 row and is charged.
 *
 * Returns Map<itemKey, { price, discountPrc, source, priceListNumber }>
 */
// Gil (reply 72, final): a VALID special always wins - 'always' is the default. 'newer' (special only if
// dated on/after the latest list change) stays available via PRICE_SPECIAL_RULE=newer.
// Research-only rules (reply 73): 'active0' = only header rows with Active = 0, 'minamt0' = only rows
// with MinAmount = 0 (the charged 11724 8.55 row has both; ignored rows have Active = 1, MinAmount = 1).
const SPECIAL_RULES = ['always', 'newer', 'active0', 'minamt0'];
const SPECIAL_RULE = SPECIAL_RULES.includes(process.env.PRICE_SPECIAL_RULE) ? process.env.PRICE_SPECIAL_RULE : 'always';

const PRICE_BATCH = 500;

export async function resolvePrices(
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
      const part = await resolvePrices(accountKey, keys.slice(i, i + PRICE_BATCH), { date, quantities, activeOnly, specialRule });
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
  // specialRule 'newer' (optional; default is 'always', reply 72): a special counts only if its ValidDate is on/after the
  // item's latest price-list change (DatF) - a list update supersedes older specials. Matches
  // Hashavshevet's own price pull on 117144 (10505: 2017-19 specials ignored after the 2024-09 list
  // change) and the 11724 8.55 special (2024-09-22, after the 2024-08-29 list).
  const ruleSql = {
    always: '',
    newer: "AND h.ValidDate >= ISNULL(COALESCE(lp.DatF, lpf.DatF), '19000101')",
    active0: 'AND h.Active = 0',
    minamt0: 'AND ISNULL(h.MinAmount, 0) = 0',
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
