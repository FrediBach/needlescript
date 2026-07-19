// ---------- Stitch machine core ----------

import { LIMITS, STOCK_LIMITS, OVERRIDE_CEILINGS } from './limits.ts';
import type {
  StitchEvent,
  EventType,
  HoopInfo,
  MaterialIntent,
  WarningLocation,
} from '../types.ts';
import { NeedlescriptError } from '../errors.ts';
import { IDENTITY, apply, linApply, compose } from '../affine.ts';
import type { Mat } from '../affine.ts';
import { DensityGrid } from '../postprocess.ts';
import type { DeclumpState } from '../declump.ts';
import { declumpFoldPoint, declumpResetRun } from '../declump.ts';
import { DEFAULT_HOOP_INFO, inHoopField, inHoopOuter } from '../hoop-presets.ts';
import {
  cloneFillUnderlayCustomization,
  cloneSatinUnderlayCustomization,
} from '../underlay-profile.ts';
import type { FillUnderlayCustomization, SatinUnderlayCustomization } from '../underlay-profile.ts';
import { FILL_CONSTRUCTION_RANGES } from '../fill-profile.ts';
import type { FillConnectMode, FillConnectorRecord, FillStaggerMode } from '../fill-profile.ts';
import { SATIN_CONSTRUCTION_RANGES } from '../satin-profile.ts';
import type { SatinCapMode, SatinJoinMode, SatinWideMode } from '../satin-profile.ts';
import { DEFAULT_MATERIAL_INTENT } from '../embroidery-registry.ts';
import type { CompensationMode } from '../embroidery-registry.ts';
import type {
  ConstructionLayer,
  ConstructionRecord,
  FillConstructionRecord,
  SatinConstructionRecord,
} from '../construction-metadata.ts';

/**
 * One entry of the pre-split output stack: either an affine transform delta
 * or a nonlinear warp (a point→point reporter). Transforms collapse, warps
 * don't, so the stack is kept explicit — but with no warp active it is exactly
 * a single affine matrix and the fast path below stays byte-identical to the
 * pre-effects engine.
 */
type OutLayer =
  { kind: 'aff'; m: Mat } | { kind: 'warp'; fn: (x: number, y: number) => [number, number] };

type StitchLengthReporter = (t: number, s: number, i: number, p: [number, number]) => number;
type SatinReporter = (
  t: number,
  s: number,
  i: number,
  u: number,
) => [number, number, number, number, number];
type FillLengthReporter = StitchLengthReporter;
type FillDirectionReporter = (px: number, py: number) => number;
type FillShapeReporter = (
  px: number,
  py: number,
  row: number,
  v: number,
) => [number, number, number];
type FillPathsReporter = (rings: [number, number][][]) => [number, number][][];

/**
 * Construction settings saved by `snapshotConstructionConfig()`.
 *
 * Reporter functions intentionally retain identity. Mutable length patterns and
 * static fill paths are copied both into and out of the snapshot.
 */
export interface ConstructionConfigSnapshot {
  readonly stitchLen: number;
  readonly stitchLenList: readonly number[] | null;
  readonly stitchLenListPhase: number;
  readonly stitchLenStretchIndex: number;
  readonly stitchLenStretchStart: boolean;
  readonly stitchLenReporter: StitchLengthReporter | null;
  readonly mode: 'run' | 'satin' | 'estitch';
  readonly beanRepeats: number;
  readonly eWidth: number;
  readonly satinWidth: number;
  readonly satinSpacing: number;
  readonly satinSide: number;
  readonly satinReporter: SatinReporter | null;
  readonly satinCapStart: SatinCapMode;
  readonly satinCapEnd: SatinCapMode;
  readonly satinCapLength: number;
  readonly satinJoin: SatinJoinMode;
  readonly satinCornerAngle: number;
  readonly satinWide: SatinWideMode;
  readonly satinMaxWidth: number;
  readonly satinSplitOverlap: number;
  readonly fillAngle: number;
  readonly fillSpacing: number;
  readonly fillInset: number;
  readonly fillEdgeRun: number;
  readonly fillEdgeShort: number;
  readonly fillStagger: FillStaggerMode;
  readonly fillStaggerAmount: number;
  readonly fillConnect: FillConnectMode;
  readonly fillLen: number | null;
  readonly fillLenList: readonly number[] | null;
  readonly fillLenListPhase: number;
  readonly fillLenReporter: FillLengthReporter | null;
  readonly lockLen: number;
  readonly pullComp: number;
  readonly pullCompExplicit: boolean;
  readonly compensationMode: CompensationMode;
  readonly underlayMode: 'off' | 'auto' | 'center' | 'edge' | 'zigzag';
  readonly satinUnderlayCustomization: SatinUnderlayCustomization | null;
  readonly fillUnderlayMode: 'off' | 'auto' | 'tatami' | 'edge';
  readonly fillUnderlayCustomization: FillUnderlayCustomization | null;
  readonly doubleUnderlay: boolean;
  readonly shortStitch: boolean;
  readonly autoTrim: number;
  readonly maxDensity: number;
  readonly materialIntent: Readonly<MaterialIntent>;
  readonly fillArmed: boolean;
  readonly fillDirReporter: FillDirectionReporter | null;
  readonly fillShapeReporter: FillShapeReporter | null;
  readonly fillPathsReporter: FillPathsReporter | null;
  readonly fillPathsStatic: readonly (readonly (readonly [number, number])[])[] | null;
  readonly fillArmLine: number | undefined;
  readonly fillPathsName: string | null;
}

/** Snapshot of all sandboxed machine state for trace (RFC-trace §4.1). */
interface MachineSnapshot {
  x: number;
  y: number;
  heading: number;
  penDown: boolean;
  stitchLen: number;
  // Extended stitchlen forms (list / reporter)
  stitchLenList: number[] | null;
  stitchLenListPhase: number;
  stitchLenStretchIndex: number;
  stitchLenStretchStart: boolean;
  stitchLenReporter: StitchLengthReporter | null;
  // Running-stitch buffer (reporter buffered mode)
  runBuffer: { x: number; y: number }[] | null;
  runBufferCTM: Mat;
  runBufferLayers: OutLayer[];
  runBufferHasWarp: boolean;
  mode: 'run' | 'satin' | 'estitch';
  satinWidth: number;
  satinSpacing: number;
  satinSide: number;
  satinCapStart: SatinCapMode;
  satinCapEnd: SatinCapMode;
  satinCapLength: number;
  satinJoin: SatinJoinMode;
  satinCornerAngle: number;
  satinWide: SatinWideMode;
  satinMaxWidth: number;
  satinSplitOverlap: number;
  eWidth: number;
  beanRepeats: number;
  fillAngle: number;
  fillSpacing: number;
  fillInset: number;
  fillEdgeRun: number;
  fillEdgeShort: number;
  fillStagger: FillStaggerMode;
  fillStaggerAmount: number;
  fillConnect: FillConnectMode;
  fillLen: number | null;
  // Extended filllen forms (list / reporter)
  fillLenList: number[] | null;
  fillLenListPhase: number;
  fillLenReporter: FillLengthReporter | null;
  lockLen: number;
  pullComp: number;
  pullCompExplicit: boolean;
  compensationMode: CompensationMode;
  underlayMode: 'off' | 'auto' | 'center' | 'edge' | 'zigzag';
  satinUnderlayCustomization: SatinUnderlayCustomization | null;
  fillUnderlayMode: 'off' | 'auto' | 'tatami' | 'edge';
  fillUnderlayCustomization: FillUnderlayCustomization | null;
  doubleUnderlay: boolean;
  shortStitch: boolean;
  autoTrim: number;
  maxDensity: number;
  materialIntent: MaterialIntent;
  colorIdx: number;
  eventsLen: number;
  lastEmit: { x: number; y: number } | null;
  started: boolean;
  satinPath: { x: number; y: number }[] | null;
  satinReporter: SatinReporter | null;
  satinDensityNoted: boolean;
  satinCTM: Mat;
  satinLayers: OutLayer[];
  satinHasWarp: boolean;
  recording: boolean;
  rings: [number, number][][];
  curRing: [number, number][] | null;
  fillArmed: boolean;
  fillDirReporter: FillDirectionReporter | null;
  fillShapeReporter: FillShapeReporter | null;
  fillPathsReporter: FillPathsReporter | null;
  fillPathsStatic: [number, number][][] | null;
  fillArmLine: number | undefined;
  fillPathsName: string | null;
  fillCTM: Mat;
  fillLayers: OutLayer[];
  fillHasWarp: boolean;
  localRings: [number, number][][];
  curLocalRing: [number, number][] | null;
  ctm: Mat;
  outLayers: OutLayer[];
  hasWarp: boolean;
  outSnapLen: number;
  penLayers: ((x: number, y: number) => [number, number])[];
  stateStack: { x: number; y: number; heading: number; penDown: boolean }[];
  tinyDropped: number;
  tinyDroppedSpotsLen: number;
  noEmit: boolean;
  _warnedSatinEffect: boolean;
  // Declump stack state (for trace sandbox restoration)
  declumpStack: DeclumpState[];
  // Trace recording state (for nesting)
  traceRecording: boolean;
  traceRuns: [number, number][][];
  traceCurRun: [number, number][] | null;
  traceVertexCount: number;
}

