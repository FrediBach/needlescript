// ---------- List runtime (RFC-2) + String runtime ----------
//
// Runtime values are `number | string | NsList`. NsList is a class so
// `instanceof` is the type tag and identity is reference identity (Python
// model: mutable, reference semantics, explicit deep copy()).
//
// Strings are immutable value types: no aliasing, deepCopy is identity.
//
// Every deep operation here is capped at LIMITS.maxListDepth. Cycles can
// be created through mutation (append a list into its own descendant);
// the depth cap turns any deep walk over a cycle into a loud error
// instead of a hang — loud beats convenient.

import { NeedlescriptError } from './errors.ts';
import { LIMITS } from './machine.ts';

export type Val = number | string | NsList | FuncRef;

export interface RefSignature {
  min: number;
  max: number;
}

export class NsList {
  items: Val[];
  constructor(items: Val[] = []) {
    this.items = items;
  }
  get length(): number {
    return this.items.length;
  }
}

/**
 * A reference to a user procedure, produced by the `@name` syntax. It is the
 * one new value kind effects introduce: `warp`/`warppath` call it once per
 * point, and `satin @fn` calls it once per stitch pair (a shape reporter).
 * Everywhere else it is a loud type error — `num`, `truthy` and the shape
 * guards all reject it by name.
 */
export class FuncRef {
  name: string;
  bound: Val[];
  signature: RefSignature;
  sourceLine?: number;
  captureNames?: string[];
  constructor(
    name: string,
    signature: RefSignature = { min: 0, max: Infinity },
    bound: Val[] = [],
    sourceLine?: number,
    captureNames?: string[],
  ) {
    this.name = name;
    this.signature = signature;
    this.bound = bound;
    this.sourceLine = sourceLine;
    this.captureNames = captureNames;
  }
}

/**
 * A left-to-right pipeline of function references, created by `compose(@f, @g, …)`.
 * Extends FuncRef so it passes `isFuncRef` checks and can be used anywhere a
 * single @ref is accepted (map, filter, reduce, warp, …).
 */
export class ComposedRef extends FuncRef {
  steps: FuncRef[];
  constructor(steps: FuncRef[], bound: Val[] = []) {
    const first = steps[0];
    const signature = first
      ? {
          min: Math.max(0, first.signature.min - first.bound.length),
          max: Math.max(0, first.signature.max - first.bound.length),
        }
      : { min: 0, max: 0 };
    super('<composed>', signature, bound);
    this.steps = steps;
  }
}

export const isList = (v: Val): v is NsList => v instanceof NsList;
export const isFuncRef = (v: Val): v is FuncRef => v instanceof FuncRef;
export const isComposedRef = (v: Val): v is ComposedRef => v instanceof ComposedRef;
export const isString = (v: Val): v is string => typeof v === 'string';

