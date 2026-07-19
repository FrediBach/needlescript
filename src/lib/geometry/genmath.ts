// ---------- Generative math: scalars, vectors, paths (RFC-3 §4.1/4.3/4.4) ----------
//
// The vocabulary, stated once and reused everywhere: a point is [x, y],
// a path is a list of ≥ 2 points, a region is a closed path (the closing
// segment is implicit). Everything heading-like uses turtle degrees:
// 0 = north/up, clockwise positive — matching seth, atan, towards.
//
// All functions here are pure and hand-rolled (≤ ~30 lines each): owning
// the code is cheaper than auditing a dependency for determinism.

import { NeedlescriptError } from '../core/errors.ts';
import { NsList, isList, describeVal } from '../runtime/list.ts';
import type { Val } from '../runtime/list.ts';

/** A point in working (mm) space. */
export type Pt = [number, number];

/** Editable cubic anchor: position plus incoming/outgoing relative handles. */
export interface CurveAnchor {
  pos: Pt;
  hin: Pt;
  hout: Pt;
}

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
    throw new NeedlescriptError(
      `${what}: expected a path (a list of [x, y] points), got ${describeVal(v)}`,
      line,
    );
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
  return alloc(pts.map((p) => alloc([p[0], p[1]])));
}

/** Validate and unpack the RFC editable-curves list shape. */
export function toCurveSpec(v: Val, what: string, line?: number): CurveAnchor[] {
  if (!isList(v) || v.items.length < 2)
    throw new NeedlescriptError(`${what}: expected a curve spec with at least 2 anchors`, line);
  return v.items.map((raw, index) => {
    try {
      if (!isList(raw)) throw new Error();
      if (raw.items.length === 2 && raw.items.every((item) => typeof item === 'number')) {
        const pos = toPoint(raw, what, line);
        if (!pos.every(Number.isFinite)) throw new Error();
        return { pos, hin: [0, 0], hout: [0, 0] };
      }
      if (raw.items.length === 3 && raw.items.every(isList)) {
        const pos = toPoint(raw.items[0], what, line);
        const hin = toPoint(raw.items[1], what, line);
        const hout = toPoint(raw.items[2], what, line);
        if (![...pos, ...hin, ...hout].every(Number.isFinite)) throw new Error();
        return { pos, hin, hout };
      }
    } catch {
      // Replaced below with the stable, index-bearing public error.
    }
    throw new NeedlescriptError(
      `${what}: anchor ${index} must be [x, y] or [[x, y], [inx, iny], [outx, outy]] with finite numbers`,
      line,
    );
  });
}

// ---------- §4.1 Scalars ----------

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const remap = (v: number, inlo: number, inhi: number, outlo: number, outhi: number) =>
  inhi === inlo ? outlo : outlo + ((v - inlo) / (inhi - inlo)) * (outhi - outlo);

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
export const vlerp = (a: Pt, b: Pt, t: number): Pt => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
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
  const c = Math.cos(deg * DEG),
    s = Math.sin(deg * DEG);
  return [a[0] * c + a[1] * s, a[1] * c - a[0] * s];
}

/** Turtle heading of the vector: 0 = north, clockwise (≡ atan x y). */
export const vheading = (a: Pt) => ((Math.atan2(a[0], a[1]) * 180) / Math.PI + 360) % 360;

/** Inverse of vheading: vfromheading(heading, 1) is the needle's direction. */
export const vfromheading = (deg: number, len: number): Pt => [
  len * Math.sin(deg * DEG),
  len * Math.cos(deg * DEG),
];

// ---------- §4.3b Segments ----------

/** Closest point on segment a→b to point p (clamped projection). */
function closestPtOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a; // degenerate: a === b
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq, 0, 1);
  return [a[0] + t * dx, a[1] + t * dy];
}

/**
 * Intersection point of segment a0→a1 and b0→b1, or null if they don't cross.
 * Segment test, not infinite-line — both t and u must lie in 0..1.
 * Collinear overlapping segments return the midpoint of the overlap.
 */
