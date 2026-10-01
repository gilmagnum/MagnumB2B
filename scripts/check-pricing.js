// Compares resolvePrices() with the prices on recent real site orders (read-only).
// Each order is priced as of its own IssueDate and line quantities.
//   node scripts/check-pricing.js [orderCount=60] [--active]
import { query, closeAll } from '../bridge/db.js';
import { resolvePrices } from '../bridge/pricing.js';
import { ORDER_DOCUMENT_IDS } from '../bridge/config.js';

const args = process.argv.slice(2);
const count = Number(args.find((a) => !a.startsWith('--'))) || 60;
const activeOnly = args.includes('--active');
const close = (a, b) => Math.abs(a - b) < 0.005;

try {
  const lines = await query(
    `SELECT s.ID AS orderId, s.AccountKey, s.IssueDate, m.ItemKey, m.Quantity, m.Price, m.DiscountPrc
     FROM (SELECT TOP (@n) ID, AccountKey, IssueDate FROM Stock
           WHERE DocumentID = @doc AND ExtraText3 = N'הזמנת אתר' ORDER BY ID DESC) s
     JOIN StockMoves m ON m.StockID = s.ID AND m.Tree IN (0, 1)
     WHERE m.ItemKey NOT IN ('M1001', 'M1002')`,
    { n: count, doc: ORDER_DOCUMENT_IDS.picking },
  );
  const byOrder = Map.groupBy(lines, (l) => l.orderId);
  const stats = { match: 0, priceDiff: 0, discountDiff: 0 };
  const bySource = {};
  const samples = [];
  for (const rows of byOrder.values()) {
    const { AccountKey, IssueDate } = rows[0];
    const quantities = {};
    for (const r of rows) quantities[r.ItemKey.trim()] = (quantities[r.ItemKey.trim()] ?? 0) + r.Quantity;
    const prices = await resolvePrices(AccountKey.trim(), rows.map((r) => r.ItemKey), { date: IssueDate, quantities, activeOnly });
    for (const r of rows) {
      const p = prices.get(r.ItemKey.trim());
      const priceOk = p && close(p.price, r.Price);
      const discOk = p && close(p.discountPrc, r.DiscountPrc);
      const kind = priceOk && discOk ? 'match' : !priceOk ? 'priceDiff' : 'discountDiff';
      stats[kind]++;
      const src = (bySource[p?.source ?? 'none'] ??= { match: 0, miss: 0 });
      src[kind === 'match' ? 'match' : 'miss']++;
      if (kind !== 'match' && samples.length < 12) {
        samples.push({ order: r.orderId, account: AccountKey.trim(), item: r.ItemKey, real: `${r.Price} -${r.DiscountPrc}%`, ours: p ? `${p.price} -${p.discountPrc}% (${p.source})` : 'none' });
      }
    }
  }
  const pct = ((stats.match / lines.length) * 100).toFixed(1);
  console.log(`${lines.length} lines from ${byOrder.size} orders${activeOnly ? ' (Active=1 only)' : ''}: ${pct}% match`, stats);
  console.table(bySource);
  console.table(samples);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeAll();
}
