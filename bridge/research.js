// TEMPORARY one-shot research at bridge start-up (read-only): writes logs/research-<name>.json once,
// so the Claude session can read results without relays. Reply 75 (round 3): warehouse-1 stock with
// produced transfers added back (vBalByStockWH ignores doc 19) - sample + timing of the full map.
import fs from 'node:fs';
import path from 'node:path';
import { query, key } from './db.js';
import { whStockSql, getWarehouseStock, STOCK_WAREHOUSE } from './read.js';

async function wh1Corrected() {
  const started = Date.now();
  // Sample from the latest produced transfers (read by StockID, no StockMoves scan).
  const sample = await query(
    `SELECT DISTINCT TOP 25 m.ItemKey FROM StockMoves m
     WHERE m.StockID IN (SELECT TOP 40 ID FROM Stock WHERE DocumentID = 19 AND Status <> 0 ORDER BY ID DESC)
       AND m.Warehouse = ${STOCK_WAREHOUSE}`,
  );
  const keys = ['K345101_BLACK', 'K345101_CAMEL', ...sample.map((s) => s.ItemKey.trim())];
  const rows = [];
  for (const k of keys) {
    const [r] = await query(
      `SELECT (SELECT TOP 1 v.BALBYSTOCKWH FROM vBalByStockWH v WHERE v.ItemKey = @k AND v.Warehouse = ${STOCK_WAREHOUSE}) AS viewWh1,
              ${whStockSql('@k')} AS corrected, (SELECT Quantity FROM Items WHERE ItemKey = @k) AS total`,
      { k: key(k) },
    );
    rows.push({ item: k, ...r });
  }
  const t0 = Date.now();
  const map = await getWarehouseStock();
  const mapMs = Date.now() - t0;
  const changed = rows.filter((r) => r.viewWh1 !== r.corrected).length;
  return {
    rows,
    changed,
    mapMs,
    mapSize: map.size,
    mapCheck: keys.slice(0, 5).map((k) => [k, map.get(k)]),
    ms: Date.now() - started,
  };
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['wh1-corrected-2', wh1Corrected]];
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
