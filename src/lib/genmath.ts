// ---------- Generative math: scalars, vectors, paths (RFC-3 §4.1/4.3/4.4) ----------
//
// The vocabulary, stated once and reused everywhere: a point is [x, y],
// a path is a list of ≥ 2 points, a region is a closed path (the closing
// segment is implicit). Everything heading-like uses turtle degrees:
// 0 = north/up, clockwise positive — matching seth, atan, towards.
//
// All functions here are pure and hand-rolled (≤ ~30 lines each): owning
// the code is cheaper than auditing a dependency for determinism.

import { NeedlescriptError } from './errors.ts';
import { NsList, isList, describeVal } from './list.ts';
import type { Val } from './list.ts';

/** A point in working (mm) space. */
export type Pt = [number, number];

// ---------- Shape guards (NsList → plain arrays) ----------

/** The value must be a point: a list of exactly 2 numbers. */
export function toPoint(v: Val, what: string, line?: number): Pt {
  if (!isList(v))
    throw new NeedlescriptError(`${what}: expected a point [x, y], got a number`, line);
  if (v.items.length !== 2 || isList(v.items[0]) || isList(v.items[1]))
    throw new NeedlescriptError(
      `${what}: expected a point [x, y], got a list of ${v.items.length}${v.items.some(isList) ? ' (with nested lists)' : ''}`,
      line,
    );
  return [v.items[0] as number, v.items[1] as number];
}

/** The value must be a path: a list of at least `min` points. */
export function toPath(v: Val, what: string, line?: number, min = 2): Pt[] {
  if (!isList(v))
    throw new NeedlescriptError(`${what}: expected a path (a list of [x, y] points), got ${describeVal(v)}`, line);
  if (v.items.length < min)
    throw new NeedlescriptError(
      `${what}: expected a path of at least ${min} points, got a list of ${v.items.length}`,
      line,
    );
  const out: Pt[] = [];
  for (let i = 0; i < v.items.length; i++) {
    const p = v.items[i];
    if (!isList(p) || p.items.length !== 2 || isList(p.items[0]) || isList(p.items[1]))
      throw new NeedlescriptError(
        `${what}: element ${i} isn't a point [x, y] — got ${describeVal(p)}`,
        line,
      );
    out.push([p.items[0] as number, p.items[1] as number]);
  }
  return out;
}

/** The value must be a region: a path of at least 3 points (closure implicit). */
export function toRegion(v: Val, what: string, line?: number): Pt[] {
  return toPath(v, what, line, 3);
}

/** Plain points back to runtime lists, via the caller's allocator. */
export function fromPoints(pts: Pt[], alloc: (items: Val[]) => NsList): NsList {
  return alloc(pts.map(p => alloc([p[0], p[1]])));
}

// ---------- §4.1 Scalars ----------

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const remap = (v: number, inlo: number, inhi: number, outlo: number, outhi: number) =>
  inhi === inlo
    ? outlo
    : outlo + ((v - inlo) / (inhi - inlo)) * (outhi - outlo);

export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------- §4.3 Vectors (points) ----------

const DEG = Math.PI / 180;

export const vadd = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const vsub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const vscale = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
export const vlerp = (a: Pt, b: Pt, t: number): Pt =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const vdot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
export const vlen = (a: Pt) => Math.hypot(a[0], a[1]);
export const vdist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Unit vector; the zero vector is an error, not [0, 0] — a silent default
 *  heading is a stealth bug. */
export function vnorm(a: Pt, line?: number): Pt {
  const l = Math.hypot(a[0], a[1]);
  if (l === 0)
    throw new NeedlescriptError('vnorm of the zero vector [0, 0] — it has no direction', line);
  return [a[0] / l, a[1] / l];
}

/** Rotate clockwise for positive deg (matches rt). */
export function vrot(a: Pt, deg: number): Pt {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return [a[0] * c + a[1] * s, a[1] * c - a[0] * s];
}

/** Turtle heading of the vector: 0 = north, clockwise (≡ atan x y). */
export const vheading = (a: Pt) =>
  (Math.atan2(a[0], a[1]) * 180 / Math.PI + 360) % 360;

/** Inverse of vheading: vfromheading(heading, 1) is the needle's direction. */
export const vfromheading = (deg: number, len: number): Pt =>
  [len * Math.sin(deg * DEG), len * Math.cos(deg * DEG)];

// ---------- §4.4 Paths & curves ----------

export function pathlen(path: Pt[]): number {
  let l = 0;
  for (let i = 1; i < path.length; i++) l += vdist(path[i - 1], path[i]);
  return l;
}

/**
 * Resample: new points spaced so every output segment is exactly `spacing`
 * long (the last may be shorter); first & last preserved. Each point is
 * found by walking the polyline to where it crosses a circle of radius
 * `spacing` around the previous point — output segments are chords, which
 * is what a stitch physically is. The bridge between math-space curves and
 * physical stitch spacing.
 */
