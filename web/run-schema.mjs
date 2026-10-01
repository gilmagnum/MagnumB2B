// One-off migration runner: applies supabase/schema.sql (+ seed) to the project
// named by SUPABASE_DB_URL in web/.env.local. Run: node run-schema.mjs [--seed]
import { readFileSync } from "node:fs";
import pg from "pg";

function envValue(name) {
  const txt = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
  const line = txt.split(/\r?\n/).find((l) => l.startsWith(name + "="));
  return line ? line.slice(name.length + 1).trim() : "";
}

const conn = envValue("SUPABASE_DB_URL");
if (!conn) { console.error("SUPABASE_DB_URL missing in web/.env.local"); process.exit(1); }

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const seed = process.argv.includes("--seed")
  ? readFileSync(new URL("../supabase/seed-items.sql", import.meta.url), "utf8")
  : null;

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const who = await client.query("select current_database() db, current_user usr");
  console.log("connected:", who.rows[0]);
  await client.query(schema);
  console.log("schema applied");
  if (seed) { await client.query(seed); console.log("seed applied"); }
  const t = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name",
  );
  console.log("public tables:", t.rows.map((r) => r.table_name).join(", "));
  const c = await client.query("select count(*)::int n from items");
  console.log("items rows:", c.rows[0].n);
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
