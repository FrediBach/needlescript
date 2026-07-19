import type { StitchEvent } from '../core/types.ts';
import { ROUTE_ALGORITHMS, routeItems } from './routing.ts';
import { defineModes } from '../core/mode-registry.ts';
import { NeedlescriptError } from '../core/errors.ts';

export interface TravelPlanResult {
  events: StitchEvent[];
  mode: PlanMode;
  travelBeforeMm: number;
  travelAfterMm: number;
  runs: number;
  colors: number;
  reordered: boolean;
  groups: TravelPlanGroupResult[];
}

export interface TravelPlanGroupResult {
  id: number;
  line?: number;
  eligibleRuns: number;
  movedRuns: number;
  improvementSwaps: number;
  travelBeforeMm: number;
  travelAfterMm: number;
}

interface ThreadRun {
  records: PlannerEventRecord[];
  entry: readonly [number, number];
  exit: readonly [number, number];
  index: number;
  reversible: boolean;
}

interface ColorBlock {
  prefix: PlannerEventRecord[];
  runs: ThreadRun[];
}

/** Sparse authored event span recorded by an outermost `atomic` block. */
export interface PlanAtomicSpan {
  start: number;
  end: number;
  line?: number;
}

/** Sparse authored event span recorded by an outermost `routegroup` block. */
export interface PlanRouteGroupSpan {
  start: number;
  end: number;
  line?: number;
}

/**
 * Planner-only metadata travels beside an event, never on the public event.
 * Barrier and atomic commands populate these tags when the raw
 * stream is lowered into planner records. The records are unwrapped before
 * any later post-process or RunResult/export boundary.
 */
interface PlannerTags {
  segment: number;
  group?: number;
  atomic?: number;
}

interface PlannerEventRecord {
  event: StitchEvent;
  tags: PlannerTags;
}

export interface PlanStrategy {
  algorithm: keyof typeof ROUTE_ALGORITHMS;
  reverseRuns: boolean;
}

/** Public mode registry: future plan modes are additive configuration. */
export const PLAN_STRATEGIES = {
  nearest: { algorithm: 'nearest', reverseRuns: false },
  'reversing-nearest': { algorithm: 'nearest', reverseRuns: true },
} as const satisfies Record<string, PlanStrategy>;

export type PlanMode = keyof typeof PLAN_STRATEGIES;

/** All accepted directive values, including the explicit no-op mode. */
export const PLAN_MODES: readonly (PlanMode | 'off')[] = defineModes([
  ...Object.keys(PLAN_STRATEGIES),
  'off',
] as (PlanMode | 'off')[]);

function travelLength(events: StitchEvent[], start: StitchEvent | null = null): number {
  let previous = start;
  let total = 0;
  for (const event of events) {
    if (event.t === 'jump' && previous)
      total += Math.hypot(event.x - previous.x, event.y - previous.y);
    // Color/trim/mark events do not move the needle.
    if (event.t === 'stitch' || event.t === 'jump') previous = event;
  }
  return total;
}

interface PlanBlockResult {
  records: PlannerEventRecord[];
  movedRuns: number;
  improvementSwaps: number;
}

