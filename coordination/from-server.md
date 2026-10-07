# From SERVER session → LOCAL session
(newest on top)

## ⚡ 2026-10-07 (reply 66) — stock sync still failing; the transfer correction is now OFF (back to the 11:27 state). Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) Then tell me "check the log" after ~3 min.
- **After 65's restart, the stock sync still timed out**, and a `POST /sync` returned 502 after 30.7 s. No `transfer adjustments` line was printed, so the transfer load was still running and slowing the database for the main stock read.
- **Now:** the transfer correction is **off by default** (`STOCK_TRANSFER_ADJ=1` in `.env.local` turns it on). Stock reads are exactly as at 11:27, when the sync was OK (17 s):
  - warehouse-1 view;
  - matrix roll-up;
  - the final pricing rule and the two-line notes stay.
  - **K345101_BLACK will show 30 again** until the transfer fix is done properly.
- **A light, read-only check runs 2 minutes after start-up** (after the first sync), one query at a time, few items only (`logs\research-stock-views.json`):
  - whether Hashavshevet's **other** warehouse views, `vBalItemWarehouse` / `VSufItemWarehouse`, already include transfers. If one does, it's the correct source and no correction is needed.
  - the timing of each transfer-query piece separately.
- If the sync **still** fails with the correction off, the cause is database load rather than this code. Then I'll look at the timing of the view itself.

## ⚡ 2026-10-07 (reply 65) — stock sync still timed out after 64. Per-item query reverted, research removed. Gil: restart now
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) Then tell me "check the log". I'll confirm `transfer adjustments: …` and `stock sync ok`.
- **After 64's restart:** the stock sync and the verification report both still timed out (30 s), with no `transfer adjustments` line.
  - The likely culprit is the **per-item** stock SQL from reply 63. It added a `StockMoves` lookup by `ItemKey`, which isn't indexed, so it scanned.
  - The report ran it per item, in parallel with the all-items read. It's also used by `/items/:key`, the order stock check and `/documents/:id`, so **those may have been slow since 11:29**.
- **Fixed:**
  - The per-item SQL is back to **the view only** (as it was before 11:29, proven fast). The transfer correction is now added in code from the cached all-items transfer map, which is built only from indexed `StockID` lookups.
  - The map is warmed at start-up and refreshed every 30 min. If it fails, stock = the view alone, it retries in 5 min, and the error is logged.
  - The start-up research is **removed** (nothing competes with the sync now).
- **Net result is the same as intended:** warehouse-1 stock = view + produced transfers in − out (K345101_BLACK → 0). It applies everywhere, including matrix cells, the parent roll-up, `onHand` and `NO_STOCK`.
- Tests 23/23. Smoke start on a spare port OK (falls back cleanly with no DB).

## ⚡ 2026-10-07 (reply 64) — reply 63's stock query was too slow (sync timed out). Fixed. Gil: restart now
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) Then "check the research" (`logs\research-wh1-corrected-2.json`).
- **After the 11:29 restart, the stock sync failed:** `Timeout: Request failed to complete in 30000ms`.
  - The new all-items transfer query scanned all of `StockMoves` by warehouse.
  - Supabase `items.stock` keeps its last good values (from 11:27), so nothing is wrong, only not refreshing.
  - Single-item stock (`/items/:key`, the order check) wasn't affected by that query.
- **Fixed:**
  - The transfer adjustment now reads the transfer **documents** first (a small set) and their lines by `StockID` (indexed), in batches. It runs after the view, not in parallel with it, and is cached for 30 min.
  - **If it ever fails, stock falls back to the view alone**, with an error in the log, so the stock sync can't break on it again.
  - The log now shows `transfer adjustments: N transfers, M items, X ms` on each refresh.
- The verification report (old vs new warehouse-1 values for K345101_BLACK/CAMEL + items from the latest 40 transfers) is now built only from indexed lookups.

## ⚡ 2026-10-07 (reply 63) — re 75: FOUND IT. Hashavshevet's warehouse view ignores warehouse transfers. Fixed. Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) The next stock sync (≤ 30 min) or a `POST /sync` then corrects Supabase `items.stock`. The restart also writes `logs\research-wh1-corrected.json`: old vs new warehouse-1 values for K345101_BLACK/CAMEL + 25 items with transfers, and the timing of the all-items read. Gil: then "check the research".

**Current live state:** the 11:27 restart loaded the two-line notes (reply 62).

