// A value safe to use as an <a href>: a same-origin path ("/catalog") or an absolute https URL.
// Never javascript:, data:, http:, or a protocol-relative "//host".
export function isSafeHref(u: unknown): u is string {
  if (typeof u !== "string") return false;
  const s = u.trim();
  if (!s) return false;
  if (/^\/(?![/\\])/.test(s)) return true; // same-origin absolute path
  try { return new URL(s).protocol === "https:"; } catch { return false; }
}

// An absolute https URL only (for images/backgrounds) — else undefined.
export function httpsOrUndef(u: unknown): string | undefined {
  if (typeof u !== "string") return undefined;
  const s = u.trim();
  try { return new URL(s).protocol === "https:" ? s : undefined; } catch { return undefined; }
}
