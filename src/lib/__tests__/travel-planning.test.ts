import { describe, expect, it } from 'vitest';
import { applyTravelPlan, designStats, run, toDST, toEXP, toPES, toSVG } from '../engine.ts';
import type { StitchEvent } from '../types.ts';

const printed = (source: string) => run(source).printed;

describe('routesort', () => {
  it('anchors at the first item by default and chains nearest-first', () => {
    expect(printed('print routesort([[0, 0], [10, 0], [2, 0]])')).toEqual([
      '[[0, 0], [2, 0], [10, 0]]',
    ]);
  });

  it('uses an explicit start to choose the first item', () => {
    expect(printed('print routesort([[0, 0], [10, 0], [2, 0]], [9, 0])')).toEqual([
      '[[10, 0], [2, 0], [0, 0]]',
    ]);
  });

  it('routes paths by entry/exit and can reverse copies in both mode', () => {
    const result = run(`
      let a = [[0, 0], [1, 0]]
      let b = [[8, 0], [3, 0]]
      let routed = routesort([a, b], 'both')
      routed[1][0][0] = 99
      print routed
      print b
    `);
    expect(result.printed).toEqual(['[[[0, 0], [1, 0]], [[99, 0], [8, 0]]]', '[[8, 0], [99, 0]]']);
  });

  it('accepts mixed points/paths, empty lists, singleton paths, and computed modes', () => {
    expect(
      printed(`
        let mode = lower('BOTH')
        print routesort([])
        print routesort([[[1, 2]], [4, 2], [[8, 2], [5, 2]]], [0, 0], mode)
      `),
    ).toEqual(['[]', '[[[1, 2]], [4, 2], [[5, 2], [8, 2]]]']);
  });

  it('breaks equal-distance ties by original index', () => {
    expect(printed('print routesort([[0, 0], [1, 1], [-1, 1]])')).toEqual([
      '[[0, 0], [1, 1], [-1, 1]]',
    ]);
  });

  it('is drawless', () => {
    const withRoute = printed(`
      seed 11
      let routed = routesort([[0, 0], [5, 0], [1, 0]])
      print random(1000)
    `);
    expect(withRoute).toEqual(printed('seed 11 print random(1000)'));
  });

  it('reports malformed elements and unknown modes clearly', () => {
    expect(() => run('print routesort([[0, 0], 7])')).toThrow(/element 1.*point.*path/i);
    expect(() => run("print routesort([[0, 0]], 'neerest')")).toThrow(
      /doesn't know 'neerest'.*chain.*both/i,
    );
  });

  it('remains a shadowable Library function', () => {
    expect(printed('def routesort(xs) [ return [42] ] print routesort([1])')).toEqual(['[42]']);
  });
});