function splitColorBlock(records: PlannerEventRecord[], autoTrim: number): ColorBlock {
  const prefix: PlannerEventRecord[] = [];
  const runs: ThreadRun[] = [];
  let current: PlannerEventRecord[] = [];
  let currentEntry: StitchEvent | null = null;
  let gap: PlannerEventRecord[] = [];
  let lastPosition: StitchEvent | null = null;
  let cutPending = false;

  const finish = () => {
    const positional = current.filter(({ event }) => event.t === 'stitch' || event.t === 'jump');
    if (positional.length === 0) {
      prefix.push(...current);
    } else {
      const first = currentEntry ?? positional[0].event;
      const last = positional[positional.length - 1].event;
      runs.push({
        records: current,
        entry: [first.x, first.y],
        exit: [last.x, last.y],
        index: runs.length,
        reversible: isReversible(current),
      });
    }
    current = [];
    currentEntry = null;
  };

  const flushGap = (nextRecord?: PlannerEventRecord) => {
    if (gap.length === 0) return;
    let distance = 0;
    let point = lastPosition;
    for (const { event } of gap) {
      if (event.t !== 'jump') continue;
      if (point) distance += Math.hypot(event.x - point.x, event.y - point.y);
      point = event;
    }
    const longCut = nextRecord?.event.t === 'stitch' && autoTrim > 0 && distance >= autoTrim;
    if (cutPending || longCut) {
      const currentAtomic = current.at(-1)?.tags.atomic;
      const gapAtomic = gap[0]?.tags.atomic;
      const uniformGapAtomic = gap.every(({ tags }) => tags.atomic === gapAtomic)
        ? gapAtomic
        : undefined;
      const nextAtomic = nextRecord?.tags.atomic;
      const internalAtomicBoundary =
        currentAtomic !== undefined &&
        uniformGapAtomic === currentAtomic &&
        (nextRecord === undefined || nextAtomic === currentAtomic);

      if (internalAtomicBoundary) {
        // Explicit trims and auto-trim-sized jumps inside one atomic span stay
        // exactly where authored. The whole span becomes one route item.
        current.push(...gap);
        cutPending = false;
        if (point) lastPosition = point;
        gap = [];
        return;
      } else {
        const gapBelongsToNextAtomic = nextAtomic !== undefined && uniformGapAtomic === nextAtomic;
        // Ordinary boundary marks annotate the run just sewn. Connector jumps
        // are rebuilt after ordering. An atomic block's leading gap, however,
        // is part of the authored span and must move with it.
        current.push(...gap.filter(({ event }) => event.t === 'mark' && !gapBelongsToNextAtomic));
        if (current.length > 0) finish();
        if (gapBelongsToNextAtomic) current.push(...gap);
      }
      // The last jump is the physical approach point for the next run. Retain
      // its coordinates as the route entry even when the jump itself belongs
      // to an atomic span.
      currentEntry = point;
      cutPending = false;
    } else {
      current.push(...gap);
    }
    if (point) lastPosition = point;
    gap = [];
  };

  for (const record of records) {
    const { event } = record;
    if (event.t === 'jump' || event.t === 'mark') {
      gap.push(record);
      continue;
    }
    flushGap(record);
    if (event.t === 'trim') {
      // A trim at an atomic edge is a valid cut boundary even without an
      // intervening jump. Keep the trim on the side where it was authored.
      if (current.length > 0 && current.at(-1)?.tags.atomic !== record.tags.atomic) finish();
      current.push(record);
      cutPending = true;
      continue;
    }
    current.push(record);
    if (event.t === 'stitch') lastPosition = event;
  }
  flushGap();
  if (current.length > 0) finish();
  return { prefix, runs };
}

function isReversible(records: PlannerEventRecord[]): boolean {
  // Atomic blocks have no reversible surface form. Their complete authored
  // order is fixed even when every contained stitch would otherwise qualify.
  if (records.some(({ tags }) => tags.atomic !== undefined)) return false;
  const positional = records.filter(({ event }) => event.t === 'stitch' || event.t === 'jump');
  if (positional.length === 0 || positional.some(({ event }) => event.t !== 'stitch')) return false;

  // Reversing mixed underlay/top-stitch output would sew the decorative layer
  // before its foundation. Runs containing only one of those layers are safe.
  const hasUnderlay = positional.some(({ event }) => event.u === 1);
  const hasTopStitch = positional.some(({ event }) => event.u !== 1);
  if (hasUnderlay && hasTopStitch) return false;

  // Marks may occur between stitches and describe authored sequence points.
  // A trailing trim/mark suffix, on the other hand, remains meaningful at the
  // end of the reversed run.
  const lastPositional = records.findLastIndex(
    ({ event }) => event.t === 'stitch' || event.t === 'jump',
  );
  return records.slice(0, lastPositional).every(({ event }) => event.t === 'stitch');
}

function reverseRun(run: ThreadRun): PlannerEventRecord[] {
  const stitches = run.records.filter(({ event }) => event.t === 'stitch');
  const suffix = run.records.slice(stitches.length);
  const points: (readonly [number, number])[] = [run.entry];
  for (const { event } of stitches) points.push([event.x, event.y]);

  const reversed = stitches.toReversed().map((record, index) => ({
    ...record,
    event: {
      ...record.event,
      x: points[points.length - 2 - index][0],
      y: points[points.length - 2 - index][1],
    },
  }));
  const end = run.entry;
  return [
    ...reversed,
    ...suffix.map((record) =>
      record.event.t === 'trim'
        ? { ...record, event: { ...record.event, x: end[0], y: end[1] } }
        : record,
    ),
  ];
}

