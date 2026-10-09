// node --test test/rulers.test.js  (pure, no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSize } from '../bridge/rulers.js';

test('checkSize: in list ok, not in list rejected, no ruler rejected, unfilled ruler allowed', () => {
  const rulers = new Map([['U28', new Set(['2-4', '6-8'])], ['EMPTY', new Set()]]);
  assert.equal(checkSize('U28', '2-4', rulers), null);
  assert.equal(checkSize('U28', ' 6-8 ', rulers), null);
  assert.match(checkSize('U28', '99', rulers), /אינה בסרגל U28/);
  assert.match(checkSize(undefined, '2-4', rulers), /אין סרגל/);
  assert.equal(checkSize('EMPTY', 'X', rulers), null);
  assert.equal(checkSize('UNKNOWN', 'X', rulers), null);
  assert.equal(checkSize('U28', undefined, rulers), null);
  assert.equal(checkSize('U28', '2-4', null), null); // rulers unavailable -> allow
});
