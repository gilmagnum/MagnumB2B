// Map a Hebrew/English color label (as it comes from Hashavshevet, often with a trailing code,
// e.g. "נייבי 104", "שחור -101", "LT.PINK 608") to a hex swatch. Returns null when the label
// isn't a recognizable color (sizes like XL/16, codes like 3110-003, "דיגום/פסים", …) so the UI
// can simply skip the swatch. Keyed by substring; longer/more specific keys are tried first.
const COLORS: [string, string][] = [
  // specific multi-word first
  ["אפור כהה", "#595959"], ["ורוד פוקסיה", "#d81b8c"], ["ורוד בייבי", "#f7b6d2"], ["ורוד בהיר", "#f5a9c0"],
  ["ירוק עמוק", "#14532d"], ["ירוק מנטה", "#8fd9b6"], ["ירוק ליים", "#9acd32"], ["ירוק פיסטוק", "#93c572"],
  ["ירוק בנטון", "#0f9b8e"], ["צהוב בננה", "#ffe066"], ["סגול ויולט", "#7c4dff"], ["סגול לילה", "#6a5acd"],
  ["כחול נייבי", "#1f2a52"], ["כחול בהיר", "#7db9e8"], ["כחול-בהיר", "#7db9e8"], ["כחול אפור", "#6b7a8f"],
  ["כחול-אפור", "#6b7a8f"], ["תכלת בייבי", "#bfe3f2"], ["רויאל מלנג'", "#4169e1"], ["פוקסיה", "#d81b8c"],
  ["פוקסי", "#d81b8c"], ["לבנדר", "#b39ddb"], ["אפרסק", "#ffcba4"], ["ויולט", "#8a2be2"], ["איריס", "#5a4fcf"],
  ["לאטה", "#c8a27a"], ["מרינגו", "#4c5866"], ["פלדה", "#71797e"],
  // single-word Hebrew bases
  ["לבנדר", "#b39ddb"], ["לבן", "#ffffff"], ["שחור", "#1a1a1a"], ["שמנת", "#fff5e1"], ["מלנג'", "#b8bcc2"],
  ["מלאנג", "#b8bcc2"], ["אדום", "#d32f2f"], ["נייבי", "#1f2a52"], ["טורקיז", "#17b3b3"], ["פטרול", "#1f6f78"],
  ["תכלת", "#87ceeb"], ["כחול", "#2563eb"], ["צהוב", "#f2c200"], ["ירוק", "#2e9e4f"], ["זית", "#808000"],
  ["סגול", "#7e57c2"], ["ורוד", "#ec4899"], ["כתום", "#f57c00"], ["אפור", "#9aa0a6"], ["חום", "#795548"],
  ["בז'", "#d2b48c"], ["ויזון", "#b9a089"], ["רויאל", "#4169e1"], ["ג'ינס", "#4a6fa5"], ["זהב", "#d4af37"],
  ["כסף", "#c0c0c0"], ["גוף", "#e8c9a0"], ["טבעי", "#e8dcc8"], ["אבן", "#b0a999"],
  ["מסטיק", "#f6a6c0"], ["אפרסק", "#ffcba4"],
  // English
  ["lt.powder", "#ead1dc"], ["lt.petrol", "#5aa1a1"], ["lt.pink", "#f5a9c0"], ["old pink", "#c08081"],
  ["merigold", "#f2c200"], ["marigold", "#f2c200"], ["melange", "#b8bcc2"], ["petrol", "#1f6f78"],
  ["mocha", "#6f4e37"], ["latte", "#c8a27a"], ["lila", "#b39ddb"], ["navy", "#1f2a52"], ["black", "#1a1a1a"],
  ["white", "#ffffff"], ["pink", "#ec4899"], ["gum", "#f6a6c0"], ["petrol ", "#1f6f78"],
];

// Resolve a label to a hex. Manager overrides (name -> hex, from settings) are checked first,
// longest key wins, then the built-in map. Both match by substring so a base name like "נייבי"
// also colors "נייבי 104".
export function colorHex(label: string | null | undefined, overrides?: Record<string, string> | null): string | null {
  if (!label) return null;
  const s = label.toLowerCase().replace(/[`’]/g, "'").trim();
  if (overrides) {
    const ov = Object.entries(overrides)
      .map(([k, v]) => [k.toLowerCase().replace(/[`’]/g, "'").trim(), v] as [string, string])
      .filter(([k, v]) => k && /^#[0-9a-f]{6}$/i.test(v))
      .sort((a, b) => b[0].length - a[0].length);
    for (const [kw, hex] of ov) if (s.includes(kw)) return hex;
  }
  for (const [kw, hex] of COLORS) if (s.includes(kw)) return hex;
  return null;
}

// Pick black or white text for legibility on a given background hex (relative luminance).
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#000";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111" : "#fff";
}
