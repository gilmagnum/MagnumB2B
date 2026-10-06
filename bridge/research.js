// TEMPORARY one-shot research at bridge start-up (read-only, small queries): writes
// logs/research-<name>.json once, so the Claude session can read results without relays.
// Reply 59: (1) per-warehouse stock source, (2) how Hashavshevet keeps an ordered quantity.
import fs from 'node:fs';
import path from 'node:path';
import { query, key } from './db.js';

const SAMPLE_ITEM = 'KD62219_MIX';

async function warehouseStockResearch() {
  return {
    // Tables/views with an item key + a warehouse/store column + a quantity-like column.
    candidates: await query(
      `SELECT o.name AS obj, o.type_desc AS kind, SUM(p.rows) AS rowsApprox,
              STUFF((SELECT ',' + c.name FROM sys.columns c WHERE c.object_id = o.object_id ORDER BY c.column_id FOR XML PATH('')), 1, 1, '') AS cols
       FROM sys.objects o LEFT JOIN sys.partitions p ON p.object_id = o.object_id AND p.index_id IN (0, 1)
       WHERE o.type IN ('U', 'V')
         AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id = o.object_id AND c.name IN ('ItemKey', 'KeF'))
         AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id = o.object_id AND (c.name LIKE '%Ware%' OR c.name LIKE '%Store%' OR c.name LIKE '%Branch%'))
         AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id = o.object_id AND (c.name LIKE '%Quan%' OR c.name LIKE '%Qnt%' OR c.name LIKE '%Stock%'))
       GROUP BY o.name, o.type_desc, o.object_id ORDER BY o.name`,
    ),
    warehouses: await query('SELECT TOP 30 NameID, Name, Sort, Active FROM AgentWarehouseNames ORDER BY NameID'),
    sampleItem: await query('SELECT ItemKey, Quantity, DefaultWarehouse FROM Items WHERE ItemKey = @k', { k: key(SAMPLE_ITEM) }),
    // Movement-based estimate per warehouse for the sample item (issued stock docs only).
    sampleByWarehouse: await query(
      `SELECT m.Warehouse, d.StockInOut, COUNT(*) AS lines, SUM(m.Quantity) AS qty
       FROM StockMoves m JOIN DocumentsDef d ON d.DocumentID = m.DocumentID
       WHERE m.ItemKey = @k AND m.Status = 1 AND ISNULL(d.StockInOut, 0) <> 0
       GROUP BY m.Warehouse, d.StockInOut ORDER BY m.Warehouse, d.StockInOut`,
      { k: key(SAMPLE_ITEM) },
    ),
    stockInOutTypes: await query(
      'SELECT DocumentID, DocName, StockInOut, StockUpdate FROM DocumentsDef WHERE ISNULL(StockInOut, 0) <> 0 ORDER BY DocumentID',
    ),
  };
}

async function orderedQuantityResearch() {
  const recentOrderIds = 'SELECT TOP 800 ID FROM Stock WHERE DocumentID IN (11, 6, 19) ORDER BY ID DESC';
  return {
    // How the quantity-related columns behave on recent order lines (open vs produced).
    usage: await query(
      `SELECT s.DocumentID, s.Status,
              COUNT(*) AS lines,
              SUM(CASE WHEN ISNULL(m.OriginalQnt, 0) <> 0 THEN 1 ELSE 0 END) AS withOriginalQnt,
              SUM(CASE WHEN ISNULL(m.OriginalQnt, 0) <> 0 AND m.OriginalQnt <> m.Quantity THEN 1 ELSE 0 END) AS originalDiffers,
              SUM(CASE WHEN ISNULL(m.CountQuant, 0) <> 0 THEN 1 ELSE 0 END) AS withCountQuant,
              SUM(CASE WHEN ISNULL(m.QuantToCancel, 0) <> 0 THEN 1 ELSE 0 END) AS withQuantToCancel,
              SUM(CASE WHEN ISNULL(m.CancelBalQuant, 0) <> 0 THEN 1 ELSE 0 END) AS withCancelBalQuant,
              SUM(CASE WHEN ISNULL(m.SupplyQuantity, 0) <> m.Quantity THEN 1 ELSE 0 END) AS supplyDiffers,
              SUM(CASE WHEN m.Quantity = 0 THEN 1 ELSE 0 END) AS zeroQty
       FROM StockMoves m JOIN Stock s ON s.ID = m.StockID
       WHERE m.StockID IN (${recentOrderIds}) AND m.Tree IN (0, 1)
       GROUP BY s.DocumentID, s.Status ORDER BY s.DocumentID, s.Status`,
    ),
    // Examples where the original quantity differs from the current one.
    originalExamples: await query(
      `SELECT TOP 15 m.StockID, s.DocumentID, s.Status, m.ItemKey, m.Quantity, m.OriginalQnt, m.OriginalBaseQnt,
              m.SupplyQuantity, m.BaseQuantity, m.CountQuant, m.QuantToCancel, m.CancelBalQuant, m.MoveCancel
       FROM StockMoves m JOIN Stock s ON s.ID = m.StockID
       WHERE m.StockID IN (${recentOrderIds}) AND ISNULL(m.OriginalQnt, 0) <> 0 AND m.OriginalQnt <> m.Quantity
       ORDER BY m.ID DESC`,
    ),
    // Produced documents whose lines supply less than the order line asked for (partial supply).
    partialSupply: await query(
      `SELECT TOP 15 o.StockID AS orderId, o.ItemKey, o.Quantity AS ordered, o.SupplyQuantity AS orderSupplyLeft,
              o.OriginalQnt, m.StockID AS producedId, m.DocumentID AS producedDoc, m.Quantity AS supplied
       FROM StockMoves o JOIN StockMoves m ON m.BaseMoveID = o.ID
       WHERE o.StockID IN (${recentOrderIds}) AND m.Quantity < o.Quantity
       ORDER BY o.ID DESC`,
    ),
  };
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [
    ['warehouse-stock', warehouseStockResearch],
    ['ordered-quantity', orderedQuantityResearch],
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
