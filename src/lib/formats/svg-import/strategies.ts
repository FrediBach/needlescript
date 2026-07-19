// ============================================================
// SVG-import strategy catalogue (pure, DOM-free).
//
// Each strategy maps an element to a stitch construction and exposes
// a tight, schema-described parameter set (spec §9). The schema drives
// the Inspector generically; `eligible` drives the disable logic; and
// `emit` produces the per-element sew block referenced by the emitter.
// ============================================================

import type {
  ElementModel,
  GeomType,
  OperationRole,
  RingHole,
  Strategy,
  StrategyKind,
} from './model.ts';
import { defaultStrategy } from './model.ts';
import { isClosedRing } from './geometry.ts';
import { FILL_CONSTRUCTION_RANGES } from '../../embroidery/fill-profile.ts';
import { SATIN_CAP_MODES, SATIN_JOIN_MODES } from '../../embroidery/satin-profile.ts';
import { FILL_UNDERLAY_MODES, SATIN_UNDERLAY_MODES } from '../../embroidery/embroidery-registry.ts';

// ---------- parameter schema ----------

export type ParamControl =
  | {
      kind: 'slider';
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      unit?: string;
      tooltip: string;
    }
  | {
      kind: 'select';
      key: string;
      label: string;
      options: { value: string; label: string }[];
      tooltip: string;
    }
  | { kind: 'switch'; key: string; label: string; tooltip: string };

export interface EmitContext {
  /** binding name per operation-local path index. */
  ringNames: string[];
  holeMap: RingHole[];
  /** Operation-local ring indices grouped for even-odd beginfill blocks. */
  fillGroups: number[][];
  scaffoldName: string;
  /** Import alias for std.layout.alongpath when a relationship needs it. */
  layoutName?: string;
  /** Collision-free declarations used by relationship recipes. */
  helperName?: string;
  derivedName?: string;
  gradientReporterName?: string;
  gradientGroupsName?: string;
  gradientColorsName?: string;
  gradientRowsName?: string;
  gradientRouteName?: string;
  gradientColors?: (number | string)[];
}

export interface StrategyDef {
  kind: StrategyKind;
  label: string;
  eligible: (g: GeomType, role?: OperationRole) => boolean;
  /** controls shown in the Inspector for the current params. */
  controls: ParamControl[];
  /** sew-block body lines (no `color`/`trim`; the emitter adds those). */
  emit: (el: ElementModel, ctx: EmitContext) => string[];
}

const CLOSED: GeomType[] = ['closedPath', 'polygon', 'rect', 'circle', 'ellipse'];
const OPEN: GeomType[] = ['openPath', 'polyline'];

export function isClosedGeom(g: GeomType): boolean {
  return CLOSED.includes(g);
}

