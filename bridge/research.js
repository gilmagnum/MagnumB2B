// TEMPORARY one-shot research at bridge start-up (read-only): writes logs/research-<name>.json once,
// so the Claude session can read results without relays. Reply 68: pricing on temp doc 117140.
import fs from 'node:fs';
import path from 'node:path';
import { query, key } from './db.js';
import { resolvePrices } from './pricing.js';

const tryQuery = async (text, params) => {
  try {
    return await query(text, params);
  } catch (err) {
    return { error: err.message };
  }
};

async function pricing117140() {
  const started = Date.now();
  const out = {};
  const docs = [117140, 117141];
  out.headers = await tryQuery(
    `SELECT s.ID, s.DocumentID, s.Status, s.AccountKey, a.FullName, a.AssignKey, a.DiscountCode, a.TFtalDiscount,
            s.DiscountPrc, s.TFtal, s.TFtalVat, s.ExtraText2, s.ExtraText3
     FROM Stock s LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey WHERE s.ID IN (${docs.join(',')})`,
  );
  out.lines = await tryQuery(
    `SELECT m.StockID, m.ItemKey, m.Details, m.Quantity, m.Price, m.OPrice, m.DiscountPrc, m.TFtal,
            i.DiscountCode AS itemDiscountCode, i.Price AS itemPrice, f.FItemKey AS father,
            fi.DiscountCode AS fatherDiscountCode, fi.Price AS fatherPrice
     FROM StockMoves m LEFT JOIN Items i ON i.ItemKey = m.ItemKey
     LEFT JOIN IMatrixItems f ON f.ItemKey = m.ItemKey LEFT JOIN Items fi ON fi.ItemKey = f.FItemKey
     WHERE m.StockID IN (${docs.join(',')}) ORDER BY m.StockID, m.LineNoForSorting`,
  );
  out.resolved = {};
  for (const h of Array.isArray(out.headers) ? out.headers : []) {
    const acc = String(h.AccountKey).trim();
    const keys = (out.lines || []).filter((l) => l.StockID === h.ID).flatMap((l) => [l.ItemKey, l.father]).filter(Boolean)
      .map((k) => String(k).trim());
    try {
      out.resolved[h.ID] = Object.fromEntries(await resolvePrices(acc, keys));
    } catch (err) {
      out.resolved[h.ID] = { error: err.message };
    }
    const central = String(h.AssignKey ?? '').trim();
    out[`discounts_${h.ID}`] = await tryQuery(
      'SELECT AccountKey, AccountDiscountCode, ItemDiscountCode, PriceListNumber, DiscountPrc, ID FROM Discounts WHERE AccountKey IN (@a, @c) ORDER BY AccountKey, ItemDiscountCode',
      { a: key(acc), c: key(central || acc) },
    );
    out[`special_${h.ID}`] = await tryQuery(
      `SELECT h.ID, h.AccountKey, h.ItemKey, h.ValidDate, h.EndDate, h.Active, m.Price, m.DiscountPrc, m.MinQuantity, m.Active AS mActive
       FROM SpecialPrices h JOIN SpecialPricesMoves m ON m.SPID = h.ID
       WHERE h.AccountKey IN (@a, @c) ORDER BY h.ItemKey, h.ValidDate DESC`,
      { a: key(acc), c: key(central || acc) },
    );
  }
  out.pricelists = await tryQuery(
    `SELECT p.ItemKey, p.PriceListNumber, p.Price, p.DatF FROM PriceLists p
     WHERE p.ItemKey IN (SELECT m.ItemKey FROM StockMoves m WHERE m.StockID IN (${docs.join(',')})
                         UNION SELECT f.FItemKey FROM StockMoves m JOIN IMatrixItems f ON f.ItemKey = m.ItemKey WHERE m.StockID IN (${docs.join(',')}))
     ORDER BY p.ItemKey, p.PriceListNumber, p.DatF DESC`,
  );
  // How often do matrix cells lack the father's discount code / price list?
  out.cellCodes = await tryQuery(
    `SELECT COUNT(*) AS cells,
            SUM(CASE WHEN ISNULL(LTRIM(RTRIM(i.DiscountCode)), '') = '' THEN 1 ELSE 0 END) AS cellNoCode,
            SUM(CASE WHEN ISNULL(LTRIM(RTRIM(i.DiscountCode)), '') <> ISNULL(LTRIM(RTRIM(fi.DiscountCode)), '') THEN 1 ELSE 0 END) AS cellCodeDiffers,
            SUM(CASE WHEN i.Price <> fi.Price THEN 1 ELSE 0 END) AS cellPriceDiffers
     FROM IMatrixItems f JOIN Items i ON i.ItemKey = f.ItemKey JOIN Items fi ON fi.ItemKey = f.FItemKey`,
  );
  out.ms = Date.now() - started;
  return out;
}

// Reply 69: parents with variants - own warehouse balance vs the sum of children.
async function parentStock() {
  const started = Date.now();
  const out = {};
  out.sample = await tryQuery(
    `SELECT p.ItemKey, p.kind,
            (SELECT TOP 1 v.BALBYSTOCKWH FROM vBalByStockWH v WHERE v.ItemKey = p.ItemKey AND v.Warehouse = 1) AS own,
            (SELECT COUNT(*) FROM IMatrixItems c WHERE c.FItemKey = p.ItemKey) AS cells,
            (SELECT COUNT(*) FROM ExtraNotes n WHERE n.NoteID = 36 AND LTRIM(RTRIM(n.Note)) = p.ItemKey) AS noteChildren
     FROM (VALUES ('KD54301', 'reported'), ('MG1507001', 'reported'), ('MG1507003', 'reported'), ('BR12502', 'reported'),
                  ('MG44102', 'reported'), ('BR11506', 'ruler ok'), ('MG11129', 'ok')) p(ItemKey, kind)`,
  );
  out.noteChildrenOf = await tryQuery(
    `SELECT LTRIM(RTRIM(n.Note)) AS parent, n.KeF AS child,
            (SELECT TOP 1 v.BALBYSTOCKWH FROM vBalByStockWH v WHERE v.ItemKey = n.KeF AND v.Warehouse = 1) AS childStock,
            (SELECT TOP 1 Note FROM ExtraNotes x WHERE x.KeF = n.KeF AND x.NoteID = 26) AS cartonFlag,
            (SELECT TOP 1 Note FROM ExtraNotes x WHERE x.KeF = n.KeF AND x.NoteID = 27) AS colorFlag
     FROM ExtraNotes n WHERE n.NoteID = 36 AND LTRIM(RTRIM(n.Note)) IN ('MG1507001', 'MG1507003', 'BR12502', 'MG44102', 'BR11506', 'MG11129')`,
  );
  out.ms = Date.now() - started;
  return out;
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['pricing-117140', pricing117140], ['parent-stock', parentStock]];
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
