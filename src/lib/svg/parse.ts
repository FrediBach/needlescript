// ============================================================
// SVG-import staging parser (app-side — uses DOMParser).
//
// Stage 1 of the pipeline (spec §3): flatten the SVG to primitives,
// resolve transforms into hoop-space mm, and build the editable element
// model (spec §4) that the staging workspace reads from. Stage 2
// auto-suggestion (strategies + threads) is applied here too.
//
// Lives under src/lib/svg/ alongside svg-importer.ts but is NOT exported
// from engine.ts, so the DOM dependency never enters the library build.
// ============================================================

import {
  shapeToPolylines,
  matMul,
  matApply,
  parseTransform,
  matScale,
  simplifyRDP,
  type Point,
  type Matrix,
} from './svg-path.ts';
import { parseColorStr, rgbToHex, threadForColor, buildThreadMap } from './thread-map.ts';
import { autoSuggest } from './strategies.ts';
import {
  bboxOf,
  bboxOutsideDisc,
  type ElementModel,
  type GeomType,
  type StagedDocument,
} from './model.ts';
import { computeHoleMap, netFillArea, isClosedRing, selfIntersects } from './geometry.ts';

/** Sewable disc radius in mm (matches machine.ts LIMITS.sewableRadius). */
const SEWABLE_RADIUS = 47;

export interface ParseOptions {
  /** max dimension (mm) to fit the imported artwork into. */
  fitMM?: number;
  /** palette hex colours for nearest-thread mapping. */
  palette: string[];
  /** filename (with or without extension). */
  name?: string;
  /** segment budget for adaptive simplification. */
  maxSegments?: number;
}

interface RawShape {
  tag: string;
  subpaths: Point[][]; // SVG space
  fill: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  fillRule: 'nonzero' | 'evenodd';
  label: string;
  groupId: string | null;
  unsupported?: boolean;
}

export interface ParseResult {
  doc: StagedDocument;
  /** unsupported / ignored source tags, for the error summary. */
  ignored: Record<string, number>;
}

const SKIP = new Set([
  'defs',
  'symbol',
  'clippath',
  'mask',
  'marker',
  'pattern',
  'style',
  'metadata',
  'title',
  'desc',
  'script',
  'lineargradient',
  'radialgradient',
  'filter',
]);
const GROUPS = new Set(['svg', 'g', 'a', 'switch']);
/** tags we recognise but cannot stitch without outlining. */
const UNSUPPORTED = new Set(['text', 'tspan', 'image', 'foreignobject', 'use']);

function styleProp(el: Element, prop: string): string | null {
  const st = el.getAttribute('style');
  if (st) {
    const m = st.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
    if (m) return m[1];
  }
  return el.getAttribute(prop);
}

