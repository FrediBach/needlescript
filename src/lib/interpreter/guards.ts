import { NeedlescriptError } from '../errors.ts';
import {
  isList,
  isFuncRef,
  describeVal,
  valDepth,
  num,
  formatNum,
  NsList,
  FuncRef,
} from '../list.ts';
import { LIMITS } from '../machine.ts';
import type { Val } from '../list.ts';
import type { RunContext } from './context.ts';

export function initGuards(ctx: RunContext): void {
  /**
   * A condition must be a number; lists and strings are loud errors.
   */
  ctx.truthy = (v: Val, what: string, line?: number): number => {
    if (isList(v))
      throw new NeedlescriptError(
        `"${what}" got ${describeVal(v)} — a list isn't true or false, use len(xs) > 0`,
        line,
      );
    if (typeof v === 'string')
      throw new NeedlescriptError(
        `string in a condition — use len(s) > 0 or an explicit comparison like s == '...'`,
        line,
      );
    if (typeof v !== 'number')
      throw new NeedlescriptError(
        `"${what}" got ${describeVal(v)} — that isn't true or false`,
        line,
      );
    return v;
  };

  /**
   * Normalize an index into a sequence of length `len`: must be a number,
   * integral within 1e-9, negatives count from the end, out of range
   * (either direction) is an error.
   */
  ctx.toIndex = (v: Val, len: number, what: string, line?: number): number => {
    const n = num(v, what, line);
    const r = Math.round(n);
    if (Math.abs(n - r) > 1e-9)
      throw new NeedlescriptError(
        `${what}: index ${formatNum(n)} isn't a whole number — use floor() deliberately`,
        line,
      );
    const i = r < 0 ? r + len : r;
    if (i < 0 || i >= len)
      throw new NeedlescriptError(`${what}: index ${r} is out of range (length ${len})`, line);
    return i;
  };

  /** The value must be a list. */
  ctx.list = (v: Val, what: string, line?: number): NsList => {
    if (typeof v === 'string')
      throw new NeedlescriptError(`"${what}" expected a list, got a string`, line);
    if (!isList(v)) throw new NeedlescriptError(`"${what}" expected a list, got a number`, line);
    return v;
  };

  /** The value must be a @procedure reference. */
  ctx.funcRef = (v: Val, what: string, line?: number): FuncRef => {
    if (!isFuncRef(v))
      throw new NeedlescriptError(
        `"${what}" expected a @procedure reference, got ${describeVal(v)}`,
        line,
      );
    return v;
  };

  /** Check that nesting an element one level deeper stays within the cap. */
  ctx.checkDepth = (v: Val, line?: number) => {
    if (isList(v) && valDepth(v) + 1 > LIMITS.maxListDepth)
      throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`, line);
  };
}
