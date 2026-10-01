# Deploying the bridge (server) — steps for Gil

The bridge listens on `http://127.0.0.1:8787` only. Nothing is opened in the firewall/NAT:
the Cloudflare Tunnel makes an **outbound** connection and Cloudflare forwards the public hostname to it.

Run both scripts in **PowerShell as Administrator** (the Claude session can't: no elevation, and
they need your Cloudflare login and the claudeapp password).

## 1. Bridge as a background service under `claudeapp`
```powershell
powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\install-service.ps1
```
- Asks for the `claudeapp` password (stored by Task Scheduler only).
- Grants `claudeapp`: read/execute on `C:\MagnumB2B\repo`, write on `repo\logs`, and makes `.env.local`
  readable only by Administrators, SYSTEM and `claudeapp`.
- Registers the scheduled task **"MagnumB2B Bridge"**: at boot, runs whether anyone is logged on, restarts every
  minute on failure, log in `repo\logs\bridge.log`.
- If registration fails with a logon-rights error: on a domain controller `claudeapp` needs
  **"Log on as a batch job"** (Group Policy Management → Default Domain Controllers Policy → Computer Configuration →
  Policies → Windows Settings → Security Settings → Local Policies → User Rights Assignment), then `gpupdate /force`.
- DB access is via the SQL logins in `.env.local` (magnum_ro / magnumapp), not via the Windows user.

## 2. Cloudflare Tunnel (public HTTPS hostname)
1. Cloudflare dashboard (**your** account that holds the domain) → **Zero Trust → Networks → Tunnels →
   Create a tunnel → Cloudflared**, name it `magnum-bridge`.
2. Copy the install **token** shown on the "Install connector" page (the long string after `service install`).
3. On the server:
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\install-tunnel.ps1 -Token <token>
   ```
4. Back in the dashboard → the tunnel → **Public Hostname → Add**: subdomain `bridge`, domain `<your domain>`,
   service **HTTP** `127.0.0.1:8787`.
5. Test: `https://bridge.<your domain>/health` → `{"ok":true}`.

Optional extra layer: **Zero Trust → Access → Applications** → self-hosted app on `bridge.<domain>`
with a **Service Token** policy; Vercel then also sends `CF-Access-Client-Id` / `CF-Access-Client-Secret`.

## 3. Web app (Vercel) env
- `BRIDGE_URL=https://bridge.<your domain>`
- `BRIDGE_TOKEN=<value of BRIDGE_TOKEN from the server .env.local>`

## 4. Supabase catalog sync
Add to the server `.env.local`:
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
SYNC_INTERVAL_MIN=30
```
Then restart the task (`Restart` in Task Scheduler, or `npm start` by hand) — it syncs at start and every 30 min.
Manual: `npm run sync` (or `--dry-run`), or `POST /sync` with the bearer token.
