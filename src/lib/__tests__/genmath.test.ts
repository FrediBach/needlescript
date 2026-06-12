// ---------- Generative math (RFC-3) — scalars, noise, vectors, paths ----------
//
// Golden values pinned here are the cross-version contract (§7): same seed
// + same engine version ⇒ identical output. Changing an algorithm in a way
// that breaks these requires a major version note.

import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';
import { EXAMPLES } from '../../data.ts';

const printed = (src: string) => run(src).printed;
const first = (src: string) => printed(src)[0];

/** Assert two programs are behaviourally identical. */
function expectEquivalent(a: string, b: string) {
  const ra = run(a);
  const rb = run(b);
  expect(ra.events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u })))
    .toEqual(rb.events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u })));
  expect(ra.printed).toEqual(rb.printed);
}

// ── §4.1 scalars ─────────────────────────────────────────────────────────────
describe('scalar utility belt (§4.1)', () => {
  it('lerp is unclamped', () => {
    expect(first('print lerp(0, 10, 0.5)')).toBe('5');
    expect(first('print lerp(0, 10, 1.5)')).toBe('15');
    expect(first('print lerp(10, 0, 0.25)')).toBe('7.5');
  });

  it('remap is a linear remap, unclamped', () => {
    expect(first('print remap(5, 0, 10, 0, 100)')).toBe('50');
    expect(first('print remap(-1, 0, 1, 0, 10)')).toBe('-10');
    expect(first('print remap(2, 0, 1, 10, 20)')).toBe('30');
  });

  it('clamp', () => {
    expect(printed('print clamp(5, 0, 10) print clamp(-3, 0, 10) print clamp(99, 0, 10)'))
      .toEqual(['5', '0', '10']);
  });

  it('smoothstep is Hermite 0…1', () => {
    expect(first('print smoothstep(0, 1, 0.5)')).toBe('0.5');
    expect(first('print smoothstep(0, 1, -2)')).toBe('0');
    expect(first('print smoothstep(0, 1, 2)')).toBe('1');
    expect(first('print smoothstep(0, 10, 2.5)')).toBe('0.156'); // 3t²−2t³ at t=0.25
  });

  it('gauss: golden values, seeded', () => {
    expect(printed('seed 4 print gauss(0, 1) print gauss(5, 2)'))
      .toEqual(['-1.131', '6.233']);
  });

  it('gauss is exactly 2 main-stream draws, no caching', () => {
    expectEquivalent(
      'seed 9 let g = gauss(0, 1) print random(1000)',
      'seed 9 let a = random(1) let b = random(1) print random(1000)',
    );
    // a second gauss draws 2 more — no cached second value
    expectEquivalent(
      'seed 9 let g = gauss(0, 1) let h = gauss(0, 1) print random(1000)',
      'seed 9 repeat 4 [ let z = random(1) ] print random(1000)',
    );
  });
});

// ── §4.2 noise ───────────────────────────────────────────────────────────────
describe('seeded simplex noise (§4.2)', () => {
  it('golden values, seeded', () => {
    expect(first('seed 4 print snoise2(0.3, 0.7)')).toBe('0.137');
    expect(first('seed 4 print snoise3(0.3, 0.7, 2)')).toBe('0.401');
    expect(first('seed 4 print fbm2(0.3, 0.7, 4)')).toBe('-0.213');
  });

  it('same seed, same field — and zero main-stream draws', () => {
    expect(first('seed 4 print snoise2(0.3, 0.7)'))
      .toBe(first('seed 4 print snoise2(0.3, 0.7)'));
    // sampling noise must not shift downstream randomness
    expectEquivalent(
      'seed 4 let n = snoise2(1, 2) print random(1000)',
      'seed 4 print random(1000)',
    );
  });

  it('snoise range is −1…1, legacy noise stays 0…1', () => {
    const r = run([
      'seed 1',
      'let lo = 0  let hi = 0  let nlo = 1  let nhi = 0',
      'for i = 0 to 200 [',
      '  let s = snoise2(i / 7.3, i / 11.1)',
      '  if s < lo [ lo = s ]',
      '  if s > hi [ hi = s ]',
      '  let n = noise2(i / 7.3, i / 11.1)',
      '  if n < nlo [ nlo = n ]',
      '  if n > nhi [ nhi = n ]',
      ']',
      'assert lo >= -1  assert hi <= 1  assert lo < 0  assert hi > 0',
      'assert nlo >= 0  assert nhi <= 1',
    ].join('\n'));
    expect(r.warnings).toEqual([]);
  });

  it('the z axis of snoise3 gives each motif its own field', () => {
    expect(first('seed 1 print snoise3(0.5, 0.5, 0) != snoise3(0.5, 0.5, 50)')).toBe('1');
  });

  it('fbm2 octaves clamp 1–8 with a warning', () => {
    const r = run('seed 1 print fbm2(0.3, 0.7, 12)');
    expect(r.warnings.some(w => w.includes('fbm2 octaves') && w.includes('clamped to 8'))).toBe(true);
    expect(run('seed 1 print fbm2(0.3, 0.7, 4)').warnings).toEqual([]);
  });
});

