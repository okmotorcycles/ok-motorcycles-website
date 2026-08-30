// Deterministic RNG. The daily generator must produce the *same* puzzle for a
// given date every time it runs — a cron that fires twice, a rerun after a
// failed deploy, or a local `--date` preview all have to agree — so nothing may
// touch Math.random().

// FNV-1a over a string -> 32-bit seed.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — small, fast, good enough for level layout, and stable across
// node versions (plain 32-bit integer math, no float internals).
export function makeRng(seed) {
  let a = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n);            // 0..n-1
  rng.range = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.shuffle = (arr) => {
    const a2 = [...arr];
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  // Weighted pick: items are [value, weight] pairs.
  rng.weighted = (pairs) => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let x = rng() * total;
    for (const [v, w] of pairs) { x -= w; if (x < 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  return rng;
}
