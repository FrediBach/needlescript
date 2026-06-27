// ---------- Transforms (CTM stack + pure path functions) test matrix ----------
//
// The block commands (translate/rotate/scale/…) push a transform onto a CTM
// stack; the turtle stays in untransformed local space (Option A) and only
// emitted geometry is mapped — with stitch-length splitting, satin width and
// the physics layer applied *after* the transform. The pure path functions
// (xlate/xrotate/xscale/xmirror) use the same matrices, so a block and the
// matching function produce identical stitches.

import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';
import { apply, compose, mTranslate, mRotate, mRotateAbout, mMirror } from '../affine.ts';
import type { Mat } from '../affine.ts';

const ev = (s: string) => run(s).events;
const printed = (s: string) => run(s).printed;
const warnings = (s: string) => run(s).warnings;

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Strip line tags and round coordinates so float noise doesn't matter. */
function clean(evs: StitchEvent[]) {
  return evs.map((e) => ({ t: e.t, x: r4(e.x), y: r4(e.y), c: e.c, ...(e.u ? { u: e.u } : {}) }));
}

/** Map every event coordinate through a matrix (for the isometry invariant). */
function mapped(evs: StitchEvent[], m: Mat) {
  return evs.map((e) => {
    const [x, y] = apply(m, e.x, e.y);
    return { t: e.t, x: r4(x), y: r4(y), c: e.c, ...(e.u ? { u: e.u } : {}) };
  });
}

// ── 1: isometries — T[PROG] == T applied to PROG's events ────────────────────
//
// Translations, rotations and reflections preserve distance, so the stitch
// count is identical and every emitted point is just the transform of the
// untransformed point — including the implicit start stitch.
describe('isometries map the whole event stream', () => {
  const PROG = 'stitchlen 2 down fd 10 rt 90 fd 8 arc 90 6 lt 40 fd 5';

  it('translate', () => {
    expect(clean(ev(`translate 7 -3 [ ${PROG} ]`))).toEqual(mapped(ev(PROG), mTranslate(7, -3)));
  });

  it('rotate about the origin', () => {
    expect(clean(ev(`rotate 37 [ ${PROG} ]`))).toEqual(mapped(ev(PROG), mRotate(37)));
  });

  it('rotateabout an explicit pivot', () => {
    expect(clean(ev(`rotateabout 90 5 5 [ ${PROG} ]`))).toEqual(
      mapped(ev(PROG), mRotateAbout(90, 5, 5)),
    );
  });

  it('mirror', () => {
    expect(clean(ev(`mirror 25 [ ${PROG} ]`))).toEqual(mapped(ev(PROG), mMirror(25)));
  });

  it('a satin column maps as a rigid body under rotation', () => {
    const SAT = 'satin 2.4 down fd 14 satin 0';
    expect(clean(ev(`rotate 50 [ ${SAT} ]`))).toEqual(mapped(ev(SAT), mRotate(50)));
  });

  it('a transformed fill covers the transformed boundary', () => {
    // The fill scan grid is anchored to the global hoop (so abutting fills
    // keep a consistent density) and fillangle is hoop-space, so a fill is
    // not a naive rigid-body map — but it must still cover the moved shape.
    const FILL = 'down beginfill repeat 4 [ fd 16 rt 90 ] endfill';
    const m = mRotate(35);
    const corners: [number, number][] = [
      [0, 0],
      [0, 16],
      [16, 16],
      [16, 0],
    ];
    const cs = corners.map(([x, y]) => apply(m, x, y));
    const bb = (xs: number[]) => [Math.min(...xs), Math.max(...xs)];
    const [cxlo, cxhi] = bb(cs.map((p) => p[0]));
    const [cylo, cyhi] = bb(cs.map((p) => p[1]));
    const fill = ev(`rotate 35 [ ${FILL} ]`).filter((e) => e.t === 'stitch');
    const [fxlo, fxhi] = bb(fill.map((e) => e.x));
    const [fylo, fyhi] = bb(fill.map((e) => e.y));
    // Fill bbox sits inside the boundary bbox, within ~1.5 mm of each edge.
    expect(fxlo).toBeGreaterThan(cxlo - 1.5);
    expect(fxhi).toBeLessThan(cxhi + 1.5);
    expect(fylo).toBeGreaterThan(cylo - 1.5);
    expect(fyhi).toBeLessThan(cyhi + 1.5);
    expect(fxhi - fxlo).toBeGreaterThan(cxhi - cxlo - 3); // actually fills it
  });

  it('fillangle is interpreted in hoop space, so rotation re-flows the rows', () => {
    // A deliberate consequence of the hoop-space fillangle decision: the fill
    // rows stay aligned to the hoop, they do not rotate with the motif — so a
    // rotated fill is NOT a naive rigid-body rotation of the unrotated one.
    const FILL = 'down beginfill repeat 4 [ fd 16 rt 90 ] endfill';
    const rotated = clean(ev(`rotate 35 [ ${FILL} ]`));
    const rigid = mapped(ev(FILL), mRotate(35));
    expect(rotated).not.toEqual(rigid);
    // …but it still sews a real fill.
    expect(rotated.filter((e) => e.t === 'stitch').length).toBeGreaterThan(20);
  });

  it('nested isometries compose inside-out', () => {
    expect(clean(ev(`translate 10 0 [ rotate 90 [ ${PROG} ] ]`))).toEqual(
      mapped(ev(PROG), compose(mTranslate(10, 0), mRotate(90))),
    );
  });
});

