// Browser-side SVG DOM adapter. The normalized model it produces is fully
// platform-neutral and lives in src/lib/svg.

import {
  matApply,
  matMul,
  matScale,
  parseTransform,
  pathToCurveSpecs,
  shapeToPolylines,
  simplifyRDP,
  type Matrix,
  type Point,
  type SvgCurveSpec,
} from '../lib/svg/svg-path.ts';
import { computeHoleMap, isClosedRing, netFillArea, selfIntersects } from '../lib/svg/geometry.ts';
import { autoSuggest } from '../lib/svg/strategies.ts';
import { orderOperations } from '../lib/svg/ordering.ts';
import { buildThreadMap, parseColorStr, rgbToHex, threadForColor } from '../lib/svg/thread-map.ts';
import {
  bboxOf,
  geometryOutsideField,
  type GeomType,
  type ImportField,
  type ImportOperation,
  type OperationFinding,
  type SourceGeometry,
  type SourceGeometryKind,
  type SourceObject,
  type SourcePaint,
  type SvgGradientStop,
  type SvgLinearGradient,
  type StagedDocument,
} from '../lib/svg/model.ts';

export interface ParseOptions {
  fitMM?: number;
  palette: string[];
  name?: string;
  maxSegments?: number;
  /** Active sewable field, already inset from the physical frame. */
  field?: ImportField;
}

export interface ParseResult {
  doc: StagedDocument;
  ignored: Record<string, number>;
}

interface Presentation {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  fillRule: 'nonzero' | 'evenodd';
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  dashArray: number[] | null;
  dashOffset: number;
  display: boolean;
  visibility: boolean;
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
}

interface RawObject {
  id: string;
  name: string;
  tag: SourceGeometryKind | string;
  groupPath: string[];
  sourceIndex: number;
  paths: Point[][];
  curveSpecs?: SvgCurveSpec[];
  closed: boolean[];
  paint: Omit<SourcePaint, 'strokeWidthMM' | 'dashArrayMM' | 'dashOffsetMM' | 'fillGradient'> & {
    fillGradient: SvgLinearGradient | null;
    strokeWidth: number | null;
    dashArray: number[] | null;
    dashOffset: number;
  };
  sourceScale: number;
  findings: OperationFinding[];
  unsupported: boolean;
}

