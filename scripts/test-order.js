// Test order on the test account (10). Dry run (write, read back, ROLLBACK) unless --commit.
// In a dry run the written rows are diffed column-by-column against a real site order.
//   node scripts/test-order.js [--future] [--item=KEY] [--qty=2] [--unit=bundle|carton]
//                              [--ship=carton:1,pallet:0] [--ref=116993] [--commit]
// After a commit the saved order is read back (magnum_ro) and diffed the same way.
import { read, writeOrder, closeAll } from '../bridge/index.js';
import { TEST_ACCOUNT_KEY } from '../bridge/config.js';

// Never leave a transaction hanging on production: exiting closes the connection, SQL Server rolls back.
setTimeout(() => {
  console.error('TIMEOUT after 90s - exiting (open transaction is rolled back by SQL Server)');
  process.exit(2);
}, 90_000).unref();
const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const commit = args.includes('--commit');
const orderKind = args.includes('--future') ? 'future' : 'picking';
const refId = Number(flag('ref') ?? 116993);

// Values that are expected to differ between two orders.
const PER_ORDER = new Set([
  'ID', 'StockID', 'AccountKey', 'AccountName', 'Address', 'City', 'Phone', 'Osek874', 'ContactMail', 'Agent',
  'TFtal', 'TFtalVat', 'Remarks', 'ValueDate', 'DueDate', 'IssueDate', 'ExpireDate', 'KuDate', 'ExtraText1', 'ExtraText2',
  'ItemKey', 'ItemName', 'Quantity', 'Price', 'OPrice', 'DiscountPrc', 'TftalVat', 'LineNoForSorting', 'LineNum',
  'SupplyQuantity', 'BaseQuantity', 'PurchQuantity', 'DocumentID',
]);
const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.trim() : v);
const empty = (v) => v == null || v === 0 || v === '' || v === false;

function diff(label, ours, ref) {
  const cols = Object.keys(ref).filter((c) => !PER_ORDER.has(c) && norm(ours[c]) !== norm(ref[c]) && !(empty(ours[c]) && empty(ref[c])));
  console.log(`${label}: ${cols.length ? '' : 'no unexpected differences'}`);
  for (const c of cols) console.log(`  ${c.padEnd(20)} ours=${JSON.stringify(norm(ours[c]))}  ref=${JSON.stringify(norm(ref[c]))}`);
}

try {
  log('loading item');
  let item;
  if (flag('item')) {
    item = await read.getItem(flag('item'));
  } else {
    const items = await read.getItems({ shownOnly: true });
    item = items.find((i) => !i.isMatrix && i.perPack > 0 && i.stock >= i.perPack * 2 && i.price > 0);
  }
  if (!item) throw new Error('No suitable item - pass --item=KEY');
  console.log(`Item ${item.itemKey} (${item.name}), bundle=${item.perPack}, carton=${item.perCarton}, stock=${item.stock}`);

  const shipping = Object.fromEntries(
    (flag('ship') ?? 'carton:1,pallet:0').split(',').map((p) => p.split(':')).map(([k, v]) => [k, Number(v)]),
  );
  log('writeOrder start');
  const result = await writeOrder(
    {
      accountKey: TEST_ACCOUNT_KEY,
      orderKind,
      remarks: 'הזמנת בדיקה MagnumB2B - לא לליקוט',
      lines: [{ itemkey: item.itemKey, qty: Number(flag('qty') ?? 2), unit: flag('unit') ?? 'bundle' }],
      shipping,
    },
    { commit },
  );
  log('writeOrder done');
  const { written, ...summary } = result;
  console.log(summary);

  if (written?.error) console.log(`Read-back inside the transaction not available: ${written.error}`);
  const saved = commit ? await read.getOrder(result.orderId) : written;
  if (saved?.header) {
    const ref = await read.getOrder(refId);
    const label = commit ? `Saved ${result.orderId}` : 'Dry run';
    diff(`${label} header vs Stock ${refId}`, saved.header, ref.header);
    diff(`${label} item line vs ${ref.lines[0].ItemKey.trim()}`, saved.lines[0], ref.lines[0]);
    for (const ship of ['M1001', 'M1002']) {
      const ours = saved.lines.find((l) => l.ItemKey.trim() === ship);
      const theirs = ref.lines.find((l) => l.ItemKey.trim() === ship);
      if (ours && theirs) diff(`${label} ${ship} line vs reference ${ship}`, ours, theirs);
      else if (ours || theirs) console.log(`${label}: ${ship} line ${ours ? 'only in ours' : 'only in reference'}`);
    }
    console.log(`${label}: PrintStyle=${saved.header.PrintStyle}, lines=${saved.lines.map((l) => `${l.ItemKey.trim()}x${l.Quantity}@${l.Price}-${l.DiscountPrc}%`).join(', ')}`);
  }
  console.log(commit ? `COMMITTED - Stock.ID ${result.orderId}` : 'DRY RUN - rolled back, nothing was saved.');
} catch (err) {
  console.error(err.code ? `[${err.code}] ${err.message}` : err.message);
  process.exitCode = 1;
} finally {
  await closeAll();
}
