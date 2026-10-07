import { sql, getPool, bind, key } from './db.js';
import { getAccount, getItem, getItemRows, getTableColumns, getPrintStyle, getMatrixFathers } from './read.js';
import { resolvePrices } from './pricing.js';
import {
  ORDER_DOCUMENT_IDS,
  ORDER_WAREHOUSE,
  VAT_PRC,
  TRANSFER_ACCOUNTS,
  writeAllowed,
  SHIPPING_ITEMS,
  TREE_FLAT,
  DEFAULT_UNIT,
  HEADER_DEFAULTS,
  LINE_DEFAULTS,
} from './config.js';

export class OrderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
  }
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const SIZE_MAX = 20; // StockMoves.Details varchar(20)
const ITEM_NAME_MAX = 100; // StockMoves.ItemName varchar(100)
const UNIT_FIELD = { carton: 'perCarton', bundle: 'perPack' }; // ExtraSums SuFID 5 / 6

let columnsCache;
async function tableColumns() {
  columnsCache ??= Promise.all([getTableColumns('Stock'), getTableColumns('StockMoves')]).then(
    ([stock, moves]) => ({ Stock: stock, StockMoves: moves }),
    (err) => {
      columnsCache = undefined;
      throw err;
    },
  );
  return columnsCache;
}

// Keeps `required` as-is, drops `optional` values that are empty or whose column
// does not exist, then verifies the row against the real table definition.
function fitRow(table, columns, { required, optional }) {
  const byName = new Map(columns.map((c) => [c.name.toLowerCase(), c]));
  const row = {};
  for (const [name, value] of Object.entries(required)) {
    if (!byName.has(name.toLowerCase())) throw new OrderError('SCHEMA', `העמודה ${table}.${name} לא קיימת במסד`);
    row[name] = value;
  }
  for (const [name, value] of Object.entries(optional)) {
    if (value != null && byName.has(name.toLowerCase())) row[name] = value;
  }
  const given = new Set(Object.keys(row).map((n) => n.toLowerCase()));
  const missing = columns.filter(
    (c) => !c.nullable && !c.hasDefault && !c.identity && !c.computed && c.type !== 'timestamp' && !given.has(c.name.toLowerCase()),
  );
  if (missing.length) {
    throw new OrderError('SCHEMA', `עמודות חובה ב-${table} ללא ערך: ${missing.map((c) => c.name).join(', ')}`);
  }
  for (const [name, value] of Object.entries(row)) {
    const col = byName.get(name.toLowerCase());
    if (typeof value !== 'string' || col.maxLength < 0 || !/char$/.test(col.type)) continue;
    const maxChars = col.type.startsWith('n') ? col.maxLength / 2 : col.maxLength;
    if (value.length > maxChars) {
      throw new OrderError('TOO_LONG', `הערך בשדה ${table}.${name} ארוך מדי (מקסימום ${maxChars} תווים)`);
    }
  }
  return row;
}

// Free text cut to the column's size (null when empty).
function fitText(columns, name, text) {
  if (!text) return null;
  const col = columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!col || col.maxLength < 0) return text;
  return text.slice(0, col.type.startsWith('n') ? col.maxLength / 2 : col.maxLength);
}

async function insertRow(tx, table, row) {
  const names = Object.keys(row);
  const params = Object.fromEntries(names.map((n, i) => [`p${i}`, row[n]]));
  const result = await bind(new sql.Request(tx), params).query(
    `INSERT INTO [${table}] (${names.map((n) => `[${n}]`).join(', ')})
     VALUES (${names.map((_, i) => `@p${i}`).join(', ')});
     SELECT CAST(SCOPE_IDENTITY() AS int) AS id;`,
  );
  return result.recordset[0].id;
}

