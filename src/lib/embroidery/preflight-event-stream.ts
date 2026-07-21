import type {
  PhysicsMeasurement,
  PreflightIssue,
  ResolvedMachineProfile,
  StitchEvent,
} from '../core/types.ts';
import {
  getPhysicsDiagnosticCatalogEntry,
  preflightCatalogMetadata,
  type PhysicsDiagnosticCode,
} from './physics-diagnostics/catalog.ts';
import { sourceLocationsForEvents } from '../core/source-trace.ts';

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
}

interface AttributedEvent extends StitchEvent {
  event: StitchEvent;
  index: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function issue(
  code: PhysicsDiagnosticCode,
  message: string,
  points: readonly AttributedEvent[],
  measurements?: PhysicsMeasurement[],
): PreflightIssue {
  const selected = points.slice(0, EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumPointsPerIssue);
  const geometryPoints = selected.map(({ x, y }) => ({ x, y }));
  const role = preflightCatalogMetadata(code);
  const geometryRole = getPhysicsDiagnosticCatalogEntry(code).geometryRole;
  const sourceLocations = sourceLocationsForEvents(points.map(({ event }) => event));
  const lines: number[] = [];
  for (const location of sourceLocations)
    if (location.role !== 'related') lines.push(location.line);
  return {
    ...role,
    code,
    message,
    points: geometryPoints,
    lines,
    sourceLocations,
    geometry: [
      code.startsWith('penetration.')
        ? { kind: 'points', role: geometryRole, points: geometryPoints }
        : {
            kind: 'polyline',
            role: geometryRole,
            points: geometryPoints,
          },
    ],
    eventIndices: points.map(({ index }) => index),
    ...(measurements?.length ? { measurements } : {}),
  };
}

function attributedEvents(events: readonly StitchEvent[]): AttributedEvent[] {
  return events.map((event, index) => ({ ...event, event, index }));
}

function stitchRuns(events: readonly AttributedEvent[]): AttributedEvent[][] {
  const runs: AttributedEvent[][] = [];
  let current: AttributedEvent[] = [];
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
  runs: readonly AttributedEvent[][],
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
            [
              {
                label: 'Consecutive short stitches',
                value: index - start - 1,
                unit: 'stitches',
                threshold: EVENT_STREAM_PREFLIGHT_THRESHOLDS.shortClusterSegments,
                comparison: 'above',
              },
              {
                label: 'Short-stitch length',
                value: maximumLength,
                unit: 'mm',
                threshold: maximumLength,
                comparison: 'below',
              },
            ],
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
  runs: readonly AttributedEvent[][],
  accepts: (run: readonly AttributedEvent[], index: number, angle: number) => boolean,
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

function reversalClusters(runs: readonly AttributedEvent[][]): PreflightIssue[] {
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

function nearHoleClusters(events: readonly AttributedEvent[]): PreflightIssue[] {
  const { nearHolePenetrationLimit, nearHoleRadiusMM, nearHoleWindowPenetrations } =
    EVENT_STREAM_PREFLIGHT_THRESHOLDS;
  const window: AttributedEvent[] = [];
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
  events: readonly AttributedEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  let previous: AttributedEvent | undefined;
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
            [
              {
                label: 'Sewn span',
                value: length,
                unit: 'mm',
                threshold: profile.maximumPreferredSewnStitchMM,
                comparison: 'above',
              },
            ],
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
  events: readonly AttributedEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  let previous: AttributedEvent | undefined;
  let sewnSinceCut = false;
  let chain:
    | { length: number; eligible: boolean; points: AttributedEvent[]; start?: AttributedEvent }
    | undefined;
  const flush = () => {
    if (chain?.eligible && chain.length > profile.maximumPreferredJumpMM) {
      const points = chain.start ? [chain.start, ...chain.points] : chain.points;
      issues.push(
        issue(
          'travel.long-untrimmed-jump',
          `an untrimmed jump chain spans ${chain.length.toFixed(2)} mm (preferred maximum ${profile.maximumPreferredJumpMM.toFixed(2)} mm)`,
          points,
          [
            {
              label: 'Jump-chain length',
              value: chain.length,
              unit: 'mm',
              threshold: profile.maximumPreferredJumpMM,
              comparison: 'above',
            },
          ],
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
  events: readonly AttributedEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  let count = 0;
  let current: AttributedEvent[] = [];
  let reported = false;
  for (const event of events) {
    if (event.t === 'trim' || event.t === 'color') {
      count = 0;
      current = [];
      reported = false;
      continue;
    }
    if (event.t !== 'stitch') continue;
    current.push(event);
    count++;
    if (!reported && count > profile.maximumConsecutiveStitches) {
      issues.push(
        issue(
          'machine.continuous-stitch-run',
          `more than ${profile.maximumConsecutiveStitches.toLocaleString('en-US')} consecutive stitches occur without a trim or color boundary`,
          current,
          [
            {
              label: 'Continuous stitches',
              value: count,
              unit: 'stitches',
              threshold: profile.maximumConsecutiveStitches,
              comparison: 'above',
            },
          ],
        ),
      );
      reported = true;
      if (issues.length >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode) return issues;
    }
  }
  return issues;
}

function colorRunJumpBurden(
  events: readonly AttributedEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  let runNumber = 1;
  let hasSewn = false;
  let jumpDistance = 0;
  let jumpSegments = 0;
  let previous: AttributedEvent | undefined;
  let points: AttributedEvent[] = [];

  const flush = () => {
    if (
      hasSewn &&
      jumpSegments >= 2 &&
      jumpDistance > profile.maximumPreferredJumpMM &&
      points.length
    ) {
      const color = points[0].c + 1;
      issues.push(
        issue(
          'travel.color-run-jump-burden',
          `color ${color}, run ${runNumber} accumulates ${jumpDistance.toFixed(2)} mm across ${jumpSegments} untrimmed jumps (preferred maximum ${profile.maximumPreferredJumpMM.toFixed(2)} mm)`,
          points,
          [
            {
              label: 'Accumulated jump travel',
              value: jumpDistance,
              unit: 'mm',
              threshold: profile.maximumPreferredJumpMM,
              comparison: 'above',
            },
            { label: 'Jump segments', value: jumpSegments, unit: 'jumps' },
          ],
        ),
      );
    }
    hasSewn = false;
    jumpDistance = 0;
    jumpSegments = 0;
    points = [];
  };

  for (const event of events) {
    if (event.t === 'mark') continue;
    if (event.t === 'trim' || event.t === 'color') {
      flush();
      runNumber++;
      previous = event;
      if (issues.length >= EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode) return issues;
      continue;
    }
    if (event.t === 'stitch') hasSewn = true;
    if (event.t === 'jump' && hasSewn && previous) {
      jumpDistance += distance(previous, event);
      jumpSegments++;
      if (!points.length) points.push(previous);
      points.push(event);
    }
    previous = event;
  }
  flush();
  return issues.slice(0, EVENT_STREAM_PREFLIGHT_THRESHOLDS.maximumIssuesPerCode);
}

function directionChangeClusters(runs: readonly AttributedEvent[][]): PreflightIssue[] {
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
  const attributed = attributedEvents(events);
  const runs = stitchRuns(attributed);
  return [
    ...shortStitchClusters(runs, profile),
    ...reversalClusters(runs),
    ...nearHoleClusters(attributed),
    ...longSewnFloats(attributed, profile),
    ...longUntrimmedJumpChains(attributed, profile),
    ...colorRunJumpBurden(attributed, profile),
    ...excessiveContinuousRuns(attributed, profile),
    ...directionChangeClusters(runs),
  ];
}
