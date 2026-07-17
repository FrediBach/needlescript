// ---------- Effects (warp / humanize / snaptogrid + path companions) ----------
//
// Effects generalize transforms (see transforms.test.ts): instead of a fixed
// affine matrix, an effect is an arbitrary per-point map. They live on the same
// block-scoped discipline as transforms but split into two pipeline stages:
//
//   • warp        — pre-split, post-CTM, local frame (a geometric deformation
//                   of the emitted path vertices, exactly like a transform), so
//                   `warp @f [ sewpath(P) ]` ≡ sewpath(warppath(P, @f)) exactly.
//   • humanize    — after split, hoop frame, seeded coherent jitter, forks once.
//   • snaptogrid  — after split, fixed hoop lattice (frame-invariant), drawless.
//
// Because the block forms and the *path functions share one implementation,
// they are pinned identical here — on pre-resampled paths for the after-split
// effects, where stitch splitting is a no-op (the same caveat the proposal
// calls out). The leading start anchor and jumps are positioning, not
// penetrations, so after-split effects leave them alone (which is exactly what
// keeps the block≡function identity clean).

import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

const ev = (s: string) => run(s).events;
const warnings = (s: string) => run(s).warnings;

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Strip line tags and round coordinates so float noise doesn't matter. */
function clean(evs: StitchEvent[]) {
  return evs.map((e) => ({ t: e.t, x: r4(e.x), y: r4(e.y), c: e.c, ...(e.u ? { u: e.u } : {}) }));
}

const stitches = (s: string) => run(s).events.filter((e) => e.t === 'stitch');

// A reporter that fixes the origin (sin(0) = 0) so the implicit start anchor
// maps to itself — the one care needed to compare a warp block against warppath
// vertex-for-vertex (the same way scaling fixes the origin for transforms).
const RIPPLE = 'def ripple(p) [ return [p[0] + 2 * sin(p[1] * 6), p[1]] ]\n';
const ID = 'def id(p) [ return p ]\n';

// ── 1: warp is a pre-split vertex map, identical to warppath ─────────────────
describe('warp ≡ warppath (exact, like transforms)', () => {
  // A polyline whose gaps are all under the (max) stitch length, so splitting
  // never inserts vertices — block and function then map the same points.
  const P = '[[4, 1], [8, 3], [11, 7], [13, 12], [9, 15]]';

  function same(block: string, fn: string) {
    expect(clean(ev(block))).toEqual(clean(ev(fn)));
  }

  it('a nonlinear warp block equals the matching warppath', () => {
    same(
      `${RIPPLE}stitchlen 12\nwarp @ripple [ down sewpath(${P}) ]`,
      `${RIPPLE}stitchlen 12\ndown sewpath(warppath(${P}, @ripple))`,
    );
  });

  it('the identity reporter is a no-op (== unwrapped)', () => {
    expect(clean(ev(`${ID}warp @id [ repeat 5 [ fd 8 rt 72 ] ]`))).toEqual(
      clean(ev('repeat 5 [ fd 8 rt 72 ]')),
    );
  });

  it('warp actually displaces geometry (not a no-op)', () => {
    const moved = stitches('def sh(p) [ return [p[0] + 5, p[1]] ]\nwarp @sh [ fd 10 ]');
    // every penetration shifted +5 in x from the straight x=0 line
    expect(moved.length).toBeGreaterThan(1);
    expect(moved.every((e) => Math.abs(e.x - 5) < 1e-9)).toBe(true);
  });

  it('warp draws nothing from the seeded stream (cost 0)', () => {
    const withWarp = run(`${ID}seed 7\nwarp @id [ fd 5 ]\nprint random(1000)`).printed[0];
    const without = run('seed 7\nprint random(1000)').printed[0];
    expect(withWarp).toBe(without);
  });

  it('both call spellings agree (prefix, glued paren, glued bracket)', () => {
    const a = clean(ev(`${ID}warp @id [ fd 10 rt 30 fd 5 ]`));
    expect(clean(ev(`${ID}warp(@id) [ fd 10 rt 30 fd 5 ]`))).toEqual(a);
    expect(clean(ev(`${ID}warp(@id)[ fd 10 rt 30 fd 5 ]`))).toEqual(a);
  });
});

