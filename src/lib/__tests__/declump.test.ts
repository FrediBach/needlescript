// ---------- declump / declumppath ----------
//
// Tests the five §6 correctness pins from the spec plus the surrounding
// contract: parse/arity, satin skip, fill skip, saturation note, stacking
// with other effects, and the `declumppath` data twin.
//
// Key properties being pinned:
//   1. maxshift 0 (or limit above all coverage) → bit-identical to bare block
//   2. Zero RNG draws (inserting/removing the block never reshuffles downstream)
//   3. Displacement is collinear with the travel axis (no lateral component)
//   4. No emitted stitch shorter than 0.6 mm as a result of easing
//   5. `coverat` inside the block reflects already-eased (committed) points

import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';
import type { StitchEvent } from '../engine.ts';

const ev = (s: string) => run(s).events;
const warnings = (s: string) => run(s).warnings;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

function clean(evs: StitchEvent[]) {
  return evs.map((e) => ({ t: e.t, x: r4(e.x), y: r4(e.y), c: e.c, ...(e.u ? { u: e.u } : {}) }));
}

const stitches = (s: string) => run(s).events.filter((e) => e.t === 'stitch');

// A dense radial motif that saturates its centre — the canonical declump use-case.
// 24 spokes × 40 mm each, all starting at the origin.
const RADIAL = 'repeat 24 [ moveto 0 0\nseth repcount * 15\nfd 40\ntrim ]';
// Same motif wrapped with declump (limit=2, maxshift=1.5)
const RADIAL_D = `declump 2 1.5 [ ${RADIAL} ]`;

// ── 1: passthrough when easing is disabled ───────────────────────────────────
describe('pin 1: declump is a no-op when easing cannot change anything', () => {
  it('maxshift 0 → bit-identical output to bare block', () => {
    const bare = clean(ev(RADIAL));
    const wrapped = clean(ev(`declump 2 0 [ ${RADIAL} ]`));
    expect(wrapped).toEqual(bare);
  });

  it('limit above every coverage → bit-identical output to bare block', () => {
    // 24 × 40 mm spokes; even at the origin the coverage never reaches 100.
    const bare = clean(ev(RADIAL));
    const wrapped = clean(ev(`declump 100 [ ${RADIAL} ]`));
    expect(wrapped).toEqual(bare);
  });

  it('single short line (nothing crowded) → identical to bare block', () => {
    const bare = clean(ev('down fd 10'));
    const wrapped = clean(ev('declump 2 [ down fd 10 ]'));
    expect(wrapped).toEqual(bare);
  });
});

// ── 2: drawless — zero RNG draws ─────────────────────────────────────────────
describe('pin 2: declump draws exactly zero values from the seeded stream', () => {
  it('downstream randomness is identical with or without the block', () => {
    const afterDeclump = run(`seed 7\ndeclump 2 1.5 [ ${RADIAL} ]\nprint random(1000)`).printed[0];
    const afterZero = run('seed 7\nprint random(1000)').printed[0];
    expect(afterDeclump).toBe(afterZero);
  });

  it('same seed → same eased result (determinism round-trip)', () => {
    const a = clean(run(`seed 3\n${RADIAL_D}`).events);
    const b = clean(run(`seed 3\n${RADIAL_D}`).events);
    expect(a).toEqual(b);
  });

  it('declumppath is also drawless', () => {
    const withFn = run('seed 5\nlet p = declumppath([[0,0],[0,5],[0,10]], 2)\nprint random(1000)')
      .printed[0];
    const noFn = run('seed 5\nprint random(1000)').printed[0];
    expect(withFn).toBe(noFn);
  });
});

// ── 3: collinear displacement ─────────────────────────────────────────────────
describe('pin 3: displacement is collinear with the travel axis', () => {
  // Sew purely along the Y axis from origin → every split point has x = 0.
  // Easing can only slide along Y; x stays 0 on every emitted stitch.
  it('north-only path: eased stitches keep x = 0 (no lateral component)', () => {
    // Dense north path: repeat 20 × fd 1 mm from origin to (0, 20).
    const prog = `declump 0.01 2 [ lock 0\nstitchlen 1\ndown repeat 20 [ fd 1 ] ]`;
    const evs = stitches(prog);
    // All stitches should have x ≈ 0 (≤ 1e-9 tolerance).
    for (const e of evs) {
      expect(Math.abs(e.x)).toBeLessThan(1e-9);
    }
  });

  it('east-only path: eased stitches keep y = 0 (no lateral component)', () => {
    const prog = `declump 0.01 2 [ lock 0\nstitchlen 1\nseth 90\ndown repeat 20 [ fd 1 ] ]`;
    const evs = stitches(prog);
    for (const e of evs) {
      expect(Math.abs(e.y)).toBeLessThan(1e-9);
    }
  });
});

