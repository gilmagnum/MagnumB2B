// node --test test/  (pure logic only - no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import { planShortages } from '../bridge/picking.js';

const line = (ID, ItemKey, Quantity, Price = 10, DiscountPrc = 0) => ({ ID, ItemKey, Quantity, Price, DiscountPrc, Tree: 0 });
const ship = new Set(['M1001', 'M1002']);

test('full pick changes nothing', () => {
  const r = planShortages([line(1, 'A', 10)], new Map([['A', 10]]), ship);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.shortages, []);
});

test('partial pick reduces, zero deletes', () => {
  const r = planShortages([line(1, 'A', 10, 20.5, 10), line(2, 'B', 5)], new Map([['A', 4], ['B', 0]]), ship);
  assert.deepEqual(r.changes, [
    { lineId: 1, action: 'reduced', qty: 4, price: 20.5, discountPrc: 10 },
    { lineId: 2, action: 'deleted', qty: 0, price: 10, discountPrc: 0 },
  ]);
  assert.deepEqual(r.shortages.map((s) => s.action), ['reduced', 'deleted']);
});

test('finish never increases: an over-pick is capped (increases only via approve-surplus, reply 118)', () => {
  assert.deepEqual(planShortages([line(1, 'A', 10)], new Map([['A', 15]]), ship).changes, []);
  assert.deepEqual(planShortages([line(1, 'A', 6), line(2, 'A', 6)], new Map([['A', 14]]), ship).changes, []);
});

test('same item on two lines: picked qty fills lines in order', () => {
  const r = planShortages([line(1, 'A', 6), line(2, 'A', 6)], new Map([['A', 8]]), ship);
  assert.deepEqual(r.changes.map((c) => [c.lineId, c.action, c.qty]), [[2, 'reduced', 2]]);
});

test('unlisted items and shipping lines are untouched', () => {
  const r = planShortages([line(1, 'A', 5), line(2, 'M1001', 1, 0), line(3, 'B', 3)], new Map([['A', 5], ['M1001', 0]]), ship);
  assert.deepEqual(r.changes, []);
});

test('item keys are trimmed (Hashavshevet pads varchar)', () => {
  const r = planShortages([line(1, 'A   ', 5)], new Map([['A', 0]]), ship);
  assert.equal(r.changes[0].action, 'deleted');
});

test('notes: appended to other text, a re-run replaces the previous pick note', async () => {
  const { mergePickNotes } = await import('../bridge/picking.js');
  assert.equal(mergePickNotes(null, 'חסר X'), 'הערת מלקט: חסר X');
  assert.equal(mergePickNotes('הערת סוכן: דחוף', 'חסר X'), 'הערת סוכן: דחוף\r\nהערת מלקט: חסר X');
  assert.equal(mergePickNotes('הערת סוכן: דחוף\r\nהערת מלקט: חסר X', 'הכל סופק'), 'הערת סוכן: דחוף\r\nהערת מלקט: הכל סופק');
  assert.equal(mergePickNotes('הערת משרד | ליקוט: ישן', 'חדש'), 'הערת משרד\r\nהערת מלקט: חדש'); // older layout
  // A short field: the agent's note is cut first, the picker's note is kept whole.
  assert.equal(mergePickNotes('הערת סוכן: להתקשר לפני', 'חסר X', 30), 'הערת סוכן: ל\r\nהערת מלקט: חסר X');
});

test('ruler sizes: a size entry targets only that size line', async () => {
  const { planShortages: plan, pickKey } = await import('../bridge/picking.js');
  const sized = (ID, size, Quantity) => ({ ID, ItemKey: 'BR19625', Details: size, Quantity, Price: 11, DiscountPrc: 0, Tree: 0 });
  const lines = [sized(1, '2-4', 25), sized(2, '6-8', 10)];
  const r = plan(lines, new Map([[pickKey('BR19625', '2-4'), 25], [pickKey('BR19625', '6-8'), 4]]), ship);
  assert.deepEqual(r.changes.map((c) => [c.lineId, c.action, c.qty]), [[2, 'reduced', 4]]);
  assert.deepEqual(r.shortages, [{ itemkey: 'BR19625', size: '6-8', ordered: 10, picked: 4, action: 'reduced' }]);
  // item-level entry (no size) still spreads over the lines in order
  const all = plan(lines, new Map([['BR19625', 30]]), ship);
  assert.deepEqual(all.changes.map((c) => [c.lineId, c.action, c.qty]), [[2, 'reduced', 5]]);
});

