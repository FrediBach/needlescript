import { NeedlescriptError } from '../core/errors.ts';
import { isList, describeVal, formatNum } from './list.ts';
import type { FuncRef } from './list.ts';
import * as gm from '../geometry/genmath.ts';
import type { Pt } from '../geometry/genmath.ts';
import { MAXSHIFT_MAX } from '../embroidery/declump.ts';
import type { RunContext } from './context.ts';

export function initReporters(ctx: RunContext): void {
  /**
   * Invoke a `@name` reporter on a point, returning the mapped point. This is
   * the one piece of effect machinery that runs user code per emitted vertex:
   * it enforces the reporter contract (exactly one argument, returns a point)
   * with errors that name exactly what went wrong.
   */
  ctx.applyReporter = (ref: FuncRef, x: number, y: number, line?: number): Pt => {
    ctx.assertRefArity(ref, 1, 'warp', line);
    const out = ctx.callRef(ref, [ctx.allocList([x, y], line)], 0, line);
    return gm.toPoint(out, `the warp reporter @${ref.name}`, line);
  };

  /**
   * Eager half of the shape-reporter contract: the reporter exists and takes
   * exactly 4 parameters. Run at the `satin @fn` engage site so a malformed
   * signature is reported there; the return-value half is checked per call.
   */
  ctx.applyShapeReporterArity = (ref: FuncRef, line?: number) => {
    ctx.assertRefArity(ref, 4, 'satin', line);
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
    const out = ctx.callRef(ref, [t, s, i, u], 0, line);
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

  ctx.applyRailShapeReporterArity = (ref: FuncRef, line?: number) => {
    ctx.assertRefArity(ref, 4, 'satinbetween', line);
  };

  ctx.applyRailShapeReporter = (ref, t, s, i, u, line) => {
    const out = ctx.callRef(ref, [t, s, i, u], 0, line);
    const contract = '[advance, insetA, insetB, lagA, lagB]';
    if (out === undefined)
      throw new NeedlescriptError(
        `the satinbetween reporter @${ref.name} never reached output/return — it must return ${contract}`,
        line,
      );
    if (!isList(out) || out.items.length !== 5)
      throw new NeedlescriptError(
        `the satinbetween reporter @${ref.name} must return exactly 5 numbers ${contract}, got ${describeVal(out)}`,
        line,
      );
    const names = ['advance', 'insetA', 'insetB', 'lagA', 'lagB'];
    const values = out.items.map((value, index) => {
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new NeedlescriptError(
          `the satinbetween reporter @${ref.name} returned ${describeVal(value)} for ${names[index]} (slot ${index + 1} of 5) — it must be a finite number`,
          line,
        );
      return value;
    });
    return [values[0], values[1], values[2], values[3], values[4]];
  };

  // ---- Programmable stitchlen reporter (`stitchlen @fn`, §5) ----------

  ctx.applyStitchLenReporterArity = (ref: FuncRef, line?: number) => {
    ctx.assertRefArity(ref, 4, 'stitchlen', line);
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
    const out = ctx.callRef(ref, [t, s, i, ctx.allocList([p[0], p[1]], line)], 0, line);
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
    ctx.assertRefArity(ref, 4, 'filllen', line);
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
    const out = ctx.callRef(ref, [t, s, i, ctx.allocList([p[0], p[1]], line)], 0, line);
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

  ctx.applyFillDirArity = (ref: FuncRef, line?: number) => {
    ctx.assertRefArity(ref, 1, 'fill dir', line);
  };

  /** Invoke a dir reporter; returns a turtle heading. Non-finite ⇒ NaN (a field
   * singularity the generator handles per §5.2), not an error. */
  ctx.applyFillDir = (ref: FuncRef, px: number, py: number, line?: number): number => {
    const out = ctx.callRef(ref, [ctx.allocList([px, py], line)], 0, line);
    if (typeof out !== 'number')
      throw new NeedlescriptError(
        `the fill dir reporter @${ref.name} must return a heading (a number), got ${describeVal(out)}`,
        line,
      );
    return out;
  };

  ctx.applyFillShapeArity = (ref: FuncRef, line?: number) => {
    ctx.assertRefArity(ref, 3, 'fill shape', line);
  };

  /** Invoke a shape reporter; returns the validated [spacing, len, phase]. */
  ctx.applyFillShape = (
    ref: FuncRef,
    px: number,
    py: number,
    row: number,
    v: number,
    line?: number,
  ): [number, number, number] => {
    const out = ctx.callRef(ref, [ctx.allocList([px, py], line), row, v], 0, line);
    if (!isList(out))
      throw new NeedlescriptError(
        `the fill shape reporter @${ref.name} must return a list of 3 numbers [spacing, len, phase], got ${describeVal(out)}`,
        line,
      );
    if (out.items.length !== 3)
      throw new NeedlescriptError(
        `the fill shape reporter @${ref.name} must return exactly 3 numbers [spacing, len, phase], got a list of ${out.items.length}`,
        line,
      );
    const slot = ['spacing', 'len', 'phase'];
    const r = out.items.map((val, k) => {
      if (typeof val !== 'number')
        throw new NeedlescriptError(
          `the fill shape reporter @${ref.name} returned ${describeVal(val)} for ${slot[k]} (slot ${k + 1} of 3) — it must be a number`,
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
