// Backfill product images for ALL items (shown or not) that have no image yet, pulling from the old
// site. Skips matrix CELLS (item_variants children) — their image lives on the parent model.
// Same source/validation/upload as backfill-images.mjs, just a wider candidate set.
import { readFileSync, writeFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "product-images";
const OLD = "https://magnumtexb2b.biz/src/img/products";
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const LIMIT = Number(process.env.LIMIT || 0);
const CONC = Number(process.env.CONC || 10);
const OUT = "C:/Users/user/AppData/Local/Temp/claude/F--Gil-Claude-OrderPickAndFullfill/00aea0f9-dc67-4642-be90-d011413503cd/scratchpad";

async function page(path) {
  const out = [];
  for (let f = 0; ; f += 1000) {
    const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { ...h, Range: `${f}-${f + 999}` } });
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// Real image: 200 + image content-type + > 1KB (the old site's soft-404 is a ~3.9KB HTML page).
async function fetchOld(itemkey) {
  for (const ext of ["jpg", "png"]) {
    const url = `${OLD}/${encodeURIComponent(itemkey)}.${ext}`;
    let res;
    try { res = await fetch(url, { signal: AbortSignal.timeout(20000) }); } catch { continue; }
    if (!res.ok) continue;
    const ct = res.headers.get("content-type") || "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (!/^image\//i.test(ct) || buf.length < 1024) continue;
    return { buf, ext, contentType: ct.split(";")[0] };
  }
  return null;
}

async function uploadAndSet(itemkey, img) {
  const path = `${itemkey}.${img.ext}`;
  const up = await fetch(`${SB}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    method: "POST", headers: { ...h, "Content-Type": img.contentType, "x-upsert": "true" }, body: img.buf,
  });
  if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
  const publicUrl = `${SB}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}?v=${Date.now()}`;
  const cur = await (await fetch(`${SB}/rest/v1/items?itemkey=eq.${encodeURIComponent(itemkey)}&select=images`, { headers: h })).json();
  const rest = ((cur?.[0]?.images) ?? []).filter((u) => u && u.split("?")[0] !== publicUrl.split("?")[0]);
  const patch = await fetch(`${SB}/rest/v1/items?itemkey=eq.${encodeURIComponent(itemkey)}`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ image_url: publicUrl, images: [publicUrl, ...rest] }),
  });
  if (!patch.ok) throw new Error(`patch ${patch.status} ${await patch.text()}`);
}

const variants = new Set((await page("item_variants?select=itemkey")).map((x) => x.itemkey));
let keys = (await page("items?select=itemkey&image_url=is.null&order=item_seq.desc.nullslast"))
  .map((x) => x.itemkey).filter((k) => !variants.has(k));
if (LIMIT) keys = keys.slice(0, LIMIT);

console.log(`candidates (non-cell, no image): ${keys.length}  conc=${CONC}`);
let done = 0, found = 0, notfound = 0, failed = 0;
const notFoundList = [], failedList = [];

async function worker(slice) {
  for (const k of slice) {
    try {
      const img = await fetchOld(k);
      if (!img) { notfound++; notFoundList.push(k); }
      else { await uploadAndSet(k, img); found++; }
    } catch (e) { failed++; failedList.push(`${k}: ${e.message}`); }
    if (++done % 200 === 0) console.log(`  ${done}/${keys.length}  found=${found} notfound=${notfound} failed=${failed}`);
  }
}
const slices = Array.from({ length: CONC }, () => []);
keys.forEach((k, i) => slices[i % CONC].push(k));
await Promise.all(slices.map(worker));

console.log(`DONE  found=${found}  notfound=${notfound}  failed=${failed}`);
writeFileSync(`${OUT}/backfill-all-notfound.txt`, notFoundList.join("\n"));
writeFileSync(`${OUT}/backfill-all-failed.txt`, failedList.join("\n"));
if (failedList.length) console.log("first failures:\n" + failedList.slice(0, 10).join("\n"));
