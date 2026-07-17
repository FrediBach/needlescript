import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

// `satin @fn` — programmable satin columns. The pins from the spec's §11 test
// plan, in order, plus the §12 open-decision cases that were confirmed.

const evts = (src: string) => run(src).events;
const stitches = (src: string) => evts(src).filter((e) => e.t === 'stitch');
const warns = (src: string) => run(src).warnings;
const sameStream = (a: StitchEvent[], b: StitchEvent[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i];
    if (
      x.t !== y.t ||
      x.c !== y.c ||
      (x.u || 0) !== (y.u || 0) ||
      Math.abs(x.x - y.x) > 1e-9 ||
      Math.abs(x.y - y.y) > 1e-9
    )
      return false;
  }
  return true;
};

// ── 1: equivalence pin (§3.4) — the primary correctness gate ─────────────────
describe('equivalence pin', () => {
  it('satin 4 ≡ satin @[0.4,2,2,0,0], byte-identical event stream', () => {
    const builtin = evts('lock 0 satin 4\nfd 40');
    const programmable = evts(
      'def c(t, s, i, u) [ return [0.4, 2, 2, 0, 0] ]\nlock 0 satin @c\nfd 40',
    );
    expect(sameStream(builtin, programmable)).toBe(true);
    // and it really is a column, not an empty stream
    expect(programmable.filter((e) => e.t === 'stitch').length).toBe(101);
  });

  it('holds with underlay and pullcomp engaged too', () => {
    const opts = 'lock 0 underlay "center pullcomp 0.5 ';
    const builtin = evts(opts + 'satin 4\nfd 40');
    const programmable = evts(
      'def c(t, s, i, u) [ return [0.4, 2, 2, 0, 0] ]\n' + opts + 'satin @c\nfd 40',
    );
    expect(sameStream(builtin, programmable)).toBe(true);
  });
});

// ── 2: golden crossing stream (straight spine) ───────────────────────────────
describe('golden straight crossing stream', () => {
  const src = `def ch(t, s, i, u) [
  if i % 2 == 0 [ return [0.4, 2, 2, -0.8, 0.8] ]
  return [0.4, 2, 2, 0.8, -0.8]
]
lock 0 satin @ch
fd 40`;
  it('places independent rail endpoints (pinned penetrations)', () => {
    const s = stitches(src);
    // anchor, then the alternating "/" and "\" diagonals raked by the lags
    const expected = [
      [0.0, 0.0],
      [2.0, 1.2],
      [-2.0, 0.0],
      [2.0, 0.4],
      [-2.0, 2.4],
      [2.0, 2.8],
      [-2.0, 1.6],
      [2.0, 2.0],
      [-2.0, 4.0],
    ];
    expected.forEach(([x, y], k) => {
      expect(s[k].x).toBeCloseTo(x, 6);
      expect(s[k].y).toBeCloseTo(y, 6);
    });
  });

  it('self-crosses: a "/" stitch is followed by a "\\" stitch', () => {
    // The cursor advances monotonically (y of rail points trends forward),
    // while consecutive diagonals tilt opposite ways — the woven look.
    const s = stitches(src);
    // pair 0 stitch right→left endpoint: (2,1.2)→(-2,0.0)  ⇒ descending
    expect(s[2].y).toBeLessThan(s[1].y);
    // pair 1 stitch: (2,0.4)→(-2,2.4)  ⇒ ascending (crosses the first)
    expect(s[4].y).toBeGreaterThan(s[3].y);
  });
});

// ── 3: golden arc-crossing stream (the §7 high-risk math) ────────────────────
describe('golden arc crossing stream', () => {
  const src = `def ch(t, s, i, u) [
  if i % 2 == 0 [ return [0.4, 2, 2, -0.8, 0.8] ]
  return [0.4, 2, 2, 0.8, -0.8]
]
lock 0 satin @ch
arc 90 20`;
  it('uses the normal at each endpoint own lagged arc point (fanned rails)', () => {
    const s = stitches(src);
    const expected = [
      [0.0, 0.0],
      [2.069, 1.077],
      [-1.996, 0.121],
      [2.021, 0.279],
      [-1.851, 2.516],
      [2.182, 2.429],
      [-1.9, 1.718],
      [2.117, 1.876],
      [-1.536, 4.33],
    ];
    expected.forEach(([x, y], k) => {
      expect(s[k].x).toBeCloseTo(x, 3);
      expect(s[k].y).toBeCloseTo(y, 3);
    });
    // The rails fan: x is NOT a clean ±2 the way the straight column is — the
    // per-endpoint normal on the curve has tilted them.
    expect(Math.abs(s[1].x - 2)).toBeGreaterThan(0.01);
  });
});

