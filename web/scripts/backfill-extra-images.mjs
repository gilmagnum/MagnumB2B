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
const SP = "C:/Users/user/AppData/Local/Temp/claude/F--Gil-Claude-OrderPickAndFullfill/00aea0f9-dc67-4642-be90-d011413503cd/scratchpad";

const LIMIT = Number(process.env.LIMIT || 0);   // 0 = all shown
const CONC = Number(process.env.CONC || 8);
const MAXN = 9;                                  // probe _1.._9, stop at first gap

async function allShown() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SB}/rest/v1/items?shown_on_site=eq.true&select=itemkey,image_url,images&order=item_seq.desc.nullslast`,
      { headers: { ...h, Range: `${from}-${from + 999}` } });
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

// A real image at the old site: 200 + image content-type + > 1KB.
async function fetchOld(name) {
  for (const ext of ["jpg", "png"]) {
    const url = `${OLD}/${encodeURIComponent(name)}.${ext}`;
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

async function put(path, img) {
  const up = await fetch(`${SB}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    method: "POST", headers: { ...h, "Content-Type": img.contentType, "x-upsert": "true" }, body: img.buf,
  });
  if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
  return `${SB}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}?v=${Date.now()}`;
}

const items = await allShown();
console.log(`shown items: ${items.length}${LIMIT ? ` (capped)` : ""}  conc=${CONC}`);
let done = 0, withExtras = 0, extrasAdded = 0, failed = 0;
const failedList = [], detail = [];

async function worker(slice) {
  for (const it of slice) {
    try {
      const extras = [];
      let misses = 0;
      for (let n = 1; n <= MAXN; n++) {
        const img = await fetchOld(`${it.itemkey}_${n}`);
        if (!img) { if (++misses >= 1) break; else continue; }
        const url = await put(`${it.itemkey}_${n}.${img.ext}`, img);
        extras.push(url);
      }
      if (extras.length) {
        const base = (arr) => (arr ?? []).map((u) => u.split("?")[0]);
        const existing = it.images ?? (it.image_url ? [it.image_url] : []);
        const have = new Set(base(existing));
        const merged = [...existing];
        for (const u of extras) if (!have.has(u.split("?")[0])) merged.push(u);
        const patch = { images: merged };
        if (!it.image_url) patch.image_url = extras[0]; // no main yet → use first extra
        const r = await fetch(`${SB}/rest/v1/items?itemkey=eq.${encodeURIComponent(it.itemkey)}`, {
          method: "PATCH", headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(`patch ${r.status} ${await r.text()}`);
        withExtras++; extrasAdded += extras.length; detail.push(`${it.itemkey}\t+${extras.length}`);
      }
    } catch (e) { failed++; failedList.push(`${it.itemkey}: ${e.message}`); }
    if (++done % 100 === 0) console.log(`  ${done}/${items.length}  itemsWithExtras=${withExtras} extrasAdded=${extrasAdded} failed=${failed}`);
  }
}
const slices = Array.from({ length: CONC }, () => []);
items.forEach((it, i) => slices[i % CONC].push(it));
await Promise.all(slices.map(worker));

console.log(`DONE  itemsWithExtras=${withExtras}  extrasAdded=${extrasAdded}  failed=${failed}`);
writeFileSync(`${SP}/extra-images-added.txt`, detail.join("\n"));
writeFileSync(`${SP}/extra-images-failed.txt`, failedList.join("\n"));
if (failedList.length) console.log("first failures:\n" + failedList.slice(0, 10).join("\n"));
