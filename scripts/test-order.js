// Test order on the test account (10). Dry run (write, read back, ROLLBACK) unless --commit.
// In a dry run the written rows are diffed column-by-column against a real site order.
//   node scripts/test-order.js [--future] [--item=KEY] [--ref=116993] [--commit]
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

  log('writeOrder start');
  const result = await writeOrder(
    {
      accountKey: TEST_ACCOUNT_KEY,
      orderKind,
      remarks: 'הזמנת בדיקה MagnumB2B - לא לליקוט',
      lines: [{ itemkey: item.itemKey, qty: 2, unit: 'bundle' }],
      shipping: { carton: 1, pallet: 0 },
    },
    { commit },
  );
  log('writeOrder done');
  const { written, ...summary } = result;
  console.log(summary);

  if (written?.error) console.log(`Read-back inside the transaction not available: ${written.error}`);
  if (written?.header) {
    const ref = await read.getOrder(refId);
    diff(`Header vs Stock ${refId}`, written.header, ref.header);
    diff(`Item line vs ${ref.lines[0].ItemKey}`, written.lines[0], ref.lines[0]);
    const refShip = ref.lines.find((l) => l.ItemKey.trim() === 'M1001');
    if (refShip) diff('M1001 line vs reference M1001', written.lines.find((l) => l.ItemKey.trim() === 'M1001'), refShip);
  }
  console.log(commit ? `COMMITTED - Stock.ID ${result.orderId}` : 'DRY RUN - rolled back, nothing was saved.');
} catch (err) {
  console.error(err.code ? `[${err.code}] ${err.message}` : err.message);
  process.exitCode = 1;
} finally {
  await closeAll();
}
