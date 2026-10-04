# web ↔ bridge API contract (shared)

The bridge (server session, Node on the Hashavshevet server, `bridge/server.js`) exposes this HTTP API.
The web app (Next.js on Vercel) consumes it. Auth: `Authorization: Bearer <BRIDGE_TOKEN>` on every call except `/health`.
All money is NIS. All item keys are Hashavshevet ItemKeys. Strings/messages are Hebrew.

**Base URL:** `http://127.0.0.1:8787` on the server (`npm start`; `BRIDGE_HOST`/`BRIDGE_PORT` in `.env.local`).
It binds to localhost only. Reaching it from Vercel needs a deliberate exposure step (e.g. a Cloudflare Tunnel to
`https://bridge.<domain>`) — not set up yet, Gil's decision. Until then /web develops against a mock or via the server.

## Types

```ts
type Item = {
  itemkey: string;            // model_color, <=20 chars
  itemName: string;
  foreignName?: string;
  price: number;              // base list price (display); customer price via /price
  barcode?: string;
  brand?: string;             // NoteID 7
  categoryMain?: string;      // NoteID 22
  categorySub?: string;       // NoteID 23
  season?: string;            // NoteID 34
  rulerCode?: string;         // NoteID 25 size ruler (app layer)
  color?: string;             // NoteID 29 color-axis header (2D matrix)
  perCarton?: number;         // ExtraSums SuFID 5
  perBundle?: number;         // ExtraSums SuFID 6 (min order unit)
  shownOnSite: boolean;       // NoteID 28
  ignoreStock: boolean;       // NoteID 31
  isMatrix: boolean;          // detected via IMatrixItems
  isCartonSizeItem: boolean;  // NoteID 26 'פריט קרטון מידה' - each carton is one size; order per size inside the product
  stock: number;              // Items.Quantity (for a matrix parent: usually 0, see cells)
  imageUrl?: string;          // app layer (not from Hashavshevet)
  cells?: MatrixCell[];       // GET /items/:itemkey only, when isMatrix
};

type MatrixCell = {
  itemkey: string;            // real cell SKU - this is what goes on the order line
  sizeLabel?: string;         // cell NoteID 33
  colorLabel?: string;        // cell NoteID 29
  line: number; col: number;  // IMatrixItems Line/Col (0-based); col=0 => 1D matrix
  stock: number;
};

type Customer = {             // from Accounts (active)
  accountKey: string;
  fullName: string;
  agent?: number;
  discountCode?: string;
  totalDiscountPct: number;   // Accounts.TFtalDiscount
  forPicking: boolean;        // false for "לא לליקוט" customers
  lastActivity?: string;      // newest order/delivery/invoice date (doc 1,2,4,6,11), YYYY-MM-DD
  active: boolean;            // lastActivity within the last 365 days
};

type PriceResult = {
  itemkey: string; accountKey: string; qty: number;   // qty in units (for quantity tiers)
  unitPrice: number;          // price before discount
  discountPct: number;
  netUnitPrice: number;       // unitPrice * (1 - discountPct/100), rounded to 0.01
  source: 'special' | 'special-central' | 'pricelist';
  // special = customer special price; special-central = via the chain's central account (AssignKey);
  // pricelist = price list (+ customer discount from Discounts, if any)
};

type ProducedDoc = { stockId: number; documentId: number; docTypeName: string; docNumber: number; date: string; total?: number };
type Document = {
  stockId: number;            // Stock.ID of the order (app order number)
  docNumber: number;          // Hashavshevet DocNumber (0 while it is a temp order)
  documentId: number;         // 11 הזמנת סוכן | 6 הזמנה
  docTypeName: string;        // DocumentsDef.DocName
  accountKey: string; customerName: string; agent?: number;
  date: string;               // Stock.IssueDate, YYYY-MM-DD
  total?: number;             // Stock.TFtal (incl. VAT)
  status: 'open' | 'produced';
  picked: boolean;            // ExtraText2 starts with 'לוקט' (warehouse app marker)
  picker?: string;            // name from 'לוקט - <name>'
  pickedMarker?: string;      // raw ExtraText2
  producedDocs: ProducedDoc[];  // via StockMoves.BaseMoveID, 2 levels (order -> ת.משלוח -> חשבונית)
};
// DocumentID names: 1 חשבונית מס, 2 חשבונית מס/קבלה, 4 תעודת משלוח, 6 הזמנה, 11 הזמנת סוכן, 31 קבלה (not linked to orders)

type DocumentDetail = Document & {
  totalBeforeVat?: number; vatPct?: number; orderDiscountPct: number; remarks?: string;
  pickNotes?: string;         // Stock.ExtraRemarks - picker notes written by /picking/:id/finish
  customer: { address?: string; city?: string; phone?: string; email?: string; taxId?: string };
  lines: { itemkey: string; name: string; qty: number; unit?: string; unitPrice: number;
           discountPct: number; lineTotal: number; onHand?: number; isShipping?: true }[];  // onHand = Items.Quantity now; M1001/M1002 flagged, not removed
};

type ApiError = { error: { code: string; message: string } };  // message in Hebrew, show as-is
```

