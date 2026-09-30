import { query, key } from './db.js';

const trim = (v) => (typeof v === 'string' ? v.trim() : v);

/**
 * Price + discount for a customer, per item. Rules verified against ~1,600
 * lines of recent site orders:
 *   base price  = current price (latest DatF <= today) in the price list named
 *                 by the customer's Discounts row, default list 1 (= Items.Price)
 *   discount %  = Discounts row for (AccountKey, Items.DiscountCode), else 0
 *   special     = SpecialPrices row, Active=1, Price>0, today in ValidDate..EndDate
 *                 -> replaces base price, no discount
 * SpecialPrices rows with Price=0 are "חיוב מינימום" markers, not prices.
 *
 * Returns Map<itemKey, { price, discountPrc, source, priceListNumber }>
 */
export async function resolvePrices(accountKey, itemKeys) {
  const keys = [...new Set(itemKeys.map((k) => String(k).trim()))];
  if (!keys.length) return new Map();
  const params = { acc: key(accountKey), ...Object.fromEntries(keys.map((k, i) => [`k${i}`, key(k)])) };
  const inList = keys.map((_, i) => `@k${i}`).join(',');

  const rows = await query(
    `SELECT i.ItemKey, i.Price AS itemPrice, d.PriceListNumber, d.DiscountPrc,
       (SELECT TOP 1 p.Price FROM PriceLists p
         WHERE p.ItemKey = i.ItemKey AND p.PriceListNumber = ISNULL(d.PriceListNumber, 1)
           AND p.DatF <= GETDATE()
         ORDER BY p.DatF DESC, p.ID DESC) AS listPrice,
       (SELECT TOP 1 sp.Price FROM SpecialPrices sp
         WHERE sp.AccountKey = @acc AND sp.ItemKey = i.ItemKey AND sp.Active = 1 AND sp.Price > 0
           AND GETDATE() BETWEEN sp.ValidDate AND sp.EndDate + 1
         ORDER BY sp.ValidDate DESC, sp.ID DESC) AS specialPrice
     FROM Items i
     OUTER APPLY (SELECT TOP 1 PriceListNumber, DiscountPrc FROM Discounts
                  WHERE AccountKey = @acc AND ItemDiscountCode = i.DiscountCode ORDER BY ID DESC) d
     WHERE i.ItemKey IN (${inList})`,
    params,
  );

  return new Map(
    rows.map((r) => {
      const priceListNumber = r.PriceListNumber ?? 1;
      if (r.specialPrice > 0) {
        return [trim(r.ItemKey), { price: r.specialPrice, discountPrc: 0, source: 'special', priceListNumber }];
      }
      const price = r.listPrice > 0 ? r.listPrice : r.itemPrice;
      return [
        trim(r.ItemKey),
        { price, discountPrc: r.DiscountPrc ?? 0, source: r.PriceListNumber == null ? 'base' : 'discount', priceListNumber },
      ];
    }),
  );
}