export function segisect(a0: Pt, a1: Pt, b0: Pt, b1: Pt): Pt | null {
  const d1x = a1[0] - a0[0],
    d1y = a1[1] - a0[1];
  const d2x = b1[0] - b0[0],
    d2y = b1[1] - b0[1];
  const det = d1x * d2y - d1y * d2x;
  const EPS = 1e-9;

  if (Math.abs(det) > EPS) {
    // Non-parallel: solve for t, u
    const dx = b0[0] - a0[0],
      dy = b0[1] - a0[1];
    const t = (dx * d2y - dy * d2x) / det;
    const u = (dx * d1y - dy * d1x) / det;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
      const tc = clamp(t, 0, 1);
      return [a0[0] + tc * d1x, a0[1] + tc * d1y];
    }
    return null;
  }

  // Parallel — check if collinear
  const ex = b0[0] - a0[0],
    ey = b0[1] - a0[1];
  const cross = ex * d1y - ey * d1x;
  if (Math.abs(cross) > EPS) return null; // parallel but not collinear

  // Collinear — project onto the axis with the larger span
  const axis = Math.abs(d1x) >= Math.abs(d1y) ? 0 : 1;
  const lenSq = axis === 0 ? d1x * d1x : d1y * d1y;
  if (lenSq === 0) {
    // Segment a is a point — check if it lies on b
    const bLenSq = d2x * d2x + d2y * d2y;
    if (bLenSq === 0) {
      // Both degenerate to the same point?
      return Math.abs(a0[0] - b0[0]) <= EPS && Math.abs(a0[1] - b0[1]) <= EPS ? a0 : null;
    }
    const ub = ((a0[0] - b0[0]) * d2x + (a0[1] - b0[1]) * d2y) / bLenSq;
    return ub >= -EPS && ub <= 1 + EPS ? [a0[0], a0[1]] : null;
  }

  // Project b0 and b1 onto segment a's parameter space
  const tb0 = (b0[axis] - a0[axis]) / (a1[axis] - a0[axis]);
  const tb1 = (b1[axis] - a0[axis]) / (a1[axis] - a0[axis]);
  const tlo = Math.min(tb0, tb1),
    thi = Math.max(tb0, tb1);
  const oStart = Math.max(tlo, 0),
    oEnd = Math.min(thi, 1);
  if (oStart > oEnd + EPS) return null; // no overlap
  const tMid = clamp((oStart + oEnd) / 2, 0, 1);
  return [a0[0] + tMid * d1x, a0[1] + tMid * d1y];
}

/** Shortest distance from point p to segment a→b. */
export const segdist = (p: Pt, a: Pt, b: Pt): number => vdist(p, closestPtOnSeg(p, a, b));

/**
 * Closest point to p lying anywhere on path (vertices or along segments).
 * Treats path as open (no implicit closing segment). O(len(path)) per call.
 */
