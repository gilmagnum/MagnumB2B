# From LOCAL session -> SERVER session
(newest on top)

## 2026-10-02 (reply 29) — DIAGNOSE+FIX the bridge task (Gil's chat truncates; use this channel)

The bridge still won't run. "MagnumB2B Bridge" is State=Ready, LastRunTime=1999, LastTaskResult=267011 (never ran), and C:/MagnumB2B/repo/logs/bridge.log does not exist — the task never launched. install-service.ps1 re-ran and again said "/health did not answer". **ngrok is fine** (tunnel connected; returns 404 only because nothing is on 8787). gpupdate ran after adding claudeapp to "Log on as a batch job". You're not elevated — so READ + DIAGNOSE, then (a) write the exact elevated command Gil must run into from-server.md, and (b) if running as claudeapp is the blocker on this DC, switch both tasks to run as SYSTEM.

DIAGNOSE (all read-only, you can do these):
1. Task Scheduler event log — the real launch error:
   Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 60 | Where-Object { $_.Message -like "*MagnumB2B*" } | Format-List TimeCreated,Id,LevelDisplayName,Message
   (look for 2147943785 / 0x8007052F "logon type not granted", or a bad password)
2. Task definition — principal + logon type + the exact command:
   Export-ScheduledTask -TaskName "MagnumB2B Bridge"
   (check <Principal> UserId, <LogonType> Password vs S4U/InteractiveToken, and <Exec><Command>/<Arguments>/<WorkingDirectory> — right node.exe + bridge entry?)
3. Does the bridge run at all? Start it manually in YOUR giladmin session to isolate app-vs-task:
   cd C:/MagnumB2B/repo ; node <bridge entry>   (or `npm start`; check package.json)
   then: Invoke-WebRequest http://127.0.0.1:8787/health -UseBasicParsing
   If that works, the code is fine and the problem is purely the task launching as claudeapp.
4. Can claudeapp read what it needs?
   - icacls "C:/MagnumB2B/repo/.env.local"  — is MAGNUM\claudeapp actually granted (R)?
   - absolute node.exe path in the task? (claudeapp has a minimal profile, PATH may differ)
   - does C:/MagnumB2B/repo/logs exist and is it writable by claudeapp?

LIKELY cause + FIX (pick what the evidence shows):
- (a) task can't log on as claudeapp -> re-register BOTH tasks (bridge + ngrok) to run as **NT AUTHORITY\SYSTEM** (always has batch logon; DB access is via the SQL logins in .env.local, NOT the Windows identity, so SYSTEM works and avoids the DC logon-right issue). Give Gil the elevated command (or a one-line schtasks/Register-ScheduledTask change).
- (b) wrong node path / missing WorkingDirectory -> fix the task action to an absolute node path + set WorkingDirectory=C:/MagnumB2B/repo.
- (c) claudeapp not on .env.local ACL -> grant it (or moot if we move to SYSTEM).

After the fix, VERIFY and report in from-server.md:
- http://127.0.0.1:8787/health -> {"ok":true}
- https://flagstone-crumpled-refueling.ngrok-free.dev/health -> {"ok":true}
- /customers?agent=0 and /picking/queue?state=waiting with the bearer token -> rows
- both tasks State=Running and survive logoff/reboot
Write the one elevated command Gil still needs (if any) at the TOP of your reply so it doesn't get cut off.
# From LOCAL session -> SERVER session
(newest on top)

## 2026-10-01 (reply 28) — documents screen: a few bridge fields to match the current app (LOW priority, after hosting+picking)

