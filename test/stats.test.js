// node --test test/stats.test.js  (pure, no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import { previousPeriod, getStats, STAT_DOCS } from '../bridge/stats.js';

const d = (s) => new Date(`${s}T00:00:00Z`);
const iso = (x) => x.toISOString().slice(0, 10);

test('previous period: same length, ending the day before from', () => {
  const p = previousPeriod(d('2026-09-01'), d('2026-09-30'));
  assert.deepEqual([iso(p.from), iso(p.to)], ['2026-08-02', '2026-08-31']);
  const one = previousPeriod(d('2026-10-04'), d('2026-10-04'));
  assert.deepEqual([iso(one.from), iso(one.to)], ['2026-10-03', '2026-10-03']);
});

test('validation rejects bad input before touching the database', async () => {
  await assert.rejects(getStats({ scope: 'x', from: '2026-01-01', to: '2026-01-02' }), /scope/);
  await assert.rejects(getStats({ scope: 'account', from: '2026-01-01', to: '2026-01-02' }), /account/);
  await assert.rejects(getStats({ scope: 'all', from: '2026-1-1', to: '2026-01-02' }), /from/);
  await assert.rejects(getStats({ scope: 'all', from: '2026-02-01', to: '2026-01-01' }), /to לפני from/);
  await assert.rejects(getStats({ scope: 'all', from: '2020-01-01', to: '2026-01-01' }), /טווח/);
});

test('document mapping matches what we tell the web app', () => {
  assert.deepEqual(STAT_DOCS, { sales: [1, 2, 9, 37, 87], returns: [3, 73], orders: [6, 11], payments: [31, 2, 87] });
});