export abstract class MachineCore {
  x = 0;
  y = 0;
  heading = 0;
  penDown = true;
  stitchLen = 2.5;
  // Extended stitchlen forms (list / reporter). Exactly one of stitchLenList /
  // stitchLenReporter / numeric (stitchLen) is active at a time.
  stitchLenList: number[] | null = null; // cycling length pattern; null = numeric or reporter
  stitchLenListPhase: number = 0; // start index offset for the list form
  stitchLenStretchIndex: number = 0; // cycling index within current stretch (list form)
  stitchLenStretchStart: boolean = true; // true = reset index on next pen-down move
  stitchLenReporter: StitchLengthReporter | null = null; // per-stitch reporter; null = numeric/list form
  // Running-stitch buffer for the reporter form. When non-null, travel() appends
  // spine points here and defers splitting until flushRunningStitch() is called.
  runBuffer: { x: number; y: number }[] | null = null;
  runBufferCTM: Mat = IDENTITY; // transform snapshot taken at buffer start
  runBufferLayers: OutLayer[] = []; // warp-layer snapshot
  runBufferHasWarp: boolean = false;
  mode: 'run' | 'satin' | 'estitch' = 'run';
  satinWidth = 0;
  satinSpacing = 0.4;
  satinSide = 1;
  satinCapStart: SatinCapMode = 'legacy';
  satinCapEnd: SatinCapMode = 'legacy';
  satinCapLength: number = SATIN_CONSTRUCTION_RANGES.capLengthMM.default;
  satinJoin: SatinJoinMode = 'legacy';
  satinCornerAngle: number = SATIN_CONSTRUCTION_RANGES.cornerAngleDeg.default;
  satinWide: SatinWideMode = 'warn';
  satinMaxWidth: number = SATIN_CONSTRUCTION_RANGES.maxWidthMM.default;
  satinSplitOverlap: number = SATIN_CONSTRUCTION_RANGES.splitOverlapMM.default;
  eWidth = 0;
  beanRepeats = 1;
  fillAngle = 0;
  fillSpacing = 0.4;
  fillInset = 0;
  fillEdgeRun: number = FILL_CONSTRUCTION_RANGES.edgeRunInsetMM.default;
  fillEdgeShort: number = FILL_CONSTRUCTION_RANGES.edgeShortMM.default;
  fillStagger: FillStaggerMode = 'legacy';
  fillStaggerAmount: number = FILL_CONSTRUCTION_RANGES.staggerAmount.default;
  fillConnect: FillConnectMode = 'legacy';
  fillLen: number | null = null;
  // Extended filllen forms (list / reporter). Exactly one active at a time.
  fillLenList: number[] | null = null; // cycling length pattern for fill rows
  fillLenListPhase: number = 0; // start index offset for the list form
  fillLenReporter: FillLengthReporter | null = null; // per-stitch reporter for fill rows
  lockLen = 0.7;
  pullComp = 0; // pull compensation in mm
  pullCompExplicit = false;
  compensationMode: CompensationMode = 'legacy';
  underlayMode: 'off' | 'auto' | 'center' | 'edge' | 'zigzag' = 'off';
  satinUnderlayCustomization: SatinUnderlayCustomization | null = null;
  fillUnderlayMode: 'off' | 'auto' | 'tatami' | 'edge' = 'off';
  fillUnderlayCustomization: FillUnderlayCustomization | null = null;
  doubleUnderlay = false; // fleece: stack center + zigzag passes
  shortStitch = true; // auto short-stitch on tight satin curves
  autoTrim = 7; // insert trim before jumps ≥ this (0 = off)
  maxDensity = 3.5; // coverage warning threshold, in layers of thread
  materialIntent: MaterialIntent = { ...DEFAULT_MATERIAL_INTENT };
  satinPath: { x: number; y: number }[] | null = null; // buffered satin column
  // Programmable satin (`satin @fn`): a user shape reporter that supersedes the
  // built-in generator, queried once per stitch pair at flush time. null = the
  // built-in numeric generator. Set/cleared by the `satin`/`estitch` commands.
  satinReporter: SatinReporter | null = null;
  satinDensityNoted = false; // one-time "density ignored under satin @fn" note
  // Programmable fill (`fill dir @d shape @s`): user reporters that supersede the
  // built-in tatami generator for the next beginfill…endfill (§2/§3). null = the
  // built-in scanline generator. The direction reporter returns a turtle heading
  // (local space); the shape reporter returns [spacing, len, phase]. Both are
  // queried at endfill, inside _generateProgrammableFill — the generator itself
  // is drawless (§10), so determinism rides on the reporters' own sampling.
  fillArmed = false;
  fillDirReporter: FillDirectionReporter | null = null;
  fillShapeReporter: FillShapeReporter | null = null;
  fillPathsReporter: FillPathsReporter | null = null;
  fillPathsStatic: [number, number][][] | null = null;
  fillArmLine: number | undefined = undefined;
  fillPathsName: string | null = null;
  // Snapshot of the output stack captured at beginfill while armed, so the
  // region/field compose with transforms (reporters see local; placement maps
  // through this affine CTM; warp deforms emitted penetrations downstream).
  fillCTM: Mat = IDENTITY;
  fillLayers: OutLayer[] = [];
  fillHasWarp = false;
  // Armed fills record their boundary rings in LOCAL space (the non-armed path
  // keeps recording in hoop space, untouched).
  localRings: [number, number][][] = [];
  curLocalRing: [number, number][] | null = null;
  recording = false;
  rings: [number, number][][] = [];
  curRing: [number, number][] | null = null;
  lastEmit: { x: number; y: number } | null = null;
  colorIdx = 0;
  events: StitchEvent[] = [];
  warnings: string[] = [];
  constructionWarningLocations: WarningLocation[] = [];
  /** Internal-only fill-connector sidecar consumed by construction-aware preflight. */
  protected fillConnectorRecords: FillConnectorRecord[] = [];
  /** Internal-only explicit construction identities and boundaries. */
  constructionRecords: ConstructionRecord[] = [];
  protected activeConstruction: ConstructionRecord | null = null;
  protected activeConstructionLayer: ConstructionLayer = 'topping';
  protected activeConstructionLane: number | undefined = undefined;
  protected constructionNextId = 1;
  started = false;
  tinyDropped = 0;
  // Locations of the first few merged sub-minimum moves, so the warning can be
  // pointed to in the preview / playback bar. Capped to keep memory bounded.
  tinyDroppedSpots: { x: number; y: number; line?: number }[] = [];
  currentLine: number | undefined = undefined; // source line being executed
  stateStack: { x: number; y: number; heading: number; penDown: boolean }[] = [];

