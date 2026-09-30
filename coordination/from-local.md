# From LOCAL session -> SERVER session
(newest on top)

## 2026-09-30 (reply 4) — KEY pricing detail: discount comes from price list #1

Gil clarified the "which PriceListNumber" question. The discount-code calc uses a SPECIFIC price list. There are TWO identical price lists:
  - the FULL/regular list = the item's base price (מחיר פריט),
  - **PriceListNumber = 1** = the list Hashavshevet uses to compute the discount with the customer's discount codes.

So step 2 of the resolver becomes precise:
  unitPrice = <base price> * (1 - DiscountPrc/100)
  where DiscountPrc = Discounts.DiscountPrc for:
     AccountDiscountCode = Accounts.DiscountCode
     AND ItemDiscountCode = Items.DiscountCode
     AND **PriceListNumber = 1**
  (base price = the item's regular price — Items.Price / the full price list.)

Re-run the 11728/BR11506 check with PriceListNumber=1 in the Discounts lookup — base 8.80 * (1 - DiscountPrc/100) should = 8.55 (=> DiscountPrc ~2.84%). If it reproduces, lock:
  1) SpecialPrices  2) base * (1 - Discounts@PriceList1)  3) base regular price.

Reference: Gil pointed to the official h-erp DB schema docs for software houses:
  https://www.h-erp.co.il/תמיכה-בבתי-תוכנה/has_database/
Might help confirm table/column semantics (Discounts, PriceLists, etc.).


## 2026-09-30 (reply 3) — AUTHORITATIVE pricing order (from Gil)

Gil gave the definitive Hashavshevet pricing resolution. This likely closes your ~43% gap — the gap is step 2 (customer discount-code on the price list), which your resolver probably under-applied.

RESOLUTION ORDER:
1. **SpecialPrices** (per customer+item) — overrides everything. (You confirmed it's absent for the mismatches — so those fall to step 2.)
2. **Price list WITH the customer's discount codes** = PriceLists price MINUS the Discounts-matrix percentage, keyed by:
   Discounts WHERE AccountDiscountCode = Accounts.DiscountCode  (customer's discount code group)
          AND ItemDiscountCode   = Items.DiscountCode          (item's discount group, e.g. 'BR-C'/'KD-B')
          AND PriceListNumber    = <the customer's price list number>
   => unitPrice = PriceLists[that PriceListNumber for the item].Price * (1 - DiscountPrc/100)
3. **Regular price list** (base PriceLists) if no discount row matches.

VERIFY on the mismatch (11728 / BR11506 -> 8.55):
  SELECT DiscountCode FROM Accounts WHERE AccountKey='11728';         -- customer discount code
  SELECT DiscountCode FROM Items    WHERE ItemKey='BR11506';          -- item discount group
  SELECT * FROM Discounts
    WHERE AccountDiscountCode = (SELECT DiscountCode FROM Accounts WHERE AccountKey='11728')
      AND ItemDiscountCode    = (SELECT DiscountCode FROM Items    WHERE ItemKey='BR11506');
  SELECT PriceListNumber, Price FROM PriceLists WHERE ItemKey='BR11506' ORDER BY PriceListNumber;
Expect: base list price * (1 - DiscountPrc/100) = 8.55. Confirm which PriceListNumber the customer uses (via the branch AgentWarehouseNames.PriceListID, or a fixed default — check the data).

If step 2 reproduces the historical prices, lock the resolver in this order and /price becomes authoritative. WsPrice/Miv were secondary guesses — try step 2 first.


## 2026-09-30 (reply 2) — pricing gap suspects + your open questions

You're right that SpecialPrices/GetPrice don't explain it. Strong remaining suspects — please run these on the mismatch (customer 11728, item BR11506, actual line price 8.55):

A) **WsPrice** — a per-account resolved-price table we saw in the schema (cols: ItemKey, AccountKey, Quantity, Price, MinQuantity, Kurrency, Rate, PriceLc, DelFlag). Likely the app's actual price source:
   SELECT * FROM WsPrice WHERE AccountKey='11728' AND ItemKey='BR11506';
   -- if empty, also: SELECT TOP 20 * FROM WsPrice WHERE ItemKey='BR11506';

B) **Wrong price-list number** — maybe the customer is on a different PriceListNumber than your resolver picked. List ALL list prices for the item and see if 8.55 appears:
   SELECT PriceListNumber, Price, CurrencyCode FROM PriceLists WHERE ItemKey='BR11506' ORDER BY PriceListNumber;
   And how the customer maps to a price list: check the branch/warehouse (AgentWarehouseNames.PriceListID) and Discounts rows for this account:
   SELECT * FROM Discounts WHERE AccountKey='11728';
   SELECT AccountKey, DiscountCode, TFtalDiscount, SortGroup, Filter FROM Accounts WHERE AccountKey='11728';

C) **Promotions (מבצעים = "Miv" tables)** — the site may apply a promo price. Look for the item in MivMatrix/MivMain/MivStockChange:
   SELECT * FROM MivMatrix WHERE ItemKey='BR11506';  (and MivMain / MivStockChange)

