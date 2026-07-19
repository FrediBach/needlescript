import { NeedlescriptError } from '../core/errors.ts';
import type { Pt } from './genmath.ts';

const EPS = 1e-9;

export interface RailCheckpoint {
  a: Pt;
  b: Pt;
}

interface ParamPath {
  pts: Pt[];
  cum: number[];
  length: number;
  closed: boolean;
  seam: number;
}

export interface RailPairSample {
  a: Pt;
  b: Pt;
  mid: Pt;
  s: number;
  heading: number;
}

export interface RailPairGeometry {
  closed: boolean;
  samples: RailPairSample[];
  cumulative: number[];
  spineLength: number;
  meanWidth: number;
  railBReversed: boolean;
  seamChosen: boolean;
  linearSpine: boolean;
  atArc: (distance: number) => RailPairSample;
  atProgress: (progress: number) => RailPairSample;
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function samePoint(a: Pt, b: Pt): boolean {
  return distance(a, b) <= EPS;
}

function makePath(points: readonly Pt[], seam = 0): ParamPath {
  const pts = points.map((p) => [p[0], p[1]] as Pt);
  const cum = new Array<number>(pts.length);
  cum[0] = 0;
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + distance(pts[i - 1], pts[i]);
  return {
    pts,
    cum,
    length: cum[cum.length - 1],
    closed: samePoint(pts[0], pts[pts.length - 1]),
    seam,
  };
}

function pointAtRaw(path: ParamPath, parameter: number): Pt {
  const t = Math.min(Math.max(parameter, 0), 1);
  if (path.pts.length === 2) {
    const a = path.pts[0];
    const b = path.pts[1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  const target = t * path.length;
  let segment = 1;
  while (segment < path.pts.length - 1 && path.cum[segment] < target) segment++;
  const span = path.cum[segment] - path.cum[segment - 1];
  const f = span > EPS ? (target - path.cum[segment - 1]) / span : 0;
  const a = path.pts[segment - 1];
  const b = path.pts[segment];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function pointAt(path: ParamPath, progress: number): Pt {
  if (!path.closed) return pointAtRaw(path, progress);
  if (progress >= 1 - EPS) return pointAtRaw(path, path.seam);
  const p = (path.seam + Math.max(0, progress)) % 1;
  return pointAtRaw(path, p);
}

function rawToProgress(path: ParamPath, raw: number): number {
  if (!path.closed) return raw;
  return (raw - path.seam + 1) % 1;
}

function nearestRawParameter(path: ParamPath, point: Pt): number {
  let bestDistance = Infinity;
  let bestArc = 0;
  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1];
    const b = path.pts[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d2 = dx * dx + dy * dy;
    const f =
      d2 > EPS
        ? Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / d2))
        : 0;
    const q: Pt = [a[0] + dx * f, a[1] + dy * f];
    const d = distance(point, q);
    if (d < bestDistance - EPS) {
      bestDistance = d;
      bestArc = path.cum[i - 1] + Math.sqrt(d2) * f;
    }
  }
  return path.length > EPS ? bestArc / path.length : 0;
}

function signedArea(points: readonly Pt[]): number {
  let area = 0;
  for (let i = 1; i < points.length; i++)
    area += points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1];
  return area / 2;
}

function reverseRail(points: readonly Pt[], closed: boolean): Pt[] {
  if (!closed) return [...points].reverse().map((p) => [p[0], p[1]]);
  const body = points
    .slice(0, -1)
    .reverse()
    .map((p) => [p[0], p[1]] as Pt);
  body.push([body[0][0], body[0][1]]);
  return body;
}

function headingAt(samples: readonly { mid: Pt }[], index: number): number {
  const a = samples[Math.max(0, index - 1)].mid;
  const b = samples[Math.min(samples.length - 1, index + 1)].mid;
  return ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}

/**
 * Build the deterministic arc-length correspondence shared by satinbetween and
 * railspine. Inputs are already in the geometry frame in which spacing should
 * be measured (hoop space for satinbetween, caller space for railspine).
 */
