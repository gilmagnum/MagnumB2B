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

// Load existing itemkeys once, to match and report coverage.
const { data: itemRows, error: itemErr } = await sb.from("items").select("itemkey");
if (itemErr) { console.error("could not read items:", itemErr.message); process.exit(1); }
const itemkeys = itemRows.map((r) => r.itemkey);
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

const files = readdirSync(dir).filter((f) => IMG.has(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile());
console.log(`${files.length} image files in ${dir}; ${itemkeys.length} catalog items; match=${match}${dry ? " [DRY RUN]" : ""}`);

let uploaded = 0, matched = 0, unmatched = [];
for (const f of files) {
  const ext = extname(f).toLowerCase();
  const sku = basename(f, extname(f)).trim();

  const targets = match === "prefix"
    ? itemkeys.filter((k) => k === sku || k.startsWith(sku + "_") || k.startsWith(sku))
    : (keySet.has(sku) ? [sku] : []);
  if (targets.length === 0) { unmatched.push(sku); continue; }

  const path = `${sku}${ext}`;
  let publicUrl;
  if (dry) {
    publicUrl = `${url}/storage/v1/object/public/${bucket}/${path}`;
  } else {
    const body = readFileSync(join(dir, f));
    const up = await sb.storage.from(bucket).upload(path, body, { contentType: TYPE[ext] ?? "image/jpeg", upsert: true });
    if (up.error) { console.error(`upload ${path}:`, up.error.message); continue; }
    publicUrl = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    uploaded++;
  }

  if (!dry) {
    const { error } = await sb.from("items").update({ image_url: publicUrl }).in("itemkey", targets);
    if (error) { console.error(`update ${sku}:`, error.message); continue; }
  }
  matched += targets.length;
  if ((uploaded % 50) === 0 && !dry) console.log(`  …${uploaded} uploaded`);
}

console.log(`\nDone. uploaded=${uploaded} items updated=${matched} unmatched files=${unmatched.length}`);
if (unmatched.length) console.log("unmatched (first 20):", unmatched.slice(0, 20).join(", "));
