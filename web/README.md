# MagnumB2B — web (Next.js)

B2B wholesale ordering front-end. Deployed on Vercel (Root Directory = `web`).

- Catalog + category pages read from Supabase (synced from Hashavshevet by the bridge).
- Orders are submitted to the Hashavshevet bridge (`NEXT_PUBLIC_BRIDGE_URL`).

Env (see `.env.example`): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_BRIDGE_URL, BRIDGE_TOKEN.