function planBlock(
  block: ColorBlock,
  strategy: PlanStrategy,
  examine?: (count: number) => void,
  algorithm: keyof typeof ROUTE_ALGORITHMS = strategy.algorithm,
): PlanBlockResult {
  if (block.runs.length <= 1)
    return {
      records: [...block.prefix, ...block.runs.flatMap((run) => run.records)],
      movedRuns: 0,
      improvementSwaps: 0,
    };
  let improvementSwaps = 0;
  const ordered = routeItems(
    algorithm,
    block.runs.map((run) => ({
      value: run,
      index: run.index,
      entry: run.entry,
      exit: run.exit,
      reverseEntry: run.reversible ? run.exit : undefined,
      reverseExit: run.reversible ? run.entry : undefined,
    })),
    {
      anchorFirst: true,
      allowReverse: strategy.reverseRuns,
      examine,
      onImprove: (count) => {
        improvementSwaps += count;
      },
    },
  );
  const movedRuns = ordered.reduce(
    (count, routed, index) =>
      count + (routed.item.value.index !== index || routed.reversed ? 1 : 0),
    0,
  );
  const out = [...block.prefix];
  let previous: ThreadRun | null = null;
  for (const routed of ordered) {
    const run = routed.item.value;
    const runRecords = routed.reversed ? reverseRun(run) : run.records;
    const entry = routed.reversed ? run.exit : run.entry;
    if (previous) {
      const first = runRecords.find(({ event }) => event.t === 'stitch' || event.t === 'jump');
      // Atomic records retain their authored leading jump. Ordinary runs have
      // that connector rebuilt here after routing.
      if (first && first.event.t !== 'jump')
        out.push({
          event: {
            t: 'jump',
            x: entry[0],
            y: entry[1],
            c: first.event.c,
            line: first.event.line,
          },
          tags: first.tags,
        });
    }
    out.push(...runRecords);
    previous = run;
  }
  return { records: out, movedRuns, improvementSwaps };
}

function groupedTravelLengths(records: PlannerEventRecord[], count: number): number[] {
  const totals = Array.from({ length: count }, () => 0);
  let previous: StitchEvent | null = null;
  for (const { event, tags } of records) {
    if (event.t === 'jump' && previous && tags.group !== undefined)
      totals[tags.group - 1] += Math.hypot(event.x - previous.x, event.y - previous.y);
    if (event.t === 'stitch' || event.t === 'jump') previous = event;
  }
  return totals;
}

/**
 * Plan a completed public event stream. Barrier offsets address gaps in the
 * authored stream: 0 is before the first event and `events.length` is after
 * the last. Atomic and route-group spans use the same gap-addressed offsets.
 * All constraints are compiled into private planner tags before routing.
 */
