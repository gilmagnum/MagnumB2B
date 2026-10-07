// HTTP API for the web app (shared/contract.md). Plain node:http, no extra dependencies.
//   node bridge/server.js            (npm start)
// Env (.env.local): BRIDGE_TOKEN (required), BRIDGE_HOST (default 127.0.0.1), BRIDGE_PORT (default 8787).
// Binds to localhost by default: exposing it (e.g. a tunnel for Vercel) is a separate, deliberate step.
import http from 'node:http';
import crypto from 'node:crypto';
import { read, writeOrder, resolvePrices, OrderError, closeAll } from './index.js';
import { ORDER_DOCUMENT_IDS, orderWriteEnabled, writeTestAccounts } from './config.js';
import { syncCatalog, lastSyncedAt, syncStock } from './sync.js';
import { finishPicking, PickingError } from './picking.js';
import { startEventPoller } from './events.js';
import { getBalance, getStats, StatsError } from './stats.js';
import { runStartupResearch } from './research.js';
import path from 'node:path';
import { ROOT } from './config.js';

const TOKEN = process.env.BRIDGE_TOKEN;
const HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.BRIDGE_PORT || 8787);
const ITEMS_TTL_MS = 60_000;
const MAX_BODY = 1_000_000;
const SYNC_INTERVAL_MIN = Number(process.env.SYNC_INTERVAL_MIN ?? 120); // 0 = no scheduled sync
// Scheduled syncs are skipped during working hours (server local time, "from-to"); POST /sync always works.
const SYNC_QUIET_HOURS = (process.env.SYNC_QUIET_HOURS ?? '7-19').split('-').map(Number);

if (!TOKEN || TOKEN.length < 24) {
  console.error('BRIDGE_TOKEN missing or shorter than 24 chars - set it in .env.local');
  process.exit(1);
}

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// --- item shaping (contract type Item) ---------------------------------------------
const toItem = (i) => ({
  itemkey: i.itemKey,
  itemName: i.name,
  foreignName: i.foreignName || undefined,
  price: i.price,
  barcode: i.barCode || undefined,
  brand: i.brand || undefined,
  categoryMain: i.mainCategory || undefined,
  categorySub: i.subCategory || undefined,
  season: i.season || undefined,
  rulerCode: i.sizeRulerCode || undefined,
  color: i.color || undefined,
  perCarton: i.perCarton || undefined,
  perBundle: i.perPack || undefined,
  shownOnSite: i.shownOnSite,
  ignoreStock: i.ignoreStock,
  isMatrix: i.isMatrix,
  isCartonSizeItem: Boolean(i.cartonSizeItem), // NoteID 26 'פריט קרטון מידה': each carton is one size
  stock: i.stock ?? 0,
});

// The full catalog read is ~1s (12k items + extra fields), so it is cached briefly.
let itemsCache;
async function allItems() {
  if (!itemsCache || Date.now() - itemsCache.at > ITEMS_TTL_MS) {
    itemsCache = { at: Date.now(), items: read.getItems() };
    itemsCache.items.catch(() => (itemsCache = undefined));
  }
  return itemsCache.items;
}

// --- catalog sync (single flight: a running sync is shared, never started twice) -------
let syncRun;
let lastSync;
function runSync(trigger) {
  syncRun ??= syncCatalog()
    .then((result) => (lastSync = { ...result, trigger, at: new Date().toISOString() }))
    .catch((err) => {
      lastSync = { error: err.message, trigger, at: new Date().toISOString() };
      throw err;
    })
    .finally(() => (syncRun = undefined));
  return syncRun;
}

const toPriceResult = (itemkey, accountKey, qty, p) => ({
  itemkey,
  accountKey,
  qty,
  unitPrice: p.price,
  discountPct: p.discountPrc,
  netUnitPrice: Math.round(p.price * (1 - p.discountPrc / 100) * 100) / 100,
  source: p.source === 'discount' || p.source === 'base' ? 'pricelist' : p.source,
});

// Optional YYYY-MM-DD query parameter -> Date (UTC midnight), or 400.
function parseDayParam(value, name) {
  if (!value) return undefined;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime())) throw new HttpError(400, 'BAD_REQUEST', `${name} לא תקין (YYYY-MM-DD)`);
  return d;
}