  // Hoop and field configuration (set by the `hoop` command, §hoop).
  hoopInfo: HoopInfo = DEFAULT_HOOP_INFO;
  hoopSet = false;
  hoopSetLine: number | undefined = undefined;
  // Locked when any generator (scatter/voronoi/relax) runs with the implicit
  // field domain, so a subsequent `hoop` call produces a clear error.
  fieldLocked = false;
  // Overflow tracking: stitches outside the sewable field or hoop boundary.
  // Capped at 50 to bound memory; only 'stitch' events are checked.
  fieldOverflows: { x: number; y: number; line?: number; kind: 'field' | 'hoop' }[] = [];

  // Per-run budget limits — start as a mutable copy of STOCK_LIMITS and can be
  // raised (with a warning) or lowered (with an info note) by the `override`
  // command (§override).
  effectiveLimits: { -readonly [K in keyof typeof STOCK_LIMITS]: number } = { ...STOCK_LIMITS };
  // Active overrides keyed by OverrideKey string; value is {value, line}.
  activeOverrides: Map<string, { value: number; line: number }> = new Map();
  // Live coverage / penetration index, fed in sewing order from _push and read
  // by the history queries (coverat/countat/nearestsewn/sewnwithin/
  // stitchedpoints). Finalized at program end for the heatmap — one grid, so a
  // query always reports the same number the heatmap shows. Buffered satin /
  // fills aren't here until flushed (committed-only); locks are added later and
  // never fed, so tie-offs don't read as crowding.
  density = new DensityGrid(1, this.materialIntent.threadWidthMM);
  usedQuery = false; // a history query ran — used to make limit errors loop-aware
  // Trace recording state (RFC-trace §4): captures the pre-split turtle path
  // as data. When traceRecording is true, travel() records the spine instead
  // of emitting stitches, and _push() is a no-op (noEmit).
  traceRecording = false;
  traceRuns: [number, number][][] = [];
  traceCurRun: [number, number][] | null = null;
  traceVertexCount = 0;
  noEmit = false;

  // The pre-split output map: transforms (CTM) and `warp` effects share one
  // block-scoped stack, applied to emitted geometry *before* stitch-length
  // splitting and the physics layer ("transform the path, then stitch it").
  // `ctm` is the collapsed affine of all transform layers (warps ignored); it
  // drives satin width and is the fast path when no warp is active, keeping
  // non-warp output byte-identical. The turtle (x/y/heading) is always local.
  ctm: Mat = IDENTITY;
  outLayers: OutLayer[] = [];
  hasWarp = false;
  private outSnap: { ctm: Mat; hasWarp: boolean }[] = [];
  // After-split penetration maps (`humanize` / `snaptogrid`): applied to each
  // final penetration point, after splitting, before the physics layer.
  penLayers: ((x: number, y: number) => [number, number])[] = [];
  // Declump stack: stateful along-axis fold layers. Kept separate from penLayers
  // because the fold is stateful, needs lookahead, and requires the full split-point
  // sequence to be pre-computed before emission (see travel()).
  declumpStack: DeclumpState[] = [];
  // Snapshot of the output stack taken when the current satin column began. A
  // column is always flushed at stack boundaries, so it lives under one map.
  satinCTM: Mat = IDENTITY;
  satinLayers: OutLayer[] = [];
  satinHasWarp = false;
  protected _warnedSatinEffect = false;

  /** Flush buffered satin or reporter-mode running stitches at motion boundaries. */
  abstract flushSatin(): void;

  /**
   * Snapshot only stitch-construction configuration for a future scoped restore.
   * Active fill recording cannot cross a configuration boundary. A buffered
   * satin column or reporter-driven running stretch is committed first so it is
   * generated wholly under the configuration that created it.
   */
  snapshotConstructionConfig(): ConstructionConfigSnapshot {
    if (this.recording)
      throw new NeedlescriptError(
        'cannot snapshot construction configuration during an active fill — close it with endfill first',
      );
    if (this.runBuffer !== null || this.satinPath !== null) this.flushSatin();

    return {
      stitchLen: this.stitchLen,
      stitchLenList: this.stitchLenList?.slice() ?? null,
      stitchLenListPhase: this.stitchLenListPhase,
      stitchLenStretchIndex: this.stitchLenStretchIndex,
      stitchLenStretchStart: this.stitchLenStretchStart,
      stitchLenReporter: this.stitchLenReporter,
      mode: this.mode,
      beanRepeats: this.beanRepeats,
      eWidth: this.eWidth,
      satinWidth: this.satinWidth,
      satinSpacing: this.satinSpacing,
      satinSide: this.satinSide,
      satinReporter: this.satinReporter,
      satinCapStart: this.satinCapStart,
      satinCapEnd: this.satinCapEnd,
      satinCapLength: this.satinCapLength,
      satinJoin: this.satinJoin,
      satinCornerAngle: this.satinCornerAngle,
      satinWide: this.satinWide,
      satinMaxWidth: this.satinMaxWidth,
      satinSplitOverlap: this.satinSplitOverlap,
      fillAngle: this.fillAngle,
      fillSpacing: this.fillSpacing,
      fillInset: this.fillInset,
      fillEdgeRun: this.fillEdgeRun,
      fillEdgeShort: this.fillEdgeShort,
      fillStagger: this.fillStagger,
      fillStaggerAmount: this.fillStaggerAmount,
      fillConnect: this.fillConnect,
      fillLen: this.fillLen,
      fillLenList: this.fillLenList?.slice() ?? null,
      fillLenListPhase: this.fillLenListPhase,
      fillLenReporter: this.fillLenReporter,
      lockLen: this.lockLen,
      pullComp: this.pullComp,
      pullCompExplicit: this.pullCompExplicit,
      compensationMode: this.compensationMode,
      underlayMode: this.underlayMode,
      satinUnderlayCustomization: cloneSatinUnderlayCustomization(this.satinUnderlayCustomization),
      fillUnderlayMode: this.fillUnderlayMode,
      fillUnderlayCustomization: cloneFillUnderlayCustomization(this.fillUnderlayCustomization),
      doubleUnderlay: this.doubleUnderlay,
      shortStitch: this.shortStitch,
      autoTrim: this.autoTrim,
      maxDensity: this.maxDensity,
      materialIntent: { ...this.materialIntent },
      fillArmed: this.fillArmed,
      fillDirReporter: this.fillDirReporter,
      fillShapeReporter: this.fillShapeReporter,
      fillPathsReporter: this.fillPathsReporter,
      fillPathsStatic:
        this.fillPathsStatic?.map((path) => path.map((point) => [point[0], point[1]])) ?? null,
      fillArmLine: this.fillArmLine,
      fillPathsName: this.fillPathsName,
    };
  }

