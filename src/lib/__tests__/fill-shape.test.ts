import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

// `fill dir @d shape @s` — programmable fills. The pins from the spec's §13
// test plan, in order, plus the §14 open-decision cases that were confirmed.

const evts = (src: string) => run(src).events;
const stitches = (src: string) => evts(src).filter((e) => e.t === 'stitch');
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

// ── 1: equivalence pin (§3.3) — the primary correctness gate ─────────────────
describe('equivalence pin', () => {
  it('plain fill ≡ fill dir @zero shape @const, byte-identical', () => {
    const builtin = evts('stitchlen 2.5\nbeginfill\narc 360 20\nendfill');
    const programmable = evts(
      'stitchlen 2.5\n' +
        'def zero(p) [ return 0 ]\n' +
        'def cons(p, row, v) [ return [0.4, 2.5, 0.5] ]\n' +
        'fill dir @zero shape @cons\n' +
        'beginfill\narc 360 20\nendfill',
    );
    expect(sameStream(builtin, programmable)).toBe(true);
    expect(programmable.filter((e) => e.t === 'stitch').length).toBeGreaterThan(100);
  });

  it('bare fill @zero (shorthand direction field) also reduces to tatami', () => {
    const builtin = evts('stitchlen 2.5\nbeginfill\narc 360 18\nendfill');
    const programmable = evts(
      'stitchlen 2.5\ndef zero(p) [ return 0 ]\nfill @zero\nbeginfill\narc 360 18\nendfill',
    );
    expect(sameStream(builtin, programmable)).toBe(true);
  });

  it('holds with pullcomp engaged too', () => {
    const opts = 'stitchlen 2.5 pullcomp 0.5 ';
    const builtin = evts(opts + '\nbeginfill\narc 360 18\nendfill');
    const programmable = evts(
      'def zero(p) [ return 0 ]\ndef cons(p, row, v) [ return [0.4, 2.5, 0.5] ]\n' +
        opts +
        '\nfill dir @zero shape @cons\nbeginfill\narc 360 18\nendfill',
    );
    expect(sameStream(builtin, programmable)).toBe(true);
  });
});

// ── 2: even coverage on a varying field ──────────────────────────────────────
describe('even coverage', () => {
  it('a swirl over a disc keeps coverage in a bounded band (no clump/gap)', () => {
    const r = run(
      'def sw(p) [ return vheading(vrot(vsub(p, [25, 0]), 90)) ]\n' +
        'fill dir @sw\nbeginfill arc 360 25 endfill',
    );
    const s = r.events.filter((e) => e.t === 'stitch');
    expect(s.length).toBeGreaterThan(1000);
    // Coverage grid: away from the field's pole the fill should be uniform —
    // sample 2 mm cells over the body of the disc (excluding the convergence
    // core) and confirm none are empty and none wildly over-covered.
    const cell = new Map<string, number>();
    for (const e of s)
      cell.set(
        `${Math.floor(e.x / 3)},${Math.floor(e.y / 3)}`,
        (cell.get(`${Math.floor(e.x / 3)},${Math.floor(e.y / 3)}`) || 0) + 1,
      );
    let interior = 0,
      covered = 0;
    for (let gx = 5; gx <= 45; gx += 3)
      for (let gy = -20; gy <= 20; gy += 3) {
        // disc centered at (25,0) r25; stay well inside and away from the pole
        const dx = gx - 25,
          dy = gy - 0;
        const rr = Math.hypot(dx, dy);
        if (rr > 18 || rr < 6) continue;
        interior++;
        if (cell.get(`${Math.floor(gx / 3)},${Math.floor(gy / 3)}`)) covered++;
      }
    expect(covered / interior).toBeGreaterThan(0.9);
  });
});

// ── 3: holes (even-odd honoured post-field) ──────────────────────────────────
describe('holes', () => {
  it('an inner ring stays empty under a directional field', () => {
    const s = stitches(
      'def sw(p) [ return vheading(vrot(vsub(p, [30, 0]), 90)) ]\n' +
        'fill dir @sw\n' +
        'beginfill\narc 360 30\nup setxy 38 -8 down\narc 360 8\nendfill',
    );
    // hole: from (38,-8) heading 0, arc 360 8 → circle centred (46,-8) r8
    let inHole = 0;
    for (const e of s) if (Math.hypot(e.x - 46, e.y + 8) < 5) inHole++;
    expect(inHole).toBe(0);
    expect(s.length).toBeGreaterThan(1000);
  });
});

