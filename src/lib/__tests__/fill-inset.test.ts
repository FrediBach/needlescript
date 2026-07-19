import { describe, expect, it } from 'vitest';
import { run } from '../interpreter.ts';
import type { StitchEvent } from '../types.ts';

const square = (size = 20) => `beginfill repeat 4 [ fd ${size} rt 90 ] endfill`;
const stableSettings = "lock 0 autotrim 0 maxdensity 0 fillunderlay 'off' fillspacing 1 filllen 2 ";
const stitches = (source: string) =>
  run(source).events.filter(
    (event): event is StitchEvent & { t: 'stitch' } => event.t === 'stitch',
  );

const dumbbell = `beginfill
  setxy 0 10 setxy 8 10 setxy 8 6 setxy 12 6 setxy 12 10
  setxy 20 10 setxy 20 0 setxy 12 0 setxy 12 4 setxy 8 4 setxy 8 0 setxy 0 0
endfill`;

describe('fillinset', () => {
  it('keeps the zero setting byte-identical to the legacy path', () => {
    const baseline = run(`${stableSettings}${square()}`);
    const explicitZero = run(`${stableSettings}fillinset 0 ${square()}`);

    expect(explicitZero.events).toEqual(baseline.events);
    expect(explicitZero.warnings).toEqual(baseline.warnings);
  });

  it('reserves physical space inside the outer boundary', () => {
    const result = stitches(`${stableSettings}fillinset 2 ${square()}`);

    expect(result.length).toBeGreaterThan(0);
    expect(Math.min(...result.map(({ x }) => x))).toBeGreaterThanOrEqual(1.99);
    expect(Math.max(...result.map(({ x }) => x))).toBeLessThanOrEqual(18.01);
    expect(Math.min(...result.map(({ y }) => y))).toBeGreaterThanOrEqual(1.99);
    expect(Math.max(...result.map(({ y }) => y))).toBeLessThanOrEqual(18.01);
  });

  it('keeps the inset in physical hoop millimetres under affine transforms', () => {
    const transformed = run(`${stableSettings}fillinset 1 scale 2 [ ${square(10)} ]`).events;
    const explicit = run(`${stableSettings}fillinset 1 ${square(20)}`).events;

    expect(transformed).toEqual(explicit);
  });

  it('expands hole exclusions into the filled material', () => {
    const result = stitches(
      `${stableSettings}fillinset 2
       beginfill
         repeat 4 [ fd 20 rt 90 ]
         up setxy 8 8 down repeat 4 [ fd 4 rt 90 ]
       endfill`,
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result.every(({ x, y }) => !(x > 6.01 && x < 13.99 && y > 8.01 && y < 11.99))).toBe(
      true,
    );
  });

  it('splits a concave neck without sewing connectors across the fabric gap', () => {
    const result = run(`${stableSettings}fillspacing 2 fillinset 1.1 ${dumbbell}`);
    const topping = result.events.filter((event) => event.t === 'stitch' && event.u !== 1);

    expect(topping.some(({ x }) => x < 8)).toBe(true);
    expect(topping.some(({ x }) => x > 12)).toBe(true);
    expect(topping.every(({ x }) => x <= 8 || x >= 12)).toBe(true);
    expect(result.events.some((event) => event.t === 'jump' && event.x > 12)).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringMatching(/split .* into 2 disconnected/));
    expect(result.warningLocations).toContainEqual(
      expect.objectContaining({ kind: 'fill', lines: [4] }),
    );
  });

  it('uses the inset construction region for edge underlay and custom paths', () => {
    const edge = run(
      `lock 0 autotrim 0 maxdensity 0 fillinset 2
       fillunderlaypasses ['edge'] fillunderlayinset 0
       ${square()}`,
    ).events.filter((event) => event.t === 'stitch' && event.u === 1);
    const custom = stitches(
      `${stableSettings}fillinset 2 fill paths [[[-5, 10], [25, 10]]] ${square()}`,
    );

    expect(edge.length).toBeGreaterThan(0);
    expect(edge.every(({ x, y }) => x >= 1.99 && x <= 18.01 && y >= 1.99 && y <= 18.01)).toBe(true);
    expect(custom.length).toBeGreaterThan(0);
    expect(Math.min(...custom.map(({ x }) => x))).toBeGreaterThanOrEqual(1.99);
    expect(Math.max(...custom.map(({ x }) => x))).toBeLessThanOrEqual(18.01);
  });

  it('warns spatially when components collapse or the region becomes empty', () => {
    const collapsed = run(
      `${stableSettings}fillinset 1.1
       beginfill
         repeat 4 [ fd 8 rt 90 ]
         up setxy 20 0 down repeat 4 [ fd 2 rt 90 ]
       endfill`,
    );
    const empty = run(`${stableSettings}fillinset 2
beginfill repeat 4 [ fd 2 rt 90 ]
endfill`);

    expect(collapsed.warnings).toContainEqual(expect.stringMatching(/collapsed/));
    expect(collapsed.warningLocations).toContainEqual(expect.objectContaining({ kind: 'fill' }));
    expect(empty.events.filter((event) => event.t === 'stitch')).toEqual([]);
    expect(empty.warnings).toContainEqual(expect.stringMatching(/emptied .*line 3/));
    expect(empty.warningLocations).toContainEqual(
      expect.objectContaining({ kind: 'fill', lines: [3] }),
    );
  });

  it('validates its physical range and honors the clip vertex budget', () => {
    expect(() => run('fillinset -0.1')).toThrow(/between 0 and 10/);
    expect(() => run('fillinset 10.1')).toThrow(/between 0 and 10/);
    expect(() =>
      run(
        `override 'clipverts' 1000 fillinset 1 beginfill repeat 1001 [ fd 0.1 rt 0.3596403596 ] endfill`,
      ),
    ).toThrow(/fillinset: too many vertices/);
  });

  it('restores the setting after stitchscope', () => {
    const scoped = run(
      `${stableSettings}fillinset 2 stitchscope [ fillinset 0 ${square(8)} ]
       up setxy 20 0 down ${square(8)}`,
    );
    const secondFill = scoped.events.filter(
      (event) => event.t === 'stitch' && event.line === 2 && event.u !== 1,
    );

    expect(secondFill.length).toBeGreaterThan(0);
    expect(Math.min(...secondFill.map(({ x }) => x))).toBeGreaterThanOrEqual(21.99);
  });
});
