// Compares resolvePrices() with the prices on recent real site orders (read-only).
//   node scripts/check-pricing.js [orderCount=40]
import { query, closeAll } from '../bridge/db.js';
import { resolvePrices } from '../bridge/pricing.js';
import { ORDER_DOCUMENT_ID } from '../bridge/config.js';

const count = Number(process.argv[2]) || 40;
const close = (a, b) => Math.abs(a - b) < 0.005;

try {
  const lines = await query(
    `SELECT s.ID AS orderId, s.AccountKey, m.ItemKey, m.Price, m.DiscountPrc
     FROM (SELECT TOP (@n) ID, AccountKey FROM Stock
           WHERE DocumentID = @doc AND ExtraText3 = N'הזמנת אתר' ORDER BY ID DESC) s
     JOIN StockMoves m ON m.StockID = s.ID AND m.Tree IN (0, 1)
     WHERE m.ItemKey NOT IN ('M1001', 'M1002')`,
    { n: count, doc: ORDER_DOCUMENT_ID },
  );
  const byAccount = Map.groupBy(lines, (l) => l.AccountKey.trim());
  const stats = { match: 0, priceDiff: 0, discountDiff: 0 };
  const samples = [];
  for (const [account, rows] of byAccount) {
    const prices = await resolvePrices(account, rows.map((r) => r.ItemKey));
    for (const r of rows) {
      const p = prices.get(r.ItemKey.trim());
      const priceOk = p && close(p.price, r.Price);
      const discOk = p && close(p.discountPrc, r.DiscountPrc);
      const kind = priceOk && discOk ? 'match' : !priceOk ? 'priceDiff' : 'discountDiff';
      stats[kind]++;
      if (kind !== 'match' && samples.length < 12) {
        samples.push({ order: r.orderId, account, item: r.ItemKey, real: `${r.Price} -${r.DiscountPrc}%`, ours: p ? `${p.price} -${p.discountPrc}% (${p.source})` : 'none' });
      }
    }
  }
  console.log(`${lines.length} lines from ${count} orders, ${byAccount.size} accounts:`, stats);
  console.table(samples);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeAll();
}
