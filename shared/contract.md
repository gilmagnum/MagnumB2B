# web ↔ bridge API contract (shared)

The bridge (server session, Node on the Hashavshevet server) exposes this HTTP API.
The web app (Next.js on Vercel) consumes it. Auth: `Authorization: Bearer <shared-token>` on every call.
All money is NIS. All item keys are Hashavshevet ItemKeys.

## Types

```ts
type Item = {
  itemkey: string;            // model_color, <=20 chars
  itemName: string;
  foreignName?: string;
  price: number;              // base (display); actual billing price via /price
  barcode?: string;
  brand?: string;
  categoryMain?: string;
  categorySub?: string;
  season?: string;
  rulerCode?: string;         // size ruler (app layer)
  color?: string;             // color-axis header (2D matrix)
  perCarton?: number;         // ExtraSums SuFID 5
  perBundle?: number;         // ExtraSums SuFID 6 (min order unit)
  shownOnSite: boolean;       // NoteID 28
  ignoreStock: boolean;       // NoteID 31
  isMatrix: boolean;          // detected via IMatrixItems
  imageUrl?: string;          // app layer (not from Hashavshevet)
  cells?: MatrixCell[];       // present when isMatrix
};

type MatrixCell = {
  itemkey: string;            // real cell SKU
  sizeLabel?: string;
  colorLabel?: string;
  line: number; col: number;  // 0-based; col=0 => 1D matrix
  stock?: number;
};

type Customer = {             // from Accounts, filtered to the agent
  accountKey: string;
  fullName: string;
  agent?: number;
  discountCode?: string;
  totalDiscountPct?: number;  // Accounts.TFtalDiscount
  forPicking: boolean;        // false for "לא לליקוט" customers
};

type PriceResult = {
  itemkey: string; accountKey: string; qty: number;
  unitPrice: number;          // resolved per-unit price
  discountPct: number;
  source: 'special'|'wsprice'|'pricelist'|'promo'|'computed';
};
```

## Endpoints

- `GET /items?category=<sub>&shownOnSite=1[&search=]` → `Item[]` (catalog list; only shownOnSite for ordering views)
- `GET /items/:itemkey` → `Item` (with `cells` if matrix; includes stock per cell)
- `GET /customers?agent=:agentId` → `Customer[]` (agent sees only their own)
- `GET /stock/:itemkey` → `{ itemkey, qty }` (or per-cell for matrix)
- `GET /price?account=&item=&qty=` → `PriceResult`
- `POST /orders` → create a temp order (Hashavshevet DocumentID 11, DocNumber 0, Status 0):
  ```jsonc
  // body
  {
    "accountKey": "10",
    "orderKind": "picking" | "future",
    "lines": [ { "itemkey": "WF3400036", "qty": 40, "unit": "carton"|"bundle", "price": 8.55 } ],
    "shipping": { "carton": 0, "pallet": 0 }   // -> M1001 / M1002
  }
  // response
  { "stockId": 116999 }   // = Stock.ID (the app order number)
  ```

## Rules the bridge enforces (server owns)
- Write only temp orders (Status=0, DocNumber=0, flat Tree=0 lines, StockID=Stock.ID). Never delete docs.
- Min order unit = bundle. Reject qty below one bundle.
- For regular (picking) order: reject out-of-stock items unless `ignoreStock`. Future order: allowed.
- Pricing: resolve per the locked rule (TBD — SpecialPrices → WsPrice → PriceLists+Discounts → promo). Until locked, `price` may be sent by web from /price.

> Open: exact pricing source (~43% of historical lines unexplained by SpecialPrices/GetPrice — investigating WsPrice / price-list-number / Miv promos). Once locked, /price returns authoritative prices and web stops sending `price`.