// ── 2: warp composition with transforms — nesting order matters ──────────────
describe('warp composes inside-out with transforms', () => {
  // `scale [ warp [ … ] ]` ≠ `warp [ scale [ … ] ]` for a position-dependent
  // reporter: the two read inside-out as scale(ripple(p)) vs ripple(scale(p)).
  const PROG = 'down fd 10 rt 40 fd 6';
  it('order is observable (the two nestings differ)', () => {
    const inner = clean(ev(`${RIPPLE}scale 2 [ warp @ripple [ ${PROG} ] ]`));
    const outer = clean(ev(`${RIPPLE}warp @ripple [ scale 2 [ ${PROG} ] ]`));
    expect(inner).not.toEqual(outer);
  });
  it('post-warp geometry is still hoop/physics checked (no segment over max)', () => {
    // A wild warp that flings points far still gets split into legal stitches.
    const evs = stitches('def blow(p) [ return vscale(p, 3) ]\nwarp @blow [ fd 30 ]');
    for (let i = 1; i < evs.length; i++) {
      const d = Math.hypot(evs[i].x - evs[i - 1].x, evs[i].y - evs[i - 1].y);
      expect(d).toBeLessThanOrEqual(12 + 1e-6); // LIMITS.maxStitch
    }
  });
});

// ── 3: humanize — seeded, coherent, after split, forks once ──────────────────
describe('humanize determinism and the fork convention', () => {
  it('same seed reproduces the same imperfections', () => {
    const a = clean(run('seed 9\nhumanize 0.4 [ repeat 4 [ fd 12 rt 90 ] ]').events);
    const b = clean(run('seed 9\nhumanize 0.4 [ repeat 4 [ fd 12 rt 90 ] ]').events);
    expect(a).toEqual(b);
  });

  it('humanize draws exactly one value (fork), regardless of stitch count', () => {
    const afterHumanize = run(
      'seed 7\nhumanize 0.5 [ repeat 20 [ fd 9 rt 18 ] ]\nprint random(1000)',
    ).printed[0];
    const afterOneDraw = run('seed 7\nlet a = random(1000)\nprint random(1000)').printed[0];
    const afterZeroDraw = run('seed 7\nprint random(1000)').printed[0];
    expect(afterHumanize).toBe(afterOneDraw); // exactly one
    expect(afterHumanize).not.toBe(afterZeroDraw); // not zero
  });

  it('editing the contents of a humanize block does not reshuffle downstream', () => {
    const few = run('seed 3\nhumanize 0.3 [ fd 5 ]\nprint random(99)').printed[0];
    const many = run('seed 3\nhumanize 0.3 [ repeat 30 [ fd 5 rt 12 ] ]\nprint random(99)')
      .printed[0];
    expect(few).toBe(many); // one draw either way — the whole point of forking
  });

  it('jitter stays within the amount (coherent offset is bounded)', () => {
    const amount = 0.6;
    const base = stitches('lock 0\nrepeat 6 [ fd 9 rt 60 ]');
    const jit = stitches(`lock 0\nseed 5\nhumanize ${amount} [ repeat 6 [ fd 9 rt 60 ] ]`);
    expect(jit.length).toBe(base.length);
    for (let i = 0; i < base.length; i++) {
      expect(Math.abs(jit[i].x - base[i].x)).toBeLessThanOrEqual(amount + 1e-9);
      expect(Math.abs(jit[i].y - base[i].y)).toBeLessThanOrEqual(amount + 1e-9);
    }
  });

  it('clamps the amount to 0–2 mm with a warning', () => {
    expect(warnings('humanize 5 [ fd 5 ]').some((w) => /clamped to 2 mm/.test(w))).toBe(true);
  });

  it('humanize 0 is a no-op on the geometry', () => {
    expect(clean(ev('seed 1\nhumanize 0 [ repeat 4 [ fd 10 rt 90 ] ]'))).toEqual(
      clean(ev('repeat 4 [ fd 10 rt 90 ]')),
    );
  });

  it('actually perturbs at a non-zero amount', () => {
    const plain = clean(stitches('repeat 4 [ fd 10 rt 90 ]'));
    const jit = clean(stitches('seed 1\nhumanize 0.8 [ repeat 4 [ fd 10 rt 90 ] ]'));
    expect(jit).not.toEqual(plain);
  });
});

