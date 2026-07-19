import { describe, expect, it, vi } from 'vitest';
import { run } from '../interpreter.ts';
import { Machine } from '../machine.ts';
import type { StitchEvent } from '../types.ts';

const square = (size = 20) => `beginfill repeat 4 [ fd ${size} rt 90 ] endfill`;
const underlayEvents = (source: string) =>
  run(`lock 0 autotrim 0 ${source}`).events.filter((event) => event.u === 1);
const underlayStitches = (source: string) =>
  underlayEvents(source).filter(
    (event): event is StitchEvent & { t: 'stitch' } => event.t === 'stitch',
  );

const sewnAxisTotals = (events: ReturnType<typeof run>['events']) => {
  let previous: StitchEvent | null = null;
  let horizontal = 0;
  let vertical = 0;
  for (const event of events) {
    if (event.t !== 'stitch' || event.u !== 1) {
      previous = null;
      continue;
    }
    if (previous) {
      horizontal += Math.abs(event.x - previous.x);
      vertical += Math.abs(event.y - previous.y);
    }
    previous = event;
  }
  return { horizontal, vertical };
};

describe('parameterized fill underlay commands', () => {
  it('sews exact ordered, repeatable passes before topping', () => {
    const edgeThenTatami = run(
      `lock 0 autotrim 0 fillunderlaypasses ['edge', 'tatami']
       fillunderlaylen 2 fillunderlayinset 0.5 fillunderlayspacing 3 ${square()}`,
    );
    const tatamiThenEdge = run(
      `lock 0 autotrim 0 fillunderlaypasses ['tatami', 'edge']
       fillunderlaylen 2 fillunderlayinset 0.5 fillunderlayspacing 3 ${square()}`,
    );
    const lastUnderlay = edgeThenTatami.events.findLastIndex((event) => event.u === 1);

    expect(edgeThenTatami.events.slice(lastUnderlay + 1).every((event) => event.u !== 1)).toBe(
      true,
    );
    expect(edgeThenTatami.events).not.toEqual(tatamiThenEdge.events);

    const single = underlayStitches(`fillunderlaypasses ['edge'] ${square()}`);
    const doubled = underlayStitches(`fillunderlaypasses ['EDGE', 'edge'] ${square()}`);
    expect(doubled.length).toBeGreaterThan(single.length);
    expect(underlayEvents(`fillunderlaypasses [] ${square()}`)).toEqual([]);
  });

  it('lets fillunderlay and fabric restore complete legacy profiles', () => {
    expect(
      underlayStitches(`fillunderlaypasses [] fillunderlay 'tatami' ${square()}`).length,
    ).toBeGreaterThan(0);
    expect(
      underlayStitches(`fillunderlaypasses [] fabric 'woven' ${square()}`).length,
    ).toBeGreaterThan(0);
  });

  it('applies stitch length, inset, spacing, and relative angle independently', () => {
    const short = underlayStitches(`fillunderlaypasses ['tatami'] fillunderlaylen 1 ${square()}`);
    const long = underlayStitches(`fillunderlaypasses ['tatami'] fillunderlaylen 6 ${square()}`);
    const tight = underlayStitches(
      `fillunderlaypasses ['tatami'] fillunderlayspacing 1 ${square()}`,
    );
    const loose = underlayStitches(
      `fillunderlaypasses ['tatami'] fillunderlayspacing 5 ${square()}`,
    );
    const inset = underlayStitches(
      `fillunderlaypasses ['tatami'] fillunderlayangle 0 fillunderlayinset 2 ${square()}`,
    );
    const horizontal = sewnAxisTotals(
      run(`fillunderlaypasses ['tatami'] fillunderlayangle 0 ${square()}`).events,
    );
    const vertical = sewnAxisTotals(
      run(`fillunderlaypasses ['tatami'] fillunderlayangle 90 ${square()}`).events,
    );

    expect(short.length).toBeGreaterThan(long.length);
    expect(tight.length).toBeGreaterThan(loose.length);
    expect(Math.min(...inset.map((event) => event.x))).toBeGreaterThanOrEqual(1.99);
    expect(Math.max(...inset.map((event) => event.x))).toBeLessThanOrEqual(18.01);
    expect(horizontal.horizontal).toBeGreaterThan(horizontal.vertical);
    expect(vertical.vertical).toBeGreaterThan(vertical.horizontal);
  });

  it('rotates a non-constant direction field by the authored relative angle', () => {
    const source =
      'def bend(p) [ return p[0] * 2 ] fill dir @bend ' +
      'beginfill repeat 4 [ fd 16 rt 90 ] endfill';
    const along = underlayEvents(`fillunderlaypasses ['tatami'] fillunderlayangle 0 ${source}`);
    const cross = underlayEvents(`fillunderlaypasses ['tatami'] fillunderlayangle 90 ${source}`);

    expect(along.length).toBeGreaterThan(0);
    expect(cross.length).toBeGreaterThan(0);
    expect(cross).not.toEqual(along);
  });

  it('keeps length, inset, and spacing in physical millimetres under affine transforms', () => {
    const settings =
      "fillunderlaypasses ['edge', 'tatami'] fillunderlaylen 2 fillunderlayinset 0.75 " +
      'fillunderlayspacing 2.5 fillunderlayangle 35 ';
    const transformed = underlayEvents(`${settings} scale 2 [ ${square(10)} ]`);
    const explicit = underlayEvents(`${settings} ${square(20)}`);

    expect(transformed).toHaveLength(explicit.length);
    for (let i = 0; i < transformed.length; i++) {
      expect(transformed[i].t).toBe(explicit[i].t);
      expect(transformed[i].x).toBeCloseTo(explicit[i].x, 6);
      expect(transformed[i].y).toBeCloseTo(explicit[i].y, 6);
    }
  });

  it('uses the recorded region for custom-path underlay', () => {
    const events = underlayStitches(
      `fillunderlaypasses ['tatami'] fillunderlayangle 90
       fill paths [[[0, 1], [20, 1]]] ${square()}`,
    );

    expect(Math.max(...events.map((event) => event.y))).toBeGreaterThan(15);
    expect(Math.min(...events.map((event) => event.y))).toBeLessThan(5);
  });

  it('keeps compound edge underlay inside concavities and outside holes', () => {
    const result = run(
      `lock 0 autotrim 0 fillunderlaypasses ['edge'] fillunderlayinset 0.5
       beginfill
         repeat 4 [ fd 20 rt 90 ]
         up setxy 8 8 down repeat 4 [ fd 4 rt 90 ]
       endfill`,
    );
    const stitches = result.events.filter(
      (event): event is StitchEvent & { t: 'stitch' } => event.t === 'stitch' && event.u === 1,
    );

    expect(stitches.length).toBeGreaterThan(0);
    expect(
      stitches.every(
        ({ x, y }) =>
          x >= 0 && x <= 20 && y >= 0 && y <= 20 && !(x > 8 && x < 12 && y > 8 && y < 12),
      ),
    ).toBe(true);
    expect(result.events.some((event) => event.t === 'jump' && event.u === 1)).toBe(true);
  });

  it('keeps concave and disconnected inset contours separate', () => {
    const concave = underlayStitches(
      `fillunderlaypasses ['edge'] fillunderlayinset 0.5
       beginfill setxy 0 20 setxy 8 20 setxy 8 8 setxy 20 8 setxy 20 0 setxy 0 0 endfill`,
    );
    expect(concave.some(({ x, y }) => x > 8 && y > 8)).toBe(false);

    const disconnected = run(
      `lock 0 autotrim 0 fillunderlaypasses ['edge'] fillunderlayinset 0.5
       beginfill
         repeat 4 [ fd 8 rt 90 ]
         up setxy 20 0 down repeat 4 [ fd 8 rt 90 ]
       endfill`,
    );
    const stitches = disconnected.events.filter((event) => event.t === 'stitch' && event.u === 1);
    expect(stitches.every(({ x }) => x <= 8 || x >= 20)).toBe(true);
    expect(disconnected.events.some((event) => event.t === 'jump' && event.u === 1)).toBe(true);
  });

  it('rejects malformed lists and numeric values before fill emission', () => {
    expect(() => run(`fillunderlaypasses 'edge'`)).toThrow(/expects a list/);
    expect(() => run(`fillunderlaypasses [1]`)).toThrow(/entry 1 must be a pass name/);
    expect(() => run(`fillunderlaypasses ['edeg']`)).toThrow(/did you mean "edge"/);
    expect(() =>
      run(`fillunderlaypasses [${Array.from({ length: 17 }, () => "'edge'").join(',')}]`),
    ).toThrow(/at most 16/);
    expect(() => run('fillunderlaylen 0.9')).toThrow(/between 1 and 7/);
    expect(() => run('fillunderlayinset -0.1')).toThrow(/between 0 and 10/);
    expect(() => run('fillunderlayspacing 5.1')).toThrow(/between 0.25 and 5/);
    expect(() => run(`fillunderlayangle ${'9'.repeat(400)}`)).toThrow(/finite number/);
    const endFill = vi.spyOn(Machine.prototype, 'endFill');
    try {
      expect(() => run(`beginfill fd 10 fillunderlaypasses ['bad'] endfill`)).toThrow(
        /Unknown fill underlay pass/,
      );
      expect(endFill).not.toHaveBeenCalled();
    } finally {
      endFill.mockRestore();
    }
  });

  it('restores the profile after stitchscope', () => {
    const result = run(
      `lock 0 autotrim 0 fillunderlaypasses ['edge']
       stitchscope [ fillunderlaypasses [] ${square(8)} ]
       up setxy 20 0 down ${square(8)}`,
    );
    const underlay = result.events.filter((event) => event.u === 1);

    expect(underlay.length).toBeGreaterThan(0);
    expect(underlay.every((event) => event.x >= 19)).toBe(true);
  });
});