## Endpoints

- `GET /health` → `{ ok: true }` (no auth)
- `GET /items?shownOnSite=1[&category=<main or sub>][&search=<key/name/barcode>]` → `Item[]` (cached 60s)
- `GET /items/:itemkey` → `Item` (with `cells` + stock per cell if matrix) · 404 if unknown
- `GET /customers[?agent=:agentId][&q=]` → `Customer[]`, ordered: for an all-digit `q` exact accountKey → starts with → contains
  → others; then `active` before dormant; then name (he). `agent=0` or missing = **all** customers (admin); `agent=:id` = that agent's
  customers. `q` = name or accountKey contains (works with both). Customers = Accounts.SortGroup 10/11/12, Dumi≠1, named,
  and not marked "לא פעיל" in the name.
- `GET /stock/:itemkey` → `{ itemkey, qty }` · matrix: `{ itemkey, qty: <sum>, cells: [{ itemkey, qty }] }`
- `GET /price?account=&item=&qty=` → `PriceResult`
- `POST /prices` `{ account, items: [{ itemkey, qty? }] }` (max 500) → `PriceResult[]` (bulk, for the catalog grid)
- `GET /picking/queue[?agent=][&q=][&state=waiting|picked][&limit=200][&offset=0]` → `Document[]` (read-only), **oldest first**.
  Open agent orders only (doc 11, Status 0). `waiting` (default) = no picker marker; `picked` = ExtraText2 `לוקט - <name>`
  (picked, waiting for production in Hashavshevet). Same row shape as /documents incl. `picked`, `picker`, `pickedMarker`.
- `POST /picking/:stockId/finish[?dryRun=1]` **(WRITES to Hashavshevet)** body `{ picker, notes?, lines: [{ itemkey, pickedQty }] }`
  → `{ ok, stockId, dryRun, picker, notesField, notes, shortages: [{ itemkey, ordered, picked, action: 'reduced'|'deleted' }], totals: { net, gross } }`.
  One transaction, only on doc 11 with Status 0: pickedQty ≥ ordered → unchanged; 0 < pickedQty < ordered → line reduced
  (Quantity/TFtal/TftalVat/Supply/Base/PurchQuantity); 0 → line deleted; header TFtalVat/TFtal recomputed;
  `Stock.ExtraText2 = 'לוקט - <picker>'`; notes appended to `Stock.ExtraRemarks` as `ליקוט: <notes>` (a re-run replaces the previous `ליקוט:` part). Never produces the document.
  Items not listed and M1001/M1002 are untouched. Errors: 400 BAD_REQUEST/BAD_LINE, 403 WRITE_DISABLED (real customers
  before `ORDER_WRITE_ENABLED=1`), 404 DOC_NOT_FOUND, 409 NOT_OPEN/TREE_UNSUPPORTED, 422 ITEM_NOT_IN_ORDER, 501 NO_PERMISSION (GRANT missing).
- `GET /customers/:accountKey/balance[?agent=:id]` → `{ accountKey, customerName, agent?, balance, obligo, maxCredit?, maxObligo? }`
  (₪; `balance` = Accounts.Balance raw: **negative = customer owes us** (יתרה לתשלום; the web shows -balance); `obligo` = Accounts.Obligo). 403 if `agent` isn't the customer's agent.