// ── 4: humanize ≡ humanizepath on a pre-resampled (no-split) path ────────────
describe('humanize block ≡ humanizepath function', () => {
  // gaps < stitchlen so splitting is a no-op; P[0] ≠ origin so it gets its own
  // penetration in the block form (matching the function's first vertex).
  const P = '[[3, 1], [6, 2], [9, 4], [11, 7], [13, 11]]';
  it('the two forms produce the same penetrations', () => {
    const blk = clean(ev(`seed 4\nstitchlen 12\nlock 0\nhumanize 0.5 [ down sewpath(${P}) ]`));
    const fn = clean(ev(`seed 4\nstitchlen 12\nlock 0\ndown sewpath(humanizepath(${P}, 0.5))`));
    expect(blk).toEqual(fn);
  });
});

// ── 5: snaptogrid — fixed lattice, frame-invariant, drawless ─────────────────
const onLattice = (evs: StitchEvent[], cell: number) =>
  evs.every(
    (e) =>
      Math.abs(e.x / cell - Math.round(e.x / cell)) < 1e-9 &&
      Math.abs(e.y / cell - Math.round(e.y / cell)) < 1e-9,
  );

// The penetrations a snaptogrid block sews, excluding the entry anchor (the
// first stitch is thread positioning, like a jump — not a quantized penetration,
// which is exactly what keeps the block ≡ snappath identity clean).
const penetrations = (s: string) => stitches(s).slice(1);

describe('snaptogrid quantizes to a fixed hoop lattice', () => {
  // Start at the origin (on every origin-0 lattice) so the start anchor is on
  // the grid too; then every penetration must land on the lattice.
  const draw = 'down repeat 8 [ fd 7 rt 45 ]';

  it('every penetration lands on the lattice', () => {
    expect(onLattice(penetrations(`lock 0\nsnaptogrid 2 [ ${draw} ]`), 2)).toBe(true);
  });

  it('the grid is frame-invariant: a wrapping scale does not stretch it', () => {
    // scale is pre-split, snaptogrid is after-split against the global lattice —
    // so the lattice pitch is unchanged whether scale wraps it or not.
    expect(onLattice(penetrations(`lock 0\nscale 3 [ snaptogrid 2 [ ${draw} ] ]`), 2)).toBe(true);
    expect(onLattice(penetrations(`lock 0\nsnaptogrid 2 [ scale 3 [ ${draw} ] ]`), 2)).toBe(true);
    expect(onLattice(penetrations(`lock 0\ntranslate 5 5 [ snaptogrid 2 [ ${draw} ] ]`), 2)).toBe(
      true,
    );
    expect(onLattice(penetrations(`lock 0\nrotate 37 [ snaptogrid 2 [ ${draw} ] ]`), 2)).toBe(true);
  });

  it('the same config yields the same snap targets regardless of the transform', () => {
    // A point reached directly vs through a transform that lands it at the same
    // hoop coordinate snaps to the same node.
    const direct = stitches('lock 0\nsnaptogrid 2 [ down setxy(9, 5) ]');
    const viaXform = stitches('lock 0\ntranslate 4 1 [ snaptogrid 2 [ down setxy(5, 4) ] ]');
    const last = (a: StitchEvent[]) => a[a.length - 1];
    expect([r4(last(direct).x), r4(last(direct).y)]).toEqual([
      r4(last(viaXform).x),
      r4(last(viaXform).y),
    ]);
  });

  it('draws nothing and does not depend on the seed', () => {
    const a = run('seed 1\nsnaptogrid 2 [ repeat 6 [ fd 8 rt 60 ] ]\nprint random(1000)')
      .printed[0];
    const b = run('seed 1\nprint random(1000)').printed[0]; // zero draws
    expect(a).toBe(b);
    const s1 = clean(stitches('seed 1\nsnaptogrid 2 [ repeat 6 [ fd 8 rt 60 ] ]'));
    const s2 = clean(stitches('seed 999\nsnaptogrid 2 [ repeat 6 [ fd 8 rt 60 ] ]'));
    expect(s1).toEqual(s2); // seed-independent
  });

  it('rectangular / offset / rotated arity overloads parse and snap', () => {
    expect(
      onLattice(penetrations('lock 0\nsnaptogrid 2 4 [ down repeat 6 [ fd 9 rt 60 ] ]'), 2),
    ).toBe(true);
    // offset half a cell: points sit on an offset lattice (x - ox is a multiple)
    const off = penetrations('lock 0\nsnaptogrid(2, 2, 0.5, 0.5) [ down repeat 6 [ fd 9 rt 60 ] ]');
    expect(off.every((e) => Math.abs((e.x - 0.5) / 2 - Math.round((e.x - 0.5) / 2)) < 1e-9)).toBe(
      true,
    );
    // rotated grid still parses and runs
    expect(
      stitches('lock 0\nsnaptogrid(1.5, 1.5, 0, 0, 30) [ down repeat 6 [ fd 9 rt 60 ] ]').length,
    ).toBeGreaterThan(0);
  });

  it('rejects the invalid 3-argument form and non-positive cells', () => {
    expect(() => run('snaptogrid 1 2 3 [ fd 5 ]')).toThrow(/1, 2, 4 or 5/);
    expect(() => run('snaptogrid 0 [ fd 5 ]')).toThrow(/positive/);
  });

  it('block ≡ snappath on a pre-resampled path', () => {
    const P = '[[3, 1], [6, 2], [9, 4], [11, 7]]';
    const blk = clean(ev(`lock 0\nstitchlen 12\nsnaptogrid 2 [ down sewpath(${P}) ]`));
    const fn = clean(ev(`lock 0\nstitchlen 12\ndown sewpath(snappath(${P}, 2))`));
    expect(blk).toEqual(fn);
  });
});

