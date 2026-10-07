// Dashboard reads (local reply: balance + /stats). Read-only, NOLOCK pool, bounded by an indexed
// ValueDate range, cached a few minutes. DocumentID -> metric mapping (DocumentsDef names):
//   sales       1 חשבונית מס, 2 חשבונית מס/קבלה, 9 חשבונית סוכן, 37 חשבונית מס ריכוז, 87 חשבונית מס/קבלה סוכן
//   returns     3 חשבונית מס זיכוי, 73 חשבונית זיכוי סוכן
//   ordersCount 6 הזמנה, 11 הזמנת סוכן
//   payments    31 קבלה + 2/87 (invoice-receipts are payments too)
// Amounts: sales/returns = TFtal / (1 + VatPrc/100) = net of VAT, after the order discount;
// payments = TFtal (what was received, incl. VAT). Cancelled documents (DocCancel=1) are excluded.
import { query, key, sql } from './db.js';
import { CUSTOMER_SORT_GROUPS } from './config.js';

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
// Raw Hashavshevet sign (Gil, reply 46): Accounts.Balance NEGATIVE = the customer owes us (יתרה לתשלום).
// The web app presents -balance. BALANCE_SIGN=-1 in .env.local would flip it (not used).
const BALANCE_SIGN = process.env.BALANCE_SIGN === '-1' ? -1 : 1;
// Accounts.Balance is Hashavshevet's running balance of the account (negative = owes us, see above).
// Obligo = open credit exposure (cheques etc.).
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
    balance: round2(BALANCE_SIGN * (a.Balance ?? 0)),
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
            ${sum(STAT_DOCS.payments, 's.TFtal')} AS payments,
            COUNT(DISTINCT CASE WHEN s.DocumentID IN (${inList(STAT_DOCS.sales)}) THEN s.AccountKey END) AS activeCustomers
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
    activeCustomers: r.activeCustomers ?? 0,
  });
  return byAgent ? rows.map((r) => ({ agentId: r.agentId, ...shape(r) })) : shape(rows[0] ?? {});
}

// Item -> main category (NoteID 22). Matrix cells take their parent model's category (cells have no
// extra fields of their own); an item's own value wins. Cached 1 h.
let categoryCache;
async function itemCategories() {
  if (!categoryCache || Date.now() - categoryCache.at > 3600_000) {
    const map = Promise.all([
      query(`SELECT c.ItemKey, LTRIM(RTRIM(n.Note)) AS cat FROM IMatrixItems c
             JOIN ExtraNotes n ON n.KeF = c.FItemKey AND n.NoteID = 22 WHERE LTRIM(RTRIM(ISNULL(n.Note, ''))) <> ''`),
      query(`SELECT KeF AS ItemKey, LTRIM(RTRIM(Note)) AS cat FROM ExtraNotes
             WHERE NoteID = 22 AND LTRIM(RTRIM(ISNULL(Note, ''))) <> ''`),
    ]).then(([cells, own]) => new Map([...cells, ...own].map((r) => [trim(r.ItemKey), r.cat])));
    categoryCache = { at: Date.now(), map };
    map.catch(() => (categoryCache = undefined));
  }
  return categoryCache.map;
}

// Top 10 main categories by sales (net line totals of the sales docs) in range.
async function topCategories(range, scope) {
  const params = { from: { type: sql.Date, value: range.from }, to: { type: sql.Date, value: range.to } };
  const where = scopeFilter(scope, params);
  const [rows, cats] = await Promise.all([
    query(
      `SELECT m.ItemKey, SUM(m.TFtal) AS value, SUM(m.Quantity) AS qty
       FROM Stock s
       LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey
       JOIN StockMoves m ON m.StockID = s.ID
       WHERE s.ValueDate >= @from AND s.ValueDate < DATEADD(day, 1, @to)
         AND s.DocumentID IN (${inList(STAT_DOCS.sales)}) AND ISNULL(s.DocCancel, 0) = 0${where}
         AND m.Tree IN (0, 1) AND m.ItemKey NOT IN (${SHIPPING.map((k) => `'${k}'`).join(',')})
       GROUP BY m.ItemKey`,
      params,
    ),
    itemCategories(),
  ]);
  return aggregateCategories(rows, cats);
}

