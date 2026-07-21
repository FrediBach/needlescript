// ============================================================
// NeedleScript core language engine
// Tokenizer, parser, stitch machine, fill engine, and interpreter.
// No DOM dependencies — usable as a standalone library.
//
// Units: millimetres. Heading: degrees, 0 = up/north, clockwise.
// ============================================================
//
// This stable public barrel re-exports the platform-neutral modules grouped by
// responsibility under core/, language/, geometry/, embroidery/, runtime/, and formats/.

export type {
  TokenType,
  Token,
  EventType,
  StitchEvent,
  RunResult,
  WarningLocation,
  PreflightMode,
  PreflightSeverity,
  PreflightIssue,
  PreflightResult,
  DiagnosticGeometryRole,
  DiagnosticPoint,
  DiagnosticBounds,
  DiagnosticGeometryBase,
  DiagnosticGeometry,
  PhysicsDiagnosticCategory,
  PhysicsEvidence,
  PhysicsMeasurementUnit,
  PhysicsMeasurement,
  PhysicsSourceLocation,
  PhysicsSourceReason,
  PhysicsPlaybackRange,
  PhysicsRemedy,
  PhysicsAssumption,
  PhysicsDiagnostic,
  PhysicsReport,
  PhysicsAnalysisMode,
  PhysicsDiagnosticCounts,
  ResolvedMachineProfile,
  MachineProfile,
  MachineCalibration,
  ResolvedMachineCalibration,
  MachineOperationCapability,
  MachineSpeedClass,
  DesignStats,
  ASTNode,
  ExprNode,
  DensityCell,
  DensityHotspot,
  DensityResult,
  RunOptions,
  RunTimings,
  HoopInfo,
  OverrideKey,
  TravelPlanStats,
  TravelPlanGroupStats,
  ChalkStyle,
  ChalkStroke,
  ChalkEvent,
  ChalkDataVar,
  ReferenceDataVar,
  ColorTableEntry,
  ExportMetadata,
  MaterialIntent,
  CompensationTensor,
  HeadingCompensationComponents,
  ResolvedDirectionalCompensation,
  DirectionalCompensationSample,
  DirectionalCompensationPreview,
} from './core/types.ts';
export { buildPreflightResult, PREFLIGHT_MODES } from './embroidery/preflight.ts';
export type { PreflightInput } from './embroidery/preflight.ts';
export {
  applyMachineCalibration,
  enforceMaximumMovement,
  isIdentityMachineCalibration,
  machineCalibrationMatrix,
  MACHINE_PROFILE_LIMITS,
  resolveMachineProfile,
} from './embroidery/machine-profile.ts';
export {
  analyzeEventStreamPreflight,
  EVENT_STREAM_PREFLIGHT_THRESHOLDS,
} from './embroidery/preflight-event-stream.ts';
export { CONSTRUCTION_PREFLIGHT_THRESHOLDS } from './embroidery/preflight-construction.ts';
export {
  assignPhysicsDiagnosticIdentities,
  buildPhysicsDiagnosticFingerprint,
  buildPhysicsReport,
  getPhysicsDiagnosticCatalogEntry,
  PHYSICS_DIAGNOSTIC_CATALOG,
  PHYSICS_REPORT_VERSION,
  validatePhysicsDiagnosticCatalog,
} from './embroidery/physics-diagnostics/index.ts';
export type {
  PhysicsDiagnosticCatalogEntry,
  PhysicsDiagnosticCode,
  PhysicsDiagnosticIdentityInput,
  PhysicsReportCompatibilityInput,
} from './embroidery/physics-diagnostics/index.ts';
export {
  COLOR_NAMES,
  DEFAULT_PALETTE,
  DEFAULT_BACKGROUND,
  parseColor,
  parseColorDetails,
  rgb,
  hsl,
  hexParts,
  oklab,
  unoklab,
  lerpColor,
  colorDist,
} from './core/colormath.ts';
export { NeedlescriptError } from './core/errors.ts';
export { makeRNG, makeNoise, fork, gauss } from './core/prng.ts';
export {
  ALIASES,
  BUILTIN_ARITY,
  TRANSFORM_ARITY,
  QWORD_BUILTINS,
  FABRICS,
  FUNC_ARITY,
  ZERO_FUNCS,
  LIST_FUNCS,
  LIST_CMDS,
  GEN_FUNCS,
  GEN_CMDS,
  GEN_QWORD_ARG,
  QUERY_FUNCS,
  STRING_FUNCS,
  LIBRARY_FUNCS,
  RESERVED,
} from './language/commands.ts';
export {
  DEFAULT_MATERIAL_INTENT,
  COMPENSATION_MODES,
  DEFAULT_THREAD_PROFILE,
  DEFAULT_THREAD_WIDTH_MM,
  EMBROIDERY_MODE_REGISTRIES,
  FABRIC_MODES,
  FABRIC_PROFILES,
  MATERIAL_RANGES,
  NEEDLE_PROFILES,
  NEEDLE_SIZES,
  STABILIZER_MODES,
  STABILIZER_PROFILES,
  THREAD_PROFILE_MODES,
  THREAD_PROFILES,
  TOPPING_PROFILES,
} from './embroidery/embroidery-registry.ts';
export type {
  CompensationMode,
  FabricMaterialDefaults,
  FabricMode,
  FabricPreset,
  FabricProfile,
  NeedleProfile,
  NeedleSize,
  StabilizerMode,
  StabilizerProfile,
  ThreadProfile,
  ThreadProfileMode,
  ToppingMode,
} from './embroidery/embroidery-registry.ts';
export {
  compensateOpenPathEnds,
  compensationForHeading,
  compensationTensor,
  directionalCompensationPreview,
  resolveDirectionalCompensation,
} from './embroidery/directional-compensation.ts';
export { suggest } from './core/suggestions.ts';
export { tokenize } from './language/tokenizer.ts';
export { parse } from './language/parser/index.ts';
export { linkStandardModules } from './language/module-linker.ts';
export { NsList, isList, isString } from './runtime/list.ts';
export type { Val } from './runtime/list.ts';
export type { Pt } from './geometry/genmath.ts';
export {
  DEFAULT_SATIN_SHARP_TURN_DEG,
  DEFAULT_SATIN_UNSAFE_WIDTH_RATIO,
  DEFAULT_SATIN_TIP_WIDTH_MM,
  analyzeSpineColumn,
  analyzeRailPairColumn,
  legacySpineWidthIssue,
  legacyRailWidthIssue,
} from './geometry/column-analysis.ts';
export type {
  ColumnSource,
  ColumnPointKind,
  ColumnTaperDirection,
  ColumnAnalysisOptions,
  ColumnRailSample,
  AnalyzedRailCurvature,
  AnalyzedColumnSample,
  AnalyzedColumnSegment,
  AnalyzedColumn,
} from './geometry/column-analysis.ts';
export {
  FILL_CONSTRUCTION_RANGES,
  FILL_STAGGER_MODES,
  FILL_CONSTRUCTION_MODE_REGISTRIES,
  fillStaggerOffset,
} from './embroidery/fill-profile.ts';
export type { FillStaggerMode } from './embroidery/fill-profile.ts';
export {
  SATIN_CAP_MODES,
  SATIN_JOIN_MODES,
  SATIN_WIDE_MODES,
  DEFAULT_PREFERRED_SATIN_CHORD_MM,
  SATIN_CONSTRUCTION_RANGES,
  SATIN_CORNER_LIMITS,
  SATIN_CONSTRUCTION_MODE_REGISTRIES,
  satinCapWidthFactor,
  satinCapUnderlayInset,
  satinSplitCount,
  satinSplitSeamFraction,
} from './embroidery/satin-profile.ts';
export type {
  SatinCapMode,
  SatinCapPolicy,
  SatinJoinMode,
  SatinWideMode,
} from './embroidery/satin-profile.ts';
export {
  SATIN_UNDERLAY_RANGES,
  SATIN_UNDERLAY_PASS_KINDS,
  SATIN_UNDERLAY_MAX_PASSES,
  SATIN_UNDERLAY_DEFAULTS,
  FILL_UNDERLAY_RANGES,
  FILL_UNDERLAY_PASS_KINDS,
  FILL_UNDERLAY_MAX_PASSES,
  FILL_UNDERLAY_DEFAULTS,
  lowerLegacySatinUnderlay,
  resolveSatinUnderlayProfile,
  cloneSatinUnderlayCustomization,
  lowerLegacyFillUnderlay,
  resolveFillUnderlayProfile,
  cloneFillUnderlayCustomization,
  lowerFabricUnderlay,
  validateSatinUnderlayProfile,
  validateFillUnderlayProfile,
} from './embroidery/underlay-profile.ts';
export type {
  NumericRange,
  SatinUnderlayPassKind,
  SatinEdgeInset,
  SatinReturnRunPolicy,
  SatinCenterUnderlayPass,
  SatinEdgeUnderlayPass,
  SatinZigzagUnderlayPass,
  SatinUnderlayPass,
  SatinUnderlayProfile,
  SatinUnderlayCustomization,
  LegacySatinGenerator,
  LegacySatinUnderlayContext,
  LegacyResolvedSatinUnderlayProfile,
  CustomResolvedSatinUnderlayProfile,
  ResolvedSatinUnderlayProfile,
  FillUnderlayPassKind,
  FillUnderlayAngle,
  FillDirectionFieldBehavior,
  FillEdgeUnderlayPass,
  FillTatamiUnderlayPass,
  FillUnderlayPass,
  FillUnderlayProfile,
  FillUnderlayCustomization,
  LegacyFillGenerator,
  LegacyFillUnderlayContext,
  LegacyResolvedFillUnderlayProfile,
  CustomResolvedFillUnderlayProfile,
  ResolvedFillUnderlayProfile,
  ProfileValidationIssue,
} from './embroidery/underlay-profile.ts';
export {
  LIMITS,
  STOCK_LIMITS,
  OVERRIDE_CEILINGS,
  OVERRIDE_FLOORS,
} from './embroidery/machine/index.ts';
export type { BudgetKey } from './embroidery/machine/index.ts';
export {
  DEFAULT_HOOP_INFO,
  HOOP_PRESET_NAMES,
  lookupHoopPreset,
  buildHoopInfo,
  hoopFieldPolygon,
  hoopFieldDomain,
  inHoopField,
  inHoopOuter,
  fieldDescription,
  hoopDescription,
} from './embroidery/hoop-presets.ts';
export {
  applyLocks,
  applyAutoTrim,
  densityMap,
  designStats,
  DensityGrid,
} from './embroidery/postprocess.ts';
export { applyTravelPlan, PLAN_MODES, PLAN_STRATEGIES } from './embroidery/travel-planner.ts';
export type {
  PlanAtomicSpan,
  PlanMode,
  PlanRouteGroupSpan,
  PlanStrategy,
  TravelPlanGroupResult,
  TravelPlanResult,
} from './embroidery/travel-planner.ts';
export { routeItems, ROUTE_ALGORITHMS, ROUTESORT_MODES } from './embroidery/routing.ts';
export type {
  RouteAlgorithm,
  RouteItem,
  RouteOptions,
  RoutePoint,
  RoutedItem,
  RouteSortMode,
} from './embroidery/routing.ts';
export { run } from './runtime/index.ts';
export { PES_CATALOG } from './formats/pes.ts';
export { toSVG } from './formats/svg.ts';
export { toDST } from './formats/dst.ts';
export { toPES } from './formats/pes.ts';
export { toEXP } from './formats/exp.ts';
export {
  BITMAP_HELPERS,
  EST_STITCHES_PER_MM2,
  bitmapPrefix,
  emitBitmapCode,
  processBitmap,
  uniqueBitmapPrefix,
} from './formats/bitmap.ts';
export type {
  BitmapCrop,
  BitmapPixels,
  BitmapPlate,
  BitmapSettings,
  EmitBitmapOptions,
  ProcessedBitmap,
} from './formats/bitmap.ts';

