// Read-only research for reply 48: where Hashavshevet keeps matrix row/column (colour/size) labels.
// Run ONCE from an elevated PowerShell (it needs .env.local):
//   cd C:\MagnumB2B\repo; node scripts\research-matrix.js KD54301 > logs\research-matrix.txt 2>&1
// Small metadata queries + rows for ONE model only. Uses the read-only (NOLOCK) pool.
import { query, closeAll } from '../bridge/db.js';

const model = process.argv[2] || 'KD54301';
const show = (title, rows) => {
  console.log(`\n=== ${title} (${rows.length})`);
  for (const r of rows.slice(0, 60)) console.log(JSON.stringify(r));
};

try {
  // 1. Tables that look like matrix / variety definitions, with their columns.
  show('candidate tables', await query(
    `SELECT t.name AS tbl, SUM(p.rows) AS rowsApprox,
            STUFF((SELECT ',' + c.name FROM sys.columns c WHERE c.object_id = t.object_id ORDER BY c.column_id FOR XML PATH('')), 1, 1, '') AS cols
     FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
     WHERE t.name LIKE '%Matri%' OR t.name LIKE '%Variet%' OR t.name LIKE '%Size%' OR t.name LIKE '%Color%'
        OR t.name LIKE '%Colour%' OR t.name LIKE '%Axis%' OR t.name LIKE '%Dimen%'
     GROUP BY t.name, t.object_id ORDER BY t.name`,
  ));
  // 2. The model: Items row + its own extra notes.
  show('model Items row', await query(
    'SELECT ItemKey, ItemName, MatrixFlag, TreeType, SortGroup FROM Items WHERE ItemKey = @k', { k: model },
  ));
  show('model ExtraNotes', await query('SELECT NoteID, Note FROM ExtraNotes WHERE KeF = @k ORDER BY NoteID', { k: model }));
  // 3. Every cell with its name and whatever labels it has.
  show('cells (IMatrixItems + notes 29/33)', await query(
    `SELECT m.ItemKey, m.Line, m.Col, m.ItemName AS cellName, i.ItemName AS itemName,
            (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = m.ItemKey AND NoteID = 29) AS color29,
            (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = m.ItemKey AND NoteID = 33) AS size33
     FROM IMatrixItems m LEFT JOIN Items i ON i.ItemKey = m.ItemKey
     WHERE m.FItemKey = @k ORDER BY m.Line, m.Col`,
    { k: model },
  ));
  // 4. Sample rows of each candidate table that mention the model (if it has an item-key-like column).
  const tables = await query(
    `SELECT t.name AS tbl, c.name AS col FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id
     WHERE (t.name LIKE '%Matri%' OR t.name LIKE '%Variet%') AND t.name <> 'IMatrixItems'
       AND c.name IN ('ItemKey', 'FItemKey', 'KeF', 'MatrixKey', 'VarietyKey', 'ID')`,
  );
  for (const { tbl, col } of tables) {
    const where = col === 'ID' ? '' : ` WHERE [${col}] = @k`;
    show(`${tbl} sample${where ? ` (${col}=${model})` : ' (TOP 15)'}`,
      await query(`SELECT TOP 15 * FROM [${tbl}]${where}`, { k: model }));
  }
} catch (err) {
  console.log('ERROR', err.message);
  process.exitCode = 1;
} finally {
  await closeAll();
}
