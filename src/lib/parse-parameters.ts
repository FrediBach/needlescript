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
//   // --- Section ---               section header (standalone line)
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

export type ParamItem =
  | { kind: 'section'; title: string }
  | { kind: 'param'; def: ParamDef };

// ── Regex helpers ──────────────────────────────────────────────────────────

// Matches any of the three declaration forms and captures name + value:
//   let name = 15.3
//   make "name 15.3
//   name = 15.3
// Groups: 1=let-name, 2=make-name, 3=bare-name, 4=value
const DECL_RE =
  /^\s*(?:let\s+([A-Za-z_]\w*)\s*=|make\s+"([A-Za-z_]\w*)\s+|([A-Za-z_]\w*)\s*=)\s*(-?(?:\d+\.?\d*|\.\d+))/;

// Matches the annotation bracket at the end of any line (after optional code)
//   // [...]  or  ; [...]  or  # [...]
const ANNOT_RE = /(?:\/\/|;|#)\s*\[([^\]]+)\]/;

// Section header: // --- Title ---   (any comment style)
const SECTION_RE = /^\s*(?:\/\/|;|#)\s*-{2,}\s*(.+?)\s*-{2,}\s*$/;

// ── Annotation content parser ──────────────────────────────────────────────

function isInt(n: number): boolean {
  return Number.isFinite(n) && Math.floor(n) === n;
}

function parseAnnotation(
  content: string,
): Omit<ParamDef, 'name' | 'value' | 'line'> | null {
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
  const parts = trimmed.split(':').map(s => s.trim());
  if (parts.length === 2) {
    // [min:max]
    const min  = parseFloat(parts[0]);
    const max  = parseFloat(parts[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
    // Only treat as integer slider when both bounds are whole numbers AND the
    // range spans more than 1 unit.  [0:1] with integer bounds is a normalised
    // float range (smooth), not a two-value integer toggle — use [switch] for that.
    const bothInt = isInt(min) && isInt(max) && (max - min) > 1;
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
    const min  = parseFloat(parts[0]);
    const step = parseFloat(parts[1]);
    const max  = parseFloat(parts[2]);
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

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse the source and return all parameter items (section headers + controls)
 * in source order. Returns an empty array when no annotated parameters exist.
 */
export function parseParameters(source: string): ParamItem[] {
  const lines  = source.split('\n');
  const items: ParamItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNo  = i + 1; // 1-based

    // ── Section header ────────────────────────────────────────────────────
    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      items.push({ kind: 'section', title: sectionMatch[1] });
      continue;
    }

    // ── Variable declaration with annotation ─────────────────────────────
    const declMatch = DECL_RE.exec(line);
    if (!declMatch) continue;

    const annotMatch = ANNOT_RE.exec(line);
    if (!annotMatch) continue;

    const name     = (declMatch[1] ?? declMatch[2] ?? declMatch[3]).toLowerCase();
    const rawValue = parseFloat(declMatch[4]);
    if (!Number.isFinite(rawValue)) continue;

    const annotation = parseAnnotation(annotMatch[1]);
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

// ── Source updater ────────────────────────────────────────────────────────

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
  line: number,           // 1-based
  name: string,
  newValue: number,
): string {
  const lines = source.split('\n');
  const idx   = line - 1;
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
  const letOrBare = new RegExp(
    `((?:let\\s+)?${escaped}\\s*=\\s*)-?(?:\\d+\\.?\\d*|\\.\\d+)`,
    'i',
  );
  // make "name <value>
  const makeRe = new RegExp(
    `(make\\s+"${escaped}\\s+)-?(?:\\d+\\.?\\d*|\\.\\d+)`,
    'i',
  );

  let updated = original.replace(letOrBare, `$1${formatted}`);
  if (updated === original) {
    updated = original.replace(makeRe, `$1${formatted}`);
  }

  if (updated === original) return source; // no match — leave source untouched

  lines[idx] = updated;
  return lines.join('\n');
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