export function resample(path: Pt[], spacing: number, maxPoints: number, line?: number): Pt[] {
  if (!(spacing > 0))
    throw new NeedlescriptError('resample: spacing must be greater than 0', line);
  const total = pathlen(path);
  // chord ≤ arc, so the output can't exceed total/spacing + endpoints
  if (total / spacing + 2 > maxPoints)
    throw new NeedlescriptError(
      `List too long (resample would produce over ${maxPoints.toLocaleString('en-US')} points)`,
      line,
    );
  const out: Pt[] = [[path[0][0], path[0][1]]];
  let cur: Pt = out[0];
  let i = 0;
  let segStart: Pt = path[0];
  while (i < path.length - 1) {
    const a = segStart, b = path[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const A = dx * dx + dy * dy;
    if (A === 0) { i++; segStart = path[i]; continue; }
    // |a + t·(b−a) − cur| = spacing  — a is always inside the circle (we
    // only advance segments that end inside it), so there is one forward
    // crossing: the + root of the quadratic.
    const fx = a[0] - cur[0], fy = a[1] - cur[1];
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - spacing * spacing;
    const disc = B * B - 4 * A * C;
    const t = disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : -1;
    if (t >= 0 && t <= 1) {
      const p: Pt = [a[0] + dx * t, a[1] + dy * t];
      out.push(p);
      cur = p;
      segStart = p;
    } else {
      i++;
      segStart = path[i];
    }
  }
  const last = path[path.length - 1];
  if (vdist(cur, last) > 1e-9) out.push([last[0], last[1]]);
  return out;
}

/** Chaikin corner-cutting, n iterations (1–6). Endpoints preserved. */
export function chaikin(path: Pt[], n: number): Pt[] {
  let pts = path;
  for (let k = 0; k < n; k++) {
    const out: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** Catmull-Rom spline through the control points, arc-length resampled. */
export function catmull(points: Pt[], spacing: number, maxPoints: number, line?: number): Pt[] {
  // Sample each segment densely, then resample by arc length. Endpoint
  // tangents use duplicated end control points (the standard trick).
  const dense: Pt[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const steps = Math.min(256, Math.max(8, Math.ceil(vdist(p1, p2) / Math.max(spacing, 1e-6) * 4)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      dense.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return resample(dense, spacing, maxPoints, line);
}

/** Cubic Bézier p0→p1 with control points c0, c1, arc-length resampled. */
export function bezier(p0: Pt, c0: Pt, c1: Pt, p1: Pt, spacing: number, maxPoints: number, line?: number): Pt[] {
  const rough = vdist(p0, c0) + vdist(c0, c1) + vdist(c1, p1);
  const steps = Math.min(2048, Math.max(16, Math.ceil(rough / Math.max(spacing, 1e-6) * 4)));
  const dense: Pt[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    dense.push([
      a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0],
      a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1],
    ]);
  }
  return resample(dense, spacing, maxPoints, line);
}

/**
 * Centroid of a region (signed-area formula); degenerate (zero-area)
 * regions fall back to the vertex mean.
 */
export function centroid(path: Pt[]): Pt {
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i], q = path[(i + 1) % path.length];
    const cross = p[0] * q[1] - q[0] * p[1];
    a2 += cross;
    cx += (p[0] + q[0]) * cross;
    cy += (p[1] + q[1]) * cross;
  }
  if (Math.abs(a2) < 1e-12) {
    let mx = 0, my = 0;
    for (const p of path) { mx += p[0]; my += p[1]; }
    return [mx / path.length, my / path.length];
  }
  return [cx / (3 * a2), cy / (3 * a2)];
}

/** [minx, miny, maxx, maxy] of a path. */
export function bbox(path: Pt[]): [number, number, number, number] {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of path) {
    if (x < minx) minx = x;
    if (y < miny) miny = y;
    if (x > maxx) maxx = x;
    if (y > maxy) maxy = y;
  }
  return [minx, miny, maxx, maxy];
}

/** Signed area of a region (positive = counter-clockwise in y-up space). */
export function signedArea(path: Pt[]): number {
  let a2 = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i], q = path[(i + 1) % path.length];
    a2 += p[0] * q[1] - q[0] * p[1];
  }
  return a2 / 2;
}

/** Even-odd point-in-polygon (consistent with fills; RFC-3 §4.6). */
export function pointInRegion(p: Pt, region: Pt[]): boolean {
  let inside = false;
  const [px, py] = p;
  for (let i = 0, j = region.length - 1; i < region.length; j = i++) {
    const [xi, yi] = region[i], [xj, yj] = region[j];
    if ((yi > py) !== (yj > py)) {
      const x = xi + ((py - yi) / (yj - yi)) * (xj - xi);
      if (x > px) inside = !inside;
    }
  }
  return inside;
}
