# From SERVER session → LOCAL session
(newest on top)

## 2026-09-30 (reply 3) — writeOrder done (dry-run verified); price proc not reachable; future = DocumentID 6

### 1. Price-fetch "proc" — not reachable, and probably not a SQL proc at all
- `magnum_ro` sees **0 procedures** (no VIEW DEFINITION; it sees the 783 tables). So I can neither find nor call a proc with this login.
- The evidence says the price fetch runs **inside the Hashavshevet client app**, not in SQL:
  `GetPrice` is a per-user scratch table. It holds 64 rows, one per StationID like `haim_12116` / `Giladmin_4968` (user_processId). Each row holds the last fetch: AccountKey, ItemKey, Quantity, DocumentID, Price, DiscountPrc, GPFlag, NumInfo=Stock.ID, SMInfo=StockMoves.ID.
- **Lead:** `StockMoves.GPFlag` seems to record which pricing rule produced a line. On 1,590 recent site lines:
  - "list + discount" lines have GPFlag 0 / 1 / 41;
  - the unexplained net prices have **GPFlag 50 / 51** (402 lines), plus 116 lines with 0.
  The site obviously replays some Hashavshevet price rule (maybe "last price to customer"; that would fit 11728 paying a flat 8.55 since 2024).
- **Q for Gil (needs `sa`, one-time, read-only):** in SSMS on magnum12 run `SELECT name, type_desc FROM sys.objects WHERE type IN ('P','FN','IF','TF') ORDER BY name;`.
  - If a price proc exists → `GRANT EXECUTE ON <proc> TO magnum_ro` (+ `GRANT VIEW DEFINITION ON <proc>`), and I'll wire it into `/price`.
  - If there are none → pricing lives in the client, and we either reproduce rule 50/51 or rely on "שליפת מחירים" at production (what Gil described).
  - Also: which Hashavshevet price rule does GPFlag 50/51 stand for?
- Until then: `/price` = the resolver (SpecialPrices → list 1 + Discounts), which matches ~57% of history. writeOrder accepts `price` from the web, else it uses the resolver. Every result line carries `priceSource`. The written price is display-only (Hashavshevet re-fetches at production), so writeOrder isn't blocked.

### 2. Future orders = DocumentID 6 "הזמנה" (DocumentsDef)
- DocumentsDef: 6='הזמנה', 11='הזמנת סוכן' (also 58 'הזמנה - בן', 99 'הזמנה למחסן', …).
- Usage since 2025: doc 6 = 546 docs, **all created in Hashavshevet** (ExtraText3 empty, all issued, Status 1/2). **The site has never written a doc 6.** Doc 11 = the site's orders.
- 116994 doesn't exist in Stock. 116989 is doc 11, Status 1 (the known bad test order).
- writeOrder: `orderKind` picking → 11, future → 6.
- Dry-run diff against real doc 6 order 116948: the differences are the issue-time fields (DocNumber, Status, CloseType, KUTime, RoundingMeth, BaseDate, PurchPrice) — expected for an un-issued draft — plus:
  - **PrintStyle**: ours 1 (the doc-11 site value), real doc-6 orders use 45/18/13.
  - **ExtraText3** = 'הזמנת אתר' (kept on purpose, so staff can see the source).
  - **Q:** should a future order carry a specific PrintStyle? Otherwise I leave 1 and staff pick the print form.

### 3. writeOrder — implemented per `shared/contract.md` (branch server/bridge)
- Body: `{ accountKey, orderKind, remarks?, lines:[{itemkey, qty, unit:'carton'|'bundle', price?, discountPct?}], shipping:{carton?, pallet?} }`.
- **Flat Tree=0 lines** (matrix = one line per cell SKU), Status 0, DocNumber 0, CloseType 0, LineNum 1..n, LineNoForSorting 100, 200, …
- Quantity written = qty × ExtraSums SuFID 5 (carton) / SuFID 6 (bundle). An item without that value → rejected (Hebrew error).
- **Shipping:** M1001 (`shipping.carton`) + M1002 (`shipping.pallet`) are always added, price 0, qty as sent or 0.
- **Checks** (all errors in Hebrew with a `code`):
  - the account exists and is active;
  - each item exists, is active and is מוצג באתר;
  - there is a packing quantity for the chosen unit;
  - picking orders: stock ≥ units unless התעלם ממלאי. Future orders skip the stock check.
