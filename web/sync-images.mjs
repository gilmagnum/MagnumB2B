// Upload product images from a local folder to Supabase Storage and set
// items.image_url by SKU. Server-side (service_role). NOT for the browser.
//
//   node sync-images.mjs --dir "C:\\path\\to\\images" [--bucket product-images]
//        [--match exact|prefix] [--dry]
//
// Matching: a file "WF34000.jpg" => SKU "WF34000".
//   --match exact  : set image_url only on items where itemkey = SKU
//   --match prefix : also set on items whose itemkey starts with "SKU" or "SKU_"
//                    (use when images are per-model and items are per-color)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function env(name) {
  const txt = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
  const line = txt.split(/\r?\n/).find((l) => l.startsWith(name + "="));
  return line ? line.slice(name.length + 1).trim() : "";
}
function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const dir = arg("dir");
const bucket = arg("bucket", "product-images");
const match = arg("match", "exact");
const dry = !!arg("dry", false);
if (!dir || dir === true) { console.error('usage: node sync-images.mjs --dir "<folder>" [--bucket product-images] [--match exact|prefix] [--dry]'); process.exit(1); }

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) { console.error("missing SUPABASE_URL / SERVICE_ROLE_KEY in web/.env.local"); process.exit(1); }
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const TYPE = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

// Load ALL itemkeys (paged — PostgREST caps a select at 1000 rows).
const itemkeys = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("items").select("itemkey").range(from, from + 999);
  if (error) { console.error("could not read items:", error.message); process.exit(1); }
  itemkeys.push(...data.map((r) => r.itemkey));
  if (data.length < 1000) break;
}
const keySet = new Set(itemkeys);

// Ensure the bucket exists (public read).
if (!dry) {
  const { data: buckets } = await sb.storage.listBuckets();
  if (!buckets?.some((b) => b.name === bucket)) {
    const { error } = await sb.storage.createBucket(bucket, { public: true });
    if (error && !/already exists/i.test(error.message)) { console.error("createBucket:", error.message); process.exit(1); }
    console.log(`bucket '${bucket}' created (public)`);
  }
}

// Sort so a plain name and "_1" come before "_2"/"_3" (angles of the same item).
const files = readdirSync(dir)
  .filter((f) => IMG.has(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile())
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
console.log(`${files.length} image files in ${dir}; ${itemkeys.length} catalog items; match=${match}${dry ? " [DRY RUN]" : ""}`);

const resolve = (sku) => match === "prefix"
  ? itemkeys.filter((k) => k === sku || k.startsWith(sku + "_"))
  : (keySet.has(sku) ? [sku] : []);

// Group all files (angles) under their base SKU, e.g. WF34000, WF34000_2, WF34000_3 -> WF34000.
const groups = new Map();   // baseSku -> [files sorted]
const unmatched = [];
for (const f of files) {
  const rawSku = basename(f, extname(f)).trim();
  let base = rawSku;
  if (resolve(base).length === 0) {
    const stripped = rawSku.replace(/_\d+$/, "");
    if (stripped !== rawSku && resolve(stripped).length) base = stripped;
  }
  if (resolve(base).length === 0) { unmatched.push(rawSku); continue; }
  (groups.get(base) ?? groups.set(base, []).get(base)).push(f);
}

let uploaded = 0, itemsUpdated = 0;
for (const [base, groupFiles] of groups) {
  const targets = resolve(base);
  const urls = [];
  for (const f of groupFiles) {                 // first file = primary, rest = secondary angles
    const ext = extname(f).toLowerCase();
    const path = `${basename(f, extname(f)).trim()}${ext}`;
    if (dry) {
      urls.push(`${url}/storage/v1/object/public/${bucket}/${path}`);
    } else {
      const up = await sb.storage.from(bucket).upload(path, readFileSync(join(dir, f)), { contentType: TYPE[ext] ?? "image/jpeg", upsert: true });
      if (up.error) { console.error(`upload ${path}:`, up.error.message); continue; }
      urls.push(sb.storage.from(bucket).getPublicUrl(path).data.publicUrl);
      uploaded++;
      if ((uploaded % 50) === 0) console.log(`  …${uploaded} uploaded`);
    }
  }
  if (!urls.length) continue;
  if (!dry) {
    const { error } = await sb.from("items").update({ image_url: urls[0], images: urls }).in("itemkey", targets);
    if (error) { console.error(`update ${base}:`, error.message); continue; }
  }
  itemsUpdated += targets.length;
}

console.log(`\nDone. ${groups.size} products (${uploaded} files uploaded), items updated=${itemsUpdated}, unmatched files=${unmatched.length}`);
if (unmatched.length) console.log("unmatched (first 20):", unmatched.slice(0, 20).join(", "));
