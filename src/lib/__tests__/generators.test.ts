// ---------- Generators (RFC-3 §4.5): scatter, voronoi, triangulate, hull, relax ----------

import { describe, it, expect } from 'vitest';
import { run, makeRNG, LIMITS } from '../engine.ts';
import { scatter, voronoiCells, triangulate, hull, relax } from '../generators.ts';
import type { Domain } from '../generators.ts';
import { signedArea, pointInRegion, vdist } from '../genmath.ts';
import type { Pt } from '../genmath.ts';

const disc: Domain = { kind: 'disc', r: LIMITS.sewableRadius };
const square = (s: number): Pt[] => [
  [-s, -s],
  [s, -s],
  [s, s],
  [-s, s],
];

/** Assert two programs are behaviourally identical. */
function expectEquivalent(a: string, b: string) {
  const ra = run(a);
  const rb = run(b);
  expect(ra.events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u }))).toEqual(
    rb.events.map(({ t, x, y, c, u }) => ({ t, x, y, c, u })),
  );
  expect(ra.printed).toEqual(rb.printed);
}

// ── scatter (Poisson-disc, Bridson) ──────────────────────────────────────────
describe('scatter (§4.5)', () => {
  it('golden: seed 4, scatter(15) — pinned forever', () => {
    expect(run('seed 4 let p = scatter(15) print len(p) print p[0]').printed).toEqual([
      '26',
      '[-12.483, 30.165]',
    ]);
  });

  it('respects mindist and stays inside the sewable disc', () => {
    const pts = scatter(8, disc, makeRNG(11), 20000);
    expect(pts.length).toBeGreaterThan(10);
    for (const p of pts) expect(Math.hypot(p[0], p[1])).toBeLessThanOrEqual(LIMITS.sewableRadius);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(vdist(pts[i], pts[j])).toBeGreaterThanOrEqual(8 - 1e-9);
  });

  it('with a region: all points inside the polygon', () => {
    const region = square(20);
    const pts = scatter(6, { kind: 'poly', pts: region }, makeRNG(3), 20000);
    expect(pts.length).toBeGreaterThan(5);
    for (const p of pts) expect(pointInRegion(p, region)).toBe(true);
  });

  it('region form works in the language', () => {
    const r = run(
      [
        'seed 2',
        'let box = [[-20, -20], [20, -20], [20, 20], [-20, 20]]',
        'let pts = scatter(7, box)',
        'assert len(pts) > 5',
        'for p in pts [ assert inpath(p, box) ]',
      ].join('\n'),
    );
    expect(r.warnings).toEqual([]);
  });

  it('draws exactly one main-stream value (fork convention, §7)', () => {
    expectEquivalent(
      'seed 4 let p = scatter(15) print random(1000)',
      'seed 4 let z = random(1) print random(1000)',
    );
  });

  it('mindist must be positive; the point cap is an error', () => {
    expect(() => run('let p = scatter(0)')).toThrow(/mindist must be greater than 0/);
    expect(() => scatter(0.3, disc, makeRNG(1), 20000)).toThrow(
      /over 20,000 points — raise mindist/,
    );
  });
});

// ── voronoi ──────────────────────────────────────────────────────────────────
describe('voronoi (§4.5)', () => {
  it('one cell per point, in input order — each point inside its own cell', () => {
    const pts = scatter(12, disc, makeRNG(7), 20000);
    const cells = voronoiCells(pts, disc);
    expect(cells).toHaveLength(pts.length);
    cells.forEach((cell, i) => {
      expect(cell.length).toBeGreaterThanOrEqual(3);
      expect(pointInRegion(pts[i], cell)).toBe(true);
    });
  });

  it('cells tile the region: area sum within 1%', () => {
    const pts = scatter(10, disc, makeRNG(5), 20000);
    const cells = voronoiCells(pts, disc);
    const sum = cells.reduce((acc, c) => acc + Math.abs(signedArea(c)), 0);
    const discArea = Math.PI * LIMITS.sewableRadius ** 2;
    expect(Math.abs(sum - discArea) / discArea).toBeLessThan(0.01);
  });

  it('cells tile a polygon region exactly', () => {
    const region = square(15);
    const pts: Pt[] = [
      [-5, -5],
      [6, 2],
      [-2, 8],
      [9, -7],
      [0, 0],
    ];
    const cells = voronoiCells(pts, { kind: 'poly', pts: region });
    const sum = cells.reduce((acc, c) => acc + Math.abs(signedArea(c)), 0);
    expect(sum).toBeCloseTo(30 * 30, 6);
  });

  it('small inputs: 1 point owns the region; 2 points split it', () => {
    const region = square(10);
    expect(voronoiCells([[0, 0]], { kind: 'poly', pts: region })).toHaveLength(1);
    const cells = voronoiCells(
      [
        [-5, 0],
        [5, 0],
      ],
      { kind: 'poly', pts: region },
    );
    expect(cells).toHaveLength(2);
    expect(Math.abs(signedArea(cells[0]))).toBeCloseTo(200, 6);
    expect(Math.abs(signedArea(cells[1]))).toBeCloseTo(200, 6);
  });

  it('collinear points still produce cells (no triangles to lean on)', () => {
    const cells = voronoiCells(
      [
        [-10, 0],
        [0, 0],
        [10, 0],
      ],
      { kind: 'poly', pts: square(15) },
    );
    expect(cells).toHaveLength(3);
    for (const c of cells) expect(Math.abs(signedArea(c))).toBeGreaterThan(0);
  });

  it('a duplicate point gets an empty cell, not the whole region', () => {
    const cells = voronoiCells(
      [
        [-5, -5],
        [6, 2],
        [-2, 8],
        [6, 2],
      ],
      { kind: 'poly', pts: square(15) },
    );
    expect(cells).toHaveLength(4);
    // the duplicate pair splits nothing between themselves — their bisector
    // is degenerate, so at most one of the twins keeps a real cell, and
    // nobody inherits the whole region
    const total = cells.reduce((s, c) => s + Math.abs(signedArea(c)), 0);
    expect(total).toBeLessThanOrEqual(30 * 30 + 1e-6);
  });

  it('draws nothing from the main stream', () => {
    expectEquivalent(
      'seed 4 let p = scatter(15) let v = voronoi(p) print random(1000)',
      'seed 4 let p = scatter(15) print random(1000)',
    );
  });

  it('composes in the language: scatter → voronoi → offsetpath', () => {
    const r = run(
      [
        'seed 4',
        'let tiles = voronoi(scatter(15))',
        'assert len(tiles) = 26',
        'let rings = 0',
        'for cell in tiles [ for ring in offsetpath(cell, -1) [ rings += 1 ] ]',
        'assert rings > 0',
      ].join('\n'),
    );
    expect(r.warnings).toEqual([]);
  });
});