- **Pre-flight** against sys.columns. Totals are computed like Hashavshevet: TFtalVat = net, TFtal = net × 1.18 from unrounded sums.
- **Safety:**
  - dry run by default (INSERT → read back in the TRAN → ROLLBACK);
  - COMMIT only with `{commit:true}`, and only for account 10 unless `ORDER_WRITE_ENABLED=1`.
- **Verified** (`node scripts/test-order.js [--future]`, account 10, rolled back):
  - picking order (BR11506 2 bundles = 10 units + M1001×1 + M1002×0) vs real site order 116993: **no unexpected column differences** (after adding ExtraDate1/2 = 1997-01-01);
  - read-back inside the transaction works (magnumapp can SELECT).
- **No COMMIT done yet.** Dry runs consumed Stock.ID 116999–117003 (identity gaps, nothing saved).
  - One run hung, caused by two parallel queries on the transaction's single connection. I killed it and SQL Server rolled it back. It is fixed (sequential); the test script now also self-kills after 90s.

### Next
- **Milestone (§8.4):** one COMMITted test order on account 10, verified in the app + Hashavshevet — **waiting for Gil's go-ahead.**
- **HTTP layer** per the contract, running under a low-privilege user.

## 2026-09-30 (reply 2) — pricing checks: step 2 does NOT close the gap; explicit columns + API confirmed

### Pricing — results on 11728 / BR11506 (real line: 8.55, 0%)
- **Step 2 as written (AccountDiscountCode = Accounts.DiscountCode) doesn't work on this data.** `Accounts.DiscountCode` = 0 for **all** 3,820 active customers, and `Discounts.AccountDiscountCode` = 0 in **all** 2,508 rows. So that join returns every customer's rows (10103, 10143, …).
  Discounts here are **keyed by AccountKey** (one row per customer × ItemDiscountCode × PriceListNumber, and PriceListNumber is always 1 in practice). That is exactly what my resolver already does.
  For 11728: Discounts(11728, 'BR-U', list 1) = 20%, and list 1 = 11 (DatF 2024-08-29) → 8.80, not 8.55.
- A) WsPrice: **0 rows** (empty table).
- B) PriceLists BR11506: list 1 = 11 (history 12.5 / 14 / 16 / 14 / 9), list 7 = 1.46, list 9 = 39.9. **8.55 doesn't appear in any list.** Every Discounts row is on list 1.
- C) MivMain / MivMatrix / MivStockChange: **all 0 rows**.
- SpecialPrices / GetPrice for this pair: 0 rows (reported earlier).
- History: this customer has paid 8.55 for BR11506 at 0% since 2024-09 (orders 104647 → 116768). Before that, on 2022-09, the line was 14 − 29%. The fixed net price began right after the list-1 change of 2024-08-29.
- **Conclusion: the net prices are not in Hashavshevet (magnum12).** They almost certainly live in the Digitrade site's own DB. HANDOFF §1 says there is a `mysqld` on 3306 on this server. I have **not** touched MySQL; it's outside my scope and credentials.
  **Q for Gil:** can he get the per-customer price agreements from Digitrade (or approve read-only access to their MySQL)? Otherwise, which rule should apply to those customers?
- Meanwhile the resolver = SpecialPrices(Active, Price>0, dates) → list 1 (latest DatF) + Discounts(AccountKey × Items.DiscountCode). This matches about 57% of historical lines. In `/price` I will return `source` so the web layer can show when a price came from the rule.

### Explicit columns — OK, going with explicit + diff validation
Plan: build the explicit INSERT, run it in a TRAN on account 10, diff every column against a fresh real site order (116993 shape, Status 0), ROLLBACK. Anything meaningful that differs gets set explicitly.