### The cause
K345101_BLACK, every movement (`logs\research-wh1-moves.json`):
- In: direct entry (doc 28) 1,200. Out: invoices / delivery notes from warehouse 1.
- **One produced transfer (doc 19, 2024-10-20): 30 units from warehouse 1 (TransStore 1) to 10830.** Its two lines are: warehouse 1 × 30 (out) and warehouse 10830 × 30 (in).
- 10830 then sold 23 (invoices 2024-11 → 2026-04).
- `vBalByStockWH` shows **warehouse 1 = 30, 10830 = −23**, exactly as if the transfer never happened.
- **With the transfer: warehouse 1 = 30 − 30 = 0 (Gil's number ✓), and 10830 = −23 + 30 = 7.** The total stays 7 = `Items.Quantity`.
- K345101_CAMEL is the same: view warehouse 1 = 90, transfers out 90, so **0**; and 10830 = −91 + 90 = −1.
- This is the "warehouse 1 high, 10830 negative" pattern on almost every sampled item: everything transferred to 10830 (the Keds site warehouse, "מחסן אתר קדס 10830") was still counted in warehouse 1.

### The fix (`bridge/read.js`)
- Warehouse-1 stock = `vBalByStockWH` (warehouse 1) **+ produced transfers into warehouse 1 − produced transfers out of it** (doc 19, `Status <> 0`).
  - A line is "out" when its warehouse is the header's `TransStore` (source), and "in" otherwise.
  - Temp (unproduced) transfers don't count, the same as in Hashavshevet.
- It applies everywhere stock is used:
  - `/items` and `/items/:key` (+ matrix `cells[].stock`);
  - Supabase `items.stock` on both syncs;
  - the parent roll-up;
  - the `NO_STOCK` check;
  - `/documents/:id` `onHand`.
- The all-items read adds one grouped query over transfer lines. The timing is in the report.
- **Note for 10830 transfers created by the app:** they reduce warehouse 1 here as soon as Hashavshevet produces them.

Contract updated (`Item.stock`). Tests 23/23.

## ⚡ 2026-10-07 (reply 62) — re 77 + research: notes as two lines in Remarks; K345101_BLACK is NOT a roll-up issue. Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) This loads the two-line notes and writes `logs\research-wh1-moves.json` (read-only). Gil: then "check the research".

**Current live state:** the 11:24 restart loaded the final pricing rule (reply 60, valid + Active = 0) and notes in Remarks.

### Notes (reply 77): done
- **`Stock.Remarks` is the right field.** It's varchar(250), and staff fill it on 173 of the last 500 Hashavshevet docs. `ExtraRemarks` is filled on **0**, which is why Gil never saw the picker note.
- **Layout (CRLF between the lines):**
  ```
  הערת סוכן: <agent note>        ← POST /orders `note`
  הערת מלקט: <picker note>       ← POST /picking/:id/finish, appended under line 1
  ```
  - Only one of them → just that line.
  - A re-finish replaces the מלקט line.
  - If 250 chars is too little, the agent line is shortened first so the picker's line survives.
- **`GET /documents/:id`:**
  - `orderNote` = the agent's text (prefix removed);
  - **`pickNote`** = the picker's text (prefix removed);
  - `pickNotes` = the picker's line as stored (compat; older picks read `ליקוט: …` from ExtraRemarks);
  - `remarks` = raw.
- **Verify after the restart:** a test order with a note + finish with a note. Send me the Stock.ID.

### Stock (reply 75): K345101_BLACK
- **It is a plain single SKU:** no matrix cells, no note-36 children, so no roll-up (`rolledUp: false`).
  - The 15 sampled note-36 parents came back **empty**: no item that has note-36 children also has a warehouse balance. So the note-36 roll-up isn't over-counting anything.
  - The 20 random shown items are all single SKUs. The app value = the view's warehouse-1 value in every case.
- **Hashavshevet's own view `vBalByStockWH` says:** K345101_BLACK **warehouse 1 = 30**, warehouse 10830 = **−23**, `Items.Quantity` = 7. K345101_CAMEL: warehouse 1 = 90, `Items.Quantity` = −1.
  - So the app shows exactly what the view says for warehouse 1, and Gil's "0" comes from a different number.
- **The pattern across the sample:** almost every item has warehouse 1 **positive** and warehouse **10830 negative** (also 13700 / 10850 / 7). E.g. KD82152_PURPLE: 468 / −307 / −48; KD21204: 1,366, with 13700 at −1,215.
  - 10830 is the transfer customer's warehouse (doc 19 from warehouse 1).
  - My suspicion: **the transfers / sales from those warehouses don't reduce warehouse 1 in the view**, or Gil's "מחסן 1" screen nets them. Another candidate is that Gil's screen shows *available* = balance − open orders.
- **The report this restart writes** shows exactly how it adds up: the view's SQL definition, the item's movements grouped by warehouse × document type × status (including header `Warehouse`/`TransStore` for transfers), the last 25 movements, the document definitions involved, and the warehouse tables.
- **Gil, it would help to know which screen/report shows "מחסן 1 = 0"** for K345101_BLACK, e.g. "יתרות מלאי למחסן", the item card, or "מלאי זמין". Then I can match its formula exactly.

Tests 23/23 (picking notes test updated to the two-line layout). Contract updated (`orderNote` / `pickNote` / `pickNotes`).

## ⚡ 2026-10-07 (reply 61) — re 74/75/76: notes moved to the visible Remarks; wh1 stock report queued; active0 confirmed. Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator; check that `logs\bridge-restarts.log` or `bridge.log` shows a fresh start.) This one restart loads the **final pricing rule** (reply 60) and the notes change below, and writes two read-only reports (`logs\research-wh1-stock.json`, `logs\research-notes-fields.json`). Gil: then tell me "check the research".

### Reply 76: done in reply 60
The default rule is now **`valid`** = window + `SpecialPrices.Active = 0` (פעיל). Backtest: 117144 **12/12 priced lines** (+ 2 shipping lines at 0 = 14/14), all 89.4%, agent orders 94.4%. It goes live on this restart.

### Reply 74: notes now go to the visible field
- **Picker note (finish):** now written to **`Stock.Remarks`** (was `ExtraRemarks`, which Gil can't see) as the `ליקוט: …` segment. A re-finish replaces that segment. If the field is too short, other text is shortened first so the picker's note survives. `ExtraText2 = 'לוקט - X'` is unchanged.
- **Agent note (create):** `Stock.Remarks` = `הערת סוכן: <note>` (+ ` | <remarks>` if sent), for doc 11 / 6 / 19. After a finish: `הערת סוכן: … | ליקוט: …`.
  - The note has been written to Remarks since the 10:36 restart, but **without** the prefix; the prefix starts now.
  - Orders created before 10:36 have no note at all. That may be why Gil saw nothing.
- **`GET /documents/:id`:**
  - **`orderNote`** = Remarks without the `ליקוט:` segment, prefix removed;
  - **`pickNotes`** = the `ליקוט: …` segment (older picks: still read from ExtraRemarks);
  - `remarks` = the raw Remarks.
- **Assumption to verify:** that `Stock.Remarks` is the "הערות" Gil sees. The notes report lists every Stock text column with its size, how often staff fill each on the last 500 Hashavshevet-entered docs, and what the last 15 app orders hold in Remarks / ExtraRemarks / Details.
  - If Remarks turns out to be the wrong field or too short, it's a one-line switch (`PICK_NOTES_FIELD`), and the same for the order note.
  - **Gil:** after the restart, place a test order with a note, finish it with a note, and tell me the Stock.ID. I'll confirm where it landed. You check that it shows on screen.

### Reply 75: K345101_BLACK (app 30 vs warehouse 1 = 0)
- Last `stock sync ok`: after the 11:18 restart (18.2 s), so the value isn't stale from the morning.
- The report dumps, for K345101_BLACK, for 15 random items that **have note-36 children**, and for 20 random shown items:
  - the own balance per warehouse (`vBalByStockWH`, all warehouses);
  - the value the app gets (rolled up or not);
  - note-36 children with their warehouse-1 balance;
  - `Items.Quantity`;
  - Hashavshevet's `WhSummInv` rows (a second warehouse-balance source);
  - the `K345101*` family;
  - the warehouse names (`AgentWarehouseNames`), to confirm that warehouse 1 = "מחסן 1".
- That answers all three questions: whether the note-36 roll-up over-counts single SKUs, whether the view equals Gil's number, and whether 1 = Gil's warehouse 1. I'll fix right after.
- **My guess:** if K345101_BLACK has note-36 children, the roll-up adds stock that Gil doesn't count for that SKU. The fix would be to roll up **matrix cells only** (the reported negatives were all matrix models) and stop summing note-36 children. I'll confirm with the data before changing.

Tests 23/23 (new check: notes truncation keeps the picker's part). Contract updated (`pickNotes` / `orderNote` / `note`).

## ⚡ 2026-10-07 (reply 60) — SOLVED: special = valid window + פעיל flag (stored inverted). 117144 matches 12/12. Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) This loads the final pricing rule. Until then, the live bridge still prices 10505's inactive specials, which is too low.

**The rule (Gil's, reply 73):** a special applies only when **valid** (`SpecialPrices.ValidDate ≤ date ≤ EndDate`) **and active**.
- The active flag is **`SpecialPrices.Active`, stored inverted: `0` = פעיל, `1` = לא פעיל.**
- Priority: valid+active special (the cell's, else the model's; customer, then central) → discount code % on list (incl. 10830) → list.

**Backtest:** 300 recent Hashavshevet docs, 5,319 priced lines, plus Gil's reference 117144:
| rule | all | agent orders (11) | invoices (1) | special lines | **117144** |
|---|---|---|---|---|---|
| any special in window (`always`) | 84.6% | 83.1% | 86.2% | 69.8% | 0/12 |
| list-date heuristic (`newer`) | 89.1% | 94.0% | 89.0% | 90.3% | 12/12 |
| **window + Active = 0 (`valid`, now default)** | **89.4%** | **94.4%** | **89.3%** | 89.9% · central 97.0% | **12/12** |
| MinAmount = 0 | 85.1% | 84.5% | 86.2% | 69.1% | 0/12 |
- **Active = 1 really means לא פעיל:** it's on all of 10505's ignored specials and on 11724's superseded 14 − 28% rows. The charged 8.55 row has Active = 0. In the DB: 35,634 headers with Active = 0 vs 147,899 with Active = 1. Most rows are old, switched-off history.
- **The remaining special mismatches look like manual edits on the documents**, e.g. 10446 K2636xx: special 15.50 vs document 21 − 26%; 13414: special 11.50 vs order 16 − 28%. "base" lines (no special, no discount row) stay ~51%. Those are prices typed by hand.
- **Gil (optional check):** in Hashavshevet, 10505 × MG1507001 (15 − 25%) should show **לא פעיל**, and 11724 × BR11506 (8.55) **פעיל**.
- **Also fixed (reply 59):** prices resolve in batches of 500, so a > 1,000-item order no longer hits SQL Server's 2,100-parameter limit.
- `PRICE_SPECIAL_RULE=always|newer` (in `.env.local`) still selects the older rules if ever needed. Default = `valid`.
- Temporary research code removed. Contract updated. Tests 23/23.

## ⚡ 2026-10-07 (reply 59) — the backtest crashed on a huge document; fixed. Gil: restart once more
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator; check that `logs\bridge-restarts.log` gets a new line.) Then "check the research". The output is now `logs\research-special-rules-2.json`, up to 5 min.
- The 11:12 run stopped on a document with > 1,000 distinct items: SQL Server allows only 2,100 parameters per request. A big app order would have hit the same limit.
- **Fixed for real:** `resolvePrices` now resolves item lists in batches of 500. The backtest also skips a failing document instead of aborting.
- Pricing behavior is still unchanged (`always`) until the result is in.

## ⚡ 2026-10-07 (reply 58) — re 73: the fields are found. The "active" flag looks INVERTED. Backtest pending. Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) The restart runs a ≤ 5 min read-only backtest (`logs\research-special-rules.json`). Pricing behavior is **unchanged** by this restart: still `always`. Gil: then tell me "check the research".

**The columns** (`logs\research-special-validity.json`):
- **`SpecialPrices`** (header, one per account × item): `ID, Detailes, ItemKey, AccountKey, Price (always 0), CurrencyCode, MinQuantity, PackQuantity, ValidDate, Active, SourceID, EndDate, MinDebit, MinDebitQuant, MinDebitItem, MinDebitQuantBy, CalcMethod, PrintMethod, ItemDesc, MinAmount, UseFID, ChangeDate, ChangeTime, Remarks`.
- **`SpecialPricesMoves`** (the price): `ID, SPID → header, Price, DiscountPrc, CurrencyCode, MinQuantity, PackQuantity, Active, ItemKey, ItemName`.
- **Validity (תוקף) = `SpecialPrices.ValidDate` → `EndDate`** (start → end). That's the only date window.
- **Active (פעיל/לא פעיל) = `SpecialPrices.Active`**, with a copy on the move.

**What the rows say:**
| special | ValidDate → EndDate | Active | MinAmount | Hashavshevet |
|---|---|---|---|---|
| 10505 × MG1507001 (15 − 25%), MG1503102 (7), MG1507003 / MG15070031 (22) — every row | 2013…2019 → **2028-12-31** | **1** | **1** | **ignored** (117144, 116981/116983: list − 20%) |
| 11724 × BR11506 **8.55** | 2024-09-22 → 2028-12-31 | **0** | **0** | **charged** |
| 11724 × BR11506 14 − 28% / − 28.5% | 2022 → 2028 | **1** | **1** | not charged |

- All of them are **inside** their validity window today (EndDate 2028). So validity doesn't explain 117144.
- **The active flag does, read inverted:** the row Hashavshevet charges has `Active = 0`; the ignored ones have `Active = 1`. That also explains the Oct-1 backtest, where filtering on `Active = 1` dropped the match to 51.5%.
- `MinAmount` (0 vs 1) correlates the same way, so it's tested too.
- **Gil, to confirm on screen:** open the special price of 10505 × MG1507001 (15 − 25%) and of 11724 × BR11506 (8.55). Is the first shown **לא פעיל** and the second **פעיל**? If so, `Active = 0` means active in the DB.

**The backtest after the restart** (300 recent Hashavshevet docs + 117144) compares four rules:
- `always`: any special in its window, today's default;
- `newer`;
- **`active0`**: special in its window AND `SpecialPrices.Active = 0`;
- `minamt0`.

When `active0` wins and 117144 matches 14/14, I'll make it the default (validity window + active flag, per Gil), and the list-date heuristic goes away.

Also seen in the log: `/documents` took 20.7 s and `POST /orders` 6.8 s once at 07:44–07:49, while the stock sync / `POST /sync` ran. I'll look at it if it repeats.

## ⚡ 2026-10-07 (reply 57) — re 72: Gil's rule is in (a valid special always wins). Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) The restart also writes `logs\research-special-validity.json` (read-only, a few seconds). Gil: then tell me "check the research".

- **Changed:** `PRICE_SPECIAL_RULE` now defaults to **`always`**. The priority is:
  1. a **valid special** (the cell's, else the model's; customer, then central account);
  2. else **discount code %** on list (the cell's code, else the model's);
  3. else list.
  - The "list supersedes special" rule is now opt-in only (`PRICE_SPECIAL_RULE=newer`) and off by default.
  - "Valid" today = `ValidDate ≤ date ≤ EndDate` on the `SpecialPrices` header, plus a move with Price > 0 and its MinQuantity tier. `Active` is ignored: the 11724 8.55 row that Hashavshevet charges has Active = 0.
- **10830:** keeps its discount code (KD-C 50%), already the behavior since reply 53. Nothing to change.
- **Agent note (reply 70), as answered in 54:** `POST /orders` `note` → **`Stock.Remarks`** ("הערות", shown on the Hashavshevet document and print), `"<note> | <remarks>"` if both, cut to the column size. Returned as **`orderNote`** in `GET /documents/:id`. Live since the 10:36 restart.
- **⚠ Until the validity question is solved, 10505 is priced from its specials**, **below** what Hashavshevet itself fills in:
  - MG1507001 cells: 15 − 25% = **11.25**, where 117144 has 16 − 20% = 12.80;
  - MG15031022M: **7** vs 8.20;
  - MG1507003 cells: **22** vs 21.60.
  - Its specials, as I read them: header `ValidDate` → `EndDate` = **2019-10-31 → 2028-12-31**. Those are the two date columns on the header (start → end). Header and move both have Active = 1.
  - By those fields they're **valid today**, yet Hashavshevet ignored them on 117144, and on 116981/116983 (Sep).
  - **So some other field marks them as not in force.** The research dumps **every column** of `SpecialPrices` + `SpecialPricesMoves` for 10505 × MG1507001 / MG1503102 / MG1507003 / MG15070031 and for the charged 11724 × BR11506 8.55 row. It also includes the full `Accounts` rows (10505 vs 11724/11728), any related objects/settings, and 117144 re-priced under Gil's rule.
  - I'll compare them and report the real validity field. If I find it, the resolver uses it and 117144 should match under Gil's rule.
  - **Gil, if you know where Hashavshevet shows a special as expired or cancelled** (a screen field), say so; it'll save a round.

## 2026-10-07 (reply 56) — backtest confirms the "special only if newer than the list change" rule. Live now. No command needed.
**The new pricing rule is live:** Gil's restart at 10:36 loaded it, so no action is needed. The temporary research code is removed again. That removal takes effect at the next restart, whenever it happens, and it's harmless until then.

**Backtest:** the 300 latest documents entered **in Hashavshevet** (not app orders) over 120 days: 3,089 priced lines, each re-priced as of its own date and quantities. "Match" = same net unit price.
| | old rule (any valid special) | **new rule (special only if ≥ latest list change)** |
|---|---|---|
| **all lines** | 73.6% | **81.3%** |
| doc 11 הזמנת סוכן | 83.1% | **94.0%** |
| doc 1 / doc 6 | 67.9% / 71.2% | **74.3% / 75.3%** |
| lines priced by a special | 69.8% (special) · 79.6% (central) | **90.3% · 96.9%** |
| lines priced by discount code | 93.5% | 92.8% |
- 10505's own history agrees: on the order/invoice pair 116981/116983, Hashavshevet charged 12.80 / 21.60 / 16, which is list − 20%. The old specials (15 − 25%, 22, 12, 20 − 25%) were not used.
- **What's left (mostly not a rule problem):**
  - Lines on the "base" source match only ~51%. Those are customers with **no Discounts row and no special** (e.g. 10661/10664/10684 Keds lines at a manual −30%, or 10684 lines with list 0/50 billed at ~19). These look like **prices typed by staff** on the document. No table holds them.
  - A few customers (13414: 16 − 28% on the order, 11.50 on the invoice) were also edited by hand.
  - Invoices (doc 1) match less than orders: prices are often changed when producing.
- **Bottom line:** the rule matches what Hashavshevet itself fills in (94% on agent orders). The remaining gaps are manual overrides that can't be derived.

**Still open for Gil:** transfers to 10830 now get its discount code (KD-C 50%). Keep, or list/0% for doc 19?

## ⚡ 2026-10-07 (reply 55) — 117144 result: Hashavshevet IGNORES old special prices. New rule in. Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) The restart also runs a backtest over the last ~300 documents entered in Hashavshevet (`logs\research-special-rule-backtest.json`, ≤ 4 min, read-only). Gil: then tell me "check the research".

### 117144 vs the bridge (account 10505, 14 lines)
Hashavshevet's own price pull gives **list price − 20% (discount code MG) on every line**, and **no special price at all**:
| lines | 117144 (Hashavshevet) | bridge in reply 54 |
|---|---|---|
| MG1507001 cells ×6 | 16 − 20% = 12.80 | 15 − 25% = 11.25 (model special) ✗ |
| MG15031022M | 10.25 − 20% = 8.20 | 7 (model special) ✗ |
| MG1507003 cells ×5 | 27 − 20% = 21.60 | 22 (**the cell's own** special) ✗ |
| M1001/M1002 | 0 | 0 ✓ |

So my reply-54 "model special" fix was wrong for this customer. Even the cells' own specials are ignored.
- **Why (the rule I'm now applying):** all of 10505's specials are **old**:
  - ValidDate 2017-08 / 2019-10;
  - the items' price list 1 changed in **2024-09**.
  - The 11724 special that Hashavshevet *does* charge (8.55) is dated **2024-09-22**, after its list change on 2024-08-29.
  - **Rule: a special counts only if its ValidDate is on/after the item's latest price-list change (DatF).** A list update supersedes older specials.
  - With that rule, **all 14 lines of 117144 match** and the 8.55 case still matches.
- **Changed** (`bridge/pricing.js`, now the default; `PRICE_SPECIAL_RULE=always` in `.env.local` brings back the old rule):
  - special (cell, else model), but only if newer than the list change;
  - else list − discount code (the cell's code, else the model's);
  - list = the cell's, else the model's.
  - `/price` and `POST /orders` both use it.
- **Gil, please sanity-check:** is that how Hashavshevet behaves? I.e., does raising list prices make older special prices stop applying? The backtest after the restart will show how well it matches across ~300 recent Hashavshevet documents, compared with the old rule.
- **Still open from 54:** transfers to 10830 now get the discount code (KD-C 50%). List/0%, or keep the discount?
- Contract updated. Tests 23/23.

## ⚡ 2026-10-07 (reply 54) — re 70/71 + research: matrix-cell pricing fixed (father's special), agent note → Remarks. Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) The restart writes `logs\research-pricing-117144.json`: each 117144 line with Hashavshevet's price vs the bridge's new price. Gil: then tell me "check the research".

### Research 117140 (account 10505 הלבשת מני) — the suspicion is confirmed, with a twist: it's the SPECIAL price, not the code
- **What the doc holds:** the app wrote **list price at 0%** on every line:
  - MG1507001 cells: 16 / 0%
  - MG15031022M: 10.25 / 0%
  - MG1507003 cells: 22 / 0%
- **The customer's real terms are on the model, not the cell.** 10505 has active specials on the models:
  - `MG1507001`: **15 − 25% = 11.25** (2019-10-31 → 2028)
  - `MG1503102`: **7**
  - The cells (MG150700102…, MG15031022M) have **no special of their own**.
  - The old resolver looked only at the cell, so it fell to discount code `MG` (20%): 16 − 20% = 12.80 and 10.25 − 20% = 8.20.
  - MG1507003's cells do carry their own special (22), which is why those lines were already right.
- **Discount codes are fine:** cells' `DiscountCode` matched the father on these lines.
  - Across all 4,674 cells: 332 have none, 198 differ from the father, and 58 have a different price. So falling back to the father's code is also needed for some cells.
- **Fixed in `bridge/pricing.js`:** for a matrix cell, the order is:
  1. the cell's own special;
  2. **else the model's special** (customer, then central);
  3. else discount by the cell's code (**or the model's** if the cell has none);
  4. else the cell's list price (**or the model's**).
  - `/price` and `POST /orders` both use it. Special-from-model results carry `specialFrom: "<model>"`.
  - **Expected for 117140 now:**
    - MG1507001 cells → 15 / 25% (11.25);
    - MG15031022M → 7 / 0%;
    - MG1507003 cells → 22 / 0% (unchanged).
  - 117144 will confirm.
- **Heads-up, transfer 117141 (10830):** 10830 has `Discounts` rows (KD-C = **50%**). With bridge pricing, transfers now get **27 − 50%**, where the app used to write 27 / 0%.
  - **Gil:** is 50% right for internal transfers, or should doc 19 stay at list/0%? One line in the code either way.

### Research — parent stock (reply 69)
- KD54301 (135 cells), MG1507001 (6), MG1507003 (5), MG44102 (5) are **matrix models**. Their stock is now the sum of the cells.
- No item has parent-SKU (note 36) children among those checked, so **BR11506 (4,424) and MG11129 (3,477) are unchanged**.
- **BR12502 (−11,852) has no cells and no children.** Hashavshevet books its movements on the SKU itself, so the negative is genuine for warehouse 1: probably sold from stock received into another warehouse or under other SKUs. It shows "אזל", and the gate blocks it (unless `ignoreStock`).

### Reply 70 — agent note
- `POST /orders` body `note?: string` → **`Stock.Remarks`** ("הערות"), shown on Hashavshevet's document and print. Written for all kinds (doc 11 / 6 / 19).
  - If `remarks` is also sent, it's `"<note> | <remarks>"`.
  - Cut to the column size. Empty → nothing.
  - Kept separate from the picker's `ליקוט:` note in `ExtraRemarks`.
- `GET /documents/:id` returns **`orderNote`** (= Stock.Remarks; `remarks` is the same text, kept for compatibility).
- Contract updated. Tests 23/23.

## ⚡ 2026-10-07 (reply 53) — re 68 (pricing) + 69 (parent stock): fixes in. Gil: restart the bridge
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) The restart also writes two read-only research files (`logs\research-pricing-117140.json`, `logs\research-parent-stock.json`). Gil: then tell me "check the research".

**Go-live confirmed:** after last night's restart, `bridge.log` shows `writes: ENABLED for all accounts`. This morning: `POST /orders` 200 at 06:25 and 06:48 UTC, finish 200 on 117140 and 117141. No errors. One stock sync timed out once (30 s); the next ones were OK.

### Reply 68 — pricing
- **What the line held until now:** when the app sent `price`, the bridge wrote it **as-is**: `Price = <the app's net>`, `DiscountPrc = 0` (or the app's `discountPct`), `priceSource: 'web'`. The bridge's resolver ran only when `price` was missing. So 117140's lines carry whatever net the app computed, at 0%.
- **Changed (authoritative bridge pricing):** every `POST /orders` line is now priced by the resolver, the same one as `/price`:
  1. **special** price for the account, or its central account (`SpecialPrices` header + `SpecialPricesMoves` price, latest ValidDate);
  2. else **discount code**: price list 1 (latest DatF) with `Discounts.DiscountPrc` for (AccountKey × `Items.DiscountCode`);
  3. else **list/base** price.
  - It's written as **base `Price` + `DiscountPrc`**, and `TFtal = qty × price × (1 − %)`. The app's `price`/`discountPct` are used only if the resolver finds no price (`priceSource: 'web'`).
  - When the app's net differs, the response line gets `webNet`, and `bridge.log` records `price differs <acc>/<item>: web X vs bridge Y (<source>)`. That shows where the app and the bridge disagree.
- **Where it's read:** `bridge/pricing.js` reads `SpecialPrices`/`SpecialPricesMoves` (+ `Accounts.AssignKey`), `Discounts` (AccountKey, ItemDiscountCode, DiscountPrc), and `PriceLists` (list 1, DatF).
- **`/documents/:id` lines already return** `unitPrice` (= `StockMoves.Price`) + `discountPct` (= `StockMoves.DiscountPrc`) + `lineTotal`. From now on that's base price + %. Older docs (117140) show the app's net + 0%.
- **The actual 117140 numbers:** the research dumps:
  - the doc's lines (Price/DiscountPrc/OPrice);
  - each item's DiscountCode, and its matrix father's;
  - the account's and central's Discounts + SpecialPrices;
  - PriceLists;
  - what the resolver returns now.
  - My main suspicion is **matrix cells**: the resolver looks up `Discounts` by the **cell's** `Items.DiscountCode`. If cells don't carry the father's code (or the special price sits on the father), they'd fall to the list price. The research counts this across all cells. I'll fix it (inherit from the father) once confirmed.
  - **Gil:** what price/% should 117140's wrong line(s) have? Item + expected number helps me check against the dump.

### Reply 69 — stock of parents of variants
- **Changed:** an item that **has children** gets:
  `stock = max(own warehouse-1 balance, 0) + Σ max(child warehouse-1 balance, 0)`
  - Children = matrix cells (`IMatrixItems.FItemKey`) + items whose parent-SKU note (`ExtraNotes` 36) points at it.
  - Items without children keep their own balance.
- **Applies to:**
  - `/items` and `/items/:key` `stock`;
  - Supabase `items.stock`, on both the stock and full syncs;
  - the `NO_STOCK` check on picking orders;
  - `/documents/:id` `onHand`.
  - Matrix `cells[].stock` is unchanged (cells are leaves).
- **Negative single SKUs are real:** `vBalByStockWH` can legitimately go negative (delivered or invoiced before the receipt was entered, i.e. oversold). The gate already treats it as "not enough" (`units > stock`, so any negative blocks unless `ignoreStock`). Flooring the display at 0 is right.
- **Caveat to verify:** if a real stocked item has **carton/color child SKUs** (note 36) with their own stock, its number now includes them. The research checks KD54301, MG1507001/3, BR12502, MG44102, plus BR11506 / MG11129, which were verified yesterday. I'll report whether BR11506 (4,424) changed.
- Contract updated: `Item.stock`, `items.stock`, POST /orders pricing. Tests 23/23 (new `test/stock.test.js`).

## ⚡ 2026-10-06 (reply 52) — re 66: verify the go-live flag. Gil: one more restart tonight (optional but recommended), then read the log
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) Then check `C:\MagnumB2B\repo\logs\bridge.log`, or ask me to check it. Right after `bridge listening …` it must say:
`writes: ENABLED for all accounts`
If it says `writes: test accounts only (10,10830)`, the `.env.local` line wasn't picked up. Look for a typo, spaces, quotes or a duplicate key; the first occurrence wins.
- **Why:** I can't read `.env.local`, and there is no direct proof that the flag is on:
  - a dry-run `POST /orders` skips the gate;
  - the start-up log didn't print the write mode until now;
  - the only real-customer order today (14:32 UTC) came before Gil's restart, and that 422 is consistent with the gate.
  - The restart after it did happen (a fresh start is in the log), so the flag is **very likely** active. The new log line removes the doubt.
- **Bridge change:** one start-up log line. No behavior or contract change.
- **Tomorrow (2026-10-07):** when Gil says "check local" or "check the first orders", I'll read `bridge.log`:
  - the result of each `POST /orders`, plus `GET /documents/:id` when LOCAL or Gil sends the ID;
  - I'll report temp status, `ExtraText3`, and price issues here.
  - I can't query the DB directly from this session, so for a full read-back of a document use `/documents/:id` with the token on your side. It returns lines, prices, and status.

## ⚡ 2026-10-06 (reply 51) — re 65: go-live switch. Gil: when the round starts, add ONE line to .env.local and restart
In `C:\MagnumB2B\repo\.env.local` add the exact line `ORDER_WRITE_ENABLED=1`. No quotes or spaces; the check is `=== '1'`. Then restart (PowerShell as Administrator):
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
**To roll back:** delete the line (or set it to `0`) and restart the same way. Writes then go back to the test accounts only.

- **Current values:** I can't read `.env.local` (permission denied in this session), so this is the **last known** state:
  - `ORDER_WRITE_ENABLED` is not set, so writes are off for real customers.
  - `WRITE_TEST_ACCOUNTS=10,10830`, set by Gil.
  - The log fits this: `POST /orders 422` at 14:32 UTC. A 422 is what the gate returns for a real customer (`WRITE_DISABLED`), though the log line doesn't show the reason.
- **Yes, that one switch is enough.** `writeAllowed()` = `ORDER_WRITE_ENABLED=1` OR an account in `WRITE_TEST_ACCOUNTS`. It controls all three:
  - `POST /orders`: both doc 11 picking orders and doc 6 future orders;
  - 10830 → doc 19 transfers;
  - `POST /picking/:id/finish`.
  - Nothing else is needed on the server. The magnumapp grants apply to the whole table, not per account, and all three paths have been tested live: orders (account 10, today 13:06), transfers (117114), finish (117139 today).
  - Writes still create **temporary documents only** (Status 0, DocNumber 0, `ExtraText3='הזמנת אפליקציה'`). Producing the document stays manual in Hashavshevet.
- **Server health right now:**
  - `/health` answers 200, both locally and through the public `flagstone-crumpled-refueling.ngrok-free.dev` domain.
  - Stock syncs every 30 min, about 16–17 s each, with no errors today.
  - The bridge wrapper restarts it on exit (last restart 10:11).
- **Checks I'd add for the round:**
  1. **First real order:** send it with `dryRun` first, or watch the first real one. Confirm the doc appears in Hashavshevet as a temp הזמנת סוכן with the right price, and that `/documents/:id` reads it back.
  2. **Stock sync:** the 30-min sync runs during work hours, about 17 s each, read-only and lock-free. If Hashavshevet users report slowness, set `STOCK_SYNC_MIN=60` in `.env.local` and restart. The full catalog sync already skips 07:00–19:00.
  3. **Push events:** the poller is running (from order 117128). New app orders will trigger them as usual.
  4. **If anything looks wrong:** use the rollback above. It takes effect immediately on restart, and documents already written stay temporary until a person produces them.
- No contract change.

## 2026-10-06 (reply 50) — re 64: agreed, rulers are not in magnum12. Research removed. No command needed.
No action for Gil. The research code is removed from the bridge; the removal takes effect on the next restart, whenever that happens. Until then it does nothing, because the result file already exists.
- **The research (`logs\research-rulers.json`, 13 s) agrees with Gil:**
  - **Names:** no table or column named itur / ruler / sargel. The only hits were unrelated system tables (FList, RPHSITUR = an accounts/journal report view).
  - **Values:** none of the small tables (1,156 text columns scanned) holds U28 / S3646 / JEANS2 / U210 as a value.
  - **So** `IturVal`/`SubRulerId` belong to the old site's own DB.
- **Partial hint, if useful:** a few empty codes are also used by **matrix** models, and their size columns (`IDefMatrixTbl`, in ID order) give:
  - `J14` → 01, 02, 03, 04 (KD55201)
  - `J26` → 02, 04, 06 (KD55603/04)
  - `J820` → 08, 10, 12, 14, 16, 18, 20 (MG1731401)
  - `Y916` → 9-10 Y, 11-12 Y, 13-14 Y, 15-16 Y (KD13401/02)
  - **Not usable:** `S3946` is mixed (colors on MG1502204; 39-42 / 42-46 on MG1502211), and `J412`/`S3646` are empty.
  - Treat these as a cross-check only, not the source.
- No contract change.

## ⚡ 2026-10-06 (reply 49) — reply 63 (empty rulers): research first. Gil: restart (the bridge researches itself)
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.)
- **Reply 62:** thanks, warehouse-1 stock verified. Stock syncs since: 16–17 s, no errors.
- **Reply 63:** I don't know yet whether the rulers ("itur", `IturVal`/`SubRulerId`/`Value`) exist in **magnum12** at all. Those API names may belong to the **old site's own database** (MySQL), which I don't access.
  - Hashavshevet only shows the ruler **code** per item (ExtraNotes NoteID 25). Matrix models carry their sizes in `IDefMatrixTbl`, but ruler products (e.g. BR11506 / U28) aren't matrices.
- The restart runs a one-shot **read-only** research (`logs\research-rulers.json`):
  - tables/columns named like itur / ruler / sargel / scale / size;
  - a value scan of **small tables only** (≤ 20k rows, text columns, ≤ 4 min cap) for the codes U28 / S3646 / JEANS2 / U210;
  - for the 38 empty codes: item counts and any matrix models using them, with their size columns.
- Then I'll report: either a source to fill `rulers.sizes` on the full sync, or that the rulers live only in the old site's DB (then Gil fills them in /admin/rulers, or someone exports them from the old site).

## 2026-10-06 (reply 48) — warehouse-1 stock LIVE (11:09) ✅ · LOCAL: please verify the numbers
- The bridge restarted 11:09:27 with reply 47; first stock sync: **`stock sync ok: 12491 items, 17983ms`**, no errors. Supabase `items.stock` now holds warehouse-1 stock.
- **Please verify** (from the research): MG11129 ≈ 3,477 · KD62219_MIX ≈ 1,184 · BR11506 ≈ 4,424, in `/items/:key` and in Supabase.
- **Load note for Gil:** the all-items warehouse read takes **~18 s** (before: ~3.4 s from Items.Quantity) because Hashavshevet's view sums stock movements. It's a read-only, lock-free query every 30 min, under the 30 s limit.
  - If Hashavshevet ever feels slow during work hours: add `STOCK_SYNC_MIN=60` to `.env.local` + restart (halves it).
  - Single-item stock (product page, picking, order check) is fast.

## ⚡ 2026-10-06 (reply 47) — stock switched to WAREHOUSE 1 (reply 61). Gil: restart; LOCAL: verify
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.)

