// Server-side push events (reply 37): things the web app can't see by itself.
//  - a NEW agent order (doc 11) not created by the app (e.g. typed in Hashavshevet)
//      -> agent_order_received (to the customer's agent) + order_picking (admins)
//  - a NEW produced document (חשבונית / ח.מ-קבלה / ת.משלוח) made from an order
//      -> agent_order_produced (to the customer's agent) + order_produced (admins)
// Polls Stock by ID (clustered index) every PUSH_POLL_SEC; starts from the current max ID, so a
// restart never replays old documents (events during downtime are skipped, by design).
// Env: PUSH_EVENT_URL (e.g. https://magnum-b2-b.vercel.app/api/push/event), PUSH_EVENT_SECRET.
import { query } from './db.js';

const APP_MARKER = 'הזמנת אפליקציה'; // ExtraText3 on orders written by this app (the app fires those itself)
const PRODUCED_DOC_IDS = [1, 2, 4];
const ORDER_DOC_IDS = [6, 11];
const trim = (v) => (typeof v === 'string' ? v.trim() : v);

export function eventsForNewOrder(o) {
  const who = `${trim(o.AccountName) || trim(o.AccountKey)} (${trim(o.AccountKey)})`;
  const body = `הזמנה ${o.ID} נקלטה בחשבשבת עבור ${who}`;
  const url = `/documents?account=${encodeURIComponent(trim(o.AccountKey))}`;
  return [
    ...(o.Agent ? [{ key: 'agent_order_received', agentId: o.Agent, title: 'הזמנה חדשה ללקוח שלך', body, url }] : []),
    { key: 'order_picking', agentId: null, title: 'הזמנה חדשה לליקוט', body, url: '/picking' },
  ];
}

export function eventsForProducedDoc(p) {
  const who = `${trim(p.AccountName) || trim(p.AccountKey)} (${trim(p.AccountKey)})`;
  const body = `${trim(p.DocName) || 'מסמך'} ${p.DocNumber} הופק עבור ${who}`;
  const url = `/documents?account=${encodeURIComponent(trim(p.AccountKey))}`;
  return [
    ...(p.Agent ? [{ key: 'agent_order_produced', agentId: p.Agent, title: 'ההזמנה הופקה', body, url }] : []),
    { key: 'order_produced', agentId: null, title: 'הזמנה הופקה', body, url },
  ];
}

async function send(event) {
  const res = await fetch(process.env.PUSH_EVENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-push-secret': process.env.PUSH_EVENT_SECRET },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`push ${event.key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

export function startEventPoller({ log = console } = {}) {
  const url = process.env.PUSH_EVENT_URL;
  const secret = process.env.PUSH_EVENT_SECRET;
  const seconds = Number(process.env.PUSH_POLL_SEC ?? 60);
  if (!url || !secret || !(seconds > 0)) {
    log.log('push events off (PUSH_EVENT_URL / PUSH_EVENT_SECRET not set)');
    return;
  }
  let lastOrder;
  let lastProduced; // watermark: everything <= this was checked at least one tick after it appeared
  let seenProduced; // max produced-type ID seen last tick (becomes the watermark next tick)
  const sentProduced = new Set();
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (lastOrder === undefined) {
        // First run: remember where we are, fire nothing.
        const [m] = await query(
          `SELECT ISNULL(MAX(CASE WHEN DocumentID = 11 THEN ID END), 0) AS lastOrder,
                  ISNULL(MAX(CASE WHEN DocumentID IN (${PRODUCED_DOC_IDS.join(',')}) THEN ID END), 0) AS lastProduced
           FROM Stock WHERE ID > (SELECT MAX(ID) - 5000 FROM Stock)`,
        );
        ({ lastOrder, lastProduced } = m);
        seenProduced = lastProduced;
        log.log(`push events on: from order ${lastOrder}, produced ${lastProduced}, every ${seconds}s`);
        return;
      }
      const orders = await query(
        `SELECT s.ID, s.AccountKey, s.AccountName, a.Agent, s.ExtraText3
         FROM Stock s LEFT JOIN Accounts a ON a.AccountKey = s.AccountKey
         WHERE s.ID > @last AND s.DocumentID = 11 ORDER BY s.ID`,
        { last: lastOrder },
      );
      const produced = await query(
        `SELECT p.ID, p.DocNumber, p.AccountKey, p.AccountName, a.Agent, d.DocName
         FROM Stock p
         LEFT JOIN Accounts a ON a.AccountKey = p.AccountKey
         LEFT JOIN DocumentsDef d ON d.DocumentID = p.DocumentID
         WHERE p.ID > @last AND p.DocumentID IN (${PRODUCED_DOC_IDS.join(',')})
           AND EXISTS (SELECT 1 FROM StockMoves m JOIN StockMoves b ON b.ID = m.BaseMoveID
                       WHERE m.StockID = p.ID AND b.DocumentID IN (${ORDER_DOC_IDS.join(',')}))
         ORDER BY p.ID`,
        { last: lastProduced },
      );
      // A produced document can be saved a moment before its lines (no link yet), so the watermark
      // trails one tick: rows are re-checked once more, and sentProduced prevents duplicates.
      const [now] = await query(
        `SELECT ISNULL(MAX(ID), 0) AS id FROM Stock WHERE ID > @last AND DocumentID IN (${PRODUCED_DOC_IDS.join(',')})`,
        { last: lastProduced },
      );
      const events = [
        ...orders.filter((o) => trim(o.ExtraText3) !== APP_MARKER).flatMap(eventsForNewOrder),
        ...produced.filter((p) => !sentProduced.has(p.ID)).flatMap(eventsForProducedDoc),
      ];
      for (const e of events) await send(e);
      produced.forEach((p) => sentProduced.add(p.ID));
      if (orders.length) lastOrder = orders.at(-1).ID;
      lastProduced = Math.max(lastProduced, seenProduced);
      seenProduced = Math.max(seenProduced, now.id);
      for (const id of sentProduced) if (id <= lastProduced) sentProduced.delete(id);
      if (events.length) log.log(`push events sent: ${events.map((e) => e.key).join(', ')}`);
    } catch (err) {
      log.error(`push events: ${err.message}`); // retried next tick (watermarks not advanced)
    } finally {
      running = false;
    }
  };
  tick();
  setInterval(tick, seconds * 1000).unref();
}