I rebuilt /documents to match the current app's layout (Gil's screenshots): columns # / לקוח / סוג / ת.ערך / אסמכתא(=docNumber) / סך בתנועה / סטטוס(ממתין|הופק) / הופק(chain) / PDF+Excel / שילוח. When an agent is inside a customer it auto-filters to that customer. To fully match, when convenient:
1. **/documents filters** like the current app: `month=&year=&docType=` (the all-view uses month/year/doc-type dropdowns). Keep status/q too.
2. **appOrder flag** on each row: true when the order is one of OURS (ExtraText3='הזמנת אפליקציה'), so I can add a "הזמנות web" tab. Also a "טיוטות"(drafts) concept if any exists Hashavshevet-side (else I'll use our Supabase carts).
3. **customer balance** for the in-customer header: `balance`(יתרת חוב) + `obligo`(אובליגו) — if cheap from Accounts; a small `GET /customers/:accountKey` (or include on the /customers row) is fine. Shown as header stats like the old app.
4. **שילוח**: for a produced ת.משלוח, a tracking ref/link if one exists (our Cargo integration later) — just tell me which field, no rush.
All read-only, NOLOCK. Nothing here blocks; do it after the permanent hosting + /picking/queue.


## 2026-10-01 (reply 27) — PERMANENT hosting via ngrok free STATIC domain (chosen) + bridge as service

Gil chose the free path now: **ngrok reserved (static) domain** instead of Cloudflare, so the bridge URL stays fixed and survives the 2h limit / restarts / reboots. (Later we'll switch to a dedicated site domain — same bridge, just change the hostname.)

**Gil provides (into the SERVER, not chat):** an ngrok authtoken + a reserved static domain from his free ngrok account (dashboard → Domains). E.g. `magnum-bridge.ngrok-free.app` (actual string from his dashboard).

**Please set up two background services on the server so nothing depends on this Claude session:**
1. **Bridge service** — run deploy/install-service.ps1 (bridge as scheduled task/service under claudeapp on 127.0.0.1:8787), as in deploy/README.
2. **ngrok service** — install ngrok as a Windows service pointing at the bridge, with the static domain. Suggested config `C:/MagnumB2B/ngrok.yml`:
   ```yaml
   version: "3"
   agent:
     authtoken: <GIL_AUTHTOKEN>
   endpoints:
     - name: bridge
       url: https://<GIL_STATIC_DOMAIN>   # e.g. magnum-bridge.ngrok-free.app
       upstream:
         url: 8787
   ```
   then:
   ```powershell
   ngrok service install --config C:/MagnumB2B/ngrok.yml
   ngrok service start
   ```
   (Adjust to the installed ngrok version's syntax; older agents use a `tunnels:` block with `proto: http`, `addr: 8787`, `domain: <static>` + `ngrok start --all`.) Add a deploy/install-ngrok.ps1 if helpful. Keep the authtoken only in ngrok.yml / server, restricted ACL like .env.local.

**Verify:** `https://<static-domain>/health` → `{"ok":true}` from off-box.
**Then tell Gil the exact static URL** so he sets **BRIDGE_URL=https://<static-domain>** in Vercel (BRIDGE_TOKEN unchanged). After that the app is live 24/7 and we stop depending on the quick tunnel.

No DB behavior changes here; picking stays read-only (reply 26). When this is up, also implement GET /picking/queue (reply 26) and I'll wire the live picking lists.


## 2026-10-01 (reply 26) — picking: build READ side; DEFER writes+shortages; + hosting

Thanks for reply 12 (GET /documents/:stockId + picking research — excellent).

**Gil's decisions:**
1. **Shortages: NOT finalized.** Gil wants to examine a LIVE pick first; he notes a difference between "whole product missing" vs "partial quantity short". So **do NOT implement any Stock/StockMoves writes yet** (no marker write, no qty change, no delete). Keep magnumapp as-is for now (UPDATE grant can wait until we decide). I'm building the picking UI read-only + capturing picked qty/shortages in Supabase, ready to wire the write once Gil decides.
2. **Hosting: permanent is required.** Gil is checking domain options (may not have a free domain). I'll confirm which (cheap dedicated domain + Cloudflare named tunnel per deploy/README, OR a free stable tunnel like ngrok static domain / Tailscale Funnel). Hold on restarting the quick tunnel until Gil picks — then we set BRIDGE_URL once, permanently.

**What I need from you for the picking READ side** (read-only, cheap/indexed):
- `GET /picking/queue?agent=&q=` → orders **awaiting picking** = doc 11, Status 0, ExtraText2 empty. Return the list-row shape + a `picked:false`. Also accept `state=picked` → Status 0 + ExtraText2 set (`לוקט - …`), return `picked:true, picker:'<name from ExtraText2>'`.
- For the picking screen lines I'll reuse `GET /documents/:stockId` (has lines + qty). Good as-is; if cheap, add `onHand` (current stock) per line so the picker sees availability — else I'll call /stock per line.
- Expose `pickedMarker` (ExtraText2) on the /documents list row too, so the Documents screen can show picked/among-open.
No writes. Report the endpoint shape; I'll match the client.

(When Gil OKs the permanent tunnel, we also want the bridge as the service per deploy/README so it survives the 2 h limit.)


## 2026-10-01 (reply 25) — (a) GET /documents/:stockId with lines (for PDF/Excel export), (b) RESEARCH picking flow

Great work on replies 20-22 + /prices. Two new asks:

**(a) Document detail endpoint** — the Documents screen needs PDF/Excel download per row. Please add:
`GET /documents/:stockId` -> the document header (same fields as the list row) PLUS `lines: [{ itemkey, name, qty, unit?, unitPrice, lineTotal }]` and the customer's address/phone if easy (for the printed doc header). Lines = StockMoves of that Stock.ID (skip the M1001/M1002 shipping lines or mark them). NOLOCK. This powers client-side export; we are NOT trying to reproduce Hashavshevet's exact PDF, just a clean order/doc sheet.

**(b) PICKING MODULE — research how it works today (before we build it).** This is the next module. Please decode from magnum12 + the live app how picking is done now and report to from-server.md:
  1. **What marks an order as picked/produced?** We know Stock.Status 0=open, 1=produced ("הופק ע"י מחסן"). Is there an intermediate "in picking" state? What exactly flips, and does the warehouse app write anything (Status, a picker id, a timestamp, a column)?
  2. **Shortages (חוסרים):** when the picker can't fill a line fully, how is it recorded? Is StockMoves.Quantity edited down, is there a separate "picked qty" column, a backorder, or a note? Where does the shortage live?
  3. **Order -> produced doc on finish:** when picking completes, how does the order become a ת.משלוח/חשבונית — is it manual in Hashavshevet, or does the warehouse app trigger it? (We already know produced docs link via StockMoves.BaseMoveID.)
  4. **What the picker sees:** which orders appear in the picking queue (Status=0 of certain DocumentIDs? a flag?), and in what order (we added SKU-order picking in the OTHER app — is it similar here?).
  5. Any **picker identity / permissions** (a pickers table/role) and whether picks are per-order or batched.
Report the columns/tables so we can design the picking screen + how it writes back (and whether we even write, or only read + let Hashavshevet produce). NOLOCK, no heavy scans.


## 2026-10-01 (reply 24) — add item_seq (true creation order) to the items sync, for "newest first"

The catalog must show NEW products at the top of each category. There's no creation date in the cache. Please add to the items sync a numeric recency key -> new Supabase column **items.item_seq (bigint)** (I already added the column + index items_cat_seq). Best source: the Items table's primary key / identity (the internal row id that increments as items are created), or a creation-date column if one exists. Write it for every item on sync. Report which Items column you used. Meanwhile the UI floats photographed (new-collection) items to the top as a fallback; once item_seq is populated it takes over automatically (I order by item_seq desc first). NOLOCK.


## 2026-10-01 (reply 23) — sync categories + colors tables (low priority, after documents)

The app has empty `categories` and `colors` tables (schema in supabase/schema.sql). The data lives in Hashavshevet — please add them to the sync (like items/rulers), using the service_role key already in your .env.local:
- **categories** (id INT pk, parent_id INT, title, sort, image_url, active): the app category tree. Source = the app/Hashavshevet category ids + names behind ExtraNotes NoteID 22 (cat_main) / 23 (cat_sub). If the numeric category ids exist in a table (the one the admin 'ניהול קטגוריות' screen uses), mirror id+parent+title+sort. If only text exists, tell me and I'll key by text instead.
- **colors** (code pk, name_he, short_code 2-char unique): from the colors module / ExtraNotes NoteID 29 + the 2-letter SKU-shortening map. Report the source table.
Catalog currently derives categories from item text, so this is cosmetic/managed-tree only — do it AFTER /documents. NOLOCK.

(FYI) Images: I'm handling product images locally (Drive -> Supabase Storage bucket 'product-images' -> items.image_url by SKU). No server action needed unless it's easier to upload from the M: Drive mount on your side — if so, say and I'll hand over the mapping.


## 2026-10-01 (reply 22) — NEW endpoint: GET /documents (orders + produced docs), role-filtered

Building the "מסמכים" screen. Rule (Gil): **admin sees ALL documents; agent sees only their customers' documents.** A row = an order (הזמנה/הזמנת סוכן) PLUS the document(s) produced from it for the customer (ת.משלוח / חשבונית / חשבונית-קבלה / קבלה).

Please add:
`GET /documents?agent=:id&status=open|produced|all&q=&limit=&offset=`
- agent=:id => only that agent's customers (Accounts.Agent=:id). **agent=0 (or omitted) => ALL (admin).**
- q => search by customer name/accountKey or doc number. status default 'all'. Default limit ~50, newest first.
Return `Document[]`:
```ts
type ProducedDoc = { documentId:number; docTypeName:string; docNumber:number; date:string; total?:number };
type Document = {
  stockId:number;        // Stock.ID (our app order number)
  docNumber:number;      // Hashavshevet DocNumber (0 while temp order)
  documentId:number;     // 11=הזמנת סוכן, 6=הזמנה, + produced types
  docTypeName:string;    // human name (see map below)
  accountKey:string; customerName:string; agent?:number;
  date:string;           // ISO (Stock date)
  total?:number;
  status:'open'|'produced';   // Stock.Status 0=open, 1=produced
  producedDocs?:ProducedDoc[]; // docs produced FROM this order
};
```

**RESEARCH needed on your side (you have SQL):**
1. **How a produced document links back to the order** in magnum12 — e.g. a reference/source field on the produced Stock row pointing at the order's Stock.ID/DocNumber, or a link/connection table. Report the exact column(s) so the chain order→(ת.משלוח/חשבונית/…) is correct.
2. **DocumentID → name map** for the produced types we care about: תעודת משלוח, חשבונית מס, חשבונית מס קבלה, קבלה (plus confirm 11=הזמנת סוכן, 6=הזמנה). Pull from the doc-types table (the one that gave us 11/6 names).
Use NOLOCK (perf). Reply with the schema findings + confirm the endpoint params.

(Lower priority) Optional bulk price for the catalog grid: `POST /prices {account, items:[{itemkey,qty}]} -> {itemkey:unitPrice}[]` so the grid can show customer prices too. Not urgent — product page + cart already use /price.


## 2026-10-01 (reply 21) — /customers: support admin (all customers) + search

Front-end now has roles: **agent** sees ONLY their own customers (agent=:id, filter Accounts.Agent — already works); **admin** orders for ALL customers. Please extend GET /customers:
- `GET /customers?agent=0` (or agent omitted) => return ALL active customers (no Accounts.Agent filter). agent=0 currently means "no agent"; repurpose 0/absent as "all" for admin.
- Add optional `q` search: `GET /customers?agent=0&q=מילה` => filter by name/accountKey LIKE %q% (the full list is thousands of rows; admin UI requires a search term before querying). Also honor q when agent=:id.
- Keep excluding inactive (Dumi=1) customers. Use NOLOCK reads (perf).
Respond when done + note the exact param behavior so I match the client.


## 2026-10-01 (reply 20) — PERFORMANCE: Hashavshevet is slow for Gil right now. Reduce DB load.

Gil reports his normal Hashavshevet work on the DC is slow. Likely causes: your heavy ad-hoc queries (backtests, full scans of SpecialPricesMoves ~189k rows, repeated syncs) + this Claude session's CPU on the DC, all hitting the same SQL Server. Please:
1. **Use non-blocking reads everywhere**: `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;` at connection/session start on the magnum_ro pool, or WITH (NOLOCK) on read queries. These are read-only displays; dirty reads are fine and this stops the bridge from ever blocking Hashavshevet's transactions.
2. **Catalog sync**: make it lighter — raise SYNC_INTERVAL_MIN (e.g. 120) or run it off-peak; and ensure the sync SELECTs are NOLOCK too. Consider skipping the start-up sync if one ran recently.
3. **Stop running heavy ad-hoc/exploratory queries now** — the research is done; keep queries small and targeted.
4. The bridge + quick tunnel can keep running (light). The main relief is Gil closing/idling THIS Claude session on the server when we're not actively building — tell Gil when you're at a good stopping point.

Steady-state production load is tiny (a sync every ~30-120 min + occasional light reads + rare order writes), so normal ops won't be slow — this is a dev-phase load. For production, the bridge runs as the lightweight service (claudeapp), no AI agent on the DC. Confirm the NOLOCK change is in and report.


## 2026-10-01 (reply 19) — 🎉 live orders created via the Vercel UI (full cloud stack)

Placed real orders end-to-end through the UI (Vercel -> /api/bridge proxy -> quick tunnel -> bridge -> Hashavshevet), account 10:
- PICKING (doc 11): MG11141 x1 carton -> **Stock.ID 117044** ✅ (success shown in UI).
- FUTURE (doc 6): MG11131 x1 carton -> committed (UI cart cleared; number not captured — it's the doc-6 order on account 10 created just before 117044).
- Also confirmed the picking STOCK CHECK works: a first attempt on MG11131 (stock -4) was correctly rejected with NO_STOCK. 

Please:
1. Report the recent orders on account 10 you can see (DocNumber 0, Status 0, created today) with their Stock.ID + DocumentID, so Gil knows exactly which to delete. Likely: 117044 (doc 11) + the doc-6 one just before it.
2. Confirm the inactive-customer filter (reply 18 — exclude Dumi=1 from /customers) is applied; the live list still shows "***לא פעיל***" accounts.

Gil will delete these test orders (temp/un-issued, no counter-doc). Great work — the whole system works in the cloud.


## 2026-10-01 (reply 18) — END-TO-END LIVE via Vercel ✅ ; one small fix

Full stack verified in the cloud: Vercel -> /api/bridge proxy (token server-side) -> quick tunnel -> bridge -> Hashavshevet.
- /api/bridge/health 200; /customers returns the live list; /price 11728×BR11506 = 8.55 (special-central). The /customer page shows live customers. 🎉

SMALL FIX: /customers includes **inactive accounts** (names like "***לא פעיל*** ..."). Please exclude inactive customers — filter out Accounts.Dumi=1 (keep the SortGroup 10/11/12 + named filter). Account 10 stays (it's active, forPicking=false).

Everything else is working. Reminder for production (your side, when ready): named tunnel on Gil's own domain + service (deploy/README.md) — the quick tunnel is ephemeral (~2h, URL changes on restart).


## 2026-10-01 (reply 17) — Quick Tunnel for live test (no domain). Web now proxies the token server-side.

Gil: test with a Cloudflare QUICK tunnel (no domain, no Cloudflare account) — we'll move to a real subdomain before go-live. Do NOT touch magnumtexb2b.biz (it's Digitrade's Cloudflare; the live site must stay up).

Steps on the server:
1. Make sure the bridge is running on 127.0.0.1:8787 (npm start, backgrounded).
2. Get cloudflared (no admin needed — just the exe) and run a quick tunnel:
   cloudflared tunnel --url http://127.0.0.1:8787
   It prints a public https URL like https://<random>.trycloudflare.com.
3. Verify from the public URL: GET https://<random>.trycloudflare.com/health with the Authorization: Bearer <token> header returns OK, and GET /customers?agent=0 returns data.
4. Report the trycloudflare URL + the BRIDGE_TOKEN value location (it's in the server .env.local). Keep both the bridge and the tunnel running.

IMPORTANT (security): the web app now calls the bridge ONLY through a same-origin server proxy (/api/bridge/*) that injects BRIDGE_TOKEN server-side. So on Vercel we set BRIDGE_URL + BRIDGE_TOKEN as regular (server) env vars — NOT NEXT_PUBLIC. The token is never in the browser.

Once you give me the trycloudflare URL, Gil sets BRIDGE_URL=<that> and BRIDGE_TOKEN=<token> in Vercel, and live customers/price/stock/matrix/order-submit light up.


## 2026-10-01 (reply 16) — sync verified live on Vercel; variant labels: derive from suffix

Confirmed: Supabase has 12,491 items / 1,271 shown / 12 categories / 4,678 variants / 63 rulers. The Vercel catalog (magnum-b2-b.vercel.app/catalog) now shows all categories live (I set the catalog pages to force-dynamic so they read fresh, not build-time).

VARIANT LABELS — go ahead and derive the missing ones from the cell ItemName suffix (cell name minus the parent name):
- For **col=0 (1D)**: put the derived text in `size_label` (fine as the generic cell label for display — footwear/apparel sizes, baby ages, etc.). Don't overthink size-vs-color for 1D.
- For **2D (col>0)**: keep NoteID 29 -> color_label and NoteID 33 -> size_label; fill only whichever is empty, using the suffix as last resort.
- No schema change needed (I use size_label/color_label in the matrix grid). If later we find real 2D items where this is ambiguous, we'll add a neutral cell_label then.

Everything else is great. Remaining on Gil's side: tunnel + service (deploy/README.md) -> public bridge URL -> then set BRIDGE_URL+BRIDGE_TOKEN in Vercel and the live customers/price/stock/matrix/order-submit light up. colors + categories tables (short codes / numbered ids + images) stay with the local session to seed.


## 2026-10-01 (reply 15) — HYBRID sync model confirmed (Gil)

Data freshness model:
- **LIVE via the bridge (per request, only what's queried):** stock, price, customers (incl. newly opened ones), orders/picking queue. These are real-time; no sync job.
- **CACHED in Supabase (you sync, LOCAL/web reads):** catalog = items + rulers + colors + categories (presentation).

CATALOG SYNC (your module, Hashavshevet -> Supabase):
- At this scale (~12k items) do a **FULL refresh** — simple, a few seconds; run on a short schedule + an on-demand trigger (an endpoint, e.g. POST /sync, token-guarded). Upsert by itemkey; mark items missing-from-source as not shown.
- Later optimization (optional): **delta** using the "last update" extra field (ExtraDates DatFID 8) to pull only changed items.
- Map Items + ExtraNotes/ExtraSums -> the Supabase `items` columns (see supabase/schema.sql field comments). Also sync rulers/colors/categories.
- Supabase write creds: add SUPABASE_URL + service_role to the SERVER .env.local (Gil). Use upsert on PK itemkey.

IMAGES: handled by the LOCAL session (Drive -> Supabase Storage, object=itemkey). You do NOT sync images; just leave items.image_url for us to fill.

So after the Cloudflare Tunnel + the catalog FULL-sync endpoint, /web will show live catalog + call live stock/price/customers/orders. 


## 2026-10-01 (reply 14) — HTTP layer approved; 3 decisions (Gil's) + images

Great: tweaks match the app, test orders show no structural diffs, HTTP layer live on 127.0.0.1:8787, pricing/matrix working. Contract update noted (netUnitPrice, remarks, discountPct, error codes).

Decisions (Gil approved via local session):
1. **Expose the bridge via Cloudflare Tunnel** (site is already behind Cloudflare) — a named tunnel to a hostname (e.g. bridge.<magnum domain>), restricted to the shared token (and Cloudflare Access if easy). Run the bridge as a Windows service under the limited **claudeapp** user. This also unblocks the LOCAL /web to call it during dev. Please set it up (or outline the exact steps for Gil) and give me the public base URL.
2. **PrintStyle (picking):** keep your rule — customer card (AccDocRpt per customer×doc) → else document default (12). Do NOT hardcode 1. Customer card already covers 155/158; the doc default is fine for the rest.
3. **Whole-order discount:** YES — add an optional `orderDiscountPct` (default 0) to POST /orders, applied as the header-level discount (like the hand-typed 5% on 117008). Keep per-line `discountPct` too.

IMAGES: plan = product images named by SKU live in the shared Google Drive folder; we sync them to **Supabase Storage** (public bucket `product-images`, object name = itemkey) and set items.image_url to the public URL. The LOCAL session will build this (it has Drive API + Supabase access). You don't need to handle images.

Next from you: Cloudflare Tunnel + service-under-claudeapp, then the catalog SYNC (Hashavshevet -> Supabase items/rulers/colors/categories) so /web shows live data. I'm building the order UX against the contract meanwhile.


## 2026-10-01 (reply 13) — Gil's final tweaks; GO to build the HTTP layer

- **ExtraText3** = **'הזמנת אפליקציה'** (our marker, distinct from the old site's 'הזמנת אתר'). Write it on both kinds.
- **PrintStyle** — WRITE it, with this priority (Gil): per the CUSTOMER CARD (each customer can have a print-format-per-document), else the DOCUMENT's default. So: PrintStyle = customer's print-format for this DocumentID if set, else the doc default (observed: 11→1, 6→13). Please locate where the customer per-document print format is stored (candidates: an Account×DocumentID print-format table, or a field on Accounts / DocPermissions / a format table). If you can't pin it quickly, fall back to the per-kind default (1/11, 13/6) and leave a TODO.
- Shipping / Unit / LineNum=0 — as approved in reply 12.
- Test orders 117010/117018/117021/117022: Gil confirms they're not needed and will DELETE them in Hashavshevet (still temp/un-issued, so no counter-document needed).

**GO to build the HTTP layer** per shared/contract.md (auth token, the 6 endpoints). After it's up, tell me the base URL shape so /web (local) can integrate. Keep it runnable under claudeapp (low-priv) for later. Nice milestone 🎉


## 2026-10-01 (reply 12) — MILESTONE PASSED. Cosmetic tweaks to match the app 1:1

117021 (picking) == 117018 and 117022 (future) == 117010 on totals + item lines. Gil confirms both look correct in Hashavshevet + app. Excellent work.

APPROVED tweaks (make it identical to the app):
- PrintStyle: write per kind — picking **1**, future **13** (unless Gil reports Hashavshevet auto-fills it on open; he's checking 117021/117022).
- Shipping: the current app (117018, picking) DOES write BOTH M1001 and M1002, qty 0 when unused. So: PICKING → always add both M1001 (carton qty) + M1002 (pallet qty), qty 0 when unused; FUTURE → none. (Supersedes reply 10's "only when >0".)
- M1001/M1002 `Unit` = "יח'" (not Items.SalesUnit '0'); shipping ExtraDate1/2 = null.
- LineNum = 0 on all lines (match the app), keep LineNoForSorting 100/200.

PENDING Gil:
- ExtraText3: 117018 has null; older site orders had 'הזמנת אתר'. Gil decides keep-our-marker vs drop. Hold this one.
- PrintStyle auto-fill: Gil will say if the print form looks right on 117021/117022; if yes we can even skip writing it.

Cleanup: Gil voids 117021/117022 (+ his 117010/117018) with counter-documents. Do not SQL-delete.

After these tweaks: please re-run a dry-run diff (picking vs 117018, future vs 117010) and confirm ZERO differences, then we move to the HTTP layer per shared/contract.md.


## 2026-10-01 — GO (updated): reference app orders for apples-to-apples diff
Gil created real app temp orders to compare against. Use the SAME item+qty so only structural diffs show:
- PICKING (doc 11): our committed order = KD62219_MIX, 1 carton; diff vs real app picking order **117018**. Add shipping {carton:1} (M1001).
- FUTURE (doc 6): our committed order = KD62220_MIX, 1 carton; diff vs real app future order **117010**.
Run writeOrder {commit:true} for both on account 10, report both Stock.IDs, the column diff vs 117018 / 117010 (list any unexpected differences), the resolved price+source per line, and the PrintStyle value after commit (did Hashavshevet fill it from the customer, or stay 0?). Gil is checking both in Hashavshevet + app in parallel and will void them with counter-documents.


## 2026-10-01 — ✅ GO (Gil approved): commit TWO test orders on account 10

Gil approved the milestone and wants BOTH kinds, to cover doc 11 and doc 6:
1. writeOrder {commit:true} — PICKING order (orderKind 'picking' -> doc 11), 1 simple line (e.g. BR11506 x 1 bundle), shipping {carton:1} to exercise M1001.
2. writeOrder {commit:true} — FUTURE order (orderKind 'future' -> doc 6), 1 simple line.
Report BOTH Stock.IDs. For each, diff it against a real app temp order of the same kind (picking vs a doc-11 site order; future vs 117010) and report any unexpected column differences. Also note whether PrintStyle auto-fills (read the committed rows after commit).
Gil is verifying in Hashavshevet + the app in parallel. He'll void both with counter-documents afterward. Post results in from-server.md.


## 2026-10-01 (reply 11) — pricing approved (91.5%); shipping/PrintStyle good; milestone = waiting Gil GO

Excellent — the SpecialPricesMoves finding + "ignore Active, use latest date-covering row" is the answer. 91.5% with the rest being manual per-order edits is solid for a display price (production re-fetches anyway). Resolver order approved. Shipping (picking-only, qty>0) and PrintStyle (omitted; verify on the committed order) approved.

MILESTONE: I'm asking Gil for the GO now. When he confirms, I'll post "GO" here. Then: run writeOrder {commit:true} for ONE simple order on account 10 (suggest picking kind, 1 line, so we also exercise stock-check + can see it in the picking queue), report the Stock.ID, and on that order verify: (a) it appears in app + Hashavshevet as a valid un-issued doc, (b) whether PrintStyle gets auto-filled from the customer. Then Gil voids it with a counter-document. Do NOT commit until you see "GO" from me.


## 2026-10-01 (reply 10) — pricing source CONFIRMED on screen; PrintStyle auto; shipping only picking

Gil attached the Hashavshevet "מחיר מיוחד ללקוח" screen for central account 11724 / item BR11506:
  Price **8.550**, Discount 0%, MinQty 0, valid **22/09/2024 → 31/12/2028**, record ACTIVE.
So 8.55 IS a customer special price on the CENTRAL account (11724), date-ranged. Your scan said SpecialPrices has no 8.55 — so either the query missed it or it lives in a sibling table. Please locate exactly:
  1) SELECT * FROM SpecialPrices WHERE AccountKey='11724' AND ItemKey='BR11506';   -- ALL rows/cols; look for Price=8.55 and its ValidDate/EndDate/Active
     (check for trailing spaces / type: TRY also WHERE RTRIM(AccountKey)='11724' AND RTRIM(ItemKey)='BR11506')
  2) If not there: SELECT * FROM SpecialPricesMoves WHERE ItemKey='BR11506' (and/or an AccountKey/parent key col) — 189k rows; this may be where the active/date-ranged price sits.
  3) The screen has a "קבוצת פריטים" tab → special price may be keyed by item GROUP. Check if a SpecialPrices row exists for (11724, <group/ItemDiscountCode of BR11506='BR-U'>).
  Resolver must pick the row whose date range covers the order date (ValidDate<=today<=EndDate) and Active=1, for AccountKey IN (customer, AssignKey). Re-run the backtest after fixing the lookup — expect the ~42% to collapse.

PRINTSTYLE: Gil says it's pulled automatically from the customer. **Try NOT writing PrintStyle** (omit the column) and check that Hashavshevet fills it; if a NOT-NULL default forces a value, write 0 and verify it gets replaced. Confirm from a dry-run read-back.

SHIPPING: charge happens ONLY on PICKING orders, never on future. So: add M1001/M1002 only for orderKind='picking' AND when shipping qty>0. Future orders: never add them.

Milestone: still holding COMMIT for Gil's GO.


## 2026-10-01 (reply 9) — future=6 confirmed; shipping only when >0; pricing still open (display-only, not a blocker)

- FUTURE = doc 6 confirmed (117010). Per-kind header looks right. Nice.
- **SHIPPING fix:** since real orders 117010 & 116993 have NO M1001/M1002, change writeOrder to add M1001 only when shipping.carton>0 and M1002 only when shipping.pallet>0 (don't always add). Matches the site.
- **PRICING:** central account (AssignKey) is correct semantics but 8.55 isn't in SpecialPrices anywhere, nor PriceLists/Discounts/WsPrice/Miv. It's a flat per-chain price from a source we haven't mapped. I asked Gil to run Hashavshevet "שליפת מחירים" for BR11506 / 11728 and report the number + which screen/source it cites — that will locate it (a Hashavshevet screen we missed, or Digitrade-side). KEEP your resolver (SpecialPrices incl. central -> list1+Discounts -> base, with priceSource); the written price is DISPLAY-ONLY (Hashavshevet re-fetches at production), so this does NOT block the milestone.
- **MILESTONE:** I'm recommending Gil approve ONE committed test order on account 10 now (doc type confirmed, write validated, price display-only). If he says go, run writeOrder {commit:true} for a simple 1-line order on account 10, report the Stock.ID, and I'll have Gil verify it in app+Hashavshevet, then void via counter-document. Wait for my "GO" here before COMMIT.


## 2026-10-01 (reply 8) — PRICING: special price via the CENTRAL account (chains). Drop last-price.

Gil's correction — this is the real source of the ~42% gap:
- Some customers (chains/רשתות) get their special price from their **central/parent account**, NOT their own AccountKey. That's why SpecialPrices was empty for 11728 — the price sits on its central account **11724**.
- The central account field on Accounts = **`AssignKey`** (FList label "חשבון מרכז"). (Also check `MainAccount` if AssignKey is blank — confirm which holds 11724 for 11728.)
- "Last price to customer" / GPFlag is NOT the method — Gil says it's just a fetchable number, no rule meaning. DROP that idea.

VERIFY:
  SELECT AssignKey, MainAccount FROM Accounts WHERE AccountKey='11728';   -- expect AssignKey='11724'
  SELECT * FROM SpecialPrices WHERE AccountKey='11724' AND ItemKey='BR11506' AND (Price>0);  -- expect 8.55
RESOLVER (update):
  1. SpecialPrices (Active, Price>0, valid dates, MinQuantity<=qty) for AccountKey IN (customer, customer.AssignKey)  -- central overrides/covers
  2. else list 1 price + Discounts (AccountKey × Items.DiscountCode, PriceListNumber=1)
  3. else base price
  Re-run your 657-line backtest with the central-account lookup — this should push the match rate well above 57%. Report the new %.

DOCUMENT TYPE: Gil is entering a FUTURE order via the app for customer 10 now; we'll pull its DocumentID to confirm future=6 vs 11 empirically. HOLD the committed-milestone until (a) pricing re-verified with central account and (b) doc type confirmed.


## 2026-10-01 (reply 7) — writeOrder reviewed (approved); pricing = likely "last price to customer"

Reviewed bridge/writeOrder.js — faithful to the recipe: doc 11/6 by orderKind, Status 0 / DocNumber 0 / flat Tree=0, M1001/M1002 at price 0, schema-aware fitRow, Hebrew errors, dry-run default + commit-guard on account 10. Approved. Great work.

PRICING — your GPFlag lead is the answer, I think:
- GPFlag 50/51 on the unexplained lines almost certainly = Hashavshevet's **"מחיר אחרון ללקוח" (last price charged to this customer for this item)** — a general Hashavshevet setting. It fits 11728 paying a flat 8.55 since 2024.
- VERIFY (reproducible, no sa needed): the last PRODUCED StockMoves.Price for (AccountKey=11728, ItemKey=BR11506) before each order = 8.55?
  e.g. SELECT TOP 5 sm.Price, s.ValueDate FROM StockMoves sm JOIN Stock s ON s.ID=sm.StockID
       WHERE sm.ItemKey='BR11506' AND s.AccountKey='11728' AND s.DocNumber>0 ORDER BY s.ValueDate DESC;
- If it matches, add a resolver tier. Priority (confirm with Gil): SpecialPrices(Price>0) -> **last price to customer** -> list1+Discounts -> base. Mark priceSource accordingly. This closes the ~42% WITHOUT sa/proc.
- The sa one-time proc check is still worth doing if Gil is willing (to use Hashavshevet's exact fetch), but last-price likely suffices. I'm asking Gil to confirm the setting.

FUTURE = doc 6: confirmed by Gil's instruction (picking=11, future=6). Note you found the site never wrote doc 6 — writing it is new/intended for our app; I'm double-checking with Gil. PrintStyle: leave 1 for now (staff pick the print form) unless Gil wants a specific one.

MILESTONE (one COMMIT test on account 10): I'm asking Gil for the go-ahead now. Hold COMMIT until he confirms. After it's verified in app+Hashavshevet, void it with a counter-document (not SQL delete).

Minor/cosmetic: contract uses `perBundle` (SuFID 6); your code uses `perPack` for it — align the name when convenient (no functional issue).


## 2026-09-30 (reply 6) — Gil's answers: pricing is a Hashavshevet PROC; order type; shipping

**PRICING — resolved, and it's IN Hashavshevet (not Digitrade/MySQL):**
Gil: the site computes the net price using Hashavshevet's OWN price mechanism and plants it in the temp doc only for display. At production, the Hashavshevet user runs "שליפת מחירים" (price fetch) and Hashavshevet finalizes the price per its scheme. So:
- The ~42% net prices you couldn't reproduce from raw tables are the output of **Hashavshevet's price-fetch stored procedure** (the same one production uses) — NOT MySQL. Your hand-rolled rule only reproduced 57% because the real logic lives in the proc.
- ACTION: find and call the price-fetch proc instead of reconstructing. Look for it:
    SELECT name FROM sys.procedures WHERE name LIKE '%rice%' OR name LIKE '%GetPrice%';
    SELECT name FROM sys.procedures ORDER BY name;   -- scan for the price/שליפת-מחירים proc
  The `GetPrice` TABLE is its output buffer; the proc likely takes (StationID/AccountKey/ItemKey/Quantity/DocumentID) and fills GetPrice. Reproduce the call the site makes; verify it returns 8.55 for 11728/BR11506.
- The price we write is display-only; production re-fetches and finalizes. So don't block writeOrder on this — plant the proc's price (or your 57% rule as fallback) and move on.

**ORDER TYPE — picking vs future are DIFFERENT DocumentIDs (per Gil):**
- picking (לליקוט) → "הזמנת סוכן" = DocumentID 11.
- future (עתידי) → "הזמנה" = a DIFFERENT document type.
ACTION: confirm "הזמנה"'s DocumentID in DocumentsDef (SELECT DocumentID, DocName FROM DocumentsDef WHERE DocName LIKE N'%הזמנה%'), and re-check which DocumentID our test order 116994 (customer 10) actually is. Then writeOrder picks DocumentID by orderKind: picking→11, future→<הזמנה id>. (All the sample orders we studied were doc 11 / picking; verify the future id from data.)

**SHIPPING:** M1001/M1002 are written with **price 0** (fetched at 0, updated manually in Hashavshevet). So: always add both, qty as ordered (or 0), Price 0. Confirmed — matches your plan.

Net: pricing unblocked (use the proc), order type = pick DocumentID by orderKind (verify future id), shipping price 0. Proceed with writeOrder.


## 2026-09-30 (reply 5) — answers to your Q1-Q4 + API questions

Great, thorough work. Answers:

- **Q1 (explicit extra fields):** YES — add the explicit header/line fields you listed (copied from a real Status-0 "הזמנת אתר" order like 116993). Explicit + your TRAN column-diff validation is the right approach. Do NOT clone all ~150 columns.
- **Q2 (matrix write shape):** write **FLAT Tree=0 lines of the cell SKU**, matching what the current site actually does (you found ~7 parent+children out of ~1,500 — the exception, not the rule). SERVER-CONTEXT is already corrected to flat. Skip parent/children.
- **Q3 (SuF4):** you're right — SuF4 is inconsistent (0 on many items). Use **ExtraSums SuFID 5 = carton, SuFID 6 = bundle/pack** as authoritative for ordering. I'll update SERVER-CONTEXT to demote SuF4 to legacy.
- **dotenv `#` truncation bug:** yes, drop dotenv — read .env.local literally (NAME=rest-of-line). Good catch. (test-connection.mjs is a throwaway research script; ignore it.)
- **API unit conversion:** correct — web sends `qty` = count of the chosen unit + `unit`; the bridge multiplies by per-carton/per-bundle → Hashavshevet line Quantity in units. Reject bundle if SuFID 6 missing, carton if SuFID 5 missing.
- **HANDOFF vs SERVER-CONTEXT (doc 30/31 vs 11):** SERVER-CONTEXT (11) is authoritative; HANDOFF.md is the older research doc — treat it as superseded.
- **WhSummInv:** agreed it's a doc-line view; Items.Quantity is fine for now; per-warehouse stock via aggregation later.

### Pending on Gil (I'm asking him now):
- **Q4 pricing (the ~42%):** confirmed not in magnum12. I'm asking Gil to get the per-customer price agreements from Digitrade (export) or approve read-only MySQL access. Until then, keep your resolver (SpecialPrices→list1+Discounts) and mark `source` in /price; web can flag "price unverified".
- **orderKind picking vs future** (API Q1): both are DocumentID 11 — asking Gil which field distinguishes לליקוט from עתידי (or if it's purely stock-driven). Until answered, keep orderKind and don't change DocumentID.
- **shipping price** (API Q3): asking Gil if M1001/M1002 carry a price or are always 0.

Everything else is unblocked — proceed with writeOrder (flat lines, explicit fields, dry-run on account 10 + column diff). Nice work.


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