function fmt(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

function fmtPrecise(v: number): string {
  const rounded = Math.round(v * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

const UNDERLAY_OPTS = SATIN_UNDERLAY_MODES.map((mode) => ({ value: mode, label: mode }));
const FILL_UNDERLAY_OPTS = FILL_UNDERLAY_MODES.map((mode) => ({ value: mode, label: mode }));

const SATIN_CAP_OPTS = SATIN_CAP_MODES.map((mode) => ({ value: mode, label: mode }));
const SATIN_JOIN_OPTS = SATIN_JOIN_MODES.map((mode) => ({ value: mode, label: mode }));

// ---------- per-strategy emit helpers ----------

function startRing(name: string): string {
  return `up setpos(first(${name})) down`;
}

/** Isolate sticky construction settings without hiding required top-level declarations. */
function stitchScope(lines: string[], declarations: string[] = []): string[] {
  return [...declarations, 'stitchscope [', ...lines.map((line) => `  ${line}`), ']'];
}

/** beginfill/endfill over outer + hole rings (shared by tatami & directional). */
function fillBody(ctx: EmitContext, indent = '  '): string[] {
  const lines: string[] = [];
  for (const group of ctx.fillGroups) {
    const first = ctx.ringNames[group[0]];
    if (!first) continue;
    lines.push(startRing(first));
    lines.push('beginfill');
    group.forEach((index, position) => {
      const name = ctx.ringNames[index];
      if (!name) return;
      if (position > 0) lines.push(`${indent}${startRing(name)}`);
      lines.push(`${indent}sewpath(${name})`);
    });
    lines.push('endfill');
  }
  return lines;
}

function gradientWeights(el: ElementModel): string[] {
  const gradient = el.sourceGradient;
  if (!gradient) return [];
  const oneHot = (index: number): string =>
    `[${gradient.stops.map((_, stopIndex) => (stopIndex === index ? '1' : '0')).join(', ')}]`;
  const lines: string[] = [];
  const first = gradient.stops[0];
  if (first.offset > 0) lines.push(`  if t < ${fmtPrecise(first.offset)} [ return ${oneHot(0)} ]`);
  for (let index = 0; index < gradient.stops.length - 1; index++) {
    const low = gradient.stops[index];
    const high = gradient.stops[index + 1];
    const span = high.offset - low.offset;
    if (span <= 1e-9) continue;
    const blend = `(t - ${fmtPrecise(low.offset)}) / ${fmtPrecise(span)}`;
    const weights = gradient.stops.map((_, stopIndex) => {
      if (stopIndex === index) return `1 - ${blend}`;
      if (stopIndex === index + 1) return blend;
      return '0';
    });
    lines.push(`  if t < ${fmtPrecise(high.offset)} [ return [${weights.join(', ')}] ]`);
  }
  lines.push(`  return ${oneHot(gradient.stops.length - 1)}`);
  return lines;
}

// ---------- the catalogue ----------

export const STRATEGIES: Record<StrategyKind, StrategyDef> = {
  skip: {
    kind: 'skip',
    label: 'Skip',
    eligible: () => true,
    controls: [],
    emit: () => [],
  },

  outline: {
    kind: 'outline',
    label: 'Outline',
    eligible: () => true,
    controls: [
      {
        kind: 'slider',
        key: 'stitchlen',
        label: 'stitch length',
        min: 1,
        max: 6,
        step: 0.1,
        unit: 'mm',
        tooltip: 'running-stitch length along the path, 1–6 mm',
      },
      {
        kind: 'switch',
        key: 'bean',
        label: 'bean',
        tooltip: 'retrace each stitch for a heavier, triple-pass line',
      },
      {
        kind: 'slider',
        key: 'beanCount',
        label: 'bean count',
        min: 2,
        max: 7,
        step: 1,
        tooltip: 'number of passes per stitch when bean is on',
      },
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'outline' }>).params;
      const lines: string[] = [`stitchlen ${fmt(p.stitchlen)}`];
      if (p.bean) lines.push(`bean ${fmt(p.beanCount)}`);
      ctx.ringNames.forEach((name) => {
        lines.push(startRing(name));
        lines.push(`sewpath(${name})`);
      });
      return stitchScope(lines);
    },
  },

  satinBorder: {
    kind: 'satinBorder',
    label: 'Satin border',
    eligible: () => true,
    controls: [
      {
        kind: 'slider',
        key: 'width',
        label: 'width',
        min: 0.5,
        max: 8,
        step: 0.1,
        unit: 'mm',
        tooltip: 'satin column width, 0.5–8 mm',
      },
      {
        kind: 'slider',
        key: 'density',
        label: 'density',
        min: 0.25,
        max: 5,
        step: 0.05,
        unit: 'mm',
        tooltip: 'satin penetration spacing, 0.25–5 mm — smaller is denser',
      },
      {
        kind: 'select',
        key: 'underlay',
        label: 'underlay',
        options: UNDERLAY_OPTS,
        tooltip: 'stabilising stitches under the satin column',
      },
      {
        kind: 'switch',
        key: 'shortstitch',
        label: 'short stitch',
        tooltip: 'shorten stitches on tight inner curves to avoid bunching',
      },
      {
        kind: 'select',
        key: 'cap',
        label: 'open-path cap',
        options: SATIN_CAP_OPTS,
        tooltip: 'construction at open satin ends; closed borders ignore this setting',
      },
      {
        kind: 'select',
        key: 'join',
        label: 'corner join',
        options: SATIN_JOIN_OPTS,
        tooltip: 'construction used for sharp physical satin turns',
      },
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'satinBorder' }>).params;
      const lines: string[] = [];
      if (p.underlay !== 'auto') lines.push(`underlay "${p.underlay}"`);
      if (p.cap !== 'legacy') lines.push(`satincap '${p.cap}'`);
      if (p.join !== 'legacy') lines.push(`satinjoin '${p.join}'`);
      lines.push(`shortstitch ${p.shortstitch ? 1 : 0}`);
      lines.push(`density ${fmt(p.density)}`);
      lines.push(`satin ${fmt(p.width)}`);
      ctx.ringNames.forEach((name) => {
        lines.push(startRing(name));
        lines.push(`sewpath(${name})`);
      });
      lines.push('satin 0');
      return stitchScope(lines);
    },
  },

  tatamiFill: {
    kind: 'tatamiFill',
    label: 'Tatami fill',
    eligible: isClosedGeom,
    controls: [
      {
        kind: 'slider',
        key: 'fillangle',
        label: 'fill angle',
        min: 0,
        max: 180,
        step: 1,
        unit: '°',
        tooltip: 'direction of the tatami rows, 0–180°',
      },
      {
        kind: 'slider',
        key: 'fillspacing',
        label: 'row spacing',
        min: 0.25,
        max: 3,
        step: 0.05,
        unit: 'mm',
        tooltip: 'gap between fill rows, 0.25–3 mm — smaller is denser',
      },
      {
        kind: 'slider',
        key: 'filllen',
        label: 'stitch length',
        min: 1,
        max: 8,
        step: 0.1,
        unit: 'mm',
        tooltip: 'stitch length within each row, 1–8 mm',
      },
      {
        kind: 'select',
        key: 'fillunderlay',
        label: 'fill underlay',
        options: FILL_UNDERLAY_OPTS,
        tooltip: 'stabilising layer beneath the fill',
      },
      {
        kind: 'slider',
        key: 'fillinset',
        label: 'border overlap inset',
        min: FILL_CONSTRUCTION_RANGES.insetMM.min,
        max: FILL_CONSTRUCTION_RANGES.insetMM.max,
        step: 0.1,
        unit: 'mm',
        tooltip: 'reserve physical overlap inside the fill boundary for a later satin border',
      },
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'tatamiFill' }>).params;
      const lines: string[] = [];
      if (p.fillunderlay !== 'auto') lines.push(`fillunderlay "${p.fillunderlay}"`);
      if (p.fillinset > 0) lines.push(`fillinset ${fmt(p.fillinset)}`);
      lines.push(`fillangle ${fmt(p.fillangle)}`);
      lines.push(`fillspacing ${fmt(p.fillspacing)}`);
      lines.push(`filllen ${fmt(p.filllen)}`);
      lines.push(...fillBody(ctx));
      return stitchScope(lines);
    },
  },

  gradientFill: {
    kind: 'gradientFill',
    label: 'SVG gradient fill',
    eligible: (g, role) => isClosedGeom(g) && role === 'fill',
    controls: [
      {
        kind: 'slider',
        key: 'pitch',
        label: 'row pitch',
        min: 0.25,
        max: 5,
        step: 0.05,
        unit: 'mm',
        tooltip: 'aggregate spacing across all gradient thread channels, 0.25–5 mm',
      },
      {
        kind: 'slider',
        key: 'stitchlen',
        label: 'stitch length',
        min: 1,
        max: 7,
        step: 0.1,
        unit: 'mm',
        tooltip: 'running-stitch length within each assigned gradient row, 1–7 mm',
      },
    ],
    emit: (el, ctx) => {
      const gradient = el.sourceGradient;
      const reporter = ctx.gradientReporterName;
      const groups = ctx.gradientGroupsName;
      const colors = ctx.gradientColorsName;
      const gradientRows = ctx.gradientRowsName;
      const routeRows = ctx.gradientRouteName;
      if (
        !gradient ||
        !reporter ||
        !groups ||
        !colors ||
        !gradientRows ||
        !routeRows ||
        !ctx.gradientColors ||
        gradient.stops.length < 2
      )
        return [];
      const p = (el.strategy as Extract<Strategy, { kind: 'gradientFill' }>).params;
      const dx = gradient.end[0] - gradient.start[0];
      const dy = gradient.end[1] - gradient.start[1];
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) return [];
      const ux = dx / length;
      const uy = dy / length;
      const projections = el.rings.flatMap((ring) => ring.map(([x, y]) => x * ux + y * uy));
      const axisLow = Math.min(...projections);
      const axisHigh = Math.max(...projections);
      const startProjection = gradient.start[0] * ux + gradient.start[1] * uy;
      const angle = (Math.atan2(-ux, uy) * 180) / Math.PI;
      const colorLiteral = ctx.gradientColors
        .map((color) => (typeof color === 'number' ? String(color) : `'${color}'`))
        .join(', ');
      const lines = [
        `def ${reporter}(v) [`,
        `  let t = clamp((${fmtPrecise(axisLow)} + v * ${fmtPrecise(axisHigh - axisLow)} - ${fmtPrecise(startProjection)}) / ${fmtPrecise(length)}, 0, 1)`,
        ...gradientWeights(el),
        ']',
        `let ${colors} = [${colorLiteral}]`,
        `let ${groups} = filled(${gradient.stops.length}, [])`,
      ];
      ctx.fillGroups.forEach((group, groupIndex) => {
        const names = group.flatMap((index) => ctx.ringNames[index] ?? []);
        if (!names.length) return;
        const region = names.length === 1 ? names[0] : `[${names.join(', ')}]`;
        const part = `${groups}_part${groupIndex + 1}`;
        lines.push(
          `let ${part} = ${gradientRows}(${region}, ${fmt(angle)}, ${fmt(p.pitch)}, @${reporter})`,
          `for channel = 0 to ${gradient.stops.length - 1} [`,
          `  ${groups}[channel] = concat(${groups}[channel], ${part}[channel])`,
          ']',
        );
      });
      lines.push(
        `for channel = 0 to ${gradient.stops.length - 1} [`,
        `  color ${colors}[channel]`,
        `  for row in ${routeRows}(${groups}[channel], mod(channel, 2)) [`,
        '    up setpos(first(row)) down',
        `    sewpath(resample(row, ${fmt(p.stitchlen)}))`,
        '  ]',
        ']',
      );
      return lines;
    },
  },

  directionalFill: {
    kind: 'directionalFill',
    label: 'Directional fill',
    eligible: isClosedGeom,
    controls: [
      {
        kind: 'select',
        key: 'field',
        label: 'flow field',
        options: [{ value: '', label: 'insert scaffold' }],
        tooltip: 'a named @reporter that returns the local stitch angle',
      },
      {
        kind: 'slider',
        key: 'fillspacing',
        label: 'row spacing',
        min: 0.25,
        max: 3,
        step: 0.05,
        unit: 'mm',
        tooltip: 'gap between fill rows, 0.25–3 mm — smaller is denser',
      },
      {
        kind: 'select',
        key: 'fillunderlay',
        label: 'fill underlay',
        options: FILL_UNDERLAY_OPTS,
        tooltip: 'stabilising profile generated from the recorded fill region',
      },
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'directionalFill' }>).params;
      const underlay = p.fillunderlay === 'auto' ? [] : [`fillunderlay "${p.fillunderlay}"`];
      if (!p.field) {
        return stitchScope(
          [
            ...underlay,
            `fillspacing ${fmt(p.fillspacing)}`,
            `fill dir @${ctx.scaffoldName}`,
            ...fillBody(ctx),
          ],
          [`def ${ctx.scaffoldName}(p) [ return 45 ]`],
        );
      }
      const lines: string[] = [...underlay, `fillspacing ${fmt(p.fillspacing)}`];
      lines.push(`fill dir @${p.field}`);
      lines.push(...fillBody(ctx));
      return stitchScope(lines);
    },
  },

  runningMotif: {
    kind: 'runningMotif',
    label: 'Running motif',
    eligible: (g) => OPEN.includes(g),
    controls: [
      {
        kind: 'slider',
        key: 'stitchlen',
        label: 'stitch length',
        min: 1,
        max: 6,
        step: 0.1,
        unit: 'mm',
        tooltip: 'stitch length along the path, 1–6 mm',
      },
      {
        kind: 'switch',
        key: 'bean',
        label: 'bean',
        tooltip: 'retrace for a heavier triple line',
      },
      {
        kind: 'switch',
        key: 'estitch',
        label: 'E-stitch',
        tooltip: 'blanket / E-stitch comb along the path',
      },
      {
        kind: 'slider',
        key: 'estitchLen',
        label: 'E-stitch length',
        min: 1,
        max: 6,
        step: 0.1,
        unit: 'mm',
        tooltip: 'comb depth/length of the E-stitch, 1–6 mm',
      },
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'runningMotif' }>).params;
      const lines: string[] = [`stitchlen ${fmt(p.stitchlen)}`];
      if (p.estitch) lines.push(`estitch ${fmt(p.estitchLen)}`);
      else if (p.bean) lines.push(`bean 3`);
      ctx.ringNames.forEach((name) => {
        lines.push(startRing(name));
        lines.push(`sewpath(${name})`);
      });
      return stitchScope(lines);
    },
  },

  railPair: {
    kind: 'railPair',
    label: 'Rail-pair satin',
    eligible: (_g, role) => role === 'relation',
    controls: [
      {
        kind: 'slider',
        key: 'density',
        label: 'density',
        min: 0.25,
        max: 5,
        step: 0.05,
        unit: 'mm',
        tooltip: 'penetration spacing between authored rails, 0.25–5 mm',
      },
      {
        kind: 'select',
        key: 'underlay',
        label: 'underlay',
        options: UNDERLAY_OPTS,
        tooltip: 'stabilising stitches generated beneath the rail-pair column',
      },
      {
        kind: 'switch',
        key: 'shortstitch',
        label: 'short stitch',
        tooltip: 'shorten stitches on the inside of tight rail curves',
      },
      {
        kind: 'select',
        key: 'cap',
        label: 'open-rail cap',
        options: SATIN_CAP_OPTS,
        tooltip: 'construction at open rail-pair ends; closed rails ignore this setting',
      },
      {
        kind: 'select',
        key: 'join',
        label: 'corner join',
        options: SATIN_JOIN_OPTS,
        tooltip: 'construction used for sharp turns in the paired rails',
      },
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'railPair' }>).params;
      const [railA, railB] = ctx.ringNames;
      if (!railA || !railB) return [];
      const lines: string[] = [];
      if (p.underlay !== 'auto') lines.push(`underlay "${p.underlay}"`);
      if (p.cap !== 'legacy') lines.push(`satincap '${p.cap}'`);
      if (p.join !== 'legacy') lines.push(`satinjoin '${p.join}'`);
      lines.push(`shortstitch ${p.shortstitch ? 1 : 0}`);
      lines.push(`density ${fmt(p.density)}`);
      lines.push(`satinbetween(${railA}, ${railB})`);
      return stitchScope(lines);
    },
  },

  motifAlong: {
    kind: 'motifAlong',
    label: 'Motif along path',
    eligible: (_g, role) => role === 'relation',
    controls: [
      {
        kind: 'slider',
        key: 'count',
        label: 'motif count',
        min: 1,
        max: 50,
        step: 1,
        tooltip: 'number of placements distributed along the authored route',
      },
      {
        kind: 'slider',
        key: 'scale',
        label: 'motif scale',
        min: 0.1,
        max: 4,
        step: 0.05,
        tooltip: 'uniform scale applied to the centered source motif',
      },
      {
        kind: 'slider',
        key: 'stitchlen',
        label: 'stitch length',
        min: 1,
        max: 6,
        step: 0.1,
        unit: 'mm',
        tooltip: 'running-stitch spacing within each transformed motif',
      },
      {
        kind: 'switch',
        key: 'align',
        label: 'follow path',
        tooltip: 'rotate each motif to the route heading returned by std.layout.alongpath',
      },
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'motifAlong' }>).params;
      const [route, motif] = ctx.ringNames;
      if (!route || !motif) return [];
      const helper = ctx.helperName ?? 'place_motif';
      const centered = ctx.derivedName ?? 'centered_motif';
      const alongpath = ctx.layoutName ?? 'alongpath';
      const heading = p.align ? 'placement[1]' : '0';
      return [
        `def ${helper}(motif, placement) [`,
        `  let placed = xlate(xrotate(xscale(motif, ${fmt(p.scale)}), ${heading}), placement[0][0], placement[0][1])`,
        '  up setpos(first(placed)) down',
        `  sewpath(resample(placed, ${fmt(p.stitchlen)}))`,
        ']',
        `let ${centered} = xlate(${motif}, -centroid(${motif})[0], -centroid(${motif})[1])`,
        `for placement in ${alongpath}(${route}, ${fmt(p.count)}) [`,
        `  ${helper}(${centered}, placement)`,
        ']',
      ];
    },
  },
};

