import { NextRequest } from "next/server";

// Server-side proxy to the Hashavshevet bridge. Keeps BRIDGE_TOKEN secret
// (never shipped to the browser). Client calls /api/bridge/<path>; we forward
// to BRIDGE_URL/<path> with the Authorization header.
const BRIDGE_URL = process.env.BRIDGE_URL ?? "";
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN ?? "";

export const dynamic = "force-dynamic";

async function forward(req: NextRequest, path: string[]) {
  if (!BRIDGE_URL) return Response.json({ error: "BRIDGE_URL not configured" }, { status: 503 });
  const search = req.nextUrl.search;
  const url = `${BRIDGE_URL.replace(/\/$/, "")}/${path.join("/")}${search}`;
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
  const res = await fetch(url, init);
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
