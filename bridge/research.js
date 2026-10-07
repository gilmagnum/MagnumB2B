// TEMPORARY one-shot research at bridge start-up (read-only): writes logs/research-<name>.json once,
// so the Claude session can read results without relays. Reply 71: the resolver vs doc 117144,
// whose prices Gil pulled from Hashavshevet (the expected numbers).
import fs from 'node:fs';
import path from 'node:path';
import { query } from './db.js';
import { resolvePrices } from './pricing.js';

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function compareDoc(stockId) {
  const [h] = await query('SELECT ID, DocumentID, Status, AccountKey, DiscountPrc, TFtal, TFtalVat, Remarks FROM Stock WHERE ID = @id', { id: stockId });
  if (!h) return { missing: stockId };
  const lines = await query(
    `SELECT m.ItemKey, m.Details, m.Quantity, m.Price, m.OPrice, m.DiscountPrc, m.TFtal, f.FItemKey AS father
     FROM StockMoves m LEFT JOIN IMatrixItems f ON f.ItemKey = m.ItemKey
     WHERE m.StockID = @id ORDER BY m.LineNoForSorting, m.ID`,
    { id: stockId },
  );
  const qty = {};
  for (const l of lines) qty[trim(l.ItemKey)] = (qty[trim(l.ItemKey)] ?? 0) + (l.Quantity ?? 0);
  const resolved = await resolvePrices(trim(h.AccountKey), Object.keys(qty), { quantities: qty });
  const compared = lines.map((l) => {
    const r = resolved.get(trim(l.ItemKey)) ?? {};
    const docNet = round2(l.Price * (1 - (l.DiscountPrc ?? 0) / 100));
    const bridgeNet = r.price == null ? null : round2(r.price * (1 - (r.discountPrc ?? 0) / 100));
    return {
      item: trim(l.ItemKey), father: trim(l.father) || undefined, qty: l.Quantity,
      doc: { price: l.Price, pct: l.DiscountPrc ?? 0, net: docNet },
      bridge: { price: r.price, pct: r.discountPrc, net: bridgeNet, source: r.source, specialFrom: r.specialFrom },
      match: bridgeNet === docNet && r.price === l.Price,
      netMatch: bridgeNet === docNet,
    };
  });
  return { header: h, matches: compared.filter((c) => c.match).length, netMatches: compared.filter((c) => c.netMatch).length, lines: compared };
}

async function pricing117144() {
  const started = Date.now();
  const out = {};
  for (const id of [117144, 117140]) {
    try {
      out[id] = await compareDoc(id);
    } catch (err) {
      out[id] = { error: err.message };
    }
  }
  out.ms = Date.now() - started;
  return out;
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['pricing-117144', pricing117144]];
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