function resolvePaint(el: Element, prop: string, inherited: string | null): string | null {
  const raw = styleProp(el, prop);
  // gradient/pattern references → fall back to a mid grey so it maps to a thread
  if (raw && /^url\(/i.test(raw.trim())) return '#808080';
  const v = parseColorStr(raw);
  if (v === undefined) return inherited;
  return v === null ? null : rgbToHex(v as number[]);
}

function labelOf(el: Element, tag: string, counter: Map<string, number>): string {
  const id = el.getAttribute('id');
  if (id) return id;
  const cls = el.getAttribute('class');
  if (cls) return cls.split(/\s+/)[0];
  const n = (counter.get(tag) ?? 0) + 1;
  counter.set(tag, n);
  return `${tag} #${n}`;
}

function classifyGeom(tag: string, subpaths: Point[][]): GeomType {
  switch (tag) {
    case 'rect':
      return 'rect';
    case 'circle':
      return 'circle';
    case 'ellipse':
      return 'ellipse';
    case 'polygon':
      return 'polygon';
    case 'polyline':
      return 'polyline';
    case 'line':
      return 'openPath';
    default: {
      // path: closed if its first subpath closes
      const first = subpaths[0];
      return first && isClosedRing(first) ? 'closedPath' : 'openPath';
    }
  }
}

/** Walk the DOM, collecting raw shapes with resolved transforms (SVG space). */
function collectShapes(root: Element): { shapes: RawShape[]; ignored: Record<string, number> } {
  const shapes: RawShape[] = [];
  const ignored: Record<string, number> = {};
  const counter = new Map<string, number>();
  let groupCounter = 0;

  function walk(
    el: Element,
    mat: Matrix,
    paint: { fill: string | null; stroke: string | null },
    groupId: string | null,
  ) {
    if (el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;

    let m = mat;
    const tr = el.getAttribute('transform');
    if (tr) m = matMul(mat, parseTransform(tr));

    const p2 = {
      fill: resolvePaint(el, 'fill', paint.fill),
      stroke: resolvePaint(el, 'stroke', paint.stroke),
    };

    if (GROUPS.has(tag)) {
      const gid = tag === 'g' ? `g${++groupCounter}` : groupId;
      for (let i = 0; i < el.children.length; i++) walk(el.children[i], m, p2, gid);
      return;
    }

    if (UNSUPPORTED.has(tag)) {
      ignored[tag] = (ignored[tag] || 0) + 1;
      shapes.push({
        tag,
        subpaths: [],
        fill: p2.fill,
        stroke: p2.stroke,
        strokeWidth: null,
        fillRule: 'nonzero',
        label: labelOf(el, tag, counter),
        groupId,
        unsupported: true,
      });
      return;
    }

    const polys = shapeToPolylines(tag, (a) => el.getAttribute(a));
    if (polys === null) {
      ignored[tag] = (ignored[tag] || 0) + 1;
      return;
    }

    const fill = tag === 'line' ? null : p2.fill;
    if (fill === null && p2.stroke === null) return; // invisible

    const subs = polys.flatMap((pts) => (pts.length >= 2 ? [pts.map((p) => matApply(m, p))] : []));
    if (!subs.length) return;

    const swRaw = styleProp(el, 'stroke-width');
    const sw = swRaw ? parseFloat(swRaw) * matScale(m) : null;
    const fr = (styleProp(el, 'fill-rule') || '').trim() === 'evenodd' ? 'evenodd' : 'nonzero';

    shapes.push({
      tag,
      subpaths: subs,
      fill,
      stroke: p2.stroke,
      strokeWidth: sw && isFinite(sw) ? sw : null,
      fillRule: fr,
      label: labelOf(el, tag, counter),
      groupId,
    });
  }

  walk(root, [1, 0, 0, 1, 0, 0], { fill: '#000000', stroke: null }, null);
  return { shapes, ignored };
}

export function parseSvgToModel(svgText: string, opts: ParseOptions): ParseResult {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const pe = doc.querySelector('parseerror, parsererror');
  if (pe) throw new Error(`Not valid SVG: ${pe.textContent?.split('\n')[0].slice(0, 120)}`);
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg')
    throw new Error('No <svg> root element found.');

  const fitMM = Math.min(Math.max(opts.fitMM || 80, 5), 200);
  const palette = opts.palette;
  const maxSegments = opts.maxSegments ?? 1400;
  const name = (opts.name || 'import').replace(/\.svg$/i, '') || 'import';

  const { shapes, ignored } = collectShapes(root);
  const drawable = shapes.filter((s) => !s.unsupported && s.subpaths.length);
  if (!drawable.length && !shapes.some((s) => s.unsupported))
    throw new Error('No stitchable outlines found in this SVG.');

  // global bounding box over drawable shapes
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const s of drawable)
    for (const pl of s.subpaths)
      for (const [x, y] of pl) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const span = Math.max(maxX - minX, maxY - minY);
  const scale = span > 1e-9 ? fitMM / span : 1;
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;

  // scale, centre, flip-Y into hoop-space mm
  const toMM = (p: Point): Point => [(p[0] - cx) * scale, -(p[1] - cy) * scale];

  // adaptive simplification across all shapes (shared tolerance ladder)
  const tolLadder = [0.2, 0.3, 0.45, 0.7, 1.0, 1.5, 2.2];
  let tol = tolLadder[0];
  const mmShapes = drawable.map((s) => s.subpaths.map((pl) => pl.map(toMM)));
  let simplified: Point[][][] = mmShapes;
  for (const t of tolLadder) {
    tol = t;
    let segs = 0;
    simplified = mmShapes.map((subs) =>
      subs.map((pl) => {
        const sp = simplifyRDP(pl, tol);
        segs += Math.max(0, sp.length - 1);
        return sp;
      }),
    );
    if (segs <= maxSegments) break;
  }

  const threadMap = buildThreadMap(
    drawable.flatMap((s) => [s.fill, s.stroke]),
    palette,
  );

  const elements: ElementModel[] = [];
  let order = 0;

  drawable.forEach((s, idx) => {
    const rings = simplified[idx].filter((pl) => pl.length >= 2);
    if (!rings.length) return;
    const geomType = classifyGeom(s.tag, rings);
    const bbox = bboxOf(rings);
    const holeMap = computeHoleMap(rings);
    const areaMm2 = netFillArea(rings, holeMap);

    const flags: ElementModel['flags'] = {};
    if (bboxOutsideDisc(bbox, SEWABLE_RADIUS)) flags.outsideHoop = true;
    if (areaMm2 < 0.5 && geomType !== 'openPath' && geomType !== 'polyline')
      flags.degenerate = true;
    if (rings.some((r) => selfIntersects(r))) flags.selfIntersect = true;

    const colorSrc = s.fill ?? s.stroke;
    const threadIndex =
      colorSrc !== null ? (threadMap[colorSrc] ?? threadForColor(colorSrc, palette)) : 0;

    const strategy =
      flags.outsideHoop || flags.degenerate
        ? { kind: 'skip' as const }
        : autoSuggest(geomType, rings, s.fill, s.stroke, s.strokeWidth);

    elements.push({
      id: `el${idx}`,
      name: s.label,
      geomType,
      rings,
      bbox,
      areaMm2,
      sourceFill: s.fill,
      sourceStroke: s.stroke,
      sourceStrokeWidth: s.strokeWidth,
      fillRule: s.fillRule,
      strategy,
      threadIndex,
      holeMap,
      order: order++,
      include: !(flags.outsideHoop || flags.degenerate),
      flags,
      groupId: s.groupId,
    });
  });

  // unsupported elements (e.g. <text>) become skipped, flagged rows
  shapes
    .filter((s) => s.unsupported)
    .forEach((s, i) => {
      elements.push({
        id: `unsup${i}`,
        name: s.label,
        geomType: 'openPath',
        rings: [],
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        areaMm2: 0,
        sourceFill: s.fill,
        sourceStroke: s.stroke,
        sourceStrokeWidth: null,
        fillRule: 'nonzero',
        strategy: { kind: 'skip' },
        threadIndex: 0,
        holeMap: [],
        order: order++,
        include: false,
        flags: { unsupported: true },
        groupId: s.groupId,
      });
    });

  if (!elements.length) throw new Error('No stitchable outlines found in this SVG.');

  // default sew order: depth (large area first) so fills sit under detail
  const ordered = elements.slice().sort((a, b) => b.areaMm2 - a.areaMm2);
  ordered.forEach((el, i) => (el.order = i));

  const stagedDoc: StagedDocument = {
    name,
    fabric: 'woven',
    sewOrderKey: 'depth',
    keepGroups: true,
    resampleMM: 2.5,
    seed: 1,
    palette,
    threadMap,
    elements,
  };

  return { doc: stagedDoc, ignored };
}
