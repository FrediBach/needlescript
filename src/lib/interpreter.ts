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
import {
  NsList, isList, num, deepEqual, deepCopy, valDepth, describeVal,
  formatNum, formatVal,
} from './list.ts';
import type { Val } from './list.ts';

/** Thrown by `output` / `exit` to unwind to the enclosing procedure call. */
class ReturnSignal {
  readonly value: Val | undefined;
  constructor(value: Val | undefined) {
    this.value = value;
  }
}

export function run(source: string, opts: RunOptions = {}): RunResult {
  const tokens = tokenize(source);
  const program = parse(tokens);
  const m = new Machine();
  const globals: Record<string, Val> = Object.create(null);
  const procs: Record<string, ASTNode & { k: 'to' }> = Object.create(null);
  const seed0 = opts.seed !== undefined ? opts.seed : 42;
  let rng = makeRNG(seed0);
  let noise = makeNoise(seed0);
  let ops = 0;
  /** Live list cells (slots). Decremented by removeat; lists that simply go
   *  out of reach stay counted — the counter is a tab-protecting ceiling,
   *  not a garbage collector. */
  let cells = 0;
  const printed: string[] = [];

  function tick(line?: number) {
    if (++ops > LIMITS.maxOps)
      throw new NeedlescriptError(
        'Program ran too long (possible infinite loop) — stopped',
        line,
      );
  }

  /** Charge n element reads/writes against the op budget. */
  function tickN(n: number, line?: number) {
    ops += n;
    if (ops > LIMITS.maxOps)
      throw new NeedlescriptError(
        'Program ran too long (possible infinite loop) — stopped',
        line,
      );
  }

  /** Charge n freshly allocated list cells (and the op budget). */
  function charge(n: number, line?: number) {
    cells += n;
    if (cells > LIMITS.maxListCells)
      throw new NeedlescriptError(
        `Too many list cells (over ${LIMITS.maxListCells.toLocaleString()}) — stopped`,
        line,
      );
    tickN(n, line);
  }

  /** Allocate a new list, enforcing the length limit and charging cells. */
  function allocList(items: Val[], line?: number): NsList {
    if (items.length > LIMITS.maxListLen)
      throw new NeedlescriptError(
        `List too long (${items.length.toLocaleString()} elements, limit ${LIMITS.maxListLen.toLocaleString()})`,
        line,
      );
    charge(items.length, line);
    return new NsList(items);
  }

  /** A condition must be a number; a list is a loud error (RFC-2 §2). */
  function truthy(v: Val, what: string, line?: number): number {
    if (isList(v))
      throw new NeedlescriptError(
        `"${what}" got ${describeVal(v)} — a list isn't true or false, use len(xs) > 0`,
        line,
      );
    return v;
  }

  /**
   * Normalize an index into a list of length `len`: must be a number,
   * integral within 1e-9, negatives count from the end, out of range
   * (either direction) is an error.
   */
  function toIndex(v: Val, len: number, what: string, line?: number): number {
    const n = num(v, what, line);
    const r = Math.round(n);
    if (Math.abs(n - r) > 1e-9)
      throw new NeedlescriptError(
        `${what}: index ${formatNum(n)} isn't a whole number — use floor() deliberately`,
        line,
      );
    const i = r < 0 ? r + len : r;
    if (i < 0 || i >= len)
      throw new NeedlescriptError(
        `${what}: index ${r} is out of range (the list has ${len} element${len === 1 ? '' : 's'})`,
        line,
      );
    return i;
  }

  /** The value must be a list. */
  function list(v: Val, what: string, line?: number): NsList {
    if (!isList(v))
      throw new NeedlescriptError(`"${what}" expected a list, got a number`, line);
    return v;
  }

  /** Check that nesting an element one level deeper stays within the cap. */
  function checkDepth(v: Val, line?: number) {
    if (isList(v) && valDepth(v) + 1 > LIMITS.maxListDepth)
      throw new NeedlescriptError(
        `list nesting deeper than ${LIMITS.maxListDepth}`,
        line,
      );
  }

  function listFunc(
    name: string,
    args: Val[],
    line: number | undefined,
  ): Val {
    switch (name) {
      case 'range': {
        const a = args.length === 1 ? 0 : num(args[0], 'range', line);
        const b = args.length === 1 ? num(args[0], 'range', line) : num(args[1], 'range', line);
        const s = args.length === 3 ? num(args[2], 'range', line) : 1;
        if (s === 0) throw new NeedlescriptError("range step can't be 0", line);
        const count = Math.max(0, Math.ceil((b - a) / s - 1e-9));
        if (count > LIMITS.maxListLen)
          throw new NeedlescriptError(
            `List too long (${count.toLocaleString()} elements, limit ${LIMITS.maxListLen.toLocaleString()})`,
            line,
          );
        const out: Val[] = [];
        for (let k = 0; k < count; k++) out.push(a + k * s);
        return allocList(out, line);
      }
      case 'filled': {
        const n = num(args[0], 'filled', line);
        const r = Math.round(n);
        if (Math.abs(n - r) > 1e-9 || r < 0)
          throw new NeedlescriptError(
            `filled expected a whole number of elements, got ${formatNum(n)}`,
            line,
          );
        if (r > LIMITS.maxListLen)
          throw new NeedlescriptError(
            `List too long (${r.toLocaleString()} elements, limit ${LIMITS.maxListLen.toLocaleString()})`,
            line,
          );
        const out: Val[] = [];
        for (let k = 0; k < r; k++) out.push(deepCopy(args[1], () => charge(1, line)));
        return allocList(out, line);
      }
      case 'len': return list(args[0], 'len', line).items.length;
      case 'islist': return isList(args[0]) ? 1 : 0;
      case 'first': {
        const xs = list(args[0], 'first', line);
        if (xs.items.length === 0)
          throw new NeedlescriptError('first of an empty list', line);
        return xs.items[0];
      }
      case 'last': {
        const xs = list(args[0], 'last', line);
        if (xs.items.length === 0)
          throw new NeedlescriptError('last of an empty list', line);
        return xs.items[xs.items.length - 1];
      }
      case 'concat': {
        const a = list(args[0], 'concat', line);
        const b = list(args[1], 'concat', line);
        // shallow: elements are shared references
        return allocList([...a.items, ...b.items], line);
      }
      case 'slice': {
        const xs = list(args[0], 'slice', line);
        const len = xs.items.length;
        // Python window semantics: negatives from the end, then clamped —
        // slice is the one place clamping is fine (a window, not an address).
        const norm = (v: Val | undefined, dflt: number) => {
          if (v === undefined) return dflt;
          const n = Math.trunc(num(v, 'slice', line));
          return Math.min(len, Math.max(0, n < 0 ? n + len : n));
        };
        const a = norm(args[1], 0);
        const b = norm(args[2], len);
        return allocList(xs.items.slice(a, b), line);
      }
      case 'reverse': {
        const xs = list(args[0], 'reverse', line);
        return allocList([...xs.items].reverse(), line);
      }
      case 'sort': {
        const xs = list(args[0], 'sort', line);
        xs.items.forEach((v, i) => {
          if (isList(v))
            throw new NeedlescriptError(
              `sort can only sort numbers — element ${i} is a list`,
              line,
            );
        });
        return allocList(
          [...(xs.items as number[])].sort((a, b) => a - b),
          line,
        );
      }
      case 'copy': return deepCopy(args[0], () => charge(1, line));
      case 'indexof': {
        const xs = list(args[0], 'indexof', line);
        for (let i = 0; i < xs.items.length; i++) {
          tick(line);
          if (deepEqual(xs.items[i], args[1])) return i;
        }
        return -1;
      }
      case 'contains': {
        const xs = list(args[0], 'contains', line);
        for (const x of xs.items) {
          tick(line);
          if (deepEqual(x, args[1])) return 1;
        }
        return 0;
      }
      case 'sum': case 'mean': case 'minof': case 'maxof': {
        const xs = list(args[0], name, line);
        if (xs.items.length === 0) {
          if (name === 'sum') return 0;
          throw new NeedlescriptError(`${name} of an empty list`, line);
        }
        tickN(xs.items.length, line);
        let acc = num(xs.items[0], name, line);
        for (let i = 1; i < xs.items.length; i++) {
          const v = num(xs.items[i], name, line);
          if (name === 'minof') acc = Math.min(acc, v);
          else if (name === 'maxof') acc = Math.max(acc, v);
          else acc += v;
        }
        return name === 'mean' ? acc / xs.items.length : acc;
      }
      case 'pick': {
        const xs = list(args[0], 'pick', line);
        if (xs.items.length === 0)
          throw new NeedlescriptError('pick of an empty list', line);
        return xs.items[Math.floor(rng() * xs.items.length)]; // one RNG draw
      }
      case 'shuffle': {
        const xs = list(args[0], 'shuffle', line);
        const out = [...xs.items];
        // Fisher–Yates, exactly len−1 draws, high index down to 1 — this
        // draw order is specified so the same seed gives the same order
        // forever.
        for (let i = out.length - 1; i >= 1; i--) {
          const j = Math.floor(rng() * (i + 1));
          const t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return allocList(out, line);
      }
      case 'pos': return allocList([m.x, m.y], line);
      case 'removeat': {
        const xs = list(args[0], 'removeat', line);
        const i = toIndex(args[1], xs.items.length, 'removeat', line);
        const removed = xs.items.splice(i, 1)[0];
        cells -= 1;
        tick(line);
        return removed;
      }
    }
    throw new NeedlescriptError(`Unknown function ${name}`, line);
  }

  function evalExpr(
    node: ExprNode,
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
  ): Val {
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
      case 'neg':
        return -num(evalExpr(node.val, env, repcount, depth), '-', node.line);
      case 'list': {
        const items: Val[] = [];
        for (const it of node.items) items.push(evalExpr(it, env, repcount, depth));
        const out = allocList(items, node.line);
        if (valDepth(out) > LIMITS.maxListDepth)
          throw new NeedlescriptError(
            `list nesting deeper than ${LIMITS.maxListDepth}`,
            node.line,
          );
        return out;
      }
      case 'index': {
        const obj = evalExpr(node.obj, env, repcount, depth);
        if (!isList(obj))
          throw new NeedlescriptError(
            `only lists can be indexed with [ ] — this is a number`,
            node.line,
          );
        const i = toIndex(
          evalExpr(node.idx, env, repcount, depth),
          obj.items.length, 'indexing', node.line,
        );
        return obj.items[i];
      }
      case 'callval': {
        evalExpr(node.obj, env, repcount, depth);
        throw new NeedlescriptError(
          "a list value can't be called like a procedure",
          node.line,
        );
      }
      case 'listfunc': {
        const args = node.args.map(a => evalExpr(a, env, repcount, depth));
        return listFunc(node.name, args, node.line);
      }
      case 'bin': {
        // and / or short-circuit so guards like  :i > 0 and 10 / :i > 2  are safe
        if (node.op === 'and')
          return truthy(evalExpr(node.left, env, repcount, depth), 'and', undefined) !== 0 &&
            truthy(evalExpr(node.right, env, repcount, depth), 'and', undefined) !== 0 ? 1 : 0;
        if (node.op === 'or')
          return truthy(evalExpr(node.left, env, repcount, depth), 'or', undefined) !== 0 ||
            truthy(evalExpr(node.right, env, repcount, depth), 'or', undefined) !== 0 ? 1 : 0;
        const av = evalExpr(node.left, env, repcount, depth);
        const bv = evalExpr(node.right, env, repcount, depth);
        // Equality on lists is deep; mixed number/list compares unequal
        // (equality is a question, not a type assertion).
        if (node.op === '=' || node.op === '!=') {
          if (isList(av) || isList(bv)) {
            const eq = deepEqual(av, bv);
            return node.op === '=' ? (eq ? 1 : 0) : (eq ? 0 : 1);
          }
        }
        const a = num(av, node.op, undefined, 'on the left');
        const b = num(bv, node.op, undefined, 'on the right');
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
        if (node.name === 'not')
          return truthy(evalExpr(node.args[0], env, repcount, depth), 'not', node.line) === 0 ? 1 : 0;
        // Every legacy function is scalar — a list operand is a type error
        // naming the function (RFC-2 §2).
        const args = node.args.map(a =>
          num(evalExpr(a, env, repcount, depth), node.name, node.line));
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
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
    line?: number,
  ): Val | undefined {
    const proc = procs[name];
    if (!proc)
      throw new NeedlescriptError(`Procedure "${name}" is used before it is defined`, line);
    if (depth >= LIMITS.maxCallDepth)
      throw new NeedlescriptError(`Too much recursion in "${name}"`, line);
    const newEnv: Record<string, Val> = Object.create(null);
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
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
  ) {
    for (const st of stmts) execStmt(st, env, repcount, depth);
  }

  function execStmt(
    st: ASTNode,
    env: Record<string, Val> | null,
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
      case 'letlist': {
        // let [x, y] = p — fixed-arity destructuring, flat only (RFC-2 §3.3)
        const v = evalExpr(st.value, env, repcount, depth);
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
        const scope = st.isLocal && env ? env : globals;
        st.names.forEach((n, i) => { scope[n] = v.items[i]; });
        return;
      }
      case 'setindex': {
        // xs[i] = v   |   grid[i][j] += v — lvalue chains (RFC-2 §3.3)
        let target: Val;
        if (env && st.name in env) target = env[st.name];
        else if (st.name in globals) target = globals[st.name];
        else
          throw new NeedlescriptError(
            `Variable "${st.name}" was never assigned on this path`,
            st.line,
          );
        for (let k = 0; ; k++) {
          if (!isList(target))
            throw new NeedlescriptError(
              `only lists can be indexed with [ ] — "${st.name}" leads to a number here`,
              st.line,
            );
          const i = toIndex(
            evalExpr(st.indices[k], env, repcount, depth),
            target.items.length, 'indexing', st.line,
          );
          tick(st.line);
          if (k === st.indices.length - 1) {
            let v = evalExpr(st.value, env, repcount, depth);
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
            checkDepth(v, st.line);
            target.items[i] = v;
            return;
          }
          target = target.items[i];
        }
      }
      case 'repeat': {
        const n = Math.floor(num(evalExpr(st.count, env, repcount, depth), 'repeat', st.line));
        if (n > 200000) throw new NeedlescriptError(`repeat count too large (${n})`, st.line);
        for (let i = 1; i <= n; i++) execBlock(st.body, env, i, depth);
        return;
      }
      case 'while': {
        while (truthy(evalExpr(st.cond, env, repcount, depth), 'while', st.line) !== 0) {
          tick(st.line); // ops budget catches endless loops
          execBlock(st.body, env, repcount, depth);
        }
        return;
      }
      case 'for': {
        const from = num(evalExpr(st.from, env, repcount, depth), 'for', st.line);
        const to = num(evalExpr(st.to, env, repcount, depth), 'for', st.line);
        const step = num(evalExpr(st.step, env, repcount, depth), 'for', st.line);
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
      case 'forin': {
        // for x in xs — length captured at loop entry, elements read live
        // (reference semantics, documented), loop variable doesn't leak.
        const v = evalExpr(st.list, env, repcount, depth);
        if (!isList(v))
          throw new NeedlescriptError(
            `for ${st.varName} in … expected a list, got a number`,
            st.line,
          );
        const n = v.items.length;
        const scope = env ?? globals;
        const had = st.varName in scope;
        const prev = scope[st.varName];
        for (let i = 0; i < n; i++) {
          tick(st.line);
          scope[st.varName] = v.items[i];
          execBlock(st.body, env, repcount, depth);
        }
        if (had) scope[st.varName] = prev;
        else delete scope[st.varName];
        return;
      }
      case 'if': {
        if (truthy(evalExpr(st.cond, env, repcount, depth), 'if', st.line) !== 0)
          execBlock(st.body, env, repcount, depth);
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
      case 'listcmd': {
        m.currentLine = st.line;
        const a = st.args.map(x => evalExpr(x, env, repcount, depth));
        switch (st.name) {
          case 'append': case 'prepend': {
            const xs = list(a[0], st.name, st.line);
            if (xs.items.length + 1 > LIMITS.maxListLen)
              throw new NeedlescriptError(
                `List too long (limit ${LIMITS.maxListLen.toLocaleString()} elements)`,
                st.line,
              );
            checkDepth(a[1], st.line);
            charge(1, st.line);
            if (st.name === 'append') xs.items.push(a[1]);
            else xs.items.unshift(a[1]);
            return;
          }
          case 'insertat': {
            const xs = list(a[0], 'insertat', st.line);
            if (xs.items.length + 1 > LIMITS.maxListLen)
              throw new NeedlescriptError(
                `List too long (limit ${LIMITS.maxListLen.toLocaleString()} elements)`,
                st.line,
              );
            // 0…len allowed: inserting at len appends.
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
            checkDepth(a[2], st.line);
            charge(1, st.line);
            xs.items.splice(i, 0, a[2]);
            return;
          }
          case 'removeat': {
            listFunc('removeat', a, st.line); // return value discarded
            return;
          }
          case 'setpos': {
            const p = list(a[0], 'setpos', st.line);
            if (p.items.length < 2)
              throw new NeedlescriptError(
                `setpos expected [x, y], got a list of ${p.items.length}`,
                st.line,
              );
            const x = num(p.items[0], 'setpos', st.line);
            const y = num(p.items[1], 'setpos', st.line);
            m.setXY(x, y);
            return;
          }
        }
        throw new NeedlescriptError(`Unhandled command ${st.name}`, st.line);
      }
      case 'cmd': {
        m.currentLine = st.line;
        const vals = st.args.map(x => evalExpr(x, env, repcount, depth));
        if (st.name === 'print') {
          printed.push((st.label ? st.label + ': ' : '') + formatVal(vals[0]));
          return;
        }
        if (st.name === 'assert') {
          if (truthy(vals[0], 'assert', st.line) === 0)
            throw new NeedlescriptError('assert failed — the condition is 0 (false)', st.line);
          return;
        }
        // Every other command is scalar — a list argument is a type error
        // naming the command (RFC-2 §2).
        const a = vals.map(v => num(v, st.name, st.line));
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
          case 'mark': m.markHere(); return;
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