// ── §4.3 vectors ─────────────────────────────────────────────────────────────
describe('vector functions (§4.3)', () => {
  it('vadd / vsub / vscale / vlerp build new points', () => {
    expect(first('print vadd([1, 2], [3, 4])')).toBe('[4, 6]');
    expect(first('print vsub([1, 2], [3, 4])')).toBe('[-2, -2]');
    expect(first('print vscale([1, -2], 3)')).toBe('[3, -6]');
    expect(first('print vlerp([0, 0], [10, 20], 0.5)')).toBe('[5, 10]');
  });

  it('vdot / vlen / vdist', () => {
    expect(first('print vdot([1, 2], [3, 4])')).toBe('11');
    expect(first('print vlen([3, 4])')).toBe('5');
    expect(first('print vdist([1, 1], [4, 5])')).toBe('5');
  });

  it('vnorm: unit vector; zero vector is a loud error', () => {
    expect(first('print vlen(vnorm([3, 4]))')).toBe('1');
    expect(first('print vnorm([0, 5])')).toBe('[0, 1]');
    expect(() => run('print vnorm([0, 0])')).toThrow(/vnorm of the zero vector/);
  });

  it('vrot rotates clockwise for positive deg (matches rt)', () => {
    // north [0,1] rotated +90 (clockwise) faces east [1,0]
    expect(first('print vrot([0, 1], 90)')).toBe('[1, 0]');
    expect(first('print vrot([1, 0], 90)')).toBe('[0, -1]');
    expect(first('print vrot([0, 1], -90)')).toBe('[-1, 0]');
  });

  it('vheading matches atan, vfromheading is its inverse', () => {
    expect(first('print vheading([0, 1])')).toBe('0');   // north
    expect(first('print vheading([1, 0])')).toBe('90');  // east
    expect(first('print vheading([5, 7]) = atan 5 7')).toBe('1');
    expect(first('print vheading(vfromheading(123, 1))')).toBe('123');
    expect(first('print vfromheading(90, 2)')).toBe('[2, 0]');
  });

  it('vfromheading(heading, d) agrees with the turtle: fd d lands there', () => {
    const r = run('seth 37 let p = vfromheading(heading, 10) fd 10 print p print pos()');
    expect(r.printed[0]).toBe(r.printed[1]);
  });
});

// ── §4.4 paths & curves ──────────────────────────────────────────────────────
describe('paths & curves (§4.4)', () => {
  it('pathlen sums the polyline', () => {
    expect(first('print pathlen([[0, 0], [3, 4], [3, 14]])')).toBe('15');
  });

  it('resample: even spacing, first & last preserved', () => {
    const r = run([
      'let p = resample([[0, 0], [10, 0]], 3)',
      'print p[0] print last(p) print len(p)',
      'for i = 1 to len(p) - 2 [ assert abs(vdist(p[i - 1], p[i]) - 3) < 0.000001 ]',
    ].join('\n'));
    expect(r.printed).toEqual(['[0, 0]', '[10, 0]', '5']);
  });

  it('resample property: segment lengths within spacing ± 1e-6 (except last)', () => {
    const r = run([
      'seed 2',
      'let raw = []',
      'for i = 0 to 20 [ append(raw, [i * 2, snoise2(i / 4, 0) * 8]) ]',
      'let p = resample(raw, 1.7)',
      'for i = 1 to len(p) - 2 [ assert abs(vdist(p[i - 1], p[i]) - 1.7) < 0.000001 ]',
      'assert vdist(last(p), last(raw)) < 0.000001',
    ].join('\n'));
    expect(r.warnings).toEqual([]);
  });

  it('chaikin keeps endpoints and smooths', () => {
    const r = run([
      'let p = chaikin([[0, 0], [10, 0], [10, 10]], 2)',
      'print p[0] print last(p) print len(p)',
    ].join('\n'));
    expect(r.printed[0]).toBe('[0, 0]');
    expect(r.printed[1]).toBe('[10, 10]');
    expect(Number(r.printed[2])).toBeGreaterThan(3);
  });

  it('chaikin iterations clamp 1–6 with a warning', () => {
    const r = run('let p = chaikin([[0, 0], [10, 0]], 9)');
    expect(r.warnings.some(w => w.includes('chaikin iterations') && w.includes('clamped to 6'))).toBe(true);
  });

  it('catmull passes through its control points', () => {
    const r = run([
      'let c = [[0, 0], [10, 5], [20, -5], [30, 0]]',
      'let p = catmull(c, 0.5)',
      'for q in c [',
      '  let best = 1000',
      '  for s in p [ let d = vdist(q, s) if d < best [ best = d ] ]',
      '  assert best < 0.6',
      ']',
      'print p[0] print last(p)',
    ].join('\n'));
    expect(r.printed).toEqual(['[0, 0]', '[30, 0]']);
  });

  it('bezier: endpoints exact, arc-length resampled', () => {
    const r = run([
      'let p = bezier([0, 0], [0, 10], [10, 10], [10, 0], 1)',
      'print p[0] print last(p)',
      'for i = 1 to len(p) - 2 [ assert abs(vdist(p[i - 1], p[i]) - 1) < 0.000001 ]',
    ].join('\n'));
    expect(r.printed).toEqual(['[0, 0]', '[10, 0]']);
  });

  it('centroid and bbox', () => {
    expect(first('print centroid([[0, 0], [10, 0], [10, 10], [0, 10]])')).toBe('[5, 5]');
    expect(first('print bbox([[1, 2], [-3, 7], [4, -1]])')).toBe('[-3, -1, 4, 7]');
  });

  it('sewpath is exactly  for p in path [ setpos(p) ]', () => {
    expectEquivalent(
      'sewpath([[0, 0], [10, 0], [10, 10]])',
      'let path = [[0, 0], [10, 0], [10, 10]] for p in path [ setpos(p) ]',
    );
    // pen state applies as if hand-walked
    expectEquivalent(
      'up sewpath([[5, 5], [10, 10]]) down fd 5',
      'up setpos([5, 5]) setpos([10, 10]) down fd 5',
    );
  });
});