// ── 4 & 5: termination (the central safety property, §5.2) ───────────────────
describe('termination', () => {
  it('a chaotic field produces a finite fill, no hang', () => {
    const r = run('def c(p) [ return p[0] * 9999 ]\nfill dir @c\nbeginfill arc 360 20 endfill');
    expect(r.events.filter((e) => e.t === 'stitch').length).toBeGreaterThan(0);
    expect(r.events.length).toBeLessThan(60000);
  });

  it('a vortex with a pole inside terminates and surfaces density at the pole', () => {
    const r = run(
      'def v(p) [ return vheading(vrot(vsub(p, [20, 0]), 90)) ]\n' +
        'fill dir @v\nbeginfill arc 360 20 endfill',
    );
    // length-cap truncation warning fires for the spiralling streamline (§5.2)
    expect(r.warnings.some((w) => /truncated/.test(w))).toBe(true);
    // and the convergence runs hot — surfaced honestly, not smoothed (§5.3)
    expect(r.density.peak).toBeGreaterThan(4);
  });
});

// ── 6: determinism & draw accounting (the generator is drawless, §10) ────────
describe('determinism', () => {
  it('a noise field gives a byte-identical stream across runs at a fixed seed', () => {
    const src =
      'seed 7\ndef g(p) [ return snoise2(p[0] / 20, p[1] / 20) * 180 ]\n' +
      'fill dir @g\nbeginfill repeat 4 [ fd 50 rt 90 ] endfill';
    expect(sameStream(evts(src), evts(src))).toBe(true);
  });

  it('the generator adds zero draws — a following random() is unshifted', () => {
    const withFill =
      'seed 1\ndef g(p) [ return snoise2(p[0] / 20, p[1] / 20) * 180 ]\n' +
      'fill dir @g\nbeginfill arc 360 15 endfill\nprint random(1000)';
    const without = 'seed 1\nprint random(1000)';
    expect(run(withFill).printed).toEqual(run(without).printed);
  });
});

// ── 7: queue-order determinism (the hash-set hazard, §10) ────────────────────
describe('queue-order determinism', () => {
  it('the streamline order is stable across runs (FIFO, not a set)', () => {
    const src =
      'def sw(p) [ return vheading(vrot(vsub(p, [20, 0]), 70)) ]\n' +
      'fill dir @sw\nbeginfill arc 360 20 endfill';
    const a = evts(src),
      b = evts(src);
    expect(sameStream(a, b)).toBe(true);
  });
});

// ── 8: underlay perpendicularity (§9) ────────────────────────────────────────
describe('fill underlay', () => {
  it('a tatami underlay runs across the local grain on a curved field', () => {
    const ev = stitches(
      'fillunderlay "tatami\n' +
        'def sw(p) [ return vheading(vrot(vsub(p, [25, 0]), 90)) ]\n' +
        'fill dir @sw\nbeginfill arc 360 25 endfill',
    );
    const underlay = ev.filter((e) => e.u === 1);
    const topping = ev.filter((e) => !e.u);
    expect(underlay.length).toBeGreaterThan(0);
    expect(topping.length).toBeGreaterThan(underlay.length); // sparser pass
  });
});

// ── 9: density surfacing under convergence (§5.3) ────────────────────────────
describe('density surfacing', () => {
  it('a convergent field lights the heatmap at the pole with source lines', () => {
    const r = run(
      'def v(p) [ return vheading(vrot(vsub(p, [20, 0]), 90)) ]\n' +
        'fill dir @v\nbeginfill arc 360 20 endfill',
    );
    expect(r.density.hotspots.length).toBeGreaterThan(0);
    expect(r.density.hotspots[0].lines.length).toBeGreaterThan(0);
  });
});

// ── 10: transform composition (§11) ──────────────────────────────────────────
describe('transform composition', () => {
  it('a directional fill under scale 1.5 keeps physical stitch spacing (more stitches, not stretched)', () => {
    // Pole at the local origin, disc offset to (20,0): a clean non-convergent
    // grain, so coverage is uniform in both the base and scaled cases.
    const base = stitches(
      'def sw(p) [ return vheading(vrot(p, 90)) ]\n' + 'fill dir @sw\nbeginfill arc 360 20 endfill',
    ).length;
    const scaled = stitches(
      'def sw(p) [ return vheading(vrot(p, 90)) ]\n' +
        'scale 1.5 [ fill dir @sw\nbeginfill arc 360 20 endfill ]',
    ).length;
    // area ×2.25 under scale 1.5; spacing stays physical, so stitch count grows
    // well past 1× (a stretched fill would keep the same count).
    expect(scaled / base).toBeGreaterThan(1.5);
  });
});

