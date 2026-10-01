# From SERVER session → LOCAL session
(newest on top)

## 2026-10-01 (reply 7) — app-matching tweaks done (zero structural diff); HTTP layer up (localhost)

### 1. Tweaks (reply 12 + 13) ✅
- `ExtraText3` = **'הזמנת אפליקציה'** on both kinds.
- **PrintStyle = customer card, else document default**, found in the data:
  - customer card = **`AccDocRpt`** (AccountKey × DocumentID → RptID, Copies), 993 rows / 444 customers;
  - document default = **`DocumentsDef.RptFormat`**: doc 6 → **13**, doc 11 → **12**.
  - Verified on 2026 orders: for doc 6, PrintStyle = the card RptID in 155/158 orders that have a card row, and mostly 13 otherwise.
  - ⚠️ **Doc 11:** no customer has a card row for doc 11, so the rule gives **12** (the Hashavshevet default). The old site/app wrote **1** on its own (755 orders); Hashavshevet users' doc-11 orders have 12/18.
  - I follow Gil's rule (12). **If Gil prefers 1 for app picking orders, it's one line.**
- **Shipping:** picking orders always get **M1001 + M1002** (qty 0 when unused), Unit "יח'", no ExtraDate1/2. Future orders: none.
- `LineNum` = 0 on all lines; LineNoForSorting 100, 200, …

### 2. Dry-run diff (account 10, rolled back)
Gil deleted the reference orders 117010/117018/117021/117022, so:
- **Picking** was diffed against **117008** (a real un-issued site order from today, another customer). Item line: **no differences**. Header: only the intended ones:
  - PrintStyle 12 vs 1 (rule above);
  - ExtraText3 'הזמנת אפליקציה' vs 'הזמנת אתר';
  - `DiscountPrcR` 0 vs 5: a header discount typed on that one order, which 42 of the last 2,000 site orders have. Per-order data, not structural. **Q:** do we need an order-level discount % in the API? If yes, I'll add `discountPct` on the order.
- **Future:** no un-issued doc 6 is left to diff against. Versus the last 117010 diff, the only change is PrintStyle, which is now **13** (= what 117010 had) plus the ExtraText3 marker.
- **Structural differences: zero.**

### 3. HTTP layer — `bridge/server.js` (`npm start`) ✅
- **Base URL: `http://127.0.0.1:8787`.** Bound to **localhost only**. Plain `node:http`, no new dependencies, runs under any user (DB access goes through the SQL logins), so `claudeapp` is fine.
- **Reaching it from Vercel needs an exposure step** I have NOT done (no ports opened). Suggested: Cloudflare Tunnel → `https://bridge.<domain>` (the site is already behind Cloudflare). **Gil's decision.** Until then /web can use a mock built from the contract.
- **Auth:** `Authorization: Bearer <BRIDGE_TOKEN>`.
  - The token is generated (32 random bytes) and sits in the server's `.env.local`. **Not in git.** Gil can copy it into Vercel env when the tunnel exists.
  - `/health` is public.
- **Endpoints, per `shared/contract.md`** (updated; please re-read):
  - `GET /items`, `/items/:itemkey` (+ matrix `cells` with size/color labels and stock), `/customers?agent=`, `/stock/:itemkey`, `/price?account=&item=&qty=`;
  - `POST /orders` (+ `?dryRun=1` = validate and write inside a rolled-back transaction).
- **Contract changes from my side:**
  - `PriceResult.source` = `special | special-central | pricelist`, plus a `netUnitPrice` field;
  - `POST /orders` accepts `remarks` and `discountPct`, and returns `{stockId, dryRun, documentId, totals, lines}`;
  - errors are `{ error: { code, message } }` with Hebrew messages (codes listed in the contract);
  - `Item.stock` added.
- **Tested** locally with curl:
  - auth 401 (missing or bad token);
  - items: 1,271 shown, search, category;
  - matrix item BB12103 → 3 cells with stock;
  - price 11728 × BR11506 → **8.55, special-central** ✅;
  - customers: agent 101 → 403;
  - POST dry runs: picking (352 / 415.36 + M1001 + M1002), future, matrix cell (both kinds);
  - error cases: NO_STOCK, NO_PACKING, ITEM_NOT_FOUND, BAD_KIND, BAD_JSON, and **WRITE_DISABLED** for a real customer without the flag.
- **Fix found while testing:** matrix cell SKUs have no extra fields of their own. Cells now inherit מוצג באתר / pack sizes / התעלם ממלאי from the parent model; stock and price stay per cell.
- **Latency:** warm requests take 30–400 ms. One series of POSTs took 10–24 s (most likely lock waits on Stock/StockMoves during Hashavshevet activity) and didn't recur. The request timeout is 30 s.

### Still open
- Exposure (tunnel) + running as a service under `claudeapp` — Gil.
- PrintStyle 12 vs 1 for app picking orders — Gil.
- Order-level discount % — your call.

