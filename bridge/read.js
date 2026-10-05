import { query, key, sql } from './db.js';
import { PICK_NOTES_FIELD } from './picking.js';
import { NOTE_FIELDS, SUM_FIELDS, FLAG_FIELDS, CUSTOMER_SORT_GROUPS, SHIPPING_ITEMS, TRANSFER_ACCOUNTS } from './config.js';

const ACTIVE = 'ISNULL(Dumi, 0) <> 1';
const ITEM_COLUMNS =
  'ID, ItemKey, ItemName, ForignName, Price, BarCode, DiscountCode, MatrixFlag, SuF4, Quantity, SalesUnit, SortGroup';

const trim = (v) => (typeof v === 'string' ? v.trim() : v);

// ExtraNotes/ExtraSums value column: prefer the known name, fall back to the
// first column that is not part of the key.
function extraValue(row, idColumn, candidates) {
  for (const c of candidates) if (c in row) return row[c];
  const other = Object.keys(row).find((k) => !['KeF', 'ID', idColumn].includes(k));
  return other ? row[other] : undefined;
}

async function loadExtras(itemKey) {
  const where = itemKey ? ' AND KeF = @itemKey' : '';
  const params = itemKey ? { itemKey: key(itemKey) } : {};
  const [notes, sums] = await Promise.all([
    query(`SELECT * FROM ExtraNotes WHERE NoteID IN (${Object.keys(NOTE_FIELDS).join(',')})${where}`, params),
    query(`SELECT * FROM ExtraSums WHERE SuFID IN (${Object.keys(SUM_FIELDS).join(',')})${where}`, params),
  ]);
  const byItem = new Map();
  const slot = (kef) => {
    const k = trim(kef);
    if (!byItem.has(k)) byItem.set(k, {});
    return byItem.get(k);
  };
  for (const row of notes) {
    const field = NOTE_FIELDS[row.NoteID];
    const value = trim(extraValue(row, 'NoteID', ['Note']));
    slot(row.KeF)[field] = FLAG_FIELDS.has(field) ? value === '1' : value || null;
  }
  for (const row of sums) {
    const value = extraValue(row, 'SuFID', ['SuF', 'Sum']);
    slot(row.KeF)[SUM_FIELDS[row.SuFID]] = value == null ? null : Number(value);
  }
  return byItem;
}

function shapeItem(row, extra = {}) {
  return {
    itemKey: trim(row.ItemKey),
    name: trim(row.ItemName),
    foreignName: trim(row.ForignName),
    price: row.Price,
    barCode: trim(row.BarCode),
    discountCode: trim(row.DiscountCode),
    sortGroup: row.SortGroup,
    itemId: row.ID, // Items.ID (identity) = creation order
    isMatrix: false, // Items.MatrixFlag is unused here - callers set it from IMatrixItems
    packQuantity: row.SuF4,
    stock: row.Quantity,
    shownOnSite: false,
    ignoreStock: false,
    ...extra,
  };
}

// Active items with their "extra fields". shownOnly=true -> only "מוצג באתר"=1.
export async function getItems({ shownOnly = false } = {}) {
  const [rows, extras, fathers] = await Promise.all([
    query(`SELECT ${ITEM_COLUMNS} FROM Items WHERE ${ACTIVE}`),
    loadExtras(),
    query('SELECT DISTINCT FItemKey FROM IMatrixItems'),
  ]);
  const matrix = new Set(fathers.map((r) => trim(r.FItemKey)));
  const items = rows.map((row) =>
    shapeItem(row, { ...extras.get(trim(row.ItemKey)), isMatrix: matrix.has(trim(row.ItemKey)) }),
  );
  return shownOnly ? items.filter((i) => i.shownOnSite) : items;
}