export function nearestOnPath(p: Pt, path: Pt[], line?: number): Pt {
  if (path.length === 0) throw new NeedlescriptError('nearestonpath: path must not be empty', line);
  if (path.length === 1) return [path[0][0], path[0][1]];
  let best = closestPtOnSeg(p, path[0], path[1]);
  let bestD = vdist(p, best);
  for (let i = 1; i < path.length - 1; i++) {
    const c = closestPtOnSeg(p, path[i], path[i + 1]);
    const d = vdist(p, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// ---------- §4.4 Paths & curves ----------

export function pathlen(path: Pt[]): number {
  let l = 0;
  for (let i = 1; i < path.length; i++) l += vdist(path[i - 1], path[i]);
  return l;
}

const CLOSED_EPS = 1e-3;

export const isClosedPath = (path: Pt[]): boolean =>
  path.length >= 4 && vdist(path[0], path[path.length - 1]) <= CLOSED_EPS;

export function openPath(path: Pt[]): Pt[] {
  const end = isClosedPath(path) ? path.length - 1 : path.length;
  return path.slice(0, end).map(([x, y]) => [x, y]);
}

export function closePathCanonical(path: Pt[]): Pt[] {
  const out = openPath(path);
  if (out.length) out.push([out[0][0], out[0][1]]);
  return out;
}

export function pathOrientation(path: Pt[]): number {
  const area = signedArea(openPath(path));
  return Math.abs(area) <= 1e-12 ? 0 : area > 0 ? 1 : -1;
}

function cumulative(path: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + vdist(path[i - 1], path[i]));
  return out;
}

export function pointAtDistance(path: Pt[], distance: number): Pt {
  if (path.length === 1) return [...path[0]];
  const cum = cumulative(path);
  const target = clamp(distance, 0, cum[cum.length - 1]);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const length = cum[i] - cum[i - 1];
  return length <= 1e-12
    ? [...path[i]]
    : vlerp(path[i - 1], path[i], (target - cum[i - 1]) / length);
}

export const pointAt = (path: Pt[], t: number): Pt =>
  pointAtDistance(path, clamp(t, 0, 1) * pathlen(path));

export function headingAt(path: Pt[], t: number): number {
  const target = clamp(t, 0, 1) * pathlen(path);
  let walked = 0;
  let answer = 0;
  for (let i = 1; i < path.length; i++) {
    const length = vdist(path[i - 1], path[i]);
    if (length > 1e-9) {
      answer = vheading(vsub(path[i], path[i - 1]));
      if (walked + length >= target) break;
    }
    walked += length;
  }
  return answer;
}

export function paramOf(p: Pt, path: Pt[]): number {
  const total = pathlen(path);
  if (total < 1e-9) return 0;
  let walked = 0,
    bestDistance = Infinity,
    bestAlong = 0;
  for (let i = 1; i < path.length; i++) {
    const delta = vsub(path[i], path[i - 1]);
    const length2 = vdot(delta, delta);
    const length = Math.sqrt(length2);
    const u = length2 > 1e-9 ? clamp(vdot(vsub(p, path[i - 1]), delta) / length2, 0, 1) : 0;
    const distance = vdist(p, vlerp(path[i - 1], path[i], u));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlong = walked + u * length;
    }
    walked += length;
  }
  return bestAlong / total;
}

export function subPath(path: Pt[], t0: number, t1: number): Pt[] {
  if (t1 < t0) return subPath(path, t1, t0).reverse();
  const total = pathlen(path),
    lo = clamp(t0, 0, 1) * total,
    hi = clamp(t1, 0, 1) * total;
  const out = [pointAtDistance(path, lo)];
  const cum = cumulative(path);
  for (let i = 1; i < path.length; i++) if (cum[i] > lo && cum[i] < hi) out.push([...path[i]]);
  out.push(pointAtDistance(path, hi));
  return out;
}

export function insertVertex(path: Pt[], t: number): Pt[] {
  const target = clamp(t, 0, 1) * pathlen(path),
    cum = cumulative(path);
  const existing = cum.findIndex((d) => Math.abs(d - target) <= 1e-6);
  if (existing >= 0) return path.map((p) => [...p]);
  let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  return [
    ...path.slice(0, i).map((p) => [...p] as Pt),
    pointAtDistance(path, target),
    ...path.slice(i).map((p) => [...p] as Pt),
  ];
}

function pointLineDistance(p: Pt, a: Pt, b: Pt): number {
  return segdist(p, a, b);
}

function flattenCubic(p0: Pt, c0: Pt, c1: Pt, p1: Pt, tol: number, out: Pt[], depth = 0): void {
  if (
    depth >= 24 ||
    Math.max(pointLineDistance(c0, p0, p1), pointLineDistance(c1, p0, p1)) <= tol
  ) {
    out.push([...p1]);
    return;
  }
  const a = vlerp(p0, c0, 0.5),
    b = vlerp(c0, c1, 0.5),
    c = vlerp(c1, p1, 0.5);
  const d = vlerp(a, b, 0.5),
    e = vlerp(b, c, 0.5),
    m = vlerp(d, e, 0.5);
  flattenCubic(p0, a, d, m, tol, out, depth + 1);
  flattenCubic(m, e, c, p1, tol, out, depth + 1);
}

export function curveFlat(spec: CurveAnchor[], tolerance: number, closed = false): Pt[] {
  const tol = Math.max(0.005, tolerance);
  const out: Pt[] = [[...spec[0].pos]];
  const count = closed ? spec.length : spec.length - 1;
  for (let i = 0; i < count; i++) {
    const a = spec[i],
      b = spec[(i + 1) % spec.length];
    const c0 = vadd(a.pos, a.hout),
      c1 = vadd(b.pos, b.hin);
    if (
      pointLineDistance(c0, a.pos, b.pos) <= 1e-12 &&
      pointLineDistance(c1, a.pos, b.pos) <= 1e-12
    )
      out.push([...b.pos]);
    else flattenCubic(a.pos, c0, c1, b.pos, tol, out);
  }
  return closed ? closePathCanonical(out) : out;
}

/** Numeric closed-ring resampling with an evenly distributed seam. */
export function resampleClosed(
  path: Pt[],
  spacing: number,
  maxPoints: number,
  line?: number,
): Pt[] {
  if (!(spacing > 0)) throw new NeedlescriptError('resample: spacing must be greater than 0', line);
  const ring = closePathCanonical(path),
    total = pathlen(ring);
  if (!(total > 0)) return ring;
  const segments = Math.max(1, Math.round(total / spacing));
  if (segments + 1 > maxPoints)
    throw new NeedlescriptError(
      `List too long (resample would produce over ${maxPoints.toLocaleString('en-US')} points)`,
      line,
    );
  const out: Pt[] = [];
  for (let i = 0; i < segments; i++) out.push(pointAtDistance(ring, (i * total) / segments));
  out.push([...out[0]]);
  return out;
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
  if (!(spacing > 0)) throw new NeedlescriptError('resample: spacing must be greater than 0', line);
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
    const a = segStart,
      b = path[i + 1];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const A = dx * dx + dy * dy;
    if (A === 0) {
      i++;
      segStart = path[i];
      continue;
    }
    // |a + t·(b−a) − cur| = spacing  — a is always inside the circle (we
    // only advance segments that end inside it), so there is one forward
    // crossing: the + root of the quadratic.
    const fx = a[0] - cur[0],
      fy = a[1] - cur[1];
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

/**
 * Resample with a cycling length pattern (list form). Each output segment
 * cycles through `pattern[i % len]` starting from `phase`. First and last
 * input vertices are always preserved. The `phase` is the 0-based start index
 * into the pattern (modulo pattern length).
 */
export function resampleList(
  path: Pt[],
  pattern: number[],
  phase: number,
  maxPoints: number,
  line?: number,
): Pt[] {
  if (!pattern.length)
    throw new NeedlescriptError('resample: pattern list must not be empty', line);
  // Validate all pattern elements are positive.
  for (let k = 0; k < pattern.length; k++) {
    if (!(pattern[k] > 0))
      throw new NeedlescriptError(`resample: pattern element ${k} must be greater than 0`, line);
  }
  const total = pathlen(path);
  const avgSpacing = total / Math.max(pattern.reduce((s, v) => s + v, 0) / pattern.length, 1e-6);
  if (avgSpacing + 2 > maxPoints)
    throw new NeedlescriptError(
      `List too long (resample would produce over ${maxPoints.toLocaleString('en-US')} points)`,
      line,
    );

  const n = pattern.length;
  const normPhase = ((Math.round(phase) % n) + n) % n;
  const out: Pt[] = [[path[0][0], path[0][1]]];
  let cur: Pt = out[0];
  let i = 0; // segment index
  let segStart: Pt = path[0];
  let cycleIdx = 0; // pattern cycle index

  while (i < path.length - 1) {
    const spacing = pattern[(cycleIdx + normPhase) % n];
    const a = segStart,
      b = path[i + 1];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const A = dx * dx + dy * dy;
    if (A === 0) {
      i++;
      segStart = path[i];
      continue;
    }
    const fx = a[0] - cur[0],
      fy = a[1] - cur[1];
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - spacing * spacing;
    const disc = B * B - 4 * A * C;
    const t = disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : -1;
    if (t >= 0 && t <= 1) {
      const p: Pt = [a[0] + dx * t, a[1] + dy * t];
      out.push(p);
      cur = p;
      segStart = p;
      cycleIdx++;
    } else {
      i++;
      segStart = path[i];
    }
  }
  const last = path[path.length - 1];
  if (vdist(cur, last) > 1e-9) out.push([last[0], last[1]]);
  return out;
}

/**
 * Resample with a per-point reporter (reporter form). The reporter receives
 * (t, s, i, p) — arc-length cursor, normalised position, stitch index, and
 * the cursor's position — and returns the desired spacing for the next step.
 * First and last input vertices are always preserved.
 */
export function resampleReporter(
  path: Pt[],
  reporter: (t: number, s: number, i: number, p: Pt) => number,
  maxPoints: number,
  line?: number,
): Pt[] {
  const total = pathlen(path);
  if (!(total > 0)) return path.length ? [[path[0][0], path[0][1]]] : [];

  // Cumulative arc length.
  const cum: number[] = [0];
  for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + vdist(path[k - 1], path[k]));
  const L = cum[cum.length - 1];

  const at = (t: number): Pt => {
    const a = Math.min(Math.max(t, 0), L);
    let seg = 1;
    while (seg < path.length - 1 && cum[seg] < a) seg++;
    const segLen = cum[seg] - cum[seg - 1] || 1;
    const f = (a - cum[seg - 1]) / segLen;
    return [
      path[seg - 1][0] + (path[seg][0] - path[seg - 1][0]) * f,
      path[seg - 1][1] + (path[seg][1] - path[seg - 1][1]) * f,
    ] as Pt;
  };

  const out: Pt[] = [[path[0][0], path[0][1]]];
  let cursor = 0;
  let stitchIdx = 0;
  const guardMax = Math.ceil(L / 0.01) + path.length + 10;
  let guard = 0;

  while (cursor < L - 1e-9 && guard++ < guardMax) {
    const p = at(cursor);
    const rawSpacing = reporter(cursor, cursor / L, stitchIdx, p);
    if (typeof rawSpacing !== 'number' || !isFinite(rawSpacing) || rawSpacing <= 0)
      throw new NeedlescriptError(
        'resample reporter must return a positive finite number, got ' + rawSpacing,
        line,
      );
    cursor = Math.min(cursor + rawSpacing, L);
    out.push(at(cursor));
    stitchIdx++;
    if (out.length > maxPoints)
      throw new NeedlescriptError(
        `List too long (resample reporter would produce over ${maxPoints.toLocaleString('en-US')} points)`,
        line,
      );
  }
  const last = path[path.length - 1];
  const outLast = out[out.length - 1];
  if (vdist(outLast, last) > 1e-9) out.push([last[0], last[1]]);
  return out;
}
export function chaikin(path: Pt[], n: number): Pt[] {
  let pts = path;
  for (let k = 0; k < n; k++) {
    const out: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i],
        b = pts[i + 1];
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
    const steps = Math.min(
      256,
      Math.max(8, Math.ceil((vdist(p1, p2) / Math.max(spacing, 1e-6)) * 4)),
    );
    for (let s = 1; s <= steps; s++) {
      const t = s / steps,
        t2 = t * t,
        t3 = t2 * t;
      dense.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return resample(dense, spacing, maxPoints, line);
}

/** Cubic Bézier p0→p1 with control points c0, c1, arc-length resampled. */
export function bezier(
  p0: Pt,
  c0: Pt,
  c1: Pt,
  p1: Pt,
  spacing: number,
  maxPoints: number,
  line?: number,
): Pt[] {
  const rough = vdist(p0, c0) + vdist(c0, c1) + vdist(c1, p1);
  const steps = Math.min(2048, Math.max(16, Math.ceil((rough / Math.max(spacing, 1e-6)) * 4)));
  const dense: Pt[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps,
      u = 1 - t;
    const a = u * u * u,
      b = 3 * u * u * t,
      c = 3 * u * t * t,
      d = t * t * t;
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
  let a2 = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i],
      q = path[(i + 1) % path.length];
    const cross = p[0] * q[1] - q[0] * p[1];
    a2 += cross;
    cx += (p[0] + q[0]) * cross;
    cy += (p[1] + q[1]) * cross;
  }
  if (Math.abs(a2) < 1e-12) {
    let mx = 0,
      my = 0;
    for (const p of path) {
      mx += p[0];
      my += p[1];
    }
    return [mx / path.length, my / path.length];
  }
  return [cx / (3 * a2), cy / (3 * a2)];
}

/** [minx, miny, maxx, maxy] of a path. */
export function bbox(path: Pt[]): [number, number, number, number] {
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
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
    const p = path[i],
      q = path[(i + 1) % path.length];
    a2 += p[0] * q[1] - q[0] * p[1];
  }
  return a2 / 2;
}