/** Format a number the way print always has. */
export function formatNum(v: number): string {
  return Math.abs(v - Math.round(v)) < 1e-9
    ? String(Math.round(v))
    : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Encode a string for display inside a list: single-quoted with escapes. */
function escapeStringForDisplay(s: string): string {
  let out = "'";
  for (const ch of s) {
    if (ch === "'") out += "\\'";
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else out += ch;
  }
  return out + "'";
}

const PRINT_CAP = 64;

/**
 * Format any runtime value for display.
 * - Numbers: formatNum
 * - Strings: raw when `insideList=false` (top-level print), quoted with escapes when inside a list
 * - Lists: [1, 'a', …]  (capped at 64 elements)
 */
export function formatVal(v: Val, insideList = false, depth = 0): string {
  if (v instanceof ComposedRef) {
    const pipeline = `compose(${v.steps.map((s) => formatVal(s, true)).join(', ')})`;
    return v.bound.length > 0 ? `${pipeline}(+${v.bound.length} bound)` : pipeline;
  }
  if (isFuncRef(v)) {
    const displayName = v.name.startsWith('$anon:')
      ? `anon:L${v.sourceLine ?? v.name.slice('$anon:'.length)}`
      : v.name;
    const effectiveMin = Math.max(0, v.signature.min - v.bound.length);
    const effectiveMax = Math.max(0, v.signature.max - v.bound.length);
    const arity =
      effectiveMin === effectiveMax ? String(effectiveMin) : `${effectiveMin}..${effectiveMax}`;
    return `@${displayName}${v.bound.length > 0 ? `(+${v.bound.length} bound)` : ''}/${arity}`;
  }
  if (typeof v === 'string') return insideList ? escapeStringForDisplay(v) : v;
  if (typeof v === 'number') return formatNum(v);
  if (depth >= LIMITS.maxListDepth)
    throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`);
  const shown = v.items.slice(0, PRINT_CAP).map((x) => formatVal(x, true, depth + 1));
  const more = v.items.length - PRINT_CAP;
  return `[${shown.join(', ')}${more > 0 ? `, … +${more} more` : ''}]`;
}

/** Describe a value for error messages: "a list (length 3)" / "a number" / "a string". */
export function describeVal(v: Val): string {
  if (v instanceof ComposedRef) return 'a composed reference';
  if (isFuncRef(v)) return `a procedure reference (@${v.name})`;
  if (typeof v === 'string') return 'a string';
  return isList(v) ? `a list (length ${v.items.length})` : 'a number';
}

/**
 * Guard: the value must be a number. `what` names the operation
 * (`"+"`, `fd`, `sin`, …); `side` optionally names the operand
 * ("on the left" / "on the right").
 */
export function num(v: Val, what: string, line?: number, side?: string): number {
  if (typeof v !== 'number')
    throw new NeedlescriptError(
      `"${what}" expected a number, got ${describeVal(v)}${side ? ` ${side}` : ''}`,
      line,
    );
  return v;
}

/** Depth of a value: numbers and strings are 0, [] is 1, [[1]] is 2 … capped. */
export function valDepth(v: Val, depth = 0): number {
  if (!isList(v)) return 0;
  if (depth >= LIMITS.maxListDepth)
    throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`);
  let d = 1;
  for (const x of v.items) {
    if (isList(x)) d = Math.max(d, 1 + valDepth(x, depth + 1));
  }
  return d;
}

/**
 * Deep equality: element-count first, then per-number with the existing
 * 1e-9 tolerance. Mixed types are unequal (equality is a question,
 * not a type assertion). Strings compare by exact case-sensitive content.
 */
export function deepEqual(a: Val, b: Val, depth = 0): boolean {
  if (depth >= LIMITS.maxListDepth)
    throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`);
  if (isFuncRef(a) || isFuncRef(b)) throw new NeedlescriptError('references are not comparable');
  // Strings: exact, case-sensitive comparison. Cross-type always false.
  if (typeof a === 'string' || typeof b === 'string') {
    return typeof a === 'string' && typeof b === 'string' && a === b;
  }
  const al = isList(a),
    bl = isList(b);
  if (al !== bl) return false;
  if (!al) return Math.abs((a as number) - (b as number)) < 1e-9;
  const ai = (a as NsList).items,
    bi = (b as NsList).items;
  if (ai.length !== bi.length) return false;
  for (let i = 0; i < ai.length; i++) {
    if (!deepEqual(ai[i], bi[i], depth + 1)) return false;
  }
  return true;
}

/**
 * Deep copy. `onCell` is called once per copied cell so the interpreter
 * can charge the op budget and the live-cell counter.
 * Strings are immutable value types — copy is identity, no cell charge.
 */
export function deepCopy(v: Val, onCell: () => void, depth = 0): Val {
  if (!isList(v)) return v; // numbers, strings, FuncRefs copy by value
  if (depth >= LIMITS.maxListDepth)
    throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`);
  const out: Val[] = [];
  for (const x of v.items) {
    onCell();
    out.push(deepCopy(x, onCell, depth + 1));
  }
  return new NsList(out);
}

/** Count cells of a value (1 per element, recursively), depth-capped. */
export function cellCount(v: Val, depth = 0): number {
  if (!isList(v)) return 0;
  if (depth >= LIMITS.maxListDepth)
    throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`);
  let n = v.items.length;
  for (const x of v.items) n += cellCount(x, depth + 1);
  return n;
}
