import type {
  ASTNode,
  ChalkEvent,
  ExprNode,
  ColorTableEntry,
  PreflightMode,
} from '../core/types.ts';
import type { PlanAtomicSpan, PlanMode, PlanRouteGroupSpan } from '../embroidery/travel-planner.ts';
import type { Machine } from '../embroidery/machine/index.ts';
import type { Val, NsList, FuncRef, ComposedRef, RefSignature } from './list.ts';
import type { Pt } from '../geometry/genmath.ts';

/** Environment frame: local variable bindings inside a procedure call. */
export type Env = Record<string, Val> | null;

/**
 * All mutable interpreter state and cross-module function references,
 * shared across every module via a single object reference. Functions are
 * populated by their respective `init*` helpers before execution starts.
 */
export interface RunContext {
  // ---- mutable closure state ----
  globals: Record<string, Val>;
  globalLines: Record<string, number>;
  chalk: Array<ChalkEvent & { eventIndexAtEmit: number }>;
  chalkVertices: number;
  procs: Record<string, ASTNode & { k: 'to' }>;
  /** Main PRNG stream — reassigned by `seed`. */
  rng: () => number;
  /** Legacy 1-D/2-D coherent noise — reassigned by `seed`. */
  noise: (x: number, y?: number) => number;
  /** Seeded simplex 2-D noise — reassigned by `seed`. */
  snoise2: (x: number, y: number) => number;
  /** Seeded simplex 3-D noise — reassigned by `seed`. */
  snoise3: (x: number, y: number, z: number) => number;
  ops: number;
  cells: number;
  stringChars: number;
  printed: string[];
  insideTrace: number;
  insideFillGenerator: number;
  traceNoted: Set<string>;
  structuralDepth: number;
  preflightMode: PreflightMode;
  preflightLine?: number;
  planMode: PlanMode | 'off' | null;
  planLine?: number;
  /** Sparse authored event offsets at which a new planner segment begins. */
  planBarrierOffsets: number[];
  /** Outermost authored atomic spans; nested atomic blocks share their owner's span. */
  planAtomicSpans: PlanAtomicSpan[];
  atomicDepth: number;
  /** Outermost authored route-group spans; nested groups share their owner's span. */
  planRouteGroupSpans: PlanRouteGroupSpan[];
  routeGroupDepth: number;
  palette: ColorTableEntry[];
  paletteSetLine?: number;
  background: string;
  backgroundSetLine?: number;
  colorOrStopLine?: number;
  usedColorIndices: Set<number>;
  m: Machine;

  // ---- budget (initBudget) ----
  traceNote: (kind: string, msg: string) => void;
  tick: (line?: number) => void;
  tickN: (n: number, line?: number) => void;
  overlongMsg: () => string;
  charge: (n: number, line?: number) => void;
  allocString: (s: string, line?: number) => string;
  allocList: (items: Val[], line?: number) => NsList;

  // ---- value guards (initGuards) ----
  truthy: (v: Val, what: string, line?: number) => number;
  toIndex: (v: Val, len: number, what: string, line?: number) => number;
  list: (v: Val, what: string, line?: number) => NsList;
  funcRef: (v: Val, what: string, line?: number) => FuncRef;
  checkDepth: (v: Val, line?: number) => void;

  // ---- built-in dispatchers ----
  stringFunc: (name: string, args: Val[], line: number | undefined) => Val;
  listFunc: (name: string, args: Val[], line: number | undefined, depth?: number) => Val;
  genFunc: (name: string, args: Val[], line: number | undefined) => Val;
  queryFunc: (name: string, args: Val[], line: number | undefined) => Val;

  // ---- expression evaluator (initEvalExpr) ----
  evalExpr: (node: ExprNode, env: Env, repcount: number, depth: number) => Val;

  // ---- block / statement executor (initExecStmt) ----
  execBlock: (
    stmts: ASTNode[],
    env: Env,
    repcount: number,
    depth: number,
    contextLine?: number,
  ) => void;
  execStmt: (st: ASTNode, env: Env, repcount: number, depth: number, contextLine?: number) => void;
  runLoopBody: (
    body: ASTNode[],
    env: Env,
    repcount: number,
    depth: number,
    contextLine?: number,
  ) => boolean;

  // ---- procedure call machinery (initProcCall) ----
  callProc: (
    name: string,
    argNodes: ExprNode[],
    env: Env,
    repcount: number,
    depth: number,
    line?: number,
  ) => Val | undefined;
  callProcVals: (name: string, argVals: Val[], depth: number, line?: number) => Val | undefined;
  scalarBuiltin: (name: string, argVals: Val[], line?: number) => Val;
  bindRef: (ref: FuncRef, values: Val[], line?: number) => FuncRef;
  effectiveRefSignature: (ref: FuncRef) => RefSignature;
  assertRefArity: (ref: FuncRef, arity: number, what: string, line?: number) => void;
  callRef: (ref: FuncRef | ComposedRef, argVals: Val[], depth: number, line?: number) => Val;

  // ---- reporter validation (initReporters) ----
  applyReporter: (ref: FuncRef, x: number, y: number, line?: number) => Pt;
  applyShapeReporterArity: (ref: FuncRef, line?: number) => void;
  applyShapeReporter: (
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    u: number,
    line?: number,
  ) => [number, number, number, number, number];
  applyRailShapeReporterArity: (ref: FuncRef, line?: number) => void;
  applyRailShapeReporter: (
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    u: number,
    line?: number,
  ) => [number, number, number, number, number];
  applyStitchLenReporterArity: (ref: FuncRef, line?: number) => void;
  applyStitchLenReporter: (
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    p: [number, number],
    line?: number,
  ) => number;
  applyFillLenReporterArity: (ref: FuncRef, line?: number) => void;
  applyFillLenReporter: (
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    p: [number, number],
    line?: number,
  ) => number;
  applyFillDirArity: (ref: FuncRef, line?: number) => void;
  applyFillDir: (ref: FuncRef, px: number, py: number, line?: number) => number;
  applyFillShapeArity: (ref: FuncRef, line?: number) => void;
  applyFillShape: (
    ref: FuncRef,
    px: number,
    py: number,
    row: number,
    v: number,
    line?: number,
  ) => [number, number, number];
  clampHumanize: (amount: number) => number;
  clampMaxshift: (amount: number) => number;
}
