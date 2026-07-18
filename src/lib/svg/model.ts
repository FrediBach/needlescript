// ============================================================
// SVG-import staging model.
//
// The element model is the single source of truth for the staging
// workspace: the parser produces it, every panel reads/edits it, and
// the emitter walks it to produce NeedleScript. Everything here is in
// hoop-space millimetres (transforms already resolved) and DOM-free.
// ============================================================

import type { Pt } from '../genmath.ts';
import type { SvgCurveSpec } from './svg-path.ts';

export type Point = Pt; // [number, number], hoop-space mm

/** SVG primitive classification, used for strategy eligibility. */
export type GeomType =
  'closedPath' | 'openPath' | 'rect' | 'circle' | 'ellipse' | 'polyline' | 'polygon';

export type StrategyKind =
  'skip' | 'outline' | 'satinBorder' | 'tatamiFill' | 'directionalFill' | 'runningMotif';

type UnderlayMode = 'auto' | 'center' | 'edge' | 'zigzag' | 'off';
type FillUnderlay = 'auto' | 'edge' | 'tatami' | 'off';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ---------- strategy parameters ----------

interface OutlineParams {
  stitchlen: number;
  bean: boolean;
  beanCount: number;
}
interface SatinBorderParams {
  width: number;
  density: number;
  underlay: UnderlayMode;
  shortstitch: boolean;
}
interface TatamiFillParams {
  fillangle: number;
  fillspacing: number;
  filllen: number;
  fillunderlay: FillUnderlay;
}
interface DirectionalFillParams {
  /** name of an `@`-referenceable reporter in the editor, or null = scaffold */
  field: string | null;
  fillspacing: number;
}
interface RunningMotifParams {
  stitchlen: number;
  bean: boolean;
  estitch: boolean;
  estitchLen: number;
}

/** Discriminated union: the assigned strategy plus its own parameter object. */
export type Strategy =
  | { kind: 'skip' }
  | { kind: 'outline'; params: OutlineParams }
  | { kind: 'satinBorder'; params: SatinBorderParams }
  | { kind: 'tatamiFill'; params: TatamiFillParams }
  | { kind: 'directionalFill'; params: DirectionalFillParams }
  | { kind: 'runningMotif'; params: RunningMotifParams };

// ---------- per-ring hole decision ----------

export interface RingHole {
  /** true ⇒ this ring cuts a hole; false ⇒ solid (stacked) ring. */
  hole: boolean;
  /** nesting depth (0 = outermost). */
  depth: number;
  /** winding orientation of the ring. */
  orientation: 'cw' | 'ccw';
}

// ---------- validation findings ----------

export interface ElementFlags {
  outsideHoop?: boolean;
  degenerate?: boolean;
  unsupported?: boolean;
  selfIntersect?: boolean;
  densityHot?: boolean;
}

export interface ElementModel {
  /** stable key for selection / linking. */
  id: string;
  /** user-editable label, defaulted from SVG id/class or `path #3`. */
  name: string;
  geomType: GeomType;
  /** subpaths in hoop-space mm, transform-resolved. */
  rings: Point[][];
  /** Original cubic geometry for SVG path subpaths, when it can be round-tripped. */
  curveSpecs?: SvgCurveSpec[];
  bbox: BBox;
  areaMm2: number;
  sourceFill: string | null;
  sourceStroke: string | null;
  /** stroke-width in hoop-space mm, if the source had a stroke. */
  sourceStrokeWidth: number | null;
  fillRule: 'nonzero' | 'evenodd';
  strategy: Strategy;
  /** resolved palette slot. */
  threadIndex: number;
  /** per-ring Hole/Solid decision (index-aligned with `rings`). */
  holeMap: RingHole[];
  /** sew position (= row position in the list). */
  order: number;
  /** false ⇒ Skip; excluded from emit. */
  include: boolean;
  flags: ElementFlags;
  /** id of the enclosing SVG `<g>`, for grouping; null at top level. */
  groupId: string | null;
}

export type Fabric = 'woven' | 'knit' | 'stretch' | 'denim' | 'canvas' | 'fleece';
export type SewOrderKey = 'depth' | 'color' | 'manual';

export interface StagedDocument {
  /** filename without extension. */
  name: string;
  fabric: Fabric;
  sewOrderKey: SewOrderKey;
  /** keep `<g>` groups contiguous when auto-ordering. */
  keepGroups: boolean;
  /** mm spacing every curve is resampled to before sewing. */
  resampleMM: number;
  /** Emit SVG path curves as annotated editable specs instead of flattened literals. */
  editableCurves?: boolean;
  /**
   * Uniform scale applied on top of the parser's initial fit-to-hoop scale.
   * 1.0 = no change; 2.0 = twice as large. Applied in-place to all ring
   * coordinates so every consumer (emit, overlays, hit-test) sees the
   * correct geometry without extra wiring.
   */
  scaleFactor: number;
  seed: number;
  /** palette hex colours, indexed by threadIndex. */
  palette: string[];
  /** source-colour hex → palette slot (document-wide thread mapping). */
  threadMap: Record<string, number>;
  elements: ElementModel[];
}

// ---------- defaults ----------

/** A fresh strategy of the given kind with sensible default parameters. */
export function defaultStrategy(kind: StrategyKind): Strategy {
  switch (kind) {
    case 'skip':
      return { kind };
    case 'outline':
      return { kind, params: { stitchlen: 2.5, bean: false, beanCount: 3 } };
    case 'satinBorder':
      return {
        kind,
        params: { width: 1.6, density: 0.4, underlay: 'auto', shortstitch: true },
      };
    case 'tatamiFill':
      return {
        kind,
        params: { fillangle: 45, fillspacing: 0.4, filllen: 4, fillunderlay: 'auto' },
      };
    case 'directionalFill':
      return { kind, params: { field: null, fillspacing: 0.4 } };
    case 'runningMotif':
      return {
        kind,
        params: { stitchlen: 2.5, bean: false, estitch: false, estitchLen: 2 },
      };
  }
}

export function bboxOf(rings: Point[][]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** True when every ring's bbox corner lies within the sewable disc. */
export function bboxOutsideDisc(bbox: BBox, radius: number): boolean {
  const corners: Point[] = [
    [bbox.minX, bbox.minY],
    [bbox.maxX, bbox.minY],
    [bbox.maxX, bbox.maxY],
    [bbox.minX, bbox.maxY],
  ];
  return corners.some(([x, y]) => Math.hypot(x, y) > radius);
}

/** Sewable disc radius in mm — matches machine.ts LIMITS.sewableRadius. */
export const SEWABLE_RADIUS = 47;
