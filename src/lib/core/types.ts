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
  /** Internal closure-lowering metadata; never produced by the tokenizer. */
  captureNames?: string[];
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
 * in the design. Used for coverage, bounds, tiny-stitch, and construction
 * diagnostics that carry true spatial coordinates. Additive: the warnings
 * array itself keeps its plain-string shape.
 */
export interface WarningLocation {
  index: number; // index into RunResult.warnings
  points: { x: number; y: number }[]; // hoop-space coordinates (mm)
  lines: number[]; // source lines that contributed to the hotspot
  kind: 'density' | 'stack' | 'tiny' | 'overflow' | 'fill' | 'satin';
  /** Stable diagnostic code when the warning has a structured physics counterpart. */
  code?: string;
  /** Optional affected construct, kept semantic and renderer-independent. */
  geometry?: DiagnosticGeometry[];
}

export type PreflightSeverity = 'info' | 'warning' | 'error';
export type PreflightMode = 'off' | 'warn' | 'strict';

/** A stable, machine-readable counterpart to an existing sewability warning. */
export interface PreflightIssue {
  severity: PreflightSeverity;
  code: string;
  message: string;
  /** Deterministic hoop-space coordinates in diagnostic order. */
  points: { x: number; y: number }[];
  /** De-duplicated source lines in diagnostic order. */
  lines: number[];
  constructionIds?: number[];
  suggestion?: string;
  /** Rich source attribution; `lines` remains the compatibility projection. */
  sourceLocations?: PhysicsSourceLocation[];
  /** Semantic affected geometry; `points` remains the compatibility projection. */
  geometry?: DiagnosticGeometry[];
  /** Indices into the pre-lock analysis event stream. Internal attribution sidecar. */
  eventIndices?: number[];
  /** Structured measurements shown by PhysicsIntellisense. */
  measurements?: PhysicsMeasurement[];
}

/**
 * The effective diagnostic envelope used by preflight.
 *
 * Session 8.5 can extend this shape with local machine capabilities and
 * calibration while the default profile continues to describe today's rules.
 */
export interface ResolvedMachineProfile {
  source: 'default' | 'run-options';
  name: string;
  minimumReliableMovementMM: number;
  maximumStitchMM: number;
  maximumPreferredSewnStitchMM: number;
  maximumPreferredSatinStitchMM: number;
  maximumPreferredJumpMM: number;
  maximumConsecutiveStitches: number;
  maximumDensityLayers: number;
  sameHolePenetrationLimit: number;
  trimCapability: MachineOperationCapability;
  colorChangeCapability: MachineOperationCapability;
  speedClass: MachineSpeedClass;
  calibration: ResolvedMachineCalibration;
}

export type MachineOperationCapability = 'automatic' | 'manual' | 'none';
export type MachineSpeedClass = 'slow' | 'standard' | 'high-speed';

/** Serializable local correction, applied only through explicit RunOptions. */
export interface MachineCalibration {
  scaleX?: number;
  scaleY?: number;
  /** x' += skewX × y. */
  skewX?: number;
  /** y' += skewY × x. */
  skewY?: number;
  offsetXMM?: number;
  offsetYMM?: number;
}

export interface ResolvedMachineCalibration {
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  offsetXMM: number;
  offsetYMM: number;
}

/** Caller-owned local machine constraints; never parsed from NeedleScript source. */
export interface MachineProfile {
  name: string;
  minimumReliableMovementMM?: number;
  maximumPreferredStitchMM?: number;
  maximumPreferredJumpMM?: number;
  trimCapability?: MachineOperationCapability;
  colorChangeCapability?: MachineOperationCapability;
  speedClass?: MachineSpeedClass;
  calibration?: MachineCalibration;
}

export interface PreflightResult {
  /** Effective source-selected policy. `off` retains compatibility diagnostics only. */
  mode: PreflightMode;
  issues: PreflightIssue[];
  profile: ResolvedMachineProfile;
  summary: Record<PreflightSeverity | 'total', number>;
}

export type DiagnosticGeometryRole =
  | 'hotspot'
  | 'boundary'
  | 'overlap'
  | 'travel'
  | 'envelope'
  | 'penetration-cluster'
  | 'unreachable-extent';

export interface DiagnosticPoint {
  x: number;
  y: number;
}

export interface DiagnosticBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DiagnosticGeometryBase {
  role: DiagnosticGeometryRole;
  anchor?: DiagnosticPoint;
  bounds?: DiagnosticBounds;
}