// ── 2: block command ≡ pure path function (origin-fixing transforms) ─────────
//
// scale/scalexy/rotate/mirror all fix the origin, so `S [ sewpath(p) ]` and
// `sewpath(xS(p))` split in the same hoop space and emit identical stitches.
describe('block transform ≡ pure x* function', () => {
  const P = '[[0,0],[12,0],[12,9],[3,14]]';
  const same = (block: string, fn: string) => expect(clean(ev(block))).toEqual(clean(ev(fn)));

  it('scale ≡ xscale (uniform)', () => {
    same(`scale 2 [ sewpath(${P}) ]`, `sewpath(xscale(${P}, 2))`);
  });

  it('scalexy ≡ xscale (independent axes)', () => {
    same(`scalexy 2 1.5 [ sewpath(${P}) ]`, `sewpath(xscale(${P}, 2, 1.5))`);
  });

  it('rotate ≡ xrotate', () => {
    same(`rotate 40 [ sewpath(${P}) ]`, `sewpath(xrotate(${P}, 40))`);
  });

  it('mirror ≡ xmirror', () => {
    same(`mirror 30 [ sewpath(${P}) ]`, `sewpath(xmirror(${P}, 30))`);
  });

  it('skew ≡ the raw transform matrix it builds', () => {
    const tx = Math.tan((10 * Math.PI) / 180),
      ty = Math.tan((5 * Math.PI) / 180);
    same(`skew 10 5 [ sewpath(${P}) ]`, `transform 1 ${ty} ${tx} 1 0 0 [ sewpath(${P}) ]`);
  });
});

