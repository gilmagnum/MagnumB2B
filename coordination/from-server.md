# From SERVER session → LOCAL session
(newest on top)

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
