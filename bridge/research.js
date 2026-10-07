// TEMPORARY one-shot research at bridge start-up (read-only): writes logs/research-<name>.json once,
// so the Claude session can read results without relays.
//   wh1-stock (reply 75): app stock vs Hashavshevet's warehouse-1 balance - K345101_BLACK (app 30,
//     Gil reads 0), parents with children, 20 random shown items; own balance, children, other sources.
//   notes-fields (reply 74): which Stock text fields staff fill and what app orders hold.
import fs from 'node:fs';
import path from 'node:path';
import { query, key } from './db.js';
import { getParentStock, STOCK_WAREHOUSE } from './read.js';

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const tryQuery = async (text, params) => {
  try {
    return await query(text, params);
  } catch (err) {
    return { error: err.message };
  }
};

async function describe(itemKey) {
  const k = { k: key(itemKey) };
  const [item] = await query(
    `SELECT ItemKey, ItemName, Quantity, ISNULL(Dumi, 0) AS Dumi,
       (SELECT TOP 1 FItemKey FROM IMatrixItems WHERE ItemKey = @k) AS matrixFather,
       (SELECT COUNT(*) FROM IMatrixItems WHERE FItemKey = @k) AS cells,
       (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = @k AND NoteID = 36) AS parentSkuNote,
       (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = @k AND NoteID = 26) AS cartonFlag,
       (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = @k AND NoteID = 27) AS colorFlag
     FROM Items WHERE ItemKey = @k`,
    k,
  );
  const byWarehouse = await tryQuery('SELECT Warehouse, BALBYSTOCKWH AS qty FROM vBalByStockWH WHERE ItemKey = @k ORDER BY Warehouse', k);
  const noteChildren = await tryQuery(
    `SELECT n.KeF AS child, (SELECT TOP 1 v.BALBYSTOCKWH FROM vBalByStockWH v WHERE v.ItemKey = n.KeF AND v.Warehouse = ${STOCK_WAREHOUSE}) AS wh1
     FROM ExtraNotes n WHERE n.NoteID = 36 AND LTRIM(RTRIM(n.Note)) = @k`,
    k,
  );
  const whSumm = await tryQuery('SELECT * FROM WhSummInv WHERE ItemKey = @k', k);
  const rolled = (await getParentStock([itemKey])).get(trim(itemKey));
  return {
    item,
    ownWh1: Array.isArray(byWarehouse) ? byWarehouse.find((w) => Number(w.Warehouse) === STOCK_WAREHOUSE)?.qty ?? null : byWarehouse,
    appStock: rolled ?? (Array.isArray(byWarehouse) ? byWarehouse.find((w) => Number(w.Warehouse) === STOCK_WAREHOUSE)?.qty ?? 0 : null),
    rolledUp: rolled != null,
    byWarehouse,
    noteChildren,
    whSumm,
  };
}

async function wh1Stock() {
  const started = Date.now();
  const out = { warehouse: STOCK_WAREHOUSE };
  out.warehouses = await tryQuery('SELECT * FROM AgentWarehouseNames');
  out.K345101_BLACK = await describe('K345101_BLACK');
  // Siblings of the example (same model prefix) to see how the family is booked.
  out.family = await tryQuery(
    `SELECT i.ItemKey, (SELECT TOP 1 v.BALBYSTOCKWH FROM vBalByStockWH v WHERE v.ItemKey = i.ItemKey AND v.Warehouse = ${STOCK_WAREHOUSE}) AS wh1,
            i.Quantity, (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = i.ItemKey AND NoteID = 36) AS parentSkuNote
     FROM Items i WHERE i.ItemKey LIKE 'K345101%' ORDER BY i.ItemKey`,
  );
  const parents = await tryQuery(
    `SELECT TOP 15 p.parent FROM (
       SELECT DISTINCT LTRIM(RTRIM(Note)) AS parent FROM ExtraNotes WHERE NoteID = 36 AND LTRIM(RTRIM(ISNULL(Note, ''))) <> ''
     ) p JOIN vBalByStockWH v ON v.ItemKey = p.parent AND v.Warehouse = ${STOCK_WAREHOUSE}
     ORDER BY NEWID()`,
  );
  out.noteParents = [];
  for (const p of Array.isArray(parents) ? parents : []) out.noteParents.push(await describe(p.parent));
  const shown = await tryQuery(
    "SELECT TOP 20 KeF AS ItemKey FROM ExtraNotes WHERE NoteID = 28 AND LTRIM(RTRIM(Note)) = '1' ORDER BY NEWID()",
  );
  out.randomShown = [];
  for (const s of Array.isArray(shown) ? shown : []) out.randomShown.push(await describe(trim(s.ItemKey)));
  out.ms = Date.now() - started;
  return out;
}

async function notesFields() {
  const out = {};
  out.columns = await tryQuery(
    `SELECT c.name, t.name AS type, c.max_length FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
     WHERE c.object_id = OBJECT_ID('Stock') AND (t.name LIKE '%char%' OR t.name LIKE '%text%') ORDER BY c.column_id`,
  );
  // How often staff fill each text field on recent documents entered in Hashavshevet.
  const cols = Array.isArray(out.columns) ? out.columns.map((c) => c.name) : [];
  if (cols.length) {
    out.filledRecent = await tryQuery(
      `SELECT COUNT(*) AS docs, ${cols.map((c) => `SUM(CASE WHEN LTRIM(RTRIM(ISNULL(CAST([${c}] AS nvarchar(400)), ''))) <> '' THEN 1 ELSE 0 END) AS [${c}]`).join(', ')}
       FROM (SELECT TOP 500 * FROM Stock WHERE DocumentID IN (1, 6, 11) AND ISNULL(ExtraText3, '') <> N'הזמנת אפליקציה' ORDER BY ID DESC) s`,
    );
  }
  out.appOrders = await tryQuery(
    `SELECT TOP 15 ID, DocumentID, Status, AccountKey, IssueDate, Remarks, ExtraRemarks, Details, ExtraText2
     FROM Stock WHERE ExtraText3 = N'הזמנת אפליקציה' ORDER BY ID DESC`,
  );
  return out;
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['wh1-stock', wh1Stock], ['notes-fields', notesFields]];
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
