import { describe, expect, it } from 'vitest';
import anisotropicSource from '../../../examples/production/anisotropic-material-compensation.ns?raw';
import travelSource from '../../../examples/production/constrained-travel-plan.ns?raw';
import borderSource from '../../../examples/fills/fill-and-border.ns?raw';
import gradientNSource from '../../../examples/fills/gradientfill-n.ns?raw';
import gradientSource from '../../../examples/fills/gradientfill.ns?raw';
import fleeceSource from '../../../examples/production/knockdown-fleece.ns?raw';
import preflightSource from '../../../examples/production/preflight-issue-sampler.ns?raw';
import capCornerSource from '../../../examples/satin/satin-cap-corner-sampler.ns?raw';
import wideSource from '../../../examples/satin/wide-column-split-sampler.ns?raw';
import { run, toDST, toEXP, toPES } from '../engine.ts';

const PRODUCTION_EXAMPLES = [
  {
    id: 'G02',
    source: gradientSource,
    material: { fabricPreset: 'woven', stabilizer: 'tearaway', needleSize: 75, topping: false },
  },
  {
    id: 'G03',
    source: gradientNSource,
    material: { fabricPreset: 'woven', stabilizer: 'tearaway', needleSize: 75, topping: false },
  },
  {
    id: 'K01',
    source: fleeceSource,
    material: { fabricPreset: 'fleece', stabilizer: 'cutaway', needleSize: 75, topping: true },
  },
  {
    id: 'B01',
    source: borderSource,
    material: { fabricPreset: 'woven', stabilizer: 'tearaway', needleSize: 75, topping: false },
  },
  {
    id: 'C01',
    source: capCornerSource,
    material: { fabricPreset: 'woven', stabilizer: 'tearaway', needleSize: 75, topping: false },
  },
  {
    id: 'W01',
    source: wideSource,
    material: { fabricPreset: 'canvas', stabilizer: 'tearaway', needleSize: 90, topping: false },
  },
  {
    id: 'T01',
    source: travelSource,
    material: { fabricPreset: 'woven', stabilizer: 'tearaway', needleSize: 75, topping: false },
  },
  {
    id: 'A01',
    source: anisotropicSource,
    material: { fabricPreset: 'stretch', stabilizer: 'cutaway', needleSize: 75, topping: false },
  },
] as const;

describe('embroidery example sew-out suite v1', () => {
  it.each(PRODUCTION_EXAMPLES)(
    '$id runs, fits the common hoop, and exports',
    ({ id, source, material }) => {
      const result = run(source);
      const positions = result.events.filter((event) => event.t === 'stitch' || event.t === 'jump');

      expect(result.activeHoop).toMatchObject({
        shape: 'rectangle',
        widthMM: 100,
        heightMM: 100,
      });
      expect(result.material).toMatchObject({
        ...material,
        threadProfile: 'polyester-40wt',
        threadWidthMM: 0.4,
      });
      expect(positions.some((event) => event.t === 'stitch')).toBe(true);
      expect(Math.min(...positions.map((event) => event.x))).toBeGreaterThanOrEqual(-47);
      expect(Math.max(...positions.map((event) => event.x))).toBeLessThanOrEqual(47);
      expect(Math.min(...positions.map((event) => event.y))).toBeGreaterThanOrEqual(-47);
      expect(Math.max(...positions.map((event) => event.y))).toBeLessThanOrEqual(47);
      expect(result.preflight?.issues.some(({ severity }) => severity === 'error')).toBe(false);
      expect(toDST(result.events, `${id}-EXAMPLE-V1`).byteLength).toBeGreaterThan(512);
      expect(
        toPES(result.events, `${id}-EXAMPLE-V1`, result.colorTable).byteLength,
      ).toBeGreaterThan(512);
      expect(toEXP(result.events, `${id}-EXAMPLE-V1`).byteLength).toBeGreaterThan(0);
    },
  );

  it('keeps the gradient candidate fields density-neutral across their color groups', () => {
    const twoColor = run(gradientSource);
    const multiColor = run(gradientNSource);

    expect(new Set(twoColor.events.filter(({ t }) => t === 'stitch').map(({ c }) => c)).size).toBe(
      2,
    );
    expect(
      new Set(multiColor.events.filter(({ t }) => t === 'stitch').map(({ c }) => c)).size,
    ).toBe(3);
  });

  it('retains topping-aware fleece intent and all three patch stages', () => {
    const result = run(fleeceSource);

    expect(result.material.topping).toBe(true);
    expect(new Set(result.events.filter(({ t }) => t === 'stitch').map(({ c }) => c)).size).toBe(3);
    expect(
      result.warnings.filter(
        (warning) => warning.includes('layers of thread') || warning.includes('same hole'),
      ),
    ).toEqual([]);
  });

  it('demonstrates split columns and constrained planning explicitly', () => {
    const wide = run(wideSource);
    const planned = run(travelSource);

    expect(wide.warnings.filter((warning) => warning.includes('satin split into'))).toHaveLength(4);
    expect(planned.plan?.planMode).toBe('reversing-nearest');
    expect(planned.plan?.groups).toHaveLength(1);
    expect(planned.plan?.groups?.[0]).toMatchObject({ eligibleRuns: 8 });
    expect(planned.plan?.groups?.[0].movedRuns).toBeGreaterThan(0);
    expect(planned.plan?.groups?.[0].travelAfterMm).toBeLessThan(
      planned.plan?.groups?.[0].travelBeforeMm ?? 0,
    );
  });

  it('leaves directional compensation active in the anisotropic comparison', () => {
    expect(run(anisotropicSource).compensation).toMatchObject({
      appliedMode: 'directional-satin',
    });
  });

  it('keeps the preflight teaching sampler visibly unsafe and out of the export suite', () => {
    const result = run(preflightSource);
    const codes = result.preflight?.issues.map(({ code }) => code) ?? [];

    expect(result.preflight?.mode).toBe('warn');
    expect(result.preflight?.summary.error).toBeGreaterThan(0);
    expect(codes).toEqual(
      expect.arrayContaining(['hoop.unreachable', 'satin.snag-risk', 'stitch.short-cluster']),
    );
  });
});