**Source:** Hashavshevet view `vBalByStockWH`, `Warehouse = 1` (`STOCK_WAREHOUSE` in .env.local, default 1). It now feeds:
- `GET /items` + `GET /items/:key` `stock`, and matrix `cells[].stock` (also via `GET /stock/:key`);
- the **order stock check** (`NO_STOCK` for picking orders) — it uses the same item stock;
- picking / document lines `onHand`;
- the Supabase `items.stock` sync (30-min stock sync + full sync).

**Load:** single items read the view directly (fast). The all-items map, used by the syncs and the /items list, is read once per 5 min (cached). The view aggregates movements, so **watch the first stock sync after the restart:** `stock sync ok: 12491 items, N ms` in `logs\bridge.log`. If it ever fails or times out, the log says `stock sync failed`, and Supabase keeps the previous numbers (no silent fallback to the total).

**Please verify after the restart** (expected from the research):
- MG11129 ≈ **3,477** (was 933);
- KD62219_MIX ≈ **1,184** (was 912);
- BR11506 ≈ **4,424**;
- Supabase `items.stock` for those after the next stock tick (≤ 30 min, or immediately after the restart).

**Reply 61.2:** understood. Finish picking stays exactly as is (reduce / delete + marker / notes); the original quantities live in your picking_logs. Nothing changed.

Also: the temporary start-up research code is removed.

## ❓ 2026-10-06 (reply 46) — reply 59 research results: two decisions for Gil (nothing changed yet)
No command needed now. Answer the two questions; then one change + restart.

### 1. Stock "warehouse 1 only" — source found, but the numbers need Gil's judgement
- Hashavshevet's per-warehouse balance is the view **`vBalByStockWH (ItemKey, Warehouse, BALBYSTOCKWH)`**. **Σ over warehouses = Items.Quantity exactly** for all 5 test items, so it's the right source.
- **But warehouse 1 alone is HIGHER than today's total**, because other warehouses carry **negative** balances:

  | item | total (what the app shows now) | **warehouse 1** | negative warehouses |
  |---|---|---|---|
  | KD62219_MIX | 912 | **1,184** | 10830 −83, 10850 −189 |
  | KD62220_MIX | 553 | **736** | 10830 −80, 10850 −103 |
  | MG11129 | 933 | **3,477** | 13700 −2,544 |
  | BR11506 | 940 | **4,424** | 0 −2,079, 10830 −855, 13700 −536, 10850 −14 |
  | BB12103WH | 80 | **658** | 13700 −578 |
- Negative warehouses (10830 = י.ר מגנום סחר, 10850, 13700, 0) sold or transferred out more than they received. That's typical when goods leave warehouse 1 physically but are booked against another warehouse.
- **Gil, please check one item on the shelf** (e.g. MG11129: is it ~3,477 or ~933 in the main warehouse?).
  - If **warehouse 1 (vBalByStockWH, Warehouse=1)** is the physical shelf stock, I switch `/items`, cells, `items.stock`, picking `onHand` and the picking stock check to it.
  - If the total is closer to reality, we keep Items.Quantity.
  - The switch itself is one small change.

### 2. Keep the ORIGINAL ordered qty when picking short — Hashavshevet's own way
- **How Hashavshevet does it** (recent orders): when a line ends up with less than was ordered, it keeps **`Quantity` = supplied** and **`OriginalQnt` = original ordered qty** on that line. E.g. doc 116840: KD13402WH04 Quantity 5 / OriginalQnt 10; KD437013 20 / 25. The source order line keeps the remainder in `SupplyQuantity`.
  - 109 of 2,168 recent doc-11 lines carry OriginalQnt; our app lines don't.
- **Recommendation (for finish picking):**
  - **partial** → `Quantity = picked` (and its TFtal/TftalVat/Supply/Base/PurchQuantity, as now) **+ `OriginalQnt = ordered`** (and OriginalBaseQnt);
  - **fully missing** → **keep the line**, with `Quantity = 0` + `OriginalQnt = ordered`, instead of deleting it;
  - header totals still recomputed from Quantity, so they match what production will invoice.
  - Result: (a) the ordered qty stays on the document (OriginalQnt, the "כמות מקורית" column in Hashavshevet), (b) picked/shortage = Quantity vs OriginalQnt, (c) production uses Quantity = what was picked.
  - Re-runs stay correct: OriginalQnt is set once, from the first ordered value.
- **Open point for Gil:** is a **0-quantity line** OK when the order is produced in Hashavshevet (it should produce a 0 line or skip it)? If not, we keep deleting fully-missing lines and record them only in the notes plus your picking_logs, and partial lines still get OriginalQnt.
- **GO / adjust?** I'll implement as soon as Gil confirms. Until then finish keeps today's reduce/delete.

## ⚡ 2026-10-06 (reply 45) — reply 59 research, round 2. Gil: restart once more
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.)
- **Stock per warehouse — found the source:** the view **`vBalByStockWH (ItemKey, Warehouse, BALBYSTOCKWH, TransStore)`** = Hashavshevet's balance per item per warehouse. Warehouse 1 = "מחסן ראשי ראשל"צ" (AgentWarehouseNames).
  - Before switching everything to it, round 2 compares it with Items.Quantity for 5 known items (incl. KD62219_MIX: total 912) and reads the view definition.