// ── 6: collapsed penetrations merge with the tiny-stitch warning ─────────────
describe('snaptogrid collapses ride the tiny-stitch merge', () => {
  it('a too-coarse grid merges stacked penetrations and warns', () => {
    // Stitches ~1 mm apart snapped to a 4 mm grid collapse onto shared nodes.
    const w = warnings('stitchlen 1\nsnaptogrid 4 [ down fd 20 ]');
    expect(w.some((s) => /merged into neighbours/.test(s))).toBe(true);
  });
});

// ── 7: satin caution — after-split effects leave columns alone, with a warn ──
describe('after-split effects skip satin columns', () => {
  it('humanize over a satin column warns and does not perturb the rails', () => {
    const w = warnings('seed 1\nhumanize 0.5 [ satin 3 down fd 20 ]');
    expect(w.some((s) => /skips satin columns/.test(s))).toBe(true);
    // rails sew identically to the un-humanized column
    const plain = clean(stitches('satin 3 down fd 20'));
    const jit = clean(stitches('seed 1\nhumanize 0.5 [ satin 3 down fd 20 ]'));
    expect(jit).toEqual(plain);
  });
});

// ── 8: @name procedure references — the contract and its errors ──────────────
describe('@name procedure references', () => {
  it('an unknown name is a parse error naming the missing procedure', () => {
    expect(() => run('warp @nope [ fd 5 ]')).toThrow(/no procedure or function named "nope"/);
  });
  it('a built-in command cannot be referenced', () => {
    expect(() => run('warp @fd [ fd 5 ]')).toThrow(/can't be used as a reference/);
  });
  it('a reporter that never outputs a value is an error', () => {
    // RFC DX item 6: parse-time reporter-path check promotes this to a compile error.
    expect(() => run('def noout(p) [ ]\nwarp @noout [ fd 5 ]')).toThrow(
      /may finish without returning a value/,
    );
  });
  it('the wrong arity is rejected by name', () => {
    expect(() => run('def two(a, b) [ return a ]\nwarp @two [ fd 5 ]')).toThrow(
      /expects a 1-argument reporter; got a 2-argument reference/,
    );
  });
  it('a funcref is not a number — arithmetic on it is a loud error', () => {
    expect(() => run('def id(p) [ return p ]\nprint @id + 1')).toThrow(/expected a number/);
  });
  it('warp needs a reference, not a number', () => {
    expect(() => run('warp 3 [ fd 5 ]')).toThrow(/needs a procedure reference|expected a number/);
  });
});

// ── 9: stacking — effects and transforms nest freely ─────────────────────────
describe('effects stack with transforms and each other', () => {
  it('a four-deep stack runs and stays deterministic', () => {
    const prog =
      `${RIPPLE}seed 2\nscale 1.5 [ warp @ripple [ humanize 0.25 [ snaptogrid 1 [ ` +
      'down repeat 5 [ fd 8 rt 72 ] ] ] ] ]';
    const a = clean(run(prog).events);
    const b = clean(run(prog).events);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
