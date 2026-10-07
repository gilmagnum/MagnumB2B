// node --test test/pricing.test.js  (pure, no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFromCache } from '../bridge/pricing.js';

const d = (s) => new Date(`${s}T00:00:00Z`);
const g = {
  items: new Map([
    ['MG1507001', { code: 'MG', price: 16 }],
    ['MG150700102', { code: 'MG', price: 16 }],
    ['BR11506', { code: 'BR-U', price: 11 }],
    ['NOCODE', { code: null, price: 5 }],
  ]),
  fathers: new Map([['MG150700102', 'MG1507001']]),
  list1: new Map([
    ['MG1507001', [{ price: 16, datF: d('2026-08-25'), id: 3 }, { price: 17, datF: d('2025-07-23'), id: 2 }]],
    ['BR11506', [{ price: 11, datF: d('2024-08-29'), id: 1 }]],
  ]),
};
const special = (o) => ({ ID: 1, AccountKey: '10505', ValidDate: d('2019-10-31'), EndDate: d('2028-12-31'), Active: 0, MinQuantity: 0, DiscountPrc: 0, ...o });
const acct = (specials = [], discounts = [['MG', { PriceListNumber: 1, DiscountPrc: 20 }]]) => ({
  discounts: new Map(discounts),
  specials: new Map(specials.map((s) => [s.ItemKey, [s]])),
});
const now = d('2026-10-07');

test('inactive special (Active=1) is ignored: list - discount code, cell falls back to model list', () => {
  const a = acct([special({ ItemKey: 'MG1507001', Price: 15, DiscountPrc: 25, Active: 1 })]);
  assert.deepEqual(resolveFromCache(g, a, '10505', 'MG150700102', 0, now, 'valid'),
    { price: 16, discountPrc: 20, source: 'discount', priceListNumber: 1 });
});

test('active special (Active=0) on the model applies to the cell', () => {
  const a = acct([special({ ItemKey: 'MG1507001', Price: 15, DiscountPrc: 25 })]);
  assert.deepEqual(resolveFromCache(g, a, '10505', 'MG150700102', 0, now, 'valid'),
    { price: 15, discountPrc: 25, source: 'special', priceListNumber: 1, specialFrom: 'MG1507001' });
});

test('central-account special, expired special, quantity tier, base price', () => {
  const central = acct([special({ ItemKey: 'BR11506', AccountKey: '11724', Price: 8.55 })], []);
  assert.equal(resolveFromCache(g, central, '11728', 'BR11506', 0, now, 'valid').source, 'special-central');
  const expired = acct([special({ ItemKey: 'BR11506', Price: 8, EndDate: d('2026-01-01') })], []);
  assert.deepEqual(resolveFromCache(g, expired, '10505', 'BR11506', 0, now, 'valid'),
    { price: 11, discountPrc: 0, source: 'base', priceListNumber: 1 });
  const tier = acct([special({ ItemKey: 'BR11506', Price: 7, MinQuantity: 100 })], []);
  assert.equal(resolveFromCache(g, tier, '10505', 'BR11506', 50, now, 'valid').price, 11);
  assert.equal(resolveFromCache(g, tier, '10505', 'BR11506', 100, now, 'valid').price, 7);
  assert.equal(resolveFromCache(g, acct([], []), '10505', 'NOCODE', 0, now, 'valid').price, 5); // no list row -> Items.Price
});

test('unknown item or a non-default price list -> null (SQL fallback)', () => {
  assert.equal(resolveFromCache(g, acct(), '10505', 'NEW_ITEM', 0, now, 'valid'), null);
  const list7 = acct([], [['MG', { PriceListNumber: 7, DiscountPrc: 10 }]]);
  assert.equal(resolveFromCache(g, list7, '10505', 'MG1507001', 0, now, 'valid'), null);
});