export async function getItem(itemKey) {
  const [rows, extras] = await Promise.all([
    query(
      `SELECT ${ITEM_COLUMNS}, Dumi,
         CASE WHEN EXISTS (SELECT 1 FROM IMatrixItems WHERE FItemKey = @itemKey) THEN 1 ELSE 0 END AS hasCells
       FROM Items WHERE ItemKey = @itemKey`,
      { itemKey: key(itemKey) },
    ),
    loadExtras(itemKey),
  ]);
  if (!rows.length) return null;
  const extra = { ...extras.get(trim(rows[0].ItemKey)), isMatrix: rows[0].hasCells === 1 };
  return { ...shapeItem(rows[0], extra), active: Number(rows[0].Dumi) !== 1 };
}

// Raw Items rows for a list of keys (used by writeOrder for validation + name snapshot).
export async function getItemRows(itemKeys) {
  const keys = [...new Set(itemKeys.map(String))];
  if (!keys.length) return new Map();
  const params = Object.fromEntries(keys.map((k, i) => [`k${i}`, key(k)]));
  const rows = await query(
    `SELECT ${ITEM_COLUMNS}, Dumi FROM Items WHERE ItemKey IN (${keys.map((_, i) => `@k${i}`).join(',')})`,
    params,
  );
  return new Map(rows.map((r) => [trim(r.ItemKey), r]));
}

// Matrix cells of a parent model (IMatrixItems: FItemKey + Line/Col).
export function getMatrixChildren(fatherItemKey) {
  return query('SELECT * FROM IMatrixItems WHERE FItemKey = @k ORDER BY Line, Col', { k: key(fatherItemKey) });
}

// Matrix cells with stock and their size/color labels (ExtraNotes 33 "מידה למטריצה", 29 "צבע").
// --- matrix labels (reply 48) ---------------------------------------------------------------
// Hashavshevet's matrix definition: IDefMatrix (per model: LineHead/ColHead, e.g. "צבע"/"מידה") and
// IDefMatrixTbl (per model: named entries, VorH 0 = lines, VorH 1 = columns, each in ID order).
// A cell SKU is model + line code + column code (KD54301 + 501 + 04), so labels are matched by
// code first and by position as a fallback. Cells' own NoteID 29/33 values are the last resort.
export function matrixAxes(defRows, tblRows) {
  const axes = new Map();
  const get = (k) => {
    if (!axes.has(k)) axes.set(k, { lineHead: null, colHead: null, lines: [], cols: [] });
    return axes.get(k);
  };
  for (const d of defRows) Object.assign(get(trim(d.ItemKey)), { lineHead: trim(d.LineHead) || null, colHead: trim(d.ColHead) || null });
  for (const t of [...tblRows].sort((a, b) => a.ID - b.ID)) {
    const entry = { name: trim(t.Name) || trim(t.ItemName) || null, code: trim(t.Code) || '' };
    (Number(t.VorH) === 1 ? get(trim(t.ItemKey)).cols : get(trim(t.ItemKey)).lines).push(entry);
  }
  return axes;
}

export function labelCell(cell, axis) {
  let line = axis?.lines[cell.line];
  let col = axis?.cols[cell.col];
  const suffix = cell.itemKey.startsWith(cell.fatherKey) ? cell.itemKey.slice(cell.fatherKey.length) : null;
  if (axis && suffix != null && !(line && col && `${line.code}${col.code}` === suffix)) {
    // Position and code disagree: resolve by code only - never guess by position here.
    const hits = axis.lines.flatMap((l) => axis.cols.filter((c) => `${l.code}${c.code}` === suffix).map((c) => [l, c]));
    if (hits.length === 1) {
      [line, col] = hits[0];
    } else {
      const lineHits = axis.lines.filter((l) => l.code && suffix.startsWith(l.code));
      const colHits = axis.cols.filter((c) => c.code && suffix.endsWith(c.code));
      line = lineHits.length === 1 ? lineHits[0] : undefined;
      col = colHits.length === 1 ? colHits[0] : undefined;
    }
  }
  // Which axis is colour/size comes from the headers; default line = colour, column = size.
  const lineIsSize = /מידה/.test(axis?.lineHead ?? '') || /צבע/.test(axis?.colHead ?? '');
  const [colorEntry, sizeEntry] = lineIsSize ? [col, line] : [line, col];
  return {
    colorLabel: colorEntry?.name || cell.colorNote || undefined,
    sizeLabel: sizeEntry?.name || cell.sizeNote || undefined,
  };
}

