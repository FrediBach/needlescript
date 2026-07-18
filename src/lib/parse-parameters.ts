// ── Parameter panel parser ────────────────────────────────────────────────
//
// Scans NeedleScript source code for annotated variable declarations and
// section-header comments, producing a flat list of ParamItem values that
// drive the parameters panel UI.
//
// Supported annotation syntax (end-of-line comment, OpenSCAD style):
//
//   let radius = 15   // [5:30]        integer slider  (both bounds ints)
//   let smooth = 0.5  // [0:1]         smooth slider   (float bound)
//   let n = 4         // [0.5:0.5:8]   stepped slider  (min:step:max)
//   let wave = 1      // [switch]       0/1 toggle
//   let mode = 0      // [switch:a,b]   0/1 toggle with labels
//   let title = 'Hi'  // [text]         free text
//   // --- Section ---               section header (standalone line)
//
//   let anchor = [0, 18]        // [xy]              free point — anywhere in the hoop
//   let sun    = [-25, 25]      // [xy: -40:0, 0:40] rect area (x-range, y-range)
//   let eye    = [8, 4]         // [xy: disc 12]     disc of radius 12 around origin
//   let tip    = [22, 0]        // [xy: x 5:40]      horizontal axis only, x ∈ 5…40
//
// All three declaration styles are recognised:
//   let name = value  // [...]
//   make "name value  // [...]
//   name = value      // [...]
// --------------------------------------------------------------------------

// ── Types ──────────────────────────────────────────────────────────────────

export type SliderKind = 'integer' | 'smooth' | 'stepped';

export interface ParamDef {
  /** Variable name as it appears in source */
  name: string;
  /** Current numeric value parsed from the declaration */
  value: number;
  controlType: 'slider' | 'switch';
  // slider fields
  min: number;
  max: number;
  step: number;
  sliderKind: SliderKind;
  // switch fields
  labels?: [string, string]; // [off-label, on-label]
  /** 1-based line number in the source — used for precise source updates */
  line: number;
}

/** A string variable exposed as a free-text control. */
export interface TextParamDef {
  /** Variable name as it appears in source */
  name: string;
  /** Current string value, with NeedleScript escape sequences decoded */
  value: string;
  controlType: 'text';
  /** 1-based line number in the source — used for precise source updates */
  line: number;
}

export interface ColorParamDef {
  name: string;
  value: string;
  line: number;
  controlType: 'color';
  choices?: string[];
  paletteOnly?: boolean;
}

export interface PaletteParamDef {
  name: string;
  value: string[];
  line: number;
  controlType: 'palette';
  min: number;
  max: number;
}

// ── XY point parameter types ───────────────────────────────────────────────

/** Constraint region for an [xy] point parameter. */
export type XYRegion =
  | { kind: 'free' }
  | { kind: 'rect'; minX: number; maxX: number; minY: number; maxY: number }
  | { kind: 'disc'; cx: number; cy: number; radius: number }
  /** axis: 'x' = x is the free coordinate, y is fixed at fixedCoord.
   *  axis: 'y' = y is the free coordinate, x is fixed at fixedCoord.
   *  rangeMin/rangeMax are the bounds on the free coordinate;
   *  use ±Infinity for "free within the hoop chord". */
  | { kind: 'axis'; axis: 'x' | 'y'; fixedCoord: number; rangeMin: number; rangeMax: number };

export interface PointParamDef {
  /** Variable name as it appears in source */
  name: string;
  valueX: number;
  valueY: number;
  /** 1-based line number — both coordinates share the same line */
  line: number;
  region: XYRegion;
  /** Optional snapping grid size in mm */
  snap?: number;
  controlType: 'point';
  /** Present for a synthetic stage handle belonging to a path/curve control. */
  pathHandle?: {
    controlName: string;
    controlType: 'path' | 'curve';
    anchor: number;
    role: 'pos' | 'hin' | 'hout';
    closed: boolean;
  };
}

export interface PathParamDef {
  name: string;
  value: number[][] | (number[] | number[][])[];
  line: number;
  region: XYRegion;
  snap?: number;
  closed: boolean;
  min: number;
  max: number;
  controlType: 'path' | 'curve';
}

export type ParamItem =
  | { kind: 'section'; title: string }
  | { kind: 'param'; def: ParamDef }
  | { kind: 'text'; def: TextParamDef }
  | { kind: 'color'; def: ColorParamDef }
  | { kind: 'palette'; def: PaletteParamDef }
  | { kind: 'point'; def: PointParamDef }
  | { kind: 'path'; def: PathParamDef }
  | { kind: 'curve'; def: PathParamDef };

// ── Preset type ────────────────────────────────────────────────────────────

/** A named bundle of parameter values defined in a source comment, e.g.
 *    // @preset Dense Rosette : bigR=100, rollR=63, pen=50
 *    // @preset Tall Stem     : anchor=[0,26], tip=[22,0], layers=8
 *  Partial presets (fewer keys than total params) are valid and common.
 *  Point-parameter values are stored as [x, y] tuples.               */
