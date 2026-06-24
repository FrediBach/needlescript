// ---------- List runtime (RFC-2) ----------
//
// Runtime values are `number | NsList`. NsList is a class so `instanceof`
// is the type tag and identity is reference identity (Python model:
// mutable, reference semantics, explicit deep copy()).
//
// Every deep operation here is capped at LIMITS.maxListDepth. Cycles can
// be created through mutation (append a list into its own descendant);
// the depth cap turns any deep walk over a cycle into a loud error
// instead of a hang — loud beats convenient.

import { NeedlescriptError } from './errors.ts';
import { LIMITS } from './machine.ts';

export type Val = number | NsList | FuncRef;

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
 * one new value kind effects introduce: only `warp` and `warppath` consume it
 * (calling it once per point), and everywhere else it is a loud type error —
 * `num`, `truthy` and the shape guards all reject it by name.
 */
export class FuncRef {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

export const isList = (v: Val): v is NsList => v instanceof NsList;
export const isFuncRef = (v: Val): v is FuncRef => v instanceof FuncRef;

/** Format a number the way print always has. */
export function formatNum(v: number): string {
  return Math.abs(v - Math.round(v)) < 1e-9
    ? String(Math.round(v))
    : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

const PRINT_CAP = 64;

/** Format any runtime value; lists as [1, 2, 3], capped at 64 elements. */
export function formatVal(v: Val, depth = 0): string {
  if (isFuncRef(v)) return '@' + v.name;
  if (!isList(v)) return formatNum(v);
  if (depth >= LIMITS.maxListDepth)
    throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`);
  const shown = v.items.slice(0, PRINT_CAP).map(x => formatVal(x, depth + 1));
  const more = v.items.length - PRINT_CAP;
  return `[${shown.join(', ')}${more > 0 ? `, … +${more} more` : ''}]`;
}

/** Describe a value for error messages: "a list (length 3)" / "a number". */
export function describeVal(v: Val): string {
  if (isFuncRef(v)) return `a procedure reference (@${v.name})`;
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

/** Depth of a value: numbers are 0, [] is 1, [[1]] is 2 … capped. */
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
 * 1e-9 tolerance. Mixed number/list is false (equality is a question,
 * not a type assertion).
 */
export function deepEqual(a: Val, b: Val, depth = 0): boolean {
  if (depth >= LIMITS.maxListDepth)
    throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`);
  if (isFuncRef(a) || isFuncRef(b))
    return isFuncRef(a) && isFuncRef(b) && a.name === b.name;
  const al = isList(a), bl = isList(b);
  if (al !== bl) return false;
  if (!al) return Math.abs((a as number) - (b as number)) < 1e-9;
  const ai = (a as NsList).items, bi = (b as NsList).items;
  if (ai.length !== bi.length) return false;
  for (let i = 0; i < ai.length; i++) {
    if (!deepEqual(ai[i], bi[i], depth + 1)) return false;
  }
  return true;
}

/**
 * Deep copy. `onCell` is called once per copied cell so the interpreter
 * can charge the op budget and the live-cell counter.
 */
export function deepCopy(v: Val, onCell: () => void, depth = 0): Val {
  if (!isList(v)) return v;
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
