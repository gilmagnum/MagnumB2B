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

test('over-pick is capped at the ordered quantity', () => {
  assert.deepEqual(planShortages([line(1, 'A', 10)], new Map([['A', 15]]), ship).changes, []);
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
  assert.equal(mergePickNotes(null, 'חסר X'), 'ליקוט: חסר X');
  assert.equal(mergePickNotes('הערת משרד', 'חסר X'), 'הערת משרד | ליקוט: חסר X');
  assert.equal(mergePickNotes('הערת משרד | ליקוט: חסר X', 'הכל סופק'), 'הערת משרד | ליקוט: הכל סופק');
  assert.equal(mergePickNotes('ליקוט: ישן', 'חדש'), 'ליקוט: חדש');
});