  /** Restore a construction snapshot without rewinding turtle or output state. */
  restoreConstructionConfig(snapshot: ConstructionConfigSnapshot): void {
    if (this.recording)
      throw new NeedlescriptError(
        'cannot restore construction configuration during an active fill — close it with endfill first',
      );
    try {
      if (this.runBuffer !== null || this.satinPath !== null) this.flushSatin();
    } finally {
      this.stitchLen = snapshot.stitchLen;
      this.stitchLenList = snapshot.stitchLenList?.slice() ?? null;
      this.stitchLenListPhase = snapshot.stitchLenListPhase;
      this.stitchLenStretchIndex = snapshot.stitchLenStretchIndex;
      this.stitchLenStretchStart = snapshot.stitchLenStretchStart;
      this.stitchLenReporter = snapshot.stitchLenReporter;
      this.mode = snapshot.mode;
      this.beanRepeats = snapshot.beanRepeats;
      this.eWidth = snapshot.eWidth;
      this.satinWidth = snapshot.satinWidth;
      this.satinSpacing = snapshot.satinSpacing;
      this.satinSide = snapshot.satinSide;
      this.satinReporter = snapshot.satinReporter;
      this.satinCapStart = snapshot.satinCapStart;
      this.satinCapEnd = snapshot.satinCapEnd;
      this.satinCapLength = snapshot.satinCapLength;
      this.satinJoin = snapshot.satinJoin;
      this.satinCornerAngle = snapshot.satinCornerAngle;
      this.satinWide = snapshot.satinWide;
      this.satinMaxWidth = snapshot.satinMaxWidth;
      this.satinSplitOverlap = snapshot.satinSplitOverlap;
      this.fillAngle = snapshot.fillAngle;
      this.fillSpacing = snapshot.fillSpacing;
      this.fillInset = snapshot.fillInset;
      this.fillEdgeRun = snapshot.fillEdgeRun;
      this.fillEdgeShort = snapshot.fillEdgeShort;
      this.fillStagger = snapshot.fillStagger;
      this.fillStaggerAmount = snapshot.fillStaggerAmount;
      this.fillConnect = snapshot.fillConnect;
      this.fillLen = snapshot.fillLen;
      this.fillLenList = snapshot.fillLenList?.slice() ?? null;
      this.fillLenListPhase = snapshot.fillLenListPhase;
      this.fillLenReporter = snapshot.fillLenReporter;
      this.lockLen = snapshot.lockLen;
      this.pullComp = snapshot.pullComp;
      this.pullCompExplicit = snapshot.pullCompExplicit;
      this.compensationMode = snapshot.compensationMode;
      this.underlayMode = snapshot.underlayMode;
      this.satinUnderlayCustomization = cloneSatinUnderlayCustomization(
        snapshot.satinUnderlayCustomization,
      );
      this.fillUnderlayMode = snapshot.fillUnderlayMode;
      this.fillUnderlayCustomization = cloneFillUnderlayCustomization(
        snapshot.fillUnderlayCustomization,
      );
      this.doubleUnderlay = snapshot.doubleUnderlay;
      this.shortStitch = snapshot.shortStitch;
      this.autoTrim = snapshot.autoTrim;
      this.maxDensity = snapshot.maxDensity;
      this.materialIntent = { ...snapshot.materialIntent };
      this.density.setThreadWidthMM(this.materialIntent.threadWidthMM);
      this.fillArmed = snapshot.fillArmed;
      this.fillDirReporter = snapshot.fillDirReporter;
      this.fillShapeReporter = snapshot.fillShapeReporter;
      this.fillPathsReporter = snapshot.fillPathsReporter;
      this.fillPathsStatic =
        snapshot.fillPathsStatic?.map((path) => path.map((point) => [point[0], point[1]])) ?? null;
      this.fillArmLine = snapshot.fillArmLine;
      this.fillPathsName = snapshot.fillPathsName;
    }
  }

  /** Push an affine transform delta (translate/rotate/scale/…) onto the stack. */
  pushTransform(delta: Mat) {
    this.outSnap.push({ ctm: this.ctm, hasWarp: this.hasWarp });
    this.outLayers.push({ kind: 'aff', m: delta });
    this.ctm = compose(this.ctm, delta);
  }

  /** Push a nonlinear warp (point→point reporter) onto the stack. */
  pushWarp(fn: (x: number, y: number) => [number, number]) {
    this.outSnap.push({ ctm: this.ctm, hasWarp: this.hasWarp });
    this.outLayers.push({ kind: 'warp', fn });
    this.hasWarp = true;
  }

  /** Pop the innermost transform or warp layer, restoring the prior state. */
  popOut() {
    this.outLayers.pop();
    const s = this.outSnap.pop();
    if (s) {
      this.ctm = s.ctm;
      this.hasWarp = s.hasWarp;
    } else {
      this.ctm = IDENTITY;
      this.hasWarp = false;
    }
  }

  /** Push / pop an after-split penetration effect (humanize / snaptogrid). */
  pushPen(fn: (x: number, y: number) => [number, number]) {
    this.penLayers.push(fn);
  }
  popPen() {
    this.penLayers.pop();
  }

  /** Push / pop a stateful declump fold layer. */
  pushDeclump(state: DeclumpState) {
    this.declumpStack.push(state);
  }
  popDeclump() {
    this.declumpStack.pop();
  }

  // ── Trace sandbox (RFC-trace §4.1) ──────────────────────────────────────
  //
  // snapshotForTrace() captures every piece of machine state that the sandbox
  // must restore on exit.  setupTraceSandbox() then puts the machine into
  // recording mode with a clean coordinate frame.  restoreFromTrace() winds
  // everything back.  warnings are deliberately NOT snapshotted — one-time
  // notes and user-generated warnings escape the sandbox (§4.1).

  /** Opaque snapshot of all sandboxed machine state. */
  snapshotForTrace(): MachineSnapshot {
    return {
      // Turtle
      x: this.x,
      y: this.y,
      heading: this.heading,
      penDown: this.penDown,
      // Stitch configuration
      stitchLen: this.stitchLen,
      stitchLenList: this.stitchLenList ? this.stitchLenList.slice() : null,
      stitchLenListPhase: this.stitchLenListPhase,
      stitchLenStretchIndex: this.stitchLenStretchIndex,
      stitchLenStretchStart: this.stitchLenStretchStart,
      stitchLenReporter: this.stitchLenReporter,
      runBuffer: this.runBuffer ? this.runBuffer.slice() : null,
      runBufferCTM: this.runBufferCTM,
      runBufferLayers: this.runBufferLayers.slice(),
      runBufferHasWarp: this.runBufferHasWarp,
      mode: this.mode,
      satinWidth: this.satinWidth,
      satinSpacing: this.satinSpacing,
      satinSide: this.satinSide,
      satinCapStart: this.satinCapStart,
      satinCapEnd: this.satinCapEnd,
      satinCapLength: this.satinCapLength,
      satinJoin: this.satinJoin,
      satinCornerAngle: this.satinCornerAngle,
      satinWide: this.satinWide,
      satinMaxWidth: this.satinMaxWidth,
      satinSplitOverlap: this.satinSplitOverlap,
      eWidth: this.eWidth,
      beanRepeats: this.beanRepeats,
      fillAngle: this.fillAngle,
      fillSpacing: this.fillSpacing,
      fillInset: this.fillInset,
      fillEdgeRun: this.fillEdgeRun,
      fillEdgeShort: this.fillEdgeShort,
      fillStagger: this.fillStagger,
      fillStaggerAmount: this.fillStaggerAmount,
      fillConnect: this.fillConnect,
      fillLen: this.fillLen,
      fillLenList: this.fillLenList ? this.fillLenList.slice() : null,
      fillLenListPhase: this.fillLenListPhase,
      fillLenReporter: this.fillLenReporter,
      lockLen: this.lockLen,
      pullComp: this.pullComp,
      pullCompExplicit: this.pullCompExplicit,
      compensationMode: this.compensationMode,
      underlayMode: this.underlayMode,
      satinUnderlayCustomization: cloneSatinUnderlayCustomization(this.satinUnderlayCustomization),
      fillUnderlayMode: this.fillUnderlayMode,
      fillUnderlayCustomization: cloneFillUnderlayCustomization(this.fillUnderlayCustomization),
      doubleUnderlay: this.doubleUnderlay,
      shortStitch: this.shortStitch,
      autoTrim: this.autoTrim,
      maxDensity: this.maxDensity,
      materialIntent: { ...this.materialIntent },
      colorIdx: this.colorIdx,
      // Emission
      eventsLen: this.events.length,
      lastEmit: this.lastEmit ? { x: this.lastEmit.x, y: this.lastEmit.y } : null,
      started: this.started,
      // Satin buffer
      satinPath: this.satinPath ? this.satinPath.slice() : null,
      satinReporter: this.satinReporter,
      satinDensityNoted: this.satinDensityNoted,
      satinCTM: this.satinCTM,
      satinLayers: this.satinLayers.slice(),
      satinHasWarp: this.satinHasWarp,
      // Fill recording
      recording: this.recording,
      rings: this.rings.slice(),
      curRing: this.curRing ? this.curRing.slice() : null,
      fillArmed: this.fillArmed,
      fillDirReporter: this.fillDirReporter,
      fillShapeReporter: this.fillShapeReporter,
      fillPathsReporter: this.fillPathsReporter,
      fillPathsStatic: this.fillPathsStatic?.map((path) => path.map((p) => [p[0], p[1]])) ?? null,
      fillArmLine: this.fillArmLine,
      fillPathsName: this.fillPathsName,
      fillCTM: this.fillCTM,
      fillLayers: this.fillLayers.slice(),
      fillHasWarp: this.fillHasWarp,
      localRings: this.localRings.slice(),
      curLocalRing: this.curLocalRing ? this.curLocalRing.slice() : null,
      // Transform/effect stacks
      ctm: this.ctm,
      outLayers: this.outLayers.slice(),
      hasWarp: this.hasWarp,
      outSnapLen: this.outSnap.length,
      penLayers: this.penLayers.slice(),
      // Other
      stateStack: this.stateStack.slice(),
      tinyDropped: this.tinyDropped,
      tinyDroppedSpotsLen: this.tinyDroppedSpots.length,
      noEmit: this.noEmit,
      _warnedSatinEffect: this._warnedSatinEffect,
      // Declump stack (for trace sandbox restoration)
      declumpStack: this.declumpStack.slice(),
      // Trace recording (for nesting)
      traceRecording: this.traceRecording,
      traceRuns: this.traceRuns.map((r) => r.slice()),
      traceCurRun: this.traceCurRun ? this.traceCurRun.slice() : null,
      traceVertexCount: this.traceVertexCount,
    };
  }

