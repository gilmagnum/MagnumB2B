// Temporary, read-only research for reply 48 (matrix cell labels): where Hashavshevet keeps the
// matrix row/column (colour/size) names. Used by GET /debug/matrix-research and
// scripts/research-matrix.js. Small metadata queries + ONE model. Remove once the labels are done.
import { query, key } from './db.js';

export async function matrixResearch(model) {
  const sections = {};
  sections.candidateTables = await query(
    `SELECT t.name AS tbl, SUM(p.rows) AS rowsApprox,
            STUFF((SELECT ',' + c.name FROM sys.columns c WHERE c.object_id = t.object_id ORDER BY c.column_id FOR XML PATH('')), 1, 1, '') AS cols
     FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
     WHERE t.name LIKE '%Matri%' OR t.name LIKE '%Variet%' OR t.name LIKE '%Size%' OR t.name LIKE '%Color%'
        OR t.name LIKE '%Colour%' OR t.name LIKE '%Axis%' OR t.name LIKE '%Dimen%'
     GROUP BY t.name, t.object_id ORDER BY t.name`,
  );
  sections.model = await query(
    'SELECT ItemKey, ItemName, MatrixFlag, TreeType, SortGroup FROM Items WHERE ItemKey = @k', { k: key(model) },
  );
  sections.modelNotes = await query('SELECT NoteID, Note FROM ExtraNotes WHERE KeF = @k ORDER BY NoteID', { k: key(model) });
  sections.cells = await query(
    `SELECT m.ItemKey, m.Line, m.Col, m.ItemName AS cellName, i.ItemName AS itemName,
            (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = m.ItemKey AND NoteID = 29) AS color29,
            (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = m.ItemKey AND NoteID = 33) AS size33
     FROM IMatrixItems m LEFT JOIN Items i ON i.ItemKey = m.ItemKey
     WHERE m.FItemKey = @k ORDER BY m.Line, m.Col`,
    { k: key(model) },
  );
  const tables = await query(
    `SELECT t.name AS tbl, c.name AS col FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id
     WHERE (t.name LIKE '%Matri%' OR t.name LIKE '%Variet%') AND t.name <> 'IMatrixItems'
       AND c.name IN ('ItemKey', 'FItemKey', 'KeF', 'MatrixKey', 'VarietyKey', 'ID')`,
  );
  sections.samples = {};
  for (const { tbl, col } of tables) {
    const where = col === 'ID' ? '' : ` WHERE [${col}] = @k`;
    sections.samples[`${tbl}${where ? `.${col}=${model}` : ' (TOP 15)'}`] =
      await query(`SELECT TOP 15 * FROM [${tbl}]${where}`, { k: key(model) });
  }
  return sections;
}

// Reply 53: how inter-warehouse transfers ("העברה בין מחסנים") are stored, for account 10830.
export async function transferResearch(account) {
  const k = key(account);
  return {
    docTypes: await query(
      `SELECT DocumentID, DocName FROM DocumentsDef WHERE DocName LIKE N'%העברה%' OR DocumentID = 19 ORDER BY DocumentID`,
    ),
    account: await query('SELECT AccountKey, FullName, SortGroup, Agent, Dumi FROM Accounts WHERE AccountKey = @k', { k }),
    docsByType: await query(
      `SELECT s.DocumentID, d.DocName, COUNT(*) AS docs, MAX(s.ID) AS lastId, MAX(s.ValueDate) AS lastDate
       FROM Stock s LEFT JOIN DocumentsDef d ON d.DocumentID = s.DocumentID
       WHERE s.AccountKey = @k GROUP BY s.DocumentID, d.DocName ORDER BY docs DESC`,
      { k },
    ),
    warehouseColumns: await query(
      `SELECT OBJECT_NAME(c.object_id) AS tbl, c.name FROM sys.columns c
       WHERE OBJECT_NAME(c.object_id) IN ('Stock', 'StockMoves')
         AND (c.name LIKE '%Ware%' OR c.name LIKE '%Store%' OR c.name LIKE '%Trans%' OR c.name LIKE '%Branch%')
       ORDER BY 1, 2`,
    ),
    // The latest transfer-type documents overall (any account), headers only.
    latestTransfers: await query(
      `SELECT TOP 5 s.* FROM Stock s WHERE s.DocumentID IN
         (SELECT DocumentID FROM DocumentsDef WHERE DocName LIKE N'%העברה%' OR DocumentID = 19)
       ORDER BY s.ID DESC`,
    ),
    // The newest document of this account (whatever type), full header + lines.
    latestForAccount: await (async () => {
      const [h] = await query('SELECT TOP 1 * FROM Stock WHERE AccountKey = @k ORDER BY ID DESC', { k });
      if (!h) return null;
      const lines = await query('SELECT TOP 10 * FROM StockMoves WHERE StockID = @id ORDER BY LineNoForSorting, ID', { id: h.ID });
      return { header: h, lines };
    })(),
  };
}

// One-shot research at bridge start-up (read-only): writes logs/research-<name>.json once, so the
// Claude session can read it without anyone relaying output. Skips files that already exist.
export async function runStartupResearch(logsDir, { log = console } = {}) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const jobs = [
    ['matrix-KD54301', () => matrixResearch('KD54301')],
    ['transfer-10830', () => transferResearch('10830')],
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
