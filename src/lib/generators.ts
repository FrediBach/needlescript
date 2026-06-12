// ---------- Seeded generators: scatter, voronoi, triangulate, hull, relax (RFC-3 §4.5) ----------
//
// All randomness comes from an injected RNG — never Math.random (the test
// suite stubs it to throw). scatter is hand-rolled Bridson so we own every
// draw; voronoi/triangulate/hull use delaunator for the Delaunay structure
// and draw nothing.

import Delaunator from 'delaunator';
import { NeedlescriptError } from './errors.ts';
import { centroid, pointInRegion, signedArea } from './genmath.ts';
import type { Pt } from './genmath.ts';

/** Where generators operate: the sewable disc, or a polygon region. */
export type Domain =
  | { kind: 'disc'; r: number }
  | { kind: 'poly'; pts: Pt[] };

const inDomain = (p: Pt, d: Domain): boolean =>
  d.kind === 'disc'
    ? p[0] * p[0] + p[1] * p[1] <= d.r * d.r
    : pointInRegion(p, d.pts);

function domainBBox(d: Domain): [number, number, number, number] {
  if (d.kind === 'disc') return [-d.r, -d.r, d.r, d.r];
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of d.pts) {
    if (x < minx) minx = x;
    if (y < miny) miny = y;
    if (x > maxx) maxx = x;
    if (y > maxy) maxy = y;
  }
  return [minx, miny, maxx, maxy];
}

/** The domain as a boundary polygon (the disc as a regular 96-gon, CCW). */
export function domainPolygon(d: Domain): Pt[] {
  if (d.kind === 'poly') return d.pts;
  const out: Pt[] = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * 2 * Math.PI;
    out.push([d.r * Math.cos(t), d.r * Math.sin(t)]);
  }
  return out;
}

// ---------- Poisson-disc (Bridson) ----------

/**
 * Bridson's Poisson-disc sampling: points at least `mindist` apart, filling
 * the domain. All draws from the (already forked) child RNG.
 */
export function scatter(
  mindist: number,
  domain: Domain,
  rng: () => number,
  maxPoints: number,
  line?: number,
): Pt[] {
  if (!(mindist > 0))
    throw new NeedlescriptError('scatter: mindist must be greater than 0', line);
  const [minx, miny, maxx, maxy] = domainBBox(domain);
  const cell = mindist / Math.SQRT2;
  const gw = Math.max(1, Math.ceil((maxx - minx) / cell));
  const gh = Math.max(1, Math.ceil((maxy - miny) / cell));
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: Pt[] = [];
  const active: number[] = [];

  const gx = (p: Pt) => Math.min(gw - 1, Math.max(0, Math.floor((p[0] - minx) / cell)));
  const gy = (p: Pt) => Math.min(gh - 1, Math.max(0, Math.floor((p[1] - miny) / cell)));

  const farEnough = (p: Pt): boolean => {
    const cx = gx(p), cy = gy(p);
    for (let iy = Math.max(0, cy - 2); iy <= Math.min(gh - 1, cy + 2); iy++) {
      for (let ix = Math.max(0, cx - 2); ix <= Math.min(gw - 1, cx + 2); ix++) {
        const k = grid[iy * gw + ix];
        if (k >= 0) {
          const q = pts[k];
          const dx = p[0] - q[0], dy = p[1] - q[1];
          if (dx * dx + dy * dy < mindist * mindist) return false;
        }
      }
    }
    return true;
  };

  const place = (p: Pt) => {
    if (pts.length >= maxPoints)
      throw new NeedlescriptError(
        `scatter: over ${maxPoints.toLocaleString()} points — raise mindist`,
        line,
      );
    grid[gy(p) * gw + gx(p)] = pts.length;
    pts.push(p);
    active.push(pts.length - 1);
  };

  // Seed point: rejection-sample the bounding box (deterministic, bounded).
  let seeded = false;
  for (let tries = 0; tries < 10000; tries++) {
    const p: Pt = [minx + rng() * (maxx - minx), miny + rng() * (maxy - miny)];
    if (inDomain(p, domain)) { place(p); seeded = true; break; }
  }
  if (!seeded)
    throw new NeedlescriptError("scatter couldn't place a point inside the region", line);

  while (active.length > 0) {
    const ai = Math.floor(rng() * active.length);
    const base = pts[active[ai]];
    let placed = false;
    for (let k = 0; k < 30; k++) {
      const ang = rng() * 2 * Math.PI;
      const rad = mindist * (1 + rng());
      const p: Pt = [base[0] + rad * Math.cos(ang), base[1] + rad * Math.sin(ang)];
      if (p[0] < minx || p[0] > maxx || p[1] < miny || p[1] > maxy) continue;
      if (!inDomain(p, domain) || !farEnough(p)) continue;
      place(p);
      placed = true;
      break;
    }
    if (!placed) {
      // remove from active (swap-pop keeps it O(1); order is deterministic)
      active[ai] = active[active.length - 1];
      active.pop();
    }
  }
  return pts;
}

