import { NeedlescriptError } from '../core/errors.ts';
import { FuncRef, ComposedRef, formatNum, num } from './list.ts';
import type { Val } from './list.ts';
import {
  FUNC_ARITY,
  ZERO_FUNCS,
  LIST_FUNCS,
  GEN_FUNCS,
  QUERY_FUNCS,
  STRING_FUNCS,
} from '../language/commands.ts';
import { ReturnSignal, LoopSignal } from './signals.ts';
import type { RunContext, Env } from './context.ts';
import type { ExprNode } from '../core/types.ts';

export function initProcCall(ctx: RunContext): void {
  ctx.effectiveRefSignature = (ref: FuncRef) => ({
    min: Math.max(0, ref.signature.min - ref.bound.length),
    max: Math.max(0, ref.signature.max - ref.bound.length),
  });

  ctx.assertRefArity = (ref: FuncRef, arity: number, what: string, line?: number): void => {
    const signature = ctx.effectiveRefSignature(ref);
    if (arity >= signature.min && arity <= signature.max) return;
    const got =
      signature.min === signature.max
        ? `${signature.min}-argument`
        : `${signature.min}..${signature.max}-argument`;
    throw new NeedlescriptError(
      `${what} expects a ${arity}-argument reporter; got a ${got} reference`,
      line,
    );
  };

  ctx.bindRef = (ref: FuncRef, values: Val[], line?: number): FuncRef => {
    const total = ref.bound.length + values.length;
    if (total > 16)
      throw new NeedlescriptError(`bind supports at most 16 bound values; got ${total}`, line);
    if (total > ref.signature.max) {
      const name = ref instanceof ComposedRef ? 'the composed reference' : ref.name;
      throw new NeedlescriptError(
        `bind: ${name} accepts at most ${ref.signature.max} arguments; cannot bind ${total}`,
        line,
      );
    }
    const bound = [...ref.bound, ...values];
    if (ref instanceof ComposedRef) return new ComposedRef(ref.steps, bound);
    return new FuncRef(ref.name, ref.signature, bound, ref.sourceLine, ref.captureNames);
  };

  ctx.callProc = (
    name: string,
    argNodes: ExprNode[],
    env: Env,
    repcount: number,
    depth: number,
    line?: number,
  ): Val | undefined => {
    const proc = ctx.procs[name];
    if (!proc)
      throw new NeedlescriptError(`Procedure "${name}" is used before it is defined`, line);
    if (depth >= ctx.m.effectiveLimits.maxCallDepth)
      throw new NeedlescriptError(`Too much recursion in "${name}"`, line);
    const newEnv: Record<string, Val> = Object.create(null);
    proc.params.forEach((p, i) => {
      newEnv[p] = ctx.evalExpr(argNodes[i], env, repcount, depth);
    });
    try {
      // Pass the call-site line as contextLine so that machine commands
      // inside the procedure stamp the caller's source line onto stitches
      // rather than their own internal line number within the proc body.
      ctx.execBlock(proc.body, newEnv, repcount, depth + 1, line);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof LoopSignal)
        throw new NeedlescriptError(`"${e.kind}" can only be used inside a loop`, e.line);
      throw e;
    }
    return undefined;
  };

  /**
   * Call a procedure with already-evaluated argument values (rather than AST
   * nodes). Used by `warp`/`warppath` to invoke a reporter once per point.
   */
  ctx.callProcVals = (
    name: string,
    argVals: Val[],
    depth: number,
    line?: number,
  ): Val | undefined => {
    const proc = ctx.procs[name];
    if (!proc)
      throw new NeedlescriptError(`Procedure "${name}" is used before it is defined`, line);
    if (depth >= ctx.m.effectiveLimits.maxCallDepth)
      throw new NeedlescriptError(`Too much recursion in "${name}"`, line);
    const newEnv: Record<string, Val> = Object.create(null);
    proc.params.forEach((p, i) => {
      newEnv[p] = argVals[i];
    });
    try {
      ctx.execBlock(proc.body, newEnv, 0, depth + 1, line);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof LoopSignal)
        throw new NeedlescriptError(`"${e.kind}" can only be used inside a loop`, e.line);
      throw e;
    }
    return undefined;
  };

  /**
   * Evaluate a scalar built-in function (`FUNC_ARITY` / `ZERO_FUNCS` tier)
   * on already-evaluated argument values. Used by both `evalExpr` and `callRef`.
   */
  ctx.scalarBuiltin = (name: string, argVals: Val[], line?: number): Val => {
    if (name === 'not') return ctx.truthy(argVals[0], 'not', line) === 0 ? 1 : 0;
    const args = argVals.map((a) => num(a, name, line));
    switch (name) {
      case 'random':
        return ctx.rng() * args[0];
      case 'sin':
        return Math.sin((args[0] * Math.PI) / 180);
      case 'cos':
        return Math.cos((args[0] * Math.PI) / 180);
      case 'sqrt':
        if (args[0] < 0) throw new NeedlescriptError('sqrt of a negative number', line);
        return Math.sqrt(args[0]);
      case 'abs':
        return Math.abs(args[0]);
      case 'round':
        return Math.round(args[0]);
      case 'floor':
        return Math.floor(args[0]);
      case 'ceil':
        return Math.ceil(args[0]);
      case 'min':
        return Math.min(args[0], args[1]);
      case 'max':
        return Math.max(args[0], args[1]);
      case 'pow': {
        const v = Math.pow(args[0], args[1]);
        if (!isFinite(v))
          throw new NeedlescriptError(
            `pow ${formatNum(args[0])} ${formatNum(args[1])} is not a finite number`,
            line,
          );
        return v;
      }
      case 'log':
        if (args[0] <= 0)
          throw new NeedlescriptError(
            `log requires a positive number, got ${formatNum(args[0])}`,
            line,
          );
        return Math.log(args[0]);
      case 'mod':
        return ((args[0] % args[1]) + args[1]) % args[1];
      case 'atan':
        return ((Math.atan2(args[0], args[1]) * 180) / Math.PI + 360) % 360;
      case 'noise':
        return ctx.noise(args[0]);
      case 'noise2':
        return ctx.noise(args[0], args[1]);
      case 'distance':
        return Math.hypot(args[0] - ctx.m.x, args[1] - ctx.m.y);
      case 'towards':
        return ((Math.atan2(args[0] - ctx.m.x, args[1] - ctx.m.y) * 180) / Math.PI + 360) % 360;
      // Zero-arg reporters
      case 'xcor':
        return ctx.m.x;
      case 'ycor':
        return ctx.m.y;
      case 'heading':
        return ctx.m.heading;
    }
    throw new NeedlescriptError(`Unknown function ${name}`, line);
  };

  /**
   * Invoke a function reference (user proc or built-in) with the given
   * argument values. Used by map, filter, reduce, and any future HOFs.
   */
  ctx.callRef = (ref: FuncRef | ComposedRef, argVals: Val[], depth: number, line?: number): Val => {
    const effective = ctx.effectiveRefSignature(ref);
    if (argVals.length < effective.min || argVals.length > effective.max) {
      const expected =
        effective.min === effective.max
          ? String(effective.min)
          : `${effective.min} to ${effective.max}`;
      throw new NeedlescriptError(
        `${ref instanceof ComposedRef ? 'composed reference' : `@${ref.name}`} expects ${expected} arguments, got ${argVals.length}`,
        line,
      );
    }
    // 0. Composed reference — pipe through each step left-to-right
    if (ref instanceof ComposedRef) {
      let result = ctx.callRef(ref.steps[0], [...ref.bound, ...argVals], depth, line);
      for (let i = 1; i < ref.steps.length; i++) {
        ctx.tick(line);
        result = ctx.callRef(ref.steps[i], [result], depth, line);
      }
      return result;
    }
    const allArgs = [...ref.bound, ...argVals];
    // 1. User-defined proc takes priority (can shadow builtins)
    if (ctx.procs[ref.name]) {
      const result = ctx.callProcVals(ref.name, allArgs, depth, line);
      if (result === undefined)
        throw new NeedlescriptError(
          `"${ref.name}" must return a value when used as a callback`,
          line,
        );
      return result;
    }
    // 2. Scalar builtins (FUNC_ARITY + ZERO_FUNCS)
    if (FUNC_ARITY[ref.name] !== undefined || ZERO_FUNCS.has(ref.name))
      return ctx.scalarBuiltin(ref.name, allArgs, line);
    // 3. List / Gen / Query / String builtins
    if (LIST_FUNCS[ref.name] !== undefined) return ctx.listFunc(ref.name, allArgs, line, depth);
    if (GEN_FUNCS[ref.name] !== undefined) return ctx.genFunc(ref.name, allArgs, line);
    if (QUERY_FUNCS[ref.name] !== undefined) return ctx.queryFunc(ref.name, allArgs, line);
    if (STRING_FUNCS[ref.name] !== undefined) return ctx.stringFunc(ref.name, allArgs, line);

    throw new NeedlescriptError(`Unknown function "${ref.name}" in @${ref.name} reference`, line);
  };
}