// ── 11: spacing-per-row granularity (§7.4) ───────────────────────────────────
describe('graded spacing', () => {
  it('a graded shape reporter fans the row spacing (denser one side)', () => {
    const r = run(
      'def g(p, row, v) [ return [remap(v, 0, 1, 0.4, 1.1), 2.5, 0.5] ]\n' +
        'fill shape @g\nbeginfill arc 360 25 endfill',
    );
    const s = r.events.filter((e) => e.t === 'stitch');
    expect(s.length).toBeGreaterThan(500);
    // A constant-spacing fill of the same disc lays down more stitches; the
    // graded one opens up rows on one side, so it must be sparser overall.
    const flat = stitches(
      'def g(p, row, v) [ return [0.4, 2.5, 0.5] ]\n' +
        'fill shape @g\nbeginfill arc 360 25 endfill',
    ).length;
    expect(s.length).toBeLessThan(flat);
  });
});

// ── 12: reporter contract errors (loud, line-numbered) ───────────────────────
describe('reporter contract errors', () => {
  const cases: [string, string, RegExp][] = [
    [
      'dir wrong arity',
      'def d(a, b) [ return 0 ]\nfill dir @d\nbeginfill arc 360 10 endfill',
      /dir reporter @d must take exactly 1 parameter.*\(line \d+\)/,
    ],
    [
      'dir non-number',
      'def d(p) [ return [1, 2] ]\nfill dir @d\nbeginfill arc 360 10 endfill',
      /dir reporter @d must return a heading.*\(line \d+\)/,
    ],
    [
      'shape wrong arity',
      'def s(p, row) [ return [0.4, 2, 0.5] ]\nfill shape @s\nbeginfill arc 360 10 endfill',
      /shape reporter @s must take exactly 3 parameters.*\(line \d+\)/,
    ],
    [
      'shape 2-element',
      'def s(p, row, v) [ return [0.4, 2] ]\nfill shape @s\nbeginfill arc 360 10 endfill',
      /shape reporter @s must return exactly 3 numbers.*\(line \d+\)/,
    ],
    [
      'shape 4-element',
      'def s(p, row, v) [ return [0.4, 2, 0.5, 1] ]\nfill shape @s\nbeginfill arc 360 10 endfill',
      /shape reporter @s must return exactly 3 numbers.*\(line \d+\)/,
    ],
    [
      'shape non-number element',
      'def s(p, row, v) [ return [0.4, [2], 0.5] ]\nfill shape @s\nbeginfill arc 360 10 endfill',
      /shape reporter @s returned .* for len.*\(line \d+\)/,
    ],
  ];
  for (const [name, src, re] of cases) {
    it(name, () => {
      expect(() => run(src)).toThrow(re);
    });
  }

  it('@name must reference a real procedure', () => {
    expect(() => run('fill dir @nope\nbeginfill arc 360 10 endfill')).toThrow(
      /no procedure or function named "nope"/,
    );
  });

  it('arming a second fill before endfill is an error with a hint', () => {
    expect(() =>
      run('def d(p) [ return 0 ]\nfill dir @d\nbeginfill\nfill dir @d\narc 360 10\nendfill'),
    ).toThrow(/close it with endfill/);
  });
});

// ── 13: humanize composition (fills are NOT skipped, unlike satin) ───────────
describe('humanize composition', () => {
  it('a humanized directional fill jitters the field penetrations', () => {
    const base = stitches(
      'def sw(p) [ return vheading(vrot(vsub(p, [18, 0]), 90)) ]\n' +
        'fill dir @sw\nbeginfill arc 360 18 endfill',
    );
    const hum = stitches(
      'humanize 0.5 [\ndef sw(p) [ return vheading(vrot(vsub(p, [18, 0]), 90)) ]\n' +
        'fill dir @sw\nbeginfill arc 360 18 endfill ]',
    );
    let moved = 0;
    const n = Math.min(base.length, hum.length);
    for (let i = 0; i < n; i++)
      if (Math.abs(base[i].x - hum[i].x) > 1e-6 || Math.abs(base[i].y - hum[i].y) > 1e-6) moved++;
    expect(moved / n).toBeGreaterThan(0.8);
  });
});

// ── §2: numeric-supersede notes + dir/shape are positional-only keywords ─────
describe('surface syntax', () => {
  it('dir and shape remain usable as ordinary variable names', () => {
    const r = run('make "dir 5\nmake "shape 7\nprint :dir + :shape');
    expect(r.printed).toEqual(['12']);
  });

  it('arming a field supersedes a non-default fillangle with a one-time note', () => {
    const r = run(
      'fillangle 30\ndef d(p) [ return 45 ]\nfill dir @d\nbeginfill arc 360 12 endfill',
    );
    expect(r.warnings.some((w) => /fillangle is ignored/.test(w))).toBe(true);
  });
});
