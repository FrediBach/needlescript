import type { StitchEvent } from './types.ts';
import { ROUTE_ALGORITHMS, routeItems } from './routing.ts';
import { defineModes } from './mode-registry.ts';

export interface TravelPlanResult {
  events: StitchEvent[];
  mode: PlanMode;
  travelBeforeMm: number;
  travelAfterMm: number;
  runs: number;
  colors: number;
  reordered: boolean;
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

/**
 * Planner-only metadata travels beside an event, never on the public event.
 * Future barrier/group/atomic commands can populate these tags when the raw
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

function travelLength(events: StitchEvent[]): number {
  let previous: StitchEvent | null = null;
  let total = 0;
  for (const event of events) {
    if (event.t === 'jump' && previous)
      total += Math.hypot(event.x - previous.x, event.y - previous.y);
    // Color/trim/mark events do not move the needle.
    if (event.t === 'stitch' || event.t === 'jump') previous = event;
  }
  return total;
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

  const flushGap = (nextIsStitch: boolean) => {
    if (gap.length === 0) return;
    let distance = 0;
    let point = lastPosition;
    for (const { event } of gap) {
      if (event.t !== 'jump') continue;
      if (point) distance += Math.hypot(event.x - point.x, event.y - point.y);
      point = event;
    }
    const longCut = nextIsStitch && autoTrim > 0 && distance >= autoTrim;
    if (cutPending || longCut) {
      // Boundary marks annotate the run just sewn. Connector jumps are rebuilt
      // after ordering and are therefore intentionally not retained.
      current.push(...gap.filter(({ event }) => event.t === 'mark'));
      if (current.length > 0) finish();
      // The last jump is the physical approach point for the next run. Keep it
      // out of the atomic run, but retain its coordinates for routing and for
      // the rebuilt connector so the later lock pass has a tie-in direction.
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
    flushGap(event.t === 'stitch');
    if (event.t === 'trim') {
      current.push(record);
      cutPending = true;
      continue;
    }
    current.push(record);
    if (event.t === 'stitch') lastPosition = event;
  }
  flushGap(false);
  if (current.length > 0) finish();
  return { prefix, runs };
}

function isReversible(records: PlannerEventRecord[]): boolean {
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
): PlannerEventRecord[] {
  if (block.runs.length <= 1) return [...block.prefix, ...block.runs.flatMap((run) => run.records)];
  const ordered = routeItems(
    strategy.algorithm,
    block.runs.map((run) => ({
      value: run,
      index: run.index,
      entry: run.entry,
      exit: run.exit,
      reverseEntry: run.reversible ? run.exit : undefined,
      reverseExit: run.reversible ? run.entry : undefined,
    })),
    { anchorFirst: true, allowReverse: strategy.reverseRuns, examine },
  );
  const out = [...block.prefix];
  let previous: ThreadRun | null = null;
  for (const routed of ordered) {
    const run = routed.item.value;
    const runRecords = routed.reversed ? reverseRun(run) : run.records;
    const entry = routed.reversed ? run.exit : run.entry;
    if (previous) {
      const first = runRecords.find(({ event }) => event.t === 'stitch' || event.t === 'jump');
      if (first)
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
  return out;
}

/**
 * Plan a completed public event stream. Barrier offsets address gaps in the
 * authored stream: 0 is before the first event and `events.length` is after
 * the last. They are compiled into private segment tags before routing.
 */
export function applyTravelPlan(
  events: StitchEvent[],
  mode: PlanMode,
  autoTrim: number,
  examine?: (count: number) => void,
  barrierOffsets: readonly number[] = [],
): TravelPlanResult {
  const strategy = PLAN_STRATEGIES[mode];
  const barriers = barrierOffsets
    .filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= events.length)
    .toSorted((a, b) => a - b);
  let barrierIndex = 0;
  let plannerSegment = 0;
  const records: PlannerEventRecord[] = events.map((event, eventIndex) => {
    while (barriers[barrierIndex] <= eventIndex) {
      plannerSegment++;
      barrierIndex++;
    }
    return { event, tags: { segment: plannerSegment } };
  });
  const output: PlannerEventRecord[] = [];
  let segment: PlannerEventRecord[] = [];
  let runs = 0;
  let colors = 0;
  let colorHasRuns = false;
  let activePlannerSegment: number | undefined;

  const flushPlannerSegment = () => {
    const block = splitColorBlock(segment, autoTrim);
    runs += block.runs.length;
    if (block.runs.length > 0) colorHasRuns = true;
    output.push(...planBlock(block, strategy, examine));
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
  };
}
