import { describe, expect, it } from 'vitest';
import {
  compensationForHeading,
  compensationTensor,
  resolveDirectionalCompensation,
  run,
} from '../engine.ts';
import type { CompensationTensor, MaterialIntent } from '../engine.ts';

function expectTensorClose(actual: CompensationTensor, expected: CompensationTensor): void {
  expect(actual.xx).toBeCloseTo(expected.xx, 12);
  expect(actual.xy).toBeCloseTo(expected.xy, 12);
  expect(actual.yy).toBeCloseTo(expected.yy, 12);
}

const MATERIAL: MaterialIntent = {
  fabricPreset: 'woven',
  grainHeading: 20,
  stretchAlong: 0.2,
  stretchAcross: 0.4,
  threadProfile: 'polyester-40wt',
  threadWidthMM: 0.4,
  stabilizer: 'none',
  topping: false,
};

describe('directional compensation tensor', () => {
  it('projects grain-aligned values onto along/across stitch axes', () => {
    const tensor = compensationTensor(0, 0.2, 0.6);

    expect(tensor).toEqual({ xx: 0.6, xy: 0, yy: 0.2 });
    expect(compensationForHeading(tensor, 0)).toEqual({
      heading: 0,
      alongStitchMM: 0.2,
      acrossStitchMM: 0.6,
    });
    expect(compensationForHeading(tensor, 90)).toEqual({
      heading: 90,
      alongStitchMM: 0.6,
      acrossStitchMM: 0.2,
    });
    const diagonal = compensationForHeading(tensor, 45);
    expect(diagonal.alongStitchMM).toBeCloseTo(0.4, 12);
    expect(diagonal.acrossStitchMM).toBeCloseTo(0.4, 12);
  });

  it('preserves projections when grain and construction rotate together', () => {
    const base = compensationTensor(17, 0.15, 0.65);
    const rotated = compensationTensor(140, 0.15, 0.65);
    const baseComponents = compensationForHeading(base, 73);
    const rotatedComponents = compensationForHeading(rotated, 196);

    expect(rotatedComponents.alongStitchMM).toBeCloseTo(baseComponents.alongStitchMM, 12);
    expect(rotatedComponents.acrossStitchMM).toBeCloseTo(baseComponents.acrossStitchMM, 12);
  });

  it('keeps the same hoop tensor when the grain axes and values are swapped', () => {
    const original = compensationTensor(20, 0.15, 0.65);
    const swapped = compensationTensor(110, 0.65, 0.15);

    expectTensorClose(swapped, original);
  });

  it('retains signed contraction for synthetic push recommendations', () => {
    const push = compensationTensor(0, -0.1, -0.3);

    expect(compensationForHeading(push, 0)).toEqual({
      heading: 0,
      alongStitchMM: -0.1,
      acrossStitchMM: -0.3,
    });
  });
});

describe('material directional compensation resolution', () => {
  it('redistributes preset pull by declared stretch while preserving mean magnitude', () => {
    const resolved = resolveDirectionalCompensation({
      ...MATERIAL,
      fabricPreset: 'knit',
    });

    expect(resolved.pullAlongGrainMM).toBeCloseTo(6 / 13, 12);
    expect(resolved.pullAcrossGrainMM).toBeCloseTo(7 / 13, 12);
    expect((resolved.pullAlongGrainMM + resolved.pullAcrossGrainMM) / 2).toBeCloseTo(0.5, 12);
    expect(resolved.pushAlongGrainMM).toBe(0);
    expect(resolved.pushAcrossGrainMM).toBe(0);
  });

  it('returns a neutral recommendation without a fabric preset', () => {
    const resolved = resolveDirectionalCompensation({
      ...MATERIAL,
      fabricPreset: 'unspecified',
    });

    expect(resolved.pullAlongGrainMM).toBe(0);
    expect(resolved.pullAcrossGrainMM).toBe(0);
    expect(resolved.pullTensor).toEqual({ xx: 0, xy: 0, yy: 0 });
  });

  it('adds preview comparisons without changing event geometry', () => {
    const baseline = run("fabric 'knit' pullcomp 0.1 lock 0 stitchlen 2 fd 10");
    const directional = run(
      "fabric 'knit' fabricgrain 30 fabricstretch 0.2 0.4 pullcomp 0.1 lock 0 stitchlen 2 fd 10",
    );

    expect(directional.events).toEqual(baseline.events);
    expect(directional.compensation.appliedMode).toBe('legacy-scalar');
    expect(directional.compensation.currentScalarPullMM).toBe(0.1);
    expect(
      directional.compensation.samples.map(({ axis, heading }) => ({ axis, heading })),
    ).toEqual([
      { axis: 'grain', heading: 30 },
      { axis: 'cross-grain', heading: 120 },
    ]);
    expect(directional.compensation.samples[0].scalarPullMM).toBe(0.1);
    expect(directional.compensation.samples[0].pull.alongStitchMM).toBeCloseTo(6 / 13, 12);
    expect(directional.compensation.samples[0].pull.acrossStitchMM).toBeCloseTo(7 / 13, 12);
    expect(directional.compensation.samples[0].pullDeltaAlongStitchMM).toBeCloseTo(
      6 / 13 - 0.1,
      12,
    );
    expect(directional.compensation.samples[0].pullDeltaAcrossStitchMM).toBeCloseTo(
      7 / 13 - 0.1,
      12,
    );
    expect(resolveDirectionalCompensation(directional.material)).toEqual(
      directional.compensation.resolved,
    );
  });
});
