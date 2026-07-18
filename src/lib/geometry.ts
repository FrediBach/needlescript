// ---------- Geometry ops: Clipper2-backed offset & boolean (RFC-3 §4.6) ----------
//
// Clipper2 runs on ×1000 integer coordinates (µm precision): platform-stable
// results, no floating-point drift between machines. Scaled on the way in,
// unscaled on the way out.

import {
  JoinType,
  EndType,
  FillRule,
  inflatePaths,
  intersect,
  union,
  difference,
  xor,
  Clipper64,
  ClipType,
} from 'clipper2-ts';
import type { Path64, Paths64 } from 'clipper2-ts';
import { NeedlescriptError } from './errors.ts';
import { closePathCanonical, isClosedPath, type Pt } from './genmath.ts';

/** mm → integer µm. */
const SCALE = 1000;
/** Arc tolerance for round joins: 0.05 mm (RFC-3 §4.6), in scaled units. */
const ARC_TOLERANCE = 0.05 * SCALE;
/** Input cap for offsetpath / clippaths (RFC-3 §8). */
export const MAX_CLIP_VERTICES = 50000;

const toPath64 = (region: Pt[]): Path64 =>
  region.map(([x, y]) => ({ x: Math.round(x * SCALE), y: Math.round(y * SCALE) }));

const fromPaths64 = (paths: Paths64): Pt[][] =>
  paths
    .map((path) => path.map((p) => [p.x / SCALE, p.y / SCALE] as Pt))
    .filter((path) => path.length >= 3);

function checkVertexBudget(what: string, count: number, max: number, line?: number) {
  if (count > max)
    throw new NeedlescriptError(
      `${what}: too many vertices (${count.toLocaleString('en-US')}, limit ${max.toLocaleString('en-US')} per call)`,
      line,
    );
}

/**
 * Offset a region: positive inflates, negative shrinks. Shrinking may split
 * a shape into several or into none — an empty list, not an error, so
 * `for ring in offsetpath(cell, -2) [ … ]` naturally does nothing when the
 * shape vanishes. Round joins, arc tolerance 0.05 mm.
 */
export function offsetRegion(
  region: Pt[],
  delta: number,
  line?: number,
  maxVerts: number = MAX_CLIP_VERTICES,
): Pt[][] {
  checkVertexBudget('offsetpath', region.length, maxVerts, line);
  const out = inflatePaths(
    [toPath64(region)],
    delta * SCALE,
    JoinType.Round,
    EndType.Polygon,
    2,
    ARC_TOLERANCE,
  );
  return fromPaths64(out);
}

/** Offset a compound even-odd region in one operation, preserving islands and holes. */
export function offsetCompoundRegion(
  rings: Pt[][],
  delta: number,
  line?: number,
  maxVerts: number = MAX_CLIP_VERTICES,
): Pt[][] {
  const count = rings.reduce((n, ring) => n + ring.length, 0);
  checkVertexBudget('contourpaths', count, maxVerts, line);
  return fromPaths64(
    inflatePaths(
      union(rings.map(toPath64), FillRule.EvenOdd),
      delta * SCALE,
      JoinType.Round,
      EndType.Polygon,
      2,
      ARC_TOLERANCE,
    ),
  );
}

/** Intersect open paths with a compound even-odd region. */
export function clipOpenPaths(
  paths: Pt[][],
  rings: Pt[][],
  line?: number,
  maxVerts: number = MAX_CLIP_VERTICES,
): Pt[][] {
  const count = [...paths, ...rings].reduce((n, path) => n + path.length, 0);
  checkVertexBudget('fill paths', count, maxVerts, line);
  const clipper = new Clipper64();
  clipper.addOpenSubject(paths.map(toPath64));
  clipper.addClip(rings.map(toPath64));
  const closed: Paths64 = [];
  const open: Paths64 = [];
  clipper.execute(ClipType.Intersection, FillRule.EvenOdd, closed, open);
  return open.map((path) => path.map((p) => [p.x / SCALE, p.y / SCALE] as Pt));
}

/** Public open-path clipping, retaining either the interior or exterior pieces. */
export function clipOpenPath(
  path: Pt[],
  rings: Pt[][],
  mode: 'inside' | 'outside',
  line?: number,
  maxVerts: number = MAX_CLIP_VERTICES,
): Pt[][] {
  const count = path.length + rings.reduce((n, ring) => n + ring.length, 0);
  checkVertexBudget('clipopen', count, maxVerts, line);
  const clipper = new Clipper64();
  clipper.addOpenSubject([toPath64(path)]);
  clipper.addClip(rings.map(toPath64));
  const closed: Paths64 = [],
    open: Paths64 = [];
  clipper.execute(
    mode === 'inside' ? ClipType.Intersection : ClipType.Difference,
    FillRule.EvenOdd,
    closed,
    open,
  );
  return open
    .map((fragment) => fragment.map((p) => [p.x / SCALE, p.y / SCALE] as Pt))
    .filter((fragment) => fragment.length >= 2);
}

/** Convert an authored centerline into embroidery-friendly closed stroke outlines. */
export function strokePath(
  path: Pt[],
  width: number,
  cap: 'round' | 'butt' | 'square',
  join: 'round' | 'miter' | 'bevel',
  line?: number,
  maxVerts: number = MAX_CLIP_VERTICES,
): Pt[][] {
  if (!(width > 0)) throw new NeedlescriptError('strokepath: width must be greater than 0', line);
  checkVertexBudget('strokepath', path.length, maxVerts, line);
  const joinType =
    join === 'round' ? JoinType.Round : join === 'miter' ? JoinType.Miter : JoinType.Bevel;
  const endType = isClosedPath(path)
    ? EndType.Joined
    : cap === 'round'
      ? EndType.Round
      : cap === 'square'
        ? EndType.Square
        : EndType.Butt;
  return fromPaths64(
    inflatePaths([toPath64(path)], (width / 2) * SCALE, joinType, endType, 2, ARC_TOLERANCE),
  ).map(closePathCanonical);
}

/** Intersect closed paths with a compound even-odd region. */
export function clipClosedPaths(
  paths: Pt[][],
  rings: Pt[][],
  line?: number,
  maxVerts: number = MAX_CLIP_VERTICES,
): Pt[][] {
  const count = [...paths, ...rings].reduce((n, path) => n + path.length, 0);
  checkVertexBudget('fill paths', count, maxVerts, line);
  return fromPaths64(intersect(paths.map(toPath64), rings.map(toPath64), FillRule.EvenOdd));
}

/** Boolean of two regions; even-odd fill rule (consistent with inpath). */
export function clipRegions(
  a: Pt[],
  b: Pt[],
  op: string,
  line?: number,
  maxVerts: number = MAX_CLIP_VERTICES,
): Pt[][] {
  checkVertexBudget('clippaths', a.length + b.length, maxVerts, line);
  const sa: Paths64 = [toPath64(a)];
  const sb: Paths64 = [toPath64(b)];
  let out: Paths64;
  switch (op) {
    case 'union':
      out = union(sa, sb, FillRule.EvenOdd);
      break;
    case 'intersect':
      out = intersect(sa, sb, FillRule.EvenOdd);
      break;
    case 'difference':
      out = difference(sa, sb, FillRule.EvenOdd);
      break;
    case 'xor':
      out = xor(sa, sb, FillRule.EvenOdd);
      break;
    default:
      // unreachable: the parser validates the quoted op word
      throw new NeedlescriptError(`clippaths doesn't know "${op}"`, line);
  }
  return fromPaths64(out);
}
