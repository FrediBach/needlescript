// ---------- Stitch history as queryable state (closed-loop generation) ----------
//
// The history queries — coverat / countat / nearestsewn / sewnwithin /
// stitchedpoints — expose the engine's live coverage grid as PURE, ZERO-DRAW,
// SEWING-ORDER reporters. They read accumulated state and let a program branch
// on it, but consume no RNG and emit nothing, so "same seed → same design"
// holds. These tests pin: the live-grid == heatmap identity (one notion of
// density), the committed-only rule under satin buffering, the determinism /
// zero-cost guarantees, the local→hoop CTM frame mapping, the spatial reporters,
// snapshot semantics, and the loop-aware op-limit message.

import { describe, it, expect } from 'vitest';
import { run, densityMap, DensityGrid } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

const printed = (s: string) => run(s).printed;
const num = (s: string) => parseFloat(run(s).printed[0]);
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
function clean(evs: StitchEvent[]) {
  return evs.map(e => ({ t: e.t, x: r4(e.x), y: r4(e.y), c: e.c, ...(e.u ? { u: e.u } : {}) }));
}

// ── 1: coverat / countat speak the heatmap's numbers exactly ─────────────────
describe('one notion of density (live grid == heatmap)', () => {
  it('coverat at the end equals the finalized heatmap layers for that cell', () => {
    const src = 'down setpos([0, 0])\nsetpos([20, 0])\nprint coverat([10, 0])';
    const res = run(src);
    const live = parseFloat(res.printed[0]);
    const cell = res.density.cells.find(c => c.ix === 10 && c.iy === 0)!;
    expect(cell).toBeTruthy();
    expect(live).toBeCloseTo(cell.layers, 6);
    expect(live).toBeGreaterThan(0);
  });

  it('countat equals the heatmap cell count', () => {
    const src = 'stitchlen 1\ndown setpos([0, 0])\nsetpos([20, 0])\nprint countat([10, 0])';
    const res = run(src);
    const live = parseFloat(res.printed[0]);
    const cell = res.density.cells.find(c => c.ix === 10 && c.iy === 0)!;
    expect(live).toBe(cell.count);
  });

  it('DensityGrid.finalize byte-equals densityMap over the same events', () => {
    const events: StitchEvent[] = [
      { t: 'stitch', x: 0, y: 0, c: 0, line: 1 },
      { t: 'stitch', x: 5, y: 0, c: 0, line: 1 },
      { t: 'jump', x: 5, y: 5, c: 0, line: 2 },
      { t: 'stitch', x: 5, y: 0, c: 0, line: 2 },
      { t: 'stitch', x: 0.05, y: 0.02, c: 0, line: 3 },
    ];
    const g = new DensityGrid(1);
    for (const e of events) g.feed(e.t, e.x, e.y, e.line);
    expect(g.finalize(3)).toEqual(densityMap(events, 1, 3));
  });

  it('tie-off locks never inflate coverage (excluded, like the heatmap)', () => {
    const geom = 'down setpos([0, 0])\nsetpos([20, 0])\ntrim\n';
    const withLock = run('lock 1\n' + geom).density;
    const noLock = run('lock 0\n' + geom).density;
    expect(withLock.peak).toBeCloseTo(noLock.peak, 6);
  });
});

// ── 2: committed-only — buffered satin is invisible until it flushes ─────────
describe('queries see committed (flushed) penetrations only', () => {
  it('a satin column is not visible mid-stroke, but is after trim flushes it', () => {
    const src =
      'satin 3\n' +
      'down setpos([0, 0])\nsetpos([20, 0])\n' +
      'print coverat([10, 0])\n' + // column still buffered → nothing here
      'trim\n' +
      'print coverat([10, 0])';    // flushed → coverage now present
    const out = printed(src);
    expect(parseFloat(out[0])).toBe(0);
    expect(parseFloat(out[1])).toBeGreaterThan(0);
  });
});

