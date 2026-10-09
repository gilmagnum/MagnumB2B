// H4 (reply 100): the real size list of each ruler, for validating ordered sizes. The sizes live in
// Supabase `rulers` (code, sizes - filled from the old site / admin), not in Hashavshevet, so this
// reads Supabase (no SQL Server load), cached 30 min. Map<code, Set<size>>; null when unavailable.
const TTL = 30 * 60_000;
let cache;
let pending;

const norm = (s) => String(s ?? '').trim();

function parseSizes(sizes) {
  if (Array.isArray(sizes)) return sizes.map(norm).filter(Boolean);
  if (typeof sizes === 'string') {
    try {
      const parsed = JSON.parse(sizes);
      if (Array.isArray(parsed)) return parsed.map(norm).filter(Boolean);
    } catch {}
    return sizes.split(',').map(norm).filter(Boolean);
  }
  return [];
}

async function load() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const keyValue = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !keyValue) return null;
  const res = await fetch(`${url}/rest/v1/rulers?select=code,sizes`, {
    headers: { apikey: keyValue, Authorization: `Bearer ${keyValue}` },
  });
  if (!res.ok) throw new Error(`Supabase rulers: ${res.status}`);
  const map = new Map();
  for (const r of await res.json()) map.set(norm(r.code), new Set(parseSizes(r.sizes)));
  return map;
}

export async function getRulerSizes() {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  pending ??= load()
    .then((map) => {
      if (map) cache = { at: Date.now(), map };
      return map ?? cache?.map ?? null;
    })
    .catch((err) => {
      console.error(`ruler sizes load failed: ${err.message}`);
      return cache?.map ?? null;
    })
    .finally(() => (pending = undefined));
  return pending;
}

// Pure check (exported for tests): null = OK, else the reason.
export function checkSize(rulerCode, size, rulers) {
  if (!size) return null;
  if (!rulerCode) return 'לפריט אין סרגל מידות';
  const sizes = rulers?.get(norm(rulerCode));
  if (!sizes || !sizes.size) return null; // ruler sizes not filled in yet - can't validate, allow
  return sizes.has(norm(size)) ? null : `המידה ${size} אינה בסרגל ${rulerCode}`;
}
