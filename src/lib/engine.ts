// ============================================================
// NeedleScript core language engine
// Tokenizer, parser, stitch machine, fill engine, and interpreter.
// No DOM dependencies — usable as a standalone library.
//
// Units: millimetres. Heading: degrees, 0 = up/north, clockwise.
// ============================================================
//
// This file re-exports everything from the individual modules.
// See the individual files for implementation details:
//   types.ts        — shared types and interfaces
//   errors.ts       — NeedlecriptError
//   prng.ts         — makeRNG, makeNoise
//   commands.ts     — ALIASES, BUILTIN_ARITY, QWORD_BUILTINS, FABRICS, FUNC_ARITY, ZERO_FUNCS, LIST_FUNCS, LIST_CMDS, RESERVED
//   suggestions.ts  — suggest
//   tokenizer.ts    — tokenize
//   parser.ts       — parse
//   list.ts         — NsList and the list value helpers (RFC-2)
//   machine.ts      — LIMITS, Machine (internal stitch machine + fill engine)
//   postprocess.ts  — applyLocks, applyAutoTrim, densityMap, designStats
//   interpreter.ts  — run

export type {
  TokenType,
  Token,
  EventType,
  StitchEvent,
  RunResult,
  WarningLocation,
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
  ChalkStyle,
  ChalkStroke,
  ChalkEvent,
  ChalkDataVar,
  ColorTableEntry,
} from './types.ts';
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
} from './colormath.ts';
export { NeedlescriptError } from './errors.ts';
export { makeRNG, makeNoise, fork, gauss } from './prng.ts';
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
} from './commands.ts';
export { suggest } from './suggestions.ts';
export { tokenize } from './tokenizer.ts';
export { parse } from './parser/index.ts';
export { NsList, isList, isString } from './list.ts';
export type { Val } from './list.ts';
export type { Pt } from './genmath.ts';
export { LIMITS, STOCK_LIMITS, OVERRIDE_CEILINGS, OVERRIDE_FLOORS } from './machine.ts';
export type { BudgetKey } from './machine.ts';
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
} from './hoop-presets.ts';
export { applyLocks, applyAutoTrim, densityMap, designStats, DensityGrid } from './postprocess.ts';
export { applyTravelPlan, PLAN_STRATEGIES } from './travel-planner.ts';
export type { PlanMode, PlanStrategy, TravelPlanResult } from './travel-planner.ts';
export { routeItems, ROUTE_ALGORITHMS, ROUTESORT_MODES } from './routing.ts';
export type {
  RouteAlgorithm,
  RouteItem,
  RouteOptions,
  RoutePoint,
  RoutedItem,
  RouteSortMode,
} from './routing.ts';
export { run } from './interpreter.ts';
export { PES_CATALOG } from './pes.ts';
export { toSVG } from './svg.ts';
export { toDST } from './dst.ts';
export { toPES } from './pes.ts';
export { toEXP } from './exp.ts';
export {
  BITMAP_HELPERS,
  EST_STITCHES_PER_MM2,
  bitmapPrefix,
  emitBitmapCode,
  processBitmap,
  uniqueBitmapPrefix,
} from './bitmap-importer.ts';
export type {
  BitmapCrop,
  BitmapPixels,
  BitmapPlate,
  BitmapSettings,
  EmitBitmapOptions,
  ProcessedBitmap,
} from './bitmap-importer.ts';

// SVG-import staging (pure modules; the DOM parser lives in svg/parse.ts).
export type {
  ElementModel,
  StagedDocument,
  Strategy,
  StrategyKind,
  GeomType,
  RingHole,
  ElementFlags,
  Fabric,
  SewOrderKey,
  BBox,
} from './svg/model.ts';
export { defaultStrategy, bboxOf, bboxOutsideDisc, SEWABLE_RADIUS } from './svg/model.ts';
export {
  computeHoleMap,
  netFillArea,
  perimeterToAreaRatio,
  selfIntersects,
  signedArea,
  orientationOf,
  pointInPolygon,
  isClosedRing,
} from './svg/geometry.ts';
export {
  STRATEGIES,
  STRATEGY_ORDER,
  eligibleStrategies,
  isClosedGeom,
  autoSuggest,
  type ParamControl,
  type StrategyDef,
} from './svg/strategies.ts';
export { emit, resampleRing, type EmitResult, type EmitOptions } from './svg/emit.ts';
export { parseColorStr, nearestThread, threadForColor, buildThreadMap } from './svg/thread-map.ts';
