// TEMPORARY one-shot research at bridge start-up (read-only): writes logs/research-<name>.json once,
// so the Claude session can read results without relays. Reply 63: where Hashavshevet keeps the
// size rulers (codes in ExtraNotes NoteID 25, e.g. U28 / S3646) and their ordered sizes.
import fs from 'node:fs';
import path from 'node:path';
import { query } from './db.js';

const tryQuery = async (text, params) => {
  try {
    return await query(text, params);
  } catch (err) {
    return { error: err.message };
  }
};

const EMPTY_CODES = ['J14', 'J26', 'J28', 'J412', 'J820', 'JEANS2', 'JEANS2B', 'JEANS3', 'JEANS4', 'M03', 'PANT2', 'PANT2A',
  'PANT2B', 'PANT3', 'S024', 'S034', 'S1226', 'S1930', 'S1935', 'S2539', 'S3141', 'S3641', 'S3646', 'S3946', 'S4246', 'SNB24',
  'U210', 'U214', 'U216', 'U24', 'U26', 'U28', 'U416', 'U46', 'U48', 'USXL', 'Y712', 'Y916'];
const PROBES = ['U28', 'S3646', 'JEANS2', 'U210'];

async function rulersResearch() {
  const started = Date.now();
  const out = {};
  // 1. Objects / columns whose names look like a size scale.
  out.namedObjects = await tryQuery(
    `SELECT o.name AS obj, o.type_desc AS kind,
            STUFF((SELECT ',' + c.name FROM sys.columns c WHERE c.object_id = o.object_id ORDER BY c.column_id FOR XML PATH('')), 1, 1, '') AS cols
     FROM sys.objects o WHERE o.type IN ('U', 'V')
       AND (o.name LIKE '%Itur%' OR o.name LIKE '%Ruler%' OR o.name LIKE '%Sargel%' OR o.name LIKE '%Scale%'
            OR o.name LIKE '%Size%' OR o.name LIKE '%FList%' OR o.name LIKE '%Choice%' OR o.name LIKE '%Select%')
     ORDER BY o.name`,
  );
  out.namedColumns = await tryQuery(
    `SELECT OBJECT_NAME(c.object_id) AS obj, c.name FROM sys.columns c
     JOIN sys.objects o ON o.object_id = c.object_id AND o.type IN ('U', 'V')
     WHERE c.name LIKE '%Itur%' OR c.name LIKE '%Ruler%' OR c.name LIKE '%Sargel%' OR c.name LIKE '%SubRuler%'
     ORDER BY 1, 2`,
  );
  // 2. Small tables whose text columns contain one of the probe ruler codes as a value.
  const cols = await query(
    `SELECT t.name AS tbl, c.name AS col
     FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id
     JOIN sys.types ty ON ty.user_type_id = c.user_type_id
     JOIN (SELECT object_id, SUM(rows) AS rowsApprox FROM sys.partitions WHERE index_id IN (0, 1) GROUP BY object_id) p
       ON p.object_id = t.object_id
     WHERE p.rowsApprox BETWEEN 1 AND 20000 AND ty.name IN ('varchar', 'nvarchar', 'char', 'nchar') AND c.max_length BETWEEN 2 AND 100`,
  );
  const probeList = PROBES.map((p) => `'${p}'`).join(',');
  out.valueHits = [];
  for (const { tbl, col } of cols) {
    if (Date.now() - started > 240_000) {
      out.valueHits.push({ stopped: 'time cap reached' });
      break;
    }
    const r = await tryQuery(`SELECT TOP 3 [${col}] AS v FROM [${tbl}] WHERE LTRIM(RTRIM([${col}])) IN (${probeList})`);
    if (Array.isArray(r) && r.length) out.valueHits.push({ tbl, col, values: r.map((x) => x.v) });
  }
  out.columnsScanned = cols.length;
  // 3. Sizes from matrix models that carry the ruler code (IDefMatrixTbl columns, VorH 1).
  const codeList = EMPTY_CODES.map((c) => `'${c}'`).join(',');
  out.fromMatrix = await tryQuery(
    `SELECT LTRIM(RTRIM(n.Note)) AS ruler, t.ItemKey, t.ID, t.Name, t.Code
     FROM ExtraNotes n JOIN IDefMatrixTbl t ON t.ItemKey = n.KeF AND t.VorH = 1
     WHERE n.NoteID = 25 AND LTRIM(RTRIM(n.Note)) IN (${codeList})
     ORDER BY 1, t.ItemKey, t.ID`,
  );
  out.itemsPerCode = await tryQuery(
    `SELECT LTRIM(RTRIM(n.Note)) AS ruler, COUNT(*) AS items,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM IDefMatrix d WHERE d.ItemKey = n.KeF) THEN 1 ELSE 0 END) AS matrixItems,
            MIN(n.KeF) AS exampleItem
     FROM ExtraNotes n WHERE n.NoteID = 25 AND LTRIM(RTRIM(n.Note)) IN (${codeList})
     GROUP BY LTRIM(RTRIM(n.Note)) ORDER BY 1`,
  );
  out.ms = Date.now() - started;
  return out;
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['rulers', rulersResearch]];
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