D) If none of the above: the app likely COMPUTES and stores the net price on the line itself (StockMoves.Price/TFtal) using its own logic (e.g. Accounts.TFtalDiscount + rounding). In that case, for WRITE we can either (a) send our computed price, or (b) enable Hashavshevet price-fetch and omit price. For READ/display, mirror WsPrice if it turns out to be the source.

Report which of A–D matches 8.55 and we'll lock the pricing rule.

## Your two open questions — answers
1) EXTRA COLUMNS (explicit vs template-clone): go **explicit-columns** (your plan) — the clone copies stale values (customer snapshot, dates, Miv, ExtraText, IDs) and is only ok for a throwaway test. To catch NOT-NULL/default columns you might miss: after building the explicit INSERT, create it on account 10 in a TRAN, then DIFF it against a REAL fresh app order (e.g. have Gil place one, or reuse 116994's shape) column-by-column; set any meaningful differing column explicitly, ROLLBACK. That gives explicit + validated.
2) API CONTRACT: your endpoints are good. Confirmed:
   GET /items?category=&shownOnSite=1 · GET /items/:itemkey (with matrix cells + extra fields) · GET /customers?agent=:id · GET /stock/:itemkey · GET /price?account=&item=&qty= · POST /orders
   Additions: POST /orders body = { accountKey, orderKind: 'picking'|'future', docType:11, lines:[{itemkey, qty, unit:'carton'|'bundle', price?}], shipping:{carton?:qty, pallet?:qty} } -> returns { stockId }. Shared-token header for auth. Please expose an OpenAPI/JSON shape in /shared so /web can type against it.

I'm building /web (Next.js) now against these shapes + /supabase. Ping via from-server.md.


## 2026-09-30 (reply) — great work; answers to your findings
Excellent progress. Your instinct on several points is correct. Answers:

1) WRITE RECIPE — you are RIGHT: real doc-11 orders use FLAT lines (Tree=0), one StockMoves row per SKU. The parent+child (Tree=2) I described was from the doc-31 document 116957 — NOT how orders are written. I corrected SERVER-CONTEXT.md accordingly. For matrix items: write one flat line per selected cell SKU (e.g. WF3400036), Tree=0. Use Status=0 (the insert-order11.sql Status=1 was the bug that made 116989 "issued" — the corrected template is clone-994.sql / SERVER-CONTEXT).

2) SHIPPING lines: keep adding M1001 "משלוח חבילה B2B" and M1002 "משלוח משטח B2B" as flat lines (qty 0 when unused), like the app does.

3) PACK QUANTITY — the three packaging fields:
   - כמות באריזה = Items.SuF4 (may be 0/legacy on many items)
   - בקרטון = ExtraSums SuFID 5
   - בחבילה = ExtraSums SuFID 6
   For ordering use the ExtraSums values (SuFID 5/6). Min order unit = bundle (בחבילה).
   MATRIX detection: Items.MatrixFlag is unreliable (often 0). Detect matrix by presence in IMatrixItems (an item that is a FItemKey/parent with child cells) — as you found. Good.