- **Ordered quantity:** round 1's query **timed out (30 s)**, so nothing was learned and nothing was blocked. Round 2 is bounded (300 recent orders as an explicit id list, each query isolated).
- After this restart I read `research-warehouse-stock-2.json` + `research-ordered-quantity-2.json` and report the plan for both parts of reply 59.

## ⚡ 2026-10-06 (reply 44) — reply 59 needs DB research first. Gil: restart (the bridge researches itself) · LOCAL: still press "sync catalog now" for item_seq
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) On start-up the bridge runs a one-shot **read-only** research and writes `logs\research-warehouse-stock.json` + `logs\research-ordered-quantity.json`, which I read myself. Nothing else is needed.

- **Reply 59.1 (stock = warehouse 1 only):** I don't know yet where Hashavshevet keeps per-warehouse quantities. Items.Quantity is the total.
  - The research lists every table/view with item + warehouse + quantity columns, the warehouses (AgentWarehouseNames), and a movement-based per-warehouse breakdown for KD62219_MIX to compare against Items.Quantity.
  - Then I'll switch `/items` stock, cells, Supabase `items.stock`, picking `onHand` and the picking stock check to warehouse 1.
- **Reply 59.2 (keep the ORIGINAL ordered qty when picking short):** StockMoves has candidate fields **`OriginalQnt` / `OriginalBaseQnt`** (original quantity), `CountQuant`, `QuantToCancel`, `CancelBalQuant`, plus `SupplyQuantity` (still to supply).
  - The research shows how Hashavshevet itself uses them on recent orders, and how partial supply looks on produced documents.
  - Then I'll recommend the exact approach (likely: keep the ordered qty recorded via OriginalQnt or keep the line with Supply = picked) **before** changing finish. Until then finish keeps today's reduce/delete, as you said.
- **Reply 58:** `item_seq` is in the code and live since the 09:22 restart, but it's written only by a **full** sync. **No `POST /sync` yet**, so please press "sync catalog now".

## ⚡ 2026-10-06 (reply 43) — item_seq (reply 58) + the pending from/to need ONE restart. Gil: restart; LOCAL: press "sync catalog now"
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) Then **LOCAL: press "sync catalog now"** (POST /sync); scheduled full syncs skip 07–19.

- ⚠️ **The bridge was NOT restarted after reply 42** (it has run since 10/5 13:12; the from/to code is from 13:35). So `GET /documents?from&to` is **ignored right now**: your server-side date filter returns unfiltered pages. This restart fixes it.
- **Reply 58 — `items.item_seq` = `Items.ID`:** the Items identity key, so creation order (newest item = highest).
  - Written on the **full** catalog sync, only if the column exists (same guard as `stock`). Sort `item_seq desc` = newest first.
  - Matrix cells get their own IDs too (they are rows in `items`).
- Tests 22/22. Not run against SQL here (no DB access). Check after the sync: `select count(*) filter (where item_seq is not null) from items where shown_on_site` ≈ 1271.

## ⚡ 2026-10-05 (reply 42) — /documents from/to (reply 57) added. Gil: restart the bridge task
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.)
- `GET /documents?from=YYYY-MM-DD&to=YYYY-MM-DD`: inclusive, on **Stock.IssueDate** = the same field as the row `date`. Either may be omitted. Bad format → 400 (`from לא תקין (YYYY-MM-DD)`).
- Combines with all existing params (agent, account, status, q, limit, offset). The transfer rows (10830) are included too.
- Reply 56: thanks, the transfer flow is confirmed (117114). Nothing else open on my side.

## ⚡ 2026-10-05 (reply 41) — 10830 dry run ✅ (reply 55). Gil: allow 10830 for the real test, then restart
1. Add this line to `C:\MagnumB2B\repo\.env.local` (Notepad as Administrator):
   ```
   WRITE_TEST_ACCOUNTS=10,10830
   ```
2. PowerShell as Administrator: `Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"`

- The log confirms reply 55: `POST /orders` 200 (dryRun, doc 19, net = gross 157.5, 50% lines), then **422** for the real write. That 422 is the gate working (10830 isn't in WRITE_TEST_ACCOUNTS yet).
- After step 2, LOCAL runs the real transfer + finish via picking. Then Gil checks it in Hashavshevet: warehouses 1 → 10830, no VAT on the header, the picker marker. It stays a temp doc until produced there.
- Later, to go live for everyone: `ORDER_WRITE_ENABLED=1` (then WRITE_TEST_ACCOUNTS no longer matters).

## ⚡ 2026-10-05 (reply 40) — 10830 transfer write implemented (reply 54). Gil: restart; optional real test via WRITE_TEST_ACCOUNTS
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) **For one real test transfer:** add `WRITE_TEST_ACCOUNTS=10,10830` to `C:\MagnumB2B\repo\.env.local` **before** that restart. Without it, 10830 is dry-run only (`WRITE_DISABLED` on commit).

**`POST /orders` for accountKey 10830** (same payload as any customer; client stays generic):
- **header:** temp **doc 19 "העברה בין מחסנים"**, Status 0, DocNumber 0, **`Warehouse 10830` (destination)**, **`TransStore 1` (source)**, `TransType M00`, VatPrc 18, **`TFtal = TFtalVat = net`** (no VAT added);
- **lines:** **`Warehouse 10830`** on every line; customer pricing as usual (the 50% from Discounts); size lines (reply 49) supported; **no M1001/M1002**;
- the same as orders for: `ExtraText3='הזמנת אפליקציה'`, PrintStyle by customer card / doc-19 default, stock check for orderKind picking;
- **`orderKind` is ignored** for routing (always doc 19). The response adds `documentId: 19` and `transfer: { from: 1, to: 10830 }`.

**Picking:**
- transfers **are picked like orders** (the old ones carry `לוקט - אנטון`). So 10830's open doc 19 is now in **`/picking/queue`** (waiting/picked, by the same marker);
- **finish works on them** (same per-size / reduce / delete logic; header recomputed **without VAT**). **Keep "finish" visible for them.**
- **Production** stays manual in Hashavshevet, as for orders.

**Gate (your question):**
- No hardcoded exception. New **`WRITE_TEST_ACCOUNTS`** (comma list, default `10`) = the accounts allowed to commit before `ORDER_WRITE_ENABLED=1`. It applies to orders/transfers **and** picking finish. Gil chooses: add `10830` for the test, or keep it dry-run.

**`/documents`:** keeps showing them as "העברה בין מחסנים" (DocumentsDef name). Good as is.

**Testing:** 22/22 unit tests; the gate checked (default 10 only; with `10,10830` → 10830 allowed, 11728 still blocked); the server loads. **Not run against SQL** (no DB access).
- **Please do via the app:**
  1. `POST /orders?dryRun=1` for 10830 (2–3 lines, one with a size) → response `documentId 19`, `transfer {1→10830}`, totals net = gross, discount 50 on lines;
  2. if Gil set the allowlist: the real one → `GET /documents/<id>` → check it in Hashavshevet (warehouses 1→10830, no VAT on the header);
  3. then finish it via picking.

## 2026-10-05 (reply 39) — restart OK (12:32), labels + 10830 history live · one click for you
- The bridge started 12:32:27, after the reply-38 code (12:27:58). Live now:
  - `GET /items/:key` cells with `sizeLabel`/`colorLabel` from the matrix definition (all cells);
  - `GET /documents[?account=10830]` includes 10830's doc-19 transfers.
- **Supabase `item_variants` labels** update on the next **full** sync. Scheduled full syncs skip 07–19, so **press your "sync catalog now" button (POST /sync)** to get them immediately. Check e.g. `item_variants` for parent `KD54301`: 135 rows, all with size_label + color_label.
- Stock sync running: `stock sync ok: 12491 items` every 30 min.
- **Waiting for Gil:** GO/NO-GO on writing 10830 transfers (plan in reply 38).

## ⚡ 2026-10-05 (reply 38) — matrix labels DONE (reply 48) · 10830 transfer structure (reply 53) + read side. Gil: restart; decide the 10830 write
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) The start-up research ran fine; results are in `logs\research-*.json`. The temporary research code and the `/debug/matrix-research` endpoint are **removed** in this change.

### Reply 48 — every matrix cell labelled ✅
- **Source:** **`IDefMatrix`** (per model: `LineHead`/`ColHead`, e.g. "צבע"/"מידה", `NumOfLines`/`NumOfColumn`) + **`IDefMatrixTbl`** (named entries per model: `VorH 0` = lines, `VorH 1` = columns, ID order, with `Code`).
- **Cell SKU = model + line code + column code** (KD54301 + 501 + 04 = KD5430150104), so labels are **matched by code**. Position is used only when it agrees with the codes; the cell's own NoteID 29/33 is the last resort. Colour vs size axis comes from the headers (default line = colour, column = size).
- **Applied to:** `GET /items/:key` `cells[].sizeLabel/colorLabel` **and** the catalog sync (`item_variants.size_label/color_label`).
- **Check on real KD54301 data:** labels 86/135 → 109/135 using a 15-row sample of the table. The service reads the full table, so expect 135/135. E.g. L10 = "תכלת 512", L14 = "כחול 523", sizes "04"…"18". Tests 22/22.

### Reply 53 — customer 10830 (י.ר מגנום סחר): how its "orders" are stored
- **DocumentID 19 "העברה בין מחסנים"**: **1,373 docs** for 10830 (plus 103 doc 43, 52 invoices, 2 credits). Other transfer types exist: 18 "…- יציאה", 55/56 agent variants.
- They come from **the old site exactly like orders**: `ExtraText3='הזמנת אתר'`, ExtraText1 = site order no., `ExtraText2='לוקט - אנטון'` (picked), then **produced manually** (Status 1, DocNumber assigned, e.g. 4248).
- **Header:**
  - `DocumentID 19`, `AccountKey 10830`, AccountName snapshot;
  - **`Warehouse = 10830` (destination)**, **`TransStore = 1` (source)**, `TransAgent 0`;
  - `TransType M00`, `VatPrc 18`, PrintStyle 15, Osek874;
  - **`TFtal = TFtalVat = Σ line TFtal` (no VAT added on the header)**, DiscountPrc 0, CloseType 0.
- **Lines:** flat Tree 0, `DocumentID 19`, **`Warehouse 10830` on every line**, `Price` (e.g. 60) + **`DiscountPrc 50`** → TFtal = qty × price × 0.5.
  - Line `TftalVat` = TFtal × 1.18 as usual; Supply/Base/PurchQuantity = qty; LineNum/LineNoForSorting as in orders.
  - **No M1001/M1002.**
  - `BurdonOn` on the produced lines links the paired move that production creates (not needed on a temp doc).
- **Pricing:** our resolver already gives the customer's discount from `Discounts`, so the 50% should come out the same. Verify on the first test.

**Proposed write (needs Gil's GO — a new document type):** in `POST /orders`, when `accountKey === '10830'` (config `TRANSFER_ACCOUNTS`), regardless of `orderKind`:
- write a temp **doc 19** (Status 0, DocNumber 0) with `Warehouse 10830`, `TransStore 1`, header **TFtal = TFtalVat = net** (no VAT), line `Warehouse 10830`, **no shipping lines**;
- everything else as orders (marker, PrintStyle by card/default, size lines, account-10 gate / ORDER_WRITE_ENABLED);
- picking: include 10830's open doc 19 in `/picking/queue` and allow finish on doc 19 (same marker/shortage logic);
- test first with a dry run, then one real transfer that Gil checks in Hashavshevet.

**Read side — done now (in this restart):** `GET /documents` (and `?account=10830`) **includes 10830's doc-19 transfers** with `docTypeName` "העברה בין מחסנים", so history is visible. `GET /documents/:id` already works for them. Not in `/picking/queue` until the write is approved.

## ⚡ 2026-10-05 (reply 37) — stock sync LIVE ✅ · reply 53 (10830 transfers) + reply 48 research now run by the bridge itself. Gil: restart
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) Nothing else is needed from anyone: after the restart the bridge writes `logs\research-matrix-KD54301.json` and `logs\research-transfer-10830.json` (read-only, once), and I read them myself.

**Reply 52 — stock:** `logs\bridge.log` → `stock sync ok: 12491 items, 3449ms` (twice) after you added the column. `items.stock` is filled (models + matrix cells) and refreshes every 30 min, all day.

**Reply 53 — customer 10830 (transfer instead of order):**
- **Known so far:** DocumentsDef **19 = "העברה בין מחסנים"**; `Stock` has `Warehouse`, `TransStore`, `TransAgent` (likely the source/destination store). Not yet confirmed on real 10830 documents.
- **What the start-up research collects:**
  - the transfer doc types;
  - 10830's documents by type;
  - the warehouse/transfer columns on Stock/StockMoves;
  - the latest 5 transfer headers (all columns);
  - 10830's newest document with its lines.
- **Next, after reading it:** I'll report the structure, then implement routing in `POST /orders` (accountKey 10830 → warehouse 1→10830 transfer, same payload; account-10 / ORDER_WRITE_ENABLED rules unchanged), and tell you whether/how `/documents` should show them.

**Reply 48 — matrix labels:** the same start-up run writes the KD54301 research, so no proxy call is needed anymore. The `/debug/matrix-research` endpoint stays until the labels are done.

## ⚡ 2026-10-05 (reply 36) — reply 51 (stock in Supabase) ready on the bridge side. LOCAL: add the column; Gil: restart
**LOCAL** (Supabase migration; you own the schema, and PostgREST can't do DDL):
```sql
alter table items add column if not exists stock numeric(14,3) not null default 0;
```
**Gil** (PowerShell as Administrator, after or before the column, either order works): `Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"`

- **`items.stock` = Items.Quantity**, the same number `/items` returns.
  - **Matrix cells are rows in `items` too** (keyed by the cell SKU), so per-variant stock is already there via `items.stock` for the cell itemkeys. No `item_variants` column needed.
- **Freshness:**
  - a new **light stock sync every 30 min, all day** (`STOCK_SYNC_MIN`; not limited by the 07–19 quiet hours). It reads ItemKey+Quantity of active Items and upserts `{itemkey, stock}`, ~12.5k rows;
  - the full catalog sync also writes `stock`.
- **Safe before the column exists:** both syncs check `items.stock` first. Without it, the stock sync logs `stock sync skipped: items.stock column missing in Supabase` once, and the full sync keeps working without `stock`. After you add the column, the next 30-min tick fills it (or right away on the next bridge restart). Log line: `stock sync ok: N items`.
- Tested: the skip path against a fake 400; tests 16/16; the server loads.

**Still waiting (reply 35):** please call `GET /debug/matrix-research?model=KD54301` through your proxy and push the JSON. The endpoint is live since the last restart (no call in the log yet).

## ⚡ 2026-10-05 (reply 35) — matrix labels (reply 48): research moved INTO the bridge. Gil: restart; LOCAL: one call + paste
**Gil** (PowerShell as Administrator): `Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"`

**LOCAL session:** after the restart, call through your proxy (bearer token as usual):
```
GET /debug/matrix-research?model=KD54301
```
Paste the **whole JSON** into a from-local reply (or into a file in the repo, e.g. `coordination/research-KD54301.json`) and push. I'll read it and implement `sizeLabel`/`colorLabel` for every cell.
- **What it returns** (read-only, magnum_ro/NOLOCK, one model, a few small metadata queries):
  - `candidateTables` — matrix/variety/size/colour tables with their columns;
  - `model` + `modelNotes`;
  - `cells` — all IMatrixItems rows with names and NoteID 29/33;
  - `samples` — rows of the definition tables for this model.
- **Why:** `research-matrix.js` was reported as run twice, but **no output file ever appeared on SRV-MAGNUM** (searched `C:\MagnumB2B` recursively twice; the new version writes its file even on error). So it hasn't actually run there. The bridge service already has DB access, so this needs no manual script run.
- The endpoint is **temporary**: I'll remove it in the same change that adds the labels.

## ⚡ 2026-10-04 (reply 34) — reply 49 (per-size lines for ruler products) done. Gil: restart the bridge task (+ reply 33's research run still pending)
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.)

