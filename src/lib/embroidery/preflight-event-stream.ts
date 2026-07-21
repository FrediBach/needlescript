import type { PreflightIssue, ResolvedMachineProfile, StitchEvent } from '../core/types.ts';
import {
  preflightCatalogMetadata,
  type PhysicsDiagnosticCode,
} from './physics-diagnostics/catalog.ts';

/**
 * Conservative event-stream metrics. These are engineering defaults, not
 * claimed fabric-specific limits; physical sew-out evidence may tune them.
 */
export const EVENT_STREAM_PREFLIGHT_THRESHOLDS = Object.freeze({
  maximumIssuesPerCode: 3,
  maximumPointsPerIssue: 16,
  shortStitchMultiplier: 1.5,
  shortClusterSegments: 8,
  reversalAngleDeg: 150,
  reversalClusterTurns: 4,
  reversalClusterRadiusMM: 1,
  nearHoleRadiusMM: 0.3,
  nearHoleWindowPenetrations: 20,
  nearHolePenetrationLimit: 8,
  sewnFloatToleranceMM: 0.05,
  directionChangeMinAngleDeg: 75,
  directionChangeMaxAngleDeg: 150,
  directionChangeMaxSegmentMM: 1,
  directionChangeClusterTurns: 6,
  directionChangeClusterRadiusMM: 2,
});

