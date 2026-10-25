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

// Notes field after a finish (reply 77): the existing lines (agent's 'הערת סוכן: …') stay, the
// picker's note goes on its own line below as 'הערת מלקט: …'. A re-run (admin re-opened the pick)
// REPLACES the previous picker line (also the older 'ליקוט: …' form). When the field is too short,
// the other text is shortened first so the picker's line survives.
export const PICK_PREFIX = 'הערת מלקט:';
const NL = '\r\n';
const isPickLine = (s) => s.startsWith(PICK_PREFIX) || s.startsWith('ליקוט:');
export function mergePickNotes(existing, notes, max = NOTES_MAX) {
  const others = (trim(existing) || '').split(/\r?\n| \| /).map((s) => s.trim()).filter((s) => s && !isPickLine(s));
  const pick = `${PICK_PREFIX} ${notes}`.slice(0, max);
  const room = max - pick.length - NL.length;
  const before = room > 0 ? others.join(NL).slice(0, room).trim() : '';
  return before ? `${before}${NL}${pick}` : pick;
}

export const pickKey = (itemKey, size) => (size ? `${itemKey}|${size}` : itemKey);

// Pure plan: which lines to reduce/delete. pickedQty per item is spread over that item's lines in
// line order; items not in `picked` and shipping lines are left untouched. A pick above the ordered
// qty is capped here: increases go ONLY through approveSurplus (manager-approved, reply 118).
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

