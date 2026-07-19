import type { HoopConfig } from './data.ts';

/**
 * The playground hoop picker is only a visual fallback. A source `hoop` directive is checked by
 * the engine against its own shape and sewable field, so applying this circular fallback check as
 * well would produce contradictory warnings.
 */
export function getFallbackHoopFitWarning(
  maxRadius: number | null,
  selectedHoop: HoopConfig,
  hasSourceHoop: boolean,
): string | null {
  if (maxRadius === null || hasSourceHoop) return null;

  const safeRadius = Math.min(selectedHoop.widthMM, selectedHoop.heightMM) / 2 - 3;
  if (maxRadius <= safeRadius) return null;

  return `design reaches ${(maxRadius * 2).toFixed(0)} mm — outside the ${selectedHoop.label}`;
}