export interface Preset {
  name: string;
  /** Keyed by lowercased variable name — same casing as ParamDef.name */
  values: Record<string, number | string | string[] | NestedNumberList>;
}

export type NestedNumberList = Array<number | NestedNumberList>;

// ── Regex helpers ──────────────────────────────────────────────────────────

// Matches any of the three declaration forms and captures name + value:
//   let name = 15.3
//   make "name 15.3
//   name = 15.3
// Groups: 1=let-name, 2=make-name, 3=bare-name, 4=value
const DECL_RE =
  /^\s*(?:let\s+([A-Za-z_]\w*)\s*=|make\s+"([A-Za-z_]\w*)\s+|([A-Za-z_]\w*)\s*=)\s*(-?(?:\d+\.?\d*|\.\d+))/;

// Matches a single-quoted NeedleScript string literal on a declaration RHS.
// Only the tokenizer's supported escapes are accepted, so malformed source is
// left to the language parser to diagnose rather than becoming a customizer control.
const STRING_LITERAL_PATTERN = String.raw`'(?:\\['\\nt]|[^'\\\n])*'`;
const TEXT_DECL_RE = new RegExp(
  `^\\s*(?:let\\s+([A-Za-z_]\\w*)\\s*=|make\\s+"([A-Za-z_]\\w*)\\s+|([A-Za-z_]\\w*)\\s*=)\\s*(${STRING_LITERAL_PATTERN})`,
);
const COLOR_DECL_RE = TEXT_DECL_RE;
const COLOR_LIST_PATTERN = String.raw`\[\s*${STRING_LITERAL_PATTERN}(?:\s*,\s*${STRING_LITERAL_PATTERN})*\s*\]`;
const PALETTE_DECL_RE = new RegExp(
  `^\\s*(?:let\\s+([A-Za-z_]\\w*)\\s*=|make\\s+"([A-Za-z_]\\w*)\\s+|([A-Za-z_]\\w*)\\s*=)\\s*(${COLOR_LIST_PATTERN})`,
);

// Matches a two-element numeric-literal list on the declaration RHS:
//   let name = [x, y]
//   make "name [x, y]
//   name = [x, y]
// Groups: 1=let-name, 2=make-name, 3=bare-name, 4=x-value, 5=y-value
const POINT_DECL_RE =
  /^\s*(?:let\s+([A-Za-z_]\w*)\s*=|make\s+"([A-Za-z_]\w*)\s+|([A-Za-z_]\w*)\s*=)\s*\[\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*\]/;

// Matches the annotation bracket at the end of any line (after optional code)
//   // [...]  or  ; [...]  or  # [...]
const ANNOT_RE = /(?:\/\/|;|#)\s*\[([^\]]+)\]/;

// Section header: // --- Title ---   (any comment style)
const SECTION_RE = /^\s*(?:\/\/|;|#)\s*-{2,}\s*(.+?)\s*-{2,}\s*$/;

function decodeStringLiteral(value: string): string {
  return value.replace(/\\(['\\nt])/g, (_match, escape: string) => {
    switch (escape) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      default:
        return escape;
    }
  });
}

// ── Annotation content parser (scalar) ────────────────────────────────────

function isInt(n: number): boolean {
  return Number.isFinite(n) && Math.floor(n) === n;
}

function parseAnnotation(content: string): Omit<ParamDef, 'name' | 'value' | 'line'> | null {
  const trimmed = content.trim();

  // switch  or  switch:label0,label1
  if (/^switch/i.test(trimmed)) {
    const labelPart = trimmed.slice(6).trim(); // after "switch"
    let labels: [string, string] | undefined;
    if (labelPart.startsWith(':')) {
      const parts = labelPart.slice(1).split(',');
      if (parts.length >= 2) {
        labels = [parts[0].trim(), parts[1].trim()];
      }
    }
    return {
      controlType: 'switch',
      min: 0,
      max: 1,
      step: 1,
      sliderKind: 'integer',
      labels,
    };
  }

  // Parse up to three colon-separated numbers
  const parts = trimmed.split(':').map((s) => s.trim());
  if (parts.length === 2) {
    // [min:max]
    const min = parseFloat(parts[0]);
    const max = parseFloat(parts[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
    // Only treat as integer slider when both bounds are whole numbers AND the
    // range spans more than 1 unit.  [0:1] with integer bounds is a normalised
    // float range (smooth), not a two-value integer toggle — use [switch] for that.
    const bothInt = isInt(min) && isInt(max) && max - min > 1;
    const step = bothInt ? 1 : (max - min) / 100;
    return {
      controlType: 'slider',
      min,
      max,
      step,
      sliderKind: bothInt ? 'integer' : 'smooth',
    };
  }

  if (parts.length === 3) {
    // [min:step:max]
    const min = parseFloat(parts[0]);
    const step = parseFloat(parts[1]);
    const max = parseFloat(parts[2]);
    if (!Number.isFinite(min) || !Number.isFinite(step) || !Number.isFinite(max)) return null;
    if (step <= 0 || min >= max) return null;
    return {
      controlType: 'slider',
      min,
      max,
      step,
      sliderKind: 'stepped',
    };
  }

  return null;
}

// ── XY annotation parser ──────────────────────────────────────────────────

/** Parse "min:max" — returns null if malformed or min > max. */
function parseRange(s: string): [number, number] | null {
  const colonIdx = s.indexOf(':');
  if (colonIdx === -1) return null;
  const min = parseFloat(s.slice(0, colonIdx).trim());
  const max = parseFloat(s.slice(colonIdx + 1).trim());
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min > max) return null;
  return [min, max];
}

/**
 * Parse the content inside `[xy...]`.
 * The fixedCoord for axis regions is left at 0 here; the caller fills it
 * in from the declaration's value once both x and y are known.
 * Returns null for any malformed input (warn + ignore in the caller).
 */
function parseXYAnnotation(content: string): { region: XYRegion; snap?: number } | null {
  const trimmed = content.trim();
  // Must start with 'xy' keyword (case-insensitive), not followed by a letter/digit
  if (!/^xy\b/i.test(trimmed)) return null;

  // Peel off 'xy' and work with the remainder
  let rest = trimmed.slice(2).trim();

  // Extract trailing ', snap N' (must be at the very end, after the constraint)
  let snap: number | undefined;
  const snapMatch = /,\s*snap\s+(-?(?:\d+\.?\d*|\.\d+))\s*$/i.exec(rest);
  if (snapMatch) {
    const s = parseFloat(snapMatch[1]);
    if (!Number.isFinite(s) || s <= 0) return null; // snap ≤ 0 → warn and ignore
    snap = s;
    rest = rest.slice(0, snapMatch.index).trim();
  }

  let region: XYRegion;

  if (rest === '') {
    // [xy]  — free
    region = { kind: 'free' };
  } else if (rest.startsWith(':')) {
    const constraint = rest.slice(1).trim();

    if (/^disc\b/i.test(constraint)) {
      // disc radius [@ cx, cy]
      const discBody = constraint.slice(4).trim(); // after 'disc'
      const atIdx = discBody.indexOf('@');
      let radiusStr: string;
      let cx = 0;
      let cy = 0;

      if (atIdx !== -1) {
        radiusStr = discBody.slice(0, atIdx).trim();
        const centerStr = discBody.slice(atIdx + 1).trim();
        const cParts = centerStr.split(',');
        if (cParts.length < 2) return null;
        cx = parseFloat(cParts[0].trim());
        cy = parseFloat(cParts[1].trim());
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
      } else {
        radiusStr = discBody;
      }

      const radius = parseFloat(radiusStr);
      if (!Number.isFinite(radius) || radius <= 0) return null;
      region = { kind: 'disc', cx, cy, radius };
    } else if (/^x\b/i.test(constraint)) {
      // [xy: x [range]]  — horizontal axis (x free, y fixed)
      const axisBody = constraint.slice(1).trim();
      if (axisBody === '') {
        region = {
          kind: 'axis',
          axis: 'x',
          fixedCoord: 0,
          rangeMin: -Infinity,
          rangeMax: Infinity,
        };
      } else {
        const range = parseRange(axisBody);
        if (!range) return null;
        region = { kind: 'axis', axis: 'x', fixedCoord: 0, rangeMin: range[0], rangeMax: range[1] };
      }
    } else if (/^y\b/i.test(constraint)) {
      // [xy: y [range]]  — vertical axis (y free, x fixed)
      const axisBody = constraint.slice(1).trim();
      if (axisBody === '') {
        region = {
          kind: 'axis',
          axis: 'y',
          fixedCoord: 0,
          rangeMin: -Infinity,
          rangeMax: Infinity,
        };
      } else {
        const range = parseRange(axisBody);
        if (!range) return null;
        region = { kind: 'axis', axis: 'y', fixedCoord: 0, rangeMin: range[0], rangeMax: range[1] };
      }
    } else {
      // [xy: xRange, yRange]  — rect
      // Find the comma that separates the two ranges.
      // Ranges use colons but no commas, so the first comma is the separator.
      const commaIdx = constraint.indexOf(',');
      if (commaIdx === -1) return null;
      const xRangeStr = constraint.slice(0, commaIdx).trim();
      const yRangeStr = constraint.slice(commaIdx + 1).trim();
      const xRange = parseRange(xRangeStr);
      const yRange = parseRange(yRangeStr);
      if (!xRange || !yRange) return null;
      region = { kind: 'rect', minX: xRange[0], maxX: xRange[1], minY: yRange[0], maxY: yRange[1] };
    }
  } else {
    // Something after 'xy' that isn't ':' or nothing — malformed
    return null;
  }

  return { region, snap };
}

function parsePathAnnotation(content: string, kind: 'path' | 'curve') {
  if (!new RegExp(`^${kind}\\b`, 'i').test(content.trim())) return null;
  let body = content.trim().slice(kind.length).trim();
  if (body.startsWith(':')) body = body.slice(1).trim();
  const closed = /(?:^|,)\s*closed\s*(?=,|$)/i.test(body);
  const snapMatch = /(?:^|,)\s*snap\s+([\d.]+)\s*(?=,|$)/i.exec(body);
  const minMatch = /(?:^|,)\s*min\s+(\d+)\s*(?=,|$)/i.exec(body);
  const maxMatch = /(?:^|,)\s*max\s+(\d+)\s*(?=,|$)/i.exec(body);
  const snap = snapMatch ? Number(snapMatch[1]) : undefined;
  const min = minMatch ? Number(minMatch[1]) : 2;
  const max = maxMatch ? Number(maxMatch[1]) : kind === 'path' ? 64 : 32;
  if ((snap !== undefined && (!(snap > 0) || !Number.isFinite(snap))) || min < 2 || max < min)
    return null;
  body = body
    .replace(/(?:^|,)\s*(?:closed|snap\s+[\d.]+|min\s+\d+|max\s+\d+)\s*(?=,|$)/gi, '')
    .replace(/^\s*,|,\s*$/g, '')
    .trim();
  const xy = parseXYAnnotation(`xy${body ? `: ${body}` : ''}${snap ? `, snap ${snap}` : ''}`);
  if (!xy) return null;
  return { ...xy, closed, min, max };
}

function parseNestedNumberList(raw: string): NestedNumberList | null {
  if (!raw.trim().startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(raw.replace(/,\s*]/g, ']'));
    const valid = (value: unknown): value is number | NestedNumberList =>
      (typeof value === 'number' && Number.isFinite(value)) ||
      (Array.isArray(value) && value.every(valid));
    return Array.isArray(parsed) && parsed.every(valid) ? parsed : null;
  } catch {
    return null;
  }
}

function annotatedListDeclaration(lines: string[], annotationLine: number) {
  for (let start = annotationLine; start >= Math.max(0, annotationLine - 100); start--) {
    const prefix =
      /^\s*(?:let\s+([A-Za-z_]\w*)\s*=|make\s+"([A-Za-z_]\w*)\s+|([A-Za-z_]\w*)\s*=)\s*/.exec(
        lines[start],
      );
    if (!prefix) continue;
    const joined = lines.slice(start, annotationLine + 1).join('\n');
    const rhsStart = prefix[0].length;
    const open = joined.indexOf('[', rhsStart);
    if (open < 0) continue;
    let depth = 0;
    for (let i = open; i < joined.length; i++) {
      if (joined[i] === '[') depth++;
      else if (joined[i] === ']' && --depth === 0) {
        return {
          name: (prefix[1] ?? prefix[2] ?? prefix[3]).toLowerCase(),
          line: start + 1,
          value: parseNestedNumberList(joined.slice(open, i + 1)),
        };
      }
    }
  }
  return null;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse the source and return all parameter items (section headers + controls)
 * in source order. Returns an empty array when no annotated parameters exist.
 */
export function parseParameters(source: string): ParamItem[] {
  const lines = source.split('\n');
  const items: ParamItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1; // 1-based

    // ── Section header ────────────────────────────────────────────────────
    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      items.push({ kind: 'section', title: sectionMatch[1] });
      continue;
    }

    const annotMatch = ANNOT_RE.exec(line);
    if (!annotMatch) continue;
    const annotContent = annotMatch[1].trim();

    if (/^(?:path|curve)\b/i.test(annotContent)) {
      const kind = /^curve\b/i.test(annotContent) ? 'curve' : 'path';
      const declaration = annotatedListDeclaration(lines, i);
      const parsed = parsePathAnnotation(annotContent, kind);
      if (!declaration?.value || !parsed) continue;
      const isPoint = (v: number | NestedNumberList) =>
        Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number');
      const valid =
        kind === 'path'
          ? declaration.value.length >= 2 && declaration.value.every(isPoint)
          : declaration.value.length >= 2 &&
            declaration.value.every(
              (anchor) =>
                isPoint(anchor) ||
                (Array.isArray(anchor) && anchor.length === 3 && anchor.every(isPoint)),
            );
      if (!valid) continue;
      items.push({
        kind,
        def: {
          name: declaration.name,
          value: declaration.value as PathParamDef['value'],
          line: declaration.line,
          region: parsed.region,
          snap: parsed.snap,
          closed: parsed.closed,
          min: parsed.min,
          max: parsed.max,
          controlType: kind,
        },
      });
      continue;
    }

    if (/^color(?:\s*:|\s*$)/i.test(annotContent)) {
      const match = COLOR_DECL_RE.exec(line);
      if (!match) continue;
      const name = (match[1] ?? match[2] ?? match[3]).toLowerCase();
      const value = decodeStringLiteral(match[4].slice(1, -1));
      const constraint = annotContent.slice(5).trim();
      let choices: string[] | undefined;
      let paletteOnly = false;
      if (constraint.startsWith(':')) {
        const body = constraint.slice(1).trim();
        if (body.toLowerCase() === 'palette') paletteOnly = true;
        else
          choices = body
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
      }
      items.push({
        kind: 'color',
        def: { name, value, line: lineNo, controlType: 'color', choices, paletteOnly },
      });
      continue;
    }

    if (/^palette(?:\s*:|\s*$)/i.test(annotContent)) {
      const match = PALETTE_DECL_RE.exec(line);
      if (!match) continue;
      const name = (match[1] ?? match[2] ?? match[3]).toLowerCase();
      const value = [...match[4].matchAll(new RegExp(STRING_LITERAL_PATTERN, 'g'))].map((entry) =>
        decodeStringLiteral(entry[0].slice(1, -1)),
      );
      const bounds = annotContent.slice(7).trim();
      let min = value.length;
      let max = value.length;
      const bounded = /^:\s*(\d+)\s*:\s*(\d+)\s*$/.exec(bounds);
      if (bounded) {
        min = Number(bounded[1]);
        max = Number(bounded[2]);
        if (min < 1 || max < min || value.length < min || value.length > max) continue;
      }
      items.push({
        kind: 'palette',
        def: { name, value, line: lineNo, controlType: 'palette', min, max },
      });
      continue;
    }

    // ── [xy] point parameter ──────────────────────────────────────────────
    if (/^xy\b/i.test(annotContent)) {
      const pointDeclMatch = POINT_DECL_RE.exec(line);
      if (!pointDeclMatch) continue; // not a list literal — silently ignore

      const name = (pointDeclMatch[1] ?? pointDeclMatch[2] ?? pointDeclMatch[3]).toLowerCase();
      const rawX = parseFloat(pointDeclMatch[4]);
      const rawY = parseFloat(pointDeclMatch[5]);
      if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) continue;

      const parsed = parseXYAnnotation(annotContent);
      if (!parsed) continue; // malformed annotation — silently ignore

      let region = parsed.region;

      // Fill in fixedCoord for axis regions from the declared value
      if (region.kind === 'axis') {
        const fixedCoord = region.axis === 'x' ? rawY : rawX;
        region = { ...region, fixedCoord };
      }

      // Project the declared value into the region (§4.4)
      const projected = projectPoint({ x: rawX, y: rawY }, region, parsed.snap);

      items.push({
        kind: 'point',
        def: {
          name,
          valueX: projected.x,
          valueY: projected.y,
          line: lineNo,
          region,
          snap: parsed.snap,
          controlType: 'point',
        },
      });
      continue;
    }

    // ── Free-text string declaration ─────────────────────────────────────
    if (/^text\s*$/i.test(annotContent)) {
      const textDeclMatch = TEXT_DECL_RE.exec(line);
      if (!textDeclMatch) continue;

      const name = (textDeclMatch[1] ?? textDeclMatch[2] ?? textDeclMatch[3]).toLowerCase();
      items.push({
        kind: 'text',
        def: {
          name,
          value: decodeStringLiteral(textDeclMatch[4].slice(1, -1)),
          line: lineNo,
          controlType: 'text',
        },
      });
      continue;
    }

    // ── Scalar variable declaration with annotation ───────────────────────
    const declMatch = DECL_RE.exec(line);
    if (!declMatch) continue;

    const name = (declMatch[1] ?? declMatch[2] ?? declMatch[3]).toLowerCase();
    const rawValue = parseFloat(declMatch[4]);
    if (!Number.isFinite(rawValue)) continue;

    const annotation = parseAnnotation(annotContent);
    if (!annotation) continue;

    // Clamp the parsed source value to [min, max]
    const value = Math.min(annotation.max, Math.max(annotation.min, rawValue));

    items.push({
      kind: 'param',
      def: {
        name,
        value,
        line: lineNo,
        ...annotation,
      },
    });
  }

  return items;
}

// ── Source updater (scalar) ────────────────────────────────────────────────

/**
 * Return a new source string with the numeric value on the given 1-based line
 * replaced by `newValue`. Targets only the first number that follows the
 * variable name in the declaration — leaving the rest of the line (e.g.
 * the annotation comment) untouched.
 *
 * Handles all three declaration styles:
 *   let name = <value>
 *   make "name <value>
 *   name = <value>
 */
export function updateParameter(
  source: string,
  line: number, // 1-based
  name: string,
  newValue: number,
): string {
  const lines = source.split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return source;

  const original = lines[idx];

  // Format the new value: use integer string when the result is a whole number,
  // otherwise use up to 6 significant digits (trimming trailing zeros).
  const formatted =
    Number.isFinite(newValue) && isInt(newValue)
      ? String(Math.round(newValue))
      : parseFloat(newValue.toPrecision(6)).toString();

  // Replace the numeric value right after the var name in the declaration.
  // The patterns cover all three declaration styles.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // let name = <value>  or  name = <value>
  const letOrBare = new RegExp(`((?:let\\s+)?${escaped}\\s*=\\s*)-?(?:\\d+\\.?\\d*|\\.\\d+)`, 'i');
  // make "name <value>
  const makeRe = new RegExp(`(make\\s+"${escaped}\\s+)-?(?:\\d+\\.?\\d*|\\.\\d+)`, 'i');

  let updated = original.replace(letOrBare, `$1${formatted}`);
  if (updated === original) {
    updated = original.replace(makeRe, `$1${formatted}`);
  }

  if (updated === original) return source; // no match — leave source untouched

  lines[idx] = updated;
  return lines.join('\n');
}

// ── Source updater (text) ─────────────────────────────────────────────────

/**
 * Return a new source string with the string literal on the given 1-based line
 * replaced by `newValue`. Newlines and special characters are escaped using
 * NeedleScript's string-literal syntax, leaving the annotation untouched.
 */
export function updateTextParameter(
  source: string,
  line: number,
  name: string,
  newValue: string,
): string {
  const lines = source.split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return source;

  const original = lines[idx];
  const literal = `'${newValue
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')}'`;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const letOrBare = new RegExp(`((?:let\\s+)?${escaped}\\s*=\\s*)${STRING_LITERAL_PATTERN}`, 'i');
  const makeRe = new RegExp(`(make\\s+"${escaped}\\s+)${STRING_LITERAL_PATTERN}`, 'i');

  let updated = original.replace(letOrBare, (_match, prefix: string) => `${prefix}${literal}`);
  if (updated === original) {
    updated = original.replace(makeRe, (_match, prefix: string) => `${prefix}${literal}`);
  }

  if (updated === original) return source;

  lines[idx] = updated;
  return lines.join('\n');
}

export function updatePaletteParameter(
  source: string,
  line: number,
  name: string,
  colors: string[],
): string {
  const lines = source.split('\n');
  const index = line - 1;
  if (index < 0 || index >= lines.length) return source;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const literal = `[${colors
    .map((color) => `'${color.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
    .join(', ')}]`;
  const letOrBare = new RegExp(`((?:let\\s+)?${escaped}\\s*=\\s*)${COLOR_LIST_PATTERN}`, 'i');
  const makeRe = new RegExp(`(make\\s+"${escaped}\\s+)${COLOR_LIST_PATTERN}`, 'i');
  const original = lines[index];
  let updated = original.replace(letOrBare, `$1${literal}`);
  if (updated === original) updated = original.replace(makeRe, `$1${literal}`);
  if (updated === original) return source;
  lines[index] = updated;
  return lines.join('\n');
}

// ── Source updater (point) ─────────────────────────────────────────────────

/**
 * Return a new source string with the [x, y] list literal on the given
 * 1-based line replaced by [newX, newY]. The annotation comment is left
 * untouched.
 *
 * Handles all three declaration styles:
 *   let name = [x, y]
 *   make "name [x, y]
 *   name = [x, y]
 */
export function updatePointParameter(
  source: string,
  line: number, // 1-based
  name: string,
  newX: number,
  newY: number,
): string {
  const lines = source.split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return source;

  const original = lines[idx];

  const fmtNum = (v: number) =>
    Number.isFinite(v) && isInt(v)
      ? String(Math.round(v))
      : parseFloat(v.toPrecision(6)).toString();

  const replacement = `[${fmtNum(newX)}, ${fmtNum(newY)}]`;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Pattern matches the list literal after the variable name
  const numPat = '-?(?:\\d+\\.?\\d*|\\.\\d+)';
  const listPat = `\\[\\s*${numPat}\\s*,\\s*${numPat}\\s*\\]`;

  // let name = [x, y]  or  name = [x, y]
  const letOrBare = new RegExp(`((?:let\\s+)?${escaped}\\s*=\\s*)${listPat}`, 'i');
  // make "name [x, y]
  const makeRe = new RegExp(`(make\\s+"${escaped}\\s+)${listPat}`, 'i');

  let updated = original.replace(letOrBare, `$1${replacement}`);
  if (updated === original) {
    updated = original.replace(makeRe, `$1${replacement}`);
  }

  if (updated === original) return source;

  lines[idx] = updated;
  return lines.join('\n');
}

/** Rewrite one vertex/anchor/tangent in an annotated path literal. */
export function updatePathParameterPoint(
  source: string,
  def: PathParamDef,
  anchor: number,
  role: 'pos' | 'hin' | 'hout',
  newX: number,
  newY: number,
): string {
  const value = JSON.parse(JSON.stringify(def.value)) as NestedNumberList;
  const entry = value[anchor];
  if (!Array.isArray(entry)) return source;
  if (def.controlType === 'path' || (role === 'pos' && entry.every((v) => typeof v === 'number'))) {
    value[anchor] = [newX, newY];
  } else {
    const full = entry as NestedNumberList;
    const slot = role === 'pos' ? 0 : role === 'hin' ? 1 : 2;
    if (!Array.isArray(full[slot])) return source;
    full[slot] = [newX, newY];
  }

  const lines = source.split('\n');
  const startLine = def.line - 1;
  if (startLine < 0 || startLine >= lines.length) return source;
  const startOffset = lines.slice(0, startLine).reduce((n, line) => n + line.length + 1, 0);
  const open = source.indexOf('[', startOffset);
  if (open < 0) return source;
  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']' && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) return source;
  const fmt = (v: number | NestedNumberList): string =>
    Array.isArray(v)
      ? `[${v.map(fmt).join(', ')}]`
      : Number.isInteger(v)
        ? String(v)
        : String(Number(v.toFixed(3)));
  const original = source.slice(open, close + 1);
  let literal = fmt(value);
  if (original.includes('\n')) {
    const indent = /^\s*/.exec(lines[startLine])?.[0] ?? '';
    literal = `[\n${value.map((entry) => `${indent}  ${fmt(entry)},`).join('\n')}\n${indent}]`;
  }
  return source.slice(0, open) + literal + source.slice(close + 1);
}