/** Semantic hoop-space geometry. Rendering style remains caller-owned. */
export type DiagnosticGeometry =
  | (DiagnosticGeometryBase & {
      kind: 'points';
      points: DiagnosticPoint[];
    })
  | (DiagnosticGeometryBase & {
      kind: 'polyline';
      points: DiagnosticPoint[];
      closed?: boolean;
    })
  | (DiagnosticGeometryBase & {
      kind: 'cell';
      x: number;
      y: number;
      width: number;
      height: number;
    })
  | (DiagnosticGeometryBase & {
      kind: 'region';
      rings: DiagnosticPoint[][];
    });

export type PhysicsDiagnosticCategory =
  | 'coverage'
  | 'penetration'
  | 'stitch'
  | 'path'
  | 'travel'
  | 'satin'
  | 'fill'
  | 'underlay'
  | 'hoop'
  | 'machine'
  | 'material';

export type PhysicsEvidence =
  'hard-limit' | 'machine-profile' | 'engine-derived' | 'heuristic' | 'experimental';

export type PhysicsMeasurementUnit =
  'mm' | 'mm²' | 'layers' | 'penetrations' | 'stitches' | 'jumps' | 'degrees' | 'percent';

export interface PhysicsMeasurement {
  label: string;
  value: number;
  unit: PhysicsMeasurementUnit;
  threshold?: number;
  comparison?: 'above' | 'below' | 'outside';
}

export interface PhysicsSourceLocation {
  line: number;
  startColumn?: number;
  endColumn?: number;
  role: 'primary' | 'contributor' | 'related';
}

export interface PhysicsPlaybackRange {
  /** Zero-based index in RunResult's stitch/jump playback stream, inclusive. */
  start: number;
  /** Zero-based index in RunResult's stitch/jump playback stream, inclusive. */
  end: number;
}

export interface PhysicsSourceReason {
  kind: 'generated' | 'unavailable';
  explanation: string;
}

export interface PhysicsRemedy {
  id: string;
  title: string;
  description: string;
  kind: 'guidance' | 'source-edit' | 'context';
  documentationId?: string;
}

export interface PhysicsAssumption {
  key: string;
  label: string;
  value: string;
  source: 'default' | 'program' | 'run-options';
  effect: string;
}

export interface PhysicsDiagnostic {
  id: string;
  fingerprint: string;
  code: string;
  category: PhysicsDiagnosticCategory;
  severity: PreflightSeverity;
  evidence: PhysicsEvidence;
  title: string;
  explanation: string;
  /** Calculation and threshold provenance for expanded diagnostic details. */
  methodology?: string;
  /** Known reasons the modeled finding may not predict a physical failure. */
  limitations?: string[];
  /** Explicit upper bound on work performed by this detector. */
  performanceCap?: string;
  measurements?: PhysicsMeasurement[];
  sourceLocations: PhysicsSourceLocation[];
  /** Present only when no source location can honestly be assigned. */
  sourceReason?: PhysicsSourceReason;
  geometry: DiagnosticGeometry[];
  playbackRanges: PhysicsPlaybackRange[];
  constructionIds?: number[];
  remedies: PhysicsRemedy[];
  documentationId?: string;
}

export interface PhysicsReport {
  version: number;
  diagnostics: PhysicsDiagnostic[];
  assumptions: PhysicsAssumption[];
  summary: Record<PreflightSeverity, number>;
  profile: ResolvedMachineProfile;
  material: MaterialIntent;
  policy: PreflightMode;
}

/** Caller-selected diagnostic breadth. Source preflight policy remains independent. */
export type PhysicsAnalysisMode = 'preflight' | 'full';

export interface PhysicsDiagnosticCounts extends Record<PreflightSeverity, number> {
  total: number;
}

