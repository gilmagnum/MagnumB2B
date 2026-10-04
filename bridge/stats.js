// Dashboard reads (local reply: balance + /stats). Read-only, NOLOCK pool, bounded by an indexed
// ValueDate range, cached a few minutes. DocumentID -> metric mapping (DocumentsDef names):
//   sales       1 חשבונית מס, 2 חשבונית מס/קבלה, 9 חשבונית סוכן, 37 חשבונית מס ריכוז, 87 חשבונית מס/קבלה סוכן
//   returns     3 חשבונית מס זיכוי, 73 חשבונית זיכוי סוכן
//   ordersCount 6 הזמנה, 11 הזמנת סוכן
//   payments    31 קבלה + 2/87 (invoice-receipts are payments too)
// Amounts: sales/returns = TFtal / (1 + VatPrc/100) = net of VAT, after the order discount;
// payments = TFtal (what was received, incl. VAT). Cancelled documents (DocCancel=1) are excluded.
import { query, key, sql } from './db.js';

export const STAT_DOCS = {
  sales: [1, 2, 9, 37, 87],
  returns: [3, 73],
  orders: [6, 11],
  payments: [31, 2, 87],
};
const ALL_DOCS = [...new Set(Object.values(STAT_DOCS).flat())];
const MAX_DAYS = 800;
const CACHE_MS = 3 * 60_000;
const SHIPPING = ['M1001', 'M1002'];

const round2 = (n) => Math.round(((n ?? 0) + Number.EPSILON) * 100) / 100;
const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const inList = (ids) => ids.map(Number).join(',');

// --- balance ------------------------------------------------------------------------------
// Accounts.Balance is Hashavshevet's running balance of the account; for a customer a positive
// (debit) balance = the customer owes us. Obligo = open credit exposure (cheques etc.).
export async function getBalance(accountKey) {
  const [a] = await query(
    'SELECT AccountKey, FullName, Agent, Balance, Obligo, MaxCredit, MaxObligo FROM Accounts WHERE AccountKey = @k',
    { k: key(accountKey) },
  );
  if (!a) return null;
  return {
    accountKey: trim(a.AccountKey),
    customerName: trim(a.FullName),
    agent: a.Agent || undefined,
    balance: round2(a.Balance),
    obligo: round2(a.Obligo),
    maxCredit: a.MaxCredit || undefined,
    maxObligo: a.MaxObligo || undefined,
  };
}

// --- stats --------------------------------------------------------------------------------
export class StatsError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const parseDay = (s, name) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? '')) throw new StatsError(400, 'BAD_REQUEST', `${name} חסר או לא תקין (YYYY-MM-DD)`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new StatsError(400, 'BAD_REQUEST', `${name} לא תקין`);
  return d;
};

// Previous equivalent period: same length, ending the day before `from`.
export function previousPeriod(from, to) {
  const days = Math.round((to - from) / 86_400_000) + 1;
  const prevTo = new Date(from.getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000);
  return { from: prevFrom, to: prevTo };
}

function scopeFilter({ scope, account, agent }, params) {
  if (scope === 'account') {
    params.account = key(account);
    return ' AND s.AccountKey = @account';
  }
  if (scope === 'agent') {
    params.agent = Number(agent);
    return ' AND a.Agent = @agent';
  }
  return '';
}

async function totals(range, scope, { byAgent = false } = {}) {
  const params = {
    from: { type: sql.Date, value: range.from },
    to: { type: sql.Date, value: range.to },
  };
  const where = scopeFilter(scope, params);
  const sum = (ids, expr) => `SUM(CASE WHEN s.DocumentID IN (${inList(ids)}) THEN ${expr} ELSE 0 END)`;
  const net = 's.TFtal / (1 + ISNULL(s.VatPrc, 0) / 100)';
  const rows = await query(
    `SELECT ${byAgent ? 'ISNULL(a.Agent, 0) AS agentId,' : ''}
            ${sum(STAT_DOCS.sales, net)} AS sales,
            ${sum(STAT_DOCS.returns, `ABS(${net})`)} AS returns,
            ${sum(STAT_DOCS.orders, '1')} AS ordersCount,
            ${sum(STAT_DOCS.payments, 's.TFtal')} AS payments
     FROM Stock s LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey
     WHERE s.ValueDate >= @from AND s.ValueDate < DATEADD(day, 1, @to)
       AND s.DocumentID IN (${inList(ALL_DOCS)}) AND ISNULL(s.DocCancel, 0) = 0${where}
     ${byAgent ? 'GROUP BY ISNULL(a.Agent, 0)' : ''}`,
    params,
  );
  const shape = (r) => ({
    sales: round2(r.sales),
    returns: round2(r.returns),
    ordersCount: r.ordersCount ?? 0,
    payments: round2(r.payments),
  });
  return byAgent ? rows.map((r) => ({ agentId: r.agentId, ...shape(r) })) : shape(rows[0] ?? {});
}

