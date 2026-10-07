import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on every request and protects app routes.
// Agents only: an unauthenticated visitor to a protected page is sent to /login.
const PUBLIC_PREFIXES = ["/login", "/_next", "/favicon", "/api",
  "/manifest.webmanifest", "/sw.js", "/icons"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet)
            response.cookies.set(name, value, options);
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession) validates the token with Supabase.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Role-based page restrictions (never on /api — the bridge proxy etc. are gated at the
  // data layer; redirecting /api/bridge/picking/queue to an HTML page broke the picker screen).
  if (user && !path.startsWith("/api")) {
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = prof?.role;
    // Pickers: picking screens + their notifications only.
    if (role === "picker" && !path.startsWith("/picking") && !path.startsWith("/notifications")) {
      const url = request.nextUrl.clone();
      url.pathname = "/picking"; url.search = "";
      return NextResponse.redirect(url);
    }
    // Agents: no access to the data dashboard (managers/admins only).
    if (role === "agent" && path.startsWith("/data")) {
      const url = request.nextUrl.clone();
      url.pathname = "/"; url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Run on everything except static assets; API/bridge handled by the public list above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