// ── shape errors ─────────────────────────────────────────────────────────────
describe('shape errors name the function (§4)', () => {
  it('point of 3 / number where a point is expected', () => {
    expect(() => run('print vadd([1, 2, 3], [1, 2])'))
      .toThrow(/vadd: expected a point \[x, y\], got a list of 3/);
    expect(() => run('print vlen(5)'))
      .toThrow(/vlen: expected a point \[x, y\], got a number/);
  });

  it('path of 1 / ragged path', () => {
    expect(() => run('print pathlen([[1, 2]])'))
      .toThrow(/pathlen: expected a path of at least 2 points, got a list of 1/);
    expect(() => run('print pathlen([[1, 2], [3, 4, 5]])'))
      .toThrow(/pathlen: element 1 isn't a point \[x, y\]/);
    expect(() => run('print pathlen([[1, 2], 7])'))
      .toThrow(/pathlen: element 1 isn't a point \[x, y\] — got a number/);
  });

  it('resample spacing must be positive', () => {
    expect(() => run('print resample([[0, 0], [1, 1]], 0)'))
      .toThrow(/spacing must be greater than 0/);
  });
});

// ── soft-builtin tier (§3) ───────────────────────────────────────────────────
describe('the soft-builtin tier (§3)', () => {
  it('a user clamp shadows the library clamp, with one note', () => {
    const r = run([
      'def clamp(v, lo, hi) [ return 999 ]', // deliberately not a real clamp
      'print clamp(5, 0, 10)',
      'print clamp(5, 0, 10)',
    ].join('\n'));
    expect(r.printed).toEqual(['999', '999']); // user definition wins, whole-program
    const notes = r.warnings.filter(w => w.includes('shadows a built-in library function'));
    expect(notes).toHaveLength(1); // once per name
    expect(notes[0]).toContain('"clamp"');
  });

  it('classic to-procedures shadow the same way', () => {
    const r = run('to lerp :a output :a * 2 end print lerp 21');
    expect(r.printed).toEqual(['42']);
    expect(r.warnings.some(w => w.includes('"lerp" shadows'))).toBe(true);
  });

  it('Core names stay a hard error (unchanged)', () => {
    expect(() => run('def fd(x) [ ]')).toThrow(/built-in word and can't be redefined/);
    expect(() => run('to random :n output 1 end')).toThrow(/built-in word/);
  });

  it('no definition, no note', () => {
    expect(run('print clamp(5, 0, 10)').warnings).toEqual([]);
  });

  it('RFC-2 list functions are Library tier too', () => {
    const r = run('def len(x) [ return 7 ] print len([1, 2])');
    expect(r.printed).toEqual(['7']);
    expect(r.warnings.some(w => w.includes('"len" shadows'))).toBe(true);
  });

  it('meadow.ns runs unmodified, with exactly one shadow note', () => {
    // the RFC-1 reference example defines clamp (now a library builtin)
    // and inside (not a builtin) — the policy exists so it keeps working
    const r = run(EXAMPLES['meadow — modern syntax tour']);
    const notes = r.warnings.filter(w => w.includes('shadows a built-in library function'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('"clamp"');
    expect(r.events.length).toBeGreaterThan(100); // it actually sews
  });
});

// ── grammar & resolution ─────────────────────────────────────────────────────
describe('grammar: glued-call only, expressions compose', () => {
  it('no prefix form exists', () => {
    expect(() => run('print lerp 0 10 0.5')).toThrow(/call syntax:\s+lerp\(/);
  });

  it('outputs feed inputs: indexing and nesting compose without glue', () => {
    expect(first('print vadd(vscale([1, 0], 3), vfromheading(0, 2))[1]')).toBe('2');
    expect(first('print resample([[0, 0], [10, 0]], 2.5)[2]')).toBe('[5, 0]');
  });

  it('results count toward list limits like any list', () => {
    expect(() => run('let p = resample([[0, 0], [200, 0]], 0.001)'))
      .toThrow(/List too long/);
  });
});