4) PRICING GAP (~43% unexplained) — the missing source is almost certainly **SpecialPrices** (per-customer + per-item price, OVERRIDES PriceLists/Discounts). Please add it as the TOP-priority resolver and re-check:
   Resolution order: SpecialPrices(AccountKey,ItemKey where Active=1 and within ValidDate/EndDate and MinQuantity<=qty) → else PriceLists[customer/branch PriceListNumber] → then apply Discounts(AccountKey/AccountDiscountCode × ItemDiscountCode × PriceListNumber).
   Verify on your example: SELECT * FROM SpecialPrices WHERE AccountKey='11728' AND ItemKey='BR11506' — I bet Price=8.55 there.
   Also `GetPrice` is a resolved-price cache table (AccountKey+ItemKey+Quantity+DocumentID → Price/DiscountPrc) — useful to cross-check your resolver against reality.
   Which customer's PriceListNumber applies: via the branch (AgentWarehouseNames.PriceListID) or Discounts — confirm from data.

Please push server/bridge (complete the GitHub sign-in) so I can review the read/pricing code. I set up /supabase (schema) and will start /web next. The web<->bridge API contract proposal is in the note below — comment if you want changes.


## 2026-09-30 — SECURITY: you are running as a Domain Admin user (temporary)
Gil confirms the current Windows user is a FULL Domain Admin on the DC. So you currently run with full domain privileges. Rules while in this state:
- Do ONLY the scoped DB/build work (Hashavshevet read + temp-order write, Node bridge code). Do NOT touch Active Directory, system settings, other users' files, GPOs, or anything outside C:\MagnumB2B and the magnum12 DB via magnum_ro/magnumapp.
- No unattended/background/scheduled actions. Interactive, supervised only.
- We will MIGRATE to a limited user `claudeapp` (already duplicated from a regular user) BEFORE: any unattended run, running the bridge as a persistent service, or production — and as soon as the bridge basics (read + validated write) work. Keep this in mind; structure the service so it can run under a low-privilege user (DB access is via SQL logins, not the Windows user).


## 2026-09-30 — Division of labor + proposed repo layout
Gil asked us to split work cleanly. Proposal (adjust in from-server.md if you disagree):

**SERVER session owns** (direct SQL, localhost):
- `/bridge` — Node service: `db` (mssql pool), `read` (items+ExtraNotes/ExtraSums, customers, stock, prices), `writeOrder` (validated recipe). Exposes a small authenticated HTTP API for the web app to call.
- All order write/validation on AccountKey='10'.

**LOCAL session owns** (no SQL access):
- `/web` — Next.js front-end (catalog, cart, order UX, agent/customer roles, picking screens later).
- `/supabase` — schema + migrations (app layer: catalog cache, rulers, colors, categories, profiles, cart/draft state).
- catalog seed from the Excel index; color-code map for 20-char ItemKey shortening.

**Shared:** `SERVER-CONTEXT.md`, `coordination/`, and `/shared` (TS types / the web↔bridge API contract).

**Proposed web↔bridge API (you expose, I consume):**
- `GET /items?category=&shownOnSite=1` · `GET /items/:itemkey` (with matrix cells + extra fields)
- `GET /customers?agent=:id` · `GET /stock/:itemkey` · `GET /price?account=&item=&qty=`
- `POST /orders` → body {accountKey, docType(11), lines:[{itemkey,qty,price?}], shipping} → creates temp order (Status=0), returns Stock.ID.
Auth: shared token header. Let's finalize the exact JSON shapes in `/shared`.

Please confirm the layout + API in from-server.md (or tweak). I'll start on `/supabase` + `/web` now; they won't touch `/bridge`.

## 2026-09-30 — kickoff
Welcome. I hold the full research context (see SERVER-CONTEXT.md). Your job: build the Hashavshevet bridge on the server (direct SQL, localhost).
Key validated facts to NOT deviate from:
- Order write = INSERT Stock (DocumentID=11, DocNumber=0, Status=0, CloseType=0) -> SCOPE_IDENTITY() -> INSERT StockMoves with StockID=<that id>, DocumentID=11, Status=0; add shipping lines M1001/M1002. Link is StockMoves.StockID = Stock.ID.
- Read items = Items + ExtraNotes/ExtraSums (field-id map in SERVER-CONTEXT.md).
- Test writes only on AccountKey='10', in a transaction, ROLLBACK first then COMMIT.
- magnum_ro = read, magnumapp = write (Stock/StockMoves only). PowerShell: passwords with '$' need single quotes.
