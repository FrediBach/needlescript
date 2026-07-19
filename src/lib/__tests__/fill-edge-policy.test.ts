import { describe, expect, it } from 'vitest';
import { run } from '../interpreter.ts';
import { segdist } from '../genmath.ts';
import { evenOddInside, generateFill } from '../machine/fill.ts';
import type { StitchEvent } from '../types.ts';

const square = (size = 20) => `beginfill repeat 4 [ fd ${size} rt 90 ] endfill`;
const settings = "lock 0 autotrim 0 maxdensity 0 fillunderlay 'off' fillspacing 1 filllen 2 ";
const stitches = (events: StitchEvent[]) => events.filter((event) => event.t === 'stitch');

describe('fill edge policies', () => {
  it('keeps both disabled defaults byte-identical across fixed and programmable fills', () => {
    const fixed = `${settings}${square()}`;
    const programmable = `${settings}def bend(p) [ return p[0] ] fill dir @bend ${square()}`;

    expect(run(`filledgerun 0 filledgeshort 0 ${fixed}`)).toEqual(run(fixed));
    expect(run(`filledgerun 0 filledgeshort 0 ${programmable}`)).toEqual(run(programmable));
  });

  it('sews the inset edge run after underlay and before topping', () => {
    const result = run(
      `lock 0 autotrim 0 maxdensity 0 fillspacing 5 filllen 2
       fillunderlaypasses ['tatami'] fillunderlayspacing 5
       filledgerun 1 ${square()}`,
    );
    const lastUnderlay = result.events.findLastIndex((event) => event.u === 1);
    const firstTopping = result.events.findIndex(
      (event, index) => index > lastUnderlay && event.t === 'stitch' && event.u !== 1,
    );

    expect(lastUnderlay).toBeGreaterThanOrEqual(0);
    expect(firstTopping).toBeGreaterThan(lastUnderlay);
    expect(result.events[firstTopping]).toMatchObject({ t: 'stitch' });
    expect(
      Math.min(
        Math.abs(result.events[firstTopping].x - 1),
        Math.abs(result.events[firstTopping].x - 19),
        Math.abs(result.events[firstTopping].y - 1),
        Math.abs(result.events[firstTopping].y - 19),
      ),
    ).toBeLessThan(0.02);
  });

  it('keeps edge-run penetrations inside compound construction geometry', () => {
    const rings: [number, number][][] = [
      [
        [0, 0],
        [0, 20],
        [20, 20],
        [20, 0],
      ],
      [
        [8, 8],
        [8, 12],
        [12, 12],
        [12, 8],
      ],
    ];
    const result = run(
      `${settings}fillspacing 5 filledgeshort 10 filledgerun 1
       beginfill
         repeat 4 [ fd 20 rt 90 ]
         up setxy 8 8 down repeat 4 [ fd 4 rt 90 ]
       endfill`,
    );

    expect(stitches(result.events).length).toBeGreaterThan(0);
    expect(
      stitches(result.events).every(
        ({ x, y }) =>
          evenOddInside(rings, x, y) ||
          rings.some((ring) =>
            ring.some(
              (point, index) => segdist([x, y], point, ring[(index + 1) % ring.length]) < 1e-6,
            ),
          ),
      ),
    ).toBe(true);
  });

  it('omits short fixed and custom topping fragments before connector routing', () => {
    const rings: [number, number][][] = [
      [
        [0, 0],
        [0, 8],
        [8, 0],
      ],
    ];
    const omitted: [number, number][] = [];
    const all = generateFill(rings, { angle: 0, spacing: 1, stitchLen: 2 });
    const shortened = generateFill(rings, {
      angle: 0,
      spacing: 1,
      stitchLen: 2,
      minRowLengthMM: 3,
      onShortRow: (x, y) => omitted.push([x, y]),
    });
    const customBase = run(
      `${settings}fill paths [[[0, 1], [1, 1]], [[0, 3], [6, 3]]] ${square(8)}`,
    );
    const customShort = run(
      `${settings}filledgeshort 2 fillconnect 'jump'
       fill paths [[[0, 1], [1, 1]], [[0, 3], [6, 3]]] ${square(8)}`,
    );

    expect(shortened.length).toBeLessThan(all.length);
    expect(omitted.length).toBeGreaterThan(0);
    expect(stitches(customShort.events).length).toBeLessThan(stitches(customBase.events).length);
    expect(customShort.warnings).toContainEqual(
      expect.stringMatching(/filledgeshort 2 mm omitted/),
    );
  });

  it('bounds coincident penetrations around an acute edge-run corner', () => {
    const result = run(
      `${settings}fillspacing 5 filledgeshort 10 filledgerun 0.05
       beginfill setxy 1 10 setxy 2 0 endfill`,
    );
    const points = stitches(result.events);
    const worst = points.reduce(
      (max, point) =>
        Math.max(
          max,
          points.filter((other) => Math.hypot(other.x - point.x, other.y - point.y) <= 0.15).length,
        ),
      0,
    );

    expect(points.length).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(2);
  });

  it('warns when an edge run overlaps dense later border coverage', () => {
    const result = run(
      `lock 0 autotrim 0 maxdensity 3.5 fillunderlay 'off' fillspacing 2 filllen 2
       filledgerun 0.2 ${square()}
       satin 2 repeat 4 [ fd 20 rt 90 ] satin 0`,
    );

    expect(result.warnings).toContainEqual(expect.stringMatching(/filledgerun overlaps .*border/));
    expect(result.warningLocations).toContainEqual(expect.objectContaining({ kind: 'fill' }));
  });

  it('validates and scopes both physical settings', () => {
    expect(() => run('filledgerun -0.1')).toThrow(/between 0 and 10/);
    expect(() => run('filledgerun 10.1')).toThrow(/between 0 and 10/);
    expect(() => run('filledgeshort -0.1')).toThrow(/between 0 and 10/);
    expect(() => run('filledgeshort 10.1')).toThrow(/between 0 and 10/);

    const scoped = run(
      `${settings}filledgerun 1 filledgeshort 2
       stitchscope [ filledgerun 0 filledgeshort 0 ${square(8)} ]
       up setxy 20 0 down ${square(8)}`,
    );
    const second = scoped.events.filter(
      (event) => event.t === 'stitch' && event.line === 3 && event.u !== 1,
    );
    expect(second.some(({ x }) => Math.abs(x - 21) < 0.02)).toBe(true);
  });
});