describe('plan directive', () => {
  const threeRuns = (directive: string) => `
    ${directive}
    lock 0
    autotrim 0
    stitchlen 12
    down fd 1 trim
    up setxy 20 0 down fd 1 trim
    up setxy 5 0 down fd 1
  `;

  it('keeps the first run anchored and greedily reorders later runs', () => {
    const result = run(threeRuns("plan 'nearest'"));
    const endpoints = result.events
      .filter((event) => event.t === 'stitch')
      .map((event) => [event.x, event.y]);
    expect(endpoints).toEqual([
      [0, 0],
      [0, 1],
      [5, 1],
      [20, 1],
    ]);
    expect(result.events.filter((event) => event.t === 'trim')).toHaveLength(2);
    expect(result.printed.at(-1)).toMatch(/plan 'nearest': travel .*\(runs: 3, colors: 1\)/);
  });

  it('reverses an eligible run when its exit is the nearer endpoint', () => {
    const result = run(`
      plan 'reversing-nearest' lock 0 autotrim 0 stitchlen 20
      down setxy 0 1 trim
      up setxy 10 0 down setxy 2 0
    `);
    const stitches = result.events
      .filter((event) => event.t === 'stitch')
      .map((event) => [event.x, event.y]);
    expect(stitches).toEqual([
      [0, 0],
      [0, 1],
      [10, 0],
    ]);
    expect(result.events.find((event) => event.t === 'jump')).toMatchObject({ x: 2, y: 0 });
    expect(result.plan?.travelAfterMm).toBeLessThan(result.plan?.travelBeforeMm ?? 0);
  });

  it('does not reverse runs with internal jumps or mixed underlay ordering', () => {
    const mixedLayers: StitchEvent[] = [
      { t: 'stitch', x: 0, y: 0, c: 0 },
      { t: 'trim', x: 0, y: 0, c: 0 },
      { t: 'jump', x: 10, y: 0, c: 0 },
      { t: 'stitch', x: 10, y: 1, c: 0, u: 1 },
      { t: 'stitch', x: 2, y: 1, c: 0 },
    ];
    const internalJump: StitchEvent[] = [
      { t: 'stitch', x: 0, y: 0, c: 0 },
      { t: 'trim', x: 0, y: 0, c: 0 },
      { t: 'jump', x: 10, y: 0, c: 0 },
      { t: 'stitch', x: 10, y: 1, c: 0 },
      { t: 'jump', x: 2, y: 1, c: 0 },
      { t: 'stitch', x: 2, y: 2, c: 0 },
    ];
    expect(applyTravelPlan(mixedLayers, 'reversing-nearest', 0).events).toEqual(
      applyTravelPlan(mixedLayers, 'nearest', 0).events,
    );
    expect(applyTravelPlan(internalJump, 'reversing-nearest', 0).events).toEqual(
      applyTravelPlan(internalJump, 'nearest', 0).events,
    );
  });

  it('runs before autotrim and lowers automatic trim count', () => {
    const source = `
      plan 'nearest'
      lock 0
      autotrim 8
      stitchlen 12
      down fd 1
      up setxy 20 0 down fd 1
      up setxy 5 0 down fd 1
    `;
    const result = run(source);
    expect(result.printed.at(-1)).toMatch(/autotrims 2 → 1/);
    expect(result.events.filter((event) => event.t === 'trim')).toHaveLength(1);
  });

  it('preserves the approach point used to tie in planned runs', () => {
    const source = `
      lock 0.7
      autotrim 7
      stitchlen 2
      up setxy 0 -10 down setxy 0 10
      up setxy 10 -10 down setxy 10 10
    `;
    const plain = run(source);
    const planned = run(`plan 'nearest' ${source}`);
    const bottomAtX = (events: StitchEvent[], x: number) =>
      Math.min(...events.filter((event) => event.t === 'stitch' && event.x === x).map((e) => e.y));

    expect(bottomAtX(planned.events, 10)).toBe(bottomAtX(plain.events, 10));
    expect(bottomAtX(planned.events, 10)).toBe(-10);
  });

  it('never reorders across colors and preserves each block first run', () => {
    const result = run(`
      plan 'nearest' lock 0 autotrim 0 stitchlen 12
      down fd 1 trim up setxy 10 0 down fd 1
      color 2
      up setxy 30 0 down fd 1 trim up setxy 20 0 down fd 1
    `);
    const sequence = result.events
      .filter((event) => event.t === 'stitch' || event.t === 'color')
      .map((event) => `${event.t}:${event.c}:${event.x},${event.y}`);
    expect(sequence).toEqual([
      'stitch:0:0,0',
      'stitch:0:0,1',
      'stitch:0:10,1',
      'color:0:10,1',
      'stitch:2:30,1',
      'stitch:2:20,1',
    ]);
  });

  it('preserves atomic run contents, underlay order, marks, and explicit trims', () => {
    const events: StitchEvent[] = [
      { t: 'stitch', x: 0, y: 0, c: 0, line: 1, u: 1 },
      { t: 'stitch', x: 0, y: 1, c: 0, line: 2 },
      { t: 'trim', x: 0, y: 1, c: 0, line: 3 },
      { t: 'mark', x: 0, y: 1, c: 0, line: 3, label: 'first' },
      { t: 'jump', x: 20, y: 0, c: 0, line: 4 },
      { t: 'stitch', x: 20, y: 1, c: 0, line: 4, u: 1 },
      { t: 'stitch', x: 20, y: 2, c: 0, line: 5 },
      { t: 'trim', x: 20, y: 2, c: 0, line: 6 },
      { t: 'jump', x: 5, y: 0, c: 0, line: 7 },
      { t: 'stitch', x: 5, y: 1, c: 0, line: 7, u: 1 },
      { t: 'stitch', x: 5, y: 2, c: 0, line: 8 },
    ];
    const planned = applyTravelPlan(events, 'nearest', 0).events;
    expect(planned.filter((event) => event.t === 'trim')).toEqual(
      events.filter((event) => event.t === 'trim'),
    );
    expect(planned.find((event) => event.t === 'mark')).toEqual(events[3]);
    expect(
      planned
        .filter((event) => event.t === 'stitch')
        .map(({ x, y, line, u }) => ({ x, y, line, u })),
    ).toEqual([
      { x: 0, y: 0, line: 1, u: 1 },
      { x: 0, y: 1, line: 2, u: undefined },
      { x: 5, y: 1, line: 7, u: 1 },
      { x: 5, y: 2, line: 8, u: undefined },
      { x: 20, y: 1, line: 4, u: 1 },
      { x: 20, y: 2, line: 5, u: undefined },
    ]);
  });

  it('leaves live density output unchanged', () => {
    const planned = run(threeRuns("plan 'nearest'"));
    const plain = run(threeRuns(''));
    expect(planned.density).toEqual(plain.density);
  });

  it('states when history queries saw authored order before a material reorder', () => {
    const result = run(`${threeRuns("plan 'nearest'")} print countat([0, 0])`);
    expect(result.printed.at(-1)).toMatch(
      /history queries used authored order, before this final sew-order plan/,
    );
  });

  it('does not report a history-order mismatch when eligible runs keep authored order', () => {
    const result = run(`
      plan 'nearest' lock 0 autotrim 0 stitchlen 12
      down fd 1 trim up setxy 5 0 down fd 1
      print countat([0, 0])
    `);
    expect(result.printed.at(-1)).toBe("plan 'nearest': nothing to reorder");
  });

  it('lowers planner-only records before RunResult and every exporter boundary', () => {
    const result = run(threeRuns("plan 'nearest'"));
    const publicKeys = new Set(['t', 'x', 'y', 'c', 'line', 'u', 'label']);
    expect(
      result.events.every((event) => Object.keys(event).every((key) => publicKeys.has(key))),
    ).toBe(true);
    expect(() => toDST(result.events, 'planner-metadata')).not.toThrow();
    expect(() => toEXP(result.events, 'planner-metadata')).not.toThrow();
    expect(() => toPES(result.events, 'planner-metadata', result.colorTable)).not.toThrow();
    expect(() => toSVG(result.events, 'planner-metadata', result.colorTable)).not.toThrow();
  });

  it('does not split long jumps when autotrim is disabled', () => {
    const result = run(`
      plan 'nearest' lock 0 autotrim 0 stitchlen 12
      down fd 1 up setxy 20 0 down fd 1 up setxy 5 0 down fd 1
    `);
    expect(result.printed.at(-1)).toBe("plan 'nearest': nothing to reorder");
  });

  it('off is byte-identical to absence and active planning is drawless', () => {
    expect(run(threeRuns("plan 'off'")).events).toEqual(run(threeRuns('')).events);
    const planned = run(
      `plan 'nearest' seed 7 lock 0 down fd 1 trim up setxy 5 0 print random(99)`,
    );
    const plain = run('seed 7 lock 0 down fd 1 trim up setxy 5 0 print random(99)');
    expect(planned.printed[0]).toBe(plain.printed[0]);
  });

  it('reports nothing to reorder and exposes planning stats', () => {
    const result = run("plan lower('NEAREST') lock 0 fd 2");
    expect(result.printed.at(-1)).toBe("plan 'nearest': nothing to reorder");
    expect(result.plan).toMatchObject({ planMode: 'nearest', runs: 1, colors: 1 });
    expect(designStats(result.events, result.plan)).toMatchObject({
      planMode: 'nearest',
      travelBeforeMm: 0,
      travelAfterMm: 0,
    });
  });

  it('enforces directive placement, uniqueness, types, and modes', () => {
    expect(() => run("repeat 1 [ plan 'nearest' ]")).toThrow(/top level/i);
    expect(() => run("def p() [ plan 'nearest' ] p() ")).toThrow(/top level/i);
    expect(() => run("fd 1 plan 'nearest'")).toThrow(/before the first stitch/i);
    expect(() => run("plan 'off' plan 'nearest'")).toThrow(/already set/i);
    expect(() => run('plan 7')).toThrow(/string mode/i);
    expect(() => run("plan 'neerest'")).toThrow(/Unknown plan.*nearest/i);
    expect(() => run("let p = trace [ plan 'nearest' ]")).toThrow(/program directive/i);
  });
});