// --- routes ------------------------------------------------------------------------
const routes = [
  ['GET', /^\/health$/, async () => ({ ok: true }), { public: true }],

  ['GET', /^\/items$/, async ({ query }) => {
    let items = await allItems();
    if (query.get('shownOnSite') === '1') items = items.filter((i) => i.shownOnSite);
    const category = query.get('category');
    if (category) items = items.filter((i) => i.subCategory === category || i.mainCategory === category);
    const search = query.get('search')?.trim().toLowerCase();
    if (search) {
      items = items.filter((i) =>
        [i.itemKey, i.name, i.foreignName, i.barCode].some((v) => v && String(v).toLowerCase().includes(search)),
      );
    }
    return items.map(toItem);
  }],

  ['GET', /^\/items\/([^/]+)$/, async ({ params: [itemKey] }) => {
    const item = await read.getItem(itemKey);
    if (!item || !item.active) throw new HttpError(404, 'ITEM_NOT_FOUND', `הפריט ${itemKey} לא נמצא`);
    const result = toItem(item);
    if (item.isMatrix) result.cells = await read.getMatrixCells(item.itemKey);
    return result;
  }],

  ['GET', /^\/customers$/, async ({ query }) => {
    // agent=0 or missing = all customers (admin); q = name/account key contains.
    // Order: (numeric q) exact key > key starts with > key contains > rest, then active
    // (activity in the last 365 days) before dormant, then name.
    const agent = Number(query.get('agent') || 0);
    const q = query.get('q')?.trim() || undefined;
    const [rows, activity] = await Promise.all([read.getAccounts({ agent, q }), read.getLastActivity()]);
    const cutoff = Date.now() - 365 * 86_400_000;
    const numeric = Boolean(q && /^\d+$/.test(q));
    const keyRank = (k) => (!numeric ? 3 : k === q ? 0 : k.startsWith(q) ? 1 : k.includes(q) ? 2 : 3);
    return rows
      .map((a) => {
        const accountKey = a.AccountKey.trim();
        const last = activity.get(accountKey);
        return {
          accountKey,
          fullName: a.FullName?.trim(),
          agent: a.Agent || undefined,
          discountCode: a.DiscountCode ? String(a.DiscountCode) : undefined,
          totalDiscountPct: a.TFtalDiscount || 0,
          forPicking: !/לא לליקוט/.test(a.FullName ?? ''),
          lastActivity: last instanceof Date ? last.toISOString().slice(0, 10) : undefined,
          active: Boolean(last instanceof Date && last.getTime() >= cutoff),
          rank: keyRank(accountKey),
        };
      })
      .sort((x, y) => x.rank - y.rank || Number(y.active) - Number(x.active)
        || (x.fullName ?? '').localeCompare(y.fullName ?? '', 'he'))
      .map(({ rank, ...customer }) => customer);
  }],

  ['GET', /^\/stock\/([^/]+)$/, async ({ params: [itemKey] }) => {
    const item = await read.getItem(itemKey);
    if (!item) throw new HttpError(404, 'ITEM_NOT_FOUND', `הפריט ${itemKey} לא נמצא`);
    if (!item.isMatrix) return { itemkey: item.itemKey, qty: item.stock ?? 0 };
    const cells = await read.getMatrixCells(item.itemKey);
    return {
      itemkey: item.itemKey,
      qty: cells.reduce((sum, c) => sum + c.stock, 0),
      cells: cells.map((c) => ({ itemkey: c.itemkey, qty: c.stock })),
    };
  }],

  ['GET', /^\/price$/, async ({ query }) => {
    const accountKey = query.get('account')?.trim();
    const itemKey = query.get('item')?.trim();
    const qty = Number(query.get('qty') ?? 0);
    if (!accountKey || !itemKey) throw new HttpError(400, 'BAD_REQUEST', 'חסרים לקוח או פריט');
    const p = (await resolvePrices(accountKey, [itemKey], { quantities: { [itemKey]: qty } })).get(itemKey);
    if (!p) throw new HttpError(404, 'ITEM_NOT_FOUND', `הפריט ${itemKey} לא נמצא`);
    return toPriceResult(itemKey, accountKey, qty, p);
  }],

  // Orders (doc 6/11) + documents produced from them. agent=0/missing = all (admin).
  ['GET', /^\/documents$/, async ({ query }) => {
    const status = query.get('status') ?? 'all';
    if (!['all', 'open', 'produced'].includes(status)) throw new HttpError(400, 'BAD_REQUEST', 'סטטוס לא תקין');
    return read.getDocuments({
      agent: Number(query.get('agent') || 0),
      account: query.get('account')?.trim() || undefined, // exact customer, wins over q
      from: parseDayParam(query.get('from'), 'from'),
      to: parseDayParam(query.get('to'), 'to'),
      status,
      q: query.get('q')?.trim() || undefined,
      limit: query.get('limit') ?? 50,
      offset: query.get('offset') ?? 0,
    });
  }],

  // Picking queue (read-only). state=waiting (default) | picked; agent=0/missing = all.
  ['GET', /^\/picking\/queue$/, async ({ query }) => {
    const state = query.get('state') ?? 'waiting';
    if (!['waiting', 'picked'].includes(state)) throw new HttpError(400, 'BAD_REQUEST', 'מצב לא תקין');
    return read.getPickingQueue({
      agent: Number(query.get('agent') || 0),
      account: query.get('account')?.trim() || undefined,
      q: query.get('q')?.trim() || undefined,
      state,
      limit: query.get('limit') ?? 200,
      offset: query.get('offset') ?? 0,
    });
  }],

  // Finish picking (WRITES to Hashavshevet): marker, shortages, notes. ?dryRun=1 = rolled back.
  ['POST', /^\/picking\/(\d+)\/finish$/, async ({ params: [stockId], query, body }) => {
    try {
      return await finishPicking(stockId, body, { dryRun: query.get('dryRun') === '1' });
    } catch (err) {
      if (err instanceof PickingError) throw new HttpError(err.status, err.code, err.message);
      throw err;
    }
  }],

  // Customer balance (open A/R). ?agent=:id -> 403 unless it's that agent's customer.
  ['GET', /^\/customers\/([^/]+)\/balance$/, async ({ params: [accountKey], query }) => {
    const b = await getBalance(accountKey);
    if (!b) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', `הלקוח ${accountKey} לא נמצא`);
    const agent = Number(query.get('agent') || 0);
    if (agent && b.agent !== agent) throw new HttpError(403, 'FORBIDDEN', 'הלקוח אינו משויך לסוכן');
    return b;
  }],

  // Dashboard aggregates. scope=account|agent|all, from/to YYYY-MM-DD, compare=1. agent=:id (agent user):
  // scope=all -> 403, scope=account -> 403 unless that agent's customer, scope=agent -> own id only.
  ['GET', /^\/stats$/, async ({ query }) => {
    const scope = query.get('scope') ?? 'all';
    const account = query.get('account')?.trim() || undefined;
    const agent = Number(query.get('agent') || 0);
    if (agent) {
      if (scope === 'all') throw new HttpError(403, 'FORBIDDEN', 'סוכן אינו רשאי לראות את כל הנתונים');
      if (scope === 'account') {
        const b = account && (await getBalance(account));
        if (!b || b.agent !== agent) throw new HttpError(403, 'FORBIDDEN', 'הלקוח אינו משויך לסוכן');
      }
    }
    try {
      return await getStats({
        scope, account, agent, from: query.get('from'), to: query.get('to'), compare: query.get('compare') === '1', central: query.get('central') === '1',
      });
    } catch (err) {
      if (err instanceof StatsError) throw new HttpError(err.status, err.code, err.message);
      throw err;
    }
  }],

  // Size-ruler usage for the admin rulers screen (reply 40). Cached 12 h on the bridge.
  ['GET', /^\/rulers\/usage$/, async () => read.getRulerUsage()],

  // One document + lines for export. ?agent=:id = only if the customer is that agent's (else 404).
  ['GET', /^\/documents\/(\d+)$/, async ({ params: [stockId], query }) => {
    const doc = await read.getDocument(stockId);
    const agent = Number(query.get('agent') || 0);
    if (!doc || (agent && doc.agent !== agent)) throw new HttpError(404, 'DOC_NOT_FOUND', `מסמך ${stockId} לא נמצא`);
    return doc;
  }],

  // Bulk customer prices for the catalog grid: { account, items: [{ itemkey, qty? }] } -> PriceResult[]
  ['POST', /^\/prices$/, async ({ body }) => {
    const accountKey = body?.account?.trim?.();
    const items = Array.isArray(body?.items) ? body.items.filter((i) => i?.itemkey) : [];
    if (!accountKey || !items.length) throw new HttpError(400, 'BAD_REQUEST', 'חסרים לקוח או פריטים');
    if (items.length > 500) throw new HttpError(400, 'BAD_REQUEST', 'עד 500 פריטים בבקשה');
    const quantities = Object.fromEntries(items.map((i) => [String(i.itemkey).trim(), Number(i.qty ?? 0)]));
    const prices = await resolvePrices(accountKey, Object.keys(quantities), { quantities });
    return [...prices].map(([itemkey, p]) => toPriceResult(itemkey, accountKey, quantities[itemkey], p));
  }],

  // Full catalog refresh Hashavshevet -> Supabase. Waits for the result (a few seconds).
  ['POST', /^\/sync$/, async () => {
    try {
      return await runSync('api');
    } catch (err) {
      throw new HttpError(502, 'SYNC_FAILED', `הסנכרון נכשל: ${err.message}`);
    }
  }],
  ['GET', /^\/sync$/, async () => ({ running: Boolean(syncRun), last: lastSync ?? null })],

  // ?dryRun=1 validates and writes inside a rolled-back transaction (nothing saved).
  ['POST', /^\/orders$/, async ({ query, body }) => {
    if (!body || typeof body !== 'object') throw new HttpError(400, 'BAD_REQUEST', 'גוף הבקשה חסר');
    const dryRun = query.get('dryRun') === '1';
    const result = await writeOrder(
      {
        accountKey: body.accountKey,
        orderKind: body.orderKind ?? 'picking',
        remarks: body.remarks,
        orderDiscountPct: body.orderDiscountPct,
        lines: body.lines,
        shipping: body.shipping,
      },
      { commit: !dryRun },
    );
    return {
      stockId: dryRun ? null : result.orderId,
      dryRun,
      documentId: result.documentId,
      totals: result.totals,
      lines: result.lines,
    };
  }],
];

