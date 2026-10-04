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
