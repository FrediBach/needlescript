// ---------- Interpreter ----------

import type { RunOptions, RunResult, WarningLocation } from '../types.ts';
import type { OverrideKey } from '../types.ts';
import { Machine, STOCK_LIMITS } from '../machine.ts';
import type { BudgetKey } from '../machine.ts';
import { makeRNG, makeNoise } from '../prng.ts';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { tokenize } from '../tokenizer.ts';
import { parse } from '../parser.ts';
import { applyAutoTrim, applyLocks } from '../postprocess.ts';
import type { Val } from '../list.ts';
import type { ASTNode } from '../types.ts';
import { LIMITS } from '../machine.ts';
import { NeedlescriptError } from '../errors.ts';
import { fieldDescription, hoopDescription } from '../hoop-presets.ts';
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

export function run(source: string, opts: RunOptions = {}): RunResult {
  const tokens = tokenize(source);
  const parseNotes: string[] = [];
  const program = parse(tokens, parseNotes);
  const m = new Machine();
  m.warnings.push(...parseNotes);

  const seed0 = opts.seed !== undefined ? opts.seed : 42;

  // Build the shared context object. All modules close over this.
  const ctx = {
    globals: Object.create(null) as Record<string, Val>,
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
    traceNoted: new Set<string>(),
    // Structural block depth: incremented inside repeat/for/while/forin/if/transform/effect
    // so that the `hoop` and `override` placement guards can detect nested placement.
    structuralDepth: 0,
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
  const warningLocations: WarningLocation[] = [];
  if (m.recording) {
    m.warnings.push('beginfill was never closed — endfill added at the end of the program');
    m.endFill();
  }
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

  if (m.autoTrim > 0) {
    const at = applyAutoTrim(m.events, m.autoTrim);
    m.events = at.events;
  }

  // Analyse coverage before the lock pass: tie-offs are deliberate micro
  // stitches and would otherwise read as false hotspots at every thread end.
  const density = m.density.finalize(m.maxDensity);
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
  if (m.lockLen > 0) {
    const secured = applyLocks(m.events, m.lockLen);
    m.events = secured.events;
    locks = secured.locks;
  }

  // ---------- Overflow warnings (§hoop §2.5) ----------
  if (m.fieldOverflows.length > 0) {
    const fieldHits = m.fieldOverflows.filter((o) => o.kind === 'field');
    const hoopHits = m.fieldOverflows.filter((o) => o.kind === 'hoop');
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

  return {
    events: m.events,
    warnings: m.warnings,
    warningLocations,
    printed: ctx.printed,
    locks,
    density,
    activeHoop,
    activeOverrides,
    globals: ctx.globals,
  };
}