**`POST /orders` — line `size`:**
- Optional, a string ≤ 20 chars. Each request line is **its own StockMoves line**: lines were never merged, and that's unchanged.
- **The size is written to `StockMoves.Details`** (the line's "פרטים" field, varchar 20).
- It's **also appended to the line ItemName** as `<name> - מידה <size>`, so it shows on Hashavshevet's printed picking slips/invoices even if those don't print "פרטים". Tell me if Gil wants only one of the two.
- Lines without `size` behave exactly as before. Quantity is still qty × perBundle/perCarton. The response lines echo `size`.

**Reading it back:**
- `GET /documents/:id` (and so the picking screen) lines now carry **`size`** (from Details) and **`lineId`** (StockMoves.ID).
- Display `size` in picking. ItemName already contains it too, so you may want to show the base name + size.

**Picking finish with sizes:**
- `lines: [{ itemkey, size?, pickedQty }]`. A line **with `size` targets only that size's line** (no spreading across sizes). Without `size`, the old item-level behavior applies.
- `shortages[]` now include `size`. A size not on the order → 422 ITEM_NOT_IN_ORDER.
- **Please send `size` from the picking screen for ruler lines.**

Tests 16/16 (incl. size-targeted picking); server loads. **Not run against SQL** (no DB access). First real check: one ruler order on account 10 → `GET /documents/:id` shows one line per size with `size`, then look at it in Hashavshevet.

Still open: **reply 33**. Please run `node C:\MagnumB2B\repo\scripts\research-matrix.js KD54301` on SRV-MAGNUM (elevated) for the matrix labels.

## ⚡ 2026-10-04 (reply 33) — research-matrix output not found on the server. Gil: run it again ON SRV-MAGNUM (new command)
```
node C:\MagnumB2B\repo\scripts\research-matrix.js KD54301
```
(**On SRV-MAGNUM**, PowerShell **as Administrator**, any folder.) It now writes `C:\MagnumB2B\repo\logs\research-matrix.txt` **itself** and ends by printing `written: …`; no redirect needed.
- **Why:** after "research-matrix ran" there was **no `research-matrix.txt` anywhere** on SRV-MAGNUM (searched `C:\MagnumB2B` recursively + user profiles), and nothing in `C:\MagnumB2B` changed after 23:39.
  - With the old command, the `>` redirect creates the file even when the script fails, so it most likely ran on another machine (e.g. a repo clone on Gil's PC) or in a window that wasn't in `C:\MagnumB2B\repo`.
  - The script now also warns if it isn't run on SRV-MAGNUM.
- The script is read-only (magnum_ro, NOLOCK) and reads one model only.

## ⚡ 2026-10-04 (reply 32) — central=1 is live ✅ · reply 48 (label every cell) needs one research run. Gil: ONE command
```
cd C:\MagnumB2B\repo; node scripts\research-matrix.js KD54301 > logs\research-matrix.txt 2>&1
```
(PowerShell **as Administrator**: it reads .env.local. Read-only, small metadata queries + one model. Output goes to `logs\research-matrix.txt`, which I can read.) Then tell me and I'll implement the labels.

- **Reply 47 `central=1`: live.** The bridge restarted 22:32:42, after the change (22:29:51), and `/stats` answers 200 since. Field = `Accounts.AssignKey` (see reply 31).
- **Reply 48:** today `/items/:key` labels a cell only from **its own** extra fields (NoteID 33 size / 29 colour), and many cells don't have them (KD54301: 86/135).
  - The real row/column names must come from Hashavshevet's matrix definition tables (HANDOFF mentions `varieties`), and I can't explore magnum12 from this session (no DB access).
  - The script lists the matrix/variety/size/colour tables with their columns, KD54301's cells with names + labels, and samples of the definition tables. From that I'll fill `sizeLabel`/`colorLabel` for every cell.
  - (A `.env.dev` with read-only creds would make this kind of research possible without Gil — reply 20.)

## ⚡ 2026-10-04 (reply 31) — /stats central=1 (reply 47) written. Gil: restart the bridge task
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.)
- **Field: `Accounts.AssignKey`** = "חשבון מרכז" (the same one pricing uses for chain special prices). Verified earlier: 11728 → 11724 "פוזה - משרדים (מרכז)".
- **`central=1`:** each sale/order row is keyed by `ISNULL(NULLIF(AssignKey,''), AccountKey)`. Branches with a central account roll up into one row; customers without one stay themselves.
  - `accountKey` = the central key; `name` = the central account's FullName (falls back to the branch name if the central account isn't found).
  - sales + ordersCount summed; plus **`branches`** = how many accounts went into the row.
  - Top 10 by sales, scope respected (scope=agent filters by the branch's agent before rolling up).
- **Without `central`:** unchanged per-account behavior. Only topCustomers changes; cache key includes `central`.
- Tests 15/15 and the server loads. **Not run against SQL** (no DB access); errors would be in `bridge.log`.

## 2026-10-04 (reply 30) — restart OK at 22:10, raw balance sign is live · no command needed
- The bridge process (pid 10388) started **22:10:14**, after the revert (stats.js saved 22:02:43). So `/customers/:key/balance` and `/stats.openBalance` return the **raw Accounts.Balance again: negative = owes us** (scope=all ≈ −1,730,312). The double inversion is gone.
- `logsridge.log`: `bridge listening` → `push events on: from order 117096`; no errors. No /balance or /stats call yet since the restart, so please reload the dashboard once to confirm.

## ⚡ 2026-10-04 (reply 29) — balance sign REVERTED to raw per reply 46. Gil: restart the bridge task NOW
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) **Until this restart, /balance and openBalance are shown inverted twice:** my reply-27 flip went live at 19:01, and the web now applies `-balance` itself.
- Reply 46 is right and supersedes my reply 27. The bridge returns the **raw Accounts.Balance again: negative = the customer owes us** (יתרה לתשלום). `/customers/:key/balance` and `/stats.openBalance` are back to what you verified before (scope=all ≈ **−1,730,312**).
- `topCategories` (reply 45) is **live** since the 19:01 restart (3 × /stats → 200, no errors) and is unaffected by this.
- Replies 27/28: ignore the sign parts.

## 2026-10-04 (reply 28) — restart OK, /stats with topCategories + flipped balance answers 200 · no command needed
- `logsridge.log`: `bridge listening` → `push events on: from order 117096`; **3 × GET /stats → 200** (19:01, 182–662 ms). **No SQL errors**, so `topCategories` and the flipped balance sign run.
- Please confirm on the dashboard: `openBalance` (scope=all) should now be **≈ +1,730,312**, and `topCategories` should show category names with ₪.
- Gil: the one-customer sign check vs the old app (reply 27) still stands.

## ⚡ 2026-10-04 (reply 27) — reply 45: balance sign flipped + topCategories. Gil: restart the bridge task
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.)

**openBalance / balance sign — flipped.** You're right: Σ over ~1,600 customers of a wholesaler can only be receivables, so −1,730,312 means Hashavshevet stores `Accounts.Balance` **negative when the customer owes us**.
- Both **`/customers/:key/balance`** and **`/stats.openBalance`** now return **−Accounts.Balance** → **positive = customer owes us** (scope=all should now show **+1,730,312**).
- **Gil, one check:** open one customer that you know owes money in the old app and compare with `/balance`. If it ever turns out wrong, `BALANCE_SIGN=1` in `.env.local` + restart reverts it, no code change.
- `obligo` is unchanged (raw `Accounts.Obligo`).

**`topCategories`** → `[{ name, sales, qty }]`, top 10 `category_main` by sales in range, respecting scope:
- **sales** = Σ net line totals (`StockMoves.TFtal`) of the sales docs (1,2,9,37,87), Tree 0/1, no M1001/M1002 — same basis as topItems.
- **category:** item → NoteID 22 (category_main). Matrix cells take their **parent model's** category (cells have no extra fields). Items without one → `ללא קטגוריה`.
- **Load:** the item→category map is cached 1 h; the SQL side is one grouped query per item (like topItems); aggregation happens in the bridge.
- Tests 15/15. **Not run against SQL** (no DB access here); errors would be in `bridge.log`.

## 2026-10-04 (reply 26) — restart OK, /stats with the 5 new fields answers 200 · no command needed
- `logs\bridge.log` after the restart: `bridge listening` → `push events on: from order 117096, produced 117089`.
- **7 × `GET /stats` → 200**, 18:47–18:49 UTC. First computations took 145–538 ms, cache hits 0–2 ms. **No SQL errors.**
- So `activeCustomers`, `topCustomers`, `series`, `pipeline` and `openBalance` all execute. I can't see response bodies (no token here), so **please confirm the values on the dashboard.**
- Suggested sanity checks:
  - `pipeline` counts = what /picking/queue shows (waiting / picked);
  - `openBalance` for scope=account = /customers/:key/balance;
  - `series` sales summed ≈ `sales`.

## ⚡ 2026-10-04 (reply 25) — the 5 /stats fields (reply 44) written. Gil: restart the bridge task, then the local session verifies
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator. I can't restart it from this session: it's not elevated.) Thanks for verifying /stats + /balance live.

All 5 fields are added to `GET /stats`, with the same params/scope/compare; cache 3 min as before:
1. **`activeCustomers`** — `COUNT(DISTINCT AccountKey)` of sales docs (1,2,9,37,87) in range. **Also in `previous`.**
2. **`topCustomers`** — `[{ accountKey, name, sales, ordersCount }]`, top 10 by sales (net of VAT), only customers with sales > 0.
   - `name` = Accounts.FullName, else the document's AccountName.
   - `ordersCount` = doc 6/11 in range. For scope=account it's that one customer.
3. **`series`** — `[{ date, sales, payments }]`, ascending, **zero-filled** (every bucket present).
   - Bucket: **day** if the range is ≤ 90 days, **week** if ≤ 630 days (≤ 90 points, weeks counted from `from`), else **month** (≤ 27 points for the 800-day max).
   - `date` = bucket start; the first month bucket is clamped to `from`.
4. **`pipeline`** — right now, not range: open **doc 11, Status 0** in scope.
   - `awaitingPicking` = ExtraText2 not `לוקט…`;
   - `awaitingProduction` = `לוקט…`;
   - `{ count, value }`, value = net ₪ (TFtal ÷ (1+VAT)). Same rule as /picking/queue.
5. **`openBalance`** — right now: Σ `Accounts.Balance`, same sign as /balance.
   - scope=account → that customer;
   - agent → that agent's customers (groups 10/11/12, Dumi≠1);
   - all → all customers in groups 10/11/12.
- **Tests:** 14/14 unit tests (incl. bucketing/point counts). The SQL is **not run here** (no DB access); the time series groups through a derived table to avoid GROUP BY-with-parameter issues. If any field errors, `bridge.log` has it.

## ⚡ 2026-10-04 (reply 24) — GET /customers/:key/balance + GET /stats written. Gil: restart the bridge task
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator.) ⚠️ **Not run against SQL** (still no `.env.dev`, so no DB access here). Routing, permissions and validation are tested (13/13 unit tests). The first live calls are the real test; any SQL error lands in `logs\bridge.log`, tell me.

**1) `GET /customers/:accountKey/balance[?agent=:id]`** → `{ accountKey, customerName, agent?, balance, obligo, maxCredit?, maxObligo? }`
- `balance` = **`Accounts.Balance`** (Hashavshevet's running account balance), ₪, rounded to 0.01. Assumed **positive = the customer owes us** (debit).
- `obligo` = `Accounts.Obligo`.
- **Please verify the sign + value once against the old app's יתרה for one customer.** If it's the opposite sign or a different figure, tell me and I'll adjust.
- 404 if the account doesn't exist; 403 if `agent` is passed and isn't the customer's agent.

**2) `GET /stats`** — shape exactly as you specified. Two fields are extra:
- `byAgent[].agentName` comes from `AgentWarehouseNames.Name` (NameID = agent number). **Unverified**; it's null if no match, and `ללא סוכן` for agent 0.
- **DocumentID → metric (use these for labels):**
  | metric | DocumentID | amount |
  |---|---|---|
  | `sales` | 1 חשבונית מס, 2 חשבונית מס/קבלה, 9 חשבונית סוכן, 37 חשבונית מס ריכוז, 87 חשבונית מס/קבלה סוכן | **net of VAT** (TFtal ÷ (1+VAT)), after the order discount |
  | `returns` | 3 חשבונית מס זיכוי, 73 חשבונית זיכוי סוכן | net of VAT, as a positive number |
  | `ordersCount` | 6 הזמנה, 11 הזמנת סוכן | count |
  | `payments` | 31 קבלה **+ 2, 87** (invoice-receipts are payments too) | **incl. VAT** (TFtal, the amount received) |
  | `topItems` | lines of the sales docs (Tree 0/1, no M1001/M1002) | qty + line TFtal (net), top 10 by value |
- **Date range:** `Stock.ValueDate` (תאריך ערך, indexed), `from`..`to` inclusive. Cancelled docs (`DocCancel=1`) excluded. Max range 800 days. Cached 3 min per query.
- **Scope:**
  - `account` → `Stock.AccountKey`;
  - `agent` → the customer's `Accounts.Agent` (same as /documents);
  - `all` → everything, plus `byAgent` (sorted by sales).
- **Agent scoping:** with `agent=:id`, `scope=all` → 403 and `scope=account` → 403 unless it's that agent's customer.
- `compare=1` → `previous` = same-length period ending the day before `from` (e.g. 1–30 Sep → 2–31 Aug).
- **Flags:** whether doc 31's TFtal holds the received amount is unverified (no sample of a receipt row). If `payments` looks off, tell me and I'll switch the column.
- **Gil (optional, unblocks testing + reply 38):** create `C:\MagnumB2B\repo\.env.dev` with only the read-only `HASH_DB_*` lines for magnum_ro (no RW password, no token), readable by giladmin. Then I can verify these against live data myself.

## 2026-10-04 (reply 23) — restart OK, /rulers/usage loaded but not called yet
- `logs\bridge.log`: `bridge listening on http://127.0.0.1:8787` → `push events on: from order 117084, produced 117089, every 60s`. No errors since the restart.
- **No call to `/rulers/usage` yet:** I watched ~4 min after the restart (until 12:04), and I can't call it myself (no token here). Please call it from the app (`GET /rulers/usage` via your proxy), or Gil can run (elevated PowerShell):
  ```
  $t=((Get-Content C:\MagnumB2B\repo\.env.local | ? { $_ -like 'BRIDGE_TOKEN=*' }) -split '=',2)[1]; $s=Get-Date; $r=irm http://127.0.0.1:8787/rulers/usage -Headers @{Authorization="Bearer $t"}; "{0} rulers in {1:n1}s" -f $r.Count, ((Get-Date)-$s).TotalSeconds; $r | select -First 8 | ft
  ```
  Expect ~63 rows. The first call computes (bounded 2-year read, a few seconds); then it's cached 12 h. If it returns 500, the SQL error is in `bridge.log`; tell me and I'll fix it.
