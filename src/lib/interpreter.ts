// ---------- Interpreter ----------

import type { ASTNode, ExprNode, RunResult, RunOptions } from './types.ts';
import { NeedlescriptError } from './errors.ts';
import { makeRNG, makeNoise } from './prng.ts';
import { FABRICS } from './commands.ts';
import { Machine, LIMITS } from './machine.ts';
import { tokenize } from './tokenizer.ts';
import { parse } from './parser.ts';
import { applyAutoTrim, applyLocks, densityMap } from './postprocess.ts';
import { didYouMean } from './suggestions.ts';

function formatNum(v: number): string {
  return Math.abs(v - Math.round(v)) < 1e-9
    ? String(Math.round(v))
    : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Thrown by `output` / `exit` to unwind to the enclosing procedure call. */
class ReturnSignal {
  readonly value: number | undefined;
  constructor(value: number | undefined) {
    this.value = value;
  }
}

export function run(source: string, opts: RunOptions = {}): RunResult {
  const tokens = tokenize(source);
  const program = parse(tokens);
  const m = new Machine();
  const globals: Record<string, number> = Object.create(null);
  const procs: Record<string, ASTNode & { k: 'to' }> = Object.create(null);
  const seed0 = opts.seed !== undefined ? opts.seed : 42;
  let rng = makeRNG(seed0);
  let noise = makeNoise(seed0);
  let ops = 0;
  const printed: string[] = [];

  function tick(line?: number) {
    if (++ops > LIMITS.maxOps)
      throw new NeedlescriptError(
        'Program ran too long (possible infinite loop) — stopped',
        line,
      );
  }

  function evalExpr(
    node: ExprNode,
    env: Record<string, number> | null,
    repcount: number,
    depth: number,
  ): number {
    tick((node as { line?: number }).line);
    switch (node.k) {
      case 'num': return node.v;
      case 'var': {
        if (env && node.name in env) return env[node.name];
        if (node.name in globals) return globals[node.name];
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
            ...Object.keys(globals),
          ])}`,
          node.line,
        );
      }
      case 'neg': return -evalExpr(node.val, env, repcount, depth);
      case 'bin': {
        // and / or short-circuit so guards like  :i > 0 and 10 / :i > 2  are safe
        if (node.op === 'and')
          return evalExpr(node.left, env, repcount, depth) !== 0 &&
            evalExpr(node.right, env, repcount, depth) !== 0 ? 1 : 0;
        if (node.op === 'or')
          return evalExpr(node.left, env, repcount, depth) !== 0 ||
            evalExpr(node.right, env, repcount, depth) !== 0 ? 1 : 0;
        const a = evalExpr(node.left, env, repcount, depth);
        const b = evalExpr(node.right, env, repcount, depth);
        switch (node.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': if (b === 0) throw new NeedlescriptError('Division by zero'); return a / b;
          case '<': return a < b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          case '>=': return a >= b ? 1 : 0;
          case '=': return Math.abs(a - b) < 1e-9 ? 1 : 0;
          case '!=': return Math.abs(a - b) < 1e-9 ? 0 : 1;
        }
        throw new NeedlescriptError('Unknown operator');
      }
      case 'func': {
        const args = node.args.map(a => evalExpr(a, env, repcount, depth));
        switch (node.name) {
          case 'random': return rng() * args[0];
          case 'sin': return Math.sin(args[0] * Math.PI / 180);
          case 'cos': return Math.cos(args[0] * Math.PI / 180);
          case 'sqrt':
            if (args[0] < 0) throw new NeedlescriptError('sqrt of a negative number', node.line);
            return Math.sqrt(args[0]);
          case 'abs': return Math.abs(args[0]);
          case 'round': return Math.round(args[0]);
          case 'floor': return Math.floor(args[0]);
          case 'ceil': return Math.ceil(args[0]);
          case 'min': return Math.min(args[0], args[1]);
          case 'max': return Math.max(args[0], args[1]);
          case 'pow': {
            const v = Math.pow(args[0], args[1]);
            if (!isFinite(v))
              throw new NeedlescriptError(
                `pow ${formatNum(args[0])} ${formatNum(args[1])} is not a finite number`,
                node.line,
              );
            return v;
          }
          case 'mod': return ((args[0] % args[1]) + args[1]) % args[1];
          case 'not': return args[0] === 0 ? 1 : 0;
          // heading-convention angle of the vector (x, y): 0 = up/north, clockwise
          case 'atan': return (Math.atan2(args[0], args[1]) * 180 / Math.PI + 360) % 360;
          case 'noise': return noise(args[0]);
          case 'noise2': return noise(args[0], args[1]);
          case 'distance': return Math.hypot(args[0] - m.x, args[1] - m.y);
          case 'towards':
            return (Math.atan2(args[0] - m.x, args[1] - m.y) * 180 / Math.PI + 360) % 360;
          case 'repcount': return repcount;
          case 'xcor': return m.x;
          case 'ycor': return m.y;
          case 'heading': return m.heading;
        }
        throw new NeedlescriptError(`Unknown function ${node.name}`, node.line);
      }
      case 'callexpr': {
        const v = callProc(node.name, node.args, env, repcount, depth, node.line);
        if (v === undefined)
          throw new NeedlescriptError(
            `"${node.name}" was used as a value but it never reached "output"`,
            node.line,
          );
        return v;
      }
    }
  }

  function callProc(
    name: string,
    argNodes: ExprNode[],
    env: Record<string, number> | null,
    repcount: number,
    depth: number,
    line?: number,
  ): number | undefined {
    const proc = procs[name];
    if (!proc)
      throw new NeedlescriptError(`Procedure "${name}" is used before it is defined`, line);
    if (depth >= LIMITS.maxCallDepth)
      throw new NeedlescriptError(`Too much recursion in "${name}"`, line);
    const newEnv: Record<string, number> = Object.create(null);
    proc.params.forEach((p, i) => { newEnv[p] = evalExpr(argNodes[i], env, repcount, depth); });
    try {
      execBlock(proc.body, newEnv, repcount, depth + 1);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return undefined;
  }

  function execBlock(
    stmts: ASTNode[],
    env: Record<string, number> | null,
    repcount: number,
    depth: number,
  ) {
    for (const st of stmts) execStmt(st, env, repcount, depth);
  }

  function execStmt(
    st: ASTNode,
    env: Record<string, number> | null,
    repcount: number,
    depth: number,
  ) {
    tick(st.line);
    switch (st.k) {
      case 'to': procs[st.name] = st; return;
      case 'make': {
        const v = evalExpr(st.value, env, repcount, depth);
        // Prefer an existing local (procedure parameter or "local") over a global.
        if (env && st.name in env) env[st.name] = v;
        else globals[st.name] = v;
        return;
      }
      case 'local': {
        if (!env)
          throw new NeedlescriptError(
            'local can only be used inside a procedure — use make at the top level',
            st.line,
          );
        env[st.name] = evalExpr(st.value, env, repcount, depth);
        return;
      }
      case 'repeat': {
        const n = Math.floor(evalExpr(st.count, env, repcount, depth));
        if (n > 200000) throw new NeedlescriptError(`repeat count too large (${n})`, st.line);
        for (let i = 1; i <= n; i++) execBlock(st.body, env, i, depth);
        return;
      }
      case 'while': {
        while (evalExpr(st.cond, env, repcount, depth) !== 0) {
          tick(st.line); // ops budget catches endless loops
          execBlock(st.body, env, repcount, depth);
        }
        return;
      }
      case 'for': {
        const from = evalExpr(st.from, env, repcount, depth);
        const to = evalExpr(st.to, env, repcount, depth);
        const step = evalExpr(st.step, env, repcount, depth);
        if (step === 0) throw new NeedlescriptError('for step can\u2019t be 0', st.line);
        if ((to - from) / step > 200000)
          throw new NeedlescriptError('for runs too many times (over 200,000)', st.line);
        const scope = env ?? globals;
        const had = st.varName in scope;
        const prev = scope[st.varName];
        for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) {
          tick(st.line);
          scope[st.varName] = v;
          execBlock(st.body, env, repcount, depth);
        }
        if (had) scope[st.varName] = prev;
        else delete scope[st.varName];
        return;
      }
      case 'if': {
        if (evalExpr(st.cond, env, repcount, depth) !== 0) execBlock(st.body, env, repcount, depth);
        else if (st.elseBody) execBlock(st.elseBody, env, repcount, depth);
        return;
      }
      case 'output': {
        if (depth === 0)
          throw new NeedlescriptError(
            `"${st.value ? 'output' : 'exit'}" can only be used inside a procedure`,
            st.line,
          );
        throw new ReturnSignal(
          st.value ? evalExpr(st.value, env, repcount, depth) : undefined,
        );
      }
      case 'call': {
        callProc(st.name, st.args, env, repcount, depth, st.line);
        return;
      }
      case 'cmd': {
        m.currentLine = st.line;
        const a = st.args.map(x => evalExpr(x, env, repcount, depth));
        switch (st.name) {
          case 'fd': m.forward(a[0]); return;
          case 'bk': m.forward(-a[0]); return;
          case 'rt': m.heading = (m.heading + a[0]) % 360; return;
          case 'lt': m.heading = (m.heading - a[0]) % 360; return;
          case 'up': m.flushSatin(); m.penDown = false; return;
          case 'down': m.penDown = true; return;
          case 'home': m.setXY(0, 0); m.heading = 0; return;
          case 'cs': return;
          case 'setxy': m.setXY(a[0], a[1]); return;
          case 'setx': m.setXY(a[0], m.y); return;
          case 'sety': m.setXY(m.x, a[0]); return;
          case 'seth': m.heading = a[0] % 360; return;
          case 'arc': m.arc(a[0], a[1]); return;
          case 'push': m.pushState(); return;
          case 'pop': m.popState(); return;
          case 'stitchlen': {
            const v = a[0];
            if (v < LIMITS.minStitch || v > LIMITS.maxStitch)
              m.warnings.push(
                `stitchlen ${v} clamped to ${Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch)} mm (machine-safe range is ${LIMITS.minStitch}–${LIMITS.maxStitch})`,
              );
            m.stitchLen = Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch);
            return;
          }
          case 'satin': {
            m.flushSatin();
            const v = Math.max(0, a[0]);
            if (v > 10)
              m.warnings.push(
                `satin ${v} mm is very wide — columns over ~8 mm tend to snag; consider splitting`,
              );
            m.satinWidth = v;
            m.mode = v > 0.05 ? 'satin' : 'run';
            return;
          }
          case 'estitch': {
            m.flushSatin();
            const v = Math.max(0, a[0]);
            if (v > 10)
              m.warnings.push(`estitch ${v} mm is very wide — prongs over ~8 mm tend to snag`);
            m.eWidth = v;
            m.mode = v > 0.05 ? 'estitch' : 'run';
            return;
          }
          case 'bean': {
            let n = Math.round(a[0]);
            if (n <= 1) { m.beanRepeats = 1; return; }
            if (n % 2 === 0) { n += 1; m.warnings.push(`bean must be odd to keep advancing — using ${n}`); }
            if (n > 9) { n = 9; m.warnings.push('bean clamped to 9 passes'); }
            m.beanRepeats = n;
            return;
          }
          case 'lock': {
            if (a[0] <= 0) { m.lockLen = 0; return; }
            const v = Math.min(Math.max(a[0], 0.3), 1.5);
            if (v !== a[0]) m.warnings.push(`lock ${a[0]} clamped to ${v} mm (safe range 0.3–1.5)`);
            m.lockLen = v;
            return;
          }
          case 'beginfill': m.beginFill(); return;
          case 'endfill': m.endFill(); return;
          case 'fillangle': m.fillAngle = a[0]; return;
          case 'fillspacing': {
            const v = Math.min(Math.max(a[0], 0.25), 5);
            if (v !== a[0]) m.warnings.push(`fillspacing ${a[0]} clamped to ${v} mm (safe range 0.25–5)`);
            m.fillSpacing = v;
            return;
          }
          case 'filllen': {
            if (a[0] <= 0) { m.fillLen = null; return; }
            const v = Math.min(Math.max(a[0], 1), 7);
            if (v !== a[0]) m.warnings.push(`filllen ${a[0]} clamped to ${v} mm (safe range 1–7)`);
            m.fillLen = v;
            return;
          }
          case 'density': m.flushSatin(); m.satinSpacing = Math.min(Math.max(a[0], 0.25), 5); return;
          case 'pullcomp': {
            const v = Math.min(Math.max(a[0], 0), 1.5);
            if (v !== a[0]) m.warnings.push(`pullcomp ${a[0]} clamped to ${v} mm (safe range 0–1.5)`);
            m.pullComp = v;
            return;
          }
          case 'shortstitch': m.shortStitch = a[0] !== 0; return;
          case 'autotrim': {
            if (a[0] <= 0) { m.autoTrim = 0; return; }
            const v = Math.min(Math.max(a[0], 3), 30);
            if (v !== a[0]) m.warnings.push(`autotrim ${a[0]} clamped to ${v} mm (safe range 3–30, 0 = off)`);
            m.autoTrim = v;
            return;
          }
          case 'maxdensity': {
            if (a[0] <= 0) { m.maxDensity = 0; return; }
            m.maxDensity = Math.min(Math.max(a[0], 1), 8);
            return;
          }
          case 'underlay':
            m.underlayMode = st.word as typeof m.underlayMode;
            return;
          case 'fillunderlay':
            m.fillUnderlayMode = st.word as typeof m.fillUnderlayMode;
            return;
          case 'fabric': {
            const f = FABRICS[st.word as string];
            m.pullComp = f.pull;
            m.underlayMode = 'auto';
            m.fillUnderlayMode = 'auto';
            m.maxDensity = f.maxDensity;
            m.doubleUnderlay = !!f.doubleUnderlay;
            if (f.densityFloor && m.satinSpacing < f.densityFloor)
              m.satinSpacing = f.densityFloor;
            if (f.note && !m.warnings.includes(f.note)) m.warnings.push(f.note);
            return;
          }
          case 'color': m.colorChange(a[0]); return;
          case 'stop': m.colorChange(m.colorIdx + 1); return;
          case 'trim': m.trimThread(); return;
          case 'seed': {
            const s = Math.floor(a[0]);
            rng = makeRNG(s);
            noise = makeNoise(s);
            return;
          }
          case 'print':
            printed.push((st.label ? st.label + ': ' : '') + formatNum(a[0]));
            return;
          case 'mark': m.markHere(); return;
          case 'assert':
            if (a[0] === 0)
              throw new NeedlescriptError('assert failed — the condition is 0 (false)', st.line);
            return;
        }
        throw new NeedlescriptError(`Unhandled command ${st.name}`, st.line);
      }
    }
  }

  execBlock(program, null, 0, 0);

  m.flushSatin();
  if (m.recording) {
    m.warnings.push('beginfill was never closed — endfill added at the end of the program');
    m.endFill();
  }
  if (m.tinyDropped > 0)
    m.warnings.push(
      `${m.tinyDropped} sub-${LIMITS.minStitch} mm moves merged into neighbours (too short to sew safely)`,
    );

  if (m.autoTrim > 0) {
    const at = applyAutoTrim(m.events, m.autoTrim);
    m.events = at.events;
  }

  // Analyse coverage before the lock pass: tie-offs are deliberate micro
  // stitches and would otherwise read as false hotspots at every thread end.
  const density = densityMap(m.events, 1, m.maxDensity);
  if (m.maxDensity > 0) {
    const dens = density.hotspots.filter(h => h.kind === 'density').slice(0, 3);
    for (const h of dens) {
      m.warnings.push(
        `${h.value.toFixed(1)} layers of thread (limit ${m.maxDensity}) near (${h.x.toFixed(0)}, ${h.y.toFixed(0)})` +
        (h.lines.length ? ` — mostly line${h.lines.length > 1 ? 's' : ''} ${h.lines.join(', ')}` : '') +
        ' — may pucker or break needles',
      );
    }
    const stacks = density.hotspots.filter(h => h.kind === 'stack').slice(0, 2);
    for (const h of stacks) {
      m.warnings.push(
        `${h.value} needle penetrations in the same hole near (${h.x.toFixed(0)}, ${h.y.toFixed(0)})` +
        (h.lines.length ? ` — line ${h.lines[0]}` : '') +
        ' — this can cut the fabric',
      );
    }
  }

  let locks = 0;
  if (m.lockLen > 0) {
    const secured = applyLocks(m.events, m.lockLen);
    m.events = secured.events;
    locks = secured.locks;
  }

  return { events: m.events, warnings: m.warnings, printed, locks, density };
}