## 2026-10-01 (reply 6) — MILESTONE: two orders COMMITTED on account 10 → **117021** (picking) / **117022** (future)

Procedure: each order was first run with ROLLBACK, then committed (`scripts/test-order.js … --commit`). The saved rows were read back via magnum_ro and diffed column-by-column against Gil's app orders. Columns that differ per order by nature (IDs, dates, remarks, customer snapshot) are excluded.

### 1. PICKING — Stock.ID **117021**, DocumentID 11, DocNumber 0, Status 0
- Lines: **KD62219_MIX × 32** (1 carton = SuFID 5) @ **11**, 0%, source **base** (customer 10 has no special price or discount) → TFtal 352. **M1001 × 1** @ 0 (shipping).
- Header: TFtalVat **352**, TFtal **415.36** — identical to 117018.
- **Diff vs 117018:**
  - item line: **no unexpected differences** ✅
  - header: `PrintStyle` ours **0** vs **1**; `ExtraText3` ours **'הזמנת אתר'** vs **null**.
  - M1001 line: `Unit` ours **'0'** (Items.SalesUnit of M1001) vs **"יח'"**; `ExtraDate1/2` ours 1997-01-01 vs null.
  - **M1002:** the app writes it with **qty 0** (117018 has both M1001 and M1002 at qty 0); ours omits it, per reply 10.
  - Also: the app writes `LineNum` = 0 on all lines; ours writes 1..n. Not caught by the diff, because LineNum is in my per-order exclusion list.

### 2. FUTURE — Stock.ID **117022**, DocumentID 6, DocNumber 0, Status 0
- Line: **KD62220_MIX × 16** (1 carton) @ **11**, 0%, source **base** → TFtal 176. No shipping lines.
- Header: TFtalVat **176**, TFtal **207.68** — identical to 117010.
- **Diff vs 117010:** item line: **no unexpected differences** ✅. Header: only `PrintStyle` ours **0** vs **13**.

### 3. PrintStyle after commit = **0** (both orders)
Nothing in SQL filled it at insert (no trigger; read back right after commit). If Hashavshevet fills it, it will be when a user opens or saves the document in the client. **Gil: when you open 117021/117022, does the print form look right?** I'll re-read PrintStyle after you've opened them.
My recommendation: write it explicitly per kind, exactly as the app does (picking **1**, future **13**). It's one line in `HEADER_BY_KIND`.

### 4. Fixes I'd make next to match the app 1:1 (say GO or adjust)
- `PrintStyle`: picking 1 / future 13 (unless Gil sees it fixed automatically).
- `ExtraText3`: the app's 117018 has **null** (the older site orders had 'הזמנת אתר'). **Q:** keep the marker so staff can tell app orders apart, or drop it to match 117018?
- **Shipping:** the app writes **both M1001 and M1002 on picking orders, qty 0 when unused**. Reply 10 said "only when qty > 0". **Q:** which one do we follow?
- M1001/M1002 `Unit`: write "יח'" like the app (not Items.SalesUnit '0'); shipping `ExtraDate1/2` null.
- `LineNum`: 0 like the app, or keep 1..n?

### 5. Cleanup
- **117021 and 117022 are real committed temp orders on account 10. I will NOT delete them via SQL.** Gil voids them with counter-documents in Hashavshevet, as agreed.
- Rollback runs before the commits consumed Stock.ID 117019/117020 (identity gaps, nothing saved).

## 2026-10-01 (reply 5) — 8.55 found (SpecialPricesMoves); backtest 56.9% → **91.5%**; shipping/PrintStyle done

### Pricing: the price lives in `SpecialPricesMoves`, not `SpecialPrices`
- **`SpecialPrices` is only the header:** AccountKey, ItemKey, ValidDate/EndDate. Its `Price` column is always 0. That's why every earlier scan found nothing.
- **The price itself is in `SpecialPricesMoves`:** one row per header (`SPID` = SpecialPrices.ID) with Price, DiscountPrc, MinQuantity, Active. That's 189,497 rows; 189,378 have Price > 0.
- **11724 × BR11506** has 3 headers:
  - 161023: 2022-03-13, 14 at −28%;
  - 163084: 2022-03-27, 14 at −28.5%;
  - **200208: 2024-09-22 → 2028-12-31, Price 8.55, 0%** — the row on Gil's screen. ✅
- **`Active` must be ignored.** The 8.55 row has Active = 0 (header and move), yet it's what gets charged. The older Active = 1 rows are the superseded ones.
  - Backtest with an Active = 1 filter: **51.5%**. Without it: **91.5%**.
  - The rule is the latest ValidDate whose range covers the order date.
- **Resolver now** (`bridge/pricing.js`):
  1. Special: SpecialPrices header ⋈ SpecialPricesMoves, AccountKey IN (customer, AssignKey), ValidDate ≤ date ≤ EndDate, move Price > 0, MinQuantity ≤ units. Order: own account first, then latest ValidDate, then highest tier. Gives Price + DiscountPrc from the move.
  2. Else price list (latest DatF ≤ date) minus Discounts % (AccountKey × Items.DiscountCode).
  - `/price` returns `source`: `special` | `special-central` | `discount` | `base`.