export function aggregateCategories(rows, cats, top = 10) {
  const byCat = new Map();
  for (const r of rows) {
    const name = cats.get(trim(r.ItemKey)) ?? 'ללא קטגוריה';
    const c = byCat.get(name) ?? { name, sales: 0, qty: 0 };
    c.sales += r.value ?? 0;
    c.qty += r.qty ?? 0;
    byCat.set(name, c);
  }
  return [...byCat.values()]
    .map((c) => ({ ...c, sales: round2(c.sales) }))
    .sort((x, y) => y.sales - x.sales)
    .slice(0, top);
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

// 2. top customers by sales in range (scope=account -> that one customer).
// central=true: branches roll up into their central account (Accounts.AssignKey, "חשבון מרכז");
// a customer without one stays itself. Grouped through a derived table (no expression in GROUP BY).
async function topCustomers(range, scope, { central = false } = {}) {
  const params = { from: { type: sql.Date, value: range.from }, to: { type: sql.Date, value: range.to } };
  const where = scopeFilter(scope, params);
  const groupKey = central ? "ISNULL(NULLIF(LTRIM(RTRIM(a.AssignKey)), ''), s.AccountKey)" : 's.AccountKey';
  const rows = await query(
    `SELECT TOP 10 x.k AS AccountKey, MAX(ISNULL(c.FullName, x.accName)) AS name,
            SUM(x.sales) AS sales, SUM(x.orders) AS ordersCount, COUNT(DISTINCT x.acct) AS branches
     FROM (
       SELECT ${groupKey} AS k, s.AccountKey AS acct, ISNULL(a.FullName, s.AccountName) AS accName,
              CASE WHEN s.DocumentID IN (${inList(STAT_DOCS.sales)}) THEN s.TFtal / (1 + ISNULL(s.VatPrc, 0) / 100) ELSE 0 END AS sales,
              CASE WHEN s.DocumentID IN (${inList(STAT_DOCS.orders)}) THEN 1 ELSE 0 END AS orders
       FROM Stock s LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey
       WHERE s.ValueDate >= @from AND s.ValueDate < DATEADD(day, 1, @to)
         AND s.DocumentID IN (${inList([...STAT_DOCS.sales, ...STAT_DOCS.orders])}) AND ISNULL(s.DocCancel, 0) = 0${where}
     ) x
     LEFT JOIN Accounts c ON c.AccountKey = x.k
     GROUP BY x.k
     ORDER BY 3 DESC`,
    params,
  );
  return rows
    .filter((r) => r.sales > 0)
    .map((r) => ({
      accountKey: trim(r.AccountKey),
      name: trim(r.name),
      sales: round2(r.sales),
      ordersCount: r.ordersCount,
      ...(central && { branches: r.branches }),
    }));
}

// 3. sales/payments time series, at most ~90 points: day (<= 90 days), week (<= 630 days), else month.
export function seriesBucket(from, to) {
  const days = Math.round((to - from) / 86_400_000) + 1;
  return days <= 90 ? 'day' : days <= 630 ? 'week' : 'month';
}
export function bucketStarts(from, to, bucket) {
  const out = [];
  if (bucket === 'month') {
    for (let m = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); m <= to;
      m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) out.push(m < from ? from : m);
  } else {
    const step = bucket === 'week' ? 7 : 1;
    for (let d = from; d <= to; d = new Date(d.getTime() + step * 86_400_000)) out.push(d);
  }
  return out;
}
async function series(range, scope) {
  const bucket = seriesBucket(range.from, range.to);
  const params = { from: { type: sql.Date, value: range.from }, to: { type: sql.Date, value: range.to } };
  const where = scopeFilter(scope, params);
  const idx = bucket === 'month' ? 'DATEDIFF(month, @from, s.ValueDate)'
    : bucket === 'week' ? 'DATEDIFF(day, @from, s.ValueDate) / 7' : 'DATEDIFF(day, @from, s.ValueDate)';
  // Bucket computed in a derived table, then grouped by its column (no parameter in GROUP BY).
  const rows = await query(
    `SELECT x.b,
            SUM(CASE WHEN x.DocumentID IN (${inList(STAT_DOCS.sales)}) THEN x.TFtal / (1 + ISNULL(x.VatPrc, 0) / 100) ELSE 0 END) AS sales,
            SUM(CASE WHEN x.DocumentID IN (${inList(STAT_DOCS.payments)}) THEN x.TFtal ELSE 0 END) AS payments
     FROM (
       SELECT ${idx} AS b, s.DocumentID, s.TFtal, s.VatPrc
       FROM Stock s LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey
       WHERE s.ValueDate >= @from AND s.ValueDate < DATEADD(day, 1, @to)
         AND s.DocumentID IN (${inList([...STAT_DOCS.sales, ...STAT_DOCS.payments])}) AND ISNULL(s.DocCancel, 0) = 0${where}
     ) x
     GROUP BY x.b`,
    params,
  );
  const byIdx = new Map(rows.map((r) => [r.b, r]));
  return bucketStarts(range.from, range.to, bucket).map((d, i) => ({
    date: isoDay(d), sales: round2(byIdx.get(i)?.sales), payments: round2(byIdx.get(i)?.payments),
  }));
}

