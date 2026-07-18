// ============================================================
// SVG-import geometry helpers (pure, DOM-free).
//
// Ring orientation, containment, nesting depth, and the hole-map
// computation that bridges SVG winding rules to NeedleScript's
// even-odd ring nesting (spec §11). Plus small metrics used for
// auto-suggestion and ordering.
// ============================================================

import type { Point, RingHole } from './model.ts';

/** Signed area of a ring (positive = counter-clockwise in y-up space). */
export function signedArea(ring: Point[]): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return a / 2;
}

export function orientationOf(ring: Point[]): 'cw' | 'ccw' {
  return signedArea(ring) >= 0 ? 'ccw' : 'cw';
}

function ringArea(ring: Point[]): number {
  return Math.abs(signedArea(ring));
}

/** Total polyline length (open path: no closing edge). */
function perimeter(ring: Point[], closed: boolean): number {
  let L = 0;
  for (let i = 1; i < ring.length; i++) {
    L += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
  }
  if (closed && ring.length > 2) {
    const a = ring[0],
      b = ring[ring.length - 1];
    L += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return L;
}

/** True when the first and last points coincide (within tolerance). */
export function isClosedRing(ring: Point[], tol = 0.15): boolean {
  if (ring.length < 4) return false;
  const a = ring[0],
    b = ring[ring.length - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
}

/** Standard even-odd ray-cast point-in-polygon test. */
export function pointInPolygon(p: Point, ring: Point[]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Leftmost vertex of a ring — a robust representative point for nesting. */
function representativePoint(ring: Point[]): Point {
  let best = ring[0];
  for (const p of ring) if (p[0] < best[0]) best = p;
  return best;
}

/**
 * Compute the hole map for an element's rings.
 *
 * Nesting depth is derived purely from containment (which ring sits inside
 * which), so it is correct regardless of whether the source art used the
 * nonzero or evenodd fill rule. NeedleScript fills by even-odd ring nesting:
 * a ring at odd depth cuts a hole, a ring at even depth is solid.
 */
export function computeHoleMap(
  rings: Point[][],
  fillRule: 'nonzero' | 'evenodd' = 'evenodd',
): RingHole[] {
  const reps = rings.map(representativePoint);
  return rings.map((ring, i) => {
    const containers: number[] = [];
    for (let j = 0; j < rings.length; j++) {
      if (j === i) continue;
      if (rings[j].length < 3) continue;
      if (pointInPolygon(reps[i], rings[j])) containers.push(j);
    }
    const parent = containers.reduce<number | null>((nearest, candidate) => {
      if (nearest === null) return candidate;
      return ringArea(rings[candidate]) < ringArea(rings[nearest]) ? candidate : nearest;
    }, null);
    let hole: boolean;
    if (fillRule === 'evenodd') {
      hole = containers.length % 2 === 1;
    } else {
      const winding = [i, ...containers].reduce(
        (sum, index) => sum + (orientationOf(rings[index]) === 'ccw' ? 1 : -1),
        0,
      );
      hole = winding === 0;
    }
    return {
      depth: containers.length,
      hole,
      orientation: orientationOf(ring),
      parent,
    };
  });
}

/**
 * Lower requested solid/hole interiors into even-odd fill groups.
 * Boundaries that do not change the fill state (for example a same-winding
 * nested ring under nonzero) are omitted. A solid island inside a hole starts
 * a separate group, so manual Hole/Solid edits affect emitted topology.
 */
export function normalizedFillGroups(holeMap: RingHole[]): number[][] {
  const changesState = holeMap.map((entry) => {
    const outsideFilled = entry.parent === null ? false : !holeMap[entry.parent].hole;
    return outsideFilled !== !entry.hole;
  });
  const groups: number[][] = [];
  for (let i = 0; i < holeMap.length; i++) {
    if (!changesState[i] || holeMap[i].hole) continue;
    const holes: number[] = [];
    for (let j = 0; j < holeMap.length; j++) {
      if (!changesState[j] || !holeMap[j].hole) continue;
      let parent = holeMap[j].parent;
      while (parent !== null && !changesState[parent]) parent = holeMap[parent].parent;
      if (parent === i) holes.push(j);
    }
    groups.push([i, ...holes]);
  }
  return groups;
}

/** Net stitched area: outer rings minus holes (for ordering / eligibility). */
export function netFillArea(rings: Point[][], holeMap: RingHole[]): number {
  let area = 0;
  for (let i = 0; i < rings.length; i++) {
    const parent = holeMap[i]?.parent ?? null;
    const outsideFilled = parent === null ? false : !holeMap[parent].hole;
    const insideFilled = !holeMap[i]?.hole;
    if (outsideFilled === insideFilled) continue;
    const a = ringArea(rings[i]);
    area += insideFilled ? a : -a;
  }
  return Math.max(0, area);
}

/**
 * Ratio of perimeter² to area — high for thin slivers, low for chunky blobs.
 * Used to route thin filled shapes to a satin border instead of a fill.
 */
export function perimeterToAreaRatio(rings: Point[][], closed: boolean): number {
  let peri = 0;
  let area = 0;
  for (const ring of rings) {
    peri += perimeter(ring, closed);
    area += ringArea(ring);
  }
  if (area < 1e-6) return Infinity;
  return (peri * peri) / area;
}

/**
 * Bounded self-intersection test for a single ring. Skipped (returns false)
 * for rings above `maxVerts` to keep the O(n²) edge-crossing check cheap.
 */
export function selfIntersects(ring: Point[], maxVerts = 220): boolean {
  const n = ring.length;
  if (n < 4 || n > maxVerts) return false;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      // skip adjacent edges (they share a vertex)
      if (i === 0 && j === n - 2) continue;
      if (segmentsCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
