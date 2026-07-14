import { NeedlescriptError } from '../errors.ts';
import { isList, describeVal, formatNum } from '../list.ts';
import type { FuncRef } from '../list.ts';
import * as gm from '../genmath.ts';
import type { Pt } from '../genmath.ts';
import { MAXSHIFT_MAX } from '../declump.ts';
import type { RunContext } from './context.ts';

export function initReporters(ctx: RunContext): void {
  /**
   * Invoke a `@name` reporter on a point, returning the mapped point. This is
   * the one piece of effect machinery that runs user code per emitted vertex:
   * it enforces the reporter contract (exactly one argument, returns a point)
   * with errors that name exactly what went wrong.
   */
  ctx.applyReporter = (ref: FuncRef, x: number, y: number, line?: number): Pt => {
    const proc = ctx.procs[ref.name];
    if (!proc) throw new NeedlescriptError(`the warp reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 1)
      throw new NeedlescriptError(
        `the warp reporter @${ref.name} must take exactly one argument (the point [x, y]), but takes ${proc.params.length}`,
        line,
      );
    const out = ctx.callProcVals(ref.name, [ctx.allocList([x, y], line)], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the warp reporter @${ref.name} never reached output/return — it must return a point [x, y]`,
        line,
      );
    return gm.toPoint(out, `the warp reporter @${ref.name}`, line);
  };

  /**
   * Eager half of the shape-reporter contract: the reporter exists and takes
   * exactly 4 parameters. Run at the `satin @fn` engage site so a malformed
   * signature is reported there; the return-value half is checked per call.
   */
  ctx.applyShapeReporterArity = (ref: FuncRef, line?: number) => {
    const proc = ctx.procs[ref.name];
    if (!proc) throw new NeedlescriptError(`the satin reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must take exactly 4 parameters (t, s, i, u), but takes ${proc.params.length}`,
        line,
      );
  };

  /**
   * Invoke a `@name` shape reporter for one satin pair, returning the validated
   * 5-number contract `[advance, leftw, rightw, leftlag, rightlag]`.
   */
  ctx.applyShapeReporter = (
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    u: number,
    line?: number,
  ): [number, number, number, number, number] => {
    const proc = ctx.procs[ref.name];
    if (!proc) throw new NeedlescriptError(`the satin reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must take exactly 4 parameters (t, s, i, u), but takes ${proc.params.length}`,
        line,
      );
    const out = ctx.callProcVals(ref.name, [t, s, i, u], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} never reached output/return — it must return [advance, leftw, rightw, leftlag, rightlag]`,
        line,
      );
    if (!isList(out))
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must return a list of 5 numbers [advance, leftw, rightw, leftlag, rightlag], got ${describeVal(out)}`,
        line,
      );
    if (out.items.length !== 5)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must return exactly 5 numbers [advance, leftw, rightw, leftlag, rightlag], got a list of ${out.items.length}`,
        line,
      );
    const slot = ['advance', 'leftw', 'rightw', 'leftlag', 'rightlag'];
    const r = out.items.map((v, k) => {
      if (typeof v !== 'number')
        throw new NeedlescriptError(
          `the satin reporter @${ref.name} returned ${describeVal(v)} for ${slot[k]} (slot ${k + 1} of 5) — it must be a number`,
          line,
        );
      return v;
    });
    return [r[0], r[1], r[2], r[3], r[4]];
  };

  // ---- Programmable stitchlen reporter (`stitchlen @fn`, §5) ----------

  ctx.applyStitchLenReporterArity = (ref: FuncRef, line?: number) => {
    const proc = ctx.procs[ref.name];
    if (!proc)
      throw new NeedlescriptError(`the stitchlen reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the stitchlen reporter @${ref.name} must take exactly 4 parameters (t, s, i, p), but takes ${proc.params.length}`,
        line,
      );
  };

  /** Invoke a stitchlen reporter once; validates and returns the advance (mm). */
  ctx.applyStitchLenReporter = (
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    p: [number, number],
    line?: number,
  ): number => {
    const proc = ctx.procs[ref.name];
    if (!proc)
      throw new NeedlescriptError(`the stitchlen reporter @${ref.name} is not defined`, line);
    const out = ctx.callProcVals(ref.name, [t, s, i, ctx.allocList([p[0], p[1]], line)], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the stitchlen reporter @${ref.name} never reached output/return — it must return a number (mm)`,
        line,
      );
    if (typeof out !== 'number' || !isFinite(out))
      throw new NeedlescriptError(
        `the stitchlen reporter @${ref.name} must return a finite number (mm advance), got ${describeVal(out)}`,
        line,
      );
    if (out <= 0)
      throw new NeedlescriptError(
        `the stitchlen reporter @${ref.name} returned ${formatNum(out)} — advance must be greater than 0 (a non-positive advance never terminates)`,
        line,
      );
    return out;
  };

  // ---- Programmable fill rows — stitchlen equivalent (`filllen @fn`) ----------

  ctx.applyFillLenReporterArity = (ref: FuncRef, line?: number) => {
    const proc = ctx.procs[ref.name];
    if (!proc)
      throw new NeedlescriptError(`the filllen reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the filllen reporter @${ref.name} must take exactly 4 parameters (t, s, i, p), but takes ${proc.params.length}`,
        line,
      );
  };

  /** Invoke a filllen reporter once; validates and returns the requested advance (mm). */
  ctx.applyFillLenReporter = (
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    p: [number, number],
    line?: number,
  ): number => {
    const proc = ctx.procs[ref.name];
    if (!proc)
      throw new NeedlescriptError(`the filllen reporter @${ref.name} is not defined`, line);
    const out = ctx.callProcVals(ref.name, [t, s, i, ctx.allocList([p[0], p[1]], line)], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the filllen reporter @${ref.name} never reached output/return — it must return a number (mm)`,
        line,
      );
    if (typeof out !== 'number' || !isFinite(out))
      throw new NeedlescriptError(
        `the filllen reporter @${ref.name} must return a finite number (mm advance), got ${describeVal(out)}`,
        line,
      );
    if (out <= 0)
      throw new NeedlescriptError(
        `the filllen reporter @${ref.name} returned ${formatNum(out)} — advance must be greater than 0`,
        line,
      );
    return out;
  };

  // ---- Programmable fill reporters (`fill dir @d shape @s`, §3) ----------

  ctx.applyFillDirArity = (name: string, line?: number) => {
    const proc = ctx.procs[name];
    if (!proc) throw new NeedlescriptError(`the fill dir reporter @${name} is not defined`, line);
    if (proc.params.length !== 1)
      throw new NeedlescriptError(
        `the fill dir reporter @${name} must take exactly 1 parameter (the point [x, y]), but takes ${proc.params.length}`,
        line,
      );
  };

  /** Invoke a dir reporter; returns a turtle heading. Non-finite ⇒ NaN (a field
   * singularity the generator handles per §5.2), not an error. */
  ctx.applyFillDir = (name: string, px: number, py: number, line?: number): number => {
    const out = ctx.callProcVals(name, [ctx.allocList([px, py], line)], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the fill dir reporter @${name} never reached output/return — it must return a heading (a number)`,
        line,
      );
    if (typeof out !== 'number')
      throw new NeedlescriptError(
        `the fill dir reporter @${name} must return a heading (a number), got ${describeVal(out)}`,
        line,
      );
    return out;
  };

  ctx.applyFillShapeArity = (name: string, line?: number) => {
    const proc = ctx.procs[name];
    if (!proc) throw new NeedlescriptError(`the fill shape reporter @${name} is not defined`, line);
    if (proc.params.length !== 3)
      throw new NeedlescriptError(
        `the fill shape reporter @${name} must take exactly 3 parameters (p, row, v), but takes ${proc.params.length}`,
        line,
      );
  };

  /** Invoke a shape reporter; returns the validated [spacing, len, phase]. */
  ctx.applyFillShape = (
    name: string,
    px: number,
    py: number,
    row: number,
    v: number,
    line?: number,
  ): [number, number, number] => {
    const out = ctx.callProcVals(name, [ctx.allocList([px, py], line), row, v], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the fill shape reporter @${name} never reached output/return — it must return [spacing, len, phase]`,
        line,
      );
    if (!isList(out))
      throw new NeedlescriptError(
        `the fill shape reporter @${name} must return a list of 3 numbers [spacing, len, phase], got ${describeVal(out)}`,
        line,
      );
    if (out.items.length !== 3)
      throw new NeedlescriptError(
        `the fill shape reporter @${name} must return exactly 3 numbers [spacing, len, phase], got a list of ${out.items.length}`,
        line,
      );
    const slot = ['spacing', 'len', 'phase'];
    const r = out.items.map((val, k) => {
      if (typeof val !== 'number')
        throw new NeedlescriptError(
          `the fill shape reporter @${name} returned ${describeVal(val)} for ${slot[k]} (slot ${k + 1} of 3) — it must be a number`,
          line,
        );
      return val;
    });
    return [r[0], r[1], r[2]];
  };

  /** Clamp humanize jitter to a sane embroidery range (0–2 mm), warning if out. */
  ctx.clampHumanize = (amount: number): number => {
    const v = Math.min(Math.max(amount, 0), 2);
    if (v !== amount)
      ctx.m.warnings.push(
        `humanize ${formatNum(amount)} clamped to ${formatNum(v)} mm (range 0–2)`,
      );
    return v;
  };

  /** Clamp declump maxshift to the allowed physical range (0–5 mm), warning if out. */
  ctx.clampMaxshift = (amount: number): number => {
    const v = Math.min(Math.max(amount, 0), MAXSHIFT_MAX);
    if (v !== amount)
      ctx.m.warnings.push(
        `declump maxshift ${formatNum(amount)} clamped to ${formatNum(v)} mm (range 0–${MAXSHIFT_MAX})`,
      );
    return v;
  };
}
