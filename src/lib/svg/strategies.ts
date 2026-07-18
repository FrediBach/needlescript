// ============================================================
// SVG-import strategy catalogue (pure, DOM-free).
//
// Each strategy maps an element to a stitch construction and exposes
// a tight, schema-described parameter set (spec §9). The schema drives
// the Inspector generically; `eligible` drives the disable logic; and
// `emit` produces the per-element sew block referenced by the emitter.
// ============================================================

import type { ElementModel, GeomType, RingHole, Strategy, StrategyKind } from './model.ts';
import { defaultStrategy } from './model.ts';
import { isClosedRing } from './geometry.ts';

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
}

export interface StrategyDef {
  kind: StrategyKind;
  label: string;
  eligible: (g: GeomType) => boolean;
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

const UNDERLAY_OPTS = [
  { value: 'auto', label: 'auto' },
  { value: 'center', label: 'center' },
  { value: 'edge', label: 'edge' },
  { value: 'zigzag', label: 'zigzag' },
  { value: 'off', label: 'off' },
];

const FILL_UNDERLAY_OPTS = [
  { value: 'auto', label: 'auto' },
  { value: 'edge', label: 'edge' },
  { value: 'tatami', label: 'tatami' },
  { value: 'off', label: 'off' },
];

// ---------- per-strategy emit helpers ----------

function startRing(name: string): string {
  return `up setpos(first(${name})) down`;
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
      if (p.bean) lines.push('bean 0');
      return lines;
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
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'satinBorder' }>).params;
      const lines: string[] = [];
      if (p.underlay !== 'auto') lines.push(`underlay "${p.underlay}"`);
      lines.push(`shortstitch ${p.shortstitch ? 1 : 0}`);
      lines.push(`density ${fmt(p.density)}`);
      lines.push(`satin ${fmt(p.width)}`);
      ctx.ringNames.forEach((name) => {
        lines.push(startRing(name));
        lines.push(`sewpath(${name})`);
      });
      lines.push('satin 0');
      if (!p.shortstitch) lines.push('shortstitch 1');
      if (p.underlay !== 'auto') lines.push('underlay "auto"');
      return lines;
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
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'tatamiFill' }>).params;
      const lines: string[] = [];
      if (p.fillunderlay !== 'auto') lines.push(`fillunderlay "${p.fillunderlay}"`);
      lines.push(`fillangle ${fmt(p.fillangle)}`);
      lines.push(`fillspacing ${fmt(p.fillspacing)}`);
      lines.push(`filllen ${fmt(p.filllen)}`);
      lines.push(...fillBody(ctx));
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
    ],
    emit: (el, ctx) => {
      const p = (el.strategy as Extract<Strategy, { kind: 'directionalFill' }>).params;
      if (!p.field) {
        return [
          `def ${ctx.scaffoldName}(p) [ return 45 ]`,
          `fillspacing ${fmt(p.fillspacing)}`,
          `fill dir @${ctx.scaffoldName}`,
          ...fillBody(ctx),
        ];
      }
      const lines: string[] = [`fillspacing ${fmt(p.fillspacing)}`];
      lines.push(`fill dir @${p.field}`);
      lines.push(...fillBody(ctx));
      return lines;
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
      if (p.estitch) lines.push('estitch 0');
      else if (p.bean) lines.push('bean 0');
      return lines;
    },
  },
};

/** Strategies eligible for a geometry type, in catalogue order (spec §15: keys 1–6). */
export const STRATEGY_ORDER: StrategyKind[] = [
  'skip',
  'outline',
  'satinBorder',
  'tatamiFill',
  'directionalFill',
  'runningMotif',
];

export function eligibleStrategies(g: GeomType): StrategyKind[] {
  return STRATEGY_ORDER.filter((k) => STRATEGIES[k].eligible(g));
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
