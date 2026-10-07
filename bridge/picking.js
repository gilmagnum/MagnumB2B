// "Finish picking" write-back (Gil, replies 31/32): on an open agent order (doc 11, Status 0),
// in ONE transaction:
//   - each line: pickedQty >= ordered -> unchanged; 0 < pickedQty < ordered -> reduce quantity and
//     its totals; pickedQty <= 0 -> delete the line
//   - recompute the header totals from the surviving lines
//   - Stock.ExtraText2 = 'לוקט - <picker>' (the marker the old warehouse app writes)
//   - picker notes -> Stock.Remarks (PICK_NOTES_FIELD; the document's visible "הערות", reply 74), appended
// The document is never produced here - Hashavshevet users produce it manually.
// Needs on magnumapp: UPDATE on Stock, UPDATE + DELETE on StockMoves.
import { sql, getPool } from './db.js';
import { ORDER_DOCUMENT_IDS, SHIPPING_ITEMS, VAT_PRC, TRANSFER_ACCOUNTS, writeAllowed } from './config.js';

// Header field for the picker's notes (varchar(250), unused on site orders). Whitelisted: it goes into SQL.
const NOTES_FIELDS = ['Remarks', 'ExtraRemarks', 'Details'];
export const PICK_NOTES_FIELD = NOTES_FIELDS.includes(process.env.PICK_NOTES_FIELD) ? process.env.PICK_NOTES_FIELD : 'Remarks';
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
  // Key = itemkey, or itemkey + size for ruler products (one order line per size, size in Details).
  const picked = new Map();
  for (const l of body.lines) {
    const itemKey = trim(l?.itemkey);
    const qty = Number(l?.pickedQty);
    if (!itemKey || !Number.isFinite(qty)) throw new PickingError(400, 'BAD_LINE', 'שורה לא תקינה');
    const k = pickKey(itemKey, trim(l?.size));
    picked.set(k, (picked.get(k) ?? 0) + Math.max(qty, 0));
  }
  return { picker, notes: trim(body.notes) || '', picked };
}

// Notes field after a finish: keep whatever else is there, but a re-run (admin re-opened the pick)
// REPLACES our previous 'ליקוט: …' segment instead of adding another one. When the field is too
// short, the other text (e.g. the agent's note) is shortened first so the picker's note survives.
export function mergePickNotes(existing, notes, max = NOTES_MAX) {
  const others = (trim(existing) || '').split(' | ').map((s) => s.trim()).filter((s) => s && !s.startsWith('ליקוט:'));
  const pick = `ליקוט: ${notes}`.slice(0, max);
  const room = max - pick.length - 3;
  const before = room > 0 ? others.join(' | ').slice(0, room).trim() : '';
  return before ? `${before} | ${pick}` : pick;
}

export const pickKey = (itemKey, size) => (size ? `${itemKey}|${size}` : itemKey);

// Pure plan: which lines to reduce/delete. pickedQty per item is spread over that item's lines in
// line order; items not in `picked` and shipping lines are left untouched.
export function planShortages(lines, picked, shipping = new Set()) {
  const remaining = new Map(picked);
  const changes = [];
  const shortages = [];
  for (const line of lines) {
    const itemKey = trim(line.ItemKey);
    if (shipping.has(itemKey)) continue;
    // A size-specific entry targets exactly that size's line; otherwise the item-level entry applies.
    const size = trim(line.Details) || undefined;
    const k = size && remaining.has(pickKey(itemKey, size)) ? pickKey(itemKey, size) : itemKey;
    if (!remaining.has(k)) continue;
    const ordered = line.Quantity;
    const take = Math.min(remaining.get(k), ordered);
    remaining.set(k, remaining.get(k) - take);
    if (take >= ordered) continue;
    const action = take <= 0 ? 'deleted' : 'reduced';
    changes.push({ lineId: line.ID, action, qty: Math.max(take, 0), price: line.Price, discountPrc: line.DiscountPrc ?? 0 });
    shortages.push({ itemkey: itemKey, ...(size && { size }), ordered, picked: Math.max(take, 0), action });
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
      `SELECT ID, DocumentID, Status, AccountKey, DiscountPrc, VatPrc, ${PICK_NOTES_FIELD} AS notes,
              (SELECT CASE WHEN c.max_length < 0 THEN 4000 WHEN t.name LIKE 'n%' THEN c.max_length / 2 ELSE c.max_length END
               FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
               WHERE c.object_id = OBJECT_ID('Stock') AND c.name = '${PICK_NOTES_FIELD}') AS notesMax
       FROM Stock WITH (UPDLOCK, ROWLOCK) WHERE ID = @id`,
    )).recordset;
    if (!order) throw new PickingError(404, 'DOC_NOT_FOUND', `הזמנה ${id} לא נמצאה`);
    // Open agent order (doc 11), or an open transfer (doc 19) of a transfer customer such as 10830.
    const transfer = TRANSFER_ACCOUNTS[trim(order.AccountKey)];
    const pickable = order.DocumentID === ORDER_DOCUMENT_IDS.picking || (transfer && order.DocumentID === transfer.documentId);
    if (!pickable || order.Status !== 0) {
      throw new PickingError(409, 'NOT_OPEN', `הזמנה ${id} אינה הזמנת סוכן פתוחה (כבר הופקה או סוג אחר)`);
    }
    // Same safety switch as order writes: real customers only once ORDER_WRITE_ENABLED=1.
    if (!writeAllowed(order.AccountKey)) {
      throw new PickingError(403, 'WRITE_DISABLED', 'כתיבת ליקוט ללקוחות אמיתיים אינה מופעלת עדיין (ORDER_WRITE_ENABLED)');
    }
    const lines = (await req().query(
      `SELECT ID, ItemKey, Details, Quantity, Price, DiscountPrc, Tree
       FROM StockMoves WITH (UPDLOCK) WHERE StockID = @id ORDER BY LineNoForSorting, ID`,
    )).recordset;
    if (lines.some((l) => l.Tree !== 0)) {
      throw new PickingError(409, 'TREE_UNSUPPORTED', 'הזמנה עם פריטי עץ/מטריצה מקוננים - יש לטפל בחשבשבת');
    }
    const orderKeys = new Set(lines.flatMap((l) => [trim(l.ItemKey), pickKey(trim(l.ItemKey), trim(l.Details))]));
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
    // Transfers carry no VAT on the header (TFtal = TFtalVat).
    const gross = round2(sum.net * (1 - (order.DiscountPrc ?? 0) / 100) * (transfer ? 1 : vat));
    const marker = `לוקט - ${picker}`.slice(0, MARKER_MAX);
    const notesMax = Math.min(order.notesMax || NOTES_MAX, 4000);
    const noteText = notes ? mergePickNotes(order.notes, notes, notesMax) : null;
    const upd = req()
      .input('net', sql.Float, net)
      .input('gross', sql.Float, gross)
      .input('marker', sql.NVarChar(MARKER_MAX), marker);
    if (noteText) upd.input('notes', sql.NVarChar(notesMax), noteText);
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