  /** Enter trace recording mode with a clean coordinate frame. */
  setupTraceSandbox() {
    // Reset coordinate frame to identity — captured points are relative to
    // the trace-entry frame (§4.4). Inner transforms rebuild from here.
    this.ctm = IDENTITY;
    this.outLayers = [];
    this.hasWarp = false;
    this.outSnap.length = 0;
    // Clear pen effects — humanize/snap/declump are post-split, inherently inert on
    // the pre-split capture. Clearing avoids any side-channel.
    this.penLayers = [];
    this.declumpStack = [];
    // Pen starts down regardless of ambient state (§4.2)
    this.penDown = true;
    // Suppress all stitch emission
    this.noEmit = true;
    // Initialize trace recorder
    this.traceRecording = true;
    this.traceRuns = [];
    this.traceCurRun = null;
    this.traceVertexCount = 0;
  }

  /** Finalize trace recording: close the last run, return captured runs. */
  endTrace(): [number, number][][] {
    this._closeTraceRun();
    this.traceRecording = false;
    return this.traceRuns;
  }

  /** Restore all sandboxed state from a prior snapshot. */
  restoreFromTrace(snap: MachineSnapshot) {
    // Turtle
    this.x = snap.x;
    this.y = snap.y;
    this.heading = snap.heading;
    this.penDown = snap.penDown;
    // Stitch configuration
    this.stitchLen = snap.stitchLen;
    this.stitchLenList = snap.stitchLenList ? snap.stitchLenList.slice() : null;
    this.stitchLenListPhase = snap.stitchLenListPhase;
    this.stitchLenStretchIndex = snap.stitchLenStretchIndex;
    this.stitchLenStretchStart = snap.stitchLenStretchStart;
    this.stitchLenReporter = snap.stitchLenReporter;
    this.runBuffer = snap.runBuffer ? snap.runBuffer.slice() : null;
    this.runBufferCTM = snap.runBufferCTM;
    this.runBufferLayers = snap.runBufferLayers.slice();
    this.runBufferHasWarp = snap.runBufferHasWarp;
    this.mode = snap.mode;
    this.satinWidth = snap.satinWidth;
    this.satinSpacing = snap.satinSpacing;
    this.satinSide = snap.satinSide;
    this.satinCapStart = snap.satinCapStart;
    this.satinCapEnd = snap.satinCapEnd;
    this.satinCapLength = snap.satinCapLength;
    this.satinJoin = snap.satinJoin;
    this.satinCornerAngle = snap.satinCornerAngle;
    this.satinWide = snap.satinWide;
    this.satinMaxWidth = snap.satinMaxWidth;
    this.satinSplitOverlap = snap.satinSplitOverlap;
    this.eWidth = snap.eWidth;
    this.beanRepeats = snap.beanRepeats;
    this.fillAngle = snap.fillAngle;
    this.fillSpacing = snap.fillSpacing;
    this.fillInset = snap.fillInset;
    this.fillEdgeRun = snap.fillEdgeRun;
    this.fillEdgeShort = snap.fillEdgeShort;
    this.fillStagger = snap.fillStagger;
    this.fillStaggerAmount = snap.fillStaggerAmount;
    this.fillConnect = snap.fillConnect;
    this.fillLen = snap.fillLen;
    this.fillLenList = snap.fillLenList ? snap.fillLenList.slice() : null;
    this.fillLenListPhase = snap.fillLenListPhase;
    this.fillLenReporter = snap.fillLenReporter;
    this.lockLen = snap.lockLen;
    this.pullComp = snap.pullComp;
    this.pullCompExplicit = snap.pullCompExplicit;
    this.compensationMode = snap.compensationMode;
    this.underlayMode = snap.underlayMode;
    this.satinUnderlayCustomization = cloneSatinUnderlayCustomization(
      snap.satinUnderlayCustomization,
    );
    this.fillUnderlayMode = snap.fillUnderlayMode;
    this.fillUnderlayCustomization = cloneFillUnderlayCustomization(snap.fillUnderlayCustomization);
    this.doubleUnderlay = snap.doubleUnderlay;
    this.shortStitch = snap.shortStitch;
    this.autoTrim = snap.autoTrim;
    this.maxDensity = snap.maxDensity;
    this.materialIntent = { ...snap.materialIntent };
    this.density.setThreadWidthMM(this.materialIntent.threadWidthMM);
    this.colorIdx = snap.colorIdx;
    // Emission — truncate events back; density was never fed (noEmit)
    this.events.length = snap.eventsLen;
    this.lastEmit = snap.lastEmit ? { x: snap.lastEmit.x, y: snap.lastEmit.y } : null;
    this.started = snap.started;
    // Satin buffer
    this.satinPath = snap.satinPath ? snap.satinPath.slice() : null;
    this.satinReporter = snap.satinReporter;
    this.satinDensityNoted = snap.satinDensityNoted;
    this.satinCTM = snap.satinCTM;
    this.satinLayers = snap.satinLayers.slice();
    this.satinHasWarp = snap.satinHasWarp;
    // Fill recording
    this.recording = snap.recording;
    this.rings = snap.rings.slice();
    this.curRing = snap.curRing ? snap.curRing.slice() : null;
    this.fillArmed = snap.fillArmed;
    this.fillDirReporter = snap.fillDirReporter;
    this.fillShapeReporter = snap.fillShapeReporter;
    this.fillPathsReporter = snap.fillPathsReporter;
    this.fillPathsStatic =
      snap.fillPathsStatic?.map((path) => path.map((p) => [p[0], p[1]])) ?? null;
    this.fillArmLine = snap.fillArmLine;
    this.fillPathsName = snap.fillPathsName;
    this.fillCTM = snap.fillCTM;
    this.fillLayers = snap.fillLayers.slice();
    this.fillHasWarp = snap.fillHasWarp;
    this.localRings = snap.localRings.slice();
    this.curLocalRing = snap.curLocalRing ? snap.curLocalRing.slice() : null;
    // Transform/effect stacks
    this.ctm = snap.ctm;
    this.outLayers = snap.outLayers.slice();
    this.hasWarp = snap.hasWarp;
    this.outSnap.length = snap.outSnapLen;
    this.penLayers = snap.penLayers.slice();
    this.declumpStack = snap.declumpStack.slice();
    // Other
    this.stateStack = snap.stateStack.slice();
    this.tinyDropped = snap.tinyDropped;
    this.tinyDroppedSpots.length = snap.tinyDroppedSpotsLen;
    this.noEmit = snap.noEmit;
    this._warnedSatinEffect = snap._warnedSatinEffect;
    // Trace recording (for nesting): restore the outer trace's state
    this.traceRecording = snap.traceRecording;
    this.traceRuns = snap.traceRuns.map((r) => r.slice());
    this.traceCurRun = snap.traceCurRun ? snap.traceCurRun.slice() : null;
    this.traceVertexCount = snap.traceVertexCount;
  }

