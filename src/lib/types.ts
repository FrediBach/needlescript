// ---------- Shared types ----------

export type TokenType =
  'num' | 'string' | 'var' | 'qword' | 'word' | 'pref' | 'op' | '[' | ']' | '(' | ')' | ',';

export interface Token {
  t: TokenType;
  v?: string | number;
  line: number;
  /** Start character offset in the source (inclusive). */
  start: number;
  /** End character offset in the source (exclusive). */
  end: number;
  spBefore?: boolean;
  spAfter?: boolean;
}

export type EventType = 'stitch' | 'jump' | 'color' | 'trim' | 'mark';

export interface StitchEvent {
  t: EventType;
  x: number;
  y: number;
  c: number; // color index
  line?: number; // source line that produced this event (debugging)
  u?: 1; // underlay stitch (drawn lighter in previews; identical in exports)
  label?: string; // mark events only: optional preview label
}

/**
 * Maps a warning (by its index in RunResult.warnings) to where the problem is
 * in the design. Currently emitted only for density/stack hotspots, the only
 * warnings that carry true spatial coordinates. Additive: the warnings array
 * itself keeps its plain-string shape.
 */
export interface WarningLocation {
  index: number; // index into RunResult.warnings
  points: { x: number; y: number }[]; // hoop-space coordinates (mm)
  lines: number[]; // source lines that contributed to the hotspot
  kind: 'density' | 'stack' | 'tiny' | 'overflow';
}

/** Physical hoop and derived sewable field, as configured by the `hoop` command. */
export interface HoopInfo {
  shape: 'circle' | 'rectangle';
  /** Hoop outer dimension in mm. For circles this is the diameter. */
  widthMM: number;
  /** Hoop outer dimension in mm. For circles this equals widthMM. */
  heightMM: number;
  /** Sewable field width in mm (= widthMM − 6; 3 mm inset each side). */
  fieldWidthMM: number;
  /** Sewable field height in mm (= heightMM − 6; 3 mm inset each side). */
  fieldHeightMM: number;
  /** Set when the hoop was named, e.g. `'5x7'` or `'round100'`. */
  presetName?: string;
}

/**
 * The string keys accepted by the `override` command.  Each key maps to a
 * run-envelope budget that can be raised (with a warning) or lowered (with an
 * info note) relative to the stock value in STOCK_LIMITS.
 */
export type OverrideKey =
  | 'stitches'
  | 'ops'
  | 'calldepth'
  | 'loopiters'
  | 'listlen'
  | 'listcells'
  | 'stringlen'
  | 'stringtotal'
  | 'scatterpoints'
  | 'geoinput'
  | 'clipverts'
  | 'chalks'
  | 'chalkverts';

export type ChalkStyle = 'auto' | 'dots' | 'line';

export interface ChalkStroke {
  vertices: [number, number][];
  /** Points are single markers; paths retain their data order as a polyline. */
  kind: 'point' | 'path';
}

/** A preview-only data snapshot produced by a `chalk` statement. */
export interface ChalkEvent {
  strokes: ChalkStroke[];
  kind: 'point' | 'path' | 'group' | 'mixed';
  label?: string;
  style: ChalkStyle;
  sourceLine: number;
  sequence: number;
  /** Number of stitch/jump preview points that existed when the chalk was made. */
  stitchIndexAtEmit: number;
  vertexCount: number;
}

/** End-of-run snapshot of a top-level value that the playground can inspect. */
export interface ChalkDataVar {
  name: string;
  declarationLine?: number;
  strokes: ChalkStroke[];
  kind: 'point' | 'path' | 'group' | 'mixed';
  vertexCount: number;
  pathCount: number;
  pathLength?: number;
}

export interface RunResult {
  events: StitchEvent[];
  warnings: string[];
  warningLocations?: WarningLocation[];
  printed: string[];
  locks: number;
  density: DensityResult;
  /** The hoop configured by the `hoop` directive, if any. */
  activeHoop?: HoopInfo;
  /** Budget limits raised or lowered by `override` directives, if any. */
  activeOverrides?: Partial<Record<OverrideKey, number>>;
  /** Top-level variables defined by `let` statements in the script. */
  globals?: Record<string, unknown>;
  /** Preview-only snapshots emitted by `chalk`; never part of the stitch stream. */
  chalk?: ChalkEvent[];
  /** Inspectable final top-level data snapshots. */
  dataVars?: ChalkDataVar[];
  /** Whole-design travel planning metadata, present only when `plan` is active. */
  plan?: TravelPlanStats;
  colorTable: ColorTableEntry[];
  background: string;
}

