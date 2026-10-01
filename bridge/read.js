import { query, key } from './db.js';
import { NOTE_FIELDS, SUM_FIELDS, FLAG_FIELDS } from './config.js';

const ACTIVE = 'ISNULL(Dumi, 0) <> 1';
const ITEM_COLUMNS =
  'ItemKey, ItemName, ForignName, Price, BarCode, DiscountCode, MatrixFlag, SuF4, Quantity, SalesUnit';

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

// Active accounts; pass agent to get only that agent's customers.
export function getAccounts({ agent } = {}) {
  const where = agent == null ? '' : ' AND Agent = @agent';
  return query(
    `SELECT AccountKey, FullName, Agent, DiscountCode, TFtalDiscount, CreditTermsCode
     FROM Accounts WHERE ${ACTIVE}${where} ORDER BY FullName`,
    agent == null ? {} : { agent },
  );
}

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
