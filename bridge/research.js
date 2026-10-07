// TEMPORARY one-shot research at bridge start-up (read-only): writes logs/research-<name>.json once,
// so the Claude session can read results without relays. Reply 72: backtest the special-price rule
// ('newer' = special only if dated on/after the latest list change, vs 'always') on recent
// documents entered in Hashavshevet (not app orders).
import fs from 'node:fs';
import path from 'node:path';
import { query } from './db.js';
import { resolvePrices } from './pricing.js';

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const net = (price, pct) => (price == null ? null : round2(price * (1 - (pct ?? 0) / 100)));

async function backtestSpecialRule() {
  const started = Date.now();
  const docs = await query(
    `SELECT TOP 300 s.ID, s.DocumentID, s.AccountKey, s.IssueDate
     FROM Stock s JOIN Accounts a ON a.AccountKey = s.AccountKey
     WHERE s.DocumentID IN (1, 2, 6, 11) AND s.IssueDate >= DATEADD(day, -120, GETDATE())
       AND ISNULL(s.ExtraText3, '') <> N'הזמנת אפליקציה' AND a.SortGroup IN (10, 11, 12)
     ORDER BY s.ID DESC`,
  );
  const stats = {};
  const bump = (rule, k, ok) => {
    stats[rule] ??= {};
    stats[rule][k] ??= { match: 0, miss: 0 };
    stats[rule][k][ok ? 'match' : 'miss'] += 1;
  };
  const misses = [];
  const differ = [];
  for (const d of docs) {
    if (Date.now() - started > 240_000) break;
    const lines = await query(
      `SELECT ItemKey, Quantity, Price, DiscountPrc FROM StockMoves
       WHERE StockID = @id AND Tree IN (0, 1) AND Price > 0 AND ItemKey NOT IN ('M1001', 'M1002')`,
      { id: d.ID },
    );
    if (!lines.length) continue;
    const qty = {};
    for (const l of lines) qty[trim(l.ItemKey)] = (qty[trim(l.ItemKey)] ?? 0) + (l.Quantity ?? 0);
    const acc = trim(d.AccountKey);
    const opts = { date: d.IssueDate, quantities: qty };
    let newer;
    let always;
    try {
      newer = await resolvePrices(acc, Object.keys(qty), { ...opts, specialRule: 'newer' });
      always = await resolvePrices(acc, Object.keys(qty), { ...opts, specialRule: 'always' });
    } catch (err) {
      misses.push({ doc: d.ID, error: err.message });
      continue;
    }
    for (const l of lines) {
      const k = trim(l.ItemKey);
      const docNet = net(l.Price, l.DiscountPrc);
      const n = newer.get(k) ?? {};
      const a = always.get(k) ?? {};
      const okN = net(n.price, n.discountPrc) === docNet;
      const okA = net(a.price, a.discountPrc) === docNet;
      for (const [rule, ok, src] of [['newer', okN, n.source], ['always', okA, a.source]]) {
        bump(rule, 'all', ok);
        bump(rule, `doc${d.DocumentID}`, ok);
        bump(rule, `src:${src}`, ok);
      }
      if (okN !== okA && differ.length < 60) {
        differ.push({ doc: d.ID, docType: d.DocumentID, acc, item: k, docNet, newer: [n.price, n.discountPrc, n.source], always: [a.price, a.discountPrc, a.source] });
      }
      if (!okN && misses.length < 60) {
        misses.push({ doc: d.ID, docType: d.DocumentID, acc, item: k, doc: [l.Price, l.DiscountPrc], newer: [n.price, n.discountPrc, n.source, n.specialFrom] });
      }
    }
  }
  return { docs: docs.length, stats, differ, misses, ms: Date.now() - started };
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['special-rule-backtest', backtestSpecialRule]];
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
