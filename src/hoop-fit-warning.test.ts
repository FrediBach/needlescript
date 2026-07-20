import { describe, expect, it } from 'vitest';
import source from '../examples/production/physical-sewout-validation-v1.ns?raw';
import { DEFAULT_HOOP } from './data.ts';
import { getFallbackHoopFitWarning } from './hoop-fit-warning.ts';
import { designStats, run } from './lib/engine.ts';

describe('playground fallback hoop warning', () => {
  it('does not compare a source-selected rectangular hoop with the UI fallback', () => {
    const result = run(source);
    const stats = designStats(result.events);

    expect(stats.maxRadius * 2).toBeCloseTo(177, 0);
    expect(result.activeHoop).toMatchObject({
      shape: 'rectangle',
      widthMM: 130,
      heightMM: 180,
    });
    expect(
      getFallbackHoopFitWarning(stats.maxRadius, DEFAULT_HOOP, result.activeHoop !== undefined),
    ).toBeNull();
  });

  it('retains the reactive warning when no source hoop overrides the UI fallback', () => {
    expect(getFallbackHoopFitWarning(50, DEFAULT_HOOP, false)).toBe(
      'design reaches 100 mm — outside the 100 mm round',
    );
    expect(getFallbackHoopFitWarning(47, DEFAULT_HOOP, false)).toBeNull();
  });
});