// ── 3: determinism — pure reads, zero RNG draws, zero events ─────────────────
describe('zero-draw, zero-event determinism', () => {
  const queries = [
    'let a = coverat([0, 0])',
    'let a = coverat([0, 0], 5)',
    'let a = countat([0, 0])',
    'let a = nearestsewn([0, 0])',
    'let a = sewnwithin([0, 0], 5)',
    'let a = stitchedpoints()',
  ];
  for (const q of queries) {
    it(`${q.slice(8)} draws nothing from the seeded stream`, () => {
      const sewn = 'down setpos([0, 0])\nsetpos([10, 0])\n';
      const withQ = run(`seed 7\n${sewn}${q}\nprint random(1000)`).printed[0];
      const without = run('seed 7\nprint random(1000)').printed[0];
      expect(withQ).toBe(without);
    });
  }

  it('querying emits no stitch events', () => {
    const base = 'down setpos([0, 0])\nsetpos([10, 0])';
    const withQ = run(
      base + '\nlet a = coverat([2, 0])\nlet b = nearestsewn([2, 0])\nlet c = stitchedpoints()',
    ).events;
    expect(clean(withQ)).toEqual(clean(run(base).events));
  });

  it('a design that BRANCHES on coverat reproduces exactly at the same seed', () => {
    const prog =
      'seed 7\nstitchlen 1.2\n' +
      'repeat 600 [\n' +
      '  let p = [random(60) - 30, random(60) - 30]\n' +
      '  if vlen(p) < 28 and coverat(p) < 1.5 [ up setpos(p) down arc 360 0.6 trim ]\n' +
      ']';
    expect(clean(run(prog).events)).toEqual(clean(run(prog).events));
  });

  it('changing only the seed changes the result', () => {
    const prog = (s: number) =>
      `seed ${s}\nstitchlen 1.2\n` +
      'repeat 600 [\n' +
      '  let p = [random(60) - 30, random(60) - 30]\n' +
      '  if vlen(p) < 28 and coverat(p) < 1.5 [ up setpos(p) down arc 360 0.6 trim ]\n' +
      ']';
    expect(clean(run(prog(7)).events)).not.toEqual(clean(run(prog(8)).events));
  });
});

// ── 4: local → hoop frame mapping through the CTM ────────────────────────────
describe('query points are local-frame, mapped through the CTM', () => {
  it('inside a translate, coverat(local) reads the right hoop cell', () => {
    // The line sews at hoop (30,0)→(40,0). A local query [5,0] maps to hoop
    // [35,0] (on the thread); [5,-20] maps to [35,-20] (bare fabric).
    const src =
      'translate 30 0 [\n' +
      '  down setpos([0, 0])\nsetpos([10, 0])\n' +
      '  print coverat([5, 0])\n' +
      '  print coverat([5, -20])\n' +
      ']';
    const out = printed(src);
    expect(parseFloat(out[0])).toBeGreaterThan(0);
    expect(parseFloat(out[1])).toBe(0);
  });

  it('the grid itself stores hoop coordinates (identity frame outside blocks)', () => {
    const src =
      'translate 30 0 [ down setpos([0, 0]) setpos([10, 0]) ]\n' +
      'print coverat([35, 0])\n' + // hoop where the thread actually is
      'print coverat([5, 0])';     // hoop origin — nothing sewn here
    const out = printed(src);
    expect(parseFloat(out[0])).toBeGreaterThan(0);
    expect(parseFloat(out[1])).toBe(0);
  });
});