// ── 4: termination — advance ≤ 0 clamps, warns once, halts ───────────────────
describe('cursor advance guard rail', () => {
  it('clamps advance ≤ 0 to 0.1 mm, warns once, terminates', () => {
    const src = `def c(t, s, i, u) [ return [0, 2, 2, 0, 0] ]
lock 0 satin @c
fd 10`;
    const r = run(src);
    const w = r.warnings.filter((s) => /advance must be greater than 0/.test(s));
    expect(w.length).toBe(1); // one-time per column
    // halts: fd 10 at the 0.1 mm floor ⇒ 100 steps + anchor, finite
    expect(r.events.filter((e) => e.t === 'stitch').length).toBe(101);
  });
});

// ── 5: reporter contract — loud, line-numbered type errors ───────────────────
describe('reporter type errors', () => {
  const cases: [string, string, RegExp][] = [
    [
      'wrong arity (3)',
      'def c(t,s,i) [ return [0.4,2,2,0,0] ]\nsatin @c\nfd 5',
      /expects a 4-argument reporter/,
    ],
    [
      'wrong arity (5)',
      'def c(t,s,i,u,x) [ return [0.4,2,2,0,0] ]\nsatin @c\nfd 5',
      /expects a 4-argument reporter/,
    ],
    [
      'non-list return',
      'def c(t,s,i,u) [ return 5 ]\nsatin @c\nfd 5',
      /must return a list of 5 numbers/,
    ],
    [
      '4-element return',
      'def c(t,s,i,u) [ return [0.4,2,2,0] ]\nsatin @c\nfd 5',
      /exactly 5 numbers/,
    ],
    [
      '6-element return',
      'def c(t,s,i,u) [ return [0.4,2,2,0,0,0] ]\nsatin @c\nfd 5',
      /exactly 5 numbers/,
    ],
    [
      'non-number element',
      'def c(t,s,i,u) [ return [0.4,2,[1],0,0] ]\nsatin @c\nfd 5',
      /rightw \(slot 3 of 5\)/,
    ],
  ];
  for (const [name, src, re] of cases) {
    it(name + ' is a loud, line-numbered error', () => {
      let err: Error | null = null;
      try {
        run(src);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toMatch(re);
      expect(err!.message).toMatch(/\(line \d+\)/); // names the line
    });
  }
});

// ── 6: determinism — drawless generator, reproducible reporter ───────────────
describe('determinism & draw accounting', () => {
  it('the generator itself draws nothing (a later random is unshifted)', () => {
    const withCol = run(`def c(t,s,i,u) [ return [0.4, snoise2(t*0.1, 0) + 2, 2, 0, 0] ]
seed 1
satin @c
fd 20
satin 0
print random(10)`).printed;
    const without = run('seed 1\nprint random(10)').printed;
    expect(withCol).toEqual(without);
  });

  it('a snoise2-feathered reporter is identical across runs at a fixed seed', () => {
    const prog = `def c(t,s,i,u) [ return [0.4, 1 + snoise2(t*0.2, 0), 2, 0, 0] ]
seed 7
satin @c
fd 30`;
    expect(sameStream(evts(prog), evts(prog))).toBe(true);
  });
});

// ── 7: density surfacing — crossings are not suppressed ──────────────────────
describe('density surfacing', () => {
  it('self-crossing satin produces density hotspots with coords + source lines', () => {
    const src = `def ch(t, s, i, u) [
  if i % 2 == 0 [ return [0.15, 3, 3, -2, 2] ]
  return [0.15, 3, 3, 2, -2]
]
maxdensity 3
lock 0 satin @ch
fd 40
satin 0`;
    const r = run(src);
    const hot = r.density.hotspots.filter((h) => h.kind === 'density');
    expect(hot.length).toBeGreaterThan(0);
    expect(r.density.peak).toBeGreaterThan(3);
    // coordinates + source lines, not suppressed
    expect(hot[0].lines.length).toBeGreaterThan(0);
    expect(Number.isFinite(hot[0].x)).toBe(true);
  });

  it('the rake is what drives the extra density — crossings raise the peak', () => {
    const peak = (rake: number) =>
      run(`def c(t,s,i,u) [
  if i % 2 == 0 [ return [0.15, 3, 3, -${rake}, ${rake}] ]
  return [0.15, 3, 3, ${rake}, -${rake}]
]
maxdensity 3
lock 0 satin @c
fd 40`).density.peak;
    // same advance/width; the only difference is the rake that makes stitches
    // cross — and the crossings stack thread, pushing the peak higher.
    expect(peak(2)).toBeGreaterThan(peak(0));
  });
});

// ── 8: snag — realized chord, not leftw + rightw ─────────────────────────────
describe('snag check on realized geometry', () => {
  it('steep rake trips the 8 mm snag on the realized chord', () => {
    // leftw + rightw is only 6 mm, but the ±5 mm rake stretches the realized
    // chord well past 8 mm — the warning must measure the chord (§5.2).
    const src = `def c(t,s,i,u) [ return [0.4, 3, 3, -5, 5] ]
lock 0 satin @c
fd 30`;
    expect(warns(src).some((w) => /spans .* mm.*snag/.test(w))).toBe(true);
  });

  it('a perpendicular column of the same half-widths does not snag', () => {
    const src = `def c(t,s,i,u) [ return [0.4, 3, 3, 0, 0] ]
lock 0 satin @c
fd 30`;
    expect(warns(src).some((w) => /snag/.test(w))).toBe(false);
  });
});

// ── 9: transform composition — physical spacing, not stretched stitches ──────
describe('transform composition', () => {
  it('scale 1.5 sews 1.5× the extent with spacing intact (more stitches)', () => {
    const c = 'def c(t,s,i,u) [ return [0.4, 2, 2, 0, 0] ]\n';
    const plain = stitches(c + 'lock 0 satin @c\nfd 20');
    const scaled = stitches(c + 'lock 0 scale 1.5 [ satin @c fd 20 ]');
    const maxY = (s: StitchEvent[]) => Math.max(...s.map((e) => e.y));
    // 1.5× the extent…
    expect(maxY(scaled)).toBeCloseTo(maxY(plain) * 1.5, 5);
    // …achieved by more penetrations at the same physical 0.4 mm step, not by
    // stretching the existing ones.
    expect(scaled.length).toBeGreaterThan(plain.length * 1.4);
  });
});

// ── 10: underlay auto-pick from the max realized width (§9 / §12) ────────────
describe('underlay auto-pick by max realized width', () => {
  const U = (src: string) => evts(src).filter((e) => e.t === 'stitch' && e.u === 1);
  it('a column wide only at its middle gets zigzag underlay along its whole length', () => {
    const u = U(`def c(t,s,i,u) [ let w = sin(s*180)*5\nreturn [0.4, w, w, 0, 0] ]
underlay "auto
lock 0 satin @c
fd 40`);
    expect(u.length).toBeGreaterThan(0);
    // underlay spans the full column, not just the wide middle
    expect(Math.min(...u.map((e) => e.y))).toBeLessThan(2);
    expect(Math.max(...u.map((e) => e.y))).toBeGreaterThan(38);
  });

  it('a uniformly narrow column gets no underlay', () => {
    const u = U(`def c(t,s,i,u) [ return [0.4, 0.5, 0.5, 0, 0] ]
underlay "auto
lock 0 satin @c
fd 40`);
    expect(u.length).toBe(0);
  });
});

// ── §12 open decisions: confirmed behaviours ─────────────────────────────────
describe('confirmed open decisions', () => {
  it('s spans the whole assembled spine across a pen-down corner', () => {
    // two equal-length subpaths joined by a pen-down turn ⇒ one column, s runs
    // 0…~1 over the whole 20 mm, not per-segment.
    const printed = run(`def c(t,s,i,u) [ print s\nreturn [1, 2, 2, 0, 0] ]
lock 0 satin @c
fd 10 rt 90 fd 10`).printed.map(Number);
    expect(printed[0]).toBeCloseTo(0, 6);
    // the corner is at the midpoint of the assembled 20 mm spine ⇒ s passes
    // ~0.5; were it per-segment it would reset to 0 after the turn.
    expect(printed.some((s) => s > 0.45 && s < 0.55)).toBe(true);
    expect(Math.max(...printed)).toBeLessThan(1);
    // monotone non-decreasing — one continuous normalization, no per-leg reset
    for (let k = 1; k < printed.length; k++)
      expect(printed[k]).toBeGreaterThanOrEqual(printed[k - 1]);
  });

  it('engaging satin @fn with a non-default density emits a one-time note', () => {
    const w = warns(`def c(t,s,i,u) [ return [0.4, 2, 2, 0, 0] ]
density 1.0
satin @c
fd 10`);
    expect(w.filter((s) => /density is ignored while satin/.test(s)).length).toBe(1);
  });

  it('numeric satin after @fn returns to the built-in generator', () => {
    // engage a half-width-1 reporter, disengage, then run a built-in satin 4.
    // The trailing column must sew at the built-in half-width (±2), proving the
    // reporter is gone — not the reporter's ±1.
    const ev = evts(`def c(t,s,i,u) [ return [0.3, 1, 1, 0, 0] ]
lock 0 satin @c
fd 5
trim
satin 0
satin 4
fd 20`);
    const trimIdx = ev.findIndex((e) => e.t === 'trim');
    const tail = ev.slice(trimIdx + 1).filter((e) => e.t === 'stitch');
    const maxOff = Math.max(...tail.map((e) => Math.abs(e.x)));
    expect(maxOff).toBeCloseTo(2, 5); // built-in satin 4 ⇒ ±2, not the reporter's ±1
  });
});