test('planPacking: picker quantity on M1001/M1002 (increase, 0 deletes, untouched when absent)', async () => {
  const { planPacking } = await import('../bridge/picking.js');
  const lines = [
    { ID: 1, ItemKey: 'A', Quantity: 10, Price: 5 },
    { ID: 2, ItemKey: 'M1001', Quantity: 0, Price: 20, DiscountPrc: 0 },
    { ID: 3, ItemKey: 'M1002', Quantity: 1, Price: 90, DiscountPrc: 10 },
  ];
  const shipping = new Set(['M1001', 'M1002']);
  const r = planPacking(lines, new Map([['A', 10], ['M1001', 3], ['M1002', 0]]), shipping);
  assert.deepEqual(r.changes, [
    { lineId: 2, action: 'reduced', qty: 3, price: 20, discountPrc: 0 },
    { lineId: 3, action: 'deleted', qty: 0, price: 90, discountPrc: 10 },
  ]);
  assert.deepEqual(r.result, [{ itemkey: 'M1001', qty: 3, action: 'set' }, { itemkey: 'M1002', qty: 0, action: 'deleted' }]);
  // reply 94: seeded 0 and left at 0 -> deleted; not sent at all -> a 0 line is deleted, a non-zero one kept
  const zero = planPacking(lines, new Map([['M1001', 0]]), shipping);
  assert.deepEqual(zero.changes.map((c) => [c.lineId, c.action]), [[2, 'deleted']]);
  assert.deepEqual(zero.result, [{ itemkey: 'M1001', qty: 0, action: 'deleted' }, { itemkey: 'M1002', qty: 1, action: 'unchanged' }]);
  assert.deepEqual(planPacking(lines, new Map([['A', 10]]), shipping).changes.map((c) => [c.lineId, c.action]), [[2, 'deleted']]);
});

test('approve-surplus validation (reply 118): integer newQty > ordered, approver required', async () => {
  const { validateSurplus } = await import('../bridge/picking.js');
  const ok = validateSurplus({ approver: ' גיל ', lines: [{ itemkey: 'A', ordered: 10, newQty: 12 }] });
  assert.equal(ok.approver, 'גיל');
  assert.deepEqual(ok.lines, [{ itemkey: 'A', size: undefined, ordered: 10, newQty: 12 }]);
  const code = (body) => { try { validateSurplus(body); return 'ok'; } catch (e) { return e.code; } };
  assert.equal(code({ lines: [{ itemkey: 'A', ordered: 10, newQty: 12 }] }), 'BAD_REQUEST'); // no approver
  assert.equal(code({ approver: 'x', lines: [] }), 'BAD_REQUEST');
  assert.equal(code({ approver: 'x', lines: [{ itemkey: 'A', ordered: 10, newQty: 10 }] }), 'BAD_QTY'); // not >
  assert.equal(code({ approver: 'x', lines: [{ itemkey: 'A', ordered: 10, newQty: 12.5 }] }), 'BAD_QTY'); // not integer
  assert.equal(code({ approver: 'x', lines: [{ itemkey: 'A', ordered: -1, newQty: 2 }] }), 'BAD_QTY');
  assert.equal(code({ approver: 'x', lines: [{ itemkey: 'A', ordered: 10, newQty: '12' }] }), 'BAD_QTY'); // string
  assert.equal(code({ approver: 'x', lines: [{ itemkey: 'A', ordered: 10, newQty: 2 ** 60 }] }), 'BAD_QTY'); // unsafe
});

test('approve-surplus matching: exact line, STALE, size lines, packing refused, last line of a duplicate', async () => {
  const { planSurplus } = await import('../bridge/picking.js');
  const doc = [
    { ID: 1, ItemKey: 'A', Details: null, Quantity: 10 },
    { ID: 2, ItemKey: 'R', Details: '2-4', Quantity: 5 },
    { ID: 3, ItemKey: 'R', Details: '6-8', Quantity: 5 },
    { ID: 4, ItemKey: 'B', Details: null, Quantity: 6 },
    { ID: 5, ItemKey: 'B', Details: null, Quantity: 6 },
    { ID: 6, ItemKey: 'M1001', Details: null, Quantity: 0 },
  ];
  const ship = new Set(['M1001', 'M1002']);
  const ids = (reqs) => planSurplus(doc, reqs, ship).map((p) => p.line.ID);
  assert.deepEqual(ids([{ itemkey: 'A', ordered: 10, newQty: 12 }]), [1]);
  assert.deepEqual(ids([{ itemkey: 'R', size: '6-8', ordered: 5, newQty: 7 }]), [3]);
  assert.deepEqual(ids([{ itemkey: 'B', ordered: 6, newQty: 9 }]), [5]); // last of the duplicates
  assert.deepEqual(ids([{ itemkey: 'B', ordered: 6, newQty: 9 }, { itemkey: 'B', ordered: 6, newQty: 8 }]), [5, 4]);
  const code = (reqs) => { try { planSurplus(doc, reqs, ship); return 'ok'; } catch (e) { return e.code; } };
  assert.equal(code([{ itemkey: 'A', ordered: 8, newQty: 12 }]), 'STALE'); // document no longer holds 8
  assert.equal(code([{ itemkey: 'R', ordered: 5, newQty: 7 }]), 'ITEM_NOT_IN_ORDER'); // R only exists per size
  assert.equal(code([{ itemkey: 'Z', ordered: 1, newQty: 2 }]), 'ITEM_NOT_IN_ORDER');
  assert.equal(code([{ itemkey: 'M1001', ordered: 0, newQty: 2 }]), 'BAD_LINE');
});
