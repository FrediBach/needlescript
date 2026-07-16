import { NeedlescriptError } from '../errors.ts';
import { isFuncRef, isList, describeVal, num, formatNum, formatVal } from '../list.ts';
import type { Val } from '../list.ts';
import type { ASTNode } from '../types.ts';
import {
  mTranslate,
  mRotate,
  mRotateAbout,
  mScale,
  mScaleXY,
  mMirror,
  mSkew,
  mRaw,
} from '../affine.ts';
import type { Mat } from '../affine.ts';
import { humanizeMap, snapMapFromSpec } from '../effects.ts';
import { makeDeclumpState } from '../declump.ts';
import * as gm from '../genmath.ts';
import { ReturnSignal, LoopSignal } from './signals.ts';
import { initExecCmdHandler } from './exec-cmd.ts';
import type { RunContext, Env } from './context.ts';

export function initExecStmt(ctx: RunContext): void {
  const execCmd = initExecCmdHandler(ctx);

  const validateFillPaths = (
    value: Val | undefined,
    label: string,
    line: number,
    chargeCopy = false,
  ) => {
    if (value === undefined || !isList(value))
      throw new NeedlescriptError(
        `${label} must return a list of paths — got ${value === undefined ? 'nothing' : describeVal(value as Val)}`,
        line,
      );
    const paths: [number, number][][] = [];
    if (chargeCopy) ctx.charge(value.items.length, line);
    for (let pi = 0; pi < value.items.length; pi++) {
      const path = value.items[pi];
      if (!isList(path) || path.items.length < 2)
        throw new NeedlescriptError(
          `${label}: path ${pi + 1} must be a list of at least 2 points`,
          line,
        );
      const points: [number, number][] = [];
      if (chargeCopy) ctx.charge(path.items.length, line);
      for (let vi = 0; vi < path.items.length; vi++) {
        const point = path.items[vi];
        if (
          !isList(point) ||
          point.items.length !== 2 ||
          typeof point.items[0] !== 'number' ||
          typeof point.items[1] !== 'number' ||
          !Number.isFinite(point.items[0]) ||
          !Number.isFinite(point.items[1])
        )
          throw new NeedlescriptError(
            `${label}: path ${pi + 1}, point ${vi + 1} must be a list of two finite numbers`,
            line,
          );
        points.push([point.items[0], point.items[1]]);
        if (chargeCopy) ctx.charge(2, line);
      }
      paths.push(points);
    }
    return paths;
  };

  ctx.execBlock = (
    stmts: ASTNode[],
    env: Env,
    repcount: number,
    depth: number,
    contextLine?: number,
  ) => {
    for (const st of stmts) ctx.execStmt(st, env, repcount, depth, contextLine);
  };

  /**
   * Run one loop iteration, absorbing loop-control signals (RFC-4).
   * Returns false if the loop should stop (`break`), true otherwise.
   */
  ctx.runLoopBody = (
    body: ASTNode[],
    env: Env,
    repcount: number,
    depth: number,
    contextLine?: number,
  ): boolean => {
    try {
      ctx.execBlock(body, env, repcount, depth, contextLine);
    } catch (e) {
      if (e instanceof LoopSignal) return e.kind !== 'break';
      throw e;
    }
    return true;
  };

  ctx.execStmt = (st: ASTNode, env: Env, repcount: number, depth: number, contextLine?: number) => {
    ctx.tick(st.line);
    switch (st.k) {
      case 'to':
        ctx.procs[st.name] = st;
        return;
      case 'make': {
        const v = ctx.evalExpr(st.value, env, repcount, depth);
        if (env && st.name in env) env[st.name] = v;
        else ctx.globals[st.name] = v;
        return;
      }
      case 'local': {
        if (!env)
          throw new NeedlescriptError(
            'local can only be used inside a procedure — use make at the top level',
            st.line,
          );
        env[st.name] = ctx.evalExpr(st.value, env, repcount, depth);
        return;
      }
      case 'letlist': {
        // let [x, y] = p — fixed-arity destructuring, flat only (RFC-2 §3.3)
        const v = ctx.evalExpr(st.value, env, repcount, depth);
        if (!isList(v))
          throw new NeedlescriptError(
            `let [${st.names.join(', ')}] expected a list, got a number`,
            st.line,
          );
        if (v.items.length !== st.names.length)
          throw new NeedlescriptError(
            `let [${st.names.join(', ')}] expected a list of ${st.names.length}, got ${v.items.length}`,
            st.line,
          );
        const scope = st.isLocal && env ? env : ctx.globals;
        st.names.forEach((n, i) => {
          scope[n] = v.items[i];
        });
        return;
      }
      case 'setindex': {
        // xs[i] = v   |   grid[i][j] += v — lvalue chains (RFC-2 §3.3)
        let target: Val;
        if (env && st.name in env) target = env[st.name];
        else if (st.name in ctx.globals) target = ctx.globals[st.name];
        else
          throw new NeedlescriptError(
            `Variable "${st.name}" was never assigned on this path`,
            st.line,
          );
        // Strings are immutable — index assignment is always an error.
        if (typeof target === 'string')
          throw new NeedlescriptError(
            `strings are immutable — build a new one with concat(a, b) or slice(s, a, b)`,
            st.line,
          );
        for (let k = 0; ; k++) {
          if (!isList(target))
            throw new NeedlescriptError(
              `only lists can be indexed with [ ] — "${st.name}" leads to a number here`,
              st.line,
            );
          const i = ctx.toIndex(
            ctx.evalExpr(st.indices[k], env, repcount, depth),
            target.items.length,
            'indexing',
            st.line,
          );
          ctx.tick(st.line);
          if (k === st.indices.length - 1) {
            let v = ctx.evalExpr(st.value, env, repcount, depth);
            if (st.op !== '=') {
              const op = st.op[0];
              const old = num(target.items[i], op, st.line, 'on the left');
              const rhs = num(v, op, st.line, 'on the right');
              if (op === '+') v = old + rhs;
              else if (op === '-') v = old - rhs;
              else if (op === '*') v = old * rhs;
              else {
                if (rhs === 0) throw new NeedlescriptError('Division by zero', st.line);
                v = old / rhs;
              }
            }
            ctx.checkDepth(v, st.line);
            target.items[i] = v;
            return;
          }
          target = target.items[i];
        }
      }
      case 'repeat': {
        const n = Math.floor(num(ctx.evalExpr(st.count, env, repcount, depth), 'repeat', st.line));
        if (n > ctx.m.effectiveLimits.maxLoopIters)
          throw new NeedlescriptError(
            `repeat count too large (${n.toLocaleString('en-US')}, limit ${ctx.m.effectiveLimits.maxLoopIters.toLocaleString('en-US')})`,
            st.line,
          );
        ctx.structuralDepth++;
        for (let i = 1; i <= n; i++)
          if (!ctx.runLoopBody(st.body, env, i, depth, contextLine)) break;
        ctx.structuralDepth--;
        return;
      }
      case 'while': {
        ctx.structuralDepth++;
        while (ctx.truthy(ctx.evalExpr(st.cond, env, repcount, depth), 'while', st.line) !== 0) {
          ctx.tick(st.line); // ops budget catches endless loops
          if (!ctx.runLoopBody(st.body, env, repcount, depth, contextLine)) break;
        }
        ctx.structuralDepth--;
        return;
      }
      case 'for': {
        const from = num(ctx.evalExpr(st.from, env, repcount, depth), 'for', st.line);
        const to = num(ctx.evalExpr(st.to, env, repcount, depth), 'for', st.line);
        const step = num(ctx.evalExpr(st.step, env, repcount, depth), 'for', st.line);
        if (step === 0) throw new NeedlescriptError('for step can\u2019t be 0', st.line);
        if ((to - from) / step > ctx.m.effectiveLimits.maxLoopIters)
          throw new NeedlescriptError(
            `for runs too many times (over ${ctx.m.effectiveLimits.maxLoopIters.toLocaleString('en-US')})`,
            st.line,
          );
        const scope = env ?? ctx.globals;
        const had = st.varName in scope;
        const prev = scope[st.varName];
        ctx.structuralDepth++;
        for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) {
          ctx.tick(st.line);
          scope[st.varName] = v;
          if (!ctx.runLoopBody(st.body, env, repcount, depth, contextLine)) break;
        }
        ctx.structuralDepth--;
        if (had) scope[st.varName] = prev;
        else delete scope[st.varName];
        return;
      }
      case 'forin': {
        // for x in xs — iterates list elements or string characters.
        const v = ctx.evalExpr(st.list, env, repcount, depth);
        if (typeof v === 'string') {
          const scope = env ?? ctx.globals;
          const had = st.varName in scope;
          const prev = scope[st.varName];
          ctx.structuralDepth++;
          for (const ch of v) {
            ctx.tick(st.line);
            scope[st.varName] = ch;
            if (!ctx.runLoopBody(st.body, env, repcount, depth, contextLine)) break;
          }
          ctx.structuralDepth--;
          if (had) scope[st.varName] = prev;
          else delete scope[st.varName];
          return;
        }
        if (!isList(v))
          throw new NeedlescriptError(
            `for ${st.varName} in … expected a list or string, got ${describeVal(v)}`,
            st.line,
          );
        const n = v.items.length;
        const scope = env ?? ctx.globals;
        const had = st.varName in scope;
        const prev = scope[st.varName];
        ctx.structuralDepth++;
        for (let i = 0; i < n; i++) {
          ctx.tick(st.line);
          scope[st.varName] = v.items[i];
          if (!ctx.runLoopBody(st.body, env, repcount, depth, contextLine)) break;
        }
        ctx.structuralDepth--;
        if (had) scope[st.varName] = prev;
        else delete scope[st.varName];
        return;
      }
      case 'if': {
        ctx.structuralDepth++;
        if (ctx.truthy(ctx.evalExpr(st.cond, env, repcount, depth), 'if', st.line) !== 0)
          ctx.execBlock(st.body, env, repcount, depth, contextLine);
        else if (st.elseBody) ctx.execBlock(st.elseBody, env, repcount, depth, contextLine);
        ctx.structuralDepth--;
        return;
      }
      case 'transform': {
        // Build the delta matrix from the args, compose it onto the CTM for
        // the duration of the block, then restore. flushSatin on both edges
        // guarantees a satin column is sewn entirely under one matrix.
        const a = st.args.map((x) => num(ctx.evalExpr(x, env, repcount, depth), st.name, st.line));
        let delta: Mat;
        switch (st.name) {
          case 'translate':
            delta = mTranslate(a[0], a[1]);
            break;
          case 'rotate':
            delta = mRotate(a[0]);
            break;
          case 'rotateabout':
            delta = mRotateAbout(a[0], a[1], a[2]);
            break;
          case 'scale':
            delta = mScale(a[0]);
            break;
          case 'scalexy':
            delta = mScaleXY(a[0], a[1]);
            break;
          case 'mirror':
            delta = mMirror(a[0]);
            break;
          case 'skew':
            delta = mSkew(a[0], a[1]);
            break;
          case 'transform':
            delta = mRaw(a[0], a[1], a[2], a[3], a[4], a[5]);
            break;
          default:
            throw new NeedlescriptError(`Unhandled transform ${st.name}`, st.line);
        }
        ctx.m.currentLine = contextLine ?? st.line;
        ctx.m.flushSatin();
        ctx.m.pushTransform(delta);
        ctx.structuralDepth++;
        try {
          ctx.execBlock(st.body, env, repcount, depth, contextLine);
        } finally {
          ctx.structuralDepth--;
          ctx.m.flushSatin();
          ctx.m.popOut();
        }
        return;
      }
      case 'effect': {
        // Effects share the transform discipline: flush satin on both edges.
        ctx.m.currentLine = contextLine ?? st.line;
        ctx.m.flushSatin();
        if (st.name === 'warp') {
          const refVal = ctx.evalExpr(st.args[0], env, repcount, depth);
          if (!isFuncRef(refVal))
            throw new NeedlescriptError(
              'warp needs a procedure reference, e.g.  warp @push_out [ … ]',
              st.line,
            );
          const ref = refVal;
          ctx.m.pushWarp((x, y) => ctx.applyReporter(ref, x, y, st.line));
          ctx.structuralDepth++;
          try {
            ctx.execBlock(st.body, env, repcount, depth, contextLine);
          } finally {
            ctx.structuralDepth--;
            ctx.m.flushSatin();
            ctx.m.popOut();
          }
          return;
        }
        const a = st.args.map((x) => num(ctx.evalExpr(x, env, repcount, depth), st.name, st.line));

        if (st.name === 'declump') {
          // declump: stateful along-axis crowd-relief fold.
          ctx.traceNote(
            'declump',
            'note: declump inside trace is inert — use declumppath(...) on the result instead',
          );
          const limit = Math.max(0, a[0]);
          const maxshift = a.length >= 2 ? ctx.clampMaxshift(a[1]) : 1.5;
          const state = makeDeclumpState(limit, maxshift);
          ctx.m.pushDeclump(state);
          ctx.structuralDepth++;
          try {
            ctx.execBlock(st.body, env, repcount, depth, contextLine);
          } finally {
            ctx.structuralDepth--;
            ctx.m.flushSatin();
            ctx.m.popDeclump();
            if (state.saturationCount > 0)
              ctx.m.warnings.push(
                `declump: ${state.saturationCount} penetration${state.saturationCount === 1 ? '' : 's'} stayed in saturated areas (no along-axis relief within maxshift)`,
              );
          }
          return;
        }

        let fn: (x: number, y: number) => [number, number];
        if (st.name === 'humanize') {
          ctx.traceNote(
            'humanize',
            'note: humanize inside trace has no effect on the captured path — use humanizepath(...) on the result',
          );
          const amount = ctx.clampHumanize(a[0]);
          const childSeed = Math.floor(ctx.rng() * 4294967296);
          fn = humanizeMap(amount, childSeed, ctx.snoise2);
        } else {
          // snaptogrid — pure, drawless, fixed hoop-space lattice
          ctx.traceNote(
            'snaptogrid',
            'note: snaptogrid inside trace has no effect on the captured path — use snappath(...) on the result',
          );
          fn = snapMapFromSpec(a, (msg) => new NeedlescriptError(`snaptogrid ${msg}`, st.line));
        }
        ctx.m.pushPen(fn);
        ctx.structuralDepth++;
        try {
          ctx.execBlock(st.body, env, repcount, depth, contextLine);
        } finally {
          ctx.structuralDepth--;
          ctx.m.flushSatin();
          ctx.m.popPen();
        }
        return;
      }
      case 'output': {
        if (depth === 0)
          throw new NeedlescriptError(
            `"${st.value ? 'output' : 'exit'}" can only be used inside a procedure`,
            st.line,
          );
        throw new ReturnSignal(st.value ? ctx.evalExpr(st.value, env, repcount, depth) : undefined);
      }
      // Loop control (RFC-4): unwinds to the innermost enclosing loop.
      case 'break':
        throw new LoopSignal('break', st.line);
      case 'continue':
        throw new LoopSignal('continue', st.line);
      case 'call': {
        ctx.callProc(st.name, st.args, env, repcount, depth, contextLine ?? st.line);
        return;
      }
      case 'fillarm': {
        ctx.m.currentLine = contextLine ?? st.line;
        // Arm programmable fill for the next beginfill…endfill (§2).
        if (ctx.m.recording)
          throw new NeedlescriptError(
            'fill armed while a beginfill is open — close it with endfill before arming a new fill',
            st.line,
          );
        if (ctx.insideTrace > 0)
          throw new NeedlescriptError('fill paths is not allowed inside trace', st.line);
        if (ctx.m.fillArmed && ctx.m.fillArmLine !== undefined)
          ctx.m.warnings.push(
            `note: a previous fill arming was replaced before use (line ${ctx.m.fillArmLine})`,
          );
        ctx.m.fillPathsReporter = null;
        ctx.m.fillPathsStatic = null;
        ctx.m.fillPathsName = null;
        if (st.pathsRef) {
          const proc = ctx.procs[st.pathsRef];
          if (!proc || proc.params.length !== 1)
            throw new NeedlescriptError(
              `custom fill generator "${st.pathsRef}" takes 1 input (the region rings) — it is defined with ${proc?.params.length ?? 0}`,
              st.line,
            );
          const ref = st.pathsRef;
          ctx.m.fillPathsName = ref;
          ctx.m.fillPathsReporter = (rings) => {
            const machineSnap = ctx.m.snapshotForTrace();
            const rng = ctx.rng;
            const noise = ctx.noise;
            const snoise2 = ctx.snoise2;
            const snoise3 = ctx.snoise3;
            ctx.m.noEmit = true;
            ctx.insideTrace++;
            ctx.insideFillGenerator++;
            try {
              const region = ctx.allocList(
                rings.map((ring) =>
                  ctx.allocList(
                    ring.map((p) => ctx.allocList([p[0], p[1]], st.line)),
                    st.line,
                  ),
                ),
                st.line,
              );
              return validateFillPaths(
                ctx.callProcVals(ref, [region], 0, st.line),
                `custom fill generator "${ref}"`,
                st.line,
              );
            } finally {
              ctx.m.restoreFromTrace(machineSnap);
              ctx.insideFillGenerator--;
              ctx.insideTrace--;
              if (ctx.rng !== rng) ctx.rng = rng;
              if (ctx.noise !== noise) ctx.noise = noise;
              if (ctx.snoise2 !== snoise2) ctx.snoise2 = snoise2;
              if (ctx.snoise3 !== snoise3) ctx.snoise3 = snoise3;
            }
          };
        } else if (st.pathsExpr) {
          ctx.m.fillPathsStatic = validateFillPaths(
            ctx.evalExpr(st.pathsExpr, env, repcount, depth),
            'fill paths list',
            st.line,
            true,
          ).map((path) => path.map((p) => [p[0], p[1]]));
        }
        if (st.dirRef) {
          ctx.applyFillDirArity(st.dirRef, st.line);
          const ref = st.dirRef;
          ctx.m.fillDirReporter = (px, py) => ctx.applyFillDir(ref, px, py, st.line);
        } else {
          ctx.m.fillDirReporter = null;
        }
        if (st.shapeRef) {
          ctx.applyFillShapeArity(st.shapeRef, st.line);
          const ref = st.shapeRef;
          ctx.m.fillShapeReporter = (px, py, row, v) =>
            ctx.applyFillShape(ref, px, py, row, v, st.line);
        } else {
          ctx.m.fillShapeReporter = null;
        }
        ctx.m.fillArmed = true;
        ctx.m.fillArmLine = st.line;
        if (ctx.m.fillDirReporter && ctx.m.fillAngle !== 0)
          ctx.m.warnings.push(
            `fillangle is ignored while fill dir @${st.dirRef} is engaged — the direction field supersedes it`,
          );
        if (ctx.m.fillShapeReporter && (ctx.m.fillSpacing !== 0.4 || ctx.m.fillLen !== null))
          ctx.m.warnings.push(
            `fillspacing/filllen are ignored while fill shape @${st.shapeRef} is engaged — the shape reporter supersedes them`,
          );
        return;
      }
      case 'listcmd': {
        ctx.m.currentLine = contextLine ?? st.line;
        const a = st.args.map((x) => ctx.evalExpr(x, env, repcount, depth));
        switch (st.name) {
          case 'append':
          case 'prepend': {
            if (typeof a[0] === 'string')
              throw new NeedlescriptError(
                `strings are immutable — "${st.name}" needs a list; use concat(a, b) to build longer strings`,
                st.line,
              );
            const xs = ctx.list(a[0], st.name, st.line);
            if (xs.items.length + 1 > ctx.m.effectiveLimits.maxListLen)
              throw new NeedlescriptError(
                `List too long (limit ${ctx.m.effectiveLimits.maxListLen.toLocaleString('en-US')} elements)`,
                st.line,
              );
            ctx.checkDepth(a[1], st.line);
            ctx.charge(1, st.line);
            if (st.name === 'append') xs.items.push(a[1]);
            else xs.items.unshift(a[1]);
            return;
          }
          case 'insertat': {
            if (typeof a[0] === 'string')
              throw new NeedlescriptError(
                `strings are immutable — "insertat" needs a list; use concat(a, b) to build longer strings`,
                st.line,
              );
            const xs = ctx.list(a[0], 'insertat', st.line);
            if (xs.items.length + 1 > ctx.m.effectiveLimits.maxListLen)
              throw new NeedlescriptError(
                `List too long (limit ${ctx.m.effectiveLimits.maxListLen.toLocaleString('en-US')} elements)`,
                st.line,
              );
            const n = num(a[1], 'insertat', st.line);
            const r = Math.round(n);
            if (Math.abs(n - r) > 1e-9)
              throw new NeedlescriptError(
                `insertat: index ${formatNum(n)} isn't a whole number — use floor() deliberately`,
                st.line,
              );
            const i = r < 0 ? r + xs.items.length : r;
            if (i < 0 || i > xs.items.length)
              throw new NeedlescriptError(
                `insertat: index ${r} is out of range (0…${xs.items.length} allowed)`,
                st.line,
              );
            ctx.checkDepth(a[2], st.line);
            ctx.charge(1, st.line);
            xs.items.splice(i, 0, a[2]);
            return;
          }
          case 'removeat': {
            ctx.listFunc('removeat', a, st.line); // return value discarded
            return;
          }
          case 'setpos': {
            const p = ctx.list(a[0], 'setpos', st.line);
            if (p.items.length < 2)
              throw new NeedlescriptError(
                `setpos expected [x, y], got a list of ${p.items.length}`,
                st.line,
              );
            const x = num(p.items[0], 'setpos', st.line);
            const y = num(p.items[1], 'setpos', st.line);
            ctx.m.setXY(x, y);
            return;
          }
          case 'sewpath': {
            const pts = gm.toPath(a[0], 'sewpath', st.line);
            ctx.tickN(pts.length, st.line);
            for (const [x, y] of pts) ctx.m.setXY(x, y);
            return;
          }
        }
        throw new NeedlescriptError(`Unhandled command ${st.name}`, st.line);
      }
      case 'cmd': {
        ctx.m.currentLine = contextLine ?? st.line;

        // assert: evaluate condition first; message only on failure (lazy).
        if (st.name === 'assert') {
          const condVal = ctx.evalExpr(st.args[0], env, repcount, depth);
          if (ctx.truthy(condVal, 'assert', st.line) === 0) {
            let msg = 'assertion failed';
            if (st.args.length === 2) {
              const msgVal = ctx.evalExpr(st.args[1], env, repcount, depth);
              const msgStr = typeof msgVal === 'string' ? msgVal : formatVal(msgVal);
              msg = `assertion failed: ${msgStr}`;
            }
            throw new NeedlescriptError(msg, st.line);
          }
          return;
        }

        const vals = st.args.map((x) => ctx.evalExpr(x, env, repcount, depth));
        execCmd(st, vals, depth);
        return;
      }
    }
  };
}
