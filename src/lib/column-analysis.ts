import type { Pt } from './genmath.ts';

const EPS = 1e-9;
const SMOOTH_TURN_EPSILON_RAD = 1e-3;
const CUSP_TURN_DEG = 150;

export const DEFAULT_SATIN_SHARP_TURN_DEG = 60;
export const DEFAULT_SATIN_UNSAFE_WIDTH_RATIO = 1;
export const DEFAULT_SATIN_TIP_WIDTH_MM = 0.05;

export type ColumnSource = 'spine' | 'rail-pair';
export type ColumnPointKind = 'tip' | 'straight' | 'curve' | 'sharp-corner' | 'cusp' | 'u-turn';
export type ColumnTaperDirection = 'constant' | 'narrowing' | 'widening';

export interface ColumnAnalysisOptions {
  /** Input sample indices explicitly authored as construction boundaries. */
  declaredCornerIndices?: readonly number[];
  /** Absolute change in travel direction that begins a sharp corner. */
  sharpTurnThresholdDeg?: number;
  /** Realized-width / limiting-radius ratio considered unsafe. */
  unsafeWidthRatio?: number;
  /** Width at or below which a sample is a collapsed/tapered tip. */
  tipWidthMM?: number;
}

export interface ColumnRailSample {
  a: Pt;
  b: Pt;
  mid?: Pt;
}

export interface AnalyzedRailCurvature {
  signedCurvaturePerMM: number;
  turnAngleDeg: number;
  radiusMM: number;
  /** The outgoing-chord / turn estimate retained for legacy warning parity. */
  legacyRadiusMM: number;
}

export interface AnalyzedColumnSample {
  index: number;
  inputIndex: number;
  point: Pt;
  railA?: Pt;
  railB?: Pt;
  arcLengthMM: number;
  incomingTangent: Pt | null;
  outgoingTangent: Pt | null;
  tangent: Pt;
  signedTurnDeg: number;
  turnAngleDeg: number;
  cornerAngleDeg: number;
  signedCurvaturePerMM: number;
  curvatureRadiusMM: number;
  /** The outgoing-chord / turn estimate used by the historical satin guard. */
  legacyCurvatureRadiusMM: number;
  railCurvature?: { a: AnalyzedRailCurvature; b: AnalyzedRailCurvature };
  realizedWidthMM: number;
  widthSlope: number;
  taper: ColumnTaperDirection;
  widthToRadiusRatio: number;
  endpoint: 'start' | 'end' | null;
  collapsedTip: boolean;
  declaredCorner: boolean;
  sharpCorner: boolean;
  continuousCurvature: boolean;
  unsafeWidth: boolean;
  kind: ColumnPointKind;
}

export interface AnalyzedColumnSegment {
  index: number;
  sampleIndices: number[];
  startIndex: number;
  endIndex: number;
  lengthMM: number;
  closed: boolean;
}

export interface AnalyzedColumn {
  source: ColumnSource;
  closed: boolean;
  inputSampleCount: number;
  lengthMM: number;
  samples: AnalyzedColumnSample[];
  segments: AnalyzedColumnSegment[];
  tipIndices: number[];
  sharpCornerIndices: number[];
  unsafeWidthIndices: number[];
}

interface RawSample {
  point: Pt;
  width: number;
  railA?: Pt;
  railB?: Pt;
  inputIndex: number;
  declaredCorner: boolean;
}

