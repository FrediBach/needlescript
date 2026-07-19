// ---------- Interpreter ----------

import type { ChalkEvent, RunOptions, RunResult, WarningLocation } from '../types.ts';
import type { OverrideKey } from '../types.ts';
import { Machine, STOCK_LIMITS } from '../machine.ts';
import type { BudgetKey } from '../machine.ts';
import { makeRNG, makeNoise } from '../prng.ts';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { tokenize } from '../tokenizer.ts';
import { linkStandardModules } from '../module-linker.ts';
import { applyAutoTrim, applyLocks, densityMap } from '../postprocess.ts';
import { applyTravelPlan } from '../travel-planner.ts';
import type { PlanAtomicSpan, PlanRouteGroupSpan } from '../travel-planner.ts';
import type { TravelPlanStats } from '../types.ts';
import { formatVal, isFuncRef } from '../list.ts';
import type { Val } from '../list.ts';
import type { ASTNode } from '../types.ts';
import { LIMITS } from '../machine.ts';
import { NeedlescriptError } from '../errors.ts';
import { fieldDescription, hoopDescription, inHoopField, inHoopOuter } from '../hoop-presets.ts';
import { LoopSignal } from './signals.ts';
import type { RunContext } from './context.ts';
import { initBudget } from './budget.ts';
import { initGuards } from './guards.ts';
import { initStringFunc } from './string-func.ts';
import { initListFunc } from './list-func.ts';
import { initGenFunc } from './gen-func.ts';
import { initQueryFunc } from './query-func.ts';
import { initEvalExpr } from './eval-expr.ts';
import { initProcCall } from './proc-call.ts';
import { initReporters } from './reporters.ts';
import { initExecStmt } from './exec-stmt.ts';
import { inspectChalkValue } from '../chalk.ts';
import { DEFAULT_BACKGROUND, defaultSlotColor } from '../colormath.ts';
import type { ColorTableEntry } from '../types.ts';
import { directionalCompensationPreview } from '../directional-compensation.ts';
import { buildPreflightResult } from '../preflight.ts';
import {
  applyMachineCalibration,
  applyMachineCalibrationToConstructionRecords,
  applyMachineCalibrationToPoints,
  enforceMaximumMovement,
  isIdentityMachineCalibration,
  resolveMachineProfile,
} from '../machine-profile.ts';