// ── 4: 0.6 mm stitch floor ────────────────────────────────────────────────────
describe('pin 4: no stitch is shorter than 0.6 mm due to easing', () => {
  it('dense radial: all stitch-to-stitch distances ≥ 0.6 mm', () => {
    // Saturated centre forces maximum easing; backward/forward caps should
    // prevent any stitch from collapsing below the 0.6 mm floor.
    const evs = stitches(RADIAL_D);
    // Compare consecutive stitches within the same pen-down run.
    // Jumps separate runs, so skip cross-run pairs.
    const all = run(RADIAL_D).events;
    let prev: StitchEvent | null = null;
    for (const e of all) {
      if (e.t === 'jump' || e.t === 'trim') {
        prev = null;
        continue;
      }
      if (e.t !== 'stitch') continue;
      if (prev !== null) {
        const d = Math.hypot(e.x - prev.x, e.y - prev.y);
        // Allow a small tolerance for floating-point representation.
        expect(d).toBeGreaterThanOrEqual(0.6 - 1e-6);
      }
      prev = e;
    }
    expect(evs.length).toBeGreaterThan(0);
  });
});

// ── 5: immediate commit visible to coverat ───────────────────────────────────
describe('pin 5: coverat inside the block sees already-committed eased points', () => {
  it('second run sees coverage from the first run at the same location', () => {
    // Sew a short north segment twice from the same origin; print coverat inside
    // the block so scoping is unambiguous.
    const result = run(`
      lock 0
      stitchlen 1
      declump 10 [
        down
        repeat 5 [ fd 1 ]
        trim
        print coverat([0, 0], 1)
        moveto 0 0
        down
        repeat 5 [ fd 1 ]
        trim
        print coverat([0, 0], 1)
      ]
    `);
    const cov1 = Number(result.printed[0]);
    const cov2 = Number(result.printed[1]);
    // The second pass should see more coverage than the first at the origin.
    expect(cov2).toBeGreaterThan(cov1);
  });
});

// ── Arity and parse ───────────────────────────────────────────────────────────
describe('arity and parsing', () => {
  it('1-arg form parses (uses default maxshift 1.5)', () => {
    expect(() => run('declump 2 [ fd 5 ]')).not.toThrow();
  });

  it('2-arg form parses', () => {
    expect(() => run('declump 2 1.5 [ fd 5 ]')).not.toThrow();
  });

  it('rejects 0 args', () => {
    expect(() => run('declump [ fd 5 ]')).toThrow(/expects/);
  });

  it('rejects 3 args', () => {
    expect(() => run('declump 2 1.5 3 [ fd 5 ]')).toThrow(/expects/);
  });

  it('glued-paren form works', () => {
    expect(() => run('declump(2, 1.5) [ fd 5 ]')).not.toThrow();
  });

  it('clamps limit < 0 (silently, no warning required)', () => {
    // A negative limit is treated as 0: act as if every point is crowded.
    expect(() => run('declump -1 [ fd 5 ]')).not.toThrow();
  });

  it('clamps maxshift > 5 with a warning', () => {
    expect(warnings('declump 2 10 [ fd 5 ]').some((w) => /clamped/.test(w))).toBe(true);
  });
});

// ── Satin skip ────────────────────────────────────────────────────────────────
describe('declump skips satin columns', () => {
  it('warns once and leaves satin rails unchanged', () => {
    const w = warnings('declump 2 [ satin 3 down fd 20 ]');
    expect(w.some((s) => /skips satin/.test(s))).toBe(true);
    const plain = clean(stitches('satin 3 down fd 20'));
    const wrapped = clean(stitches('declump 2 [ satin 3 down fd 20 ]'));
    expect(wrapped).toEqual(plain);
  });
});

// ── Fill skip ─────────────────────────────────────────────────────────────────
describe('declump skips fill boundary recording', () => {
  it('emits a note when a fill is inside a declump block', () => {
    const w = warnings('declump 2 [ beginfill\ndown repeat 4 [ fd 10 rt 90 ]\nendfill ]');
    expect(w.some((s) => /declump skips fill/.test(s))).toBe(true);
  });
});