async function topItems(range, scope) {
  const params = {
    from: { type: sql.Date, value: range.from },
    to: { type: sql.Date, value: range.to },
  };
  const where = scopeFilter(scope, params);
  const rows = await query(
    `SELECT TOP 10 m.ItemKey, MAX(m.ItemName) AS name, SUM(m.Quantity) AS qty, SUM(m.TFtal) AS value
     FROM Stock s
     LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey
     JOIN StockMoves m ON m.StockID = s.ID
     WHERE s.ValueDate >= @from AND s.ValueDate < DATEADD(day, 1, @to)
       AND s.DocumentID IN (${inList(STAT_DOCS.sales)}) AND ISNULL(s.DocCancel, 0) = 0${where}
       AND m.Tree IN (0, 1) AND m.ItemKey NOT IN (${SHIPPING.map((k) => `'${k}'`).join(',')})
     GROUP BY m.ItemKey
     ORDER BY SUM(m.TFtal) DESC`,
    params,
  );
  return rows.map((r) => ({ itemkey: trim(r.ItemKey), name: trim(r.name), qty: r.qty, value: round2(r.value) }));
}

// Agent names: Hashavshevet keeps agents in AgentWarehouseNames (NameID = agent number).
async function agentNames(ids) {
  if (!ids.length) return new Map();
  const rows = await query(`SELECT NameID, Name FROM AgentWarehouseNames WHERE NameID IN (${inList(ids)})`);
  return new Map(rows.map((r) => [r.NameID, trim(r.Name)]));
}

const cache = new Map();

/** scope: { scope: 'account'|'agent'|'all', account?, agent? }, from/to 'YYYY-MM-DD', compare boolean. */
export async function getStats({ scope = 'all', account, agent, from, to, compare = false }) {
  if (!['account', 'agent', 'all'].includes(scope)) throw new StatsError(400, 'BAD_REQUEST', 'scope לא תקין');
  if (scope === 'account' && !account) throw new StatsError(400, 'BAD_REQUEST', 'חסר account');
  if (scope === 'agent' && !(Number(agent) > 0)) throw new StatsError(400, 'BAD_REQUEST', 'חסר agent');
  const range = { from: parseDay(from, 'from'), to: parseDay(to, 'to') };
  if (range.to < range.from) throw new StatsError(400, 'BAD_REQUEST', 'to לפני from');
  if ((range.to - range.from) / 86_400_000 > MAX_DAYS) throw new StatsError(400, 'BAD_REQUEST', `טווח עד ${MAX_DAYS} יום`);

  const s = { scope, account: trim(account), agent: Number(agent) || undefined };
  const cacheKey = JSON.stringify([s, from, to, Boolean(compare)]);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const prev = compare ? previousPeriod(range.from, range.to) : null;
  const [main, items, agents, previous] = await Promise.all([
    totals(range, s),
    topItems(range, s),
    scope === 'all' ? totals(range, s, { byAgent: true }) : null,
    prev ? totals(prev, s) : null,
  ]);
  let byAgent;
  if (agents) {
    const names = await agentNames(agents.map((x) => x.agentId).filter(Boolean));
    byAgent = agents
      .map(({ agentId, sales, ordersCount, payments }) => ({
        agentId, agentName: names.get(agentId) ?? (agentId ? null : 'ללא סוכן'), sales, ordersCount, payments,
      }))
      .sort((x, y) => y.sales - x.sales);
  }
  const value = {
    period: { from: isoDay(range.from), to: isoDay(range.to) },
    ...main,
    topItems: items,
    ...(byAgent && { byAgent }),
    ...(previous && { previous }),
  };
  cache.set(cacheKey, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}