// SVG-import staging (pure modules; the DOM adapter lives in src/svg-import/).
export type {
  ElementModel,
  ImportOperation,
  SourceGeometry,
  SourceObject,
  SourcePaint,
  SvgGradientStop,
  SvgLinearGradient,
  OperationFinding,
  StagedDocument,
  Strategy,
  StrategyKind,
  OperationRole,
  GeomType,
  RingHole,
  ElementFlags,
  Fabric,
  SvgPlanMode,
  SewOrderKey,
  BBox,
  ImportField,
} from './formats/svg-import/model.ts';
export {
  defaultStrategy,
  bboxOf,
  bboxOutsideDisc,
  geometryOutsideField,
  pointInField,
  SEWABLE_RADIUS,
} from './formats/svg-import/model.ts';
export {
  computeHoleMap,
  netFillArea,
  perimeterToAreaRatio,
  selfIntersects,
  signedArea,
  orientationOf,
  pointInPolygon,
  isClosedRing,
  normalizedFillGroups,
} from './formats/svg-import/geometry.ts';
export {
  STRATEGIES,
  STRATEGY_ORDER,
  RELATIONSHIP_STRATEGY_ORDER,
  eligibleStrategies,
  strategySupportsAtomic,
  isClosedGeom,
  autoSuggest,
  type ParamControl,
  type StrategyDef,
} from './formats/svg-import/strategies.ts';
export {
  emit,
  resampleRing,
  type EmitResult,
  type EmitOptions,
} from './formats/svg-import/emit.ts';
export {
  emitAppend,
  inventoryProgram,
  mergeAppend,
  type AppendEmitResult,
  type ProgramImport,
  type ProgramInventory,
} from './formats/svg-import/merge.ts';
export { orderOperations } from './formats/svg-import/ordering.ts';
export {
  canCreateMotifAlong,
  canCreateRailPair,
  createMotifAlong,
  createRailPair,
} from './formats/svg-import/relationships.ts';
export {
  parseColorStr,
  nearestThread,
  threadForColor,
  buildThreadMap,
} from './formats/svg-import/thread-map.ts';
