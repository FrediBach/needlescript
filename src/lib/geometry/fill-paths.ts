import { NeedlescriptError } from '../core/errors.ts';
import { offsetCompoundRegion } from './geometry.ts';
import { pathlen, type Pt } from './genmath.ts';
import { generateFillRows } from '../embroidery/machine/fill.ts';

const distance = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function signedArea(ring: Pt[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function rotateToNearest(ring: Pt[], target: Pt): Pt[] {
  let best = 0,
    bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = distance(ring[i], target);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return [...ring.slice(best), ...ring.slice(0, best)];
}

export function closePath(ring: Pt[], line?: number): Pt[] {
  if (ring.length < 3)
    throw new NeedlescriptError(
      `closepath needs a ring of at least 3 points — got ${ring.length}`,
      line,
    );
  return [...ring, [ring[0][0], ring[0][1]]];
}

export function contourPaths(region: Pt[][], gap: number, maxVerts: number, line?: number): Pt[][] {
  if (!(gap > 0) || !Number.isFinite(gap))
    throw new NeedlescriptError('contourpaths: gap must be a finite number greater than 0', line);
  if (!region.length) return [];
  const winding = Math.sign(signedArea(region[0]));
  const origin = region[0][0];
  let current = offsetCompoundRegion(region, -gap / 2, line, maxVerts);
  const out: Pt[][] = [];
  let seam = origin;
  let charged = region.reduce((n, ring) => n + ring.length, 0);
  while (current.length) {
    const nextGeneration: Pt[][] = [];
    for (let ring of current) {
      if (pathlen([...ring, ring[0]]) < 2) continue;
      if (winding && Math.sign(signedArea(ring)) !== winding) ring = ring.slice().reverse();
      ring = rotateToNearest(ring, seam);
      seam = ring[0];
      out.push(closePath(ring));
      charged += ring.length;
      if (charged > maxVerts)
        throw new NeedlescriptError(
          `contourpaths: too many vertices (over ${maxVerts.toLocaleString('en-US')})`,
          line,
        );
      nextGeneration.push(ring);
    }
    current = nextGeneration.length
      ? offsetCompoundRegion(nextGeneration, -gap, line, maxVerts)
      : [];
  }
  return out;
}

export function spiralPaths(region: Pt[][], gap: number, maxVerts: number, line?: number): Pt[][] {
  const rings = contourPaths(region, gap, maxVerts, line);
  if (!rings.length) return [];
  const groups: { path: Pt[]; seam: Pt }[] = [];
  for (const closed of rings) {
    const open = closed.slice(0, -1);
    if (!open.length) continue;
    let best = -1,
      bestDistance = Infinity;
    for (let i = 0; i < groups.length; i++) {
      const d = distance(groups[i].seam, open[0]);
      if (d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    }
    if (best < 0 || bestDistance > gap * 2.5) groups.push({ path: open.slice(), seam: open[0] });
    else {
      groups[best].path.push(...open);
      groups[best].seam = open[0];
    }
  }
  return groups.map((group) => group.path).filter((path) => path.length >= 2);
}

export const fillRows = (region: Pt[][], spacing: number, angle: number): Pt[][] =>
  generateFillRows(region, spacing, angle);