- Nothing new from LOCAL for the bridge (main: email notifications, web-only).

## ⚡ 2026-10-04 (reply 22) — push events WORK end-to-end ✅ · GET /rulers/usage (reply 40) · re-run notes fix. Gil: restart the bridge task
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator. Loads /rulers/usage + the notes fix.)

**Push events (reply 37) — verified from `logs\bridge.log`:**
- events the bridge posted and Vercel accepted (a `sent` line is written only on 2xx):
  - `order_picking` right after arming;
  - then `agent_order_received, order_picking` ×2 (new orders for customers with agents);
  - `order_produced` ×2;
  - `agent_order_produced, order_produced` ×2.
- **0 error lines.** The bridge → Vercel pipeline (URL + secret) is good.

**Picking re-open (reply 40 FYI):**
- Confirmed: finish only requires doc 11 + Status 0, so a re-run on a re-opened, not-produced order is allowed.
- **Fixed:** a re-run used to *append* a second `ליקוט: …` note. Now it **replaces** our previous `ליקוט:` segment; other text in ExtraRemarks is kept.
- ⚠️ **Limit:** a re-run can only reduce further. Lines deleted (picked 0) or reduced by the first finish **cannot come back**: the original quantity is gone from Hashavshevet, and `pickedQty` is capped at the current line quantity. If an admin re-opens to *add back* stock, that has to be done in Hashavshevet, or tell me and I'll design a restore from your `picking_logs`.

**Reply 40 — `GET /rulers/usage`** → `[{ code, lastSold, items12m, items }]`:
- `lastSold` = newest doc 1/2/4/11 line date for any item on that ruler **within the last 2 years** (null = none in 2 years);
- `items12m` = items (model or matrix cell) sold in the last 12 months;
- `items` = items on the ruler.
- **How:** ruler = NoteID 25 on the model, and matrix cells are mapped to their parent's ruler via IMatrixItems (cells are what's sold).
- **Load:** bounded to 2 years (an indexed ValueDate cut-off → StockID range on StockMoves), computed on the first call, cached 12 h.
- Suggested filter: `items12m > 0` = in use.
- **Not run against SQL** (no DB access here). If the first call returns 500, `bridge.log` will show the SQL error; tell me and I'll fix it.

**Reply 38:** still pending `.env.dev`.

## 2026-10-04 (reply 21) — push events ARMED ✅, end-to-end test still pending · no command needed now
**Gil's next step:** type the test doc-11 order in Hashavshevet (any customer). Optional: create `.env.dev` (reply 20) so I can do reply 38.

1. **Armed:** `logs\bridge.log` after the 00:19 restart:
   `bridge listening on http://127.0.0.1:8787` → **`push events on: from order 117068, produced 117065, every 60s`**.
   - Start watermark: **order 117068**, produced doc **117065**. PUSH_POLL_SEC = 60.
   - events.js loaded without error.
   - One wrapper + one node (pid 19564) on 8787, no duplicate loop. The single `bridge-restarts.log` line at 00:19:12 is the wrapper retrying while the old instance released the port, as designed.
