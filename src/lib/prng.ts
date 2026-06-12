// ---------- Seeded PRNG (mulberry32) ----------

export function makeRNG(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The fork convention (RFC-3 §7): variable-cost generators draw exactly
 * one value from the main stream and do all internal work on a child RNG.
 * Inserting a scatter(…) shifts downstream randomness by exactly one draw.
 */
export function fork(rng: () => number): () => number {
  return makeRNG(Math.floor(rng() * 4294967296));
}

/**
 * Seeded normal via Box-Muller — exactly 2 draws, no caching (caching the
 * second value would make draw counts history-dependent; RFC-3 §4.1).
 */
export function gauss(rng: () => number, mu: number, sigma: number): number {
  const u1 = rng();
  const u2 = rng();
  // 1 - u1 ∈ (0, 1]: keeps log() finite for u1 = 0.
  return mu + sigma * Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
}

// ---------- Seeded value noise ----------
// Smooth deterministic noise in [0, 1). Same seed → same field.

function hash2(seed: number, ix: number, iy: number): number {
  let h = (seed >>> 0) ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function makeNoise(seed: number): (x: number, y?: number) => number {
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y = 0) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const u = fade(x - ix), v = fade(y - iy);
    const a = hash2(seed, ix, iy), b = hash2(seed, ix + 1, iy);
    const c = hash2(seed, ix, iy + 1), d = hash2(seed, ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