### API contract (`shared/contract.md`) — confirmed, a few notes
1. `orderKind: 'picking' | 'future'`: both write **DocumentID 11** (per SERVER-CONTEXT). **Q:** how does Hashavshevet tell them apart, and which field marks a future order? Until answered, I'll accept `orderKind` and put it in `Remarks`/`ExtraText`. It won't change DocumentID.
2. `unit: 'carton' | 'bundle'`: the bridge converts to units: qty × ExtraSums SuFID 5 (carton) or SuFID 6 (bundle). Line Quantity in Hashavshevet = units.
   - If an item has no SuFID 6 → reject bundle (and carton, if SuFID 5 is missing).
   - If you actually mean qty is already in units, tell me.
3. `shipping: { carton, pallet }` → M1001 "משלוח חבילה B2B" / M1002 "משלוח משטח B2B". Both lines are always added (qty 0 when unused).
   - **Q:** does `carton` here mean the parcel line (M1001)? Should the price be 0, or is there a shipping price?
4. `price?` — accepted for now; the bridge validates it against `/price` and logs any mismatch.
5. Matrix cells in `/items/:itemkey`: `line`/`col` come straight from IMatrixItems.
6. Security (Domain Admin): acknowledged. The service will be built to run under `claudeapp`; DB access goes only through the SQL logins, and nothing runs unattended for now.

### Next (on server/bridge)
writeOrder: flat Tree=0 lines + M1001/M1002, Status 0, dry-run on account 10 + column diff → then the HTTP layer per the contract.

## 2026-09-30 — connected + bridge structure proposal (please review before I commit the write path)

### Connection ✅
- `magnum_ro` → `SELECT SUSER_SNAME()` = magnum_ro, DB magnum12; Items read OK (Hebrew OK).
- `magnumapp` → connects, SUSER_SNAME = magnumapp.
- Branch: `server/bridge`.

### ⚠️ Bug to know: dotenv truncates the passwords
dotenv treats `#` in an unquoted value as a comment, and both passwords contain `#`, so the logins fail ("Login failed for user 'magnum_ro'"). `scripts/test-connection.mjs` has the same problem (it also reads `HASH_DB_USER`/`HASH_DB_PASSWORD`, which are not in `.env.example`).
Proposal: the bridge reads `.env.local` literally (NAME=rest of line, ~10 lines of code) and we drop dotenv.

### Proposed structure (ESM, Node 24, mssql)
```
bridge/
  config.js      env (literal .env.local), constants: DocumentID 11, Warehouse 1, VAT 18, test account '10',
                 M1001/M1002, NoteID/SuFID field maps (§3), fixed header/line values (see below)
  db.js          two pools: ro (magnum_ro, all reads) / rw (magnumapp, order INSERT only); query(), key() = varchar params
  read.js        getItems({shownOnly}), getItem, getMatrixChildren, getAccounts({agent}), getAccount,
                 getStock, getStockByWarehouse, getWarehouses, getOrder(Stock.ID), getTableColumns
  pricing.js     resolvePrices(accountKey, itemKeys) -> {price, discountPrc, source}
  writeOrder.js  writeOrder(order, {commit=false})  — see below
  index.js
scripts/
  inspect-schema.js   dumps columns + latest real simple/matrix order (read-only) -> Drive folder, not git
  smoke-read.js, check-pricing.js, test-order.js (account 10 only; dry run unless --commit)
```
(Later: a small local HTTP service on top of this for the app — no SQL exposure.)

### writeOrder design (recipe from SERVER-CONTEXT §5, no deviation)
- Validate: account exists and is active; items exist and are active; quantity > 0; discount between 0 and 100.
- Pre-flight: check every column against `sys.columns` before opening the transaction.
- One transaction on `magnumapp`:
  1. `INSERT Stock` (DocumentID=11, DocNumber=0, Status=0, CloseType=0, …) → `SCOPE_IDENTITY()`.
  2. `INSERT StockMoves` (StockID=id, DocumentID=11, Status=0), then M1001/M1002 (quantity 0 when unused).
  3. **Default = ROLLBACK (dry run)**; COMMIT only with `{commit:true}`.
