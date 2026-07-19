import { describe, expect, it } from 'vitest';
import { FABRICS } from '../embroidery-registry.ts';
import {
  lowerFabricUnderlay,
  lowerLegacyFillUnderlay,
  lowerLegacySatinUnderlay,
  resolveSatinUnderlayProfile,
  resolveFillUnderlayProfile,
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

  it('resolves explicit custom order and absolute parameters without fabric doubling', () => {
    const profile = resolveSatinUnderlayProfile(
      'auto',
      {
        columnWidthMM: 5,
        runningStitchLengthMM: 2.5,
        doubled: true,
        generator: 'spine',
      },
      {
        passKinds: ['edge', 'center', 'zigzag'],
        runningStitchLengthMM: 2.8,
        edgeInsetMM: 0.6,
        zigzagSpacingMM: 1.7,
      },
    );

    expect(profile).toMatchObject({ source: 'custom', explicitPassOrder: true });
    expect(profile.passes).toMatchObject([
      { kind: 'edge', runningStitchLengthMM: 2.8, inset: { unit: 'mm', value: 0.6 } },
      { kind: 'center', runningStitchLengthMM: 2.8 },
      { kind: 'zigzag', spacingMM: 1.7, returnRunStitchLengthMM: 2.8 },
    ]);
    expect(validateSatinUnderlayProfile(profile)).toEqual([]);
  });

  it('layers numeric customization over legacy pass selection', () => {
    const profile = resolveSatinUnderlayProfile(
      'edge',
      {
        columnWidthMM: 5,
        runningStitchLengthMM: 2.5,
        doubled: false,
        generator: 'rail-pair',
      },
      { runningStitchLengthMM: 3.2 },
    );

    expect(profile.passes).toMatchObject([
      {
        kind: 'edge',
        runningStitchLengthMM: 3.2,
        inset: { unit: 'column-width-ratio', value: 0.3 },
      },
    ]);
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

  it('resolves exact custom order and fill parameters without legacy area gates', () => {
    const profile = resolveFillUnderlayProfile(
      'auto',
      {
        regionAreaMM2: 10,
        toppingRowSpacingMM: 0.4,
        doubled: true,
        generator: 'direction-field',
      },
      {
        passKinds: ['edge', 'tatami', 'edge'],
        stitchLengthMM: 3,
        insetMM: 0.8,
        rowSpacingMM: 2.2,
        relativeAngleDegrees: 35,
      },
    );

    expect(profile).toMatchObject({ source: 'custom', explicitPassOrder: true });
    expect(profile.passes).toMatchObject([
      { kind: 'edge', stitchLengthMM: 3, insetMM: 0.8, minimumRegionAreaMM2: 0 },
      {
        kind: 'tatami',
        stitchLengthMM: 3,
        insetMM: 0.8,
        rowSpacingMM: 2.2,
        angle: { kind: 'relative-to-topping', degrees: 35 },
        directionFieldBehavior: 'rotate-field',
      },
      { kind: 'edge' },
    ]);
    expect(validateFillUnderlayProfile(profile)).toEqual([]);
  });

  it('layers numeric settings over the selected legacy fill passes', () => {
    const profile = resolveFillUnderlayProfile(
      'auto',
      { regionAreaMM2: 200, toppingRowSpacingMM: 0.4, doubled: false },
      { rowSpacingMM: 2.5 },
    );

    expect(profile.passes.map((pass) => pass.kind)).toEqual(['edge', 'tatami']);
    expect(profile.passes[0]).toMatchObject({ insetMM: 0.5, stitchLengthMM: 2.5 });
    expect(profile.passes[1]).toMatchObject({ rowSpacingMM: 2.5 });
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
