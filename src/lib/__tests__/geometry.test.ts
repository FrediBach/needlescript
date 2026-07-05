// ---------- Geometry ops (RFC-3 §4.6): offsetpath, clippaths, inpath ----------
//
// Clipper2-backed, on ×1000 integer coordinates (µm precision) — results
// are platform-stable by construction.

import { describe, it, expect } from 'vitest';
import { run } from '../engine.ts';
import { offsetRegion, clipRegions } from '../geometry.ts';
import { signedArea, pointInRegion } from '../genmath.ts';
import type { Pt } from '../genmath.ts';

const square = (s: number, cx = 0, cy = 0): Pt[] => [
  [cx - s, cy - s],
  [cx + s, cy - s],
  [cx + s, cy + s],
  [cx - s, cy + s],
];

// ── offsetpath ───────────────────────────────────────────────────────────────
describe('offsetpath (§4.6)', () => {
  it('positive inflates, negative shrinks', () => {
    const grown = offsetRegion(square(10), 2);
    expect(grown).toHaveLength(1);
    // a square grown by 2 with round joins: area between the +2 square
    // minus corner rounding and the full +2 square
    const a = Math.abs(signedArea(grown[0]));
    expect(a).toBeGreaterThan(24 * 24 - (4 - Math.PI) * 4 - 1);
    expect(a).toBeLessThan(24 * 24 + 1);

    const shrunk = offsetRegion(square(10), -2);
    expect(shrunk).toHaveLength(1);
    expect(Math.abs(signedArea(shrunk[0]))).toBeCloseTo(16 * 16, 0);
  });

  it('shrink-to-nothing returns an empty list, not an error', () => {
    expect(offsetRegion(square(1), -5)).toEqual([]);
    const r = run(
      [
        'let small = [[0, 0], [2, 0], [2, 2], [0, 2]]',
        'let n = 0',
        'for ring in offsetpath(small, -5) [ n += 1 ]',
        'print n',
      ].join('\n'),
    );
    expect(r.printed).toEqual(['0']); // the loop is a no-op
  });

  it('shrinking can split one region into several', () => {
    // a dumbbell: two 10-wide lobes joined by a 2-wide neck
    const dumbbell: Pt[] = [
      [-15, -5],
      [-5, -5],
      [-5, -1],
      [5, -1],
      [5, -5],
      [15, -5],
      [15, 5],
      [5, 5],
      [5, 1],
      [-5, 1],
      [-5, 5],
      [-15, 5],
    ];
    const rings = offsetRegion(dumbbell, -1.6);
    expect(rings.length).toBe(2);
  });

  it('round-trip shrink-then-grow stays inside the original', () => {
    const region = square(10);
    for (const ring of offsetRegion(square(10), -3).flatMap((r) => offsetRegion(r, 3))) {
      for (const p of ring) {
        expect(p[0]).toBeGreaterThanOrEqual(-10 - 1e-6);
        expect(p[0]).toBeLessThanOrEqual(10 + 1e-6);
        expect(p[1]).toBeGreaterThanOrEqual(-10 - 1e-6);
        expect(p[1]).toBeLessThanOrEqual(10 + 1e-6);
      }
    }
    void region;
  });

  it('results are deterministic across runs (integer coordinates)', () => {
    const a = run('print offsetpath([[0, 0], [10, 0], [10, 10], [0, 10]], -2)[0][0]');
    const b = run('print offsetpath([[0, 0], [10, 0], [10, 10], [0, 10]], -2)[0][0]');
    expect(a.printed).toEqual(b.printed);
  });
});