// ── 3: physics applied AFTER the transform ───────────────────────────────────
describe('stitch physics run on post-transform geometry', () => {
  it('stitch length stays physical under scale (split in hoop space)', () => {
    const plain = ev('lock 0 stitchlen 2.5 down fd 10').filter((e) => e.t === 'stitch');
    const scaled = ev('lock 0 scale 4 [ stitchlen 2.5 down fd 10 ]').filter(
      (e) => e.t === 'stitch',
    );
    // 10 mm → 40 mm in hoop, so ~4× as many 2.5 mm stitches.
    expect(scaled.length).toBeGreaterThan(plain.length * 3);
    // No emitted segment exceeds the machine-safe stitch length.
    for (let i = 1; i < scaled.length; i++) {
      const d = Math.hypot(scaled[i].x - scaled[i - 1].x, scaled[i].y - scaled[i - 1].y);
      expect(d).toBeLessThanOrEqual(2.5 + 1e-6);
    }
  });

  it('pull compensation is NOT scaled by the transform', () => {
    // North-running column, scale 2: width = satin·2 + pullcomp (pull unscaled).
    const evs = ev('pullcomp 0.5 satin 2 down fd 20 satin 0').filter((e) => e.t === 'stitch');
    const span = (es: StitchEvent[]) =>
      Math.max(...es.map((e) => e.x)) - Math.min(...es.map((e) => e.x));
    const scaled = ev('scale 2 [ pullcomp 0.5 satin 2 down fd 20 satin 0 ]').filter(
      (e) => e.t === 'stitch',
    );
    expect(r4(span(evs))).toBeCloseTo(2.5, 1); // 2 + 0.5
    expect(r4(span(scaled))).toBeCloseTo(4.5, 1); // 2·2 + 0.5, NOT (2+0.5)·2 = 5
  });

  it('non-uniform scale makes satin width direction-dependent', () => {
    // scalexy 2 1: a column running north doubles its (x) width; one running
    // east keeps its (y) width.
    const north = ev('scalexy 2 1 [ satin 2 down fd 12 satin 0 ]').filter((e) => e.t === 'stitch');
    const east = ev('scalexy 2 1 [ satin 2 down rt 90 fd 12 satin 0 ]').filter(
      (e) => e.t === 'stitch',
    );
    const xSpan = (es: StitchEvent[]) =>
      Math.max(...es.map((e) => e.x)) - Math.min(...es.map((e) => e.x));
    const ySpan = (es: StitchEvent[]) =>
      Math.max(...es.map((e) => e.y)) - Math.min(...es.map((e) => e.y));
    expect(xSpan(north)).toBeCloseTo(4, 0); // width ≈ 2·2
    expect(ySpan(east)).toBeCloseTo(2, 0); // width ≈ 2·1
  });
});

// ── 4: Option A — the turtle lives in untransformed local space ──────────────
describe('Option A: reporters and randomness are transform-invariant', () => {
  it('xcor/ycor report local (pre-transform) coordinates', () => {
    expect(printed('scale 3 [ fd 10 print xcor print ycor ]')).toEqual(
      printed('fd 10 print xcor print ycor'),
    );
    expect(printed('scale 3 [ fd 10 print xcor print ycor ]')).toEqual(['0', '10']);
  });

  it('distance is measured in local space', () => {
    expect(printed('scale 5 [ fd 10 print distance(0, 0) ]')).toEqual(['10']);
  });

  it('wrapping a motif in a transform does not reshuffle the RNG', () => {
    expect(printed('seed 7 print random(100) translate 50 0 [ print random(100) ]')).toEqual(
      printed('seed 7 print random(100) print random(100)'),
    );
  });
});

// ── 5: both spellings of the block command ───────────────────────────────────
describe('classic prefix and glued-paren spellings agree', () => {
  it('translate 20 0 ≡ translate(20, 0) ≡ glued bracket', () => {
    const a = clean(ev('translate 20 0 [ fd 10 ]'));
    expect(clean(ev('translate(20, 0) [ fd 10 ]'))).toEqual(a);
    expect(clean(ev('translate(20, 0)[ fd 10 ]'))).toEqual(a);
  });

  it('scale 2 ≡ scale(2)', () => {
    expect(clean(ev('scale 2 [ down fd 5 ]'))).toEqual(clean(ev('scale(2) [ down fd 5 ]')));
  });
});

// ── 6: mirror conventions ────────────────────────────────────────────────────
describe('mirror conventions', () => {
  it('mirror 0 flips left/right (x → −x)', () => {
    const last = ev('mirror 0 [ down setpos([5, 7]) setpos([1, 2]) ]').at(-1)!;
    expect([r4(last.x), r4(last.y)]).toEqual([-1, 2]);
  });

  it('mirror 90 flips top/bottom (y → −y)', () => {
    const last = ev('mirror 90 [ down setpos([5, 7]) setpos([1, 2]) ]').at(-1)!;
    expect([r4(last.x), r4(last.y)]).toEqual([1, -2]);
  });
});