/** Even-odd point-in-polygon (consistent with fills; RFC-3 §4.6). */
export function pointInRegion(p: Pt, region: Pt[]): boolean {
  let inside = false;
  const [px, py] = p;
  for (let i = 0, j = region.length - 1; i < region.length; j = i++) {
    const [xi, yi] = region[i],
      [xj, yj] = region[j];
    if (yi > py !== yj > py) {
      const x = xi + ((py - yi) / (yj - yi)) * (xj - xi);
      if (x > px) inside = !inside;
    }
  }
  return inside;
}

export interface PathIntersection {
  point: Pt;
  ta: number;
  tb: number;
}

export function pathIntersectionParams(a: Pt[], b: Pt[]): PathIntersection[] {
  const ca = cumulative(a),
    cb = cumulative(b);
  const la = ca[ca.length - 1] || 1,
    lb = cb[cb.length - 1] || 1;
  const out: PathIntersection[] = [];
  for (let i = 1; i < a.length; i++)
    for (let j = 1; j < b.length; j++) {
      const point = segisect(a[i - 1], a[i], b[j - 1], b[j]);
      if (!point) continue;
      const ta = (ca[i - 1] + vdist(a[i - 1], point)) / la;
      const tb = (cb[j - 1] + vdist(b[j - 1], point)) / lb;
      if (
        !out.some(
          (hit) =>
            vdist(hit.point, point) <= 1e-9 &&
            Math.abs(hit.ta - ta) <= 1e-9 &&
            Math.abs(hit.tb - tb) <= 1e-9,
        )
      )
        out.push({ point, ta, tb });
    }
  return out.sort((x, y) => x.ta - y.ta || x.tb - y.tb);
}