async function loadAxes(fatherKey) {
  const params = fatherKey ? { k: key(fatherKey) } : {};
  const where = fatherKey ? ' WHERE ItemKey = @k' : '';
  const [defs, tbl] = await Promise.all([
    query(`SELECT ItemKey, LineHead, ColHead FROM IDefMatrix${where}`, params),
    query(`SELECT ID, ItemKey, Name, ItemName, Code, VorH FROM IDefMatrixTbl${where}`, params),
  ]);
  return matrixAxes(defs, tbl);
}

// Matrix cells of one model with stock and size/colour labels.
export async function getMatrixCells(fatherItemKey) {
  const [rows, axes] = await Promise.all([
    query(
      `SELECT m.ItemKey, m.Line, m.Col, i.Quantity AS stock,
         (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = m.ItemKey AND NoteID = 33) AS sizeNote,
         (SELECT TOP 1 Note FROM ExtraNotes WHERE KeF = m.ItemKey AND NoteID = 29) AS colorNote
       FROM IMatrixItems m LEFT JOIN Items i ON i.ItemKey = m.ItemKey
       WHERE m.FItemKey = @k ORDER BY m.Line, m.Col`,
      { k: key(fatherItemKey) },
    ),
    loadAxes(fatherItemKey),
  ]);
  const father = trim(fatherItemKey);
  return rows.map((r) => {
    const cell = { itemKey: trim(r.ItemKey), fatherKey: father, line: r.Line, col: r.Col,
      sizeNote: trim(r.sizeNote) || null, colorNote: trim(r.colorNote) || null };
    return { itemkey: cell.itemKey, ...labelCell(cell, axes.get(father)), line: r.Line, col: r.Col, stock: r.stock ?? 0 };
  });
}

// Active accounts; pass agent to get only that agent's customers.
// Active customers (not ledger/supplier accounts): Accounts.SortGroup in CUSTOMER_SORT_GROUPS,
// Dumi<>1, named, and not marked "לא פעיל" in the name (staff do that instead of Dumi).
// agent: only that agent's customers (0 / missing = all, for admin).
// q: name or account key contains q.
export function getAccounts({ agent, q } = {}) {
  const params = {};
  let where = '';
  if (agent) {
    where += ' AND Agent = @agent';
    params.agent = agent;
  }
  if (q) {
    where += " AND (FullName LIKE @q ESCAPE '!' OR AccountKey LIKE @q ESCAPE '!')";
    params.q = { type: sql.NVarChar(100), value: `%${likeEscape(q)}%` };
  }
  return query(
    `SELECT AccountKey, FullName, Agent, DiscountCode, TFtalDiscount, CreditTermsCode
     FROM Accounts
     WHERE ${ACTIVE} AND SortGroup IN (${CUSTOMER_SORT_GROUPS.map(Number).join(',')})
       AND LTRIM(RTRIM(ISNULL(FullName, ''))) <> ''
       AND FullName NOT LIKE N'%לא פעיל%'${where}
     ORDER BY FullName`,
    params,
  );
}