/** Physical hoop and derived sewable field, as configured by the `hoop` command. */
export interface HoopInfo {
  shape: 'circle' | 'oval' | 'rectangle';
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

export interface ReferenceDataVar {
  name: string;
  declarationLine?: number;
  display: string;
  environment: Array<{ name: string; value: string }>;
}

/**
 * Resolved source-level material choices for a run. These values describe the
 * author's intent. Grain/stretch also feed opt-in directional satin/fill
 * construction; legacy `fabric` settings retain their scalar geometry.
 */
export interface MaterialIntent {
  fabricPreset: string;
  /** Turtle heading of the fabric grain: 0 = up/north, clockwise positive. */
  grainHeading: number;
  /** Declared fractional stretch parallel to the grain, from 0 to 1. */
  stretchAlong: number;
  /** Declared fractional stretch perpendicular to the grain, from 0 to 1. */
  stretchAcross: number;
  threadProfile: string;
  threadWidthMM: number;
  /** Metric needle size (NM), when explicitly selected. */
  needleSize?: number;
  stabilizer?: string;
  topping: boolean;
}

/** A signed symmetric 2D compensation tensor in hoop-space millimetres. */
export interface CompensationTensor {
  xx: number;
  xy: number;
  yy: number;
}

/** Signed tensor projections onto the heading axis and its clockwise perpendicular. */
export interface HeadingCompensationComponents {
  heading: number;
  alongStitchMM: number;
  acrossStitchMM: number;
}

/** Material-derived directional recommendations before construction-specific application. */
export interface ResolvedDirectionalCompensation {
  grainHeading: number;
  pullAlongGrainMM: number;
  pullAcrossGrainMM: number;
  /** Push is a negative adjustment (shortening) when non-zero. */
  pushAlongGrainMM: number;
  /** Push is a negative adjustment (shortening) when non-zero. */
  pushAcrossGrainMM: number;
  pullTensor: CompensationTensor;
  pushTensor: CompensationTensor;
}

export interface DirectionalCompensationSample {
  axis: 'grain' | 'cross-grain';
  heading: number;
  scalarPullMM: number;
  pull: HeadingCompensationComponents;
  push: HeadingCompensationComponents;
  pullDeltaAlongStitchMM: number;
  pullDeltaAcrossStitchMM: number;
}

/** Resolved comparison plus the compensation mode active at the end of the run. */
export interface DirectionalCompensationPreview {
  appliedMode: 'legacy-scalar' | 'directional-satin';
  /** Fill endpoint policy active at the end of the run. */
  fillEndpointMode: 'legacy-scalar' | 'directional-open-path';
  currentScalarPullMM: number;
  pullMagnitudeSource: 'fabric-profile' | 'explicit-pullcomp' | 'none';
  resolved: ResolvedDirectionalCompensation;
  samples: DirectionalCompensationSample[];
}

export interface RunResult {
  events: StitchEvent[];
  warnings: string[];
  warningLocations?: WarningLocation[];
  /** Structured counterparts for locatable physical-sewability warnings. */
  preflight?: PreflightResult;
  /** Versioned semantic diagnostics; absent only when produced by an older implementation. */
  physics?: PhysicsReport;
  printed: string[];
  locks: number;
  density: DensityResult;
  /** Resolved material/thread intent after all source-order overrides. */
  material: MaterialIntent;
  /** Directional recommendation and active-mode diagnostic used by opt-in satin/fill construction. */
  compensation: DirectionalCompensationPreview;
  /** Complete local machine configuration applied to this result. */
  machineProfile: ResolvedMachineProfile;
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
  /** Inspectable final top-level references and their immutable environments. */
  referenceVars?: ReferenceDataVar[];
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

/** Optional metadata for exporters whose container format can retain it. */
export interface ExportMetadata {
  machineProfile?: ResolvedMachineProfile;
}

export interface TravelPlanStats {
  planMode: string;
  travelBeforeMm: number;
  travelAfterMm: number;
  runs: number;
  colors: number;
  groups?: TravelPlanGroupStats[];
}

export interface TravelPlanGroupStats {
  id: number;
  line?: number;
  eligibleRuns: number;
  movedRuns: number;
  improvementSwaps: number;
  travelBeforeMm: number;
  travelAfterMm: number;
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
  | { k: 'stitchscope'; body: ASTNode[]; line: number }
  | { k: 'atomic'; body: ASTNode[]; line: number }
  | { k: 'routegroup'; body: ASTNode[]; line: number }
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
      dirExpr: ExprNode | null;
      shapeExpr: ExprNode | null;
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
  | {
      k: 'procref';
      name: string;
      minArity: number;
      maxArity: number;
      captureNames?: string[];
      line: number;
    }
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
  /** Thread-width approximation used to convert path length into coverage layers. */
  threadWidthMM: number;
  cells: DensityCell[];
  peak: number; // highest thread coverage, in layers
  hotspots: DensityHotspot[];
}

// ---------- Run options ----------

export interface RunOptions {
  seed?: number;
  /** Explicit caller-local constraints and calibration; never sourced from the program text. */
  machineProfile?: MachineProfile;
  /** Diagnostic breadth only; does not alter source-selected preflight policy or stitch events. */
  physicsAnalysis?: PhysicsAnalysisMode;
  /** Optional synchronous timing sink for profiling the language pipeline. */
  onTiming?: (timings: RunTimings) => void;
}

export interface RunTimings {
  tokenizeMs: number;
  parseMs: number;
  executeMs: number;
  /** Time spent selecting, running, and adapting physics diagnostics. */
  analysisMs: number;
  /** Counts from the returned PhysicsReport, at the selected analysis breadth. */
  diagnosticCounts: PhysicsDiagnosticCounts;
}