// ---------- Delaunay-backed structure ----------

function delaunay(points: Pt[]): Delaunator<Float64Array<ArrayBuffer>> {
  return Delaunator.from(points, p => p[0], p => p[1]);
}

/** Delaunay triangles as point-index triples. */
export function triangulate(points: Pt[], line?: number): [number, number, number][] {
  if (points.length < 3)
    throw new NeedlescriptError(`triangulate needs at least 3 points, got ${points.length}`, line);
  const d = delaunay(points);
  const out: [number, number, number][] = [];
  for (let t = 0; t < d.triangles.length; t += 3)
    out.push([d.triangles[t], d.triangles[t + 1], d.triangles[t + 2]]);
  return out;
}

/** Convex hull as a region, counter-clockwise. */
export function hull(points: Pt[], line?: number): Pt[] {
  if (points.length < 3)
    throw new NeedlescriptError(`hull needs at least 3 points, got ${points.length}`, line);
  const d = delaunay(points);
  const h: Pt[] = Array.from(d.hull, i => points[i]);
  if (signedArea(h) < 0) h.reverse();
  return h;
}

// ---------- Voronoi ----------

/**
 * Voronoi cells by half-plane clipping: cell(i) starts as the boundary
 * polygon and is cut by the perpendicular bisector against each Delaunay
 * neighbour of i (the neighbours fully determine the cell). Robust for
 * hull/unbounded cells with no ray-projection math; collinear inputs
 * (no triangles) fall back to all-pairs clipping. 0 RNG draws.
 */
export function voronoiCells(points: Pt[], domain: Domain, line?: number): Pt[][] {
  const boundary = domainPolygon(domain);
  if (points.length === 1) return [boundary.slice()];

  // neighbour sets — Delaunay edges when possible, all-pairs otherwise
  const allOthers = (i: number) => points.map((_, j) => j).filter(j => j !== i);
  let neighbours: number[][];
  if (points.length >= 3) {
    const d = delaunay(points);
    if (d.triangles.length > 0) {
      const sets: Set<number>[] = points.map(() => new Set<number>());
      for (let e = 0; e < d.triangles.length; e++) {
        const i = d.triangles[e];
        const j = d.triangles[e % 3 === 2 ? e - 2 : e + 1];
        sets[i].add(j);
        sets[j].add(i);
      }
      // a point delaunator skipped (e.g. a duplicate) has no edges — fall
      // back to all-pairs for that point rather than handing it the world
      neighbours = sets.map((s, i) =>
        s.size > 0 ? [...s].sort((a, b) => a - b) : allOthers(i));
    } else {
      neighbours = points.map((_, i) => allOthers(i));
    }
  } else {
    neighbours = points.map((_, i) => allOthers(i));
  }

  const cells: Pt[][] = [];
  for (let i = 0; i < points.length; i++) {
    let cell = boundary.slice();
    for (const j of neighbours[i]) {
      if (cell.length < 3) break;
      const dx = points[i][0] - points[j][0], dy = points[i][1] - points[j][1];
      if (dx * dx + dy * dy < 1e-18) {
        // coincident points have no bisector — the lower index keeps the
        // cell, the duplicate gets an empty one (deterministic tie-break)
        if (j < i) { cell = []; break; }
        continue;
      }
      cell = clipHalfPlane(cell, points[i], points[j]);
    }
    cells.push(cell.length >= 3 ? cell : []);
  }
  void line;
  return cells;
}

/** Keep the part of `poly` closer to `a` than to `b` (Sutherland–Hodgman). */
function clipHalfPlane(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = a[0] - b[0], dy = a[1] - b[1];
  const side = (p: Pt) => (p[0] - mx) * dx + (p[1] - my) * dy;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  // drop near-duplicate consecutive points (degenerate clip artefacts)
  const clean: Pt[] = [];
  for (const p of out) {
    const last = clean[clean.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) clean.push(p);
  }
  while (
    clean.length > 1 &&
    Math.abs(clean[0][0] - clean[clean.length - 1][0]) <= 1e-9 &&
    Math.abs(clean[0][1] - clean[clean.length - 1][1]) <= 1e-9
  ) clean.pop();
  return clean;
}

/**
 * Lloyd's relaxation: n rounds of moving each point to the centroid of its
 * Voronoi cell (clipped to the sewable disc). Unlocks even stippling.
 * 0 RNG draws.
 */
export function relax(points: Pt[], n: number, domain: Domain, line?: number): Pt[] {
  let pts = points.slice();
  for (let k = 0; k < n; k++) {
    const cells = voronoiCells(pts, domain, line);
    pts = pts.map((p, i) => (cells[i].length >= 3 ? centroid(cells[i]) : p));
  }
  return pts;
}
