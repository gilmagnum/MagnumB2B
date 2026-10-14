// node --test test/events.test.js  (pure, no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsForNewOrder, eventsForProducedDoc } from '../bridge/events.js';

test('new order: agent event when the customer has an agent, plus admin picking event', () => {
  const ev = eventsForNewOrder({ ID: 117100, AccountKey: '11728 ', AccountName: 'פוזה', Agent: 101 });
  assert.deepEqual(ev.map((e) => [e.key, e.agentId]), [['agent_order_received', 101], ['order_picking', null]]);
  assert.match(ev[0].body, /117100.*פוזה \(11728\)/);
  assert.equal(ev[0].url, '/documents?account=11728');
});

test('new order without agent: admin event only', () => {
  assert.deepEqual(eventsForNewOrder({ ID: 1, AccountKey: '10', Agent: 0 }).map((e) => e.key), ['order_picking']);
});

test('produced doc: names the document type and number', () => {
  const ev = eventsForProducedDoc({ ID: 117200, DocNumber: 64600, DocName: 'חשבונית מס', AccountKey: '11633', AccountName: 'עבודי הלבשה', Agent: 102 });
  assert.deepEqual(ev.map((e) => [e.key, e.agentId]), [['agent_order_produced', 102], ['order_produced', null]]);
  assert.match(ev[0].body, /^חשבונית מס 64600 הופק עבור עבודי הלבשה \(11633\)$/);
});

test('sendAll: one 403 never blocks or re-sends the others; 5xx retried, then dropped', async () => {
  const { sendAll, MAX_TRIES } = await import('../bridge/events.js');
  const calls = [];
  const fail = (status) => Object.assign(new Error(`x ${status}`), { permanent: status < 500 });
  const sendFn = async (e) => {
    calls.push(e.key);
    if (e.key === 'order_picking') throw fail(403);
    if (e.key === 'flaky') throw fail(503);
  };
  const quiet = { error() {} };
  const items = [{ event: { key: 'agent_order_received' } }, { event: { key: 'order_picking' } }, { event: { key: 'flaky' } }];
  let r = await sendAll(items, sendFn, quiet);
  assert.deepEqual(r.sent, ['agent_order_received']);
  assert.deepEqual(r.retry.map((i) => i.event.key), ['flaky']); // 403 dropped, 503 kept
  for (let t = 1; t < MAX_TRIES; t++) r = await sendAll(r.retry, sendFn, quiet);
  assert.deepEqual(r.retry, []); // dropped after MAX_TRIES
  assert.equal(calls.filter((k) => k === 'agent_order_received').length, 1); // never re-sent
});
