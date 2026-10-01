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
export async function resolvePrices(accountKey, itemKeys, { date = new Date(), quantities = {}, activeOnly = false } = {}) {
  const keys = [...new Set(itemKeys.map((k) => String(k).trim()))];
  if (!keys.length) return new Map();
  const params = {
    acc: key(accountKey),
    asOf: { type: sql.DateTime, value: date },
    ...Object.fromEntries(keys.map((k, i) => [`k${i}`, key(k)])),
    ...Object.fromEntries(keys.map((k, i) => [`q${i}`, { type: sql.Float, value: Number(quantities[k] ?? 0) }])),
  };
  const values = keys.map((_, i) => `(@k${i}, @q${i})`).join(',');
  const active = activeOnly ? 'AND h.Active = 1 AND m.Active = 1' : '';

  const rows = await query(
    `SELECT i.ItemKey, i.Price AS itemPrice, d.PriceListNumber, d.DiscountPrc,
       (SELECT TOP 1 p.Price FROM PriceLists p
         WHERE p.ItemKey = i.ItemKey AND p.PriceListNumber = ISNULL(d.PriceListNumber, 1) AND p.DatF <= @asOf
         ORDER BY p.DatF DESC, p.ID DESC) AS listPrice,
       sp.Price AS specialPrice, sp.DiscountPrc AS specialDiscount, sp.AccountKey AS specialAccount
     FROM (VALUES ${values}) AS want(ItemKey, Qty)
     JOIN Items i ON i.ItemKey = want.ItemKey
     OUTER APPLY (SELECT NULLIF(LTRIM(RTRIM(AssignKey)), '') AS central FROM Accounts WHERE AccountKey = @acc) a
     OUTER APPLY (SELECT TOP 1 PriceListNumber, DiscountPrc FROM Discounts
                  WHERE AccountKey = @acc AND ItemDiscountCode = i.DiscountCode ORDER BY ID DESC) d
     OUTER APPLY (SELECT TOP 1 m.Price, m.DiscountPrc, h.AccountKey
                  FROM SpecialPrices h JOIN SpecialPricesMoves m ON m.SPID = h.ID
                  WHERE h.AccountKey IN (@acc, a.central) AND h.ItemKey = i.ItemKey
                    AND @asOf >= h.ValidDate AND @asOf < h.EndDate + 1
                    AND m.Price > 0 AND ISNULL(m.MinQuantity, 0) <= want.Qty ${active}
                  ORDER BY CASE WHEN h.AccountKey = @acc THEN 0 ELSE 1 END, h.ValidDate DESC,
                           m.MinQuantity DESC, h.ID DESC) sp`,
    params,
  );

  return new Map(
    rows.map((r) => {
      const priceListNumber = r.PriceListNumber ?? 1;
      if (r.specialPrice > 0) {
        const source = trim(r.specialAccount) === String(accountKey).trim() ? 'special' : 'special-central';
        return [trim(r.ItemKey), { price: r.specialPrice, discountPrc: r.specialDiscount ?? 0, source, priceListNumber }];
      }
      const price = r.listPrice > 0 ? r.listPrice : r.itemPrice;
      return [
        trim(r.ItemKey),
        { price, discountPrc: r.DiscountPrc ?? 0, source: r.PriceListNumber == null ? 'base' : 'discount', priceListNumber },
      ];
    }),
  );
}