  /**
   * Map a local point to hoop space through the pre-split stack. With no warp
   * active this is exactly `apply(ctm, …)` — the byte-identical fast path.
   * Warps are applied innermost-first (the layer closest to the drawing
   * command runs first), composing inside-out like transform nesting.
   */
  mapOut(x: number, y: number): [number, number] {
    if (!this.hasWarp) return apply(this.ctm, x, y);
    let px = x,
      py = y;
    for (let i = this.outLayers.length - 1; i >= 0; i--) {
      const L = this.outLayers[i];
      const r = L.kind === 'aff' ? apply(L.m, px, py) : L.fn(px, py);
      px = r[0];
      py = r[1];
    }
    return [px, py];
  }

  /** Like mapOut, but using the satin column's captured snapshot. */
  _mapSatin(lx: number, ly: number): [number, number] {
    if (!this.satinHasWarp) return apply(this.satinCTM, lx, ly);
    let px = lx,
      py = ly;
    for (let i = this.satinLayers.length - 1; i >= 0; i--) {
      const L = this.satinLayers[i];
      const r = L.kind === 'aff' ? apply(L.m, px, py) : L.fn(px, py);
      px = r[0];
      py = r[1];
    }
    return [px, py];
  }

  /**
   * Emit one penetration point, running it through the after-split effect
   * stack (humanize / snaptogrid) first. Snapped or jittered duplicates that
   * collapse below the minimum stitch ride the existing tiny-stitch merge.
   * With no effect active this is exactly `_push('stitch', …)`.
   */
  _emitPen(x: number, y: number, u = false) {
    if (this.penLayers.length === 0) {
      this._push('stitch', x, y, u);
      return;
    }
    let px = x,
      py = y;
    for (let i = this.penLayers.length - 1; i >= 0; i--) {
      const r = this.penLayers[i](px, py);
      px = r[0];
      py = r[1];
    }
    if (this.lastEmit) {
      const d = Math.hypot(px - this.lastEmit.x, py - this.lastEmit.y);
      if (d < LIMITS.minStitch * 0.5) {
        this._dropTiny(px, py);
        return;
      }
    }
    this._push('stitch', px, py, u);
  }

  /**
   * Apply all stateless penLayers to a point without emitting.
   * Used by the declump-active path in travel() to pre-compute the humanized /
   * snapped position of each planned split-point before running the fold.
   */
  _applyPenLayers(x: number, y: number): [number, number] {
    if (this.penLayers.length === 0) return [x, y];
    let px = x,
      py = y;
    for (let i = this.penLayers.length - 1; i >= 0; i--) {
      const r = this.penLayers[i](px, py);
      px = r[0];
      py = r[1];
    }
    return [px, py];
  }

  /**
   * Emit a point that has already been processed (declump-folded + penLayers
   * pre-applied). Performs the tiny-stitch merge check then calls _push.
   * Never applies penLayers — the caller is responsible for pre-applying them.
   */
  _emitRaw(x: number, y: number, u = false) {
    if (this.lastEmit) {
      const d = Math.hypot(x - this.lastEmit.x, y - this.lastEmit.y);
      if (d < LIMITS.minStitch * 0.5) {
        this._dropTiny(x, y);
        return;
      }
    }
    this._push('stitch', x, y, u);
  }

  /** Record a merged sub-minimum move so it can be located later. */
  _dropTiny(x: number, y: number) {
    this.tinyDropped++;
    if (this.tinyDroppedSpots.length < 200)
      this.tinyDroppedSpots.push({ x, y, line: this.currentLine });
  }

  _push(t: EventType, x: number, y: number, u = false) {
    if (this.noEmit) return;
    if (this.events.length >= this.effectiveLimits.maxStitches) {
      const raised = this.effectiveLimits.maxStitches > STOCK_LIMITS.maxStitches;
      throw new NeedlescriptError(
        `Design exceeds ${this.effectiveLimits.maxStitches.toLocaleString('en-US')} stitches — stopped.` +
          (raised
            ? ` (raised by override from ${STOCK_LIMITS.maxStitches.toLocaleString('en-US')})`
            : ` Reduce repeats, raise stitchlen, or raise fillspacing. Or: override 'stitches' N (ceiling ${OVERRIDE_CEILINGS.maxStitches.toLocaleString('en-US')}).`) +
          (this.usedQuery
            ? ' A feedback loop may not be terminating — is your coverage target reachable? Cap it with  repeat N [ … if done [ break ] ].'
            : ''),
      );
    }
    const ev: StitchEvent = { t, x, y, c: this.colorIdx, line: this.currentLine };
    if (u) ev.u = 1;
    this.events.push(ev);
    if (this.activeConstruction) {
      this.activeConstruction.events.push({
        event: ev,
        layer: t === 'stitch' ? (u ? 'underlay' : this.activeConstructionLayer) : 'travel',
        ...(this.activeConstructionLane === undefined ? {} : { lane: this.activeConstructionLane }),
      });
    }
    this.density.feed(t, x, y, this.currentLine);
    if (t === 'stitch' || t === 'jump') this.lastEmit = { x, y };
    // Overflow check: collect the first 50 stitches outside the sewable field.
    if (t === 'stitch' && this.fieldOverflows.length < 50 && !inHoopField(this.hoopInfo, x, y)) {
      this.fieldOverflows.push({
        x,
        y,
        line: this.currentLine,
        kind: inHoopOuter(this.hoopInfo, x, y) ? 'field' : 'hoop',
      });
    }
  }

  protected _beginConstruction(
    record: Omit<FillConstructionRecord, 'id' | 'events'>,
  ): FillConstructionRecord | null;
  protected _beginConstruction(
    record: Omit<SatinConstructionRecord, 'id' | 'events'>,
  ): SatinConstructionRecord | null;
  protected _beginConstruction(
    record:
      | Omit<FillConstructionRecord, 'id' | 'events'>
      | Omit<SatinConstructionRecord, 'id' | 'events'>,
  ): ConstructionRecord | null {
    if (this.noEmit) return null;
    if (this.activeConstruction)
      throw new Error('internal construction metadata cannot overlap active constructions');
    const complete = {
      ...record,
      id: this.constructionNextId++,
      events: [],
    } as ConstructionRecord;
    this.constructionRecords.push(complete);
    this.activeConstruction = complete;
    this.activeConstructionLayer = 'topping';
    this.activeConstructionLane = undefined;
    return complete;
  }

  protected _finishConstruction(record?: ConstructionRecord | null) {
    if (record && this.activeConstruction !== record) return;
    this.activeConstruction = null;
    this.activeConstructionLayer = 'topping';
    this.activeConstructionLane = undefined;
  }

