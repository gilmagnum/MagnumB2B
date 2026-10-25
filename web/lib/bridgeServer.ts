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

// Thrown on an HTTP error. `definitive` = the bridge gave a conclusive client-error status
// (4xx) → the write did NOT happen, safe to revert. Otherwise (network/5xx/timeout) the
// outcome is UNKNOWN and must not be auto-released.
export class BridgeError extends Error {
  status: number;
  definitive: boolean;
  constructor(status: number, body: string) {
    super(`bridge ${status}: ${body}`.slice(0, 500));
    this.status = status;
    this.definitive = status >= 400 && status < 500;
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