export function applyTravelPlan(
  events: StitchEvent[],
  mode: PlanMode,
  autoTrim: number,
  examine?: (count: number) => void,
  barrierOffsets: readonly number[] = [],
  atomicSpans: readonly PlanAtomicSpan[] = [],
  routeGroupSpans: readonly PlanRouteGroupSpan[] = [],
): TravelPlanResult {
  const strategy = PLAN_STRATEGIES[mode];
  const barriers = barrierOffsets
    .filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= events.length)
    .toSorted((a, b) => a - b);
  const atomics = atomicSpans
    .filter(
      ({ start, end }) =>
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        start <= end &&
        end <= events.length,
    )
    .toSorted((a, b) => a.start - b.start || a.end - b.end);
  const routeGroups = routeGroupSpans
    .filter(
      ({ start, end }) =>
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        start <= end &&
        end <= events.length,
    )
    .toSorted((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 0; i < atomics.length; i++) {
    const atomic = atomics[i];
    if (i > 0 && atomic.start < atomics[i - 1].end)
      throw new NeedlescriptError('atomic planner spans cannot overlap', atomic.line);
    if (barriers.some((offset) => offset > atomic.start && offset < atomic.end))
      throw new NeedlescriptError(
        'atomic cannot cross a planbarrier — keep the block within one planner segment',
        atomic.line,
      );
    if (events.slice(atomic.start, atomic.end).some((event) => event.t === 'color'))
      throw new NeedlescriptError(
        'atomic cannot contain a color change with the current color-block planner — split it into one atomic block per color',
        atomic.line,
      );
  }
  for (let i = 0; i < routeGroups.length; i++) {
    const group = routeGroups[i];
    if (i > 0 && group.start < routeGroups[i - 1].end)
      throw new NeedlescriptError('routegroup planner spans cannot overlap', group.line);
    for (const atomic of atomics) {
      const overlaps = group.start < atomic.end && atomic.start < group.end;
      const containsAtomic = group.start <= atomic.start && atomic.end <= group.end;
      if (overlaps && !containsAtomic)
        throw new NeedlescriptError(
          'routegroup cannot split an atomic span — put the complete atomic block inside the routegroup',
          group.line,
        );
    }
  }
  const groups: TravelPlanGroupResult[] = routeGroups.map(({ line }, index) => ({
    id: index + 1,
    line,
    eligibleRuns: 0,
    movedRuns: 0,
    improvementSwaps: 0,
    travelBeforeMm: 0,
    travelAfterMm: 0,
  }));
  let barrierIndex = 0;
  let plannerSegment = 0;
  let atomicIndex = 0;
  let routeGroupIndex = 0;
  const records: PlannerEventRecord[] = events.map((event, eventIndex) => {
    while (barriers[barrierIndex] <= eventIndex) {
      plannerSegment++;
      barrierIndex++;
    }
    while (atomics[atomicIndex] && atomics[atomicIndex].end <= eventIndex) atomicIndex++;
    const atomic = atomics[atomicIndex];
    while (routeGroups[routeGroupIndex] && routeGroups[routeGroupIndex].end <= eventIndex)
      routeGroupIndex++;
    const routeGroup = routeGroups[routeGroupIndex];
    const tags: PlannerTags = { segment: plannerSegment };
    if (atomic && atomic.start <= eventIndex && eventIndex < atomic.end)
      tags.atomic = atomicIndex + 1;
    if (routeGroup && routeGroup.start <= eventIndex && eventIndex < routeGroup.end)
      tags.group = routeGroupIndex + 1;
    return { event, tags };
  });
  const output: PlannerEventRecord[] = [];
  let segment: PlannerEventRecord[] = [];
  let runs = 0;
  let colors = 0;
  let colorHasRuns = false;
  let activePlannerSegment: number | undefined;

  const flushPlannerSegment = () => {
    if (routeGroups.length === 0) {
      const block = splitColorBlock(segment, autoTrim);
      runs += block.runs.length;
      if (block.runs.length > 0) colorHasRuns = true;
      output.push(...planBlock(block, strategy, examine).records);
      segment = [];
      return;
    }

    let start = 0;
    while (start < segment.length) {
      const group = segment[start].tags.group;
      let end = start + 1;
      while (end < segment.length && segment[end].tags.group === group) end++;
      const chunk = segment.slice(start, end);
      if (group === undefined) {
        output.push(...chunk);
      } else {
        const block = splitColorBlock(chunk, autoTrim);
        const planned = planBlock(block, strategy, examine, 'nearest-2opt');
        const stats = groups[group - 1];
        stats.eligibleRuns += block.runs.length;
        stats.movedRuns += planned.movedRuns;
        stats.improvementSwaps += planned.improvementSwaps;
        runs += block.runs.length;
        if (block.runs.length > 0) colorHasRuns = true;
        output.push(...planned.records);
      }
      start = end;
    }
    segment = [];
  };

  const finishColor = () => {
    flushPlannerSegment();
    if (colorHasRuns) colors++;
    colorHasRuns = false;
    activePlannerSegment = undefined;
  };

  for (const record of records) {
    const { event } = record;
    if (event.t === 'color') {
      finishColor();
      output.push(record);
    } else {
      if (activePlannerSegment === undefined) activePlannerSegment = record.tags.segment;
      else if (record.tags.segment !== activePlannerSegment) {
        flushPlannerSegment();
        activePlannerSegment = record.tags.segment;
      }
      segment.push(record);
    }
  }
  finishColor();

  const groupTravelBefore = groupedTravelLengths(records, groups.length);
  const groupTravelAfter = groupedTravelLengths(output, groups.length);
  for (const group of groups) {
    group.travelBeforeMm = groupTravelBefore[group.id - 1];
    group.travelAfterMm = groupTravelAfter[group.id - 1];
  }

  const outputEvents = output.map(({ event }) => event);
  const authoredStitches = records.filter(({ event }) => event.t === 'stitch');
  const plannedStitches = output.filter(({ event }) => event.t === 'stitch');
  const reordered =
    authoredStitches.length !== plannedStitches.length ||
    authoredStitches.some((record, index) => record !== plannedStitches[index]);

  return {
    events: outputEvents,
    mode,
    travelBeforeMm: travelLength(events),
    travelAfterMm: travelLength(outputEvents),
    runs,
    colors,
    reordered,
    groups,
  };
}