- `GET /stats?scope=account|agent|all&account=&agent=&from=YYYY-MM-DD&to=YYYY-MM-DD[&compare=1][&central=1]` →
  `{ period:{from,to}, sales, returns, ordersCount, payments, topItems:[{itemkey,name,qty,value}], byAgent?:[{agentId,agentName,sales,ordersCount,payments}], previous?:{sales,returns,ordersCount,payments} }`.
  Mapping (DocumentID): **sales** 1,2,9,37,87 · **returns** 3,73 · **ordersCount** 6,11 · **payments** 31 (+2,87 invoice-receipts).
  sales/returns/topItems.value = net of VAT after the order discount; payments = incl. VAT. By Stock.ValueDate, cancelled docs excluded.
  Also: `activeCustomers` (distinct customers with a sale in range; also in `previous`), `topCustomers:[{accountKey,name,sales,ordersCount,branches?}]` (with `central=1`: rolled up to the central account Accounts.AssignKey, `branches` = accounts in the row)
  (top 10 by sales), `series:[{date,sales,payments}]` (ascending, zero-filled; bucket = day ≤90 days, week ≤630 days, else month;
  date = bucket start, first bucket clamped to `from`), `pipeline:{awaitingPicking:{count,value},awaitingProduction:{count,value}}`
  (right now: open doc 11 without / with the 'לוקט' marker, net ₪), `openBalance` (right now: Σ of the scope's customers' balances, same sign as /balance), `topCategories:[{name,sales,qty}]` (top 10 main categories
  by net line sales in range; NoteID 22, matrix cells use the parent's category, missing → 'ללא קטגוריה').
  byAgent only for scope=all; previous = same-length period ending the day before `from`. Max range 800 days; cached 3 min.
  With `agent=:id` (agent user): scope=all → 403; scope=account → 403 unless that agent's customer.
- `GET /rulers/usage` → `[{ code, lastSold: 'YYYY-MM-DD'|null, items12m, items }]` per size-ruler code (NoteID 25): newest sale
  (doc 1/2/4/11 line, model or matrix cell) within the last 2 years (null = none), items sold in the last 12 months, items using it. Cached 12 h.
- `GET /documents/:stockId[?agent=:id]` → `DocumentDetail` (404 if not a customer document, or not that agent's customer)
- `GET /documents?account=<exact accountKey>` filters to one customer exactly (wins over `q`; with `agent`, another agent's
  customer returns []). `GET /picking/queue?account=` works the same.
- `GET /documents?agent=&status=all|open|produced&q=&limit=50&offset=0` → `Document[]`, newest first (limit max 200).
  `agent=0`/missing = all (admin). `q` = customer name/accountKey, or a number = order Stock.ID / its DocNumber /
  the DocNumber of a document produced from it. `status`: open = Stock.Status 0, produced = anything else.
- `POST /sync` → full catalog refresh Hashavshevet → Supabase (`items`, `item_variants`, ruler codes); returns
  `{ items, shown, variants, rulers, deactivated, ms }` (also runs at start + every `SYNC_INTERVAL_MIN`).
  `GET /sync` → `{ running, last }`. Images/colors/categories are app-layer and never touched.
- `POST /orders[?dryRun=1]` → create a temp order (DocNumber 0, Status 0):
  ```jsonc
  // body
  {
    "accountKey": "10",
    "orderKind": "picking" | "future",      // picking -> DocumentID 11 "הזמנת סוכן", future -> DocumentID 6 "הזמנה"
    "remarks": "...",                        // optional -> Stock.Remarks
    "orderDiscountPct": 0,                  // optional, header-level discount % (Stock.DiscountPrc/DiscountPrcR)
    "lines": [ { "itemkey": "WF3400036", "qty": 2, "unit": "carton" | "bundle", "price"?: 8.55, "discountPct"?: 0 } ],
    "shipping": { "carton": 1, "pallet": 0 } // picking only -> M1001 / M1002 (both always written, qty 0 when unused)
  }
  // 200 response
  { "stockId": 117030, "dryRun": false, "documentId": 11,
    "totals": { "net": 352, "orderDiscountPct": 5, "netAfterDiscount": 334.4, "vatPrc": 18, "gross": 394.59 },
    "lines": [ { "itemKey": "...", "quantity": 32, "price": 11, "discountPrc": 0, "priceSource": "base" } ] }
  // ?dryRun=1: full validation + write inside a rolled-back transaction; stockId = null, nothing saved
  ```
  - `qty` is in cartons/bundles; the bridge writes units (qty × perCarton / perBundle).
  - Omit `price` → the bridge prices it (same as /price). If sent, `price` (+ `discountPct`) is written as-is.
  - Matrix: one line per cell SKU (`cells[].itemkey`); the cell inherits shownOnSite/pack sizes/ignoreStock from its parent.
  - Errors: 422 `ApiError` with codes `NO_ACCOUNT, ACCOUNT_NOT_FOUND, ACCOUNT_INACTIVE, BAD_KIND, NO_LINES, BAD_LINE,
    BAD_SHIPPING, BAD_DISCOUNT, ITEM_NOT_FOUND, ITEM_INACTIVE, ITEM_HIDDEN, NO_PACKING, NO_STOCK, NO_PRICE, WRITE_DISABLED`;
    400 `BAD_JSON/BAD_REQUEST`; 401 `UNAUTHORIZED`; 500 `INTERNAL/SCHEMA`.

## Push events fired by the bridge (POST PUSH_EVENT_URL, header x-push-secret)
- new doc-11 order not made by the app → `agent_order_received` (agentId = Accounts.Agent) + `order_picking` (agentId null)
- new חשבונית/ח.מ-קבלה/ת.משלוח produced from an order → `agent_order_produced` (agentId) + `order_produced` (null)
- body `{ key, agentId, title, body, url }`, Hebrew texts; polled every 60 s; no replay after a restart.

## Rules the bridge enforces (server owns)
- Write only temp orders (Status=0, DocNumber=0, flat Tree=0 lines, LineNum 0, StockID=Stock.ID). Never delete docs.
- Header like the app: ExtraText3 'הזמנת אפליקציה'; PrintStyle = customer card (AccDocRpt) for the doc type, else DocumentsDef default.
- Order unit = carton or bundle (no single units). Item must be active and "מוצג באתר".
- Picking order: reject if stock < units, unless `ignoreStock`. Future order: no stock check, no shipping lines.
- Pricing (locked, 91.5% backtest): special price (SpecialPrices header + SpecialPricesMoves price) on the customer,
  else on its central account (AssignKey), latest valid date range, quantity tier; else price list − Discounts %.
  The written price is display-only - Hashavshevet re-fetches prices when the order is issued.
- Real customers are written only when `ORDER_WRITE_ENABLED=1` on the server; until then only account 10 commits (`WRITE_DISABLED`).