// ── 7: nesting order (OpenSCAD inside-out) ───────────────────────────────────
describe('composition order', () => {
  const P = '[[1, 0], [1, 0]]';
  it('translate-of-scale ≠ scale-of-translate', () => {
    const ts = ev(`translate 10 0 [ scale 2 [ sewpath(${P}) ] ]`).at(-1)!;
    const st = ev(`scale 2 [ translate 10 0 [ sewpath(${P}) ] ]`).at(-1)!;
    expect([r4(ts.x), r4(ts.y)]).toEqual([12, 0]); // T(S([1,0])) = T([2,0])
    expect([r4(st.x), r4(st.y)]).toEqual([22, 0]); // S(T([1,0])) = S([11,0])
  });
});

// ── 8: pure path functions ───────────────────────────────────────────────────
describe('pure path functions are pure and correct', () => {
  it('xlate returns a new path and leaves the original untouched', () => {
    expect(printed('let p = [[0,0],[1,1]] let q = xlate(p, 5, 0) print q print p')).toEqual([
      '[[5, 0], [6, 1]]',
      '[[0, 0], [1, 1]]',
    ]);
  });

  it('xrotate rotates clockwise (matching vrot/rt)', () => {
    // (1,0) is east; rotating clockwise 90° points south → (0,-1).
    expect(printed('print xrotate([[1,0],[1,0]], 90)')).toEqual(['[[0, -1], [0, -1]]']);
  });

  it('xrotate honours an explicit pivot', () => {
    expect(printed('print first(xrotate([[2,1],[2,1]], 180, 1, 1))')).toEqual(['[0, 1]']);
  });

  it('xscale scales independently', () => {
    expect(printed('print xscale([[2,3],[2,3]], 2, 4)')).toEqual(['[[4, 12], [4, 12]]']);
  });

  it('xmirror reflects across the heading line', () => {
    expect(printed('print xmirror([[5,7],[1,2]], 0)')).toEqual(['[[-5, 7], [-1, 2]]']);
  });
});

// ── 9: parse / naming errors ─────────────────────────────────────────────────
describe('errors', () => {
  it('transform words are reserved core names (cannot be shadowed)', () => {
    expect(() => run('let scale = 1')).toThrow(/"scale" is a reserved word/);
    expect(() => run('let transform = 1')).toThrow(/"transform" is a reserved word/);
    expect(() => run('def rotate(n) [ fd n ]')).toThrow(/built-in word/);
  });

  it('a transform needs a block', () => {
    expect(() => run('translate(20, 0)')).toThrow(/needs a block/);
  });

  it('wrong arity names the transform', () => {
    expect(() => run('translate(1) [ fd 1 ]')).toThrow(/translate\(…\) expects 2 arguments, got 1/);
  });

  it('xrotate rejects a half-given pivot (3 args)', () => {
    expect(() => run('print xrotate([[0,0],[1,1]], 10, 5)')).toThrow(/pivot as two numbers/);
  });
});

// ── 10: identity transforms are no-ops ───────────────────────────────────────
describe('identity transforms change nothing', () => {
  const PROG = 'satin 1.5 down fd 10 satin 0 rt 90 fd 6';
  it('translate 0 0 / scale 1 / rotate 0 are no-ops', () => {
    const base = clean(ev(PROG));
    expect(clean(ev(`translate 0 0 [ ${PROG} ]`))).toEqual(base);
    expect(clean(ev(`scale 1 [ ${PROG} ]`))).toEqual(base);
    expect(clean(ev(`rotate 0 [ ${PROG} ]`))).toEqual(base);
    expect(warnings(`scale 1 [ ${PROG} ]`)).toEqual(warnings(PROG));
  });
});
