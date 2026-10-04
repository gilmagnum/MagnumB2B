// "Finish picking" write-back (Gil, replies 31/32): on an open agent order (doc 11, Status 0),
// in ONE transaction:
//   - each line: pickedQty >= ordered -> unchanged; 0 < pickedQty < ordered -> reduce quantity and
//     its totals; pickedQty <= 0 -> delete the line
//   - recompute the header totals from the surviving lines
//   - Stock.ExtraText2 = 'לוקט - <picker>' (the marker the old warehouse app writes)
//   - picker notes -> Stock.ExtraRemarks (PICK_NOTES_FIELD), appended
// The document is never produced here - Hashavshevet users produce it manually.
// Needs on magnumapp: UPDATE on Stock, UPDATE + DELETE on StockMoves.
import { sql, getPool } from './db.js';
import { ORDER_DOCUMENT_IDS, SHIPPING_ITEMS, VAT_PRC, TEST_ACCOUNT_KEY, orderWriteEnabled } from './config.js';

// Header field for the picker's notes (varchar(250), unused on site orders). Whitelisted: it goes into SQL.
const NOTES_FIELDS = ['ExtraRemarks', 'Details'];
export const PICK_NOTES_FIELD = NOTES_FIELDS.includes(process.env.PICK_NOTES_FIELD) ? process.env.PICK_NOTES_FIELD : 'ExtraRemarks';
const NOTES_MAX = 250;
const MARKER_MAX = 50; // Stock.ExtraText2 varchar(50)

export class PickingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'PickingError';
    this.status = status;
    this.code = code;
  }
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const SQL_PERMISSION_DENIED = 229;

function validate(body) {
  const picker = trim(body?.picker);
  if (!picker) throw new PickingError(400, 'BAD_REQUEST', 'חסר שם מלקט');
  if (!Array.isArray(body.lines)) throw new PickingError(400, 'BAD_REQUEST', 'חסרות שורות');
  const picked = new Map();
  for (const l of body.lines) {
    const itemKey = trim(l?.itemkey);
    const qty = Number(l?.pickedQty);
    if (!itemKey || !Number.isFinite(qty)) throw new PickingError(400, 'BAD_LINE', 'שורה לא תקינה');
    picked.set(itemKey, (picked.get(itemKey) ?? 0) + Math.max(qty, 0));
  }
  return { picker, notes: trim(body.notes) || '', picked };
}

// Notes field after a finish: keep whatever else is there, but a re-run (admin re-opened the pick)
// REPLACES our previous 'ליקוט: …' segment instead of adding another one.
export function mergePickNotes(existing, notes) {
  const others = (trim(existing) || '').split(' | ').map((s) => s.trim()).filter((s) => s && !s.startsWith('ליקוט:'));
  return [...others, `ליקוט: ${notes}`].join(' | ').slice(0, NOTES_MAX);
}

// Pure plan: which lines to reduce/delete. pickedQty per item is spread over that item's lines in
// line order; items not in `picked` and shipping lines are left untouched.
export function planShortages(lines, picked, shipping = new Set()) {
  const remaining = new Map(picked);
  const changes = [];
  const shortages = [];
  for (const line of lines) {
    const itemKey = trim(line.ItemKey);
    if (shipping.has(itemKey) || !remaining.has(itemKey)) continue;
    const ordered = line.Quantity;
    const take = Math.min(remaining.get(itemKey), ordered);
    remaining.set(itemKey, remaining.get(itemKey) - take);
    if (take >= ordered) continue;
    const action = take <= 0 ? 'deleted' : 'reduced';
    changes.push({ lineId: line.ID, action, qty: Math.max(take, 0), price: line.Price, discountPrc: line.DiscountPrc ?? 0 });
    shortages.push({ itemkey: itemKey, ordered, picked: Math.max(take, 0), action });
  }
  return { changes, shortages };
}

/**
 * pickedQty per itemkey is spread over that item's lines in line order. Items not listed in
 * the request (and shipping lines) are left untouched. dryRun: everything runs, then ROLLBACK.
 * Returns { ok, stockId, dryRun, picker, notesField, shortages: [{itemkey, ordered, picked, action}], totals }.
 */
