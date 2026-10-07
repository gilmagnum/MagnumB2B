// TEMPORARY one-shot research (read-only), run 2 minutes after start-up so it never competes with the
// first stock sync. Writes logs/research-<name>.json once. Reply 66: does another Hashavshevet view
// give the warehouse balance WITH transfers (vBalItemWarehouse / VSufItemWarehouse)? And how slow
// are the transfer-adjustment queries, one at a time?
import fs from 'node:fs';
import path from 'node:path';
import { query, key } from './db.js';

const ITEMS = ['K345101_BLACK', 'K345101_CAMEL', 'KD82152_PURPLE', 'BR22611'];

const timed = async (text, params) => {
  const t = Date.now();
  try {
    const rows = await query(text, params);
    return { ms: Date.now() - t, rows: rows.slice(0, 40), count: rows.length };
  } catch (err) {
    return { ms: Date.now() - t, error: err.message };
  }
};

async function stockViews() {
  const out = {};
  out.columns = await timed(
    `SELECT OBJECT_NAME(object_id) AS obj, name FROM sys.columns
     WHERE object_id IN (OBJECT_ID('vBalItemWarehouse'), OBJECT_ID('VSufItemWarehouse'), OBJECT_ID('vBalByStockWH'), OBJECT_ID('VWAREHOUSE'))
     ORDER BY 1, column_id`,
  );
  out.items = {};
  for (const item of ITEMS) {
    const k = { k: key(item) };
    out.items[item] = {
      vBalByStockWH: await timed('SELECT * FROM vBalByStockWH WHERE ItemKey = @k', k),
      vBalItemWarehouse: await timed('SELECT * FROM vBalItemWarehouse WHERE ItemKey = @k', k),
      VSufItemWarehouse: await timed('SELECT * FROM VSufItemWarehouse WHERE ItemKey = @k', k),
    };
  }
  // The transfer-adjustment pieces, one at a time.
  out.transferIds = await timed('SELECT COUNT(*) AS n FROM Stock WHERE DocumentID = 19 AND Status <> 0 AND TransStore <> Warehouse');
  out.transferLinesOneDoc = await timed(
    `SELECT m.ItemKey, m.Warehouse, m.Quantity FROM StockMoves m
     WHERE m.StockID = (SELECT MAX(ID) FROM Stock WHERE DocumentID = 19 AND Status <> 0)`,
  );
  out.transferLines50Docs = await timed(
    `SELECT COUNT(*) AS lines FROM StockMoves m
     WHERE m.StockID IN (SELECT TOP 50 ID FROM Stock WHERE DocumentID = 19 AND Status <> 0 ORDER BY ID DESC)`,
  );
  return out;
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['stock-views', stockViews]];
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
