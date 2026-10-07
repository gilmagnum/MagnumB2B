// TEMPORARY one-shot research at bridge start-up (read-only): writes logs/research-<name>.json once,
// so the Claude session can read results without relays. Reply 72: what makes a special price
// "valid"? Full rows of 10505's specials (ignored by Hashavshevet on 117144) vs 11724's 8.55
// special (charged), every column of SpecialPrices / SpecialPricesMoves / Accounts, plus the
// 117144 comparison under the 'always' rule.
import fs from 'node:fs';
import path from 'node:path';
import { query, key } from './db.js';
import { resolvePrices } from './pricing.js';

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const tryQuery = async (text, params) => {
  try {
    return await query(text, params);
  } catch (err) {
    return { error: err.message };
  }
};

const PAIRS = [
  ['10505', 'MG1507001'], ['10505', 'MG1503102'], ['10505', 'MG1507003'], ['10505', 'MG15070031'],
  ['11724', 'BR11506'],
];

async function specialValidity() {
  const started = Date.now();
  const out = {};
  out.columns = await tryQuery(
    `SELECT OBJECT_NAME(c.object_id) AS tbl, c.name, t.name AS type
     FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
     WHERE c.object_id IN (OBJECT_ID('SpecialPrices'), OBJECT_ID('SpecialPricesMoves')) ORDER BY 1, c.column_id`,
  );
  // Other objects that mention special prices (definitions, views, settings).
  out.relatedObjects = await tryQuery(
    `SELECT name, type_desc FROM sys.objects WHERE type IN ('U', 'V', 'P', 'FN', 'IF', 'TF')
       AND (name LIKE '%Special%' OR name LIKE '%SPrice%' OR name LIKE '%GetPrice%' OR name LIKE '%PriceList%') ORDER BY name`,
  );
  out.rows = [];
  for (const [acc, item] of PAIRS) {
    const headers = await tryQuery('SELECT * FROM SpecialPrices WHERE AccountKey = @a AND ItemKey = @i ORDER BY ValidDate DESC, ID DESC', {
      a: key(acc), i: key(item),
    });
    const ids = Array.isArray(headers) ? headers.map((h) => Number(h.ID)).filter(Number.isFinite) : [];
    const moves = ids.length ? await tryQuery(`SELECT * FROM SpecialPricesMoves WHERE SPID IN (${ids.join(',')}) ORDER BY SPID DESC, ID`) : [];
    const list = await tryQuery(
      'SELECT TOP 5 PriceListNumber, Price, DatF FROM PriceLists WHERE ItemKey = @i AND PriceListNumber = 1 ORDER BY DatF DESC, ID DESC',
      { i: key(item) },
    );
    out.rows.push({ acc, item, headers, moves, list });
  }
  out.accounts = await tryQuery("SELECT * FROM Accounts WHERE AccountKey IN ('10505', '11724', '11728')");
  // 117144 under 'always' (Gil's rule) - which lines would differ from Hashavshevet's own pull.
  const lines = await tryQuery(
    'SELECT ItemKey, Quantity, Price, DiscountPrc FROM StockMoves WHERE StockID = 117144 ORDER BY LineNoForSorting, ID',
  );
  if (Array.isArray(lines)) {
    const qty = {};
    for (const l of lines) qty[trim(l.ItemKey)] = (qty[trim(l.ItemKey)] ?? 0) + (l.Quantity ?? 0);
    const r = await resolvePrices('10505', Object.keys(qty), { quantities: qty, specialRule: 'always' });
    out.compare117144 = lines.map((l) => {
      const b = r.get(trim(l.ItemKey)) ?? {};
      return {
        item: trim(l.ItemKey),
        doc: [l.Price, l.DiscountPrc ?? 0],
        always: [b.price, b.discountPrc, b.source, b.specialFrom],
        match: round2(l.Price * (1 - (l.DiscountPrc ?? 0) / 100)) === round2((b.price ?? NaN) * (1 - (b.discountPrc ?? 0) / 100)),
      };
    });
  }
  out.ms = Date.now() - started;
  return out;
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['special-validity', specialValidity]];
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
