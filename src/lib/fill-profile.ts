// ---------- Fill construction settings ----------

import { defineModes } from './mode-registry.ts';

export const FILL_STAGGER_MODES = defineModes(['legacy', 'brick', 'progressive', 'random']);
export type FillStaggerMode = (typeof FILL_STAGGER_MODES)[number];

/** Central physical bounds for fill construction controls. */
export const FILL_CONSTRUCTION_RANGES = Object.freeze({
  insetMM: Object.freeze({ min: 0, max: 10 }),
  staggerAmount: Object.freeze({ min: 0, max: 1, default: 0.65 }),
});

export const FILL_CONSTRUCTION_MODE_REGISTRIES = {
  fillstagger: FILL_STAGGER_MODES,
} as const;

const wrapPhase = (phase: number) => ((phase % 1) + 1) % 1;

/**
 * Return a drawless 0..1 phase offset for one physical fill row. Coordinates
 * are quantized to Clipper's micrometre grid before hashing so insignificant
 * floating-point noise cannot reshuffle random staggering.
 */
export function fillStaggerOffset(
  mode: FillStaggerMode,
  row: number,
  amount: number,
  x = 0,
  y = 0,
): number {
  if (mode === 'legacy' || amount === 0) return 0;
  if (mode === 'brick') return row % 2 === 0 ? 0 : wrapPhase(amount);
  if (mode === 'progressive') {
    const cycle = [0, 1, 3, 2] as const;
    return wrapPhase(cycle[((row % cycle.length) + cycle.length) % cycle.length] * amount);
  }

  let hash = 0x811c9dc5;
  const mix = (value: number) => {
    hash ^= value | 0;
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 16;
  };
  mix(row);
  mix(Math.round(x * 1000));
  mix(Math.round(y * 1000));
  return ((hash >>> 0) / 0x100000000) * amount;
}
