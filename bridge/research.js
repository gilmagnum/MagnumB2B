// TEMPORARY one-shot research at bridge start-up (read-only): writes logs/research-<name>.json once,
// so the Claude session can read results without relays. Reply 73: which special-price rule
// reproduces what Hashavshevet fills in - 'always' (any dated-valid special), 'newer' (newer than the
// list change), 'active0' (header Active = 0 only) or 'minamt0' (MinAmount = 0 only)? Backtest on the
// 300 latest documents entered in Hashavshevet + Gil's reference doc 117144.
import fs from 'node:fs';
import path from 'node:path';
import { query } from './db.js';
import { resolvePrices } from './pricing.js';

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const net = (price, pct) => (price == null ? null : round2(price * (1 - (pct ?? 0) / 100)));
const RULES = ['always', 'newer', 'active0', 'minamt0'];

async function specialRules() {
  const started = Date.now();
  // Distribution of the two candidate flags over all special-price headers.
  const flags = await query(
    `SELECT h.Active, ISNULL(h.MinAmount, 0) AS MinAmount, COUNT(*) AS headers,
            SUM(CASE WHEN h.EndDate >= GETDATE() THEN 1 ELSE 0 END) AS notEnded
     FROM SpecialPrices h GROUP BY h.Active, ISNULL(h.MinAmount, 0) ORDER BY 1, 2`,
  );
  const docs = await query(
    `SELECT TOP 300 s.ID, s.DocumentID, s.AccountKey, s.IssueDate
     FROM Stock s JOIN Accounts a ON a.AccountKey = s.AccountKey
     WHERE s.DocumentID IN (1, 2, 6, 11) AND s.IssueDate >= DATEADD(day, -120, GETDATE())
       AND ISNULL(s.ExtraText3, '') <> N'הזמנת אפליקציה' AND a.SortGroup IN (10, 11, 12)
     ORDER BY s.ID DESC`,
  );
  const ids = [117144, ...docs.map((d) => d.ID)];
  const byId = new Map(docs.map((d) => [d.ID, d]));
  const stats = Object.fromEntries(RULES.map((r) => [r, {}]));
  const bump = (rule, k, ok) => {
    stats[rule][k] ??= { match: 0, miss: 0 };
    stats[rule][k][ok ? 'match' : 'miss'] += 1;
  };
  const ref = [];
  const sampleMiss = Object.fromEntries(RULES.map((r) => [r, []]));
  for (const id of ids) {
    if (Date.now() - started > 270_000) break;
    let d = byId.get(id);
    if (!d) [d] = await query('SELECT ID, DocumentID, AccountKey, IssueDate FROM Stock WHERE ID = @id', { id });
    if (!d) continue;
    const lines = await query(
      `SELECT ItemKey, Quantity, Price, DiscountPrc FROM StockMoves
       WHERE StockID = @id AND Tree IN (0, 1) AND Price > 0 AND ItemKey NOT IN ('M1001', 'M1002')`,
      { id },
    );
    if (!lines.length) continue;
    const qty = {};
    for (const l of lines) qty[trim(l.ItemKey)] = (qty[trim(l.ItemKey)] ?? 0) + (l.Quantity ?? 0);
    const acc = trim(d.AccountKey);
    const res = {};
    for (const rule of RULES) {
      res[rule] = await resolvePrices(acc, Object.keys(qty), { date: id === 117144 ? new Date() : d.IssueDate, quantities: qty, specialRule: rule });
    }
    for (const l of lines) {
      const k = trim(l.ItemKey);
      const docNet = net(l.Price, l.DiscountPrc);
      const row = { item: k, doc: [l.Price, l.DiscountPrc ?? 0] };
      for (const rule of RULES) {
        const r = res[rule].get(k) ?? {};
        const ok = net(r.price, r.discountPrc) === docNet;
        row[rule] = [r.price, r.discountPrc, r.source, ok];
        if (id === 117144) continue;
        bump(rule, 'all', ok);
        bump(rule, `doc${d.DocumentID}`, ok);
        bump(rule, `src:${r.source}`, ok);
        if (!ok && r.source?.startsWith('special') && sampleMiss[rule].length < 15) {
          sampleMiss[rule].push({ doc: id, acc, ...row });
        }
      }
      if (id === 117144) ref.push(row);
    }
  }
  return { flags, docs: docs.length, stats, ref117144: ref, sampleMiss, ms: Date.now() - started };
}

export async function runStartupResearch(logsDir, { log = console } = {}) {
  const jobs = [['special-rules', specialRules]];
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
