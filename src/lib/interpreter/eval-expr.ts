import { NeedlescriptError } from '../errors.ts';
import { isList, describeVal, num, valDepth, deepEqual, FuncRef } from '../list.ts';
import type { Val } from '../list.ts';
import { LIMITS } from '../machine.ts';
import { GEN_FUNCS, QUERY_FUNCS } from '../commands.ts';
import { didYouMean } from '../suggestions.ts';
import { ReturnSignal, LoopSignal } from './signals.ts';
import type { RunContext, Env } from './context.ts';
import type { ExprNode } from '../types.ts';

export function initEvalExpr(ctx: RunContext): void {
  ctx.evalExpr = (node: ExprNode, env: Env, repcount: number, depth: number): Val => {
    ctx.tick((node as { line?: number }).line);
    switch (node.k) {
      case 'num':
        return node.v;
      case 'str':
        // String literals: check per-string limit only (no allocation budget
        // for literals — they come from source, not from computation).
        if (node.v.length > ctx.m.effectiveLimits.maxStringLength)
          throw new NeedlescriptError(
            `String literal is too long (${node.v.length} chars, limit ${ctx.m.effectiveLimits.maxStringLength})`,
            node.line,
          );
        return node.v;
      case 'var': {
        if (env && node.name in env) return env[node.name];
        if (node.name in ctx.globals) return ctx.globals[node.name];
        // Bare reads only parse when the pre-scan saw the name being assigned
        // somewhere — so a miss here means it was never assigned on the path
        // that actually ran (e.g.  if 0 [ x = 5 ] print x ).
        if (node.bare)
          throw new NeedlescriptError(
            `Variable "${node.name}" was never assigned on this path`,
            node.line,
          );
        throw new NeedlescriptError(
          `Unknown variable :${node.name}${didYouMean(node.name, [
            ...(env ? Object.keys(env) : []),
            ...Object.keys(ctx.globals),
          ])}`,
          node.line,
        );
      }
      case 'neg':
        return -num(ctx.evalExpr(node.val, env, repcount, depth), '-', node.line);
      case 'list': {
        const items: Val[] = [];
        for (const it of node.items) items.push(ctx.evalExpr(it, env, repcount, depth));
        const out = ctx.allocList(items, node.line);
        if (valDepth(out) > LIMITS.maxListDepth)
          throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`, node.line);
        return out;
      }
      case 'index': {
        const obj = ctx.evalExpr(node.obj, env, repcount, depth);
        if (typeof obj === 'string') {
          const i = ctx.toIndex(
            ctx.evalExpr(node.idx, env, repcount, depth),
            obj.length,
            'string indexing',
            node.line,
          );
          return obj[i];
        }
        if (!isList(obj))
          throw new NeedlescriptError(
            `only lists and strings can be indexed with [ ] — this is a ${typeof obj === 'number' ? 'number' : describeVal(obj)}`,
            node.line,
          );
        const i = ctx.toIndex(
          ctx.evalExpr(node.idx, env, repcount, depth),
          obj.items.length,
          'indexing',
          node.line,
        );
        return obj.items[i];
      }
      case 'callval': {
        const callTarget = ctx.evalExpr(node.obj, env, repcount, depth);
        if (callTarget instanceof FuncRef) {
          const args = node.args.map((arg) => ctx.evalExpr(arg, env, repcount, depth));
          return ctx.callRef(callTarget, args, depth, node.line);
        }
        if (typeof callTarget === 'string')
          throw new NeedlescriptError("a string value can't be called like a procedure", node.line);
        if (isList(callTarget))
          throw new NeedlescriptError(
            "a list value can't be called like a procedure — only references are callable",
            node.line,
          );
        throw new NeedlescriptError(
          `${describeVal(callTarget)} can't be called like a procedure — only references are callable`,
          node.line,
        );
      }
      case 'listfunc': {
        const args = node.args.map((a) => ctx.evalExpr(a, env, repcount, depth));
        if (GEN_FUNCS[node.name] !== undefined) return ctx.genFunc(node.name, args, node.line);
        if (QUERY_FUNCS[node.name] !== undefined) return ctx.queryFunc(node.name, args, node.line);
        return ctx.listFunc(node.name, args, node.line, depth);
      }
      case 'bin': {
        // and / or short-circuit so guards like  :i > 0 and 10 / :i > 2  are safe
        if (node.op === 'and')
          return ctx.truthy(ctx.evalExpr(node.left, env, repcount, depth), 'and', undefined) !==
            0 && ctx.truthy(ctx.evalExpr(node.right, env, repcount, depth), 'and', undefined) !== 0
            ? 1
            : 0;
        if (node.op === 'or')
          return ctx.truthy(ctx.evalExpr(node.left, env, repcount, depth), 'or', undefined) !== 0 ||
            ctx.truthy(ctx.evalExpr(node.right, env, repcount, depth), 'or', undefined) !== 0
            ? 1
            : 0;
        const av = ctx.evalExpr(node.left, env, repcount, depth);
        const bv = ctx.evalExpr(node.right, env, repcount, depth);
        const lineHint =
          (node.left as { line?: number }).line ?? (node.right as { line?: number }).line;
        // Equality: deep equal handles all types (strings, lists, numbers).
        // Cross-type always returns 0/1 without error — equality is a question.
        if (node.op === '=' || node.op === '!=') {
          if (
            isList(av) ||
            isList(bv) ||
            typeof av === 'string' ||
            typeof bv === 'string' ||
            av instanceof FuncRef ||
            bv instanceof FuncRef
          ) {
            const eq = deepEqual(av, bv);
            return node.op === '=' ? (eq ? 1 : 0) : eq ? 0 : 1;
          }
        }
        // String operator errors — loud with hints.
        if (typeof av === 'string' || typeof bv === 'string') {
          if (node.op === '+')
            throw new NeedlescriptError(`"+" cannot join strings — use concat(a, b)`, lineHint);
          if (node.op === '<' || node.op === '>' || node.op === '<=' || node.op === '>=')
            throw new NeedlescriptError(
              `strings have no ordering — "${node.op}" is not defined for strings`,
              lineHint,
            );
          throw new NeedlescriptError(
            `"${node.op}" on a string — no implicit conversion; use num(s) or str(n)`,
            lineHint,
          );
        }
        // Arithmetic on lists stays a loud error (RFC-3 §2) — with hints
        // pointing at the named vector functions. No broadcasting: in
        // Python  [1,2] + [3,4]  is concatenation, and silently giving it
        // NumPy semantics is the kind of bug that sews before it's noticed.
        if ((isList(av) || isList(bv)) && '+-*/'.includes(node.op)) {
          const hint =
            node.op === '+'
              ? ' — use vadd(a, b) for element-wise, concat(a, b) to join'
              : node.op === '-'
                ? ' — use vsub(a, b) for element-wise'
                : ' — use vscale(a, s) to scale a point';
          throw new NeedlescriptError(`"${node.op}" on lists${hint}`, lineHint);
        }
        const a = num(av, node.op, undefined, 'on the left');
        const b = num(bv, node.op, undefined, 'on the right');
        switch (node.op) {
          case '+':
            return a + b;
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            if (b === 0) throw new NeedlescriptError('Division by zero');
            return a / b;
          case '<':
            return a < b ? 1 : 0;
          case '>':
            return a > b ? 1 : 0;
          case '<=':
            return a <= b ? 1 : 0;
          case '>=':
            return a >= b ? 1 : 0;
          case '=':
            return Math.abs(a - b) < 1e-9 ? 1 : 0;
          case '!=':
            return Math.abs(a - b) < 1e-9 ? 0 : 1;
        }
        throw new NeedlescriptError('Unknown operator');
      }
      case 'func': {
        // repcount is special: it reads from the current eval context
        if (node.name === 'repcount') return repcount;
        // Evaluate args, then delegate to the shared scalarBuiltin dispatcher
        const vals = node.args.map((a) => ctx.evalExpr(a, env, repcount, depth));
        return ctx.scalarBuiltin(node.name, vals, node.line);
      }
      case 'callexpr': {
        const v = ctx.callProc(node.name, node.args, env, repcount, depth, node.line);
        if (v === undefined)
          throw new NeedlescriptError(
            `"${node.name}" was used as a value but it never reached "output"`,
            node.line,
          );
        return v;
      }
      case 'procref':
        return new FuncRef(
          node.name,
          { min: node.minArity, max: node.maxArity },
          [],
          node.name.startsWith('$anon:') ? node.line : undefined,
          node.captureNames,
        );

      case 'trace': {
        // ── Trace sandbox (RFC-trace §4) ──────────────────────────────────
        // Snapshot the machine, enter recording mode with a clean coordinate
        // frame, execute the block, restore everything except warnings/RNG/
        // variables, and return the captured path(s).
        const snap = ctx.m.snapshotForTrace();
        ctx.m.setupTraceSandbox();
        ctx.insideTrace++;
        let runs: [number, number][][];
        try {
          ctx.execBlock(node.body, env, repcount, depth, node.line);
        } catch (e) {
          if (e instanceof ReturnSignal)
            throw new NeedlescriptError(
              'cannot leave the procedure from inside trace — the trace must produce its value',
              node.line,
            );
          if (e instanceof LoopSignal)
            throw new NeedlescriptError(
              `"${e.kind}" cannot cross a trace boundary`,
              e.line ?? node.line,
            );
          throw e; // real errors propagate (§4.1)
        } finally {
          runs = ctx.m.endTrace();
          ctx.m.restoreFromTrace(snap);
          ctx.insideTrace--;
        }

        if (node.multi) {
          // tracerings: return a list of paths (§4.3), possibly empty
          if (runs.length === 0)
            ctx.m.warnings.push('trace captured nothing — no pen-down movement in the block');
          const paths: Val[] = runs.map((run) =>
            ctx.allocList(
              run.map(([x, y]) => ctx.allocList([x, y], node.line)),
              node.line,
            ),
          );
          return ctx.allocList(paths, node.line);
        }
        // trace: exactly one run expected (§4.3)
        if (runs.length === 0) {
          ctx.m.warnings.push('trace captured nothing — no pen-down movement in the block');
          return ctx.allocList([], node.line);
        }
        if (runs.length > 1)
          throw new NeedlescriptError(
            `trace captured ${runs.length} separate runs — use tracerings to capture all of them`,
            node.line,
          );
        const pts: Val[] = runs[0].map(([x, y]) => ctx.allocList([x, y], node.line));
        return ctx.allocList(pts, node.line);
      }
    }
  };
}