// Reads the uncommitted order back inside the transaction. magnumapp may lack
// SELECT on these tables - then verification is reported as unavailable.
async function readBack(tx, orderId) {
  try {
    // Sequential: a transaction owns a single connection.
    const request = () => new sql.Request(tx).input('id', sql.Int, orderId);
    const header = await request().query('SELECT * FROM Stock WHERE ID = @id');
    const lines = await request().query('SELECT * FROM StockMoves WHERE StockID = @id ORDER BY LineNoForSorting, ID');
    return { header: header.recordset[0], lines: lines.recordset };
  } catch (err) {
    return { error: err.message };
  }
}

function validate(order) {
  if (!order?.accountKey) throw new OrderError('NO_ACCOUNT', 'יש לבחור לקוח לפני יצירת הזמנה');
  if (!((order.orderKind ?? 'picking') in ORDER_DOCUMENT_IDS)) throw new OrderError('BAD_KIND', 'סוג הזמנה לא תקין');
  if (!Array.isArray(order.lines) || !order.lines.length) throw new OrderError('NO_LINES', 'ההזמנה ריקה');
  for (const line of order.lines) {
    if (!line.itemkey) throw new OrderError('BAD_LINE', 'חסר מק"ט בשורה');
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new OrderError('BAD_LINE', `כמות לא תקינה לפריט ${line.itemkey}`);
    if (!(line.unit in UNIT_FIELD)) throw new OrderError('BAD_LINE', `יחידת הזמנה לא תקינה לפריט ${line.itemkey} (קרטון/חבילה)`);
    if (line.size != null && (typeof line.size !== 'string' || !line.size.trim() || line.size.trim().length > SIZE_MAX)) {
      throw new OrderError('BAD_LINE', `מידה לא תקינה לפריט ${line.itemkey} (עד ${SIZE_MAX} תווים)`);
    }
    if (line.price != null && !(line.price >= 0)) throw new OrderError('BAD_LINE', `מחיר לא תקין לפריט ${line.itemkey}`);
    const discount = line.discountPct ?? 0;
    if (!(discount >= 0 && discount <= 100)) throw new OrderError('BAD_LINE', `הנחה לא תקינה לפריט ${line.itemkey}`);
  }
  const orderDiscount = order.orderDiscountPct ?? 0;
  if (!(orderDiscount >= 0 && orderDiscount < 100)) throw new OrderError('BAD_DISCOUNT', 'הנחת הזמנה לא תקינה');
  if (order.note != null && typeof order.note !== 'string') throw new OrderError('BAD_NOTE', 'הערה לא תקינה');
  for (const [kind, qty] of Object.entries(order.shipping ?? {})) {
    if (!(kind in SHIPPING_ITEMS) || !Number.isInteger(qty) || qty < 0) throw new OrderError('BAD_SHIPPING', 'נתוני משלוח לא תקינים');
  }
}

/**
 * Creates an order in Hashavshevet as a temporary, un-issued document
 * (DocNumber 0, Status 0, flat Tree=0 lines). The order number is Stock.ID.
 * Body shape = shared/contract.md POST /orders:
 *
 * order = {
 *   orderDiscountPct?: header-level discount % (default 0),
 *   accountKey, orderKind: 'picking' (DocumentID 11) | 'future' (DocumentID 6), remarks?,
 *   lines: [{ itemkey, qty, unit: 'carton' | 'bundle', price?, discountPct? }],   // matrix: one line per cell SKU
 *   shipping?: { carton?: qty, pallet?: qty },                                    // M1001 / M1002, price 0
 * }
 *
 * qty is in cartons/bundles; the line Quantity written is units (ExtraSums SuFID 5/6).
 * Price = the bridge resolver's base price + discount % (the app's price only when unresolved).
 *
 * Dry run by default: inserted inside a transaction, read back, rolled back.
 * Pass { commit: true } to keep the order.
 */
