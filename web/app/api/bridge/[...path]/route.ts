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

// The middleware leaves /api public, so the proxy checks the caller itself:
// only a signed-in user with an app profile may reach the bridge.
async function signedIn(): Promise<boolean> {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabaseAdmin().from("profiles").select("id").eq("id", user.id).maybeSingle();
  return !!profile;
}

async function forward(req: NextRequest, path: string[]) {
  if (!(await signedIn())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const base = baseUrl();
  if (!base) return Response.json({ error: "BRIDGE_URL not configured" }, { status: 503 });
  const url = `${base}/${path.join("/")}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      // Free ngrok shows an interstitial to browsers; this header skips it for our API calls.
      "ngrok-skip-browser-warning": "1",
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
