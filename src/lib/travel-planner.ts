import type { StitchEvent } from './types.ts';
import { ROUTE_ALGORITHMS, routeItems } from './routing.ts';

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
  events: StitchEvent[];
  entry: readonly [number, number];
  exit: readonly [number, number];
  index: number;
}

interface ColorBlock {
  prefix: StitchEvent[];
  runs: ThreadRun[];
}

export interface PlanStrategy {
  algorithm: keyof typeof ROUTE_ALGORITHMS;
}

/** Public mode registry: future plan modes are additive configuration. */
export const PLAN_STRATEGIES = {
  nearest: { algorithm: 'nearest' },
} as const satisfies Record<string, PlanStrategy>;

export type PlanMode = keyof typeof PLAN_STRATEGIES;

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

function splitColorBlock(events: StitchEvent[], autoTrim: number): ColorBlock {
  const prefix: StitchEvent[] = [];
  const runs: ThreadRun[] = [];
  let current: StitchEvent[] = [];
  let currentEntry: StitchEvent | null = null;
  let gap: StitchEvent[] = [];
  let lastPosition: StitchEvent | null = null;
  let cutPending = false;

  const finish = () => {
    const positional = current.filter((event) => event.t === 'stitch' || event.t === 'jump');
    if (positional.length === 0) {
      prefix.push(...current);
    } else {
      const first = currentEntry ?? positional[0];
      const last = positional[positional.length - 1];
      runs.push({
        events: current,
        entry: [first.x, first.y],
        exit: [last.x, last.y],
        index: runs.length,
      });
    }
    current = [];
    currentEntry = null;
  };

  const flushGap = (nextIsStitch: boolean) => {
    if (gap.length === 0) return;
    let distance = 0;
    let point = lastPosition;
    for (const event of gap) {
      if (event.t !== 'jump') continue;
      if (point) distance += Math.hypot(event.x - point.x, event.y - point.y);
      point = event;
    }
    const longCut = nextIsStitch && autoTrim > 0 && distance >= autoTrim;
    if (cutPending || longCut) {
      // Boundary marks annotate the run just sewn. Connector jumps are rebuilt
      // after ordering and are therefore intentionally not retained.
      current.push(...gap.filter((event) => event.t === 'mark'));
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

  for (const event of events) {
    if (event.t === 'jump' || event.t === 'mark') {
      gap.push(event);
      continue;
    }
    flushGap(event.t === 'stitch');
    if (event.t === 'trim') {
      current.push(event);
      cutPending = true;
      continue;
    }
    current.push(event);
    if (event.t === 'stitch') lastPosition = event;
  }
  flushGap(false);
  if (current.length > 0) finish();
  return { prefix, runs };
}

function planBlock(
  block: ColorBlock,
  strategy: PlanStrategy,
  examine?: (count: number) => void,
): StitchEvent[] {
  if (block.runs.length <= 1) return [...block.prefix, ...block.runs.flatMap((run) => run.events)];
  const ordered = routeItems(
    strategy.algorithm,
    block.runs.map((run) => ({
      value: run,
      index: run.index,
      entry: run.entry,
      exit: run.exit,
    })),
    { anchorFirst: true, examine },
  );
  const out = [...block.prefix];
  let previous: ThreadRun | null = null;
  for (const routed of ordered) {
    const run = routed.item.value;
    if (previous) {
      const first = run.events.find((event) => event.t === 'stitch' || event.t === 'jump');
      if (first)
        out.push({
          t: 'jump',
          x: run.entry[0],
          y: run.entry[1],
          c: first.c,
          line: first.line,
        });
    }
    out.push(...run.events);
    previous = run;
  }
  return out;
}

export function applyTravelPlan(
  events: StitchEvent[],
  mode: PlanMode,
  autoTrim: number,
  examine?: (count: number) => void,
): TravelPlanResult {
  const strategy = PLAN_STRATEGIES[mode];
  const output: StitchEvent[] = [];
  let segment: StitchEvent[] = [];
  let runs = 0;
  let colors = 0;
  let reordered = false;

  const flush = () => {
    const block = splitColorBlock(segment, autoTrim);
    runs += block.runs.length;
    if (block.runs.length > 0) colors++;
    if (block.runs.length > 1) reordered = true;
    output.push(...planBlock(block, strategy, examine));
    segment = [];
  };

  for (const event of events) {
    if (event.t === 'color') {
      flush();
      output.push(event);
    } else {
      segment.push(event);
    }
  }
  flush();

  return {
    events: output,
    mode,
    travelBeforeMm: travelLength(events),
    travelAfterMm: travelLength(output),
    runs,
    colors,
    reordered,
  };
}
