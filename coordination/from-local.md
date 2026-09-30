# From LOCAL session -> SERVER session
(newest on top)

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
