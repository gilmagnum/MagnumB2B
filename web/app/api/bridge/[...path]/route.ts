import { NextRequest } from "next/server";
import { supabaseServer } from "../../../../lib/supabase/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

// Server-side proxy to the Hashavshevet bridge. Keeps BRIDGE_TOKEN secret
// (never shipped to the browser). Client calls /api/bridge/<path>; we forward
// to BRIDGE_URL/<path> with the Authorization header.
const BRIDGE_URL = process.env.BRIDGE_URL ?? "";
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN ?? "";

export const dynamic = "force-dynamic";

// Normalize the configured base URL: trim, ensure an https:// scheme, drop a trailing slash.
function baseUrl(): string {
  let u = BRIDGE_URL.trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, "");
}

// The middleware leaves this route public, so the proxy identifies the caller itself:
// only a signed-in user with an app profile may reach the bridge.
type Caller = { id: string; role: string; agentId: number | null };
async function caller(): Promise<Caller | null> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return null;
  const { data: p } = await supabaseAdmin().from("profiles").select("role, agent_id").eq("id", user.id).maybeSingle();
  if (!p) return null;
  return { id: user.id, role: (p.role as string) ?? "", agentId: (p.agent_id as number | null) ?? null };
}

// Route allowlist (default-deny). ":" matches exactly one path segment. Each role gets only the
// routes + methods the app actually uses; managers/superadmin are unrestricted. The agent's list
// views are additionally pinned to their own agent id below.
type Route = { m: string; p: string[] };
const matchesRoute = (r: Route, method: string, segs: string[]) =>
  r.m === method && r.p.length === segs.length && r.p.every((s, i) => s === ":" || s === segs[i]);
const allowed = (routes: Route[], method: string, segs: string[]) => routes.some((r) => matchesRoute(r, method, segs));

const AGENT_ROUTES: Route[] = [
  { m: "GET", p: ["customers"] }, { m: "GET", p: ["customers", ":", "balance"] },
  { m: "GET", p: ["documents"] }, { m: "GET", p: ["documents", ":"] }, { m: "POST", p: ["documents", "status"] },
  { m: "GET", p: ["items", ":"] }, { m: "GET", p: ["stock", ":"] },
  { m: "GET", p: ["price"] }, { m: "POST", p: ["prices"] }, { m: "POST", p: ["orders"] },
];
const PICKER_ROUTES: Route[] = [
  { m: "GET", p: ["picking", "queue"] }, { m: "GET", p: ["documents", ":"] }, { m: "POST", p: ["picking", ":", "finish"] },
];

// Reject traversal/odd segments ("." / ".." / anything with a slash, backslash, control char or an
// encoded one). Done before the allowlist so p0 can't be sidestepped and the bridge can't be reached
// at a different route than the one we authorized.
const safeSeg = (s: string) => !!s && s !== "." && s !== ".." && !/[/\\\u0000-\u001f]/.test(s) && !/%2e%2e|%2f|%5c/i.test(s);

async function forward(req: NextRequest, path: string[]) {
  const me = await caller();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const base = baseUrl();
  if (!base) return Response.json({ error: "BRIDGE_URL not configured" }, { status: 503 });

  const segs = path;
  if (!segs.length || !segs.every(safeSeg)) return Response.json({ error: "bad path" }, { status: 400 });

  // H1 (proxy half): authorize by role on the normalized path (default-deny), then scope agents.
  const method = req.method;
  const isManager = me.role === "admin" || me.role === "superadmin";
  const params = new URLSearchParams(req.nextUrl.search);
  if (!isManager) {
    const routes = me.role === "agent" ? AGENT_ROUTES : me.role === "picker" ? PICKER_ROUTES : [];
    if (!allowed(routes, method, segs)) return Response.json({ error: "forbidden" }, { status: 403 });
    if (me.role === "agent") {
      // An agent only ever sees their own customers/documents — force their agent id, drop any client value.
      if (me.agentId == null) return Response.json({ error: "agent not configured" }, { status: 403 });
      if (segs[0] === "customers" || segs[0] === "documents") params.set("agent", String(me.agentId));
    }
  }
  const qs = params.toString();
  const url = `${base}/${segs.map(encodeURIComponent).join("/")}${qs ? "?" + qs : ""}`;

  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      // Free ngrok shows an interstitial to browsers; this header skips it for our API calls.
      "ngrok-skip-browser-warning": "1",
      // Trusted identity for the bridge's per-customer ownership check (the proxy holds BRIDGE_TOKEN).
      "x-app-role": me.role,
      "x-app-agent": me.agentId != null ? String(me.agentId) : "",
      ...(req.headers.get("content-type") ? { "Content-Type": req.headers.get("content-type") as string } : {}),
    },
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.text();
  try {
    const res = await fetch(url, init);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" } });
  } catch (e) {
    // Log the real reason (bad URL, DNS, TLS, bridge down); keep the bridge URL out of the response.
    console.error("bridge unreachable", url, (e as Error).message);
    return Response.json({ error: "bridge unreachable", detail: (e as Error).message }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
