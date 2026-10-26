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

const LIMIT = Number(process.env.LIMIT || 0);      // 0 = all
const CONC = Number(process.env.CONC || 8);

// Pull all shown items missing an image (paged).
async function missing() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SB}/rest/v1/items?shown_on_site=eq.true&image_url=is.null&select=itemkey&order=item_seq.desc.nullslast`,
      { headers: { ...h, Range: `${from}-${from + 999}` } });
    const rows = await r.json();
    out.push(...rows.map((x) => x.itemkey));
    if (rows.length < 1000) break;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

// Fetch a real image from the old site: 200 + image content-type + > 1KB (404 page is ~162B).
async function fetchOld(itemkey) {
  for (const ext of ["jpg", "png"]) {
    const url = `${OLD}/${encodeURIComponent(itemkey)}.${ext}`;
    let res;
    try { res = await fetch(url, { signal: AbortSignal.timeout(25000) }); } catch { continue; }
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
  // merge into images[] (prepend, dedupe by base url)
  const cur = await (await fetch(`${SB}/rest/v1/items?itemkey=eq.${encodeURIComponent(itemkey)}&select=images`, { headers: h })).json();
  const rest = ((cur?.[0]?.images) ?? []).filter((u) => u && u.split("?")[0] !== publicUrl.split("?")[0]);
  const patch = await fetch(`${SB}/rest/v1/items?itemkey=eq.${encodeURIComponent(itemkey)}`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ image_url: publicUrl, images: [publicUrl, ...rest] }),
  });
  if (!patch.ok) throw new Error(`patch ${patch.status} ${await patch.text()}`);
  return publicUrl;
}

const keys = await missing();
console.log(`missing images: ${keys.length}${LIMIT ? ` (capped at ${LIMIT})` : ""}  conc=${CONC}`);
let done = 0, found = 0, notfound = 0, failed = 0;
const notFoundList = [], failedList = [];

async function worker(slice) {
  for (const k of slice) {
    try {
      const img = await fetchOld(k);
      if (!img) { notfound++; notFoundList.push(k); }
      else { await uploadAndSet(k, img); found++; }
    } catch (e) { failed++; failedList.push(`${k}: ${e.message}`); }
    if (++done % 50 === 0) console.log(`  ${done}/${keys.length}  found=${found} notfound=${notfound} failed=${failed}`);
  }
}
// split into CONC slices
const slices = Array.from({ length: CONC }, () => []);
keys.forEach((k, i) => slices[i % CONC].push(k));
await Promise.all(slices.map(worker));

console.log(`DONE  found=${found}  notfound=${notfound}  failed=${failed}`);
writeFileSync("C:/Users/user/AppData/Local/Temp/claude/F--Gil-Claude-OrderPickAndFullfill/00aea0f9-dc67-4642-be90-d011413503cd/scratchpad/backfill-notfound.txt", notFoundList.join("\n"));
writeFileSync("C:/Users/user/AppData/Local/Temp/claude/F--Gil-Claude-OrderPickAndFullfill/00aea0f9-dc67-4642-be90-d011413503cd/scratchpad/backfill-failed.txt", failedList.join("\n"));
if (failedList.length) console.log("first failures:\n" + failedList.slice(0, 10).join("\n"));