export interface ColorTableEntry {
  slot: number;
  hex: string;
  name?: string;
  source: 'palette' | 'auto' | 'default';
  firstUseLine?: number;
  stitchCount: number;
  pathLenMm: number;
}

export interface TravelPlanStats {
  planMode: string;
  travelBeforeMm: number;
  travelAfterMm: number;
  runs: number;
  colors: number;
}

export interface DesignStats {
  stitches: number;
  jumps: number;
  trims: number;
  colorChanges: number;
  colorsUsed: number;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  maxStitchLen: number;
  maxRadius: number;
  yarnLength: number; // total sewn thread length in mm (stitches only, not jumps)
  planMode?: string;
  travelBeforeMm?: number;
  travelAfterMm?: number;
  slots?: Array<Pick<ColorTableEntry, 'slot' | 'stitchCount' | 'pathLenMm'>>;
}

// ---------- AST node types ----------

export type ASTNode =
  | { k: 'to'; name: string; params: string[]; body: ASTNode[]; line: number }
  | { k: 'repeat'; count: ExprNode; body: ASTNode[]; line: number }
  | { k: 'while'; cond: ExprNode; body: ASTNode[]; line: number }
  | {
      k: 'for';
      varName: string;
      from: ExprNode;
      to: ExprNode;
      step: ExprNode;
      body: ASTNode[];
      line: number;
    }
  | { k: 'forin'; varName: string; list: ExprNode; body: ASTNode[]; line: number }
  | { k: 'if'; cond: ExprNode; body: ASTNode[]; elseBody: ASTNode[] | null; line: number }
  | { k: 'transform'; name: string; args: ExprNode[]; body: ASTNode[]; line: number }
  | { k: 'effect'; name: string; args: ExprNode[]; body: ASTNode[]; line: number }
  | { k: 'make'; name: string; value: ExprNode; line: number }
  | { k: 'local'; name: string; value: ExprNode; line: number }
  | { k: 'letlist'; names: string[]; value: ExprNode; line: number; isLocal: boolean }
  | { k: 'setindex'; name: string; indices: ExprNode[]; op: string; value: ExprNode; line: number }
  | { k: 'output'; value: ExprNode | null; line: number } // value null = "exit"
  | { k: 'break'; line: number }
  | { k: 'continue'; line: number }
  | { k: 'cmd'; name: string; args: ExprNode[]; line: number; label?: string; word?: string }
  | { k: 'listcmd'; name: string; args: ExprNode[]; line: number }
  | {
      k: 'fillarm';
      dirRef: string | null;
      shapeRef: string | null;
      pathsRef: string | null;
      pathsExpr: ExprNode | null;
      line: number;
    }
  | { k: 'call'; name: string; args: ExprNode[]; line: number };

export type ExprNode =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string; line: number }
  | { k: 'var'; name: string; line: number; bare?: boolean }
  | { k: 'neg'; val: ExprNode; line: number }
  | { k: 'bin'; op: string; left: ExprNode; right: ExprNode }
  | { k: 'func'; name: string; args: ExprNode[]; line: number }
  | { k: 'listfunc'; name: string; args: ExprNode[]; line: number; word?: string }
  | { k: 'list'; items: ExprNode[]; line: number }
  | { k: 'index'; obj: ExprNode; idx: ExprNode; line: number }
  | { k: 'callval'; obj: ExprNode; args: ExprNode[]; line: number }
  | { k: 'callexpr'; name: string; args: ExprNode[]; line: number }
  | { k: 'procref'; name: string; line: number }
  | { k: 'trace'; multi: boolean; body: ASTNode[]; line: number };

// ---------- Density analysis types ----------

export interface DensityCell {
  ix: number;
  iy: number;
  count: number;
  layers: number;
}

export interface DensityHotspot {
  x: number;
  y: number;
  value: number; // thread coverage in layers ('density') or hits in one hole ('stack')
  lines: number[];
  kind: 'density' | 'stack';
}

export interface DensityResult {
  cellMM: number;
  cells: DensityCell[];
  peak: number; // highest thread coverage, in layers
  hotspots: DensityHotspot[];
}

// ---------- Run options ----------

export interface RunOptions {
  seed?: number;
  /** Optional synchronous timing sink for profiling the language pipeline. */
  onTiming?: (timings: RunTimings) => void;
}

export interface RunTimings {
  tokenizeMs: number;
  parseMs: number;
  executeMs: number;
}