// Pure plan for the packing/pallet lines: set to the picker's quantity. A line whose FINAL quantity
// is 0 is deleted - also when it was seeded 0 and left at 0, or not sent at all (reply 94: 117164's
// M1002 stayed in the document at 0).
export function planPacking(lines, picked, shipping) {
  const changes = [];
  const result = [];
  for (const line of lines) {
    const itemKey = trim(line.ItemKey);
    if (!shipping.has(itemKey)) continue;
    const sent = picked.has(itemKey);
    const qty = sent ? Math.max(picked.get(itemKey), 0) : (line.Quantity ?? 0);
    picked.delete(itemKey); // only the first line of that item takes it
    const base = { lineId: line.ID, price: line.Price, discountPrc: line.DiscountPrc ?? 0 };
    if (qty <= 0) {
      changes.push({ ...base, action: 'deleted', qty: 0 });
      result.push({ itemkey: itemKey, qty: 0, action: 'deleted' });
    } else if (qty === line.Quantity) {
      result.push({ itemkey: itemKey, qty, action: 'unchanged' });
    } else {
      changes.push({ ...base, action: 'reduced', qty });
      result.push({ itemkey: itemKey, qty, action: 'set' });
    }
  }
  return { changes, result };
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
    // Packing/pallet lines (M1001/M1002, reply 86): the picker's quantity is the real one - it may be
    // higher than the agent's seed; 0 deletes the line. Lines not sent are left as they are.
    const packing = planPacking(lines, picked, shipping);
    changes.push(...packing.changes);
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
      packing: packing.result,
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

// --- approve-surplus (reply 118) ---------------------------------------------------------------
// The ONLY path that increases a line: a manager approves a picker's surplus. Absolute set, never
// add: each body line names the Quantity it expects now (`ordered`) and the target (`newQty`). If
// the line no longer holds `ordered` (edited / re-picked / already approved) -> 409 STALE and nothing
// is written - which also makes a replay safe. One transaction, the Stock row + its lines locked.
const APPROVER_FIELD = 'ExtraText4'; // varchar(50), unused by staff (0 of 500 recent docs)
const APPROVER_MAX = 50;

export function validateSurplus(body) {
  const approver = trim(body?.approver);
  if (!approver || typeof approver !== 'string') throw new PickingError(400, 'BAD_REQUEST', 'חסר שם המאשר');
  if (!Array.isArray(body.lines) || !body.lines.length) throw new PickingError(400, 'BAD_REQUEST', 'חסרות שורות');
  if (body.lines.length > 200) throw new PickingError(400, 'BAD_REQUEST', 'יותר מדי שורות');
  const lines = body.lines.map((l) => {
    const itemkey = trim(l?.itemkey);
    const size = trim(l?.size) || undefined;
    if (!itemkey || typeof itemkey !== 'string') throw new PickingError(400, 'BAD_LINE', 'שורה לא תקינה');
    if (size != null && typeof size !== 'string') throw new PickingError(400, 'BAD_LINE', `מידה לא תקינה לפריט ${itemkey}`);
    const { ordered, newQty } = l;
    if (!Number.isFinite(ordered) || ordered < 0 || !Number.isSafeInteger(newQty) || !(newQty > ordered)) {
      throw new PickingError(422, 'BAD_QTY', `כמות לא תקינה לפריט ${itemkey} (נדרש: כמות חדשה שלמה וגדולה מהכמות שהוזמנה)`);
    }
    return { itemkey, size, ordered, newQty };
  });
  return { approver: approver.slice(0, APPROVER_MAX - 'עודף אושר - '.length), lines };
}

// Pure: match each request line to ONE document line (itemkey, + Details for a size line; not a
// packing line); the line must hold exactly `ordered` now. Among several candidates (same item on two
// lines) the LAST one holding `ordered` is taken. Returns [{ line, req }] or throws.
export function planSurplus(docLines, reqLines, shipping = new Set()) {
  const used = new Set();
  return reqLines.map((r) => {
    if (shipping.has(r.itemkey)) throw new PickingError(422, 'BAD_LINE', `${r.itemkey}: שורת אריזה אינה עודף`);
    const candidates = docLines.filter((l) => trim(l.ItemKey) === r.itemkey
      && (r.size ? trim(l.Details) === r.size : !trim(l.Details)) && !used.has(l.ID));
    if (!candidates.length) throw new PickingError(422, 'ITEM_NOT_IN_ORDER', `${r.itemkey}${r.size ? ` (${r.size})` : ''} אינו בהזמנה`);
    const match = candidates.filter((l) => l.Quantity === r.ordered).at(-1);
    if (!match) {
      throw new PickingError(409, 'STALE', `${r.itemkey}${r.size ? ` (${r.size})` : ''}: הכמות במסמך השתנתה (${candidates.map((l) => l.Quantity).join(', ')} במקום ${r.ordered})`);
    }
    used.add(match.ID);
    return { line: match, req: r };
  });
}

export async function approveSurplus(stockId, body, { dryRun = false } = {}) {
  const { approver, lines: reqLines } = validateSurplus(body);
  const id = Number(stockId);
  const shipping = new Set(Object.values(SHIPPING_ITEMS).map((s) => s.itemKey));
  const pool = await getPool('rw');
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const req = () => new sql.Request(tx).input('id', sql.Int, id);
  try {
    const [order] = (await req().query(
      'SELECT ID, DocumentID, Status, AccountKey, DiscountPrc, VatPrc FROM Stock WITH (UPDLOCK, ROWLOCK) WHERE ID = @id',
    )).recordset;
    if (!order) throw new PickingError(404, 'DOC_NOT_FOUND', `הזמנה ${id} לא נמצאה`);
    const transfer = TRANSFER_ACCOUNTS[trim(order.AccountKey)];
    const pickable = order.DocumentID === ORDER_DOCUMENT_IDS.picking || (transfer && order.DocumentID === transfer.documentId);
    if (!pickable || order.Status !== 0) throw new PickingError(409, 'NOT_OPEN', `הזמנה ${id} אינה פתוחה (כבר הופקה או סוג אחר)`);
    if (!writeAllowed(order.AccountKey)) {
      throw new PickingError(403, 'WRITE_DISABLED', 'כתיבה ללקוחות אמיתיים אינה מופעלת (ORDER_WRITE_ENABLED)');
    }
    const docLines = (await req().query(
      'SELECT ID, ItemKey, Details, Quantity, Price, DiscountPrc, Tree FROM StockMoves WITH (UPDLOCK) WHERE StockID = @id ORDER BY LineNoForSorting, ID',
    )).recordset;
    if (docLines.some((l) => l.Tree !== 0)) throw new PickingError(409, 'TREE_UNSUPPORTED', 'הזמנה עם פריטי עץ/מטריצה מקוננים - יש לטפל בחשבשבת');
    const plan = planSurplus(docLines, reqLines, shipping);

    const vat = 1 + (order.VatPrc ?? VAT_PRC) / 100;
    for (const { line, req: r } of plan) {
      // The document's own Price + DiscountPrc - never a client price.
      const total = round2(r.newQty * line.Price * (1 - (line.DiscountPrc ?? 0) / 100));
      const done = await req()
        .input('line', sql.Int, line.ID)
        .input('q', sql.Float, r.newQty)
        .input('was', sql.Float, r.ordered)
        .input('t', sql.Float, total)
        .input('tv', sql.Float, round2(total * vat))
        .query(
          `UPDATE StockMoves SET Quantity = @q, TFtal = @t, TftalVat = @tv,
             SupplyQuantity = @q, BaseQuantity = @q, PurchQuantity = @q
           WHERE ID = @line AND StockID = @id AND Quantity = @was`,
        );
      if (done.rowsAffected[0] !== 1) throw new PickingError(409, 'STALE', `${r.itemkey}: הכמות במסמך השתנתה`);
    }
    // Header totals from the lines - same math as finishPicking.
    const [sum] = (await req().query(
      `SELECT ISNULL(SUM(Quantity * Price * (1 - ISNULL(DiscountPrc, 0) / 100)), 0) AS net
       FROM StockMoves WHERE StockID = @id AND Tree IN (0, 1)`,
    )).recordset;
    const net = round2(sum.net);
    const gross = round2(sum.net * (1 - (order.DiscountPrc ?? 0) / 100) * (transfer ? 1 : vat));
    const marker = `עודף אושר - ${approver}`.slice(0, APPROVER_MAX);
    const upd = await req()
      .input('net', sql.Float, net)
      .input('gross', sql.Float, gross)
      .input('marker', sql.NVarChar(APPROVER_MAX), marker)
      .query(`UPDATE Stock SET TFtalVat = @net, TFtal = @gross, ${APPROVER_FIELD} = @marker WHERE ID = @id AND Status = 0`);
    if (upd.rowsAffected[0] !== 1) throw new PickingError(409, 'NOT_OPEN', `הזמנה ${id} השתנתה בזמן האישור`);

    if (dryRun) await tx.rollback();
    else await tx.commit();
    console.log(`surplus approved by ${approver} on ${id}${dryRun ? ' (dry run)' : ''}: `
      + plan.map(({ req: r }) => `${r.itemkey}${r.size ? `|${r.size}` : ''} ${r.ordered}->${r.newQty}`).join(', '));
    return {
      ok: true,
      stockId: id,
      dryRun,
      approver: marker,
      approverField: APPROVER_FIELD,
      lines: plan.map(({ req: r }) => ({ itemkey: r.itemkey, ...(r.size && { size: r.size }), from: r.ordered, to: r.newQty })),
      totals: { net, gross },
    };
  } catch (err) {
    await tx.rollback().catch(() => {});
    if (err?.number === SQL_PERMISSION_DENIED) throw new PickingError(501, 'NO_PERMISSION', 'לבריג\' אין הרשאת עדכון בחשבשבת');
    throw err;
  }
}
