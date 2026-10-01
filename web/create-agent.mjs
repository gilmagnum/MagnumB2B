// Admin-only user provisioning (no self-signup). Server-side: uses the SECRET
// service_role key from web/.env.local — never run this in the browser.
//   node create-agent.mjs <email> <password> <agent_id> "<full name>"   (role=agent)
//   node create-agent.mjs <email> <password> admin     "<full name>"    (role=admin, no agent_id)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function env(name) {
  const txt = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
  const line = txt.split(/\r?\n/).find((l) => l.startsWith(name + "="));
  return line ? line.slice(name.length + 1).trim() : "";
}

const [email, password, agentIdRaw, fullName] = process.argv.slice(2);
if (!email || !password || !agentIdRaw) {
  console.error('usage: node create-agent.mjs <email> <password> <agent_id|admin> "<full name>"');
  process.exit(1);
}
const isAdmin = agentIdRaw.toLowerCase() === "admin";
const agent_id = isAdmin ? null : Number(agentIdRaw);
const role = isAdmin ? "admin" : "agent";
if (!isAdmin && !Number.isInteger(agent_id)) { console.error("agent_id must be an integer, or 'admin'"); process.exit(1); }

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) { console.error("missing SUPABASE_URL / SERVICE_ROLE_KEY in web/.env.local"); process.exit(1); }

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 1) Create the auth user (email pre-confirmed, so they can log in immediately).
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (cErr) { console.error("createUser failed:", cErr.message); process.exit(1); }
const id = created.user.id;

// 2) Upsert the matching profile row (agent -> Hashavshevet Accounts.Agent; admin -> no agent_id).
const { error: pErr } = await admin.from("profiles").upsert(
  { id, role, agent_id, full_name: fullName || email },
  { onConflict: "id" },
);
if (pErr) { console.error("profile upsert failed:", pErr.message); process.exit(1); }

console.log(`OK — ${role} created: ${email}${isAdmin ? "" : ` (agent_id=${agent_id})`} (id=${id})`);
