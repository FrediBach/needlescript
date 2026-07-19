import { NeedlescriptError } from '../core/errors.ts';
import { STOCK_LIMITS } from '../embroidery/machine/index.ts';
import type { Val } from './list.ts';
import { NsList } from './list.ts';
import type { RunContext } from './context.ts';

export function initBudget(ctx: RunContext): void {
  ctx.traceNote = (kind: string, msg: string) => {
    if (ctx.insideTrace > 0 && !ctx.traceNoted.has(kind)) {
      ctx.traceNoted.add(kind);
      ctx.m.warnings.push(msg);
    }
  };

  ctx.overlongMsg = (): string => {
    const raised = ctx.m.effectiveLimits.maxOps > STOCK_LIMITS.maxOps;
    return (
      'Program ran too long (possible infinite loop) — stopped' +
      (raised
        ? ` (op limit raised by override from ${STOCK_LIMITS.maxOps.toLocaleString('en-US')})`
        : '') +
      (ctx.m.usedQuery
        ? ' — a feedback loop may not be terminating; is your coverage target reachable? Cap it with  repeat N [ … if done [ break ] ].'
        : '')
    );
  };

  ctx.tick = (line?: number) => {
    if (++ctx.ops > ctx.m.effectiveLimits.maxOps)
      throw new NeedlescriptError(ctx.overlongMsg(), line);
  };

  /** Charge n element reads/writes against the op budget. */
  ctx.tickN = (n: number, line?: number) => {
    ctx.ops += n;
    if (ctx.ops > ctx.m.effectiveLimits.maxOps)
      throw new NeedlescriptError(ctx.overlongMsg(), line);
  };

  /** Charge n freshly allocated list cells (and the op budget). */
  ctx.charge = (n: number, line?: number) => {
    ctx.cells += n;
    if (ctx.cells > ctx.m.effectiveLimits.maxListCells)
      throw new NeedlescriptError(
        `Too many list cells (over ${ctx.m.effectiveLimits.maxListCells.toLocaleString('en-US')}) — stopped`,
        line,
      );
    ctx.tickN(n, line);
  };

  /** Allocate a new string, enforcing per-string and total-char budgets. */
  ctx.allocString = (s: string, line?: number): string => {
    if (s.length > ctx.m.effectiveLimits.maxStringLength)
      throw new NeedlescriptError(
        `String is too long (${s.length.toLocaleString('en-US')} chars, limit ${ctx.m.effectiveLimits.maxStringLength.toLocaleString('en-US')})`,
        line,
      );
    ctx.stringChars += s.length;
    if (ctx.stringChars > ctx.m.effectiveLimits.maxStringChars)
      throw new NeedlescriptError(
        `String allocation budget exceeded (over ${ctx.m.effectiveLimits.maxStringChars.toLocaleString('en-US')} total chars) — stopped`,
        line,
      );
    return s;
  };

  /** Allocate a new list, enforcing the length limit and charging cells. */
  ctx.allocList = (items: Val[], line?: number): NsList => {
    if (items.length > ctx.m.effectiveLimits.maxListLen)
      throw new NeedlescriptError(
        `List too long (${items.length.toLocaleString('en-US')} elements, limit ${ctx.m.effectiveLimits.maxListLen.toLocaleString('en-US')})`,
        line,
      );
    ctx.charge(items.length, line);
    return new NsList(items);
  };
}
