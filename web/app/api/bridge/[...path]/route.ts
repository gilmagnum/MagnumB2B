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

async function forward(req: NextRequest, path: string[]) {
  const me = await caller();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const base = baseUrl();
  if (!base) return Response.json({ error: "BRIDGE_URL not configured" }, { status: 503 });

  // H1 (proxy half): agent scoping is enforced on the server, never trusted from the browser.
  const isManager = me.role === "admin" || me.role === "superadmin";
  const p0 = path[0] ?? "";
  const params = new URLSearchParams(req.nextUrl.search);
  // Sync/admin routes and cross-agent ("scope=all") views are managers only.
  if (!isManager && (p0 === "sync" || p0 === "admin")) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!isManager && params.get("scope") === "all") params.delete("scope");
  if (me.role === "agent") {
    // An agent only ever sees their own customers/documents/stats — force their agent id, drop any client value.
    if (me.agentId == null) return Response.json({ error: "agent not configured" }, { status: 403 });
    if (p0 === "customers" || p0 === "documents" || p0 === "stats") params.set("agent", String(me.agentId));
  }
  const qs = params.toString();
  const url = `${base}/${path.join("/")}${qs ? "?" + qs : ""}`;

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