const SKIP_SUBTREES = new Set([
  'defs',
  'symbol',
  'clippath',
  'mask',
  'marker',
  'pattern',
  'metadata',
  'title',
  'desc',
  'script',
  'lineargradient',
  'radialgradient',
  'filter',
]);
const GROUPS = new Set(['svg', 'g', 'a', 'switch']);
const UNSUPPORTED = new Set(['text', 'tspan', 'image', 'foreignobject', 'use', 'style']);
const GEOMETRY_TAGS = new Set<SourceGeometryKind>([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);

const DEFAULT_PRESENTATION: Presentation = {
  fill: '#000000',
  stroke: null,
  strokeWidth: 1,
  fillRule: 'nonzero',
  lineCap: 'butt',
  lineJoin: 'miter',
  dashArray: null,
  dashOffset: 0,
  display: true,
  visibility: true,
  opacity: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
};

function styleMap(element: Element): Map<string, string> {
  const result = new Map<string, string>();
  for (const declaration of (element.getAttribute('style') ?? '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    result.set(
      declaration.slice(0, colon).trim().toLowerCase(),
      declaration.slice(colon + 1).trim(),
    );
  }
  return result;
}

function property(element: Element, styles: Map<string, string>, name: string): string | null {
  return styles.get(name) ?? element.getAttribute(name);
}

function numeric(raw: string | null, inherited: number): number {
  if (raw === null || raw.trim() === '' || raw.trim() === 'inherit') return inherited;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : inherited;
}

function opacity(raw: string | null, inherited: number): number {
  return Math.min(1, Math.max(0, numeric(raw, inherited)));
}

function color(
  raw: string | null,
  inherited: string | null,
  role: 'fill' | 'stroke',
  findings: OperationFinding[],
  sourceObjectId: string,
): string | null {
  if (raw === null || raw.trim() === '' || raw.trim() === 'inherit') return inherited;
  const value = raw.trim();
  if (/^url\(/i.test(value)) return value;
  const parsed = parseColorStr(value);
  if (parsed === undefined) {
    findings.push({
      code: 'unsupported-paint',
      severity: 'error',
      message: `unsupported ${role} paint '${value}'`,
      sourceObjectId,
    });
    return null;
  }
  return parsed === null ? null : rgbToHex(parsed);
}

function dashArray(raw: string | null, inherited: number[] | null): number[] | null {
  if (raw === null || raw.trim() === '' || raw.trim() === 'inherit') return inherited;
  if (raw.trim().toLowerCase() === 'none') return null;
  const values = raw
    .trim()
    .split(/[ ,]+/)
    .map(Number.parseFloat)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? values : null;
}

function presentation(
  element: Element,
  inherited: Presentation,
  findings: OperationFinding[],
  sourceObjectId: string,
): Presentation {
  const styles = styleMap(element);
  const rawDisplay = property(element, styles, 'display');
  const rawVisibility = property(element, styles, 'visibility');
  const fillRule = property(element, styles, 'fill-rule')?.trim().toLowerCase();
  const lineCap = property(element, styles, 'stroke-linecap');
  const lineJoin = property(element, styles, 'stroke-linejoin');
  return {
    fill: color(
      property(element, styles, 'fill'),
      inherited.fill,
      'fill',
      findings,
      sourceObjectId,
    ),
    stroke: color(
      property(element, styles, 'stroke'),
      inherited.stroke,
      'stroke',
      findings,
      sourceObjectId,
    ),
    strokeWidth: numeric(property(element, styles, 'stroke-width'), inherited.strokeWidth),
    fillRule: fillRule === 'evenodd' || fillRule === 'nonzero' ? fillRule : inherited.fillRule,
    lineCap:
      lineCap === 'round' || lineCap === 'square' || lineCap === 'butt'
        ? lineCap
        : inherited.lineCap,
    lineJoin:
      lineJoin === 'round' || lineJoin === 'bevel' || lineJoin === 'miter'
        ? lineJoin
        : inherited.lineJoin,
    dashArray: dashArray(property(element, styles, 'stroke-dasharray'), inherited.dashArray),
    dashOffset: numeric(property(element, styles, 'stroke-dashoffset'), inherited.dashOffset),
    display: inherited.display && rawDisplay?.trim().toLowerCase() !== 'none',
    visibility:
      rawVisibility === null || rawVisibility.trim() === 'inherit'
        ? inherited.visibility
        : !['hidden', 'collapse'].includes(rawVisibility.trim().toLowerCase()),
    opacity: inherited.opacity * opacity(property(element, styles, 'opacity'), 1),
    fillOpacity: opacity(property(element, styles, 'fill-opacity'), inherited.fillOpacity),
    strokeOpacity: opacity(property(element, styles, 'stroke-opacity'), inherited.strokeOpacity),
  };
}

function labelOf(element: Element, tag: string, counters: Map<string, number>): string {
  const id = element.getAttribute('id')?.trim();
  if (id) return id;
  const className = element.getAttribute('class')?.trim().split(/\s+/)[0];
  if (className) return className;
  const count = (counters.get(tag) ?? 0) + 1;
  counters.set(tag, count);
  return `${tag} #${count}`;
}

interface SvgViewport {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function localPaintId(value: string): string | null {
  const match = value.match(/^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/i);
  return match?.[1] ?? null;
}

function gradientHref(element: Element): string | null {
  const href = element.getAttribute('href') ?? element.getAttribute('xlink:href');
  return href?.trim().startsWith('#') ? href.trim().slice(1) : null;
}

function inheritedGradientAttribute(
  element: Element,
  name: string,
  gradients: Map<string, Element>,
  seen = new Set<Element>(),
): string | null {
  if (element.hasAttribute(name)) return element.getAttribute(name);
  if (seen.has(element)) return null;
  seen.add(element);
  const href = gradientHref(element);
  const parent = href ? gradients.get(href) : undefined;
  return parent ? inheritedGradientAttribute(parent, name, gradients, seen) : null;
}

function inheritedGradientStops(
  element: Element,
  gradients: Map<string, Element>,
  seen = new Set<Element>(),
): Element[] {
  const own = Array.from(element.children).filter(
    (child) => child.tagName.toLowerCase() === 'stop',
  );
  if (own.length || seen.has(element)) return own;
  seen.add(element);
  const href = gradientHref(element);
  const parent = href ? gradients.get(href) : undefined;
  return parent ? inheritedGradientStops(parent, gradients, seen) : [];
}

function gradientStops(
  element: Element,
  gradients: Map<string, Element>,
  findings: OperationFinding[],
  sourceObjectId: string,
): SvgGradientStop[] | null {
  const stops: SvgGradientStop[] = [];
  let previousOffset = 0;
  for (const stop of inheritedGradientStops(element, gradients)) {
    const styles = styleMap(stop);
    const rawOffset = property(stop, styles, 'offset')?.trim() ?? '0';
    const parsedOffset = Number.parseFloat(rawOffset);
    const offset = Math.max(
      previousOffset,
      Math.min(
        1,
        Math.max(
          0,
          Number.isFinite(parsedOffset) ? parsedOffset / (rawOffset.endsWith('%') ? 100 : 1) : 0,
        ),
      ),
    );
    const rawColor = property(stop, styles, 'stop-color') ?? '#000000';
    const parsedColor = parseColorStr(rawColor);
    const stopOpacity = opacity(property(stop, styles, 'stop-opacity'), 1);
    if (!Array.isArray(parsedColor) || stopOpacity < 1) {
      findings.push({
        code: 'unsupported-paint',
        severity: 'error',
        message:
          stopOpacity < 1
            ? 'transparent SVG gradient stops cannot be represented by thread channels'
            : `unsupported SVG gradient stop color '${rawColor}'`,
        sourceObjectId,
      });
      return null;
    }
    stops.push({ offset, color: rgbToHex(parsedColor) });
    previousOffset = offset;
  }
  if (stops.length < 2 || stops.length > 8) {
    findings.push({
      code: 'unsupported-paint',
      severity: 'error',
      message: `SVG gradients need 2–8 opaque color stops; found ${stops.length}`,
      sourceObjectId,
    });
    return null;
  }
  return stops;
}

function gradientCoordinate(
  raw: string | null,
  fallback: string,
  units: 'objectBoundingBox' | 'userSpaceOnUse',
  origin: number,
  span: number,
): number {
  const value = (raw ?? fallback).trim();
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  if (units === 'objectBoundingBox') return value.endsWith('%') ? parsed / 100 : parsed;
  return value.endsWith('%') ? origin + (parsed / 100) * span : parsed;
}

function resolveLinearGradient(
  value: string | null,
  localPaths: Point[][],
  elementMatrix: Matrix,
  gradients: Map<string, Element>,
  viewport: SvgViewport,
  findings: OperationFinding[],
  sourceObjectId: string,
  role: 'fill' | 'stroke',
): SvgLinearGradient | null {
  if (value === null || !/^url\(/i.test(value)) return null;
  const id = localPaintId(value);
  const element = id ? gradients.get(id) : undefined;
  if (!id || !element) {
    findings.push({
      code: 'unsupported-paint',
      severity: 'error',
      message: `${role} paint '${value}' does not reference a supported local gradient; choose an explicit representative thread color`,
      sourceObjectId,
    });
    return null;
  }
  if (role === 'stroke') {
    findings.push({
      code: 'unsupported-paint',
      severity: 'error',
      message: 'SVG gradient strokes are not supported; choose an explicit thread color',
      sourceObjectId,
    });
    return null;
  }
  if (element.tagName.toLowerCase() !== 'lineargradient') {
    findings.push({
      code: 'unsupported-paint',
      severity: 'error',
      message:
        'radial SVG gradients need a radial stitch recipe and are not imported as linear rows',
      sourceObjectId,
    });
    return null;
  }
  const spread = inheritedGradientAttribute(element, 'spreadMethod', gradients) ?? 'pad';
  if (spread !== 'pad') {
    findings.push({
      code: 'unsupported-paint',
      severity: 'error',
      message: `SVG gradient spreadMethod '${spread}' is not supported`,
      sourceObjectId,
    });
    return null;
  }
  const stops = gradientStops(element, gradients, findings, sourceObjectId);
  if (!stops) return null;
  const units =
    inheritedGradientAttribute(element, 'gradientUnits', gradients) === 'userSpaceOnUse'
      ? 'userSpaceOnUse'
      : 'objectBoundingBox';
  const localBounds = bboxOf(localPaths);
  const bboxWidth = localBounds.maxX - localBounds.minX;
  const bboxHeight = localBounds.maxY - localBounds.minY;
  if (units === 'objectBoundingBox' && (bboxWidth < 1e-9 || bboxHeight < 1e-9)) return null;
  const coordinate = (name: 'x1' | 'x2' | 'y1' | 'y2', fallback: string): number => {
    const xAxis = name.startsWith('x');
    return gradientCoordinate(
      inheritedGradientAttribute(element, name, gradients),
      fallback,
      units,
      xAxis ? viewport.minX : viewport.minY,
      xAxis ? viewport.width : viewport.height,
    );
  };
  const gradientTransform = parseTransform(
    inheritedGradientAttribute(element, 'gradientTransform', gradients) ?? '',
  );
  const coordinateMatrix =
    units === 'objectBoundingBox'
      ? matMul(
          elementMatrix,
          matMul(
            [bboxWidth, 0, 0, bboxHeight, localBounds.minX, localBounds.minY],
            gradientTransform,
          ),
        )
      : matMul(elementMatrix, gradientTransform);
  const start = matApply(coordinateMatrix, [coordinate('x1', '0%'), coordinate('y1', '0%')]);
  const end = matApply(coordinateMatrix, [coordinate('x2', '100%'), coordinate('y2', '0%')]);
  if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-9) {
    findings.push({
      code: 'unsupported-paint',
      severity: 'error',
      message: `SVG linearGradient '#${id}' has a zero-length vector`,
      sourceObjectId,
    });
    return null;
  }
  return { kind: 'linear', id, start, end, stops };
}

function transformCurveSpec(spec: SvgCurveSpec, matrix: Matrix): SvgCurveSpec {
  return {
    closed: spec.closed,
    anchors: spec.anchors.map(([position, incoming, outgoing]) => {
      const mapped = matApply(matrix, position);
      const handle = (relative: Point): Point => {
        const tip = matApply(matrix, [position[0] + relative[0], position[1] + relative[1]]);
        return [tip[0] - mapped[0], tip[1] - mapped[1]];
      };
      return [mapped, handle(incoming), handle(outgoing)];
    }),
  };
}

function collectObjects(root: Element): { objects: RawObject[]; ignored: Record<string, number> } {
  const objects: RawObject[] = [];
  const ignored: Record<string, number> = {};
  const counters = new Map<string, number>();
  let sourceIndex = 0;
  const gradients = new Map<string, Element>();
  for (const element of Array.from(root.getElementsByTagName('*'))) {
    const tag = element.tagName.toLowerCase();
    const id = element.getAttribute('id');
    if (id && (tag === 'lineargradient' || tag === 'radialgradient')) gradients.set(id, element);
  }
  const viewBoxValues = (root.getAttribute('viewBox') ?? '').trim().split(/[ ,]+/).map(Number);
  const viewport: SvgViewport =
    viewBoxValues.length === 4 && viewBoxValues.every(Number.isFinite)
      ? {
          minX: viewBoxValues[0],
          minY: viewBoxValues[1],
          width: viewBoxValues[2],
          height: viewBoxValues[3],
        }
      : {
          minX: 0,
          minY: 0,
          width: numeric(root.getAttribute('width'), 1),
          height: numeric(root.getAttribute('height'), 1),
        };

  function walk(
    element: Element,
    matrix: Matrix,
    inherited: Presentation,
    groupPath: string[],
  ): void {
    const tag = element.tagName.toLowerCase();
    if (SKIP_SUBTREES.has(tag)) return;
    const id = `source-${sourceIndex}`;
    const findings: OperationFinding[] = [];
    for (const attribute of [
      'clip-path',
      'mask',
      'filter',
      'marker-start',
      'marker-mid',
      'marker-end',
    ]) {
      if (!element.hasAttribute(attribute)) continue;
      findings.push({
        code: 'unsupported-element',
        severity: 'warning',
        message: `${attribute} is not applied during SVG import`,
        sourceObjectId: id,
      });
    }
    const paint = presentation(element, inherited, findings, id);
    let transformed = matrix;
    const transform = element.getAttribute('transform');
    if (transform) transformed = matMul(matrix, parseTransform(transform));

    if (GROUPS.has(tag)) {
      const nextGroupPath =
        tag === 'g' ? [...groupPath, labelOf(element, 'group', counters)] : groupPath;
      for (const child of Array.from(element.children)) {
        walk(child, transformed, paint, nextGroupPath);
      }
      return;
    }

    const name = labelOf(element, tag, counters);
    if (UNSUPPORTED.has(tag)) {
      ignored[tag] = (ignored[tag] ?? 0) + 1;
      findings.push({
        code: 'unsupported-element',
        severity: 'warning',
        message: `<${tag}> is retained as a finding but cannot be converted`,
        sourceObjectId: id,
      });
      objects.push({
        id,
        name,
        tag,
        groupPath,
        sourceIndex: sourceIndex++,
        paths: [],
        closed: [],
        paint: {
          fill: paint.fill,
          fillGradient: null,
          stroke: paint.stroke,
          strokeWidth: null,
          fillRule: paint.fillRule,
          lineCap: paint.lineCap,
          lineJoin: paint.lineJoin,
          dashArray: paint.dashArray,
          dashOffset: paint.dashOffset,
          visible: false,
        },
        sourceScale: matScale(transformed),
        findings,
        unsupported: true,
      });
      return;
    }

    if (!GEOMETRY_TAGS.has(tag as SourceGeometryKind)) {
      ignored[tag] = (ignored[tag] ?? 0) + 1;
      return;
    }
    const polylines = shapeToPolylines(tag, (attribute) => element.getAttribute(attribute));
    if (polylines === null) {
      ignored[tag] = (ignored[tag] ?? 0) + 1;
      return;
    }
    const localPaths = polylines.filter((path) => path.length >= 2);
    const paths = localPaths.map((path) => path.map((point) => matApply(transformed, point)));
    if (!paths.length) return;
    const visible = paint.display && paint.visibility && paint.opacity > 0;
    const fillGradient =
      tag === 'line' || paint.fillOpacity === 0
        ? null
        : resolveLinearGradient(
            paint.fill,
            localPaths,
            transformed,
            gradients,
            viewport,
            findings,
            id,
            'fill',
          );
    if (paint.strokeOpacity !== 0) {
      resolveLinearGradient(
        paint.stroke,
        localPaths,
        transformed,
        gradients,
        viewport,
        findings,
        id,
        'stroke',
      );
    }
    const fill =
      tag === 'line' || paint.fillOpacity === 0
        ? null
        : (fillGradient?.stops[0]?.color ?? (/^url\(/i.test(paint.fill ?? '') ? null : paint.fill));
    const stroke =
      paint.strokeOpacity === 0 || /^url\(/i.test(paint.stroke ?? '') ? null : paint.stroke;
    if ((!visible || (fill === null && stroke === null)) && findings.length === 0) return;
    const curveSpecs =
      tag === 'path' && element.getAttribute('d')
        ? pathToCurveSpecs(element.getAttribute('d')!).map((spec) =>
            transformCurveSpec(spec, transformed),
          )
        : undefined;
    objects.push({
      id,
      name,
      tag: tag as SourceGeometryKind,
      groupPath,
      sourceIndex: sourceIndex++,
      paths,
      curveSpecs,
      closed: paths.map((path, index) => curveSpecs?.[index]?.closed ?? isClosedRing(path)),
      paint: {
        fill,
        fillGradient,
        stroke,
        strokeWidth: stroke === null ? null : paint.strokeWidth,
        fillRule: paint.fillRule,
        lineCap: paint.lineCap,
        lineJoin: paint.lineJoin,
        dashArray: paint.dashArray,
        dashOffset: paint.dashOffset,
        visible,
      },
      sourceScale: matScale(transformed),
      findings,
      unsupported: false,
    });
  }

  walk(root, [1, 0, 0, 1, 0, 0], DEFAULT_PRESENTATION, []);
  return { objects, ignored };
}

function operationGeomType(
  kind: SourceGeometryKind,
  closed: boolean[],
  pathIndices: number[],
): GeomType {
  const selectedClosed = pathIndices.every((index) => closed[index]);
  if (!selectedClosed) return kind === 'polyline' ? 'polyline' : 'openPath';
  if (kind === 'rect' || kind === 'circle' || kind === 'ellipse' || kind === 'polygon') return kind;
  return 'closedPath';
}

function scaleForField(paths: Point[][], field: ImportField): number {
  let scale = 1;
  const halfWidth = field.widthMM / 2;
  const halfHeight = field.heightMM / 2;
  for (const path of paths) {
    for (const [x, y] of path) {
      if (field.shape === 'rectangle') {
        if (Math.abs(x) > halfWidth) scale = Math.min(scale, halfWidth / Math.abs(x));
        if (Math.abs(y) > halfHeight) scale = Math.min(scale, halfHeight / Math.abs(y));
      } else {
        const radius = Math.hypot(x / halfWidth, y / halfHeight);
        if (radius > 1) scale = Math.min(scale, 1 / radius);
      }
    }
  }
  return Number.isFinite(scale) ? Math.max(0, scale) : 1;
}

function totalPathLength(paths: Point[][]): number {
  let total = 0;
  for (const path of paths) {
    for (let index = 1; index < path.length; index++) {
      total += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
    }
  }
  return total;
}

function scaleCurve(spec: SvgCurveSpec, scale: number, center: Point): SvgCurveSpec {
  return {
    ...spec,
    anchors: spec.anchors.map(([position, incoming, outgoing]) => [
      [(position[0] - center[0]) * scale, -(position[1] - center[1]) * scale],
      [incoming[0] * scale, -incoming[1] * scale],
      [outgoing[0] * scale, -outgoing[1] * scale],
    ]),
  };
}

function physicalPaint(
  raw: RawObject,
  physicalScale: number,
  coordinateScale = 1,
  center: Point = [0, 0],
): SourcePaint {
  const mapGradientPoint = ([x, y]: Point): Point => [
    (x - center[0]) * coordinateScale,
    -(y - center[1]) * coordinateScale,
  ];
  return {
    fill: raw.paint.fill,
    fillGradient: raw.paint.fillGradient
      ? {
          ...raw.paint.fillGradient,
          start: mapGradientPoint(raw.paint.fillGradient.start),
          end: mapGradientPoint(raw.paint.fillGradient.end),
        }
      : null,
    stroke: raw.paint.stroke,
    strokeWidthMM: raw.paint.strokeWidth === null ? null : raw.paint.strokeWidth * physicalScale,
    fillRule: raw.paint.fillRule,
    lineCap: raw.paint.lineCap,
    lineJoin: raw.paint.lineJoin,
    dashArrayMM: raw.paint.dashArray?.map((value) => value * physicalScale) ?? null,
    dashOffsetMM: raw.paint.dashOffset * physicalScale,
    visible: raw.paint.visible,
  };
}

export function parseSvgToModel(svgText: string, options: ParseOptions): ParseResult {
  const xml = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const parseError = xml.querySelector('parseerror, parsererror');
  if (parseError) {
    throw new Error(`Not valid SVG: ${parseError.textContent?.split('\n')[0].slice(0, 120)}`);
  }
  const root = xml.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg')
    throw new Error('No <svg> root element found.');

  const name = (options.name ?? 'import').replace(/\.svg$/i, '') || 'import';
  const fitMM = Math.min(Math.max(options.fitMM ?? 80, 5), 200);
  const maxSegments = options.maxSegments ?? 1400;
  const activeField = options.field ?? { shape: 'circle', widthMM: 94, heightMM: 94 };
  const { objects: rawObjects, ignored } = collectObjects(root);
  const drawable = rawObjects.filter((object) => !object.unsupported && object.paths.length);
  if (!drawable.length) {
    if (!rawObjects.some((object) => object.findings.length)) {
      throw new Error('No stitchable outlines found in this SVG.');
    }
    const sourceObjects = rawObjects.map((raw) => ({
      id: raw.id,
      name: raw.name,
      geometryId: null,
      groupPath: raw.groupPath,
      sourceIndex: raw.sourceIndex,
      paint: physicalPaint(raw, raw.sourceScale),
      findings: raw.findings,
    }));
    return {
      doc: {
        name,
        fabric: 'woven',
        sewOrderKey: 'depth',
        keepGroups: true,
        geometryToleranceMM: 0.2,
        editableCurves: false,
        scaleFactor: 1,
        seed: 1,
        palette: options.palette,
        threadMap: buildThreadMap(
          sourceObjects.flatMap((object) => [object.paint.fill, object.paint.stroke]),
          options.palette,
        ),
        activeField,
        sourceObjects,
        geometries: [],
        operations: [],
      },
      ignored,
    };
  }

  const allPoints = drawable.flatMap((object) => object.paths.flat());
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of allPoints) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const center: Point = [(minX + maxX) / 2, (minY + maxY) / 2];
  const sourceSpan = Math.max(maxX - minX, maxY - minY);
  const initialScale = sourceSpan > 1e-9 ? fitMM / sourceSpan : 1;
  const initiallyScaled = drawable.flatMap((object) =>
    object.paths.map((path) =>
      path.map(
        (point) =>
          [(point[0] - center[0]) * initialScale, -(point[1] - center[1]) * initialScale] as Point,
      ),
    ),
  );
  const fieldScale = scaleForField(initiallyScaled, activeField);
  const finalScale = initialScale * fieldScale;

  const sourceObjects: SourceObject[] = [];
  const geometries: SourceGeometry[] = [];
  const geometryBySource = new Map<string, SourceGeometry>();
  for (const raw of rawObjects) {
    const geometryId = raw.unsupported ? null : `geometry-${raw.sourceIndex}`;
    const physicalScale = raw.sourceScale * finalScale;
    const paint = physicalPaint(raw, physicalScale, finalScale, center);
    sourceObjects.push({
      id: raw.id,
      name: raw.name,
      geometryId,
      groupPath: raw.groupPath,
      sourceIndex: raw.sourceIndex,
      paint,
      findings: raw.findings,
    });
    if (geometryId === null) continue;
    const sourcePaths = raw.paths.map((path) =>
      path.map(
        (point) =>
          [(point[0] - center[0]) * finalScale, -(point[1] - center[1]) * finalScale] as Point,
      ),
    );
    geometries.push({
      id: geometryId,
      sourceObjectId: raw.id,
      name: raw.name,
      kind: raw.tag as SourceGeometryKind,
      groupPath: raw.groupPath,
      paths: sourcePaths,
      sourcePaths,
      curveSpecs: raw.curveSpecs?.map((spec) => scaleCurve(spec, finalScale, center)),
      closed: raw.closed,
      bbox: bboxOf(sourcePaths),
      outputMode: raw.curveSpecs ? 'curve' : 'compact',
      flags: {},
    });
    geometryBySource.set(raw.id, geometries[geometries.length - 1]);
  }

  const toleranceLadder = [0.2, 0.3, 0.45, 0.7, 1, 1.5, 2.2];
  let geometryToleranceMM = toleranceLadder[0];
  for (const tolerance of toleranceLadder) {
    geometryToleranceMM = tolerance;
    let segmentCount = 0;
    for (const geometry of geometries) {
      geometry.paths = geometry.sourcePaths.map((path) => {
        const simplified = simplifyRDP(path, tolerance);
        segmentCount += Math.max(0, simplified.length - 1);
        return simplified;
      });
      geometry.bbox = bboxOf(geometry.paths);
    }
    if (segmentCount <= maxSegments) break;
  }

  const threadMap = buildThreadMap(
    sourceObjects.flatMap((object) => [
      object.paint.fill,
      object.paint.stroke,
      ...(object.paint.fillGradient?.stops.map((stop) => stop.color) ?? []),
    ]),
    options.palette,
  );
  const operations: ImportOperation[] = [];
  for (const sourceObject of sourceObjects) {
    const geometry = geometryBySource.get(sourceObject.id);
    if (!geometry || !sourceObject.paint.visible) continue;
    geometry.flags.outsideField = geometryOutsideField(geometry.paths, activeField) || undefined;
    geometry.flags.selfIntersect = geometry.paths.some((path) => selfIntersects(path)) || undefined;
    const sharedFindings = [...sourceObject.findings];
    if (geometry.flags.outsideField) {
      sharedFindings.push({
        code: 'outside-field',
        severity: 'error',
        message: 'geometry lies outside the active sewable field',
        sourceObjectId: sourceObject.id,
      });
    }
    if (geometry.flags.selfIntersect) {
      sharedFindings.push({
        code: 'self-intersection',
        severity: 'warning',
        message: 'self-intersecting fill topology uses the source-rule fallback',
        sourceObjectId: sourceObject.id,
      });
    }

    const makeOperation = (role: 'fill' | 'stroke', pathIndices: number[]): void => {
      const rings = pathIndices.map((index) => geometry.paths[index]);
      const curveSpecs = geometry.curveSpecs
        ? pathIndices.map((index) => geometry.curveSpecs![index])
        : undefined;
      const geomType = operationGeomType(geometry.kind, geometry.closed, pathIndices);
      const holeMap =
        role === 'fill'
          ? computeHoleMap(rings, sourceObject.paint.fillRule)
          : computeHoleMap(rings);
      const areaMm2 = role === 'fill' ? netFillArea(rings, holeMap) : 0;
      const degenerate = role === 'fill' ? areaMm2 < 0.5 : totalPathLength(rings) < 0.5;
      const colorValue = role === 'fill' ? sourceObject.paint.fill : sourceObject.paint.stroke;
      const sourceGradient = role === 'fill' ? sourceObject.paint.fillGradient : null;
      const operationId = `${sourceObject.id}-${role}`;
      const findings = sharedFindings.map((finding) => ({ ...finding, operationId }));
      if (degenerate) {
        findings.push({
          code: 'degenerate',
          severity: 'error',
          message: role === 'fill' ? 'filled region is too small' : 'stroke path is too short',
          sourceObjectId: sourceObject.id,
          operationId,
        });
      }
      const strokeWidthMM = sourceObject.paint.strokeWidthMM;
      if (role === 'stroke' && (strokeWidthMM ?? 0) > 8) {
        findings.push({
          code: 'unsafe-satin-width',
          severity: 'warning',
          message: `source stroke is ${strokeWidthMM!.toFixed(1)} mm wide; using a running outline`,
          sourceObjectId: sourceObject.id,
          operationId,
          suggestedRecipe: 'outline',
        });
      }
      const strategy = degenerate
        ? { kind: 'skip' as const }
        : sourceGradient
          ? { kind: 'gradientFill' as const, params: { pitch: 0.5, stitchlen: 2.5 } }
          : autoSuggest(
              geomType,
              rings,
              role === 'fill' ? colorValue : null,
              role === 'stroke' ? colorValue : null,
              role === 'stroke' ? strokeWidthMM : null,
            );
      operations.push({
        id: operationId,
        sourceObjectId: sourceObject.id,
        geometryIds: [geometry.id],
        pathIndices,
        name: `${sourceObject.name} · ${role}`,
        role,
        geomType,
        rings,
        curveSpecs,
        bbox: bboxOf(rings),
        areaMm2,
        sourceFill: role === 'fill' ? colorValue : null,
        sourceGradient,
        sourceStroke: role === 'stroke' ? colorValue : null,
        sourceStrokeWidth: role === 'stroke' ? strokeWidthMM : null,
        fillRule: sourceObject.paint.fillRule,
        strategy,
        threadIndex:
          colorValue === null
            ? 0
            : (threadMap[colorValue] ?? threadForColor(colorValue, options.palette)),
        holeMap,
        sourceOrder: sourceObject.sourceIndex * 2 + (role === 'stroke' ? 1 : 0),
        order: operations.length,
        include: !geometry.flags.outsideField && !degenerate,
        flags: {
          outsideHoop: geometry.flags.outsideField,
          degenerate: degenerate || undefined,
          selfIntersect: geometry.flags.selfIntersect,
        },
        findings,
        groupPath: sourceObject.groupPath,
        groupId: sourceObject.groupPath.at(-1) ?? null,
      });
    };

    const closedIndices = geometry.closed.flatMap((closed, index) => (closed ? [index] : []));
    if (
      (sourceObject.paint.fill !== null || sourceObject.paint.fillGradient !== null) &&
      closedIndices.length
    )
      makeOperation('fill', closedIndices);
    if (sourceObject.paint.stroke !== null)
      makeOperation(
        'stroke',
        geometry.paths.map((_, index) => index),
      );
  }
  if (!operations.length && !sourceObjects.some((object) => object.findings.length)) {
    throw new Error('No stitchable outlines found in this SVG.');
  }

  const ordered = orderOperations(operations, 'depth', true);
  ordered.forEach((operation, index) => {
    operation.order = index;
  });
  return {
    doc: {
      name,
      fabric: 'woven',
      sewOrderKey: 'depth',
      keepGroups: true,
      geometryToleranceMM,
      editableCurves: false,
      scaleFactor: fieldScale,
      seed: 1,
      palette: options.palette,
      threadMap,
      activeField,
      sourceObjects,
      geometries,
      operations,
    },
    ignored,
  };
}