// 4. pipeline right now (not range): open agent orders, by the warehouse marker.
async function pipeline(scope) {
  const params = {};
  const where = scopeFilter(scope, params);
  const [r] = await query(
    `SELECT SUM(CASE WHEN ISNULL(s.ExtraText2, '') NOT LIKE N'לוקט%' THEN 1 ELSE 0 END) AS waitCount,
            SUM(CASE WHEN ISNULL(s.ExtraText2, '') NOT LIKE N'לוקט%' THEN s.TFtal / (1 + ISNULL(s.VatPrc, 0) / 100) ELSE 0 END) AS waitValue,
            SUM(CASE WHEN s.ExtraText2 LIKE N'לוקט%' THEN 1 ELSE 0 END) AS pickedCount,
            SUM(CASE WHEN s.ExtraText2 LIKE N'לוקט%' THEN s.TFtal / (1 + ISNULL(s.VatPrc, 0) / 100) ELSE 0 END) AS pickedValue
     FROM Stock s LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey
     WHERE s.DocumentID = 11 AND s.Status = 0${where}`,
    params,
  );
  return {
    awaitingPicking: { count: r?.waitCount ?? 0, value: round2(r?.waitValue) },
    awaitingProduction: { count: r?.pickedCount ?? 0, value: round2(r?.pickedValue) },
  };
}

// 5. open balance right now: sum of Accounts.Balance over the scope's customers (same sign as /balance).
async function openBalance(scope) {
  const params = {};
  let where = ` AND a.SortGroup IN (${CUSTOMER_SORT_GROUPS.map(Number).join(',')})`;
  if (scope.scope === 'account') {
    where = ' AND a.AccountKey = @account';
    params.account = key(scope.account);
  } else if (scope.scope === 'agent') {
    where += ' AND a.Agent = @agent';
    params.agent = Number(scope.agent);
  }
  const [r] = await query(`SELECT SUM(a.Balance) AS total FROM Accounts a WHERE ISNULL(a.Dumi, 0) = 0${where}`, params);
  return round2(BALANCE_SIGN * (r?.total ?? 0));
}

const cache = new Map();

/** scope: { scope: 'account'|'agent'|'all', account?, agent? }, from/to 'YYYY-MM-DD', compare boolean. */
export async function getStats({ scope = 'all', account, agent, from, to, compare = false, central = false }) {
  if (!['account', 'agent', 'all'].includes(scope)) throw new StatsError(400, 'BAD_REQUEST', 'scope לא תקין');
  if (scope === 'account' && !account) throw new StatsError(400, 'BAD_REQUEST', 'חסר account');
  if (scope === 'agent' && !(Number(agent) > 0)) throw new StatsError(400, 'BAD_REQUEST', 'חסר agent');
  const range = { from: parseDay(from, 'from'), to: parseDay(to, 'to') };
  if (range.to < range.from) throw new StatsError(400, 'BAD_REQUEST', 'to לפני from');
  if ((range.to - range.from) / 86_400_000 > MAX_DAYS) throw new StatsError(400, 'BAD_REQUEST', `טווח עד ${MAX_DAYS} יום`);

  const s = { scope, account: trim(account), agent: Number(agent) || undefined };
  const cacheKey = JSON.stringify([s, from, to, Boolean(compare), Boolean(central)]);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const prev = compare ? previousPeriod(range.from, range.to) : null;
  const [main, items, agents, previous, customers, points, pipe, balance, categories] = await Promise.all([
    totals(range, s),
    topItems(range, s),
    scope === 'all' ? totals(range, s, { byAgent: true }) : null,
    prev ? totals(prev, s) : null,
    topCustomers(range, s, { central }),
    series(range, s),
    pipeline(s),
    openBalance(s),
    topCategories(range, s),
  ]);
  let byAgent;
  if (agents) {
    const names = await agentNames(agents.map((x) => x.agentId).filter(Boolean));
    byAgent = agents
      .map(({ agentId, sales, ordersCount, payments }) => ({ // activeCustomers left out of byAgent on purpose
        agentId, agentName: names.get(agentId) ?? (agentId ? null : 'ללא סוכן'), sales, ordersCount, payments,
      }))
      .sort((x, y) => y.sales - x.sales);
  }
  const value = {
    period: { from: isoDay(range.from), to: isoDay(range.to) },
    ...main,
    topItems: items,
    topCustomers: customers,
    topCategories: categories,
    series: points,
    pipeline: pipe,
    openBalance: balance,
    ...(byAgent && { byAgent }),
    ...(previous && { previous }),
  };
  cache.set(cacheKey, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}