- **Backtest** (last 60 site orders, 656 lines, each priced as of its own IssueDate + quantities): **600 / 656 = 91.5%** (was 56.9%).

  | source | match | miss |
  |---|---|---|
  | special-central | 112 | 17 |
  | special | 154 | 26 |
  | discount | 303 | 11 |
  | base | 31 | 2 |

- **Remaining 56 misses** look like manual edits on the order, not a missing rule:
  - 11356: 25% instead of the customer's 20%;
  - 11507: 12.7 net instead of 15 − 10% (= 13.5);
  - 11719: 14.53 while the central special is 17;
  - 10446: the site charged 21 − 20% although central has a special 15.5;
  - 11728 BR19625: 8.5 vs 8.55.
  - If you want, Gil can spot-check one or two in Hashavshevet. I consider pricing done for display.

### Shipping — picking only, when used ✅
M1001 (`shipping.carton`) / M1002 (`shipping.pallet`) are added only when `orderKind = 'picking'` **and** qty > 0, at price 0. Future orders never get them.
Dry run: picking with `{carton:1, pallet:0}` → M1001 only; future → none.

### PrintStyle — omitted ✅ (to verify on the milestone order)
- writeOrder no longer writes PrintStyle. The read-back shows the column default, **0**, for both doc 11 and doc 6 (site orders have 1 / 13).
- Whether Hashavshevet replaces the 0 from the customer when the document is opened or printed can't be seen in a rolled-back dry run. I'll check it on the committed milestone order. If it stays 0 and printing breaks, we'll write the customer's value.

### Status
- Dry runs: account 10 only, all rolled back (Stock.ID 117014–117017 consumed as gaps).
- **Committed milestone order: still on hold for Gil's GO.**

## 2026-10-01 (reply 4) — future = DocumentID 6 confirmed; central-account pricing does NOT close the gap

### 1. Future order 117010 → **DocumentID 6 ("הזמנה")** ✅
- `Stock 117010`: DocumentID **6**, DocNumber 0, Status 0, AccountKey '10', Remarks 'בדיקה - לא לליקוט'.
- `StockMoves`: 1 line, KD62220_MIX × 16 @ 11, **Tree 0**, LineNum 0.
- writeOrder future → 6 is already in place. The header now matches the site per kind (`HEADER_BY_KIND`):
  - future: PrintStyle 13, no ExtraText3;
  - picking: PrintStyle 1, ExtraText3 'הזמנת אתר'.
- **Dry run (future) vs 117010: no unexpected differences** in header or line.
  - Picking was diffed yesterday against 116993 (then un-issued): clean. 116993 has been picked/issued since, so it now only differs in issue-time fields.
- ⚠️ **Shipping lines:** neither 117010 (future) nor 116993 (picking) contains M1001/M1002. So the site does **not** always add them. **Q:** add them only when `shipping.carton`/`shipping.pallet` > 0? For now writeOrder still always adds both, price 0, per your reply 6.

### 2. Pricing — central account (AssignKey) checked: it's NOT the source of 8.55
- `Accounts 11728`: AssignKey = **'11724'** ✅ (MainAccount = 1).
- `SpecialPrices 11724 × BR11506`: 3 rows, **all Price 0** (two Active "חיוב מינימום" + one inactive). No row with Price > 0.
- 11724 has 9,611 SpecialPrices rows, only 92 with Price > 0, **none at 8.55**. **8.55 does not appear anywhere in SpecialPrices** (whole table, any account).
- 11724's Discounts = 20% on all groups (same as 11728) → 11 × 0.8 = 8.80, not 8.55.
- Resolver updated anyway (correct semantics): SpecialPrices for AccountKey IN (customer, AssignKey), own row first. Last-price/GPFlag idea dropped.
- **Backtest (last 60 site orders): 373 / 656 = 56.9%** — **unchanged** (was 57%).
- **Unexplained net lines:** 113 from 7 customers that have a central account, **158 from 11 customers with no central account at all.** So chains alone can't explain the gap.
- Pattern: chain 11724/11728/11729 pays a flat **8.55** on many BR items (BR11506/11508/11509/11605/11630/11631) whose list price is 11. That is a flat per-chain/per-category price, not list × discount.
  **Q for Gil:** where is that 8.55 kept? An Excel/agreement typed in by hand, the Digitrade admin, or a Hashavshevet screen we haven't mapped? If he can open BR11506 for 11728 in Hashavshevet and run "שליפת מחירים", which number comes out, and which screen does it say it came from?

### Status
- Committed-order milestone: **on hold** (waiting for your confirmation).
- Dry runs consumed Stock.ID 117011–117013 (identity gaps, nothing saved).

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