export async function finishPicking(stockId, body, { dryRun = false } = {}) {
  const { picker, notes, picked } = validate(body);
  const id = Number(stockId);
  const shipping = new Set(Object.values(SHIPPING_ITEMS).map((s) => s.itemKey));

  const pool = await getPool('rw');
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const req = () => new sql.Request(tx).input('id', sql.Int, id);
  try {
    // Lock the order row for the whole transaction and re-check it is still an open agent order.
    const [order] = (await req().query(
      `SELECT ID, DocumentID, Status, AccountKey, DiscountPrc, VatPrc, ${PICK_NOTES_FIELD} AS notes
       FROM Stock WITH (UPDLOCK, ROWLOCK) WHERE ID = @id`,
    )).recordset;
    if (!order) throw new PickingError(404, 'DOC_NOT_FOUND', `הזמנה ${id} לא נמצאה`);
    if (order.DocumentID !== ORDER_DOCUMENT_IDS.picking || order.Status !== 0) {
      throw new PickingError(409, 'NOT_OPEN', `הזמנה ${id} אינה הזמנת סוכן פתוחה (כבר הופקה או סוג אחר)`);
    }
    // Same safety switch as order writes: real customers only once ORDER_WRITE_ENABLED=1.
    if (trim(order.AccountKey) !== TEST_ACCOUNT_KEY && !orderWriteEnabled()) {
      throw new PickingError(403, 'WRITE_DISABLED', 'כתיבת ליקוט ללקוחות אמיתיים אינה מופעלת עדיין (ORDER_WRITE_ENABLED)');
    }
    const lines = (await req().query(
      `SELECT ID, ItemKey, Quantity, Price, DiscountPrc, Tree
       FROM StockMoves WITH (UPDLOCK) WHERE StockID = @id ORDER BY LineNoForSorting, ID`,
    )).recordset;
    if (lines.some((l) => l.Tree !== 0)) {
      throw new PickingError(409, 'TREE_UNSUPPORTED', 'הזמנה עם פריטי עץ/מטריצה מקוננים - יש לטפל בחשבשבת');
    }
    const orderKeys = new Set(lines.map((l) => trim(l.ItemKey)));
    const unknown = [...picked.keys()].filter((k) => !orderKeys.has(k));
    if (unknown.length) throw new PickingError(422, 'ITEM_NOT_IN_ORDER', `פריטים שאינם בהזמנה: ${unknown.join(', ')}`);

    const vat = 1 + (order.VatPrc ?? VAT_PRC) / 100;
    const { changes, shortages } = planShortages(lines, picked, shipping);
    for (const c of changes) {
      const r = req().input('line', sql.Int, c.lineId);
      if (c.action === 'deleted') {
        await r.query('DELETE FROM StockMoves WHERE ID = @line AND StockID = @id');
      } else {
        const total = round2(c.qty * c.price * (1 - c.discountPrc / 100));
        await r
          .input('q', sql.Float, c.qty)
          .input('t', sql.Float, total)
          .input('tv', sql.Float, round2(total * vat))
          .query(
            `UPDATE StockMoves SET Quantity = @q, TFtal = @t, TftalVat = @tv,
               SupplyQuantity = @q, BaseQuantity = @q, PurchQuantity = @q
             WHERE ID = @line AND StockID = @id`,
          );
      }
    }

    // Header totals from the surviving lines, the way issued documents store them:
    // TFtalVat = lines before the order discount, TFtal = TFtalVat x (1 - discount) x VAT.
    const [sum] = (await req().query(
      `SELECT ISNULL(SUM(Quantity * Price * (1 - ISNULL(DiscountPrc, 0) / 100)), 0) AS net
       FROM StockMoves WHERE StockID = @id AND Tree IN (0, 1)`,
    )).recordset;
    const net = round2(sum.net);
    const gross = round2(sum.net * (1 - (order.DiscountPrc ?? 0) / 100) * vat);
    const marker = `לוקט - ${picker}`.slice(0, MARKER_MAX);
    const noteText = notes ? mergePickNotes(order.notes, notes) : null;
    const upd = req()
      .input('net', sql.Float, net)
      .input('gross', sql.Float, gross)
      .input('marker', sql.NVarChar(MARKER_MAX), marker);
    if (noteText) upd.input('notes', sql.NVarChar(NOTES_MAX), noteText);
    const done = await upd.query(
      `UPDATE Stock SET TFtalVat = @net, TFtal = @gross, ExtraText2 = @marker
         ${noteText ? `, ${PICK_NOTES_FIELD} = @notes` : ''}
       WHERE ID = @id AND Status = 0`,
    );
    if (done.rowsAffected[0] !== 1) throw new PickingError(409, 'NOT_OPEN', `הזמנה ${id} השתנתה בזמן הליקוט`);

    if (dryRun) await tx.rollback();
    else await tx.commit();
    return {
      ok: true,
      stockId: id,
      dryRun,
      picker: marker,
      notesField: PICK_NOTES_FIELD,
      notes: noteText ?? trim(order.notes) ?? null,
      shortages,
      totals: { net, gross },
    };
  } catch (err) {
    await tx.rollback().catch(() => {});
    if (err?.number === SQL_PERMISSION_DENIED) {
      throw new PickingError(501, 'NO_PERMISSION', 'לבריג\' אין עדיין הרשאת עדכון/מחיקה בחשבשבת (GRANT חסר)');
    }
    throw err;
  }
}