// ── Value snapping helper ─────────────────────────────────────────────────

/**
 * Snap a raw value to the nearest multiple of `step` within `[min, max]`.
 * Used when the user types a value manually into the number input.
 */
export function snapValue(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = Math.round((clamped - min) / step) * step + min;
  // Guard against floating-point overshoot after snap
  return Math.min(max, Math.max(min, snapped));
}

// ── Point projection ──────────────────────────────────────────────────────

const HOOP_RADIUS = 47; // mm — the sewable field inside the 100 mm hoop

/** Internal projection without snap (avoids infinite recursion). */
function projectToRegion(p: { x: number; y: number }, region: XYRegion): { x: number; y: number } {
  let { x, y } = p;

  switch (region.kind) {
    case 'free': {
      const dist = Math.sqrt(x * x + y * y);
      if (dist > HOOP_RADIUS) {
        const s = HOOP_RADIUS / dist;
        x *= s;
        y *= s;
      }
      break;
    }
    case 'rect': {
      x = Math.min(region.maxX, Math.max(region.minX, x));
      y = Math.min(region.maxY, Math.max(region.minY, y));
      break;
    }
    case 'disc': {
      const dx = x - region.cx;
      const dy = y - region.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > region.radius) {
        if (dist === 0) {
          // Degenerate case: point at center — push along +x
          x = region.cx + region.radius;
          y = region.cy;
        } else {
          const s = region.radius / dist;
          x = region.cx + dx * s;
          y = region.cy + dy * s;
        }
      }
      break;
    }
    case 'axis': {
      if (region.axis === 'x') {
        // x is free, y is fixed
        y = region.fixedCoord;
        const chordHalf = Math.sqrt(Math.max(0, HOOP_RADIUS * HOOP_RADIUS - y * y));
        const lo = isFinite(region.rangeMin) ? region.rangeMin : -chordHalf;
        const hi = isFinite(region.rangeMax) ? region.rangeMax : chordHalf;
        x = Math.min(hi, Math.max(lo, x));
      } else {
        // y is free, x is fixed
        x = region.fixedCoord;
        const chordHalf = Math.sqrt(Math.max(0, HOOP_RADIUS * HOOP_RADIUS - x * x));
        const lo = isFinite(region.rangeMin) ? region.rangeMin : -chordHalf;
        const hi = isFinite(region.rangeMax) ? region.rangeMax : chordHalf;
        y = Math.min(hi, Math.max(lo, y));
      }
      break;
    }
  }

  return { x, y };
}

