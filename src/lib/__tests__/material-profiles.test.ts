import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DEFAULT_MATERIAL_INTENT,
  FABRICS,
  FABRIC_PROFILES,
  NEEDLE_PROFILES,
  STABILIZER_PROFILES,
  THREAD_PROFILES,
  TOPPING_PROFILES,
  run,
} from '../engine.ts';
import type { MaterialIntent } from '../engine.ts';

describe('material profile registries', () => {
  it('keeps the legacy FABRICS construction view compatible', () => {
    expect(
      Object.fromEntries(
        Object.entries(FABRIC_PROFILES).map(([name, profile]) => [name, profile.construction]),
      ),
    ).toEqual(FABRICS);
    expect(Object.keys(FABRIC_PROFILES)).toEqual([
      'woven',
      'knit',
      'stretch',
      'denim',
      'canvas',
      'fleece',
    ]);
  });

  it('publishes generic thread, needle, stabilizer, and topping choices', () => {
    expect(THREAD_PROFILES).toEqual({
      'rayon-40wt': { fiber: 'rayon', weight: 40, widthMM: 0.4 },
      'rayon-60wt': { fiber: 'rayon', weight: 60, widthMM: 0.3 },
      'polyester-40wt': { fiber: 'polyester', weight: 40, widthMM: 0.4 },
      'polyester-60wt': { fiber: 'polyester', weight: 60, widthMM: 0.3 },
    });
    expect(Object.keys(NEEDLE_PROFILES)).toEqual(['60', '65', '70', '75', '80', '90']);
    expect(Object.keys(STABILIZER_PROFILES)).toEqual(['none', 'tearaway', 'cutaway', 'washaway']);
    expect(TOPPING_PROFILES).toEqual({ off: false, on: true });
    expectTypeOf(DEFAULT_MATERIAL_INTENT).toMatchTypeOf<Readonly<MaterialIntent>>();
  });
});

describe('resolved material intent', () => {
  it('exposes explicit defaults when no material command ran', () => {
    expect(run('').material).toEqual(DEFAULT_MATERIAL_INTENT);
  });

  it('resolves all material commands without changing stitches or current coverage', () => {
    const source = 'lock 0 stitchlen 2 fd 10';
    const baseline = run(source);
    const configured = run(`
      fabricgrain 450
      fabricstretch 0.2 0.4
      threadprofile 'rayon-60wt'
      threadwidth 0.35
      needle 75
      stabilizer 'cutaway'
      topping true
      ${source}
    `);

    expect(configured.material).toEqual({
      fabricPreset: 'unspecified',
      grainHeading: 90,
      stretchAlong: 0.2,
      stretchAcross: 0.4,
      threadProfile: 'rayon-60wt',
      threadWidthMM: 0.35,
      needleSize: 75,
      stabilizer: 'cutaway',
      topping: true,
    });
    const withoutLines = (events: typeof configured.events) =>
      events.map((event) => {
        const copy = { ...event };
        delete copy.line;
        return copy;
      });
    expect(withoutLines(configured.events)).toEqual(withoutLines(baseline.events));
    expect(configured.density).toEqual(baseline.density);
  });

  it('applies profile defaults and explicit overrides in source order', () => {
    expect(run("fabricstretch 0.2 0.4 fabric 'knit'").material).toMatchObject({
      fabricPreset: 'knit',
      grainHeading: 0,
      stretchAlong: 0,
      stretchAcross: 0,
    });
    expect(run("fabric 'knit' fabricgrain -90 fabricstretch 0.2 0.4").material).toMatchObject({
      fabricPreset: 'knit',
      grainHeading: 270,
      stretchAlong: 0.2,
      stretchAcross: 0.4,
    });
    expect(run("threadwidth 0.5 threadprofile 'polyester-60wt'").material.threadWidthMM).toBe(0.3);
    expect(run("threadprofile 'polyester-60wt' threadwidth 0.5").material.threadWidthMM).toBe(0.5);
  });

  it('restores material intent through stitchscope and trace sandboxes', () => {
    const scoped = run(`
      fabric 'woven'
      threadprofile 'rayon-40wt'
      stitchscope [
        fabric 'knit'
        threadprofile 'polyester-60wt'
        stabilizer 'cutaway'
        topping 1
      ]
    `);
    expect(scoped.material).toMatchObject({
      fabricPreset: 'woven',
      threadProfile: 'rayon-40wt',
      threadWidthMM: 0.4,
      stabilizer: 'none',
      topping: false,
    });

    const traced = run(`
      let path = trace [
        fabricgrain 90
        threadprofile 'rayon-60wt'
        needle 65
        fd 2
      ]
    `);
    expect(traced.material).toEqual(DEFAULT_MATERIAL_INTENT);
  });

  it('supports clearing advisory needle metadata', () => {
    expect(run('needle 80 needle 0').material).not.toHaveProperty('needleSize');
  });

  it('uses shared did-you-mean diagnostics for unknown profiles', () => {
    expect(() => run("threadprofile 'rayn-40wt'")).toThrow(
      /Unknown thread profile 'rayn-40wt'.*rayon-40wt/,
    );
    expect(() => run("stabilizer 'cutawy'")).toThrow(/Unknown stabilizer 'cutawy'.*cutaway/);
  });

  it('rejects invalid physical metadata values', () => {
    expect(() => run('fabricstretch -0.1 0.2')).toThrow(/fractions from 0 to 1/);
    expect(() => run('threadwidth 0.05')).toThrow(/between 0.1 and 1 mm/);
    expect(() => run('needle 85')).toThrow(/common NM size/);
    expect(() => run('topping 2')).toThrow(/expects 0\/1/);
  });
});
