// Dumps the real column definitions of the tables the bridge touches, plus the
// latest real agent orders (one simple, one with matrix lines), into schema-dump/.
// Read-only (magnum_ro). Use it to verify the write recipe against real documents.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ORDER_DOCUMENT_IDS } from '../bridge/config.js';
import { query, closeAll } from '../bridge/db.js';
import { getTableColumns, getOrder } from '../bridge/read.js';

const TABLES = [
  'Stock', 'StockMoves', 'Accounts', 'Items', 'ExtraNotes', 'ExtraNoteNames', 'ExtraSums', 'ExtraSumNames',
  'PriceLists', 'SpecialPrices', 'Discounts', 'IMatrixItems', 'WhSummInv', 'AgentWarehouseNames',
];

const outDir = path.join(ROOT, 'schema-dump');
fs.mkdirSync(outDir, { recursive: true });
const save = (name, data) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2), 'utf8');

try {
  const schema = {};
  for (const table of TABLES) {
    schema[table] = await getTableColumns(table);
    console.log(`${table.padEnd(22)} ${schema[table].length || 'NOT FOUND / no permission'}`);
  }
  save('columns.json', schema);

  const latest = (matrix) =>
    query(
      `SELECT TOP 1 s.ID FROM Stock s
       WHERE s.DocumentID = @doc
         AND ${matrix ? '' : 'NOT '}EXISTS (SELECT 1 FROM StockMoves m WHERE m.StockID = s.ID AND m.Tree = @child)
       ORDER BY s.ID DESC`,
      { doc: ORDER_DOCUMENT_IDS.picking, child: 2 },
    );
  for (const [name, matrix] of [['sample-order-simple.json', false], ['sample-order-matrix.json', true]]) {
    const [row] = await latest(matrix);
    if (!row) {
      console.log(`${name}: no matching order found`);
      continue;
    }
    save(name, await getOrder(row.ID));
    console.log(`${name}: Stock.ID ${row.ID}`);
  }
  console.log(`\nWritten to ${outDir}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeAll();
}