interface Point {
  x: number;
  y: number;
  line?: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function uniqueLines(points: readonly Point[]): number[] {
  return [
    ...new Set(
      points.map((point) => point.line).filter((line): line is number => line !== undefined),
    ),
  ];
}

function issue(
  code: PhysicsDiagnosticCode,
  message: string,
  points: readonly Point[],
): PreflightIssue {
  return {
    ...preflightCatalogMetadata(code),
    code,
    message,
    points: points
      .slice(0, EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumPointsPerIssue)
      .map(({ x, y }) => ({ x, y })),
    lines: uniqueLines(points),
  };
}

function stitchRuns(events: readonly StitchEvent[]): StitchEvent[][] {
  const runs: StitchEvent[][] = [];
  let current: StitchEvent[] = [];
  const flush = () => {
    if (current.length > 0) runs.push(current);
    current = [];
  };
  for (const event of events) {
    if (event.t === 'stitch') current.push(event);
    else if (event.t !== 'mark') flush();
  }
  flush();
  return runs;
}

function shortStitchClusters(
  runs: readonly StitchEvent[][],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const maximumLength =
    profile.minimumReliableMovementMM * EVENT_STREAM_PREFLIGHT_THRESHOLDS.shortStitchMultiplier;
  const issues: PreflightIssue[] = [];
  for (const run of runs) {
    let start = -1;
    for (let index = 1; index <= run.length; index++) {
      const short = index < run.length && distance(run[index - 1], run[index]) < maximumLength;
      if (short && start < 0) start = index - 1;
      if (short) continue;
      if (
        start >= 0 &&
        index - start - 1 >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.shortClusterSegments
      ) {
        const points = run.slice(start, index);
        issues.push(
          issue(
            'stitch.short-cluster',
            `${index - start - 1} consecutive stitches are shorter than ${maximumLength.toFixed(2)} mm`,
            points,
          ),
        );
        if (issues.length >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode) return issues;
      }
      start = -1;
    }
  }
  return issues;
}

function turnAngle(a: Point, b: Point, c: Point): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const ul = Math.hypot(ux, uy);
  const vl = Math.hypot(vx, vy);
  if (ul < 1e-9 || vl < 1e-9) return 0;
  const cosine = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (ul * vl)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function turnClusters(
  runs: readonly StitchEvent[][],
  accepts: (run: readonly StitchEvent[], index: number, angle: number) => boolean,
  minimumTurns: number,
  radiusMM: number,
  code: PhysicsDiagnosticCode,
  message: (turns: number) => string,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  for (const run of runs) {
    let indices: number[] = [];
    const flush = () => {
      if (indices.length >= minimumTurns) {
        const points = run.slice(indices[0] - 1, indices.at(-1)! + 2);
        issues.push(issue(code, message(indices.length), points));
      }
      indices = [];
    };
    for (let index = 1; index < run.length - 1; index++) {
      const angle = turnAngle(run[index - 1], run[index], run[index + 1]);
      const contiguous = indices.length === 0 || index === indices.at(-1)! + 1;
      const local =
        indices.length === 0 || distance(run[indices[0]], run[index]) <= radiusMM + 1e-9;
      if (accepts(run, index, angle) && contiguous && local) indices.push(index);
      else {
        flush();
        if (accepts(run, index, angle)) indices.push(index);
      }
      if (issues.length >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode) return issues;
    }
    flush();
    if (issues.length >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode) return issues;
  }
  return issues;
}

function reversalClusters(runs: readonly StitchEvent[][]): PreflightIssue[] {
  const { reversalAngleDeg, reversalClusterRadiusMM, reversalClusterTurns } =
    EVENT_STREAM_PREFLIGHT_THRESHOLDS;
  return turnClusters(
    runs,
    (run, index, angle) =>
      angle >= reversalAngleDeg &&
      distance(run[index - 1], run[index]) <= reversalClusterRadiusMM * 2 &&
      distance(run[index], run[index + 1]) <= reversalClusterRadiusMM * 2,
    reversalClusterTurns,
    reversalClusterRadiusMM,
    'path.reversal-cluster',
    (turns) => `${turns} repeated reversals occur within a ${reversalClusterRadiusMM} mm radius`,
  );
}

function nearHoleClusters(events: readonly StitchEvent[]): PreflightIssue[] {
  const { nearHolePenetrationLimit, nearHoleRadiusMM, nearHoleWindowPenetrations } =
    EVENT_STREAM_PREFLIGHT_THRESHOLDS;
  const window: StitchEvent[] = [];
  const issues: PreflightIssue[] = [];
  let lastReportedPenetration = -nearHoleWindowPenetrations;
  let penetration = 0;
  for (const event of events) {
    if (event.t !== 'stitch') continue;
    window.push(event);
    if (window.length > nearHoleWindowPenetrations) window.shift();
    const nearby = window.filter((candidate) => distance(candidate, event) <= nearHoleRadiusMM);
    if (
      nearby.length >= nearHolePenetrationLimit &&
      penetration - lastReportedPenetration >= nearHoleWindowPenetrations
    ) {
      issues.push(
        issue(
          'penetration.near-hole-cluster',
          `${nearby.length} penetrations fall within ${nearHoleRadiusMM.toFixed(2)} mm over the last ${window.length} penetrations`,
          nearby,
        ),
      );
      lastReportedPenetration = penetration;
      if (issues.length >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode) return issues;
    }
    penetration++;
  }
  return issues;
}

function longSewnFloats(
  events: readonly StitchEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  let previous: StitchEvent | undefined;
  for (const event of events) {
    if (event.t === 'mark') continue;
    if (event.t === 'stitch' && previous) {
      const length = distance(previous, event);
      if (
        length >
        profile.maximumPreferredSewnStitchMM +
          EVENT_STREAM_PREFLIGHT_THRESHOLDS.sewnFloatToleranceMM
      ) {
        issues.push(
          issue(
            'stitch.long-sewn-float',
            `a sewn stitch spans ${length.toFixed(2)} mm (preferred maximum ${profile.maximumPreferredSewnStitchMM.toFixed(2)} mm)`,
            [previous, event],
          ),
        );
        if (issues.length >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode) return issues;
      }
    }
    previous = event;
  }
  return issues;
}

function longUntrimmedJumpChains(
  events: readonly StitchEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  let previous: StitchEvent | undefined;
  let sewnSinceCut = false;
  let chain:
    { length: number; eligible: boolean; points: StitchEvent[]; start?: StitchEvent } | undefined;
  const flush = () => {
    if (chain?.eligible && chain.length > profile.maximumPreferredJumpMM) {
      const points = chain.start ? [chain.start, ...chain.points] : chain.points;
      issues.push(
        issue(
          'travel.long-untrimmed-jump',
          `an untrimmed jump chain spans ${chain.length.toFixed(2)} mm (preferred maximum ${profile.maximumPreferredJumpMM.toFixed(2)} mm)`,
          points,
        ),
      );
    }
    chain = undefined;
  };
  for (const event of events) {
    if (event.t === 'mark') continue;
    if (event.t === 'jump') {
      if (!chain) chain = { length: 0, eligible: sewnSinceCut, points: [], start: previous };
      if (previous) chain.length += distance(previous, event);
      chain.points.push(event);
      previous = event;
      continue;
    }
    flush();
    if (issues.length >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode) return issues;
    if (event.t === 'trim' || event.t === 'color') sewnSinceCut = false;
    else if (event.t === 'stitch') sewnSinceCut = true;
    previous = event;
  }
  flush();
  return issues.slice(0, EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode);
}

function excessiveContinuousRuns(
  events: readonly StitchEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  let count = 0;
  let first: StitchEvent | undefined;
  let reported = false;
  for (const event of events) {
    if (event.t === 'trim' || event.t === 'color') {
      count = 0;
      first = undefined;
      reported = false;
      continue;
    }
    if (event.t !== 'stitch') continue;
    first ??= event;
    count++;
    if (!reported && count > profile.maximumConsecutiveStitches) {
      issues.push(
        issue(
          'machine.continuous-stitch-run',
          `more than ${profile.maximumConsecutiveStitches.toLocaleString('en-US')} consecutive stitches occur without a trim or color boundary`,
          [first, event],
        ),
      );
      reported = true;
      if (issues.length >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode) return issues;
    }
  }
  return issues;
}

function directionChangeClusters(runs: readonly StitchEvent[][]): PreflightIssue[] {
  const {
    directionChangeClusterRadiusMM,
    directionChangeClusterTurns,
    directionChangeMaxAngleDeg,
    directionChangeMaxSegmentMM,
    directionChangeMinAngleDeg,
  } = EVENT_STREAM_PREFLIGHT_THRESHOLDS;
  return turnClusters(
    runs,
    (run, index, angle) =>
      angle >= directionChangeMinAngleDeg &&
      angle < directionChangeMaxAngleDeg &&
      distance(run[index - 1], run[index]) <= directionChangeMaxSegmentMM &&
      distance(run[index], run[index + 1]) <= directionChangeMaxSegmentMM,
    directionChangeClusterTurns,
    directionChangeClusterRadiusMM,
    'path.direction-change-cluster',
    (turns) =>
      `${turns} sharp direction changes occur within a ${directionChangeClusterRadiusMM} mm radius`,
  );
}

/** Pure, bounded analysis over the completed pre-lock stitch event stream. */
export function analyzeEventStreamPreflight(
  events: readonly StitchEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const runs = stitchRuns(events);
  return [
    ...shortStitchClusters(runs, profile),
    ...reversalClusters(runs),
    ...nearHoleClusters(events),
    ...longSewnFloats(events, profile),
    ...longUntrimmedJumpChains(events, profile),
    ...excessiveContinuousRuns(events, profile),
    ...directionChangeClusters(runs),
  ];
}
