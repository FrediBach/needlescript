import { describe, expect, it } from 'vitest';
import { apply, mRotate } from '../affine.ts';
import { run } from '../engine.ts';
import type { RunResult, StitchEvent } from '../engine.ts';

const DIRECTIONAL =
  "compensation 'directional' fabric 'woven' fabricstretch 0 1 underlay 'off' lock 0";

function topping(result: RunResult): StitchEvent[] {
  return result.events.filter((event) => event.t === 'stitch' && event.u !== 1);
}

function span(result: RunResult, axis: 'x' | 'y'): number {
  const values = topping(result).map((event) => event[axis]);
  return Math.max(...values) - Math.min(...values);
}

describe('opt-in directional satin compensation', () => {
  it('keeps legacy scalar output byte-identical by default and explicitly', () => {
    const source = "fabric 'knit' pullcomp 0.3 underlay 'off' lock 0 satin 3 fd 10 satin 0";

    expect(run(`compensation 'legacy' ${source}`).events).toEqual(run(source).events);
  });

  it('changes spine widening with its physical heading relative to grain', () => {
    const alongGrain = run(`${DIRECTIONAL} satin 3 fd 10 satin 0`);
    const crossGrain = run(`${DIRECTIONAL} seth 90 satin 3 fd 10 satin 0`);

    expect(span(alongGrain, 'x')).toBeCloseTo(3 + 4 / 15, 12);
    expect(span(crossGrain, 'y')).toBeCloseTo(3 + 2 / 15, 12);
    expect(span(alongGrain, 'x')).toBeGreaterThan(span(crossGrain, 'y'));
  });

  it('uses explicit pullcomp as the anisotropic mean and respects source-order reset', () => {
    const explicit = run(
      "compensation 'directional' fabric 'woven' fabricstretch 0 1 pullcomp 0.6 underlay 'off' lock 0 satin 3 fd 10 satin 0",
    );
    const reset = run(
      "compensation 'directional' pullcomp 0.6 fabric 'woven' fabricstretch 0 1 underlay 'off' lock 0 satin 3 fd 10 satin 0",
    );

    expect(span(explicit, 'x')).toBeCloseTo(3.8, 12);
    expect(explicit.compensation.pullMagnitudeSource).toBe('explicit-pullcomp');
    expect(explicit.compensation.resolved.pullAlongGrainMM).toBeCloseTo(0.4, 12);
    expect(explicit.compensation.resolved.pullAcrossGrainMM).toBeCloseTo(0.8, 12);
    expect(span(reset, 'x')).toBeCloseTo(3 + 4 / 15, 12);
    expect(reset.compensation.pullMagnitudeSource).toBe('fabric-profile');
  });

  it('supports rail-pair satin with the same heading projection', () => {
    const alongGrain = run(`${DIRECTIONAL} satinbetween([[-1,0],[-1,10]], [[1,0],[1,10]])`);
    const crossGrain = run(`${DIRECTIONAL} satinbetween([[0,-1],[10,-1]], [[0,1],[10,1]])`);

    expect(span(alongGrain, 'x')).toBeCloseTo(2 + 4 / 15, 12);
    expect(span(crossGrain, 'y')).toBeCloseTo(2 + 2 / 15, 12);
  });

  it('applies the same directional widening to programmable spine satin', () => {
    const builtin = topping(run(`${DIRECTIONAL} satin 4 fd 10 satin 0`));
    const programmable = topping(
      run(
        `def column(t, s, i, u) [ return [0.4, 2, 2, 0, 0] ] ${DIRECTIONAL} satin @column fd 10 satin 0`,
      ),
    );

    expect(programmable).toHaveLength(builtin.length);
    for (let index = 0; index < builtin.length; index++) {
      expect(programmable[index].x).toBeCloseTo(builtin[index].x, 12);
      expect(programmable[index].y).toBeCloseTo(builtin[index].y, 12);
    }
  });

  it('preserves geometry modulo rotation when design and grain rotate together', () => {
    const base = topping(run(`${DIRECTIONAL} satin 3 fd 8 satin 0`));
    const angle = 37;
    const rotated = topping(
      run(
        "compensation 'directional' fabric 'woven' fabricstretch 0 1 fabricgrain 37 underlay 'off' lock 0 rotate 37 [ satin 3 fd 8 satin 0 ]",
      ),
    );
    const matrix = mRotate(angle);

    expect(rotated).toHaveLength(base.length);
    for (let index = 0; index < base.length; index++) {
      const expected = apply(matrix, base[index].x, base[index].y);
      expect(rotated[index].x).toBeCloseTo(expected[0], 10);
      expect(rotated[index].y).toBeCloseTo(expected[1], 10);
    }
  });

  it('applies physical compensation after a non-uniform width transform', () => {
    const transformed = run(`${DIRECTIONAL} scalexy 2 3 [ satin 3 fd 10 satin 0 ]`);

    expect(span(transformed, 'x')).toBeCloseTo(6 + 4 / 15, 12);
  });

  it('lets compensated widths drive split, snag, and stitch-ceiling diagnostics', () => {
    const split = run(`${DIRECTIONAL} satinwide 'split' satinmaxwidth 4 satin 3.8 fd 10 satin 0`);
    const noSplit = run(
      `${DIRECTIONAL} seth 90 satinwide 'split' satinmaxwidth 4 satin 3.8 fd 10 satin 0`,
    );
    expect(split.warnings.some((warning) => warning.includes('split into'))).toBe(true);
    expect(noSplit.warnings.some((warning) => warning.includes('split into'))).toBe(false);

    const snag = run(`${DIRECTIONAL} satinbetween([[-3.9,0],[-3.9,10]], [[3.9,0],[3.9,10]])`);
    const noSnag = run(`${DIRECTIONAL} satinbetween([[0,-3.9],[10,-3.9]], [[0,3.9],[10,3.9]])`);
    expect(snag.warnings.some((warning) => warning.includes('tend to snag'))).toBe(true);
    expect(noSnag.warnings.some((warning) => warning.includes('tend to snag'))).toBe(false);

    const ceiling = run(
      `${DIRECTIONAL} satinbetween([[-5.925,0],[-5.925,10]], [[5.925,0],[5.925,10]])`,
    );
    const noCeiling = run(
      `${DIRECTIONAL} satinbetween([[0,-5.925],[10,-5.925]], [[0,5.925],[10,5.925]])`,
    );
    expect(ceiling.warnings.some((warning) => warning.includes('12 mm stitch ceiling'))).toBe(true);
    expect(noCeiling.warnings.some((warning) => warning.includes('12 mm stitch ceiling'))).toBe(
      false,
    );
  });

  it('keeps fill on scalar compensation and scopes the mode', () => {
    const fillSource =
      'pullcomp 0.4 fillspacing 2 stitchlen 2 beginfill repeat 4 [ fd 8 rt 90 ] endfill';
    expect(run(`compensation 'directional' ${fillSource}`).events).toEqual(
      run(`compensation 'legacy' ${fillSource}`).events,
    );

    const scoped = run("stitchscope [ compensation 'directional' ]");
    expect(scoped.compensation.appliedMode).toBe('legacy-scalar');
    expect(() => run("compensation 'directionl'")).toThrow(
      /Unknown compensation 'directionl'.*directional/,
    );
  });
});
