// Platform-neutral staging model for the SVG importer.
//
// Source geometry is stored once and referenced by independently editable paint
// operations. All coordinates and physical paint values are hoop-space mm.

import type { Pt } from '../genmath.ts';
import type {
  FillUnderlayMode,
  SatinUnderlayMode,
  ThreadProfileMode,
} from '../embroidery-registry.ts';
import type { SatinCapMode, SatinJoinMode } from '../satin-profile.ts';
import type { PlanMode } from '../travel-planner.ts';
import type { SvgCurveSpec } from './svg-path.ts';

export type Point = Pt;
export type SourceGeometryKind =
  'path' | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon';
export type GeometryOutputMode = 'semantic' | 'curve' | 'path' | 'compact';

/** Operation classification retained for the existing recipe catalogue. */
export type GeomType =
  'closedPath' | 'openPath' | 'rect' | 'circle' | 'ellipse' | 'polyline' | 'polygon';

export type StrategyKind =
  | 'skip'
  | 'outline'
  | 'satinBorder'
  | 'tatamiFill'
  | 'gradientFill'
  | 'directionalFill'
  | 'runningMotif'
  | 'railPair'
  | 'motifAlong';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface OutlineParams {
  stitchlen: number;
  bean: boolean;
  beanCount: number;
}
interface SatinBorderParams {
  width: number;
  density: number;
  underlay: SatinUnderlayMode;
  shortstitch: boolean;
  cap: SatinCapMode;
  join: SatinJoinMode;
}
interface TatamiFillParams {
  fillangle: number;
  fillspacing: number;
  filllen: number;
  fillunderlay: FillUnderlayMode;
  fillinset: number;
}
interface GradientFillParams {
  pitch: number;
  stitchlen: number;
}
interface DirectionalFillParams {
  field: string | null;
  fillspacing: number;
  fillunderlay: FillUnderlayMode;
}
interface RunningMotifParams {
  stitchlen: number;
  bean: boolean;
  estitch: boolean;
  estitchLen: number;
}
interface RailPairParams {
  density: number;
  underlay: SatinUnderlayMode;
  shortstitch: boolean;
  cap: SatinCapMode;
  join: SatinJoinMode;
}
interface MotifAlongParams {
  count: number;
  scale: number;
  stitchlen: number;
  align: boolean;
}

export type Strategy =
  | { kind: 'skip' }
  | { kind: 'outline'; params: OutlineParams }
  | { kind: 'satinBorder'; params: SatinBorderParams }
  | { kind: 'tatamiFill'; params: TatamiFillParams }
  | { kind: 'gradientFill'; params: GradientFillParams }
  | { kind: 'directionalFill'; params: DirectionalFillParams }
  | { kind: 'runningMotif'; params: RunningMotifParams }
  | { kind: 'railPair'; params: RailPairParams }
  | { kind: 'motifAlong'; params: MotifAlongParams };

export interface RingHole {
  /** true means the interior of this ring is unfilled. */
  hole: boolean;
  depth: number;
  orientation: 'cw' | 'ccw';
  /** Immediate containing ring, or null for a top-level ring. */
  parent: number | null;
}

export type FindingSeverity = 'info' | 'warning' | 'error';
export type FindingCode =
  | 'outside-field'
  | 'degenerate'
  | 'unsupported-element'
  | 'unsupported-paint'
  | 'self-intersection'
  | 'unsafe-satin-width'
  | 'ambiguous-topology';

export interface OperationFinding {
  code: FindingCode;
  severity: FindingSeverity;
  message: string;
  sourceObjectId?: string;
  operationId?: string;
  suggestedRecipe?: StrategyKind;
}

export interface GeometryFlags {
  outsideField?: boolean;
  degenerate?: boolean;
  selfIntersect?: boolean;
}

export interface SourceGeometry {
  id: string;
  sourceObjectId: string;
  name: string;
  kind: SourceGeometryKind;
  groupPath: string[];
  /** Simplified logical geometry used by emission and preview. */
  paths: Point[][];
  /** Unsimplified hoop-space geometry used when tolerance changes. */
  sourcePaths: Point[][];
  curveSpecs?: SvgCurveSpec[];
  closed: boolean[];
  bbox: BBox;
  outputMode: GeometryOutputMode;
  flags: GeometryFlags;
}

export interface SvgGradientStop {
  /** Normalized position along the authored SVG gradient vector. */
  offset: number;
  color: string;
}

export interface SvgLinearGradient {
  kind: 'linear';
  id: string;
  /** Hoop-space millimetres after SVG transforms and import fitting. */
  start: Point;
  /** Hoop-space millimetres after SVG transforms and import fitting. */
  end: Point;
  stops: SvgGradientStop[];
}

export interface SourcePaint {
  fill: string | null;
  fillGradient: SvgLinearGradient | null;
  stroke: string | null;
  strokeWidthMM: number | null;
  fillRule: 'nonzero' | 'evenodd';
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  dashArrayMM: number[] | null;
  dashOffsetMM: number;
  visible: boolean;
}

export interface SourceObject {
  id: string;
  name: string;
  geometryId: string | null;
  groupPath: string[];
  sourceIndex: number;
  paint: SourcePaint;
  findings: OperationFinding[];
}

