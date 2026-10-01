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
  producedDocs: ProducedDoc[];  // via StockMoves.BaseMoveID, 2 levels (order -> ת.משלוח -> חשבונית)
};
// DocumentID names: 1 חשבונית מס, 2 חשבונית מס/קבלה, 4 תעודת משלוח, 6 הזמנה, 11 הזמנת סוכן, 31 קבלה (not linked to orders)

type DocumentDetail = Document & {
  totalBeforeVat?: number; vatPct?: number; orderDiscountPct: number; remarks?: string;
  customer: { address?: string; city?: string; phone?: string; email?: string; taxId?: string };
  lines: { itemkey: string; name: string; qty: number; unit?: string; unitPrice: number;
           discountPct: number; lineTotal: number; isShipping?: true }[];  // M1001/M1002 flagged, not removed
};

type ApiError = { error: { code: string; message: string } };  // message in Hebrew, show as-is
```

## Endpoints

- `GET /health` → `{ ok: true }` (no auth)
- `GET /items?shownOnSite=1[&category=<main or sub>][&search=<key/name/barcode>]` → `Item[]` (cached 60s)
- `GET /items/:itemkey` → `Item` (with `cells` + stock per cell if matrix) · 404 if unknown
- `GET /customers[?agent=:agentId][&q=]` → `Customer[]`. `agent=0` or missing = **all** customers (admin); `agent=:id` = that agent's
  customers. `q` = name or accountKey contains (works with both). Customers = Accounts.SortGroup 10/11/12, Dumi≠1, named,
  and not marked "לא פעיל" in the name.
- `GET /stock/:itemkey` → `{ itemkey, qty }` · matrix: `{ itemkey, qty: <sum>, cells: [{ itemkey, qty }] }`
- `GET /price?account=&item=&qty=` → `PriceResult`
- `POST /prices` `{ account, items: [{ itemkey, qty? }] }` (max 500) → `PriceResult[]` (bulk, for the catalog grid)
- `GET /documents/:stockId[?agent=:id]` → `DocumentDetail` (404 if not a customer document, or not that agent's customer)
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

## Rules the bridge enforces (server owns)
- Write only temp orders (Status=0, DocNumber=0, flat Tree=0 lines, LineNum 0, StockID=Stock.ID). Never delete docs.
- Header like the app: ExtraText3 'הזמנת אפליקציה'; PrintStyle = customer card (AccDocRpt) for the doc type, else DocumentsDef default.
- Order unit = carton or bundle (no single units). Item must be active and "מוצג באתר".
- Picking order: reject if stock < units, unless `ignoreStock`. Future order: no stock check, no shipping lines.
- Pricing (locked, 91.5% backtest): special price (SpecialPrices header + SpecialPricesMoves price) on the customer,
  else on its central account (AssignKey), latest valid date range, quantity tier; else price list − Discounts %.
  The written price is display-only - Hashavshevet re-fetches prices when the order is issued.
- Real customers are written only when `ORDER_WRITE_ENABLED=1` on the server; until then only account 10 commits (`WRITE_DISABLED`).
