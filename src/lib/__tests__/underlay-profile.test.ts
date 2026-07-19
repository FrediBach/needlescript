import { describe, expect, it } from 'vitest';
import { FABRICS } from '../embroidery-registry.ts';
import {
  lowerFabricUnderlay,
  lowerLegacyFillUnderlay,
  lowerLegacySatinUnderlay,
  validateFillUnderlayProfile,
  validateSatinUnderlayProfile,
} from '../underlay-profile.ts';
import type {
  ResolvedFillUnderlayProfile,
  ResolvedSatinUnderlayProfile,
} from '../underlay-profile.ts';

describe('legacy satin underlay profile lowering', () => {
  it.each([
    ['off', 5, []],
    ['center', 5, ['center']],
    ['edge', 5, ['edge']],
    ['zigzag', 5, ['zigzag']],
    ['auto', 1.49, []],
    ['auto', 1.5, ['center']],
    ['auto', 3.99, ['center']],
    ['auto', 4, ['zigzag']],
  ] as const)('lowers %s at %s mm to ordered %j passes', (mode, width, expected) => {
    const profile = lowerLegacySatinUnderlay(mode, {
      columnWidthMM: width,
      runningStitchLengthMM: 2.5,
      doubled: false,
    });

    expect(profile.passes.map((pass) => pass.kind)).toEqual(expected);
    expect(validateSatinUnderlayProfile(profile)).toEqual([]);
  });

  it('makes doubled-pass compatibility behavior explicit per generator', () => {
    const lower = (generator: 'spine' | 'rail-pair' | 'programmable') =>
      lowerLegacySatinUnderlay('center', {
        columnWidthMM: 3,
        runningStitchLengthMM: 50,
        doubled: true,
        generator,
      });

    expect(lower('spine').passes.map((pass) => pass.kind)).toEqual(['center', 'zigzag']);
    expect(lower('rail-pair').passes.map((pass) => pass.kind)).toEqual(['center']);
    expect(lower('programmable').passes.map((pass) => pass.kind)).toEqual(['center']);
    expect(lower('spine').passes[0]).toMatchObject({ runningStitchLengthMM: 3 });
  });

  it('retains the historical spine and rail-pair edge inset ratios', () => {
    const context = { columnWidthMM: 5, runningStitchLengthMM: 2.5, doubled: false };
    const spine = lowerLegacySatinUnderlay('edge', { ...context, generator: 'spine' });
    const rails = lowerLegacySatinUnderlay('edge', { ...context, generator: 'rail-pair' });

    expect(spine.passes[0]).toMatchObject({ inset: { value: 0.2 } });
    expect(rails.passes[0]).toMatchObject({ inset: { value: 0.3 } });
  });
});

describe('legacy fill underlay profile lowering', () => {
  it.each([
    ['off', 200, []],
    ['edge', 29.99, []],
    ['edge', 30, ['edge']],
    ['tatami', 10, ['tatami']],
    ['auto', 100, ['tatami']],
    ['auto', 100.01, ['edge', 'tatami']],
  ] as const)('lowers %s at %s mm² to ordered %j passes', (mode, area, expected) => {
    const profile = lowerLegacyFillUnderlay(mode, {
      regionAreaMM2: area,
      toppingRowSpacingMM: 2,
      doubled: false,
    });

    expect(profile.passes.map((pass) => pass.kind)).toEqual(expected);
    expect(validateFillUnderlayProfile(profile)).toEqual([]);
  });

  it('models doubled scanline and legacy direction-field behavior separately', () => {
    const context = { regionAreaMM2: 200, toppingRowSpacingMM: 0.4, doubled: true };
    const scanline = lowerLegacyFillUnderlay('tatami', {
      ...context,
      generator: 'scanline',
    });
    const directional = lowerLegacyFillUnderlay('tatami', {
      ...context,
      generator: 'direction-field',
    });

    expect(scanline.passes).toMatchObject([
      { kind: 'tatami', rowSpacingMM: 1.6, angle: { degrees: 0 } },
      { kind: 'tatami', rowSpacingMM: 1.6, angle: { degrees: 90 } },
    ]);
    expect(directional.passes).toMatchObject([
      {
        kind: 'tatami',
        angle: { degrees: 90 },
        directionFieldBehavior: 'rotate-field',
      },
    ]);
  });
});

describe('fabric profile lowering and pure validation', () => {
  it('resolves every fabric preset to valid satin and fill profiles', () => {
    for (const preset of Object.values(FABRICS)) {
      const profiles = lowerFabricUnderlay(
        preset,
        { columnWidthMM: 5, runningStitchLengthMM: 2.5 },
        { regionAreaMM2: 200, toppingRowSpacingMM: 0.4 },
      );
      expect(validateSatinUnderlayProfile(profiles.satin)).toEqual([]);
      expect(validateFillUnderlayProfile(profiles.fill)).toEqual([]);
    }
  });

  it('reports all invalid fields without mutating the profile', () => {
    const satin = lowerLegacySatinUnderlay('zigzag', {
      columnWidthMM: 5,
      runningStitchLengthMM: 2.5,
      doubled: false,
    });
    const invalidSatin = {
      ...satin,
      passes: [{ ...satin.passes[0], widthRatio: 2, spacingMM: Number.NaN }],
    } as unknown as ResolvedSatinUnderlayProfile;
    const fill = lowerLegacyFillUnderlay('tatami', {
      regionAreaMM2: 50,
      toppingRowSpacingMM: 0.4,
      doubled: false,
    });
    const invalidFill = {
      ...fill,
      passes: [{ ...fill.passes[0], insetMM: -1, stitchLengthMM: 99 }],
    } as unknown as ResolvedFillUnderlayProfile;

    expect(validateSatinUnderlayProfile(invalidSatin).map((issue) => issue.path)).toEqual([
      'passes[0].widthRatio',
      'passes[0].spacingMM',
    ]);
    expect(validateFillUnderlayProfile(invalidFill).map((issue) => issue.path)).toEqual([
      'passes[0].insetMM',
      'passes[0].stitchLengthMM',
    ]);
    expect(Number.isNaN((invalidSatin.passes[0] as { spacingMM: number }).spacingMM)).toBe(true);
  });
});
