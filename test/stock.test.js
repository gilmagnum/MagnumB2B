// node --test test/stock.test.js  (pure, no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollUpStock } from '../bridge/read.js';

test('parent stock = max(own, 0) + sum of non-negative children', () => {
  const own = new Map([['P', -16784], ['C1', 10], ['C2', -3], ['C3', 5], ['Q', 7], ['S', -2]]);
  const children = new Map([['P', new Set(['C1', 'C2', 'C3'])], ['Q', new Set(['C9'])]]);
  const out = rollUpStock(own, children, (k) => own.get(k));
  assert.equal(out.get('P'), 15); // negative own and negative child ignored
  assert.equal(out.get('Q'), 7); // child without stock adds nothing
  assert.equal(out.get('S'), -2); // no children: own balance kept as-is
  assert.equal(out.get('C2'), -3); // children keep their own balance
});