/**
 * Project a point into the given constraint region, then optionally snap it.
 * The snap grid is anchored at the origin and applied after projection;
 * the result is re-projected to handle edge-case overshoot.
 *
 * Pure function — safe to call from tests without browser globals.
 */
export function projectPoint(
  p: { x: number; y: number },
  region: XYRegion,
  snap?: number,
): { x: number; y: number } {
  const projected = projectToRegion(p, region);
  if (snap !== undefined && snap > 0) {
    const snapped = {
      x: Math.round(projected.x / snap) * snap,
      y: Math.round(projected.y / snap) * snap,
    };
    // Re-project to handle snap overshoot at region boundaries
    return projectToRegion(snapped, region);
  }
  return projected;
}

// ── Region sampling ────────────────────────────────────────────────────────

const SAMPLE_RADIUS = 40; // mm — tighter disc for randomize (spec §7)

/**
 * Sample a uniform-random point within `region`.
 *
 * @param rng  A `() => number` returning values in [0, 1).
 *             Pass your own PRNG — never `Math.random` from lib code.
 * @returns    A projected+snapped point inside the region.
 */
export function sampleRegion(
  region: XYRegion,
  snap: number | undefined,
  rng: () => number,
): { x: number; y: number } {
  let x: number;
  let y: number;

  switch (region.kind) {
    case 'free': {
      // Area-uniform within 40 mm disc (spec §7)
      const r = SAMPLE_RADIUS * Math.sqrt(rng());
      const theta = rng() * 2 * Math.PI;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
      break;
    }
    case 'rect': {
      x = region.minX + rng() * (region.maxX - region.minX);
      y = region.minY + rng() * (region.maxY - region.minY);
      break;
    }
    case 'disc': {
      const r = region.radius * Math.sqrt(rng());
      const theta = rng() * 2 * Math.PI;
      x = region.cx + r * Math.cos(theta);
      y = region.cy + r * Math.sin(theta);
      break;
    }
    case 'axis': {
      if (region.axis === 'x') {
        y = region.fixedCoord;
        const chordHalf = Math.sqrt(Math.max(0, HOOP_RADIUS * HOOP_RADIUS - y * y));
        const lo = isFinite(region.rangeMin) ? region.rangeMin : -chordHalf;
        const hi = isFinite(region.rangeMax) ? region.rangeMax : chordHalf;
        x = lo + rng() * (hi - lo);
      } else {
        x = region.fixedCoord;
        const chordHalf = Math.sqrt(Math.max(0, HOOP_RADIUS * HOOP_RADIUS - x * x));
        const lo = isFinite(region.rangeMin) ? region.rangeMin : -chordHalf;
        const hi = isFinite(region.rangeMax) ? region.rangeMax : chordHalf;
        y = lo + rng() * (hi - lo);
      }
      break;
    }
  }

  return projectPoint({ x, y }, region, snap);
}