export async function writeOrder(order, { commit = false } = {}) {
  validate(order);
  const accountKey = String(order.accountKey).trim();
  const orderKind = order.orderKind ?? 'picking';
  // Transfer customers (10830): an inter-warehouse transfer (doc 19) instead of an order, whatever the kind.
  const transfer = TRANSFER_ACCOUNTS[accountKey];
  const documentId = transfer ? transfer.documentId : ORDER_DOCUMENT_IDS[orderKind];
  const lineWarehouse = transfer ? transfer.toWarehouse : ORDER_WAREHOUSE;
  if (commit && !writeAllowed(accountKey)) {
    throw new OrderError('WRITE_DISABLED', 'כתיבת הזמנות ללקוחות אמיתיים אינה מופעלת (ORDER_WRITE_ENABLED)');
  }

  const itemKeys = [...new Set(order.lines.map((l) => String(l.itemkey).trim()))];
  const shippingKeys = Object.values(SHIPPING_ITEMS).map((s) => s.itemKey);
  const [account, items, rows, columns, printStyle] = await Promise.all([
    getAccount(accountKey),
    Promise.all(itemKeys.map((k) => getItem(k))),
    getItemRows([...itemKeys, ...shippingKeys]),
    tableColumns(),
    getPrintStyle(accountKey, documentId),
  ]);
  if (!account) throw new OrderError('ACCOUNT_NOT_FOUND', `הלקוח ${accountKey} לא נמצא`);
  if (Number(account.Dumi ?? 0) !== 0) throw new OrderError('ACCOUNT_INACTIVE', `הלקוח ${accountKey} אינו פעיל`);

  const itemByKey = new Map(itemKeys.map((k, i) => [k, items[i]]));

  // Matrix cell SKUs carry no extra fields of their own: "shown on site", pack sizes and
  // "ignore stock" come from the parent model. Stock and price stay per cell.
  const fathers = await getMatrixFathers(itemKeys);
  const fatherKeys = [...new Set(fathers.values())];
  const fatherItems = new Map(await Promise.all(fatherKeys.map(async (k) => [k, await getItem(k)])));
  for (const [cellKey, fatherKey] of fathers) {
    const cell = itemByKey.get(cellKey);
    const father = fatherItems.get(fatherKey);
    if (!cell || !father) continue;
    itemByKey.set(cellKey, {
      ...cell,
      shownOnSite: father.shownOnSite,
      ignoreStock: father.ignoreStock,
      perCarton: cell.perCarton || father.perCarton,
      perPack: cell.perPack || father.perPack,
    });
  }
  const unitsByItem = new Map();
  const checked = order.lines.map((line) => {
    const itemKey = String(line.itemkey).trim();
    const item = itemByKey.get(itemKey);
    if (!item) throw new OrderError('ITEM_NOT_FOUND', `הפריט ${itemKey} לא נמצא`);
    if (!item.active) throw new OrderError('ITEM_INACTIVE', `הפריט ${itemKey} אינו פעיל`);
    if (!item.shownOnSite) throw new OrderError('ITEM_HIDDEN', `הפריט ${itemKey} אינו פתוח להזמנה באתר`);
    const perUnit = item[UNIT_FIELD[line.unit]];
    if (!(perUnit > 0)) {
      throw new OrderError('NO_PACKING', `לפריט ${itemKey} אין כמות ${line.unit === 'carton' ? 'בקרטון' : 'בחבילה'} - לא ניתן להזמין`);
    }
    const quantity = line.qty * perUnit;
    unitsByItem.set(itemKey, (unitsByItem.get(itemKey) ?? 0) + quantity);
    return { line, itemKey, quantity };
  });

  // Quantity tiers of special prices count the total units per item.
  // Packing/pallet lines (M1001/M1002) are priced like any item for this customer (reply 86).
  const prices = await resolvePrices(accountKey, [...itemKeys, ...(transfer ? [] : shippingKeys)], {
    quantities: Object.fromEntries(unitsByItem),
  });
  // Reply 68: the bridge's resolution is authoritative (special > discount code > price list) and
  // the line carries the BASE price + discount % separately. The app's price is only a fallback
  // when the resolver has no price; a disagreement is logged (net per unit) for follow-up.
  const orderLines = checked.map(({ line, itemKey, quantity }) => {
    const resolved = prices.get(itemKey);
    const useResolved = resolved?.price > 0;
    const price = useResolved ? resolved.price : line.price;
    if (!(price >= 0)) throw new OrderError('NO_PRICE', `לא נמצא מחיר לפריט ${itemKey}`);
    const discountPrc = useResolved ? (resolved.discountPrc ?? 0) : (line.discountPct ?? 0);
    const out = {
      itemKey, quantity, price, discountPrc, size: line.size?.trim() || undefined,
      priceSource: useResolved ? resolved.source : 'web',
    };
    if (useResolved && line.price != null) {
      const webNet = round2(line.price * (1 - (line.discountPct ?? 0) / 100));
      const net = round2(price * (1 - discountPrc / 100));
      if (Math.abs(webNet - net) >= 0.01) {
        out.webNet = webNet;
        console.log(`price differs ${accountKey}/${itemKey}: web ${webNet} vs bridge ${net} (${resolved.source})`);
      }
    }
    return out;
  });

  // Picking orders only for what is in stock, unless the item ignores stock.
  if (orderKind === 'picking') {
    for (const [itemKey, units] of unitsByItem) {
      const item = itemByKey.get(itemKey);
      if (!item.ignoreStock && units > (item.stock ?? 0)) {
        throw new OrderError('NO_STOCK', `אין מספיק מלאי לפריט ${itemKey} (במלאי ${item.stock ?? 0}, הוזמנו ${units})`);
      }
    }
  }

  // Picking orders always carry both packing/pallet lines, last (qty = the agent's seed, default 0;
  // the picker sets the real quantity on finish - reply 86). Priced at the customer's price.
  // Future orders and transfers never get them.
  const shippingLines = orderKind !== 'picking' || transfer ? [] : Object.entries(SHIPPING_ITEMS).map(([kind, s]) => {
    const p = prices.get(s.itemKey);
    return {
      itemKey: s.itemKey,
      quantity: order.shipping?.[kind] ?? 0,
      price: p?.price ?? 0,
      discountPrc: p?.discountPrc ?? 0,
      fallbackName: s.name,
      priceSource: p?.source ?? 'shipping',
      shipping: true,
    };
  });
  const allLines = [...orderLines, ...shippingLines];

  // Hashavshevet stores dates as midnight; the driver sends Date objects as UTC.
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const vat = 1 + VAT_PRC / 100;

  // Flat lines like the app: LineNum 0, LineNoForSorting 100, 200, ...
  let net = 0;
  const moves = allLines.map((line, i) => {
    const row = rows.get(line.itemKey);
    if (!row) throw new OrderError('ITEM_NOT_FOUND', `הפריט ${line.itemKey} לא נמצא`);
    const exact = line.quantity * line.price * (1 - line.discountPrc / 100);
    net += exact;
    const total = round2(exact);
    const optional = {
      ...LINE_DEFAULTS,
      // Ruler products: one line per size; the size goes to Details ('פרטים') and is appended to the
      // line name so it shows on Hashavshevet's printed documents too.
      ItemName: line.size ? `${trim(row.ItemName) || ''} - מידה ${line.size}`.slice(0, ITEM_NAME_MAX) : trim(row.ItemName) || line.fallbackName,
      Details: line.size,
      Unit: line.shipping ? DEFAULT_UNIT : trim(row.SalesUnit) || DEFAULT_UNIT,
      Agent: account.Agent,
      LineNum: 0,
      DueDate: today,
      ExpireDate: today,
      OPrice: line.price,
      TftalVat: round2(total * vat),
      SupplyQuantity: line.quantity,
      BaseQuantity: line.quantity,
      PurchQuantity: line.quantity,
    };
    // The app leaves the extra dates empty on shipping lines.
    if (line.shipping) {
      delete optional.ExtraDate1;
      delete optional.ExtraDate2;
    }
    return {
      required: {
        StockID: null, // set once the header exists
        DocumentID: documentId,
        Status: 0,
        ItemKey: key(trim(row.ItemKey)),
        Tree: TREE_FLAT,
        Quantity: line.quantity,
        Price: line.price,
        DiscountPrc: line.discountPrc,
        TFtal: total,
        LineNoForSorting: (i + 1) * 100,
        Warehouse: lineWarehouse,
      },
      optional,
    };
  });

  // Like Hashavshevet: totals come from the unrounded line sums.
  // Like issued Hashavshevet documents: TFtalVat = lines before the order discount,
  // DiscountPrc/DiscountPrcR = order discount %, TFtal = TFtalVat x (1 - discount) x VAT.
  const orderDiscountPct = order.orderDiscountPct ?? 0;
  const totals = {
    net: round2(net),
    orderDiscountPct,
    netAfterDiscount: round2(net * (1 - orderDiscountPct / 100)),
    vatPrc: VAT_PRC,
    // Transfers carry no VAT on the header (TFtal = TFtalVat = net), as on Hashavshevet's doc 19.
    gross: round2(net * (1 - orderDiscountPct / 100) * (transfer ? 1 : vat)),
  };

  const header = fitRow('Stock', columns.Stock, {
    required: {
      DocumentID: documentId,
      DocNumber: 0,
      Status: 0,
      CloseType: 0,
      AccountKey: key(trim(account.AccountKey)),
      TFtal: totals.gross, // incl. VAT
      TFtalVat: transfer ? totals.gross : totals.net, // lines, before the order discount (transfer: = TFtal)
      DiscountPrc: orderDiscountPct,
      DiscountPrcR: orderDiscountPct,
      VatPrc: VAT_PRC,
      Warehouse: lineWarehouse, // transfer: destination warehouse
    },
    optional: {
      ...HEADER_DEFAULTS,
      ...(transfer && { TransStore: transfer.fromWarehouse }), // transfer: source warehouse
      PrintStyle: printStyle,
      // Agent's order note (reply 70) + remarks -> Stock.Remarks ("הערות"), cut to the column size.
      // Line 1 'הערת סוכן: …' (reply 77); the picker's line is added under it on finish.
      Remarks: fitText(columns.Stock, 'Remarks', [order.note?.trim() && `הערת סוכן: ${order.note.trim()}`, order.remarks?.trim()]
        .filter(Boolean).join('\r\n')),
      AccountName: trim(account.FullName),
      Address: trim(account.Address),
      City: trim(account.City),
      Phone: trim(account.Phone),
      Osek874: trim(account.TaxFileNum),
      ContactMail: trim(account.EMail),
      Agent: account.Agent,
      ValueDate: today,
      DueDate: today,
      IssueDate: today,
    },
  });
  // Pre-flight every line before opening the transaction.
  for (const move of moves) fitRow('StockMoves', columns.StockMoves, move);

  const pool = await getPool('rw');
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const orderId = await insertRow(tx, 'Stock', header);
    for (const move of moves) {
      await insertRow(tx, 'StockMoves', fitRow('StockMoves', columns.StockMoves, {
        required: { ...move.required, StockID: orderId },
        optional: move.optional,
      }));
    }
    const written = commit ? undefined : await readBack(tx, orderId);
    if (commit) await tx.commit();
    else await tx.rollback();
    return {
      orderId,
      committed: commit,
      dryRun: !commit,
      documentId,
      accountKey,
      totals,
      ...(transfer && { transfer: { from: transfer.fromWarehouse, to: transfer.toWarehouse } }),
      lines: allLines.map(({ itemKey, quantity, price, discountPrc, size, priceSource, webNet }) => ({
        itemKey, quantity, price, discountPrc, ...(size && { size }), priceSource, ...(webNet != null && { webNet }),
      })),
      ...(written && { written }),
    };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}
