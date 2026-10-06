// TEMPORARY one-shot research at bridge start-up (read-only, small queries): writes
// logs/research-<name>.json once, so the Claude session can read results without relays.
// Reply 59: (1) per-warehouse stock (vBalByStockWH), (2) how Hashavshevet keeps an ordered quantity.
// Every query is bounded and isolated: one failure doesn't lose the others.
import fs from 'node:fs';
import path from 'node:path';
import { query, key } from './db.js';

const tryQuery = async (text, params) => {
  try {
    return await query(text, params);
  } catch (err) {
    return { error: err.message };
  }
};
const idList = (ids) => (ids.length ? ids.map(Number).join(',') : '0');

async function warehouseStock2() {
  const sample = ['KD62219_MIX', 'BR11506', 'MG11129', 'KD62220_MIX', 'BB12103WH'];
  const keys = sample.map((k) => `'${k}'`).join(',');
  return {
    viewColumns: await tryQuery(
      `SELECT c.name, t.name AS type FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
       WHERE c.object_id = OBJECT_ID('vBalByStockWH') ORDER BY c.column_id`,
    ),
    viewDefinition: await tryQuery(`SELECT OBJECT_DEFINITION(OBJECT_ID('vBalByStockWH')) AS def`),
    // Per-warehouse balance vs the item total, for a few known items.
    sampleBalances: await tryQuery(
      `SELECT v.ItemKey, v.Warehouse, v.BALBYSTOCKWH AS balance, v.TransStore, i.Quantity AS itemsQuantity
       FROM vBalByStockWH v JOIN Items i ON i.ItemKey = v.ItemKey
       WHERE v.ItemKey IN (${keys}) ORDER BY v.ItemKey, v.Warehouse`,
    ),
    sampleTotals: await tryQuery(
      `SELECT v.ItemKey, SUM(v.BALBYSTOCKWH) AS sumAllWarehouses, MAX(i.Quantity) AS itemsQuantity
       FROM vBalByStockWH v JOIN Items i ON i.ItemKey = v.ItemKey
       WHERE v.ItemKey IN (${keys}) GROUP BY v.ItemKey`,
    ),
  };
}

async function orderedQuantity2() {
  const recent = await query('SELECT TOP 300 ID, DocumentID, Status FROM Stock WHERE DocumentID IN (11, 6, 19) ORDER BY ID DESC');
  const ids = idList(recent.map((r) => r.ID));
  return {
    orders: recent.length,
    usage: await tryQuery(
      `SELECT m.DocumentID, m.Status, COUNT(*) AS lines,
              SUM(CASE WHEN ISNULL(m.OriginalQnt, 0) <> 0 THEN 1 ELSE 0 END) AS withOriginalQnt,
              SUM(CASE WHEN ISNULL(m.OriginalQnt, 0) <> 0 AND m.OriginalQnt <> m.Quantity THEN 1 ELSE 0 END) AS originalDiffers,
              SUM(CASE WHEN ISNULL(m.CountQuant, 0) <> 0 THEN 1 ELSE 0 END) AS withCountQuant,
              SUM(CASE WHEN ISNULL(m.QuantToCancel, 0) <> 0 THEN 1 ELSE 0 END) AS withQuantToCancel,
              SUM(CASE WHEN ISNULL(m.CancelBalQuant, 0) <> 0 THEN 1 ELSE 0 END) AS withCancelBalQuant,
              SUM(CASE WHEN ISNULL(m.SupplyQuantity, 0) <> m.Quantity THEN 1 ELSE 0 END) AS supplyDiffers,
              SUM(CASE WHEN m.Quantity = 0 THEN 1 ELSE 0 END) AS zeroQty
       FROM StockMoves m WHERE m.StockID IN (${ids}) AND m.Tree IN (0, 1)
       GROUP BY m.DocumentID, m.Status ORDER BY m.DocumentID, m.Status`,
    ),
    originalExamples: await tryQuery(
      `SELECT TOP 15 m.StockID, m.DocumentID, m.Status, m.ItemKey, m.Quantity, m.OriginalQnt, m.OriginalBaseQnt,
              m.SupplyQuantity, m.BaseQuantity, m.CountQuant, m.QuantToCancel, m.CancelBalQuant, m.MoveCancel
       FROM StockMoves m WHERE m.StockID IN (${ids}) AND ISNULL(m.OriginalQnt, 0) <> 0 AND m.OriginalQnt <> m.Quantity
       ORDER BY m.ID DESC`,
    ),
    // The same columns on produced documents made from these orders (partial supply, if any).
    producedFromOrders: await tryQuery(
      `SELECT TOP 20 o.StockID AS orderId, o.ItemKey, o.Quantity AS ordered, o.SupplyQuantity AS orderSupplyLeft,
              o.OriginalQnt AS orderOriginal, m.StockID AS producedId, m.DocumentID AS producedDoc,
              m.Quantity AS supplied, m.OriginalQnt AS producedOriginal, m.BaseQuantity AS producedBase
       FROM StockMoves o JOIN StockMoves m ON m.BaseMoveID = o.ID
       WHERE o.StockID IN (${ids}) AND m.Quantity <> o.Quantity
       ORDER BY o.ID DESC`,
    ),
  };
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [
    ['warehouse-stock-2', warehouseStock2],
    ['ordered-quantity-2', orderedQuantity2],
  ];
  for (const [name, run] of jobs) {
    const file = path.join(logsDir, `research-${name}.json`);
    if (fs.existsSync(file)) continue;
    let out;
    try {
      out = { ok: true, at: new Date().toISOString(), result: await run() };
    } catch (err) {
      out = { ok: false, at: new Date().toISOString(), error: err.message };
    }
    fs.writeFileSync(file, JSON.stringify(out, null, 1), 'utf8');
    log.log(`research written: ${file} (${out.ok ? 'ok' : `error: ${out.error}`})`);
  }
}
