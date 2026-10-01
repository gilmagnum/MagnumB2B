// One-off: add fast-search indexes (pg_trgm) + an item_seq column for "newest first".
import { readFileSync } from "node:fs";
import pg from "pg";

const t = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
const g = (n) => { const l = t.split(/\r?\n/).find((x) => x.startsWith(n + "=")); return l ? l.slice(n.length + 1).trim() : ""; };
const c = new pg.Client({ connectionString: g("SUPABASE_DB_URL"), ssl: { rejectUnauthorized: false } });

const SQL = `
create extension if not exists pg_trgm;

-- fast case-insensitive substring search on name + sku
create index if not exists items_name_trgm on items using gin (item_name gin_trgm_ops);
create index if not exists items_key_trgm  on items using gin (itemkey   gin_trgm_ops);

-- true creation order from Hashavshevet (Items row id), populated by the sync; used for "newest first".
alter table items add column if not exists item_seq bigint;
create index if not exists items_cat_seq on items (category_main, item_seq desc nulls last, itemkey desc);

-- filter helpers
create index if not exists items_brand_idx  on items (brand);
create index if not exists items_season_idx on items (season);
`;

try {
  await c.connect();
  await c.query(SQL);
  console.log("catalog perf migration applied");
} catch (e) { console.error("FAILED:", e.message); process.exitCode = 1; }
finally { await c.end(); }
