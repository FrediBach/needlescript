import { describe, expect, it, vi } from 'vitest';
import { run } from '../interpreter.ts';
import { Machine } from '../machine.ts';
import { expectPositionalEvents } from './helpers/positional-events.ts';

const underlayEvents = (source: string) =>
  run(`lock 0 autotrim 0 ${source}`).events.filter((event) => event.u === 1);

describe('parameterized satin underlay commands', () => {
  it('sews explicit passes in authored order before the topping', () => {
    const centerThenEdge = run(
      `lock 0 underlaypasses ['center', 'edge'] underlaylen 2 underlayinset 0.5
       satin 4 fd 8 satin 0`,
    );
    const edgeThenCenter = run(
      `lock 0 underlaypasses ['edge', 'center'] underlaylen 2 underlayinset 0.5
       satin 4 fd 8 satin 0`,
    );
    const firstOffCenter = centerThenEdge.events.findIndex(
      (event) => event.u === 1 && Math.abs(event.x) > 0.1,
    );
    const firstUnderlay = centerThenEdge.events.findIndex((event) => event.u === 1);
    const lastUnderlay = centerThenEdge.events.findLastIndex((event) => event.u === 1);

    expect(firstOffCenter).toBeGreaterThan(firstUnderlay);
    expect(
      centerThenEdge.events
        .slice(firstUnderlay, firstOffCenter)
        .every((event) => event.u === 1 && Math.abs(event.x) < 0.1),
    ).toBe(true);
    expect(Math.abs(edgeThenCenter.events.find((event) => event.u === 1)!.x)).toBeGreaterThan(0.1);
    expect(centerThenEdge.events.slice(lastUnderlay + 1).every((event) => event.u !== 1)).toBe(
      true,
    );
    expect(centerThenEdge.events).not.toEqual(edgeThenCenter.events);
  });

  it('accepts duplicates, case-insensitive names, and an empty pass list', () => {
    const doubled = underlayEvents(
      `underlaypasses ['CENTER', 'center'] underlaylen 2 satin 4 fd 8 satin 0`,
    );
    const single = underlayEvents(`underlaypasses ['center'] underlaylen 2 satin 4 fd 8 satin 0`);
    const off = underlayEvents(`underlaypasses [] satin 4 fd 8 satin 0`);

    expect(doubled.length).toBeGreaterThan(single.length);
    expect(off).toEqual([]);
  });

  it('lets underlay and fabric restore complete legacy profiles', () => {
    const byMode = underlayEvents(`underlaypasses [] underlay 'center' satin 4 fd 8 satin 0`);
    const byFabric = underlayEvents(`underlaypasses [] fabric 'woven' satin 4 fd 8 satin 0`);

    expect(byMode.length).toBeGreaterThan(0);
    expect(byFabric.length).toBeGreaterThan(0);
  });

  it('applies length, absolute inset, and zigzag spacing independently', () => {
    const shortRun = underlayEvents(`underlaypasses ['center'] underlaylen 1 satin 4 fd 8 satin 0`);
    const longRun = underlayEvents(`underlaypasses ['center'] underlaylen 4 satin 4 fd 8 satin 0`);
    const edge = underlayEvents(`underlaypasses ['edge'] underlayinset 0.5 satin 4 fd 8 satin 0`);
    const tightZigzag = underlayEvents(
      `underlaypasses ['zigzag'] underlayspacing 0.5 satin 4 fd 8 satin 0`,
    );
    const looseZigzag = underlayEvents(
      `underlaypasses ['zigzag'] underlayspacing 4 satin 4 fd 8 satin 0`,
    );

    expect(shortRun.length).toBeGreaterThan(longRun.length);
    expect(
      edge.filter((event) => Math.abs(event.x) > 0.1).every((event) => Math.abs(event.x) === 1.5),
    ).toBe(true);
    expect(tightZigzag.length).toBeGreaterThan(looseZigzag.length);
  });

  it('uses physical millimetres under affine transforms', () => {
    const transformed = run(
      `lock 0 underlaypasses ['edge'] underlaylen 2 underlayinset 0.5 density 0.5
       scale 3 [ satin 2 fd 10 satin 0 ]`,
    );
    const explicit = run(
      `lock 0 underlaypasses ['edge'] underlaylen 2 underlayinset 0.5 density 0.5
       satin 6 fd 30 satin 0`,
    );

    expect(transformed.events).toEqual(explicit.events);
  });

  it('uses the same physical profile for straight spine satin and satinbetween', () => {
    const settings =
      "lock 0 pullcomp 0.4 underlaypasses ['center', 'edge'] underlaylen 2 underlayinset 0.5 density 0.4";
    const between = run(`${settings} satinbetween([[-2,-10],[-2,10]], [[2,-10],[2,10]])`);
    const spine = run(`${settings} satin 4 up moveto 0 -10 down fd 20 satin 0`);

    expectPositionalEvents(between.events, spine.events);
  });

  it('warns and clamps edge passes that meet or cross a narrow column', () => {
    const collapsed = run(`underlaypasses ['edge'] underlayinset 1 satin 2 fd 5 satin 0`);
    const crossed = run(`underlaypasses ['edge'] underlayinset 1.1 satin 2 fd 5 satin 0`);

    expect(collapsed.warnings).toContainEqual(expect.stringMatching(/collapses at the center/));
    expect(crossed.warnings).toContainEqual(expect.stringMatching(/crosses the center/));
    expect(
      crossed.events.filter((event) => event.u === 1).every((event) => Math.abs(event.x) < 1e-9),
    ).toBe(true);
  });

  it('validates pass lists and numeric ranges before flushing a buffered column', () => {
    const tooMany = Array.from({ length: 17 }, () => "'center'").join(', ');
    expect(() => run(`underlaypasses ['center', 'spiral']`)).toThrow(
      /entry 2.*Unknown underlay pass 'spiral'/,
    );
    expect(() => run(`underlaypasses ['center', 2]`)).toThrow(/entry 2 must be a pass name string/);
    expect(() => run('underlaypasses 2')).toThrow(/expects a list/);
    expect(() => run(`underlaypasses [${tooMany}]`)).toThrow(/at most 16 passes/);
    expect(() => run('underlaylen 0.3')).toThrow(/between 0.4 and 12/);
    expect(() => run('underlayinset 10.1')).toThrow(/between 0 and 10/);
    expect(() => run('underlayspacing 0.2')).toThrow(/between 0.25 and 5/);

    const flush = vi.spyOn(Machine.prototype, 'flushSatin');
    try {
      expect(() => run('satin 4 fd 5 underlayinset 11')).toThrow(/between 0 and 10/);
      expect(flush).toHaveBeenCalledTimes(1);
    } finally {
      flush.mockRestore();
    }
  });

  it('is restored by stitchscope with the rest of construction state', () => {
    const scoped = run(
      `lock 0 underlaypasses ['center'] underlaylen 2
       stitchscope [ underlaypasses ['edge'] underlayinset 0.5 satin 4 fd 6 satin 0 ]
       satin 4 fd 6 satin 0`,
    );
    const innerUnderlay = scoped.events.filter((event) => event.u === 1 && event.line === 2);
    const outerUnderlay = scoped.events.filter((event) => event.u === 1 && event.line === 3);

    expect(innerUnderlay.some((event) => Math.abs(event.x) > 0.1)).toBe(true);
    expect(outerUnderlay.length).toBeGreaterThan(0);
    expect(outerUnderlay.every((event) => Math.abs(event.x) < 0.1)).toBe(true);
  });
});