// ── Saturation note ───────────────────────────────────────────────────────────
describe('saturation note', () => {
  it('fires when penetrations had no along-axis relief available', () => {
    // Pre-saturate a path, then re-sew it with maxshift=0 so every point must stay.
    // With limit=0 (always crowded) and maxshift=0 (can't move), saturationCount
    // increments for every stitch that has non-zero prior coverage.
    const w = warnings(`
      lock 0
      stitchlen 1
      down
      repeat 5 [ fd 1 ]
      trim
      declump 0 0 [ moveto 0 0\ndown repeat 5 [ fd 1 ] ]
    `);
    expect(w.some((s) => /penetrations? stayed in saturated areas/.test(s))).toBe(true);
  });

  it('does not fire when no penetrations stayed in saturated areas', () => {
    // High limit: nothing is ever crowded, so no stay-put events.
    const w = warnings(`declump 100 1.5 [ ${RADIAL} ]`);
    expect(w.some((s) => /stayed in saturated/.test(s))).toBe(false);
  });
});

// ── declumppath data twin ──────────────────────────────────────────────────────
describe('declumppath', () => {
  it('returns a list with the same length as the input', () => {
    const result = run('let p = declumppath([[0,0],[0,5],[0,10],[0,15]], 2)\nprint len(p)');
    expect(Number(result.printed[0])).toBe(4);
  });

  it('is a no-op when limit is very high', () => {
    const pts = '[[0,0],[0,5],[0,10]]';
    const identity = run(`let r = declumppath(${pts}, 999)\nprint r`).printed[0];
    const original = run(`print ${pts}`).printed[0];
    // Both should stringify identically when no easing occurs.
    expect(identity).toEqual(original);
  });

  it('reads history: builds on points sewn before the call', () => {
    // Sew a dense north path, then ask declumppath what it would do on the same path.
    const result = run(`
      lock 0
      stitchlen 1
      down
      repeat 10 [ fd 1 ]
      trim
      let path = []
      repeat 10 [ append(path, [0, repcount * 1]) ]
      let eased = declumppath(path, 2, 1.5)
      print len(eased)
    `);
    expect(Number(result.printed[0])).toBe(10);
  });

  it('commits nothing — coverat after the call is unchanged', () => {
    const result = run(`
      print coverat([0, 0], 2)
      let _ = declumppath([[0,0],[0,5],[0,10]], 2, 1.5)
      print coverat([0, 0], 2)
    `);
    expect(result.printed[0]).toEqual(result.printed[1]);
  });
});

// ── Stacking with other effects ───────────────────────────────────────────────
describe('declump stacks with other effects', () => {
  it('declump [ humanize [ … ] ] runs deterministically', () => {
    const prog = `seed 2\ndeclump 2 1.5 [ humanize 0.3 [ ${RADIAL} ] ]`;
    const a = clean(run(prog).events);
    const b = clean(run(prog).events);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('humanize still draws exactly one value inside a declump block', () => {
    const afterStack = run(
      `seed 7\ndeclump 2 [ humanize 0.5 [ repeat 5 [ fd 8 rt 72 ] ] ]\nprint random(1000)`,
    ).printed[0];
    const afterOneDraw = run('seed 7\nlet a = random(1000)\nprint random(1000)').printed[0];
    expect(afterStack).toBe(afterOneDraw);
  });

  it('declump [ snaptogrid [ … ] ] runs and produces snapped points', () => {
    const evs = stitches('lock 0\ndeclump 2 [ snaptogrid 2 [ down repeat 4 [ fd 7 rt 90 ] ] ]');
    // Every penetration must be on the 2mm lattice (snaptogrid is innermost).
    for (const e of evs.slice(1)) {
      expect(Math.abs(e.x / 2 - Math.round(e.x / 2))).toBeLessThan(1e-9);
      expect(Math.abs(e.y / 2 - Math.round(e.y / 2))).toBeLessThan(1e-9);
    }
  });

  it('two nested declumps run deterministically under both orderings', () => {
    // Both orderings must be stable across runs (same seed → same output).
    const prog1 = `seed 3\ndeclump 1 [ declump 2 [ ${RADIAL} ] ]`;
    const prog2 = `seed 3\ndeclump 2 [ declump 1 [ ${RADIAL} ] ]`;
    expect(clean(run(prog1).events)).toEqual(clean(run(prog1).events));
    expect(clean(run(prog2).events)).toEqual(clean(run(prog2).events));
    // Both orderings must produce non-empty output.
    expect(run(prog1).events.length).toBeGreaterThan(0);
    expect(run(prog2).events.length).toBeGreaterThan(0);
  });
});