// LIKE pattern for a user search term (wildcards in the term are literal).
// Use with ESCAPE '!'.
export const likeEscape = (term) => String(term).trim().replace(/[!%_[]/g, (c) => `!${c}`);

export async function getAccount(accountKey) {
  const rows = await query('SELECT * FROM Accounts WHERE AccountKey = @k', { k: key(accountKey) });
  return rows[0] ?? null;
}

// General stock (Items.Quantity) for all active items: Map<itemKey, quantity>
export async function getStock() {
  const rows = await query(`SELECT ItemKey, Quantity FROM Items WHERE ${ACTIVE}`);
  return new Map(rows.map((r) => [trim(r.ItemKey), r.Quantity]));
}

export function getStockByWarehouse(itemKey) {
  return query('SELECT * FROM WhSummInv WHERE ItemKey = @k', { k: key(itemKey) });
}

export function getWarehouses() {
  return query('SELECT * FROM AgentWarehouseNames');
}

// Raw price sources. Resolution order (section 3): SpecialPrices > Discounts > PriceLists.
export async function getPriceSources(accountKey, itemKey) {
  const [priceLists, specialPrices, discounts] = await Promise.all([
    query('SELECT * FROM PriceLists WHERE ItemKey = @item', { item: key(itemKey) }),
    query('SELECT * FROM SpecialPrices WHERE AccountKey = @acc AND ItemKey = @item', {
      acc: key(accountKey),
      item: key(itemKey),
    }),
    query('SELECT * FROM Discounts WHERE AccountKey = @acc', { acc: key(accountKey) }),
  ]);
  return { priceLists, specialPrices, discounts };
}

// An order as stored in Hashavshevet. orderId = Stock.ID.
export async function getOrder(orderId) {
  const [headers, lines] = await Promise.all([
    query('SELECT * FROM Stock WHERE ID = @id', { id: Number(orderId) }),
    query('SELECT * FROM StockMoves WHERE StockID = @id ORDER BY LineNoForSorting, ID', { id: Number(orderId) }),
  ]);
  return headers.length ? { header: headers[0], lines } : null;
}

// Column metadata, used by writeOrder's pre-flight check.
export function getTableColumns(table) {
  return query(
    `SELECT c.name, t.name AS type, c.max_length AS maxLength, c.is_nullable AS nullable,
            c.is_identity AS [identity], c.is_computed AS computed,
            CAST(CASE WHEN c.default_object_id <> 0 THEN 1 ELSE 0 END AS bit) AS hasDefault
     FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
     WHERE c.object_id = OBJECT_ID(@t) ORDER BY c.column_id`,
    { t: table },
  );
}

// Print format for a new document: the customer card's format for this document type
// (AccDocRpt, "פורמט הדפסה" per customer per document), else the document default
// (DocumentsDef.RptFormat).
export async function getPrintStyle(accountKey, documentId) {
  const rows = await query(
    `SELECT COALESCE(
       (SELECT TOP 1 RptID FROM AccDocRpt WHERE AccountKey = @acc AND DocumentID = @doc AND RptID > 0 ORDER BY ID DESC),
       (SELECT RptFormat FROM DocumentsDef WHERE DocumentID = @doc)) AS printStyle`,
    { acc: key(accountKey), doc: documentId },
  );
  return rows[0]?.printStyle ?? null;
}

// Parent model of matrix cell SKUs: Map<cellItemKey, fatherItemKey>.
export async function getMatrixFathers(itemKeys) {
  const keys = [...new Set(itemKeys.map((k) => String(k).trim()))];
  if (!keys.length) return new Map();
  const params = Object.fromEntries(keys.map((k, i) => [`k${i}`, key(k)]));
  const rows = await query(
    `SELECT ItemKey, FItemKey FROM IMatrixItems WHERE ItemKey IN (${keys.map((_, i) => `@k${i}`).join(',')})`,
    params,
  );
  return new Map(rows.map((r) => [trim(r.ItemKey), trim(r.FItemKey)]));
}

// All matrix cells of all models, with size/color labels (for the catalog sync).
export async function getAllMatrixCells() {
  const [rows, axes] = await Promise.all([
    query(
      `SELECT m.ItemKey, m.FItemKey, m.Line, m.Col, sz.Note AS sizeNote, cl.Note AS colorNote
       FROM IMatrixItems m
       LEFT JOIN ExtraNotes sz ON sz.KeF = m.ItemKey AND sz.NoteID = 33
       LEFT JOIN ExtraNotes cl ON cl.KeF = m.ItemKey AND cl.NoteID = 29`,
    ),
    loadAxes(),
  ]);
  return rows.map((r) => {
    const cell = { itemKey: trim(r.ItemKey), fatherKey: trim(r.FItemKey), line: r.Line, col: r.Col,
      sizeNote: trim(r.sizeNote) || null, colorNote: trim(r.colorNote) || null };
    const labels = labelCell(cell, axes.get(cell.fatherKey));
    return { ...cell, sizeLabel: labels.sizeLabel ?? null, colorLabel: labels.colorLabel ?? null };
  });
}

// Orders a produced document (by its DocNumber) came from, walking BaseMoveID back up to two
// levels (invoice -> delivery note -> order). Small indexed lookups only.
async function ordersProducing(docNumber, orderDocIds) {
  const docs = await query(
    `SELECT ID FROM Stock WHERE DocNumber = @n AND DocumentID NOT IN (${orderDocIds.map(Number).join(',')})`,
    { n: docNumber },
  );
  let frontier = docs.map((d) => d.ID);
  const found = new Set();
  for (let level = 0; level < 2 && frontier.length; level++) {
    const ids = Object.fromEntries(frontier.slice(0, 50).map((id, i) => [`d${i}`, id]));
    const bases = await query(
      `SELECT DISTINCT b.StockID, b.DocumentID FROM StockMoves m JOIN StockMoves b ON b.ID = m.BaseMoveID
       WHERE m.StockID IN (${Object.keys(ids).map((k) => '@' + k).join(',')}) AND m.BaseMoveID > 0`,
      ids,
    );
    bases.filter((b) => orderDocIds.includes(b.DocumentID)).forEach((b) => found.add(b.StockID));
    frontier = bases.filter((b) => !orderDocIds.includes(b.DocumentID)).map((b) => b.StockID);
  }
  return [...found];
}

// --- documents screen: orders (doc 6/11) + the documents produced from them -----------
// Link (verified): a produced document's StockMoves.BaseMoveID = the source line's StockMoves.ID
// (Stock.BaseOrderStockId is unused, 0). Chains seen: 11->1, 6->4, 4->1, 6->1, 11->4, so two
// levels are followed (order -> delivery note -> invoice). Receipts (31) pay invoices through
// payment matching, not order lines, so they never appear here.
export async function getDocuments({
  agent, account, status = 'all', q, limit = 50, offset = 0, orderDocIds = [6, 11], picked, oldestFirst = false, from, to,
} = {}) {
  const params = {
    limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
    offset: Math.max(Number(offset) || 0, 0),
  };
  // Transfer customers (10830): their doc-19 transfers are their "orders" - in /documents and in
  // the picking queue (picked like orders, reply 54).
  const transfers = orderDocIds.includes(11)
    ? Object.entries(TRANSFER_ACCOUNTS).map(([acc, t]) => `(s.DocumentID = ${Number(t.documentId)} AND s.AccountKey = '${acc.replace(/'/g, '')}')`)
    : [];
  let where = `(s.DocumentID IN (${orderDocIds.map(Number).join(',')})${transfers.map((t) => ` OR ${t}`).join('')})`;
  if (agent) {
    where += ' AND a.Agent = @agent';
    params.agent = Number(agent);
  }
  // account = exact customer (wins over q). With agent, another agent's customer simply yields [].
  if (account) {
    where += ' AND s.AccountKey = @account';
    params.account = key(account);
    q = undefined;
  }
  // Date range on Stock.IssueDate (the row's `date`), inclusive. from/to are Date objects.
  if (from) {
    where += ' AND s.IssueDate >= @from';
    params.from = { type: sql.Date, value: from };
  }
  if (to) {
    where += ' AND s.IssueDate < DATEADD(day, 1, @to)';
    params.to = { type: sql.Date, value: to };
  }
  if (status === 'open') where += ' AND s.Status = 0';
  // picked = the warehouse app's marker ExtraText2 = 'לוקט - <picker>'
  if (picked === true) where += " AND s.ExtraText2 LIKE N'לוקט%'";
  else if (picked === false) where += " AND ISNULL(s.ExtraText2, '') NOT LIKE N'לוקט%'";
  else if (status === 'produced') where += ' AND s.Status <> 0';
  if (q) {
    params.q = { type: sql.NVarChar(100), value: `%${likeEscape(q)}%` };
    where += " AND (s.AccountName LIKE @q ESCAPE '!' OR a.FullName LIKE @q ESCAPE '!' OR s.AccountKey LIKE @q ESCAPE '!'";
    if (/^\d{1,9}$/.test(String(q).trim())) {
      params.qn = Number(q);
      // order number, its Hashavshevet number, or the number of a document produced from it
      where += ' OR s.ID = @qn OR s.DocNumber = @qn';
      const sources = await ordersProducing(Number(q), orderDocIds);
      if (sources.length) where += ` OR s.ID IN (${sources.map(Number).join(',')})`;
    }
    where += ')';
  }
  const orders = await query(
    `SELECT s.ID, s.DocNumber, s.DocumentID, d.DocName, s.AccountKey, s.AccountName, a.FullName, a.Agent,
            s.IssueDate, s.TFtal, s.Status, s.ExtraText2
     FROM Stock s
     LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey
     LEFT JOIN DocumentsDef d ON d.DocumentID = s.DocumentID
     WHERE ${where}
     ORDER BY s.ID ${oldestFirst ? 'ASC' : 'DESC'} OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    params,
  );
  if (!orders.length) return [];

  const produced = await producedDocsFor(orders.map((o) => o.ID));
  return orders.map((o) => toDocumentRow(o, produced.get(o.ID)));
}

// Warehouse app marker on the order: ExtraText2 = 'לוקט - <picker name>'.
function pickMarker(text) {
  const marker = trim(text) || undefined;
  const picked = Boolean(marker && marker.startsWith('לוקט'));
  return { picked, picker: picked ? marker.replace(/^לוקט\s*-?\s*/, '') || undefined : undefined, pickedMarker: marker };
}

const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : null);

// Documents produced from the given orders: level 1 (lines whose BaseMoveID points at an order
// line) and level 2 (documents produced from those). Map<orderId, rows>.
async function producedDocsFor(orderIds) {
  if (!orderIds.length) return new Map();
  const ids = Object.fromEntries(orderIds.map((id, i) => [`o${i}`, id]));
  const idList = Object.keys(ids).map((k) => `@${k}`).join(',');
  const produced = await query(
    `WITH lvl1 AS (
       SELECT DISTINCT o.StockID AS orderId, m.StockID AS docId
       FROM StockMoves o JOIN StockMoves m ON m.BaseMoveID = o.ID
       WHERE o.StockID IN (${idList}) AND m.StockID <> o.StockID),
     lvl2 AS (
       SELECT DISTINCT l.orderId, m.StockID AS docId
       FROM lvl1 l JOIN StockMoves b ON b.StockID = l.docId JOIN StockMoves m ON m.BaseMoveID = b.ID
       WHERE m.StockID <> l.docId)
     SELECT x.orderId, p.ID, p.DocumentID, d.DocName, p.DocNumber, p.IssueDate, p.TFtal
     FROM (SELECT orderId, docId FROM lvl1 UNION SELECT orderId, docId FROM lvl2) x
     JOIN Stock p ON p.ID = x.docId
     LEFT JOIN DocumentsDef d ON d.DocumentID = p.DocumentID
     ORDER BY p.ID`,
    ids,
  );
  return Map.groupBy(produced, (p) => p.orderId);
}

function toDocumentRow(o, produced = []) {
  return {
    stockId: o.ID,
    docNumber: o.DocNumber ?? 0,
    documentId: o.DocumentID,
    docTypeName: trim(o.DocName) ?? '',
    accountKey: trim(o.AccountKey),
    customerName: trim(o.AccountName) || trim(o.FullName) || '',
    agent: o.Agent || undefined,
    date: isoDate(o.IssueDate),
    total: o.TFtal ?? undefined,
    status: o.Status === 0 ? 'open' : 'produced',
    ...pickMarker(o.ExtraText2),
    producedDocs: produced.map((p) => ({
      stockId: p.ID,
      documentId: p.DocumentID,
      docTypeName: trim(p.DocName) ?? '',
      docNumber: p.DocNumber,
      date: isoDate(p.IssueDate),
      total: p.TFtal ?? undefined,
    })),
  };
}

// One customer document with its lines, for the export sheet (orders and the documents produced
// from them; supplier/purchase documents are not returned).
export async function getDocument(stockId) {
  const [o] = await query(
    `SELECT s.ID, s.DocNumber, s.DocumentID, d.DocName, s.AccountKey, s.AccountName, a.FullName, a.Agent,
            s.IssueDate, s.TFtal, s.TFtalVat, s.VatPrc, s.DiscountPrc, s.Status, s.Remarks, s.ExtraText2,
            s.${PICK_NOTES_FIELD} AS pickNotes,
            s.Address, s.City, s.Phone, a.Address AS accAddress, a.City AS accCity, a.Phone AS accPhone,
            a.EMail, a.TaxFileNum
     FROM Stock s
     LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey
     LEFT JOIN DocumentsDef d ON d.DocumentID = s.DocumentID
     WHERE s.ID = @id AND a.SortGroup IN (${CUSTOMER_SORT_GROUPS.map(Number).join(',')})`,
    { id: Number(stockId) },
  );
  if (!o) return null;
  const [lines, produced] = await Promise.all([
    query(
      `SELECT m.ID, m.Details, m.ItemKey, m.ItemName, m.Quantity, m.Unit, m.Price, m.DiscountPrc, m.TFtal, m.Tree, i.Quantity AS onHand
       FROM StockMoves m LEFT JOIN Items i ON i.ItemKey = m.ItemKey
       WHERE m.StockID = @id ORDER BY m.LineNoForSorting, m.ID`,
      { id: o.ID },
    ),
    producedDocsFor([o.ID]),
  ]);
  const shipping = new Set(Object.values(SHIPPING_ITEMS).map((s) => s.itemKey));
  return {
    ...toDocumentRow(o, produced.get(o.ID)),
    totalBeforeVat: o.TFtalVat ?? undefined,
    vatPct: o.VatPrc ?? undefined,
    orderDiscountPct: o.DiscountPrc || 0,
    remarks: trim(o.Remarks) || undefined,
    pickNotes: trim(o.pickNotes) || undefined, // picker notes written by POST /picking/:id/finish
    customer: {
      address: trim(o.Address) || trim(o.accAddress) || undefined,
      city: trim(o.City) || trim(o.accCity) || undefined,
      phone: trim(o.Phone) || trim(o.accPhone) || undefined,
      email: trim(o.EMail) || undefined,
      taxId: trim(o.TaxFileNum) || undefined,
    },
    lines: lines
      .filter((l) => l.Tree !== 2) // matrix cells under a tree parent would double-count
      .map((l) => ({
        itemkey: trim(l.ItemKey),
        lineId: l.ID,
        size: trim(l.Details) || undefined, // ruler size written by POST /orders (StockMoves.Details)
        name: trim(l.ItemName) ?? '',
        qty: l.Quantity,
        unit: trim(l.Unit) || undefined,
        unitPrice: l.Price,
        discountPct: l.DiscountPrc || 0,
        lineTotal: l.TFtal,
        onHand: l.onHand ?? undefined, // current general stock (Items.Quantity)
        ...(shipping.has(trim(l.ItemKey)) && { isShipping: true }),
      })),
  };
}

// Picking queue (read-only): open agent orders (doc 11, Status 0), oldest first.
// state 'waiting' = no picker marker yet; 'picked' = marked by the warehouse app, waiting for production.
export function getPickingQueue({ agent, account, q, state = 'waiting', limit = 200, offset = 0 } = {}) {
  return getDocuments({
    agent, account, q, limit, offset, status: 'open', orderDocIds: [11], picked: state === 'picked', oldestFirst: true,
  });
}

// Last activity per customer = newest order/delivery/invoice date (doc 1, 2, 4, 6, 11).
// One grouped read over the DocumentID index, cached for 15 minutes.
let activityCache;
export async function getLastActivity() {
  if (!activityCache || Date.now() - activityCache.at > 15 * 60_000) {
    const rows = query(
      `SELECT AccountKey, MAX(IssueDate) AS lastDate FROM Stock
       WHERE DocumentID IN (1, 2, 4, 6, 11) GROUP BY AccountKey`,
    ).then((list) => new Map(list.map((x) => [trim(x.AccountKey), x.lastDate])));
    activityCache = { at: Date.now(), rows };
    rows.catch(() => (activityCache = undefined));
  }
  return activityCache.rows;
}

// Size-ruler usage (reply 40): per ruler code (ExtraNotes NoteID 25 on the model), the newest sale
// date and how many of its items (model or matrix cell) sold in the last 12 months. Sales = lines of
// doc 1/2/4/11 in the last 2 years only (StockID range from an indexed ValueDate cut-off), so it stays
// a bounded read. Rulers with no sale in 2 years get lastSold null. Cached 12 h.
let rulerUsageCache;
export async function getRulerUsage() {
  if (!rulerUsageCache || Date.now() - rulerUsageCache.at > 12 * 3600_000) {
    const rows = query(
      `WITH cut AS (SELECT ISNULL(MIN(ID), 0) AS id FROM Stock WHERE ValueDate >= DATEADD(year, -2, GETDATE())),
       sold AS (
         SELECT m.ItemKey, MAX(m.StockID) AS lastStockId
         FROM StockMoves m CROSS JOIN cut
         WHERE m.StockID >= cut.id AND m.DocumentID IN (1, 2, 4, 11)
         GROUP BY m.ItemKey),
       rulerItems AS (
         SELECT n.KeF AS itemKey, LTRIM(RTRIM(n.Note)) AS ruler
         FROM ExtraNotes n WHERE n.NoteID = 25 AND LTRIM(RTRIM(ISNULL(n.Note, ''))) <> ''
         UNION
         SELECT c.ItemKey, LTRIM(RTRIM(n.Note))
         FROM ExtraNotes n JOIN IMatrixItems c ON c.FItemKey = n.KeF
         WHERE n.NoteID = 25 AND LTRIM(RTRIM(ISNULL(n.Note, ''))) <> '')
       SELECT r.ruler AS code, MAX(s.IssueDate) AS lastSold,
              COUNT(DISTINCT CASE WHEN s.IssueDate >= DATEADD(year, -1, GETDATE()) THEN r.itemKey END) AS items12m,
              COUNT(DISTINCT r.itemKey) AS items
       FROM rulerItems r
       LEFT JOIN sold x ON x.ItemKey = r.itemKey
       LEFT JOIN Stock s ON s.ID = x.lastStockId
       GROUP BY r.ruler ORDER BY r.ruler`,
    ).then((list) => list.map((r) => ({
      code: r.code,
      lastSold: r.lastSold instanceof Date ? r.lastSold.toISOString().slice(0, 10) : null,
      items12m: r.items12m,
      items: r.items,
    })));
    rulerUsageCache = { at: Date.now(), rows };
    rows.catch(() => (rulerUsageCache = undefined));
  }
  return rulerUsageCache.rows;
}