  _ensureStart() {
    if (!this.started) {
      this.started = true;
      const [hx, hy] = this.mapOut(this.x, this.y);
      this._push('stitch', hx, hy);
    }
  }

  setXY(nx: number, ny: number) {
    const dx = nx - this.x,
      dy = ny - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) {
      this.x = nx;
      this.y = ny;
      return;
    }
    this.travel(nx, ny);
  }

  forward(dist: number) {
    if (!isFinite(dist)) throw new NeedlescriptError('fd/bk got a non-numeric distance');
    const rad = (this.heading * Math.PI) / 180;
    this.travel(this.x + Math.sin(rad) * dist, this.y + Math.cos(rad) * dist);
  }

  /**
   * Sew an arc: turn `deg` degrees in total (positive = right/clockwise,
   * negative = left) while moving along a circle of the given radius.
   * Decomposed into half-turn / chord / half-turn steps so every stitch
   * mode (running, satin, bean, estitch) works on curves.
   */
  arc(deg: number, radius: number) {
    if (!isFinite(deg) || !isFinite(radius))
      throw new NeedlescriptError('arc got a non-numeric angle or radius');
    const r = Math.abs(radius);
    if (Math.abs(deg) < 1e-9 || r < 1e-9) return;
    const arcLen = ((Math.abs(deg) * Math.PI) / 180) * r;
    const eff = Math.min(Math.max(this.stitchLen, LIMITS.minStitch), LIMITS.maxStitch);
    // In reporter-buffered mode use geometry-only step count (≤15° per step) so
    // the arc shape is faithfully captured in the buffer independent of stitch
    // length. In all other modes combine arc-length and geometry requirements.
    const steps = this.stitchLenReporter
      ? Math.max(1, Math.ceil(Math.abs(deg) / 15))
      : Math.max(1, Math.ceil(Math.max(arcLen / eff, Math.abs(deg) / 15)));
    const stepAng = deg / steps;
    const chord = 2 * r * Math.sin((Math.abs(stepAng) * Math.PI) / 360);
    for (let s = 0; s < steps; s++) {
      this.heading = (this.heading + stepAng / 2) % 360;
      const rad = (this.heading * Math.PI) / 180;
      this.travel(this.x + Math.sin(rad) * chord, this.y + Math.cos(rad) * chord);
      this.heading = (this.heading + stepAng / 2) % 360;
    }
  }

  pushState() {
    if (this.stateStack.length >= 500)
      throw new NeedlescriptError('push/pop stack is too deep (max 500 saved states)');
    this.stateStack.push({ x: this.x, y: this.y, heading: this.heading, penDown: this.penDown });
  }

  popState() {
    const s = this.stateStack.pop();
    if (!s) {
      this.warnings.push('pop ignored — nothing was saved with push');
      return;
    }
    this.flushSatin();
    this.penDown = false; // travel back as a jump, never sewing
    this.setXY(s.x, s.y);
    this.penDown = s.penDown;
    this.heading = s.heading;
  }

  markHere(label?: string) {
    this.flushSatin();
    const [hx, hy] = this.mapOut(this.x, this.y);
    if (this.noEmit) return;
    if (this.events.length >= this.effectiveLimits.maxStitches)
      throw new NeedlescriptError(
        `Design exceeds ${this.effectiveLimits.maxStitches.toLocaleString('en-US')} stitches — stopped.`,
      );
    const ev: StitchEvent = { t: 'mark', x: hx, y: hy, c: this.colorIdx, line: this.currentLine };
    if (label !== undefined) ev.label = label;
    this.events.push(ev);
    this.density.feed('mark', hx, hy, this.currentLine);
  }

  travel(nx: number, ny: number) {
    const ox = this.x,
      oy = this.y;

    // Trace recording (RFC-trace §4.2): capture the pre-split turtle spine.
    // Intercepts before fill recording and all stitch-mode logic so the
    // captured path is the raw movement polyline, not the stitched output.
    if (this.traceRecording) {
      if (this.penDown) {
        const [px, py] = this.mapOut(nx, ny);
        if (!this.traceCurRun) {
          const [ox2, oy2] = this.mapOut(ox, oy);
          this.traceCurRun = [[ox2, oy2]];
          this.traceVertexCount++;
          if (this.traceVertexCount > LIMITS.maxTraceVertices)
            throw new NeedlescriptError(
              `trace: too many vertices (over ${LIMITS.maxTraceVertices.toLocaleString('en-US')})`,
            );
        }
        // Drop consecutive coincident vertices (zero-length moves)
        const last = this.traceCurRun[this.traceCurRun.length - 1];
        if (Math.hypot(px - last[0], py - last[1]) > 1e-6) {
          this.traceCurRun.push([px, py]);
          this.traceVertexCount++;
          if (this.traceVertexCount > LIMITS.maxTraceVertices)
            throw new NeedlescriptError(
              `trace: too many vertices (over ${LIMITS.maxTraceVertices.toLocaleString('en-US')})`,
            );
        }
      } else {
        this._closeTraceRun();
      }
      this.x = nx;
      this.y = ny;
      return;
    }

    if (this.recording) {
      // Fill boundaries are recorded in hoop space so the fill is generated
      // (and pull-compensated) on the geometry that actually sews.
      if (this.penDown) {
        const [hnx, hny] = this.mapOut(nx, ny);
        if (!this.curRing) {
          const [hox, hoy] = this.mapOut(ox, oy);
          this.curRing = [[hox, hoy]];
        }
        this.curRing.push([hnx, hny]);
        // Armed (programmable) fills also keep the ring in LOCAL space so the
        // field/shape reporters can be queried in local coordinates (§6).
        if (this.fillArmed) {
          if (!this.curLocalRing) this.curLocalRing = [[ox, oy]];
          this.curLocalRing.push([nx, ny]);
        }
      } else {
        this._closeRing();
      }
      this.x = nx;
      this.y = ny;
      return;
    }

    if (!this.penDown) {
      this.flushSatin();
      const [hnx, hny] = this.mapOut(nx, ny);
      this._push('jump', hnx, hny);
      // Signal a new pen-down run to any active declump states so they reset
      // their prev-point references (§4: "for each pen-down run …").
      if (this.declumpStack.length) {
        for (const ds of this.declumpStack) declumpResetRun(ds);
      }
      this.x = nx;
      this.y = ny;
      return;
    }

    if (this.mode === 'satin' && (this.satinWidth > 0.05 || this.satinReporter)) {
      // Buffer the column path in *local* space and snapshot the output stack;
      // the column is mapped to hoop space (with width transformed
      // perpendicular to local travel) when it ends — see flushSatin().
      const localLen = Math.hypot(nx - ox, ny - oy);
      if (localLen > 1e-9) {
        if (!this.satinPath) {
          this.satinPath = [{ x: ox, y: oy }];
          this.satinCTM = this.ctm;
          this.satinHasWarp = this.hasWarp;
          this.satinLayers = this.hasWarp ? this.outLayers.slice() : this.satinLayers;
        }
        const lastP = this.satinPath[this.satinPath.length - 1];
        if (Math.hypot(nx - lastP.x, ny - lastP.y) > 0.05) this.satinPath.push({ x: nx, y: ny });
      }
      this.x = nx;
      this.y = ny;
      return;
    }

    // Map both endpoints to hoop space; split on the *hoop* length so stitch
    // length stays physical under scaling (transform the path, then stitch).
    const [hox, hoy] = this.mapOut(ox, oy);
    const [hnx, hny] = this.mapOut(nx, ny);
    const hdx = hnx - hox,
      hdy = hny - hoy;
    const hlen = Math.hypot(hdx, hdy);

    this._ensureStart();

    if (this.mode === 'estitch' && this.eWidth > 0.05) {
      if (hlen < 1e-9) {
        this.x = nx;
        this.y = ny;
        return;
      }
      // Prong width follows the CTM perpendicular to the *local* travel
      // direction, like satin: transform the local left-normal.
      const llen = Math.hypot(nx - ox, ny - oy) || 1;
      const ldx = (nx - ox) / llen,
        ldy = (ny - oy) / llen;
      const [ovx, ovy] = linApply(this.ctm, -ldy, ldx); // L(local left-normal)
      const spacing = Math.max(1, this.stitchLen);
      const steps = Math.max(1, Math.round(hlen / spacing));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const cx = hox + hdx * t,
          cy = hoy + hdy * t;
        this._emitPen(cx, cy);
        this._emitPen(cx + ovx * this.eWidth, cy + ovy * this.eWidth);
        this._emitPen(cx, cy);
      }
      this.x = nx;
      this.y = ny;
      return;
    }
    // Running stitch — three forms dispatched by active stitchLen mode.
    if (hlen < LIMITS.minStitch * 0.5) {
      this._dropTiny(nx, ny);
      this.x = nx;
      this.y = ny;
      return;
    }

    // ── Form 3: reporter buffered mode ──────────────────────────────────────
    //
    // Instead of splitting now, append this segment's endpoint to the spine
    // buffer. The actual splitting happens when the stretch ends (flushRunningStitch).
    if (this.stitchLenReporter) {
      if (!this.runBuffer) {
        this.runBuffer = [{ x: ox, y: oy }];
        this.runBufferCTM = this.ctm;
        this.runBufferHasWarp = this.hasWarp;
        this.runBufferLayers = this.hasWarp ? this.outLayers.slice() : [];
      }
      this.runBuffer.push({ x: nx, y: ny });
      this.x = nx;
      this.y = ny;
      return;
    }

    // ── Form 2: list-cycling mode ────────────────────────────────────────────
    if (this.stitchLenList) {
      const list = this.stitchLenList;
      const listLen = list.length;
      const phase = this.stitchLenListPhase;

      // Reset per-stretch index at the first pen-down move of a new stretch.
      if (this.stitchLenStretchStart) {
        this.stitchLenStretchStart = false;
        this.stitchLenStretchIndex = 0;
      }

      let remaining = hlen;
      let slCursor = 0;
      let cycleIdx = this.stitchLenStretchIndex;

      if (this.declumpStack.length > 0) {
        // Pre-compute all split points for the declump path.
        const innerPts: [number, number][] = [];
        while (remaining > 1e-9) {
          const len = list[(cycleIdx + phase) % listLen];
          const advance = Math.min(len, remaining);
          slCursor += advance;
          remaining -= advance;
          const frac = slCursor / hlen;
          innerPts.push(this._applyPenLayers(hox + hdx * frac, hoy + hdy * frac));
          cycleIdx++;
        }
        let prevRaw: [number, number] = this.lastEmit
          ? [this.lastEmit.x, this.lastEmit.y]
          : [hox, hoy];
        for (let i = 0; i < innerPts.length; i++) {
          const nextPt = i + 1 < innerPts.length ? innerPts[i + 1] : null;
          let [rx, ry] = innerPts[i];
          for (let di = this.declumpStack.length - 1; di >= 0; di--) {
            [rx, ry] = declumpFoldPoint(this.declumpStack[di], [rx, ry], nextPt, this.density);
          }
          this._emitRaw(rx, ry);
          for (let r = 1; r < this.beanRepeats; r++) {
            this._emitRaw(r % 2 === 1 ? prevRaw[0] : rx, r % 2 === 1 ? prevRaw[1] : ry);
          }
          prevRaw = [rx, ry];
        }
      } else {
        // Normal path.
        let pxv = hox,
          pyv = hoy;
        while (remaining > 1e-9) {
          const len = list[(cycleIdx + phase) % listLen];
          const advance = Math.min(len, remaining);
          slCursor += advance;
          remaining -= advance;
          const frac = slCursor / hlen;
          const tx = hox + hdx * frac,
            ty = hoy + hdy * frac;
          this._emitPen(tx, ty);
          for (let r = 1; r < this.beanRepeats; r++) {
            this._emitPen(r % 2 === 1 ? pxv : tx, r % 2 === 1 ? pyv : ty);
          }
          pxv = tx;
          pyv = ty;
          cycleIdx++;
        }
      }
      this.stitchLenStretchIndex = cycleIdx;
      this.x = nx;
      this.y = ny;
      return;
    }

    // ── Form 1: uniform numeric mode (unchanged) ────────────────────────────
    const eff = Math.min(Math.max(this.stitchLen, LIMITS.minStitch), LIMITS.maxStitch);
    const steps = Math.max(1, Math.ceil(hlen / eff));

    if (this.declumpStack.length > 0) {
      // Declump-active path: pre-compute the full split sequence so the fold
      // can receive p_{i+1} for the forward cap, and so bean repeats use the
      // moved spine positions (spec §3: "decorations generated from the moved
      // spine"). penLayers are pre-applied (they are stateless) so the fold
      // sees the humanized / snapped positions as its input.
      const innerPts: [number, number][] = [];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        innerPts.push(this._applyPenLayers(hox + hdx * t, hoy + hdy * t));
      }

      let prevRaw: [number, number] = this.lastEmit
        ? [this.lastEmit.x, this.lastEmit.y]
        : [hox, hoy];
      for (let i = 0; i < innerPts.length; i++) {
        const nextPt = i + 1 < innerPts.length ? innerPts[i + 1] : null;
        let [rx, ry] = innerPts[i];

        // Apply declumpStack innermost-first (highest index first, matching
        // the penLayers convention: last-pushed = innermost = runs first).
        for (let di = this.declumpStack.length - 1; di >= 0; di--) {
          [rx, ry] = declumpFoldPoint(this.declumpStack[di], [rx, ry], nextPt, this.density);
        }

        this._emitRaw(rx, ry);

        // Bean repeats use the moved spine positions (spec §3).
        for (let r = 1; r < this.beanRepeats; r++) {
          this._emitRaw(r % 2 === 1 ? prevRaw[0] : rx, r % 2 === 1 ? prevRaw[1] : ry);
        }
        prevRaw = [rx, ry];
      }
    } else {
      // Normal path (no declump active): stateless penLayers applied per point.
      let pxv = hox,
        pyv = hoy;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const tx = hox + hdx * t,
          ty = hoy + hdy * t;
        this._emitPen(tx, ty);
        for (let r = 1; r < this.beanRepeats; r++) {
          this._emitPen(r % 2 === 1 ? pxv : tx, r % 2 === 1 ? pyv : ty);
        }
        pxv = tx;
        pyv = ty;
      }
    }
    this.x = nx;
    this.y = ny;
  }

  _closeRing() {
    if (this.curRing && this.curRing.length >= 3) this.rings.push(this.curRing);
    this.curRing = null;
    if (this.curLocalRing && this.curLocalRing.length >= 3) this.localRings.push(this.curLocalRing);
    this.curLocalRing = null;
  }

  /** Close the current trace run if it has geometric content (≥2 vertices). */
  _closeTraceRun() {
    if (this.traceCurRun && this.traceCurRun.length >= 2) {
      // Closing-vertex dedupe (§4.2): if a run's final vertex coincides with
      // its first within 1e-6 mm, the duplicate is dropped — region closure is
      // implicit, and returning it doubled would break pathlen and resample.
      const first = this.traceCurRun[0];
      const last = this.traceCurRun[this.traceCurRun.length - 1];
      if (Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-6) {
        this.traceCurRun.pop();
        this.traceVertexCount--;
      }
      // After dedupe, still need ≥2 for a valid path
      if (this.traceCurRun.length >= 2) this.traceRuns.push(this.traceCurRun);
    }
    this.traceCurRun = null;
  }
}