// ── clippaths ────────────────────────────────────────────────────────────────
describe('clippaths (§4.6)', () => {
  it('union / intersect / difference / xor of two overlapping squares', () => {
    const a = square(10); // 20×20 at origin → 400
    const b = square(10, 10, 0); // 20×20 at x=10  → 400, overlap 10×20 = 200
    const area = (rs: Pt[][]) => rs.reduce((s, r) => s + Math.abs(signedArea(r)), 0);
    expect(area(clipRegions(a, b, 'union'))).toBeCloseTo(600, 6);
    expect(area(clipRegions(a, b, 'intersect'))).toBeCloseTo(200, 6);
    expect(area(clipRegions(a, b, 'difference'))).toBeCloseTo(200, 6);
    expect(area(clipRegions(a, b, 'xor'))).toBeCloseTo(400, 6);
  });

  it('disjoint intersect returns an empty list', () => {
    expect(clipRegions(square(2), square(2, 100, 100), 'intersect')).toEqual([]);
  });

  it('works in the language with quoted op words', () => {
    const r = run(
      [
        'let a = [[0, 0], [10, 0], [10, 10], [0, 10]]',
        'let b = [[5, 0], [15, 0], [15, 10], [5, 10]]',
        'let u = clippaths(a, b, "union")',
        'print len(u)',
        'let i = clippaths(a, b, "intersect")',
        'print len(i)',
      ].join('\n'),
    );
    expect(r.printed).toEqual(['1', '1']);
  });

  it('a bad op word gives a runtime error with did-you-mean', () => {
    expect(() =>
      run('let u = clippaths([[0,0],[1,0],[1,1]], [[0,0],[1,0],[1,1]], "unoin")'),
    ).toThrow(/clippaths doesn't know 'unoin'.*union/);
  });

  it('the op accepts string expressions and errors on a non-string at runtime', () => {
    expect(() => run('let u = clippaths([[0,0],[1,0],[1,1]], [[0,0],[1,0],[1,1]], 3)')).toThrow(
      /clippaths: operation must be a string/,
    );
    expect(() => run('let u = clippaths([[0,0],[1,0],[1,1]], [[0,0],[1,0],[1,1]])')).toThrow(
      /clippaths\(…\) expects 3 arguments, got 2/,
    );
  });
});

// ── inpath ───────────────────────────────────────────────────────────────────
describe('inpath (§4.6)', () => {
  it('returns 1/0, closure implicit', () => {
    const r = run(
      [
        'let box = [[0, 0], [10, 0], [10, 10], [0, 10]]',
        'print inpath([5, 5], box)',
        'print inpath([15, 5], box)',
        'print inpath([-1, -1], box)',
      ].join('\n'),
    );
    expect(r.printed).toEqual(['1', '0', '0']);
  });

  it('even-odd rule (consistent with fills): the hole of a self-overlap is out', () => {
    // a square traced with an inner square in the same winding — even-odd
    // makes the inner square a hole
    expect(
      pointInRegion(
        [0, 0],
        [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
          [-10, -10],
          [-4, -4],
          [4, -4],
          [4, 4],
          [-4, 4],
          [-4, -4],
        ],
      ),
    ).toBe(false);
    expect(
      pointInRegion(
        [7, 0],
        [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
          [-10, -10],
          [-4, -4],
          [4, -4],
          [4, 4],
          [-4, 4],
          [-4, -4],
        ],
      ),
    ).toBe(true);
  });

  it('concave cells can evict their centroid (the §6 guard)', () => {
    const r = run(
      [
        'let u = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]]',
        'print inpath(centroid(u), u)',
      ].join('\n'),
    );
    expect(r.printed).toEqual(['0']);
  });

  it('a region needs at least 3 points', () => {
    expect(() => run('print inpath([0, 0], [[1, 1], [2, 2]])')).toThrow(
      /inpath: expected a path of at least 3 points/,
    );
  });
});

// ── limits (§8) ──────────────────────────────────────────────────────────────
describe('geometry limits (§8)', () => {
  it('offsetpath input vertex cap', () => {
    expect(() => run('let r = offsetpath(filled(50001, [0, 0]), 1)')).toThrow(/too many vertices/);
  });
});
