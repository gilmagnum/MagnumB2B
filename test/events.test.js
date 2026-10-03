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