// ── triangulate & hull ───────────────────────────────────────────────────────
describe('triangulate & hull (§4.5)', () => {
  it('triangulate: unit square → 2 triangles of point-triples', () => {
    const r = run(
      [
        'let t = triangulate([[0, 0], [10, 0], [10, 10], [0, 10]])',
        'print len(t) print len(t[0])',
      ].join('\n'),
    );
    expect(r.printed).toEqual(['2', '3']);
  });

  it('hull contains all inputs, counter-clockwise', () => {
    const pts = scatter(9, disc, makeRNG(13), 20000);
    const h = hull(pts);
    expect(signedArea(h)).toBeGreaterThan(0); // CCW
    // every point is left-of-or-on every hull edge
    for (let i = 0; i < h.length; i++) {
      const a = h[i],
        b = h[(i + 1) % h.length];
      for (const p of pts) {
        const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        expect(cross).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('they need at least 3 points', () => {
    expect(() => run('let t = triangulate([[0, 0], [1, 1]])')).toThrow(/at least 3 points/);
    expect(() => run('let h = hull([[0, 0], [1, 1]])')).toThrow(/at least 3 points/);
  });

  it('the delaunay input cap is enforced', () => {
    expect(() => triangulate(Array.from({ length: 3 }, (_, i) => [i, i * i] as Pt))).not.toThrow();
    expect(() => run('let t = triangulate(filled(10001, [0, 0]))')).toThrow(/too many points/);
  });
});

// ── relax (Lloyd's) ──────────────────────────────────────────────────────────
describe('relax (§4.5, open question 4 — included)', () => {
  it('keeps the point count and stays deterministic', () => {
    const a = run('seed 4 let p = relax(scatter(15), 2) print len(p) print p[0]');
    const b = run('seed 4 let p = relax(scatter(15), 2) print len(p) print p[0]');
    expect(a.printed).toEqual(b.printed);
    expect(a.printed[0]).toBe('26');
  });

  it('evens out spacing: nearest-neighbour distances get more uniform', () => {
    // uniform random points are clumpy; Lloyd's spreads them — the
    // coefficient of variation of nearest-neighbour distances must drop
    const rng = makeRNG(2);
    const pts: Pt[] = [];
    while (pts.length < 60) {
      const x = (rng() * 2 - 1) * 40,
        y = (rng() * 2 - 1) * 40;
      if (x * x + y * y <= 40 * 40) pts.push([x, y]);
    }
    const nnCV = (xs: Pt[]) => {
      const nn = xs.map((p, i) =>
        Math.min(...xs.filter((_, j) => j !== i).map((q) => vdist(p, q))),
      );
      const mean = nn.reduce((a, b) => a + b, 0) / nn.length;
      const sd = Math.sqrt(nn.reduce((a, b) => a + (b - mean) ** 2, 0) / nn.length);
      return sd / mean;
    };
    const relaxed = relax(pts, 3, disc);
    expect(relaxed).toHaveLength(pts.length);
    expect(nnCV(relaxed)).toBeLessThan(nnCV(pts) * 0.7);
  });

  it('draws nothing from the main stream', () => {
    expectEquivalent(
      'seed 4 let p = relax(scatter(15), 2) print random(1000)',
      'seed 4 let p = scatter(15) print random(1000)',
    );
  });

  it('iteration count clamps 0–50 with a warning', () => {
    const r = run('seed 1 let p = relax([[0, 1], [5, 5], [9, 2]], 99)');
    expect(
      r.warnings.some((w) => w.includes('relax iterations') && w.includes('clamped to 50')),
    ).toBe(true);
  });
});