- COMMIT for any account other than '10' is blocked unless `ORDER_WRITE_ENABLED=1` is set.
- Matrix: parent `Tree=1` (running LineNum) + children `Tree=2`, `TreeFatherMoveID`=parent ID, `LineNum`=NULL.

Extra fields, copied from real "הזמנת אתר" orders (the current site's orders, e.g. 116993 which is Status 0):
- Header: TransType 'M00', VatFreeTransType 'חפ', Currency 'ש"ח', EvalCurrency '$', MainRate 1, VatFactor 1,
  BranchID 1, UseFID 2, PrintStyle 1, Copies 2, ExtraText3 'הזמנת אתר', PayDate 1990-01-01,
  Osek874=Accounts.TaxFileNum, ContactMail=Accounts.EMail, Agent=Accounts.Agent, AccountName/Address/City/Phone snapshot,
  ValueDate/DueDate/IssueDate=today.
- Lines: ItemName, Unit (SalesUnit or "יח'"), CurrencyCode/OPriceCurrencyCode 'ש"ח', Rate/ORate/PurchPriceRate 1, BranchID 1,
  CancelDate 1999-01-01, WarrentyDate 1980-01-01, OPrice=Price, TftalVat=line×1.18,
  Supply/Base/PurchQuantity=Quantity, Agent.
- Header totals: from unrounded line sums (the same way 116993 is computed): TFtalVat=net, TFtal=net×1.18.
**Q1:** OK to add these fields? The alternative is cloning all ~150 columns from a template order the way `insert-order11.sql` does, but that also copies stale values.

### Findings from the real data (read-only)
1. **`insert-order11.sql` writes Status=1** on both the header and the line. That is probably why 116989 came out "issued". The bridge writes 0 as §5 requires.
2. Matrix, verified against order 116254: parent Tree=1 with TreeFatherMoveID=0; **children carry Price/DiscountPrc/TFtal of their own** and share the parent's LineNoForSorting; parent TFtal = sum of the children. **But the current site rarely writes a parent+children tree** (7 parents out of about 1,500 orders). Most matrix orders are **flat Tree=0 lines of the cell SKU** (e.g. MG15041011S). **Q2:** which one should the app write — parent+children (§4) or flat cell lines, like the current site?
3. `Items.MatrixFlag` = 0 on all items. A matrix is detected via `IMatrixItems` instead (257 parent items, 4,678 cells).
4. `Items.SuF4` = 0 on the items I checked; the "in pack" quantity sits in ExtraSums SuFID 6 (e.g. BB12103: perCarton 40, perPack 4). **Q3:** is §3's "SuF4 = pack quantity" out of date?
5. `WhSummInv` is a document-line view (StockID/DocumentID…), not a per-warehouse summary; stock per warehouse needs an aggregation. For now I use Items.Quantity.
6. Pricing, checked against 657 lines from 60 recent site orders:
   - **57% match** the rule: current price-list 1 price (latest DatF; equals Items.Price) + the Discounts discount (account × Items.DiscountCode).
   - SpecialPrices: almost all rows have Price=0 ("חיוב מינימום", a minimum-charge marker, not a price). Only about 1,667 active rows have Price>0.
   - **The remaining ~42% are net prices with 0% discount that no table explains.** Example: account 11728, BR11506 = 8.55 while price list 1 = 11 and Discounts gives 20% (which would be 8.80). This looks like a rule inside the Digitrade site. **Q4:** does Gil know where these net prices come from (a site-level price list? a per-customer agreement)?
7. HANDOFF.md says order = DocumentID 30/31; SERVER-CONTEXT says 11. I'm going with 11 (the later, verified source).
8. Every dry run consumes a `Stock.ID` IDENTITY value (a gap in the numbering; harmless). One dry run on account 10 has already run successfully (ID 116999 consumed, nothing saved).

### Prototype status
A working prototype of all modules above exists on the server (outside the repo). It was checked with a successful dry run (ROLLBACK) on account 10. I'll move read/pricing into the repo on this branch, and **writeOrder only after your answer to Q1/Q2**.
No COMMIT has been done. 116989 has not been touched (a counter-document is a manual action in Hashavshevet).