export function run(source: string, opts: RunOptions = {}): RunResult {
  const startedAt = performance.now();
  const tokens = tokenize(source);
  const tokenizedAt = performance.now();
  const parseNotes: string[] = [];
  const program = linkStandardModules(tokens, parseNotes);
  const parsedAt = performance.now();
  const m = new Machine();
  const initialMachineProfile = resolveMachineProfile(m.maxDensity, opts.machineProfile);
  m.warnings.push(...parseNotes);

  const seed0 = opts.seed !== undefined ? opts.seed : 42;

  // Build the shared context object. All modules close over this.
  const ctx = {
    globals: Object.create(null) as Record<string, Val>,
    globalLines: Object.create(null) as Record<string, number>,
    chalk: [] as RunContext['chalk'],
    chalkVertices: 0,
    procs: Object.create(null) as Record<string, ASTNode & { k: 'to' }>,
    rng: makeRNG(seed0),
    noise: makeNoise(seed0),
    // Seeded simplex noise (RFC-3 §4.2): permutation tables built from the
    // seed at seed time, on a stream of their own — same seed, same field,
    // forever, and zero draws from the main stream.
    snoise2: createNoise2D(makeRNG(seed0)),
    snoise3: createNoise3D(makeRNG(seed0 ^ 0x9e3779b9)),
    ops: 0,
    /** Live list cells (slots). Decremented by removeat; lists that simply go
     *  out of reach stay counted — the counter is a tab-protecting ceiling,
     *  not a garbage collector. */
    cells: 0,
    /** Monotonic string character allocation counter. Same philosophy as cells. */
    stringChars: 0,
    printed: [] as string[],
    // Trace sandbox state (RFC-trace §4)
    insideTrace: 0,
    insideFillGenerator: 0,
    traceNoted: new Set<string>(),
    // Structural block depth: incremented inside loops/if/planner/transform/effect blocks
    // so that the `hoop` and `override` placement guards can detect nested placement.
    structuralDepth: 0,
    preflightMode: 'off',
    preflightLine: undefined,
    planMode: null,
    planLine: undefined,
    planBarrierOffsets: [] as number[],
    planAtomicSpans: [] as PlanAtomicSpan[],
    atomicDepth: 0,
    planRouteGroupSpans: [] as PlanRouteGroupSpan[],
    routeGroupDepth: 0,
    palette: [] as ColorTableEntry[],
    paletteSetLine: undefined,
    background: DEFAULT_BACKGROUND,
    backgroundSetLine: undefined,
    colorOrStopLine: undefined,
    usedColorIndices: new Set<number>([0]),
    m,
  } as RunContext;

  // Populate all function slots on ctx — ORDER MATTERS: each init may call
  // previously-registered functions at RUNTIME (not at init time), so all
  // inits must complete before program execution starts.
  initBudget(ctx);
  initGuards(ctx);
  initStringFunc(ctx);
  initListFunc(ctx);
  initGenFunc(ctx);
  initQueryFunc(ctx);
  initProcCall(ctx); // needs evalExpr + execBlock at runtime (lazy via ctx)
  initReporters(ctx);
  initEvalExpr(ctx); // needs callProc + execBlock at runtime (lazy via ctx)
  initExecStmt(ctx); // needs evalExpr + callProc at runtime (lazy via ctx)

  try {
    ctx.execBlock(program, null, 0, 0);
  } catch (e) {
    // Defensive: parse-time validation makes an escaping loop signal unreachable.
    if (e instanceof LoopSignal)
      throw new NeedlescriptError(`"${e.kind}" can only be used inside a loop`, e.line);
    throw e;
  }

  m.flushSatin();
  // Convert source-stream event offsets to the stitch/jump index used by playback
  // before planning or post-processing can reorder or insert events.
  const chalk: ChalkEvent[] = [];
  let previewPoints = 0;
  let chalkIndex = 0;
  for (let eventIndex = 0; eventIndex <= m.events.length; eventIndex++) {
    while (ctx.chalk[chalkIndex]?.eventIndexAtEmit === eventIndex) {
      const event = ctx.chalk[chalkIndex++];
      chalk.push({
        strokes: event.strokes,
        kind: event.kind,
        label: event.label,
        style: event.style,
        sourceLine: event.sourceLine,
        sequence: event.sequence,
        stitchIndexAtEmit: previewPoints,
        vertexCount: event.vertexCount,
      });
    }
    const event = m.events[eventIndex];
    if (event?.t === 'stitch' || event?.t === 'jump') previewPoints++;
  }
  const warningLocations: WarningLocation[] = [];
  if (m.recording) {
    m.warnings.push('beginfill was never closed — endfill added at the end of the program');
    m.endFill();
  }
  if (m.fillArmed && m.fillArmLine !== undefined)
    m.warnings.push(`a fill arming on line ${m.fillArmLine} was never used`);
  m.finalizeFillEdgeWarnings();
  warningLocations.push(...m.constructionWarningLocations);
  if (m.tinyDropped > 0) {
    const spots = m.tinyDroppedSpots;
    if (spots.length) {
      const lines = [
        ...new Set(spots.map((s) => s.line).filter((l): l is number => l !== undefined)),
      ];
      warningLocations.push({
        index: m.warnings.length,
        points: spots.map((s) => ({ x: s.x, y: s.y })),
        lines,
        kind: 'tiny',
      });
    }
    m.warnings.push(
      `${m.tinyDropped} sub-${LIMITS.minStitch} mm moves merged into neighbours (too short to sew safely)`,
    );
  }

  const machineProfile = {
    ...initialMachineProfile,
    maximumDensityLayers: m.maxDensity,
  };
  const calibrationActive = !isIdentityMachineCalibration(machineProfile.calibration);
  let constructionRecords = m.constructionRecords;
  if (calibrationActive) {
    const calibrated = applyMachineCalibration(m.events, machineProfile.calibration);
    m.events = calibrated.events;
    constructionRecords = applyMachineCalibrationToConstructionRecords(
      constructionRecords,
      machineProfile.calibration,
      calibrated.eventMap,
    );
    for (const location of warningLocations)
      location.points = applyMachineCalibrationToPoints(
        location.points,
        machineProfile.calibration,
      );
  }

  let planStats: TravelPlanStats | undefined;
  if (ctx.planMode && ctx.planMode !== 'off') {
    const beforeAutotrims = m.autoTrim > 0 ? applyAutoTrim(m.events, m.autoTrim).trims : 0;
    const planned = applyTravelPlan(
      m.events,
      ctx.planMode,
      m.autoTrim,
      (n) => ctx.tickN(n, ctx.planLine),
      ctx.planBarrierOffsets,
      ctx.planAtomicSpans,
      ctx.planRouteGroupSpans,
    );
    const afterAutotrims = m.autoTrim > 0 ? applyAutoTrim(planned.events, m.autoTrim).trims : 0;
    m.events = planned.events;
    planStats = {
      planMode: planned.mode,
      travelBeforeMm: planned.travelBeforeMm,
      travelAfterMm: planned.travelAfterMm,
      runs: planned.runs,
      colors: planned.colors,
      ...(planned.groups.length > 0 ? { groups: planned.groups } : {}),
    };
    const historyNote =
      planned.reordered && m.usedQuery
        ? '; history queries used authored order, before this final sew-order plan'
        : '';
    for (const group of planned.groups) {
      const source = group.line === undefined ? '' : ` on line ${group.line}`;
      ctx.printed.push(
        `routegroup ${group.id}${source}: travel ${group.travelBeforeMm.toFixed(1)} mm → ${group.travelAfterMm.toFixed(1)} mm (eligible runs: ${group.eligibleRuns}, moved: ${group.movedRuns}, 2-opt swaps: ${group.improvementSwaps})`,
      );
    }
    ctx.printed.push(
      planned.reordered
        ? `plan '${planned.mode}': travel ${planned.travelBeforeMm.toFixed(1)} mm → ${planned.travelAfterMm.toFixed(1)} mm, autotrims ${beforeAutotrims} → ${afterAutotrims} (runs: ${planned.runs}, colors: ${planned.colors}${historyNote})`
        : `plan '${planned.mode}': nothing to reorder`,
    );
  }

  if (calibrationActive)
    m.events = enforceMaximumMovement(m.events, machineProfile.maximumStitchMM);

  if (m.autoTrim > 0) {
    const at = applyAutoTrim(m.events, m.autoTrim);
    m.events = at.events;
  }

  // Analyse coverage before the lock pass: tie-offs are deliberate micro
  // stitches and would otherwise read as false hotspots at every thread end.
  const density = calibrationActive
    ? densityMap(m.events, m.density.cellMM, m.maxDensity, m.materialIntent.threadWidthMM)
    : m.density.finalize(m.maxDensity);
  if (m.maxDensity > 0) {
    const dens = density.hotspots.filter((h) => h.kind === 'density').slice(0, 3);
    for (const h of dens) {
      warningLocations.push({
        index: m.warnings.length,
        points: [{ x: h.x, y: h.y }],
        lines: h.lines,
        kind: 'density',
      });
      m.warnings.push(
        `${h.value.toFixed(1)} layers of thread (limit ${m.maxDensity}) near (${h.x.toFixed(0)}, ${h.y.toFixed(0)})` +
          (h.lines.length
            ? ` — mostly line${h.lines.length > 1 ? 's' : ''} ${h.lines.join(', ')}`
            : '') +
          ' — may pucker or break needles',
      );
    }
    const stacks = density.hotspots.filter((h) => h.kind === 'stack').slice(0, 2);
    for (const h of stacks) {
      warningLocations.push({
        index: m.warnings.length,
        points: [{ x: h.x, y: h.y }],
        lines: h.lines,
        kind: 'stack',
      });
      m.warnings.push(
        `${h.value} needle penetrations in the same hole near (${h.x.toFixed(0)}, ${h.y.toFixed(0)})` +
          (h.lines.length ? ` — line ${h.lines[0]}` : '') +
          ' — this can cut the fabric',
      );
    }
  }

  let locks = 0;
  const preflightEvents = m.events;
  if (m.lockLen > 0) {
    const secured = applyLocks(m.events, m.lockLen);
    m.events = secured.events;
    locks = secured.locks;
  }

  // ---------- Overflow warnings (§hoop §2.5) ----------
  const fieldOverflows = calibrationActive
    ? preflightEvents
        .filter((event) => event.t === 'stitch' && !inHoopField(m.hoopInfo, event.x, event.y))
        .slice(0, 50)
        .map((event) => ({
          x: event.x,
          y: event.y,
          line: event.line,
          kind: inHoopOuter(m.hoopInfo, event.x, event.y) ? ('field' as const) : ('hoop' as const),
        }))
    : m.fieldOverflows;
  if (fieldOverflows.length > 0) {
    const fieldHits = fieldOverflows.filter((o) => o.kind === 'field');
    const hoopHits = fieldOverflows.filter((o) => o.kind === 'hoop');
    if (fieldHits.length > 0) {
      const pts = fieldHits.slice(0, 10);
      const lines = [
        ...new Set(pts.map((o) => o.line).filter((l): l is number => l !== undefined)),
      ];
      warningLocations.push({
        index: m.warnings.length,
        points: pts.map((o) => ({ x: o.x, y: o.y })),
        lines,
        kind: 'overflow',
      });
      const first = fieldHits[0];
      m.warnings.push(
        `${fieldHits.length} stitch${fieldHits.length === 1 ? '' : 'es'} outside the ${fieldDescription(m.hoopInfo)}` +
          (first.line !== undefined ? `, line ${first.line}` : '') +
          ` at (${first.x.toFixed(1)}, ${first.y.toFixed(1)})` +
          (fieldHits.length > 1 ? ` and ${fieldHits.length - 1} more` : ''),
      );
    }
    if (hoopHits.length > 0) {
      const pts = hoopHits.slice(0, 10);
      const lines = [
        ...new Set(pts.map((o) => o.line).filter((l): l is number => l !== undefined)),
      ];
      warningLocations.push({
        index: m.warnings.length,
        points: pts.map((o) => ({ x: o.x, y: o.y })),
        lines,
        kind: 'overflow',
      });
      const first = hoopHits[0];
      m.warnings.push(
        `${hoopHits.length} stitch${hoopHits.length === 1 ? '' : 'es'} outside the ${hoopDescription(m.hoopInfo)} — the machine physically cannot reach this point` +
          (first.line !== undefined ? `, line ${first.line}` : '') +
          ` at (${first.x.toFixed(1)}, ${first.y.toFixed(1)})`,
      );
    }
  }

  // ---------- Override raise warnings (emitted every run, §override §3.5) ----------
  for (const [keyStr, { value, line: overrideLine }] of m.activeOverrides) {
    const budgetKey = (
      {
        stitches: 'maxStitches',
        ops: 'maxOps',
        calldepth: 'maxCallDepth',
        loopiters: 'maxLoopIters',
        listlen: 'maxListLen',
        listcells: 'maxListCells',
        stringlen: 'maxStringLength',
        stringtotal: 'maxStringChars',
        scatterpoints: 'maxScatterPoints',
        geoinput: 'maxDelaunayPoints',
        clipverts: 'maxClipVerts',
        chalks: 'maxChalks',
        chalkverts: 'maxChalkVerts',
      } as Record<string, BudgetKey>
    )[keyStr];
    if (!budgetKey) continue;
    const stock = STOCK_LIMITS[budgetKey];
    if (value <= stock) continue; // lowered limits get an info note at parse time, not here
    const tailored: Record<string, string> = {
      stitches: 'Expect a slower preview and longer sew-out time.',
      ops: 'Expect a multi-second run. Avoid infinite loops.',
      calldepth: 'Deep recursion may slow or crash some environments.',
      loopiters: 'Very long loops may freeze the tab briefly.',
      listlen: 'Large lists may use significant browser memory.',
      listcells: 'Large total list allocation may use significant browser memory.',
      stringlen: 'Very long strings may use significant browser memory.',
      stringtotal: 'Large string allocation may use significant browser memory.',
      scatterpoints: 'Poisson-disc at high density may be slow.',
      geoinput: 'Voronoi/triangulate with many points may be slow.',
      clipverts: 'Clip operations with many vertices may be slow.',
      chalks: 'Many preview overlays may reduce playground frame rate.',
      chalkverts: 'Large preview overlays may use significant browser memory.',
    };
    m.warnings.push(
      `⚠ override: ${keyStr} raised ${stock.toLocaleString('en-US')} → ${value.toLocaleString('en-US')} (line ${overrideLine}). ${tailored[keyStr] ?? ''} You are outside the tested envelope.`,
    );
  }

  // ---------- Build RunResult ----------
  const activeHoop: typeof m.hoopInfo | undefined = m.hoopSet ? m.hoopInfo : undefined;
  const activeOverrides: Partial<Record<OverrideKey, number>> | undefined =
    m.activeOverrides.size > 0
      ? Object.fromEntries([...m.activeOverrides.entries()].map(([k, v]) => [k, v.value]))
      : undefined;
  const dataVars = Object.entries(ctx.globals).flatMap(([name, value]) => {
    const inspected = inspectChalkValue(value, { mode: 'silent' });
    if (!inspected) return [];
    return [
      {
        name,
        declarationLine: ctx.globalLines[name],
        ...inspected,
      },
    ];
  });
  const referenceVars = Object.entries(ctx.globals).flatMap(([name, value]) => {
    if (!isFuncRef(value)) return [];
    return [
      {
        name,
        declarationLine: ctx.globalLines[name],
        display: formatVal(value),
        environment: value.bound.map((bound, index) => ({
          name: value.captureNames?.[index] ?? `argument ${index + 1}`,
          value: formatVal(bound, true),
        })),
      },
    ];
  });

  const allIndices = new Set(ctx.usedColorIndices);
  for (const event of m.events) allIndices.add(event.c);
  const maxIndex = Math.max(0, ...allIndices, ctx.palette.length - 1);
  const colorTable: ColorTableEntry[] = [];
  for (let index = 0; index <= maxIndex; index++) {
    const defined = ctx.palette[index];
    let stitchCount = 0;
    let pathLenMm = 0;
    let previous: { x: number; y: number; c: number } | undefined;
    for (const event of m.events) {
      if (event.t === 'stitch' && event.c === index) {
        stitchCount++;
        if (previous?.c === index)
          pathLenMm += Math.hypot(event.x - previous.x, event.y - previous.y);
      }
      if (event.t === 'stitch' || event.t === 'jump') previous = event;
    }
    colorTable.push({
      slot: index + 1,
      hex: defined?.hex ?? defaultSlotColor(index),
      ...(defined?.name ? { name: defined.name } : {}),
      source: defined?.source ?? 'default',
      ...(defined?.firstUseLine !== undefined ? { firstUseLine: defined.firstUseLine } : {}),
      stitchCount,
      pathLenMm,
    });
  }
  if (allIndices.size > 16)
    m.warnings.push(
      `note: design uses ${allIndices.size} thread slots — plan the thread changes for your machine`,
    );

  const preflight = buildPreflightResult({
    events: preflightEvents,
    warnings: m.warnings,
    warningLocations,
    hoop: m.hoopInfo,
    maximumDensityLayers: m.maxDensity,
    profile: machineProfile,
    mode: ctx.preflightMode,
    constructionRecords,
  });
  if (ctx.preflightMode === 'strict') {
    const blockingIssue = preflight.issues.find(({ severity }) => severity === 'error');
    if (blockingIssue)
      throw new NeedlescriptError(
        `preflight strict failed [${blockingIssue.code}]: ${blockingIssue.message}`,
        blockingIssue.lines[0] ?? ctx.preflightLine,
      );
  }

  const result: RunResult = {
    events: m.events,
    warnings: m.warnings,
    warningLocations,
    preflight,
    printed: ctx.printed,
    locks,
    density,
    material: { ...m.materialIntent },
    compensation: directionalCompensationPreview(m.materialIntent, m.pullComp, {
      mode: m.compensationMode,
      pullCompExplicit: m.pullCompExplicit,
    }),
    machineProfile,
    activeHoop,
    activeOverrides,
    globals: ctx.globals,
    chalk,
    dataVars,
    referenceVars,
    plan: planStats,
    colorTable,
    background: ctx.background,
  };
  const completedAt = performance.now();
  opts.onTiming?.({
    tokenizeMs: tokenizedAt - startedAt,
    parseMs: parsedAt - tokenizedAt,
    executeMs: completedAt - parsedAt,
  });
  return result;
}