export function pathSelfIntersections(path: Pt[]): PathIntersection[] {
  const cum = cumulative(path),
    total = cum[cum.length - 1] || 1;
  const out: PathIntersection[] = [];
  for (let i = 1; i < path.length; i++)
    for (let j = i + 2; j < path.length; j++) {
      if (isClosedPath(path) && i === 1 && j === path.length - 1) continue;
      const point = segisect(path[i - 1], path[i], path[j - 1], path[j]);
      if (!point) continue;
      const t1 = (cum[i - 1] + vdist(path[i - 1], point)) / total;
      const t2 = (cum[j - 1] + vdist(path[j - 1], point)) / total;
      out.push({ point, ta: Math.min(t1, t2), tb: Math.max(t1, t2) });
    }
  return out.sort((x, y) => x.ta - y.ta || x.tb - y.tb);
}

/** Deterministically weld endpoint-adjacent fragments without mutating inputs. */
export function joinPaths(fragments: Pt[][], tolerance: number): Pt[][] {
  if (tolerance < 0) throw new NeedlescriptError('joinpaths: tolerance must not be negative');
  const unused = new Set(fragments.map((_, i) => i));
  const result: Pt[][] = [];
  while (unused.size) {
    const seed = Math.min(...unused);
    unused.delete(seed);
    const chain = fragments[seed].map((p) => [...p] as Pt);
    let changed = true;
    while (changed) {
      changed = false;
      let best: { index: number; side: 0 | 1; reverse: boolean; distance: number } | undefined;
      for (const index of unused) {
        const frag = fragments[index],
          ends = [frag[0], frag[frag.length - 1]];
        const candidates = [
          { side: 1 as const, reverse: false, distance: vdist(chain[chain.length - 1], ends[0]) },
          { side: 1 as const, reverse: true, distance: vdist(chain[chain.length - 1], ends[1]) },
          { side: 0 as const, reverse: true, distance: vdist(chain[0], ends[0]) },
          { side: 0 as const, reverse: false, distance: vdist(chain[0], ends[1]) },
        ];
        for (const c of candidates)
          if (
            c.distance <= tolerance &&
            (!best ||
              c.distance < best.distance - 1e-12 ||
              (Math.abs(c.distance - best.distance) <= 1e-12 &&
                (index < best.index || (index === best.index && !c.reverse && best.reverse))))
          )
            best = { index, ...c };
      }
      if (best) {
        unused.delete(best.index);
        const add = fragments[best.index].map((p) => [...p] as Pt);
        if (best.reverse) add.reverse();
        if (best.side === 1)
          chain.push(...add.slice(vdist(chain[chain.length - 1], add[0]) <= tolerance ? 1 : 0));
        else
          chain.unshift(
            ...add.slice(0, vdist(chain[0], add[add.length - 1]) <= tolerance ? -1 : undefined),
          );
        changed = true;
      }
    }
    if (chain.length >= 3 && vdist(chain[0], chain[chain.length - 1]) <= tolerance)
      chain[chain.length - 1] = [...chain[0]];
    result.push(chain);
  }
  return result;
}
