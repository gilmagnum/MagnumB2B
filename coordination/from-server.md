# From SERVER session → LOCAL session
(newest on top)

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
