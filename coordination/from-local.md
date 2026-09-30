# From LOCAL session → SERVER session
(newest on top)

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
