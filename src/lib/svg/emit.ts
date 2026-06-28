// ============================================================
// SVG-import emitter (pure, DOM-free).
//
// Walks committed element rows in sew order and produces a readable,
// generative-ready NeedleScript program (spec §13): provenance header,
// document setup, named `let` path bindings (resampled rings), then
// sew blocks grouped by thread with `color` changes and `trim`s.
// ============================================================

import type { ElementModel, Point, StagedDocument } from './model.ts';
import { STRATEGIES, type EmitContext } from './strategies.ts';

export interface EmitOptions {
  /** 'replace' starts a fresh program; 'append' prepends nothing special. */
  mode?: 'replace' | 'append';
  /** ISO date string for the provenance header (injected for testability). */
  date?: string;
}

export interface EmitResult {
  code: string;
  /** element id → 1-based inclusive line range of its sew block, for canvas linking. */
  sewSpans: Record<string, { start: number; end: number }>;
}

const RESERVED = new Set([
  'fd',
  'bk',
  'rt',
  'lt',
  'up',
  'down',
  'seth',
  'setpos',
  'setxy',
  'color',
  'satin',
  'fill',
  'dir',
  'shape',
  'beginfill',
  'endfill',
  'sewpath',
  'trim',
  'fabric',
  'seed',
  'let',
  'def',
  'return',
  'if',
  'else',
  'for',
  'in',
  'repeat',
  'while',
  'first',
  'last',
  'bean',
  'estitch',
  'underlay',
  'density',
  'fillangle',
  'fillspacing',
  'filllen',
  'fillunderlay',
  'stitchlen',
]);

function fmt(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

/** Make a safe, unique identifier base from an element name. */
function sanitizeBase(name: string, used: Set<string>): string {
  let base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base || /^[0-9]/.test(base)) base = 'shape_' + base;
  if (RESERVED.has(base)) base = base + '_';
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) candidate = `${base}_${n++}`;
  used.add(candidate);
  return candidate;
}

/**
 * Resample a polyline to ~`spacing` mm between points, preserving endpoints.
 * Keeps the program editable and matches physical stitch spacing (spec §10.4).
 */
export function resampleRing(ring: Point[], spacing: number): Point[] {
  if (ring.length < 2 || spacing <= 0) return ring.slice();
  const out: Point[] = [ring[0]];
  // distance carried over from the previous segment toward the next sample
  let carry = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segLen < 1e-9) continue;
    // first sample on this segment falls at (spacing - carry) from `a`
    let d = spacing - carry;
    while (d <= segLen + 1e-9) {
      const t = d / segLen;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += spacing;
    }
    // leftover from the last placed sample to `b`
    carry = segLen - (d - spacing);
  }
  const last = ring[ring.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1e-6) out.push(last);
  return out;
}

function formatPathLiteral(points: Point[]): string {
  const pts = points.map((p) => `[ ${fmt(p[0])}, ${fmt(p[1])} ]`);
  if (pts.length <= 6) return `[${pts.join(', ')}]`;
  // wrap for readability: 6 points per line
  const lines: string[] = ['['];
  for (let i = 0; i < pts.length; i += 6) {
    const chunk = pts.slice(i, i + 6).join(', ');
    lines.push(`  ${chunk}${i + 6 < pts.length ? ',' : ''}`);
  }
  lines.push(']');
  return lines.join('\n');
}

/** Naming for an element's rings: outer / hole{n} / ring{n}. */
function ringNames(base: string, el: ElementModel): string[] {
  if (el.rings.length === 1) return [base];
  let holeN = 0;
  let solidN = 0;
  return el.rings.map((_, i) => {
    if (i === 0) return `${base}_outer`;
    if (el.holeMap[i]?.hole) return `${base}_hole${holeN++}`;
    return `${base}_ring${++solidN}`;
  });
}

function included(el: ElementModel): boolean {
  return el.include && el.strategy.kind !== 'skip';
}

export function emit(doc: StagedDocument, opts: EmitOptions = {}): EmitResult {
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const sewSpans: Record<string, { start: number; end: number }> = {};
  const lines: string[] = [];

  const rows = doc.elements
    .filter(included)
    .slice()
    .sort((a, b) => a.order - b.order);

  // 1. provenance header
  lines.push(`// imported from ${doc.name}.svg — ${date}`);
  lines.push(
    `// fabric "${doc.fabric}", resample ${fmt(doc.resampleMM)} mm` +
      (doc.scaleFactor !== 1 ? `, scale ${fmt(doc.scaleFactor)}×` : '') +
      `, ${rows.length} element${rows.length === 1 ? '' : 's'}, seed ${doc.seed}`,
  );
  lines.push('');

  // 2. document setup
  lines.push(`seed ${doc.seed}`);
  lines.push(`fabric "${doc.fabric}"`);
  lines.push('');

  // 3. named path bindings (resampled)
  const usedNames = new Set<string>();
  const elNames = new Map<string, string[]>();
  lines.push('// --- paths ---');
  for (const el of rows) {
    const base = sanitizeBase(el.name, usedNames);
    const names = ringNames(base, el);
    elNames.set(el.id, names);
    el.rings.forEach((ring, i) => {
      const resampled = resampleRing(ring, doc.resampleMM);
      lines.push(`let ${names[i]} = ${formatPathLiteral(resampled)}`);
    });
  }
  lines.push('');

  // 4. sew blocks, grouped by current order; color emitted on change, trim between motifs.
  lines.push('// --- sew ---');
  let currentColor: number | null = null;
  for (const el of rows) {
    const names = elNames.get(el.id)!;
    const ctx: EmitContext = { ringNames: names, holeMap: el.holeMap };
    const body = STRATEGIES[el.strategy.kind].emit(el, ctx);
    if (body.length === 0) continue;

    if (el.threadIndex !== currentColor) {
      lines.push('');
      lines.push(`color ${el.threadIndex}`);
      currentColor = el.threadIndex;
    } else {
      lines.push('');
    }
    const start = lines.length + 1;
    lines.push(...body);
    lines.push('trim');
    sewSpans[el.id] = { start, end: lines.length };
  }

  return { code: lines.join('\n'), sewSpans };
}