/** Strategies eligible for a geometry type, in catalogue order (spec §15: keys 1–7). */
export const STRATEGY_ORDER: StrategyKind[] = [
  'skip',
  'outline',
  'satinBorder',
  'tatamiFill',
  'gradientFill',
  'directionalFill',
  'runningMotif',
];

/** Relationship recipes are created explicitly, never assigned by auto-suggest. */
export const RELATIONSHIP_STRATEGY_ORDER: StrategyKind[] = ['railPair', 'motifAlong'];

const ATOMIC_STRATEGIES: ReadonlySet<StrategyKind> = new Set([
  'outline',
  'satinBorder',
  'tatamiFill',
  'runningMotif',
  'railPair',
]);

/** Strategies whose emitted sew body contains no declarations or color changes. */
export function strategySupportsAtomic(kind: StrategyKind): boolean {
  return ATOMIC_STRATEGIES.has(kind);
}

export function eligibleStrategies(
  g: GeomType,
  role?: OperationRole,
  hasGradient = false,
): StrategyKind[] {
  const order = role === 'relation' ? RELATIONSHIP_STRATEGY_ORDER : STRATEGY_ORDER;
  return order.filter(
    (kind) => (kind !== 'gradientFill' || hasGradient) && STRATEGIES[kind].eligible(g, role),
  );
}