// ── 5: spatial reporters — nearestsewn / sewnwithin ──────────────────────────
describe('spatial reporters', () => {
  it('nearestsewn is [] before anything is sewn, then the closest point', () => {
    expect(printed('print nearestsewn([5, 5])')[0]).toBe('[]');
    const out = printed(
      'down setpos([0, 0])\nsetpos([10, 0])\nprint nearestsewn([9.6, 0])',
    )[0];
    expect(out).toMatch(/^\[/);
    // closest penetration to (9.6, 0) on the 0..10 line is near x=10
    const m = out.match(/\[([-\d.]+),\s*([-\d.]+)\]/)!;
    expect(parseFloat(m[1])).toBeGreaterThan(8);
    expect(Math.abs(parseFloat(m[2]))).toBeLessThan(0.001);
  });

  it('sewnwithin includes points within r and excludes those beyond', () => {
    const sewn = 'stitchlen 1\ndown setpos([0, 0])\nsetpos([10, 0])\n';
    expect(num(sewn + 'print len(sewnwithin([0, 0], 2.5))')).toBeGreaterThan(0);
    expect(num(sewn + 'print len(sewnwithin([0, 40], 3))')).toBe(0);
  });
});

// ── 6: stitchedpoints — an explicit, opt-in deep-copied snapshot ─────────────
describe('stitchedpoints snapshot semantics', () => {
  it('captures the moment it is called — later sewing does not change it', () => {
    const src =
      'stitchlen 1\ndown setpos([0, 0])\nsetpos([10, 0])\n' +
      'let snap = stitchedpoints()\n' +
      'let n1 = len(snap)\n' +
      'setpos([20, 0])\n' + // sew more after the snapshot
      'print n1\n' +
      'print len(snap)';
    const out = printed(src);
    expect(out[0]).toBe(out[1]); // snapshot length unchanged by later stitches
    expect(parseFloat(out[0])).toBeGreaterThan(0);
  });

  it('is a deep copy — mutating it cannot corrupt the machine', () => {
    const src =
      'down setpos([0, 0])\nsetpos([10, 0])\n' +
      'let snap = stitchedpoints()\n' +
      'append(snap, [999, 999])\n' +
      'print coverat([999, 999])'; // the bogus point never entered the grid
    expect(num(src)).toBe(0);
  });
});

// ── 7: the op-count cliff is loud, not silent ────────────────────────────────
describe('feedback loops fail loudly', () => {
  it('a non-terminating loop that queries trips with a loop-aware message', () => {
    const src =
      'seed 1\n' +
      'while coverat([0, 0]) < 999 [\n' +
      '  let p = [random(20) - 10, random(20) - 10]\n' +
      '  up setpos(p) down arc 360 0.5 trim\n' +
      ']';
    expect(() => run(src)).toThrow(/feedback loop/);
  });

  it('a bounded stipple loop terminates and produces a bounded design', () => {
    const prog =
      'seed 7\nstitchlen 1.2\n' +
      'repeat 4000 [\n' +
      '  let p = [random(80) - 40, random(80) - 40]\n' +
      '  if vlen(p) < 40 and coverat(p) < 1.8 and len(sewnwithin(p, 2.2)) = 0 [\n' +
      '    up setpos(p) down arc 360 0.7 trim\n' +
      '  ]\n' +
      ']';
    const res = run(prog);
    const stitches = res.events.filter(e => e.t === 'stitch').length;
    expect(stitches).toBeGreaterThan(0);
    expect(stitches).toBeLessThan(60000);
    // self-leveling keeps the peak near the target rather than runaway crowding
    expect(res.density.peak).toBeLessThan(4);
  });
});

// ── 8: parser surface — glued-call only, value position, shadowable ──────────
describe('grammar', () => {
  it('the reporters need call syntax (no prefix form)', () => {
    expect(() => run('print coverat')).toThrow(/call syntax|returns a value|value/i);
  });

  it('used as a statement, a reporter errors as a value', () => {
    expect(() => run('coverat([0, 0])')).toThrow(/returns a value/);
  });

  it('@coverat is rejected — not a procedure', () => {
    expect(() => run('warp @coverat [ fd 10 ]')).toThrow(/procedure/);
  });

  it('a user procedure may shadow a query name (library tier)', () => {
    const res = run('def coverat(p) [ return 42 ]\nprint coverat([0, 0])');
    expect(res.printed[0]).toBe('42');
    expect(res.warnings.some(w => /shadows a built-in/.test(w))).toBe(true);
  });
});
