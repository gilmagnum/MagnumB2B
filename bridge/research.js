// TEMPORARY one-shot research at bridge start-up (read-only): writes logs/research-<name>.json once,
// so the Claude session can read results without relays. Reply 75 (round 2): K345101_BLACK shows 30
// in vBalByStockWH warehouse 1 (and -23 in 10830), Gil reads 0 in "מחסן 1". How does the view count,
// what moved the item, and what is open on orders?
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

const ITEMS = ['K345101_BLACK', 'K345101_CAMEL'];

async function wh1Moves() {
  const started = Date.now();
  const out = {};
  out.viewDefinition = await tryQuery("SELECT OBJECT_DEFINITION(OBJECT_ID('vBalByStockWH')) AS def");
  out.warehouseObjects = await tryQuery(
    `SELECT o.name, o.type_desc, SUM(p.rows) AS rowsApprox FROM sys.objects o
     LEFT JOIN sys.partitions p ON p.object_id = o.object_id AND p.index_id IN (0, 1)
     WHERE o.type IN ('U', 'V') AND (o.name LIKE '%Store%' OR o.name LIKE '%Warehouse%' OR o.name LIKE '%Machsan%' OR o.name LIKE '%WH%')
     GROUP BY o.name, o.type_desc ORDER BY o.name`,
  );
  out.warehouseNames = await tryQuery('SELECT * FROM AgentWarehouseNames ORDER BY ID');
  out.items = {};
  for (const item of ITEMS) {
    const k = { k: key(item) };
    out.items[item] = {
      byWarehouse: await tryQuery('SELECT Warehouse, BALBYSTOCKWH AS qty FROM vBalByStockWH WHERE ItemKey = @k ORDER BY Warehouse', k),
      quantity: await tryQuery('SELECT Quantity FROM Items WHERE ItemKey = @k', k),
      movesByDoc: await tryQuery(
        `SELECT m.Warehouse, s.TransStore, s.Warehouse AS headerWarehouse, s.DocumentID, d.DocName, s.Status,
                COUNT(*) AS lines, SUM(m.Quantity) AS qty, MIN(s.IssueDate) AS firstDate, MAX(s.IssueDate) AS lastDate
         FROM StockMoves m JOIN Stock s ON s.ID = m.StockID LEFT JOIN DocumentsDef d ON d.DocumentID = s.DocumentID
         WHERE m.ItemKey = @k
         GROUP BY m.Warehouse, s.TransStore, s.Warehouse, s.DocumentID, d.DocName, s.Status
         ORDER BY s.DocumentID, s.Status, m.Warehouse`,
        k,
      ),
      lastMoves: await tryQuery(
        `SELECT TOP 25 s.ID, s.DocNumber, s.DocumentID, s.Status, s.IssueDate, s.AccountKey, s.Warehouse AS hWh, s.TransStore,
                m.Warehouse AS lineWh, m.Quantity, s.ExtraText3
         FROM StockMoves m JOIN Stock s ON s.ID = m.StockID WHERE m.ItemKey = @k ORDER BY s.ID DESC`,
        k,
      ),
    };
  }
  // How documents of each type affect stock in Hashavshevet's definitions (sign / which warehouse).
  out.documentsDef = await tryQuery(
    `SELECT * FROM DocumentsDef WHERE DocumentID IN (
       SELECT DISTINCT s.DocumentID FROM StockMoves m JOIN Stock s ON s.ID = m.StockID WHERE m.ItemKey IN ('K345101_BLACK', 'K345101_CAMEL'))`,
  );
  out.ms = Date.now() - started;
  return out;
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['wh1-moves', wh1Moves]];
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