export function prepareRailPair(
  railAInput: readonly Pt[],
  railBInput: readonly Pt[],
  checkpoints: readonly RailCheckpoint[] = [],
  line?: number,
  onOp?: (count: number) => void,
  label = 'satinbetween',
): RailPairGeometry {
  if (railAInput.length < 2 || railBInput.length < 2)
    throw new NeedlescriptError(`${label} rails must each contain at least 2 points`, line);

  const closedA = samePoint(railAInput[0], railAInput[railAInput.length - 1]);
  const closedB = samePoint(railBInput[0], railBInput[railBInput.length - 1]);
  if (closedA !== closedB)
    throw new NeedlescriptError(`${label} rails must both be open or both be closed`, line);

  let railB = railBInput.map((p) => [p[0], p[1]] as Pt);
  let railBReversed = false;
  if (closedA) {
    const areaA = signedArea(railAInput);
    const areaB = signedArea(railBInput);
    if (Math.abs(areaA) > EPS && Math.abs(areaB) > EPS && Math.sign(areaA) !== Math.sign(areaB)) {
      railB = reverseRail(railB, true);
      railBReversed = true;
    }
  } else {
    const direct =
      distance(railAInput[0], railB[0]) +
      distance(railAInput[railAInput.length - 1], railB[railB.length - 1]);
    const reversed =
      distance(railAInput[0], railB[railB.length - 1]) +
      distance(railAInput[railAInput.length - 1], railB[0]);
    if (reversed < direct - EPS) {
      railB = reverseRail(railB, false);
      railBReversed = true;
    }
  }

  const aPath = makePath(railAInput);
  let bPath = makePath(railB);
  if (!(aPath.length > EPS) || !(bPath.length > EPS))
    throw new NeedlescriptError(`${label} rails must have pathlen greater than 0`, line);

  let seamChosen = false;
  let seamCheckpointIndex = -1;
  if (closedA) {
    seamCheckpointIndex = checkpoints.findIndex((cp) => nearestRawParameter(aPath, cp.a) <= EPS);
    const seamCheckpoint = seamCheckpointIndex >= 0 ? checkpoints[seamCheckpointIndex] : undefined;
    const seam = nearestRawParameter(bPath, seamCheckpoint ? seamCheckpoint.b : railAInput[0]);
    bPath = makePath(railB, seam);
    seamChosen = true;
  }

  const anchors: { a: number; b: number; index: number }[] = [{ a: 0, b: 0, index: 0 }];
  for (let i = 0; i < checkpoints.length; i++) {
    if (i === seamCheckpointIndex) continue;
    const cp = checkpoints[i];
    const a = rawToProgress(aPath, nearestRawParameter(aPath, cp.a));
    const b = rawToProgress(bPath, nearestRawParameter(bPath, cp.b));
    if (a <= EPS || a >= 1 - EPS || b <= EPS || b >= 1 - EPS)
      throw new NeedlescriptError(`${label} checkpoint ${i + 1} repeats an endpoint`, line);
    const prev = anchors[anchors.length - 1];
    if (a <= prev.a + EPS || b <= prev.b + EPS)
      throw new NeedlescriptError(
        `${label} checkpoint ${i + 1} is not strictly increasing along both rails`,
        line,
      );
    anchors.push({ a, b, index: i + 1 });
  }
  anchors.push({ a: 1, b: 1, index: checkpoints.length + 1 });

  const pairedB = (s: number): number => {
    let j = 1;
    while (j < anchors.length - 1 && anchors[j].a < s) j++;
    const lo = anchors[j - 1];
    const hi = anchors[j];
    const f = hi.a - lo.a > EPS ? (s - lo.a) / (hi.a - lo.a) : 0;
    return lo.b + (hi.b - lo.b) * f;
  };

  const marchCount = Math.max(2, Math.ceil(Math.max(aPath.length, bPath.length) / 0.5));
  const parameters = new Set<number>([0, 1, ...anchors.map((anchor) => anchor.a)]);
  for (let i = 1; i < marchCount; i++) parameters.add(i / marchCount);
  const ordered = [...parameters].sort((a, b) => a - b);
  onOp?.(ordered.length);
  const base = ordered.map((s) => {
    const a = pointAt(aPath, s);
    const b = pointAt(bPath, pairedB(s));
    return { a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt, s };
  });
  const samples: RailPairSample[] = base.map((sample, i) => ({
    ...sample,
    heading: headingAt(base, i),
  }));
  const cumulative = new Array<number>(samples.length);
  cumulative[0] = 0;
  let widthSum = distance(samples[0].a, samples[0].b);
  for (let i = 1; i < samples.length; i++) {
    cumulative[i] = cumulative[i - 1] + distance(samples[i - 1].mid, samples[i].mid);
    widthSum += distance(samples[i].a, samples[i].b);
  }
  const spineLength = cumulative[cumulative.length - 1];
  if (!(spineLength > EPS))
    throw new NeedlescriptError(`${label} derived spine has zero length`, line);

  const atProgress = (progress: number): RailPairSample => {
    const s = Math.min(Math.max(progress, 0), 1);
    const a = pointAt(aPath, s);
    const b = pointAt(bPath, pairedB(s));
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const beforeS = Math.max(0, s - 1e-5);
    const afterS = Math.min(1, s + 1e-5);
    const beforeA = pointAt(aPath, beforeS);
    const beforeB = pointAt(bPath, pairedB(beforeS));
    const afterA = pointAt(aPath, afterS);
    const afterB = pointAt(bPath, pairedB(afterS));
    const dx = (afterA[0] + afterB[0] - beforeA[0] - beforeB[0]) / 2;
    const dy = (afterA[1] + afterB[1] - beforeA[1] - beforeB[1]) / 2;
    return {
      a,
      b,
      mid,
      s,
      heading: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360,
    };
  };
  const atArc = (arc: number): RailPairSample => {
    const target = Math.min(Math.max(arc, 0), spineLength);
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < target) i++;
    const span = cumulative[i] - cumulative[i - 1];
    const f = span > EPS ? (target - cumulative[i - 1]) / span : 0;
    const s = samples[i - 1].s + (samples[i].s - samples[i - 1].s) * f;
    return atProgress(s);
  };

  const firstMid = samples[0].mid;
  const lastMid = samples[samples.length - 1].mid;
  const lineDx = lastMid[0] - firstMid[0];
  const lineDy = lastMid[1] - firstMid[1];
  const lineLength = Math.hypot(lineDx, lineDy);
  const linearSpine =
    lineLength > EPS &&
    samples.every(
      (sample) =>
        Math.abs(lineDx * (sample.mid[1] - firstMid[1]) - lineDy * (sample.mid[0] - firstMid[0])) <=
        EPS * lineLength,
    );

  return {
    closed: closedA,
    samples,
    cumulative,
    spineLength,
    meanWidth: widthSum / samples.length,
    railBReversed,
    seamChosen,
    linearSpine,
    atArc,
    atProgress,
  };
}