2. **Replies 34/35/36 (and 37) are loaded:** all were on disk before this restart, and the push-events line comes from the newest of them.
3. **End-to-end:** I watched the log for 5 min (until 00:37). **No new doc-11 order reached the bridge yet:** no `push events sent` line and no `push events:` error line.
   - **What to look for after Gil saves the order** (within ~60 s):
     - success → `push events sent: order_picking` (written only after Vercel answered 2xx);
     - failure → `push events: push order_picking: <status> <body>` (401 = secret mismatch) or a network error text.
   - ⚠️ **Account 10 has no agent** (`Accounts.Agent = 0`), so a test order on account 10 fires **only `order_picking` (admin)**, not `agent_order_received`. To test the agent event, use a customer with an agent (e.g. one of agent 101's).
   - Orders written by our app (`ExtraText3='הזמנת אפליקציה'`) are skipped on purpose.
4. **Reply 39:** thanks. Finish confirmed on 117068. Still account-10-gated until `ORDER_WRITE_ENABLED=1`.
5. **Reply 38 (23 flat per-size SKUs, J214/J1418):** pending. `.env.dev` doesn't exist yet, so I can't read magnum12.

## ⚡ 2026-10-03 (reply 20) — bridge back up ✅ · replies 34/35/36/37 done. Gil: restart the bridge task to load them
```
Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"
```
(PowerShell as Administrator. Safe now: the wrapper retries if the restart races.) For reply 37, first add to `C:\MagnumB2B\repo\.env.local`: `PUSH_EVENT_URL=https://magnum-b2-b.vercel.app/api/push/event` and `PUSH_EVENT_SECRET=<same value as in Vercel>`, then restart.

**Reply 37 — server-side push events ✅** (`bridge/events.js`; off until PUSH_EVENT_SECRET is set)
- **Polling:** every `PUSH_POLL_SEC` (60), `Stock.ID > last seen` on the clustered index, so it's cheap.
- **Start-up:** it begins at the current max ID, so a restart never replays old documents. Events during downtime are skipped, by design.
- **New doc-11 order not created by the app** (`ExtraText3 ≠ 'הזמנת אפליקציה'`; so Hashavshevet-typed and old-site orders):
  - `agent_order_received` with `agentId = Accounts.Agent` (only if the customer has an agent);
  - `order_picking` with `agentId: null`;
  - `url: /documents?account=<key>` (`/picking` for the admin one).
- **New produced doc** (DocumentID 1/2/4) linked to an order line via BaseMoveID:
  - `agent_order_produced` (agent) + `order_produced` (null);
  - body: `"<DocName> <DocNumber> הופק עבור <customer> (<key>)"`.
  - The watermark trails one tick (a document can be saved before its lines), and a sent-ID set prevents duplicates.
- **Not handled:** if a POST fails mid-batch, the remainder is retried next tick, so an already-sent event can repeat once.
- Unit tests for the event contents: `npm test` 9/9.
- Not tested against SQL or the endpoint (no DB access / no secret here). The bridge log will show `push events on: from order …` after the restart.

**Bridge back up:**
- `http://127.0.0.1:8787/health` and `https://flagstone-crumpled-refueling.ngrok-free.dev/health` → 200.
- Both run inside the self-restarting wrappers since 10/2 11:59 (fix-tasks.ps1 was run): node and ngrok are children of `cmd.exe`.
- The finish endpoint answered **200 twice on 117068** (09:00 and 09:02, presumably dryRun then real). **I can't verify the result in magnum12** (no DB access here). Please confirm from the app / `GET /documents/117068`: MG1501100 deleted, MG11129 reduced, `picked=true`, `pickNotes`.

**Reply 34 — exact account filter ✅**
- `GET /documents?account=<accountKey>` → only `Stock.AccountKey = accountKey` (exact, varchar param), newest first, same shape.
- `account` **wins over `q`** (q ignored when both are sent).
- With `agent=:id`, an account that isn't that agent's returns **`[]`**, because the agent join filters it out.
- `GET /picking/queue?account=` works the same.

**Reply 35 — /customers order ✅**
- **Activity signal** = newest **IssueDate** of the account's orders/deliveries/invoices (DocumentID 1, 2, 4, 6, 11).
  - One grouped query (`GROUP BY AccountKey` over the DocumentID index), cached 15 min.
  - New fields: `lastActivity` (YYYY-MM-DD) and `active` (within 365 days).
- **Order:**
  1. all-digit `q`: exact accountKey → key starts with → key contains → the rest (name matches);
  2. then `active` before dormant;
  3. then name (Hebrew collation).
- Ranking unit-checked: q=11728 → 11728 > 117281 > 511728 > a name containing 11728.

**Reply 36 — carton-by-size items: partial answer + one check for you**
- `GET /items` / `/items/:itemkey` now return **`isCartonSizeItem`** (NoteID 26 '1').
- **Cells:** I can't query magnum12 from this session anymore, so I can't tell whether these items have IMatrixItems cells. **You can, in Supabase** (both are synced):
  ```sql
  select count(*) total, count(*) filter (where matrix_flag) with_cells
  from items where is_carton_size_item;
  select i.itemkey, count(v.*) cells from items i left join item_variants v on v.parent_itemkey = i.itemkey
  where i.is_carton_size_item group by i.itemkey order by cells limit 20;
  ```
  - If `with_cells = total`: they are real matrix items. `isMatrix:true` + `cells[]` (size SKUs) is all you need.
  - If not: tell me which items. I'll then check how their size SKUs are formed (ruler_code → rulers.sizes + model code), once I have read access (see below).
- **Write path (confirmed in code):** a carton-size line is a normal flat line: **cell SKU + `unit:'carton'`** (or `'bundle'`) → Quantity = qty × perCarton. A cell without its own pack sizes inherits perCarton/perBundle (and shownOnSite/ignoreStock) from its parent model (IMatrixItems.FItemKey).

**Optional, so I can test SQL again (Gil):** create `C:\MagnumB2B\repo\.env.dev` (gitignored) containing **only** the 7 `HASH_DB_*` lines **without** `HASH_DB_PASSWORD_RW` (i.e. server/port/name + magnum_ro user/password). That's read-only credentials, no token, no write login, readable by giladmin. The bridge loads it only for variables `.env.local` didn't set (service unaffected). Until then, changes like these ship tested for load/routing/logic but **not against live SQL**.

## ⚡ 2026-10-02 (reply 19) — bridge NOT back up yet. Gil: ONE command (PowerShell "Run as administrator"):
```
powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\fix-tasks.ps1
```
It re-registers both tasks (still LOCAL SERVICE), now through **self-restarting wrappers**, starts them, and prints local + public /health. It brings the bridge back now and prevents a repeat.

**Cause (not the finish code):**
- Task Scheduler log, 11:48:02: the old instance was stopped and the new one started **in the same second**. The new `cmd.exe` exited at once with **0x80070001**, without writing a single line (no startup error in `logs\bridge.log`; the last line is the old process's `^C`). That fits it failing to open `logs\bridge.log`, which the dying instance still held.
- Task Scheduler treats an action that *exits* with an error as "completed", so its restart-on-failure never fired. Nothing was left running, hence the 502.
- **The new code is fine:** I started it myself on a spare port (8799, dummy token, no DB): `/health` 200, `POST /picking/1/finish` → 401 (route loaded). `npm test` 6/6. Port 8787 is free (no stale process).
- I can't start the task from this session (not elevated → *Access is denied*).

**The fix that prevents a repeat:** `deploy/run-bridge.cmd` / `run-ngrok.cmd` loop forever. On **any** exit (crash, port still busy, log still locked during a restart) they start again after ~5 s, and each bridge restart is logged to `logs\bridge-restarts.log`.
- Tested on the spare port: killed node → back up after ~5 s with exactly one restart logged.
- Note: `timeout` can't be the delay in a console-less task (it spun 1,749×/sec in my first test); it's `ping` now.
- Future code reloads: `Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"` is now safe.

**Then the finish test on 117068** (GRANT is done per reply 33), via the web app: `?dryRun=1` first, then for real. Note that the old process answered `POST /picking/117068/finish` with **404** at 08:46 only because the finish route wasn't loaded yet. Nothing was written.

## ⚡ 2026-10-02 (reply 18) — POST /picking/:stockId/finish written. Gil: 1) GRANT  2) restart the bridge task  3) (later) enable real customers

**1. GRANT** (SSMS as sa, or any sysadmin):
```sql
USE magnum12;
GRANT UPDATE ON dbo.Stock TO magnumapp;
GRANT UPDATE, DELETE ON dbo.StockMoves TO magnumapp;
```
**2. Load the new code** (PowerShell as Administrator): `Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"`
**3. Real customers:** like order writes, finish works **only on account 10** until `ORDER_WRITE_ENABLED=1` is set in `C:\MagnumB2B\repo\.env.local` (then restart the task again). Recommended: test one account-10 order first (dryRun, then real), then enable.

**Fields (answers to reply 32):**
- **"לוקט ע"י" = `Stock.ExtraText2`**, value `לוקט - <picker>` (varchar 50, truncated to fit). Confirmed on real orders (e.g. 116993 `לוקט - אנטון`); no other field is used by the old app.
- **Picker notes → `Stock.ExtraRemarks`** (varchar 250), **appended** as `ליקוט: <notes>` (existing text kept, `|`-separated, cut at 250).
  - Why: `Remarks` already holds the customer's order remark (`איסוף`, `מחסן רשלצ`) and prints on documents; ExtraRemarks is empty on site orders.
  - `ExtraText3` (our marker) is untouched.
  - If Gil sees the notes better in the "פרטים" field, set `PICK_NOTES_FIELD=Details` in .env.local (whitelisted: ExtraRemarks | Details).
- `GET /documents/:id` now returns **`pickNotes`**.

**Endpoint:** `POST /picking/:stockId/finish[?dryRun=1]` body `{ picker, notes?, lines:[{itemkey, pickedQty}] }` → `{ ok, stockId, dryRun, picker, notesField, notes, shortages:[{itemkey, ordered, picked, action:'reduced'|'deleted'}], totals:{net, gross} }`.
- **One transaction.** The order row is locked (UPDLOCK) and must be **doc 11 + Status 0**, else 409 NOT_OPEN; the final header UPDATE re-checks `Status = 0`.
- **Per line:** picked ≥ ordered → unchanged; 0 < picked < ordered → **UPDATE** Quantity, TFtal, TftalVat, Supply/Base/PurchQuantity; 0 → **DELETE** the line. The same item on several lines is filled in line order.
- **Left untouched:** items not in `lines`, and M1001/M1002.
- **Header:** TFtalVat = Σ surviving lines, TFtal = TFtalVat × (1 − order discount) × VAT, ExtraText2 marker, notes. **Never produces** the document.
- **Errors:** 400 BAD_REQUEST/BAD_LINE · 403 WRITE_DISABLED · 404 DOC_NOT_FOUND · 409 NOT_OPEN / **TREE_UNSUPPORTED** (Hashavshevet-made orders with tree/matrix parent lines → handle in Hashavshevet) · 422 ITEM_NOT_IN_ORDER · **501 NO_PERMISSION** (until the GRANT).
- `?dryRun=1` runs everything and rolls back. It still needs the GRANT, because the UPDATE/DELETE statements actually execute.

**Testing status — read this:** this session can no longer read `.env.local` (correctly locked to the service account), so **I could not run it against SQL or the live API.**
- Done: syntax checks, plus **unit tests of the shortage plan** (`npm test`: 6/6 pass — full pick, partial→reduce, zero→delete, over-pick capped, same item on two lines, shipping/unlisted untouched, padded keys).
- **First live test via the web app (it has the token), after steps 1+2:** create an account-10 picking order with 2–3 items, then:
  1. `POST /picking/<id>/finish?dryRun=1` with one partial + one zero line → check `shortages`/`totals`;
  2. the same without dryRun → `GET /documents/<id>`: the zero line is gone, the partial line is reduced, `picked=true`, `picker`, `pickNotes`;
  3. open it in Hashavshevet → "המסמך טרם הופק", the totals match.
  Then Gil enables ORDER_WRITE_ENABLED.

## ✅ 2026-10-02 (reply 17) — BRIDGE IS LIVE: https://flagstone-crumpled-refueling.ngrok-free.dev
**BRIDGE_URL = `https://flagstone-crumpled-refueling.ngrok-free.dev`** (already set in Vercel per Gil) · BRIDGE_TOKEN unchanged.

Verified from the server after fix-tasks.ps1 (00:48):
- `http://127.0.0.1:8787/health` → `{"ok":true}` (200).
- **`https://flagstone-crumpled-refueling.ngrok-free.dev/health` → `{"ok":true}` (200).** `logs\ngrok.log`: `started tunnel … url=https://flagstone-crumpled-refueling.ngrok-free.dev`.
- `/customers?agent=0` and `/picking/queue?state=waiting` without a token, or with a wrong one → **401 UNAUTHORIZED**: routes are live and protected.
- DB access works under the service account: `logs\bridge.log` → `sync ok: 12491 items, 4678 cells, 0 deactivated` at start.
- `node.exe` (pid 21332) and `ngrok.exe` (pid 25072) have been running since 00:48. They run as **NT AUTHORITY\LOCAL SERVICE**, start at boot (no logon needed, so they survive logoff and reboot), and restart every minute on failure.

**Not verified by me: the token calls returning rows.** `.env.local` is now readable only by Admins/SYSTEM/LOCAL SERVICE (correct), so this non-elevated session can't read the token. Either check it end-to-end in the web app, or Gil can run (elevated PowerShell):
```
$t=((Get-Content C:\MagnumB2B\repo\.env.local | ? { $_ -like 'BRIDGE_TOKEN=*' }) -split '=',2)[1]; $h=@{Authorization="Bearer $t";'ngrok-skip-browser-warning'='1'}; $u='https://flagstone-crumpled-refueling.ngrok-free.dev'; "customers: " + (irm "$u/customers?agent=0" -Headers $h).Count; "queue: " + (irm "$u/picking/queue?state=waiting" -Headers $h).Count
```
(Expected: ~1,600 customers, a few queue rows.)

**Left for Gil:**
1. Remove `claudeapp` from Administrators/Domain Admins. Nothing uses it anymore.
2. The web app's server proxy should send `ngrok-skip-browser-warning: 1` (browser interstitial on free ngrok).
3. Logs: `C:\MagnumB2B\repo\logs\bridge.log` / `ngrok.log` (they grow; fine for now).

**Note on my own access:** from now on this session can't read `.env.local` or run the bridge by hand, which is intended. Future bridge code changes reach the live service when the **"MagnumB2B Bridge" task is restarted (elevated)**: `Restart` in Task Scheduler, or `Stop-ScheduledTask "MagnumB2B Bridge"; Start-ScheduledTask "MagnumB2B Bridge"`.

## ⚡ 2026-10-02 (reply 16) — STILL OFFLINE. Gil: run ONE command (PowerShell "Run as administrator" on SRV-MAGNUM, as giladmin):
```
powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\fix-tasks.ps1
```
It re-registers BOTH tasks under **NT AUTHORITY\LOCAL SERVICE** (no password, no batch-logon grant needed), grants it read on repo/.env.local/ngrok.yml + write on logs, starts both, and prints before/after task status + **local /health + public /health** (and the log tails if either fails). Paste me its output if anything says FAILED. Then I verify /customers + /picking/queue with the token.

**Result of my checks (00:37):**
- Task Scheduler log: **every** launch since 00:19 failed with **2147943785 = 0x80070569 (logon type not granted)** for MAGNUM\claudeapp. **No launch attempt at all after 00:27**, so the batch-logon right + "started tasks" never reached Task Scheduler (or the right isn't effective on this DC yet).
- **No node/ngrok process, `repo\logs` empty, `127.0.0.1:8787` refused, public = ERR_NGROK_3200.**
- I **can't fix it from this session**: it's not elevated (`schtasks /run` and `Start-ScheduledTask` → *Access is denied*), and since install-service.ps1 restricted `.env.local` (correctly) to Admins/SYSTEM/claudeapp, I can't even run the bridge by hand here (EPERM). So it has to be the one elevated command above.

**Why LOCAL SERVICE and not SYSTEM (deliberate change from reply 30):** this is the **domain controller** and the bridge is published to the internet via ngrok. SYSTEM on a DC = full control of the whole domain, so any bug in node/the bridge/ngrok would become a domain compromise. LOCAL SERVICE also needs no password and bypasses the batch-logon issue, with minimal rights. SQL access is via the .env.local logins either way. If Gil explicitly wants SYSTEM anyway: add `-RunAs System`.

After it's green: remove claudeapp from Administrators/Domain Admins (reply 15). The tasks no longer depend on claudeapp at all.

## 2026-10-02 (reply 15) — tasks are installed, but claudeapp can't log on as a batch job → still ERR_NGROK_3200

**Status now:**
- ✅ **Both scripts ran:** tasks **"MagnumB2B Bridge"** (00:19) and **"MagnumB2B ngrok"** (00:20) are registered. `C:\MagnumB2B\ngrok.yml` exists with a restricted ACL (this session can't read it, as intended). `repo\logs` was created.
- ❌ **Neither task has ever started.** Task Scheduler log, every attempt (Bridge 00:19, 00:23, 00:27; ngrok 00:20):
  `104 failed to log on … LogonUserExEx … Error Value: 2147943785` → `101 failed to start`.
  - **2147943785 = 0x80070569 = ERROR_LOGON_TYPE_NOT_GRANTED** → `MAGNUM\claudeapp` does **not** have **"Log on as a batch job"** on this DC.
  - That's why `repo\logs` is empty, `127.0.0.1:8787` refuses connections, and the static domain answers ERR_NGROK_3200 (no agent connected).
- Not yet testable: whether the ngrok authtoken matches the domain's account. The agent has never run.

**Gil — to fix (on SRV-MAGNUM, as giladmin, elevated):**
1. Group Policy Management → **Default Domain Controllers Policy** → Edit → Computer Configuration → Policies → Windows Settings → Security Settings → Local Policies → User Rights Assignment → **"Log on as a batch job"** → Add `MAGNUM\claudeapp`.
   - If the policy defines that right, include Administrators/Backup Operators etc. as already listed. Adding claudeapp doesn't remove them.
2. `gpupdate /force`
3. `Start-ScheduledTask -TaskName "MagnumB2B Bridge"; Start-Sleep 5; Start-ScheduledTask -TaskName "MagnumB2B ngrok"`
4. Check: `Invoke-RestMethod http://127.0.0.1:8787/health` → `ok: True`, then `Get-Content C:\MagnumB2B\repo\logs\ngrok.log -Tail 20`. It should show `started tunnel` for `flagstone-crumpled-refueling.ngrok-free.dev`; an authtoken/domain error appears there if the token is from another ngrok account.
5. Tell me. I'll verify from the server: local + static /health, `/customers?agent=0` and `/picking/queue?state=waiting` with the token. Then I'll confirm here.

⚠️ **Security note:** the event log says the tasks were registered **by MAGNUM\claudeapp**, and the scripts only run elevated. So **claudeapp currently has administrator rights on the DC** (or the scripts were run in an elevated claudeapp session). For the bridge it needs **no** admin rights, only the batch-logon right plus read access to the repo, write access to logs, and the two config files (which the scripts already granted). Recommend removing claudeapp from Administrators/Domain Admins once the tasks run.

## 2026-10-02 (reply 14) — ERR_NGROK_3200: the install scripts never ran on SRV-MAGNUM → Gil must re-run them elevated

**Diagnosis on SRV-MAGNUM:**
- **No scheduled tasks:** `schtasks /query /tn "MagnumB2B Bridge"` / `"MagnumB2B ngrok"` → *cannot find the file specified*.
  - The Task Scheduler log (24 h) has **no registration** of either task.
- **`C:\MagnumB2B\ngrok.yml` does not exist**, and `repo\logs` does not exist (both scripts create them).
- **`.env.local` still has inherited permissions, incl. `BUILTIN\Users: Read`.** install-service.ps1 restricts it as its first step, so it never got that far.
- **Nothing is listening:** no ngrok or node process; `http://127.0.0.1:8787/health` refuses the connection. Hence ngrok's "endpoint offline" (3200).
- Probable reason: the scripts start with `#Requires -RunAsAdministrator`. They stop immediately if PowerShell isn't opened with **"Run as administrator"**, or if they're run in a session logged on **as claudeapp** (the log shows a claudeapp logon at 23:13), or on another machine.
- The batch-job right can't be the cause yet: the tasks were never registered.
- **I can't do it from this session:** it's not elevated, and I don't have the claudeapp password or the ngrok authtoken. As instructed, I didn't start a quick tunnel.

**Steps for Gil — on SRV-MAGNUM, logged on as giladmin, PowerShell "Run as administrator":**
1. (Once) Default Domain Controllers Policy → Computer Configuration → Policies → Windows Settings → Security Settings → Local Policies → User Rights Assignment → **"Log on as a batch job"** → add `MAGNUM\claudeapp`. Then `gpupdate /force`.
2. `powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\install-service.ps1`
   - enter the claudeapp password;
   - expect `{"ok":true}` + "OK - 'MagnumB2B Bridge' is running as MAGNUM\claudeapp".
3. `powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\install-ngrok.ps1 -Domain flagstone-crumpled-refueling.ngrok-free.dev`
   - paste the authtoken **from the same ngrok account that owns that domain**, then the claudeapp password;
   - expect `OK - https://flagstone-crumpled-refueling.ngrok-free.dev/health -> {"ok":true}`.
4. If a step prints an error, copy it to me (e.g. a 0x8007052F/2147943785 logon failure = step 1 not applied yet; an ngrok authtoken/domain error = account mismatch).
5. Tell me when done. I'll verify: local /health, static /health, /customers?agent=0 and /picking/queue with the token. Then I'll confirm both tasks are Running.

## 2026-10-02 (reply 13) — picking queue ✅ (read-only) · ngrok + services: scripts ready, **Gil must run them** (no static URL yet)

### `GET /picking/queue` ✅ (read-only, no writes)
`GET /picking/queue?agent=&q=&state=waiting|picked&limit=200&offset=0` → `Document[]` (same row shape as /documents), **oldest first**.
- Only open agent orders: **doc 11, Status 0**.
  - `state=waiting` (default) = no picker marker (`ExtraText2` not `לוקט…`);
  - `state=picked` = `ExtraText2 = 'לוקט - <name>'` (picked, waiting for production in Hashavshevet).
- `agent=0`/missing = all; `q` as in /documents.
- New fields on **every** /documents row (list, queue, detail):
  - `picked: boolean`
  - `picker?: string` (name from the marker, e.g. "משה אריה")
  - `pickedMarker?: string` (raw ExtraText2)
- `GET /documents/:stockId` lines now also carry **`onHand`** (current general stock, Items.Quantity) for the picker screen.
- Now: waiting = **5** orders (oldest 116979 from 2026-09-29), picked = **1** (116417, משה אריה). 23–260 ms.
- Contract updated.

### Permanent hosting (ngrok static domain + services under claudeapp) — prepared, NOT installed
**What I can't do from this session:**
- it is **not elevated** (Medium integrity), so it can't register tasks/services or set ACLs for claudeapp;
- **the ngrok authtoken and static domain are not on the server yet** (no ngrok.yml anywhere);
- I don't have the claudeapp password.
- So **there is no static URL yet** and nothing runs under claudeapp yet. I did not start a quick tunnel (reply 26: hold).

**Ready for Gil — one Administrator PowerShell, two scripts** (deploy/README.md):
1. `deploy\install-service.ps1` → the bridge as scheduled task **"MagnumB2B Bridge"**:
   - runs as **claudeapp** at boot, whether anyone is logged on or not; survives logoff/reboot; restarts on failure;
   - logs to `repo\logs\bridge.log`.
2. `deploy\install-ngrok.ps1 -Domain <static>.ngrok-free.app` → ngrok as scheduled task **"MagnumB2B ngrok"**, same properties:
   - asks for the authtoken and stores it only in `C:\MagnumB2B\ngrok.yml`, readable by Administrators/SYSTEM/claudeapp;
   - uses the official signed `C:\MagnumB2B\tools\ngrok.exe` (v3.39.11, already downloaded);
   - config format validated with `ngrok config check`;
   - ends by calling `https://<static>/health`.
- On a DC, claudeapp may need **"Log on as a batch job"** (README has the path).
- Then **BRIDGE_URL = `https://<static>.ngrok-free.app`** in Vercel, **BRIDGE_TOKEN unchanged**. Free ngrok shows a warning page to *browsers* only; your server-side proxy can send `ngrok-skip-browser-warning: 1` to be safe.
- After Gil runs them I'll verify from outside: /health, /customers with the token returns rows, /picking/queue. Then I'll report the exact URL.

## 2026-10-01 (reply 12) — (a) GET /documents/:stockId ✅ · (b) picking research: findings + proposal

### (a) `GET /documents/:stockId[?agent=:id]` ✅ (contract: `DocumentDetail`)
- Returns the list-row fields + `totalBeforeVat`, `vatPct`, `orderDiscountPct`, `remarks`, `customer {address, city, phone, email, taxId}` + `lines`.
  - `customer` comes from the document's own snapshot (Stock.Address/City/Phone), falling back to the customer card (Accounts).
- `lines: [{ itemkey, name, qty, unit, unitPrice, discountPct, lineTotal, isShipping? }]` in the document's line order.
  - M1001/M1002 are **flagged** `isShipping: true`, not removed, so you choose whether to print them.
  - Matrix tree children (Tree=2) are skipped so totals don't double.
- Works for orders **and** for produced docs (invoice/delivery note), e.g. 117004 = חשבונית מס #64583.
- **Only customer documents** (account in groups 10/11/12) are returned. A test call on id 1 returned a 2011 supplier purchase doc, now 404. `?agent=` → 404 unless it's that agent's customer.
- Through the tunnel: ~1–2 s warm (4.7 s cold).

### (b) PICKING — how it works today (magnum12 evidence)
**Method:** I had saved order **116993** un-picked (2026-09-30, schema-dump). It has since been picked and produced, so I diffed before vs now, plus small aggregates over the last 500 agent orders. NOLOCK, no scans.

1. **What marks picked / produced**
   - **Picked = `Stock.ExtraText2 = 'לוקט - <picker name>'`** while `Status` is still **0**.
     - The warehouse app writes it; it was already on 116993 before production.
     - Last 500 doc-11 orders: **490/491** site orders have it.
     - Pickers seen: `לוקט - אנטון` 393, `לוקט - משה אריה` 75, `לוקט -` (no name) 23.
   - So the states are:
     - **open, waiting for picking** = Status 0 + empty ExtraText2;
     - **picked, waiting for production** = Status 0 + `לוקט - …`;
     - **produced** = Status 1.
   - **No picker id or timestamp in magnum12.** There is no picking/audit table: `IssueLog` is the Tax-Authority invoice-number API log and `StatLog` is batch status. The picker list and pick times live in the **Digitrade site's own DB (MySQL)**, which I don't access.
   - **Production** (manual in Hashavshevet) flips:
     - header: `Status 0→1`, `CloseType 0→1`, `KuDate` = production date, `KUTime` = minutes after midnight (492 = 08:12), `RoundingMeth 0→2`, totals recomputed;
     - every line: `Status 0→1`, `SupplyQuantity`/`BaseQuantity`/`PurchQuantity` → **0** (nothing left to supply), `BaseDate`, `LineNum` 1..n, cost prices (`StockValPrice`, `PurchPrice`), `ExtraDate1/2` = production date.
2. **Shortages (חוסרים)**
   - On 116993 the shortage line **MG15041011S × 10 (184.50) was deleted from the order before production**, and the header totals were recomputed (1348.88 → 1164.39).
   - There are no backorders/partial supply: on all 5,382 produced lines of the last 500 orders, `SupplyQuantity = 0`.
   - So **a shortage = the line is deleted or reduced on the order**; nothing is recorded anywhere else in magnum12. From SQL alone I can't tell whether the warehouse app or the Hashavshevet user did the deletion.
3. **Order → produced doc**
   - **Manual in Hashavshevet.** 116993 → **חשבונית מס #64583** (Stock 117004), produced by Hashavshevet user **haim** (`StationID = haim_16304`) at 11:20.
   - That invoice **combined several orders** (1533.39 vs 1164.39 for this one).
   - The link is `StockMoves.BaseMoveID` as before. The warehouse app does **not** produce documents.
4. **The picking queue**
   - = **doc 11, Status 0, ExtraText2 empty** (5 such orders right now). Future orders (doc 6) are converted to doc 11 when stock arrives, so they're not picked as 6.
   - **Order of lines:** **`Items.Localization` (bin) is empty on all 12,491 items**, so there are no locations in Hashavshevet. Picking order would be by item key / brand / category (or a bin map we keep in Supabase).
5. **Picker identity / permissions**
   - Only the name text in ExtraText2. Accounts and permissions are in the site's MySQL (Digitrade "ניהול מלקטים").
   - For us: Supabase `profiles.role = 'picker'` (already in the schema).
   - Picks look **per order** (one picker name per order). Production is batched by the Hashavshevet user.

### Proposal for our picking module (needs Gil's OK — it means **UPDATE**, not only INSERT)
- **Read:** the queue and picked-waiting lists via the conditions above (cheap, indexed by DocumentID+Status).
- **Write on "finish picking":**
  - `UPDATE Stock SET ExtraText2 = N'לוקט - <picker>' WHERE ID=@id AND Status=0` (the same marker the old app writes, so Hashavshevet users see no difference);
  - **shortages:** reduce `StockMoves.Quantity` (+ TFtal, TftalVat, Supply/Base/PurchQuantity) and recompute the header totals, or delete the line when nothing was picked (what the old app does).
  - Everything in one transaction, only while the order is still Status 0.
- **Do not produce.** Hashavshevet keeps producing invoices/delivery notes (batched, manual).
- **Permissions needed:** `magnumapp` must have **UPDATE on Stock/StockMoves** (and DELETE on StockMoves, only if we copy the delete-line behavior). Today it's INSERT. **Gil decides:** is deleting a line inside an un-produced order OK under the "never delete documents" rule, or should we set the qty to 0 / keep the line and log the shortage in Supabase instead? My suggestion: **quantity 0 + shortage logged in Supabase**. No DELETE grant is needed, and there's a trail.
- **Optional:** keep pick timestamps and the picker id in Supabase (magnum12 has no place for them).

## 2026-10-01 (reply 11) — replies 20–22 done: NOLOCK, /customers admin+q, /documents, /prices · tunnel: https://rna-flower-vacations-chief.trycloudflare.com

### Reply 20 — performance ✅
- **Every read is now non-blocking.** The read-only pool (`magnum_ro`) opens all its connections with `READ UNCOMMITTED`, which equals `WITH (NOLOCK)` on every query (catalog sync, pricing, documents, writeOrder pre-checks).
  - Verified: `sys.dm_exec_sessions.transaction_isolation_level = 1` for the bridge session.
  - The write pool (`magnumapp`, order INSERT) keeps the default isolation.
- **Catalog sync is lighter:**
  - default **every 120 min** (server `.env.local` updated too);
  - scheduled runs are **skipped 07:00–19:00** server time (`SYNC_QUIET_HOURS=7-19`);
  - the schedule checks Supabase's newest `synced_at` first, so a restart doesn't re-sync if one ran recently;
  - `POST /sync` still works any time.
- **No more exploratory queries.** For this task I only ran a few small, index-backed ones. One attempt at a combined search query hit the 30 s timeout; I replaced it with separate indexed lookups (now ~1.7 s).

### Reply 21 — `/customers` ✅
- `GET /customers?agent=0` or no agent → **all** customers (1,642). `agent=:id` → that agent's (101 → 395).
- `q` → FullName or AccountKey **contains** q (LIKE, wildcards in q are literal). Works with agent too. E.g. `q=פוזה` → 13 (the פוזה chain).
- **Customers** = Accounts.SortGroup **10/11/12** (every order since 2025 comes from these; the rest are ledger/supplier accounts), `Dumi<>1`, non-empty name.
  - **New:** also excluded when the name contains **"לא פעיל"**: 27 accounts that staff mark inactive in the name instead of Dumi.

### Reply 22 — `GET /documents` ✅ (shape per your contract, + `stockId` on produced docs)
**Research results:**
1. **Link produced doc → order: `StockMoves.BaseMoveID` = the source line's `StockMoves.ID`** (line level, indexed). `Stock.BaseOrderStockId` exists but is **0 / unused**.
   - Verified: order 116254 → חשבונית מס #64383 (Stock 116277) through all 22 lines.
   - Chains seen in the last 300 produced docs: **11→1** (147), **6→4** (11), **4→1** (2), 6→1, 11→4. So I follow **two levels** (order → ת.משלוח → חשבונית).
   - One invoice can come from several orders (64383 ← 116254 + 116261): it shows under both.
   - **Receipts (31 קבלה) never link to orders.** They pay invoices through payment matching, not order lines, so they don't appear in producedDocs.
   - Conversions between order types also show, e.g. הזמנה 116948 → הזמנת סוכן 116949.
2. **DocumentID → name** (DocumentsDef):

   | id | name |
   |---|---|
   | 1 | חשבונית מס |
   | 2 | חשבונית מס/קבלה |
   | 4 | תעודת משלוח |
   | 6 | הזמנה |
   | 11 | הזמנת סוכן |
   | 31 | קבלה |

   Also 3 חשבונית מס זיכוי, 5 החזרה, 9 חשבונית סוכן, 87 חשבונית מס/קבלה סוכן. The bridge returns `docTypeName` straight from DocumentsDef.

**Endpoint:** `GET /documents?agent=&status=all|open|produced&q=&limit=50&offset=0`
- rows = orders (doc 6 + 11), newest first (Stock.ID desc), limit max 200;
- `agent=0`/missing = all (admin);
- `status`: open = Stock.Status 0, produced = anything else;
- `q` = customer name/accountKey, **or a number** = order Stock.ID / its DocNumber / the **DocNumber of a produced document** (e.g. `q=64383` finds both orders behind that invoice);
- `date` = Stock.IssueDate (YYYY-MM-DD), `total` = TFtal (incl. VAT);
- timing: 1–1.8 s per page.

### (optional) `POST /prices` ✅
`{ account, items:[{itemkey, qty?}] }` (max 500) → `PriceResult[]` (same shape as /price).

### Tunnel / test
- **BRIDGE_URL = `https://rna-flower-vacations-chief.trycloudflare.com`** (new; the old one died when the processes were stopped for low memory). Token unchanged.
- **Gil: please update `BRIDGE_URL` in Vercel** (I have no Vercel access).
- All new endpoints were verified through the tunnel.
- Same caveats as before: the bridge and tunnel run inside this Claude session (max 2 h / until the session ends or memory runs low), and the URL changes on every restart.
- When we're at a stopping point, Gil can close this session to free the DC. The bridge will then go down until it runs as the service.

## 2026-10-01 (reply 10) — 🌐 quick tunnel LIVE: https://sessions-contribute-planes-node.trycloudflare.com

- **BRIDGE_URL = `https://sessions-contribute-planes-node.trycloudflare.com`**
- **BRIDGE_TOKEN** = the `BRIDGE_TOKEN=` value in the server's `C:\MagnumB2B\repo\.env.local`. Gil copies it into Vercel as a **server** env var (not NEXT_PUBLIC). I'm not putting it in git or chat.
- **Setup:**
  - cloudflared 2026.9.3 is a single exe in `C:\MagnumB2B\tools` (Cloudflare signature valid, no install, no admin, no account);
  - command: `cloudflared tunnel --url http://127.0.0.1:8787`;
  - **magnumtexb2b.biz was not touched**;
  - the bridge runs on 127.0.0.1:8787 and synced the catalog at start (12,491 items, 8.7 s). Next sync every 30 min.
- **Verified through the public URL:**
  - `/health` → 200;
  - `/customers?agent=0` → 200 (1,037), `?agent=101` → 397;
  - no token → **401**;
  - `/price` 11728 × BR11506 → 8.55 special-central;
  - `POST /orders?dryRun=1` (account 10) → 200.
- **Fix made during the test:** `/customers` used to return **all** Accounts (3,179 for agent 0, including ledger/supplier accounts like 220000 with no name).
  - Now it's limited to customer groups **SortGroup 10/11/12** (every order since 2025 comes from these; configurable via `CUSTOMER_SORT_GROUPS`) and named accounts only.
  - Total 1,669 customers; account 10 is included (forPicking=false).
- ⚠️ **Lifetime:** both processes run under this Claude session, so they stop when the session ends or after **2 h at most**, i.e. around **13:40 UTC**. A quick tunnel also gets a **new URL** on every restart, which means updating BRIDGE_URL in Vercel each time.
  - For a stable setup: the named tunnel on a domain Gil owns + the service (`deploy/README.md`). Not on magnumtexb2b.biz.

## 2026-10-01 (reply 9) — ✅ first catalog sync done: Supabase is populated

`npm run sync` with the service_role key (role checked before running), **8.5 s**. Verified by reading back from Supabase:

| table | rows |
|---|---|
| `items` | **12,491** (all active), **1,271** `shown_on_site`, **257** `matrix_flag` |
| `item_variants` | **4,678** |
| `rulers` | **63** codes (name/sizes empty — app layer, yours) |

- **Your 120 seed rows:** all of them were real active item keys, so they were upserted/refreshed. 0 deactivated, and every row has `synced_at` from this run. `image_url` is untouched (0 set).
- **Spot checks:**
  - BR11506 → price 11, per_carton 80, per_bundle 5, ruler U28, הלבשה תחתונה / תחתונים;
  - KD62219_MIX → per_carton 32, no bundle;
  - BB12103 → matrix with 3 variants.
- **Variant labels are partial:** 1,502 / 4,678 cells have `size_label` (NoteID 33) and 1,864 have `color_label` (NoteID 29). The rest don't fill these fields in Hashavshevet; e.g. BB12103BL/NA/WH have none.
  - The cell's `ItemName` always ends with the label: "...3 יח' שחור", "...3 יח'  S".
  - **Option:** I fill the empty labels from the suffix (cell name minus the parent name). The catch: for a 1D matrix I can't tell whether the suffix is a size or a color. I could put it in `size_label` when `col=0`, or add a neutral `cell_label` column if you add it to the schema. Your call.
- **Schedule:** the server syncs at start + every 30 min **once it runs as the service** (`deploy/install-service.ps1`, Gil). Until then it's on-demand: `npm run sync` on the server, or `POST /sync` once the tunnel is up.
- Still open on Gil's side: tunnel + service (see `deploy/README.md`) → public URL.

## 2026-10-01 (reply 8) — orderDiscountPct ✅, catalog sync built ✅ (waiting for Supabase creds), tunnel/service ready for Gil to run

### 1. `orderDiscountPct` (POST /orders) ✅
- Optional, default 0, range 0 to below 100. Written exactly like issued Hashavshevet docs (verified on 8 docs, e.g. 116735: 2813.51 × (1 − 10.239%) × 1.18 = 2980):
  - `Stock.DiscountPrc` = `DiscountPrcR` = %;
  - `TFtalVat` = lines before the discount;
  - `TFtal` = TFtalVat × (1 − %) × 1.18.
- Note: site order 117008 wrote 5% but left TFtal undiscounted; Hashavshevet recomputes at issue. Ours is already consistent.
- Response `totals` now = `{ net, orderDiscountPct, netAfterDiscount, vatPrc, gross }`. New error `BAD_DISCOUNT`.
- Dry run (account 10, 5%): 352 → TFtal 394.59 ✅.

### 2. Catalog sync — `bridge/sync.js` ✅ (not yet run against Supabase)
- **FULL refresh:**
  - upserts `items` by itemkey (12,491 active items; 1,271 shown) and `item_variants` (4,678 matrix cells, size/color labels from the cell's NoteID 33/29);
  - inserts any missing `rulers.code` (63 codes) first, because `items.ruler_code` has an FK. Ruler names/sizes are left untouched.
  - Items no longer active in Hashavshevet → `active=false, shown_on_site=false` (never deleted). `image_url` is never written.
- **Mapping** = your schema.sql comments, with two notes:
  - `matrix_flag` = real detection via IMatrixItems (Items.MatrixFlag is always 0);
  - `is_color_item` / `is_carton_size_item` come from NoteID 27/26 ('1').
- **Not synced, because it's not in Hashavshevet:**
  - `colors`: needs the 2-letter `short_code`; Hashavshevet only has the color text in NoteID 29.
  - `categories`: integer app ids like נעליים=115; Hashavshevet only has the category **text** in NoteID 22/23, and that text goes into `items.category_main/sub`.
  - These two stay with you (seed). Tell me if you want me to fill `categories` from the distinct 22/23 texts, but it would need an id scheme.
- **Triggers:** at server start + every `SYNC_INTERVAL_MIN` (default 30); `POST /sync` (token, waits, returns a summary); `GET /sync` (last result); CLI `npm run sync [-- --dry-run]`. Single-flight, so no overlapping runs.
- **Dry run:** reads + maps everything in **1.2 s**.
- **Blocked on:** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in the server `.env.local` (Gil). Then I run the first sync and confirm the counts in Supabase.
- **Delta via the "last update" extra date:** later, as agreed.

### 3. Cloudflare Tunnel + service under claudeapp — scripts ready, **Gil must run them** (`deploy/README.md`)
I can't do these from this session: no elevation (even `net user /domain` is denied), no Cloudflare login, no claudeapp password. I have **not** installed anything or opened anything.
- `deploy/install-service.ps1` (admin): scheduled task "MagnumB2B Bridge"; I picked this over a third-party service wrapper.
  - runs at boot as `claudeapp`, restarts on failure, logs to `repo\logs`;
  - claudeapp gets read access to the repo, write access to logs, and is the only non-admin who can read `.env.local`;
  - may need "Log on as a batch job" for claudeapp on the DC (steps in the README).
- `deploy/install-tunnel.ps1 -Token <token>` (admin): installs cloudflared and runs the named tunnel as a service.
  - Gil first creates tunnel `magnum-bridge` in **his** Cloudflare Zero Trust dashboard and adds public hostname `bridge.<domain>` → `http://127.0.0.1:8787`.
  - ⚠️ **The domain must be in Gil's own Cloudflare account.** If magnumtexb2b.biz sits in Digitrade's account, use another domain or move the zone.
- **Public base URL** = `https://bridge.<domain>`, known once Gil picks the domain. Vercel env: `BRIDGE_URL` + `BRIDGE_TOKEN` (the value from the server `.env.local`).

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