export type OperationRole = 'fill' | 'stroke' | 'guide' | 'relation';

export interface ElementFlags {
  outsideHoop?: boolean;
  degenerate?: boolean;
  unsupported?: boolean;
  selfIntersect?: boolean;
  densityHot?: boolean;
}

export interface ImportOperation {
  id: string;
  sourceObjectId: string;
  geometryIds: string[];
  /**
   * Source operations index paths in their sole geometry. Relationship
   * operations use one index per corresponding geometry ID.
   */
  pathIndices: number[];
  name: string;
  role: OperationRole;
  geomType: GeomType;
  /** Shared references into SourceGeometry.paths, retained for UI compatibility. */
  rings: Point[][];
  curveSpecs?: SvgCurveSpec[];
  bbox: BBox;
  areaMm2: number;
  sourceFill: string | null;
  sourceGradient: SvgLinearGradient | null;
  sourceStroke: string | null;
  sourceStrokeWidth: number | null;
  fillRule: 'nonzero' | 'evenodd';
  strategy: Strategy;
  threadIndex: number;
  holeMap: RingHole[];
  sourceOrder: number;
  order: number;
  include: boolean;
  /** Keep this operation's complete construction forward-only and contiguous when planning. */
  atomic: boolean;
  /** Start a new planner segment immediately before this operation. */
  planBarrierBefore: boolean;
  flags: ElementFlags;
  findings: OperationFinding[];
  groupPath: string[];
  /** Compatibility label for older UI code; full groupPath is authoritative. */
  groupId: string | null;
}

/** Compatibility alias while component names migrate from element to operation. */
export type ElementModel = ImportOperation;

export type Fabric = 'woven' | 'knit' | 'stretch' | 'denim' | 'canvas' | 'fleece';
export type SewOrderKey = 'depth' | 'color' | 'svg' | 'manual';
export type SvgPlanMode = 'off' | PlanMode;

export interface ImportField {
  shape: 'circle' | 'oval' | 'rectangle';
  widthMM: number;
  heightMM: number;
}

export interface StagedDocument {
  name: string;
  fabric: Fabric;
  threadProfile: ThreadProfileMode;
  planMode: SvgPlanMode;
  sewOrderKey: SewOrderKey;
  keepGroups: boolean;
  geometryToleranceMM: number;
  editableCurves?: boolean;
  scaleFactor: number;
  seed: number;
  palette: string[];
  threadMap: Record<string, number>;
  activeField: ImportField;
  sourceObjects: SourceObject[];
  geometries: SourceGeometry[];
  operations: ImportOperation[];
}

export function defaultStrategy(kind: StrategyKind): Strategy {
  switch (kind) {
    case 'skip':
      return { kind };
    case 'outline':
      return { kind, params: { stitchlen: 2.5, bean: false, beanCount: 3 } };
    case 'satinBorder':
      return {
        kind,
        params: {
          width: 1.6,
          density: 0.4,
          underlay: 'auto',
          shortstitch: true,
          cap: 'legacy',
          join: 'legacy',
        },
      };
    case 'tatamiFill':
      return {
        kind,
        params: {
          fillangle: 45,
          fillspacing: 0.4,
          filllen: 4,
          fillunderlay: 'auto',
          fillinset: 0,
        },
      };
    case 'gradientFill':
      return { kind, params: { pitch: 0.5, stitchlen: 2.5 } };
    case 'directionalFill':
      return { kind, params: { field: null, fillspacing: 0.4, fillunderlay: 'auto' } };
    case 'runningMotif':
      return {
        kind,
        params: { stitchlen: 2.5, bean: false, estitch: false, estitchLen: 2 },
      };
    case 'railPair':
      return {
        kind,
        params: {
          density: 0.4,
          underlay: 'auto',
          shortstitch: true,
          cap: 'legacy',
          join: 'legacy',
        },
      };
    case 'motifAlong':
      return { kind, params: { count: 6, scale: 1, stitchlen: 2.5, align: true } };
  }
}

export function bboxOf(rings: Point[][]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return Number.isFinite(minX)
    ? { minX, minY, maxX, maxY }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

export function pointInField(point: Point, field: ImportField): boolean {
  const halfWidth = field.widthMM / 2;
  const halfHeight = field.heightMM / 2;
  if (field.shape === 'rectangle') {
    return Math.abs(point[0]) <= halfWidth && Math.abs(point[1]) <= halfHeight;
  }
  const nx = halfWidth > 0 ? point[0] / halfWidth : Infinity;
  const ny = halfHeight > 0 ? point[1] / halfHeight : Infinity;
  return nx * nx + ny * ny <= 1 + 1e-9;
}

export function geometryOutsideField(rings: Point[][], field: ImportField): boolean {
  return rings.some((ring) => ring.some((point) => !pointInField(point, field)));
}

/** Retained for downstream callers that still validate a round field. */
export function bboxOutsideDisc(bbox: BBox, radius: number): boolean {
  return [
    [bbox.minX, bbox.minY],
    [bbox.maxX, bbox.minY],
    [bbox.maxX, bbox.maxY],
    [bbox.minX, bbox.maxY],
  ].some(([x, y]) => Math.hypot(x, y) > radius);
}

export const SEWABLE_RADIUS = 47;