// ── Preset parser ─────────────────────────────────────────────────────────

// Matches a @preset / @snapshot annotation anywhere a comment is valid:
//   // @preset Dense Rosette : bigR=100, rollR=63, pen=50
//   // @snapshot Alias       : layers=1
const PRESET_RE = /^\s*(?:\/\/|;|#)\s*@(?:preset|snapshot)\s+(.+?)\s*:\s*(.+)$/i;

/** Split a preset value string on top-level commas (ignoring commas inside []).
 *  e.g. "anchor=[0,26], tip=[22,0], layers=8"  →  ["anchor=[0,26]", " tip=[22,0]", " layers=8"]
 */
function splitPresetPairs(s: string): string[] {
  const pairs: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      pairs.push(s.slice(start, i));
      start = i + 1;
    }
  }
  pairs.push(s.slice(start));
  return pairs;
}

/**
 * Parse all @preset / @snapshot definitions from the source and return them
 * in declaration order.  Lines that don't match the pattern are ignored.
 */
export function parsePresets(source: string): Preset[] {
  const presets: Preset[] = [];
  for (const line of source.split('\n')) {
    const m = PRESET_RE.exec(line);
    if (!m) continue;

    const name = m[1].trim();
    if (!name) continue;

    const values: Preset['values'] = {};
    for (const pair of splitPresetPairs(m[2])) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const key = pair.slice(0, eq).trim().toLowerCase();
      if (!key) continue;
      const rawVal = pair.slice(eq + 1).trim();

      if (new RegExp(`^${COLOR_LIST_PATTERN}$`).test(rawVal)) {
        values[key] = [...rawVal.matchAll(new RegExp(STRING_LITERAL_PATTERN, 'g'))].map((entry) =>
          decodeStringLiteral(entry[0].slice(1, -1)),
        );
        continue;
      }
      if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(rawVal)) {
        values[key] = rawVal.toLowerCase();
        continue;
      }
      if (new RegExp(`^${STRING_LITERAL_PATTERN}$`).test(rawVal)) {
        values[key] = decodeStringLiteral(rawVal.slice(1, -1));
        continue;
      }

      // Point value: [x, y]
      const pointMatch = /^\[\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*\]$/.exec(
        rawVal,
      );
      if (pointMatch) {
        const px = parseFloat(pointMatch[1]);
        const py = parseFloat(pointMatch[2]);
        if (Number.isFinite(px) && Number.isFinite(py)) values[key] = [px, py];
        continue;
      }

      const nested = parseNestedNumberList(rawVal);
      if (nested && nested.length >= 2) {
        values[key] = nested;
        continue;
      }

      // Scalar value
      const val = parseFloat(rawVal);
      if (Number.isFinite(val)) values[key] = val;
    }

    if (Object.keys(values).length > 0) {
      presets.push({ name, values });
    }
  }
  return presets;
}