// --- plumbing ----------------------------------------------------------------------
function authorized(req) {
  const header = req.headers.authorization ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(TOKEN);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'TOO_LARGE', 'הבקשה גדולה מדי');
    chunks.push(chunk);
  }
  if (!size) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'JSON לא תקין');
  }
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, 'http://bridge');
  let status = 500;
  try {
    const match = routes
      .map(([method, pattern, handler, opts]) => ({ method, m: url.pathname.match(pattern), handler, opts }))
      .find((r) => r.m && r.method === req.method);
    if (!match) throw new HttpError(404, 'NOT_FOUND', 'נתיב לא קיים');
    if (!match.opts?.public && !authorized(req)) throw new HttpError(401, 'UNAUTHORIZED', 'אין הרשאה');
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    const params = match.m.slice(1).map(decodeURIComponent);
    const result = await match.handler({ query: url.searchParams, params, body });
    status = 200;
    send(res, status, result);
  } catch (err) {
    if (err instanceof HttpError) status = err.status;
    else if (err instanceof OrderError) status = err.code === 'SCHEMA' ? 500 : 422;
    else console.error(err);
    const message = status === 500 && !(err instanceof OrderError) ? 'שגיאת שרת' : err.message;
    send(res, status, { error: { code: err.code ?? 'INTERNAL', message } });
  } finally {
    console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} ${status} ${Date.now() - started}ms`);
  }
});

server.listen(PORT, HOST, () => {
  if (SYNC_INTERVAL_MIN > 0 && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Checked every 15 min: sync only off-peak, and only when the last sync (any trigger,
    // read from Supabase) is older than the interval - so restarts don't re-sync.
    const [quietFrom, quietTo] = SYNC_QUIET_HOURS;
    const tick = async () => {
      const hour = new Date().getHours();
      if (hour >= quietFrom && hour < quietTo) return;
      try {
        const last = await lastSyncedAt();
        if (last && Date.now() - last.getTime() < SYNC_INTERVAL_MIN * 60_000) return;
        const r = await runSync('schedule');
        console.log(`sync ok: ${r.items} items, ${r.variants} cells, ${r.deactivated} deactivated, ${r.ms}ms`);
      } catch (err) {
        console.error(`sync failed: ${err.message}`);
      }
    };
    tick();
    setInterval(tick, 15 * 60_000).unref();
    console.log(`catalog sync every ${SYNC_INTERVAL_MIN} min, not between ${quietFrom}:00-${quietTo}:00`);
  } else {
    console.log('catalog sync schedule off (SYNC_INTERVAL_MIN=0 or Supabase env missing)');
  }
  // Stock refresh (reply 51): Items.Quantity -> Supabase items.stock, all day (cheap: one Items read).
  const stockMin = Number(process.env.STOCK_SYNC_MIN ?? 30);
  if (stockMin > 0 && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    let stockRunning = false;
    let lastSkip;
    const stockTick = async () => {
      if (stockRunning) return;
      stockRunning = true;
      try {
        const r = await syncStock();
        if (r.skipped) {
          if (lastSkip !== r.skipped) console.log(`stock sync skipped: ${r.skipped}`);
          lastSkip = r.skipped;
        } else {
          lastSkip = undefined;
          console.log(`stock sync ok: ${r.items} items, ${r.ms}ms`);
        }
      } catch (err) {
        console.error(`stock sync failed: ${err.message}`);
      } finally {
        stockRunning = false;
      }
    };
    stockTick();
    setInterval(stockTick, stockMin * 60_000).unref();
    console.log(`stock sync every ${stockMin} min`);
  }
  startEventPoller();
  // TEMPORARY: one-shot read-only research into logs/research-*.json (reply 72).
  runStartupResearch(path.join(ROOT, 'logs')).catch((err) => console.error(`research: ${err.message}`));
  console.log(`bridge listening on http://${HOST}:${PORT} (order kinds: ${Object.keys(ORDER_DOCUMENT_IDS).join(', ')})`);
  console.log(`writes: ${orderWriteEnabled() ? 'ENABLED for all accounts' : `test accounts only (${[...writeTestAccounts()].join(',')})`}`);
});

const shutdown = () => server.close(() => closeAll().finally(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