/**
 * Conservative default policy: fills remain fills; strokes use satin only when
 * their physical hoop-space width is known to be in the safe 2–8 mm range.
 */
export function autoSuggest(
  geomType: GeomType,
  rings: ElementModel['rings'],
  sourceFill: string | null,
  sourceStroke: string | null,
  sourceStrokeWidth: number | null,
): Strategy {
  const hasFill = sourceFill !== null;
  const hasStroke = sourceStroke !== null;
  const closed = isClosedGeom(geomType);

  if (hasFill && closed) {
    return defaultStrategy('tatamiFill');
  }
  if (!closed && rings.some((r) => !isClosedRing(r))) {
    return defaultStrategy('runningMotif');
  }
  if (hasStroke && sourceStrokeWidth !== null && sourceStrokeWidth >= 2 && sourceStrokeWidth <= 8)
    return seedSatin(sourceStrokeWidth);
  if (hasStroke) return defaultStrategy('outline');
  if (hasFill) return defaultStrategy('tatamiFill');
  return defaultStrategy('outline');
}

function seedSatin(strokeWidth: number | null): Strategy {
  const s = defaultStrategy('satinBorder');
  if (s.kind === 'satinBorder' && strokeWidth && strokeWidth > 0) {
    s.params.width = Math.min(8, Math.max(0.5, strokeWidth));
  }
  return s;
}
