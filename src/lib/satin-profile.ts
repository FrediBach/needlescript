// ---------- Satin construction settings ----------

import { defineModes } from './mode-registry.ts';

export const SATIN_CAP_MODES = defineModes(['legacy', 'butt', 'taper', 'point', 'round']);
export type SatinCapMode = (typeof SATIN_CAP_MODES)[number];

/** Central physical bounds for satin cap construction controls. */
export const SATIN_CONSTRUCTION_RANGES = Object.freeze({
  capLengthMM: Object.freeze({ min: 0.4, max: 20, default: 2 }),
});

export const SATIN_CONSTRUCTION_MODE_REGISTRIES = {
  satincap: SATIN_CAP_MODES,
} as const;

export interface SatinCapPolicy {
  /** Start and end remain separate internally so a later surface can expose asymmetric caps. */
  readonly start: SatinCapMode;
  readonly end: SatinCapMode;
  readonly lengthMM: number;
}

const smoothstep = (value: number) => {
  const t = Math.min(Math.max(value, 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Scale one side of a topping bite at a physical distance from an open-column tip.
 * `legacy` and `butt` deliberately retain full width. Taper retains a machine-safe
 * terminal bite, point converges to the spine, and round follows a circular easing.
 */
export function satinCapWidthFactor(
  mode: SatinCapMode,
  distanceFromTipMM: number,
  capLengthMM: number,
  fullWidthMM: number,
  minimumStitchMM: number,
): number {
  if (mode === 'legacy' || mode === 'butt') return 1;
  const progress = Math.min(Math.max(distanceFromTipMM / Math.max(capLengthMM, 1e-9), 0), 1);
  if (mode === 'taper') {
    const terminal = Math.min(1, Math.max(0.25, minimumStitchMM / Math.max(fullWidthMM, 1e-9)));
    return terminal + (1 - terminal) * smoothstep(progress);
  }
  if (mode === 'point') return smoothstep(progress);
  // A semicircle's half-width at inward distance d is sqrt(1 - (1-d/r)^2).
  return Math.sqrt(Math.max(0, 1 - (1 - progress) ** 2));
}

/** Physical distance reserved at a cap so underlay cannot protrude past topping. */
export function satinCapUnderlayInset(mode: SatinCapMode, capLengthMM: number): number {
  return mode === 'legacy' || mode === 'butt' ? 0 : capLengthMM;
}