function copyPoint(point: Pt): Pt {
  return [point[0], point[1]];
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function samePoint(a: Pt, b: Pt): boolean {
  return distance(a, b) <= EPS;
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} must be a finite number greater than or equal to 0`);
  return value;
}

function normalized(dx: number, dy: number): Pt | null {
  const length = Math.hypot(dx, dy);
  return length > EPS ? [dx / length, dy / length] : null;
}

function tangentBetween(a: Pt, b: Pt): Pt | null {
  return normalized(b[0] - a[0], b[1] - a[1]);
}

function turnMetrics(
  previous: Pt | undefined,
  current: Pt,
  next: Pt | undefined,
): {
  incoming: Pt | null;
  outgoing: Pt | null;
  tangent: Pt;
  signedTurnDeg: number;
  turnAngleDeg: number;
  curvature: number;
  radius: number;
  legacyRadius: number;
} {
  const incoming = previous ? tangentBetween(previous, current) : null;
  const outgoing = next ? tangentBetween(current, next) : null;
  let tangent = outgoing ?? incoming ?? ([0, 0] as Pt);
  if (incoming && outgoing) {
    tangent = normalized(incoming[0] + outgoing[0], incoming[1] + outgoing[1]) ?? outgoing;
  }
  if (!incoming || !outgoing) {
    return {
      incoming,
      outgoing,
      tangent,
      signedTurnDeg: 0,
      turnAngleDeg: 0,
      curvature: 0,
      radius: Infinity,
      legacyRadius: Infinity,
    };
  }

  const dot = Math.max(-1, Math.min(1, incoming[0] * outgoing[0] + incoming[1] * outgoing[1]));
  const turnRad = Math.acos(dot);
  const cross = incoming[0] * outgoing[1] - incoming[1] * outgoing[0];
  const sign = cross < 0 ? -1 : 1;
  const signedTurnRad = turnRad <= EPS ? 0 : turnRad * sign;
  const incomingLength = previous ? distance(previous, current) : 0;
  const outgoingLength = next ? distance(current, next) : 0;
  const supportLength = (incomingLength + outgoingLength) / 2;
  const curvature = supportLength > EPS ? signedTurnRad / supportLength : 0;
  return {
    incoming,
    outgoing,
    tangent,
    signedTurnDeg: (signedTurnRad * 180) / Math.PI,
    turnAngleDeg: (turnRad * 180) / Math.PI,
    curvature,
    radius: Math.abs(curvature) > EPS ? 1 / Math.abs(curvature) : Infinity,
    legacyRadius: turnRad > EPS && outgoingLength > EPS ? outgoingLength / turnRad : Infinity,
  };
}

function railCurvature(
  previous: Pt | undefined,
  current: Pt,
  next: Pt | undefined,
): AnalyzedRailCurvature {
  const metrics = turnMetrics(previous, current, next);
  return {
    signedCurvaturePerMM: metrics.curvature,
    turnAngleDeg: metrics.turnAngleDeg,
    radiusMM: metrics.radius,
    legacyRadiusMM: metrics.legacyRadius,
  };
}

function neighbor<T>(
  values: readonly T[],
  index: number,
  offset: -1 | 1,
  closed: boolean,
): T | undefined {
  const candidate = index + offset;
  if (candidate >= 0 && candidate < values.length) return values[candidate];
  if (!closed) return undefined;
  return values[(candidate + values.length) % values.length];
}

function segmentLength(indices: readonly number[], edgeLengths: readonly number[]): number {
  let length = 0;
  for (let i = 1; i < indices.length; i++) length += edgeLengths[indices[i - 1]];
  return length;
}

function buildSegments(
  sampleCount: number,
  closed: boolean,
  sharpCorners: readonly number[],
  edgeLengths: readonly number[],
): AnalyzedColumnSegment[] {
  if (!closed) {
    const breaks = [...new Set([0, ...sharpCorners, sampleCount - 1])].sort((a, b) => a - b);
    const segments: AnalyzedColumnSegment[] = [];
    for (let i = 1; i < breaks.length; i++) {
      const sampleIndices = Array.from(
        { length: breaks[i] - breaks[i - 1] + 1 },
        (_, offset) => breaks[i - 1] + offset,
      );
      segments.push({
        index: segments.length,
        sampleIndices,
        startIndex: sampleIndices[0],
        endIndex: sampleIndices[sampleIndices.length - 1],
        lengthMM: segmentLength(sampleIndices, edgeLengths),
        closed: false,
      });
    }
    return segments;
  }

  if (!sharpCorners.length) {
    const sampleIndices = [...Array.from({ length: sampleCount }, (_, index) => index), 0];
    return [
      {
        index: 0,
        sampleIndices,
        startIndex: 0,
        endIndex: 0,
        lengthMM: segmentLength(sampleIndices, edgeLengths),
        closed: true,
      },
    ];
  }

  const breaks = [...sharpCorners].sort((a, b) => a - b);
  return breaks.map((startIndex, breakIndex) => {
    const endIndex = breaks[(breakIndex + 1) % breaks.length];
    const sampleIndices = [startIndex];
    let cursor = startIndex;
    do {
      cursor = (cursor + 1) % sampleCount;
      sampleIndices.push(cursor);
    } while (cursor !== endIndex);
    return {
      index: breakIndex,
      sampleIndices,
      startIndex,
      endIndex,
      lengthMM: segmentLength(sampleIndices, edgeLengths),
      closed: false,
    };
  });
}

function analyzeRawColumn(
  source: ColumnSource,
  inputSamples: readonly RawSample[],
  options: ColumnAnalysisOptions,
): AnalyzedColumn {
  if (inputSamples.length < 2) throw new RangeError('a column must contain at least 2 samples');
  const closed = samePoint(inputSamples[0].point, inputSamples[inputSamples.length - 1].point);
  const raw = inputSamples.map((sample) => ({
    ...sample,
    point: copyPoint(sample.point),
    railA: sample.railA ? copyPoint(sample.railA) : undefined,
    railB: sample.railB ? copyPoint(sample.railB) : undefined,
  }));
  if (closed) raw.pop();
  if (raw.length < 2) throw new RangeError('a column must contain at least 2 distinct samples');

  const sharpThreshold = finiteNonNegative(
    options.sharpTurnThresholdDeg ?? DEFAULT_SATIN_SHARP_TURN_DEG,
    'sharpTurnThresholdDeg',
  );
  const unsafeRatio = finiteNonNegative(
    options.unsafeWidthRatio ?? DEFAULT_SATIN_UNSAFE_WIDTH_RATIO,
    'unsafeWidthRatio',
  );
  const tipWidth = finiteNonNegative(
    options.tipWidthMM ?? DEFAULT_SATIN_TIP_WIDTH_MM,
    'tipWidthMM',
  );

  const edgeCount = closed ? raw.length : raw.length - 1;
  const edgeLengths = new Array<number>(edgeCount);
  const cumulative = new Array<number>(raw.length).fill(0);
  for (let i = 0; i < edgeCount; i++) {
    edgeLengths[i] = distance(raw[i].point, raw[(i + 1) % raw.length].point);
    if (i + 1 < raw.length) cumulative[i + 1] = cumulative[i] + edgeLengths[i];
  }
  const lengthMM = edgeLengths.reduce((sum, length) => sum + length, 0);
  if (!(lengthMM > EPS))
    throw new RangeError('a column must have hoop-space arc length greater than 0');

  const samples = raw.map((sample, index): AnalyzedColumnSample => {
    const previous = neighbor(raw, index, -1, closed);
    const next = neighbor(raw, index, 1, closed);
    const turn = turnMetrics(previous?.point, sample.point, next?.point);
    const turnRad = (turn.turnAngleDeg * Math.PI) / 180;
    const declaredCorner = sample.declaredCorner;
    const collapsedTip = sample.width <= tipWidth + EPS;
    const cusp = turn.turnAngleDeg >= CUSP_TURN_DEG - EPS && collapsedTip;
    const uTurn = turn.turnAngleDeg >= CUSP_TURN_DEG - EPS && !collapsedTip;
    const detectedSharp = turn.turnAngleDeg >= sharpThreshold - EPS && turn.turnAngleDeg > EPS;
    const sharpCorner = declaredCorner || detectedSharp;
    const continuousCurvature =
      !sharpCorner && turnRad > SMOOTH_TURN_EPSILON_RAD && turnRad < Math.PI - EPS;
    const limitingRadius = Math.min(
      turn.radius,
      sample.railA && previous?.railA && next?.railA
        ? railCurvature(previous.railA, sample.railA, next.railA).radiusMM
        : Infinity,
      sample.railB && previous?.railB && next?.railB
        ? railCurvature(previous.railB, sample.railB, next.railB).radiusMM
        : Infinity,
    );
    const widthToRadiusRatio = Number.isFinite(limitingRadius)
      ? sample.width / Math.max(limitingRadius, EPS)
      : 0;
    const previousWidth = previous?.width ?? sample.width;
    const nextWidth = next?.width ?? sample.width;
    const previousLength = previous ? distance(previous.point, sample.point) : 0;
    const nextLength = next ? distance(sample.point, next.point) : 0;
    const widthSupport = previousLength + nextLength;
    const widthSlope = widthSupport > EPS ? (nextWidth - previousWidth) / widthSupport : 0;
    const taper: ColumnTaperDirection =
      widthSlope < -EPS ? 'narrowing' : widthSlope > EPS ? 'widening' : 'constant';
    const endpoint = !closed
      ? index === 0
        ? 'start'
        : index === raw.length - 1
          ? 'end'
          : null
      : null;
    const kind: ColumnPointKind = endpoint
      ? 'tip'
      : cusp
        ? 'cusp'
        : uTurn
          ? 'u-turn'
          : sharpCorner
            ? 'sharp-corner'
            : continuousCurvature
              ? 'curve'
              : 'straight';
    const railMetrics =
      sample.railA && sample.railB
        ? {
            a: railCurvature(previous?.railA, sample.railA, next?.railA),
            b: railCurvature(previous?.railB, sample.railB, next?.railB),
          }
        : undefined;
    return {
      index,
      inputIndex: sample.inputIndex,
      point: copyPoint(sample.point),
      railA: sample.railA ? copyPoint(sample.railA) : undefined,
      railB: sample.railB ? copyPoint(sample.railB) : undefined,
      arcLengthMM: cumulative[index],
      incomingTangent: turn.incoming,
      outgoingTangent: turn.outgoing,
      tangent: turn.tangent,
      signedTurnDeg: turn.signedTurnDeg,
      turnAngleDeg: turn.turnAngleDeg,
      cornerAngleDeg: 180 - turn.turnAngleDeg,
      signedCurvaturePerMM: turn.curvature,
      curvatureRadiusMM: turn.radius,
      legacyCurvatureRadiusMM: turn.legacyRadius,
      railCurvature: railMetrics,
      realizedWidthMM: sample.width,
      widthSlope,
      taper,
      widthToRadiusRatio,
      endpoint,
      collapsedTip,
      declaredCorner,
      sharpCorner,
      continuousCurvature,
      unsafeWidth: widthToRadiusRatio > unsafeRatio + EPS,
      kind,
    };
  });
  const sharpCornerIndices = samples
    .filter((sample) => sample.sharpCorner)
    .map(({ index }) => index);
  return {
    source,
    closed,
    inputSampleCount: inputSamples.length,
    lengthMM,
    samples,
    segments: buildSegments(raw.length, closed, sharpCornerIndices, edgeLengths),
    tipIndices: samples
      .filter((sample) => sample.endpoint !== null || sample.collapsedTip)
      .map(({ index }) => index),
    sharpCornerIndices,
    unsafeWidthIndices: samples.filter((sample) => sample.unsafeWidth).map(({ index }) => index),
  };
}

/** Analyze an already hoop-space spine and its realized full widths. */
export function analyzeSpineColumn(
  spine: readonly Pt[],
  realizedWidthsMM: number | readonly number[],
  options: ColumnAnalysisOptions = {},
): AnalyzedColumn {
  if (spine.length < 2) throw new RangeError('a column must contain at least 2 samples');
  if (typeof realizedWidthsMM !== 'number' && realizedWidthsMM.length !== spine.length)
    throw new RangeError('realizedWidthsMM must contain one width per spine sample');
  const declared = new Set(options.declaredCornerIndices ?? []);
  const samples = spine.map((point, inputIndex): RawSample => ({
    point: copyPoint(point),
    width: finiteNonNegative(
      typeof realizedWidthsMM === 'number' ? realizedWidthsMM : realizedWidthsMM[inputIndex],
      `realized width at sample ${inputIndex}`,
    ),
    inputIndex,
    declaredCorner: declared.has(inputIndex),
  }));
  if (samePoint(spine[0], spine[spine.length - 1]) && declared.has(spine.length - 1))
    samples[0].declaredCorner = true;
  return analyzeRawColumn('spine', samples, options);
}

/** Analyze an already hoop-space, oriented rail correspondence. */
export function analyzeRailPairColumn(
  railSamples: readonly ColumnRailSample[],
  options: ColumnAnalysisOptions = {},
): AnalyzedColumn {
  if (railSamples.length < 2) throw new RangeError('a column must contain at least 2 samples');
  const declared = new Set(options.declaredCornerIndices ?? []);
  const samples = railSamples.map((sample, inputIndex): RawSample => {
    const railA = copyPoint(sample.a);
    const railB = copyPoint(sample.b);
    const point = sample.mid
      ? copyPoint(sample.mid)
      : ([(railA[0] + railB[0]) / 2, (railA[1] + railB[1]) / 2] as Pt);
    return {
      point,
      width: distance(railA, railB),
      railA,
      railB,
      inputIndex,
      declaredCorner: declared.has(inputIndex),
    };
  });
  if (
    samples.length >= 2 &&
    samePoint(samples[0].point, samples[samples.length - 1].point) &&
    declared.has(samples.length - 1)
  )
    samples[0].declaredCorner = true;
  return analyzeRawColumn('rail-pair', samples, options);
}

/** First sample that reproduces the historical buffered-spine width warning. */
export function legacySpineWidthIssue(analysis: AnalyzedColumn): AnalyzedColumnSample | null {
  return (
    analysis.samples.find(
      (sample) =>
        sample.inputIndex > 0 &&
        sample.inputIndex < analysis.inputSampleCount - 1 &&
        sample.turnAngleDeg > (SMOOTH_TURN_EPSILON_RAD * 180) / Math.PI &&
        sample.turnAngleDeg < (2.1 * 180) / Math.PI &&
        sample.legacyCurvatureRadiusMM < sample.realizedWidthMM / 2,
    ) ?? null
  );
}

/** First rail/sample that reproduces the historical satinbetween width warning. */
export function legacyRailWidthIssue(
  analysis: AnalyzedColumn,
): { sample: AnalyzedColumnSample; rail: 'a' | 'b' } | null {
  for (const rail of ['a', 'b'] as const) {
    for (const sample of analysis.samples) {
      if (sample.inputIndex <= 0 || sample.inputIndex >= analysis.inputSampleCount - 1) continue;
      const curvature = sample.railCurvature?.[rail];
      if (
        curvature &&
        curvature.turnAngleDeg > (SMOOTH_TURN_EPSILON_RAD * 180) / Math.PI &&
        curvature.turnAngleDeg < (2.1 * 180) / Math.PI &&
        curvature.legacyRadiusMM < sample.realizedWidthMM
      )
        return { sample, rail };
    }
  }
  return null;
}
