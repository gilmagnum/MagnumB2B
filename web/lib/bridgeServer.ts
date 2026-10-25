import "server-only";
// Server-side bridge caller for server actions (never imported by client code).
// Mirrors the /api/bridge proxy: injects BRIDGE_TOKEN and a TRUSTED x-app-role/x-app-agent,
// but the caller passes the role explicitly (taken from the verified session), so a money
// write can run entirely on the server — not orchestrated from the browser.
const BRIDGE_URL = process.env.BRIDGE_URL ?? "";
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN ?? "";

function baseUrl(): string {
  let u = BRIDGE_URL.trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, "");
}

// Statuses on which the bridge may give a conclusive "it did NOT happen" answer. Deliberately
// excludes 408/425/429/499 and anything an ngrok/proxy interstitial could return — those are uncertain.
const DEFINITIVE_STATUS = new Set([400, 403, 409, 422]);

// Thrown on an HTTP error. `definitive` is true ONLY when the bridge returned one of the allowed
// client-error statuses AND a machine `code` in its JSON body (STALE / FORBIDDEN / INVALID…): only
// then do we know the write did not happen and may revert. Everything else (5xx, network, timeout,
// a bare 4xx with no code, an HTML interstitial) is UNKNOWN and must not be auto-released.
export class BridgeError extends Error {
  status: number;
  code: string | null;
  definitive: boolean;
  constructor(status: number, body: string) {
    super(`bridge ${status}: ${body}`.slice(0, 500));
    this.status = status;
    // The bridge returns { error: { code, message } }; some older routes return { code } at the top.
    let code: string | null = null;
    try {
      const j = JSON.parse(body);
      const c = j?.error?.code ?? j?.code;
      if (typeof c === "string" && c) code = c;
    } catch { /* non-JSON body → no code */ }
    this.code = code;
    this.definitive = DEFINITIVE_STATUS.has(status) && code !== null;
  }
}

export async function callBridge<T>(
  path: string,
  opts: { method?: string; body?: unknown; role: string; agentId?: number | null; timeoutMs?: number },
): Promise<T> {
  const base = baseUrl();
  if (!base) throw new Error("BRIDGE_URL not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(`${base}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
        "ngrok-skip-browser-warning": "1",
        "x-app-role": opts.role,
        "x-app-agent": opts.agentId != null ? String(opts.agentId) : "",
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new BridgeError(res.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}
