// ---------- Interpreter ----------

import type {
  ASTNode,
  ExprNode,
  RunResult,
  RunOptions,
  WarningLocation,
  HoopInfo,
  OverrideKey,
} from './types.ts';
import { NeedlescriptError } from './errors.ts';
import { makeRNG, makeNoise, fork, gauss } from './prng.ts';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import {
  FABRICS,
  FUNC_ARITY,
  ZERO_FUNCS,
  LIST_FUNCS,
  GEN_FUNCS,
  QUERY_FUNCS,
  STRING_FUNCS,
  QWORD_BUILTINS,
  GEN_QWORD_ARG,
} from './commands.ts';
import { Machine, LIMITS, STOCK_LIMITS, OVERRIDE_CEILINGS, OVERRIDE_FLOORS } from './machine.ts';
import type { BudgetKey } from './machine.ts';
import { tokenize } from './tokenizer.ts';
import { parse } from './parser.ts';
import { applyAutoTrim, applyLocks } from './postprocess.ts';
import { didYouMean } from './suggestions.ts';
import {
  NsList,
  FuncRef,
  ComposedRef,
  isList,
  isFuncRef,
  isString,
  num,
  deepEqual,
  deepCopy,
  valDepth,
  describeVal,
  formatNum,
  formatVal,
} from './list.ts';
import type { Val } from './list.ts';
import * as gm from './genmath.ts';
import type { Pt } from './genmath.ts';
import { offsetRegion, clipRegions } from './geometry.ts';
import { scatter, voronoiCells, triangulate, hull, relax } from './generators.ts';
import type { Domain } from './generators.ts';
import {
  applyPath,
  apply,
  mTranslate,
  mRotate,
  mRotateAbout,
  mScale,
  mScaleXY,
  mMirror,
  mSkew,
  mRaw,
} from './affine.ts';
import type { Mat } from './affine.ts';
import { humanizeMap, snapMapFromSpec } from './effects.ts';
import { makeDeclumpState, declumpFoldPoint, MAXSHIFT_MAX } from './declump.ts';
import {
  lookupHoopPreset,
  HOOP_PRESET_NAMES,
  buildHoopInfo,
  hoopFieldDomain,
  hoopFieldPolygon,
  fieldDescription,
  hoopDescription,
} from './hoop-presets.ts';

/** Thrown by `output` / `exit` to unwind to the enclosing procedure call. */
class ReturnSignal {
  readonly value: Val | undefined;
  constructor(value: Val | undefined) {
    this.value = value;
  }
}

/**
 * Thrown by `break` / `continue` to unwind to the innermost enclosing loop
 * (RFC-4). Parse-time validation guarantees a loop catches it before any
 * procedure boundary; the catches in callProc and at the top level are
 * defensive only.
 */
class LoopSignal {
  readonly kind: 'break' | 'continue';
  readonly line?: number;
  constructor(kind: 'break' | 'continue', line?: number) {
    this.kind = kind;
    this.line = line;
  }
}

export function run(source: string, opts: RunOptions = {}): RunResult {
  const tokens = tokenize(source);
  const parseNotes: string[] = [];
  const program = parse(tokens, parseNotes);
  const m = new Machine();
  m.warnings.push(...parseNotes);
  const globals: Record<string, Val> = Object.create(null);
  const procs: Record<string, ASTNode & { k: 'to' }> = Object.create(null);
  const seed0 = opts.seed !== undefined ? opts.seed : 42;
  let rng = makeRNG(seed0);
  let noise = makeNoise(seed0);
  // Seeded simplex noise (RFC-3 §4.2): permutation tables built from the
  // seed at seed time, on a stream of their own — same seed, same field,
  // forever, and zero draws from the main stream.
  let snoise2 = createNoise2D(makeRNG(seed0));
  let snoise3 = createNoise3D(makeRNG(seed0 ^ 0x9e3779b9));
  let ops = 0;
  /** Live list cells (slots). Decremented by removeat; lists that simply go
   *  out of reach stay counted — the counter is a tab-protecting ceiling,
   *  not a garbage collector. */
  let cells = 0;
  /** Monotonic string character allocation counter. Same philosophy as cells. */
  let stringChars = 0;
  const printed: string[] = [];

  // Trace sandbox state (RFC-trace §4)
  let insideTrace = 0;
  const traceNoted = new Set<string>();
  // Structural block depth: incremented inside repeat/for/while/forin/if/transform/effect
  // so that the `hoop` and `override` placement guards can detect nested placement.
  let structuralDepth = 0;

  /** Emit a one-time note (warning) inside a trace block. */
  function traceNote(kind: string, msg: string) {
    if (insideTrace > 0 && !traceNoted.has(kind)) {
      traceNoted.add(kind);
      m.warnings.push(msg);
    }
  }

  function tick(line?: number) {
    if (++ops > m.effectiveLimits.maxOps) throw new NeedlescriptError(overlongMsg(), line);
  }

  /** Charge n element reads/writes against the op budget. */
  function tickN(n: number, line?: number) {
    ops += n;
    if (ops > m.effectiveLimits.maxOps) throw new NeedlescriptError(overlongMsg(), line);
  }

  /** The op-limit message, made loop-aware once a history query has run. */
  function overlongMsg(): string {
    const raised = m.effectiveLimits.maxOps > STOCK_LIMITS.maxOps;
    return (
      'Program ran too long (possible infinite loop) — stopped' +
      (raised
        ? ` (op limit raised by override from ${STOCK_LIMITS.maxOps.toLocaleString('en-US')})`
        : '') +
      (m.usedQuery
        ? ' — a feedback loop may not be terminating; is your coverage target reachable? Cap it with  repeat N [ … if done [ break ] ].'
        : '')
    );
  }

  /** Charge n freshly allocated list cells (and the op budget). */
  function charge(n: number, line?: number) {
    cells += n;
    if (cells > m.effectiveLimits.maxListCells)
      throw new NeedlescriptError(
        `Too many list cells (over ${m.effectiveLimits.maxListCells.toLocaleString('en-US')}) — stopped`,
        line,
      );
    tickN(n, line);
  }

  /** Allocate a new string, enforcing per-string and total-char budgets. */
  function allocString(s: string, line?: number): string {
    if (s.length > m.effectiveLimits.maxStringLength)
      throw new NeedlescriptError(
        `String is too long (${s.length.toLocaleString('en-US')} chars, limit ${m.effectiveLimits.maxStringLength.toLocaleString('en-US')})`,
        line,
      );
    stringChars += s.length;
    if (stringChars > m.effectiveLimits.maxStringChars)
      throw new NeedlescriptError(
        `String allocation budget exceeded (over ${m.effectiveLimits.maxStringChars.toLocaleString('en-US')} total chars) — stopped`,
        line,
      );
    return s;
  }

  /** Allocate a new list, enforcing the length limit and charging cells. */
  function allocList(items: Val[], line?: number): NsList {
    if (items.length > m.effectiveLimits.maxListLen)
      throw new NeedlescriptError(
        `List too long (${items.length.toLocaleString('en-US')} elements, limit ${m.effectiveLimits.maxListLen.toLocaleString('en-US')})`,
        line,
      );
    charge(items.length, line);
    return new NsList(items);
  }

  /**
   * A condition must be a number; lists and strings are loud errors.
   */
  function truthy(v: Val, what: string, line?: number): number {
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
  }

  /**
   * Normalize an index into a sequence of length `len`: must be a number,
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
      throw new NeedlescriptError(`${what}: index ${r} is out of range (length ${len})`, line);
    return i;
  }

  /** The value must be a list. */
  function list(v: Val, what: string, line?: number): NsList {
    if (typeof v === 'string')
      throw new NeedlescriptError(`"${what}" expected a list, got a string`, line);
    if (!isList(v)) throw new NeedlescriptError(`"${what}" expected a list, got a number`, line);
    return v;
  }

  /** The value must be a @procedure reference. */
  function funcRef(v: Val, what: string, line?: number): FuncRef {
    if (!isFuncRef(v))
      throw new NeedlescriptError(
        `"${what}" expected a @procedure reference, got ${describeVal(v)}`,
        line,
      );
    return v;
  }

  /** Check that nesting an element one level deeper stays within the cap. */
  function checkDepth(v: Val, line?: number) {
    if (isList(v) && valDepth(v) + 1 > LIMITS.maxListDepth)
      throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`, line);
  }

  function listFunc(name: string, args: Val[], line: number | undefined, depth = 0): Val {
    switch (name) {
      case 'range': {
        const a = args.length === 1 ? 0 : num(args[0], 'range', line);
        const b = args.length === 1 ? num(args[0], 'range', line) : num(args[1], 'range', line);
        const s = args.length === 3 ? num(args[2], 'range', line) : 1;
        if (s === 0) throw new NeedlescriptError("range step can't be 0", line);
        const count = Math.max(0, Math.ceil((b - a) / s - 1e-9));
        if (count > m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `List too long (${count.toLocaleString('en-US')} elements, limit ${m.effectiveLimits.maxListLen.toLocaleString('en-US')})`,
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
        if (r > m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `List too long (${r.toLocaleString('en-US')} elements, limit ${m.effectiveLimits.maxListLen.toLocaleString('en-US')})`,
            line,
          );
        const out: Val[] = [];
        for (let k = 0; k < r; k++) out.push(deepCopy(args[1], () => charge(1, line)));
        return allocList(out, line);
      }
      case 'len':
        if (typeof args[0] === 'string') return args[0].length;
        return list(args[0], 'len', line).items.length;
      case 'islist':
        return isList(args[0]) ? 1 : 0;
      case 'first': {
        if (typeof args[0] === 'string') {
          if (args[0].length === 0) throw new NeedlescriptError('first of an empty string', line);
          return args[0][0];
        }
        const xs = list(args[0], 'first', line);
        if (xs.items.length === 0) throw new NeedlescriptError('first of an empty list', line);
        return xs.items[0];
      }
      case 'last': {
        if (typeof args[0] === 'string') {
          if (args[0].length === 0) throw new NeedlescriptError('last of an empty string', line);
          return args[0][args[0].length - 1];
        }
        const xs = list(args[0], 'last', line);
        if (xs.items.length === 0) throw new NeedlescriptError('last of an empty list', line);
        return xs.items[xs.items.length - 1];
      }
      case 'concat': {
        // String concat (both must be strings)
        if (typeof args[0] === 'string' || typeof args[1] === 'string') {
          if (typeof args[0] !== 'string' || typeof args[1] !== 'string')
            throw new NeedlescriptError(
              `concat: both arguments must be the same type — use str(n) to convert a number to a string`,
              line,
            );
          return allocString(args[0] + args[1], line);
        }
        const a = list(args[0], 'concat', line);
        const b = list(args[1], 'concat', line);
        // shallow: elements are shared references
        return allocList([...a.items, ...b.items], line);
      }
      case 'slice': {
        if (typeof args[0] === 'string') {
          const s = args[0];
          const len = s.length;
          const normStr = (v: Val | undefined, dflt: number) => {
            if (v === undefined) return dflt;
            const n = Math.trunc(num(v, 'slice', line));
            return Math.min(len, Math.max(0, n < 0 ? n + len : n));
          };
          const a = normStr(args[1], 0);
          const b = normStr(args[2], len);
          return allocString(s.slice(a, b), line);
        }
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
        if (typeof args[0] === 'string') {
          return allocString([...args[0]].reverse().join(''), line);
        }
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
          if (typeof v === 'string')
            throw new NeedlescriptError(
              `sort can only sort numbers — element ${i} is a string`,
              line,
            );
        });
        return allocList(
          [...(xs.items as number[])].sort((a, b) => a - b),
          line,
        );
      }
      case 'copy':
        if (typeof args[0] === 'string') return args[0]; // strings are immutable, copy is identity
        return deepCopy(args[0], () => charge(1, line));
      case 'indexof': {
        if (typeof args[0] === 'string') {
          if (typeof args[1] !== 'string')
            throw new NeedlescriptError(
              `indexof on a string needs a string to search for, got ${describeVal(args[1])}`,
              line,
            );
          return args[0].indexOf(args[1]);
        }
        const xs = list(args[0], 'indexof', line);
        for (let i = 0; i < xs.items.length; i++) {
          tick(line);
          if (deepEqual(xs.items[i], args[1])) return i;
        }
        return -1;
      }
      case 'contains': {
        if (typeof args[0] === 'string') {
          if (typeof args[1] !== 'string')
            throw new NeedlescriptError(
              `contains on a string needs a string to search for, got ${describeVal(args[1])}`,
              line,
            );
          return args[0].includes(args[1]) ? 1 : 0;
        }
        const xs = list(args[0], 'contains', line);
        for (const x of xs.items) {
          tick(line);
          if (deepEqual(x, args[1])) return 1;
        }
        return 0;
      }
      case 'sum':
      case 'mean':
      case 'minof':
      case 'maxof': {
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
        if (xs.items.length === 0) throw new NeedlescriptError('pick of an empty list', line);
        return xs.items[Math.floor(rng() * xs.items.length)]; // one RNG draw
      }
      case 'shuffle': {
        const xs = list(args[0], 'shuffle', line);
        const out = [...xs.items];
        // Fork convention (RFC-3 §7, amending RFC-2): exactly one draw from
        // the main stream seeds a child RNG; Fisher–Yates runs on the child,
        // high index down to 1. Inserting a shuffle shifts downstream
        // randomness by exactly one draw, regardless of list length.
        const child = fork(rng);
        for (let i = out.length - 1; i >= 1; i--) {
          const j = Math.floor(child() * (i + 1));
          const t = out[i];
          out[i] = out[j];
          out[j] = t;
        }
        return allocList(out, line);
      }
      case 'pos':
        return allocList([m.x, m.y], line);
      case 'removeat': {
        const xs = list(args[0], 'removeat', line);
        const i = toIndex(args[1], xs.items.length, 'removeat', line);
        const removed = xs.items.splice(i, 1)[0];
        cells -= 1;
        tick(line);
        return removed;
      }

      // ---------- steps: inclusive numeric sequence ----------
      case 'steps': {
        const start = num(args[0], 'steps', line);
        const end = num(args[1], 'steps', line);
        const step = args.length === 3 ? num(args[2], 'steps', line) : 1;
        if (step === 0) throw new NeedlescriptError("steps: step can't be 0", line);
        // Direction mismatch → empty list (consistent with range)
        if ((end - start) * step < 0) return allocList([], line);
        // Inclusive end with floating-point tolerance
        const count = Math.floor(Math.abs((end - start) / step) + 1e-9) + 1;
        if (count > m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `List too long (${count.toLocaleString('en-US')} elements, limit ${m.effectiveLimits.maxListLen.toLocaleString('en-US')})`,
            line,
          );
        const out: Val[] = [];
        for (let k = 0; k < count; k++) out.push(start + k * step);
        return allocList(out, line);
      }

      // ---------- Higher-order list functions ----------
      case 'map': {
        const xs = list(args[0], 'map', line);
        const ref = funcRef(args[1], 'map', line);
        const out: Val[] = [];
        for (const item of xs.items) {
          tick(line);
          out.push(callRef(ref, [item], depth + 1, line));
        }
        return allocList(out, line);
      }
      case 'filter': {
        const xs = list(args[0], 'filter', line);
        const ref = funcRef(args[1], 'filter', line);
        const out: Val[] = [];
        for (const item of xs.items) {
          tick(line);
          const result = callRef(ref, [item], depth + 1, line);
          if (truthy(result, `filter callback @${ref.name}`, line)) out.push(item);
        }
        return allocList(out, line);
      }
      case 'reduce': {
        const xs = list(args[0], 'reduce', line);
        const ref = funcRef(args[1], 'reduce', line);
        let acc = args[2]; // initial value (required)
        for (const item of xs.items) {
          tick(line);
          acc = callRef(ref, [acc, item], depth + 1, line);
        }
        return acc;
      }
      case 'compose': {
        const refs: FuncRef[] = [];
        for (let i = 0; i < args.length; i++) {
          refs.push(funcRef(args[i], `compose argument ${i + 1}`, line));
        }
        return new ComposedRef(refs);
      }
    }
    // ---------- String builtins ----------
    if (STRING_FUNCS[name] !== undefined) return stringFunc(name, args, line);
    throw new NeedlescriptError(`Unknown function ${name}`, line);
  }

  // ---------- String builtins ----------

  function stringFunc(name: string, args: Val[], line: number | undefined): Val {
    switch (name) {
      case 'str': {
        const v = args[0];
        if (typeof v === 'number') return formatNum(v);
        if (typeof v === 'string') return v; // identity
        throw new NeedlescriptError(
          `str() expects a number or string, got ${describeVal(v)} — to format lists, use print`,
          line,
        );
      }
      case 'num': {
        const sv = args[0];
        // Identity on number (convenience: num(x) where x might already be a number)
        if (typeof sv === 'number') return sv;
        if (typeof sv !== 'string')
          throw new NeedlescriptError(`num() expects a string, got ${describeVal(sv)}`, line);
        const n = Number(sv);
        if (isNaN(n)) {
          if (args.length === 2) return args[1]; // fallback form
          throw new NeedlescriptError(
            `num('${sv}') is not a number — pass a fallback: num(s, 0)`,
            line,
          );
        }
        return n;
      }
      case 'isstring':
        return typeof args[0] === 'string' ? 1 : 0;
      case 'chars': {
        const s = requireString(args[0], 'chars', line);
        const items: Val[] = [...s]; // Unicode-aware character split
        return allocList(items, line);
      }
      case 'split': {
        const s = requireString(args[0], 'split', line);
        const sep = requireString(args[1], 'split separator', line);
        if (sep === '')
          throw new NeedlescriptError(
            `split: separator must not be empty — use chars(s) to split into individual characters`,
            line,
          );
        const parts = s.split(sep);
        const items: Val[] = parts.map((p) => allocString(p, line));
        return allocList(items, line);
      }
      case 'joinstr': {
        const xs = list(args[0], 'joinstr', line);
        const sep = requireString(args[1], 'joinstr separator', line);
        const parts: string[] = [];
        for (let i = 0; i < xs.items.length; i++) {
          const el = xs.items[i];
          if (typeof el !== 'string')
            throw new NeedlescriptError(
              `joinstr: element ${i} is ${describeVal(el)} — use map(xs, @str) first`,
              line,
            );
          parts.push(el);
        }
        return allocString(parts.join(sep), line);
      }
      case 'upper':
        return allocString(asciiUpper(requireString(args[0], 'upper', line)), line);
      case 'lower':
        return allocString(asciiLower(requireString(args[0], 'lower', line)), line);
      case 'strip':
        return allocString(
          requireString(args[0], 'strip', line).replace(/^[\s\t\n]+|[\s\t\n]+$/g, ''),
          line,
        );
      case 'repeatstr': {
        const s = requireString(args[0], 'repeatstr', line);
        const nv = num(args[1], 'repeatstr', line);
        const n = Math.round(nv);
        if (Math.abs(nv - n) > 1e-9 || n < 0)
          throw new NeedlescriptError(
            `repeatstr: count must be a non-negative integer, got ${formatNum(nv)}`,
            line,
          );
        return allocString(s.repeat(n), line);
      }
    }
    throw new NeedlescriptError(`Unknown string function ${name}`, line);
  }

  /** Guard: v must be a string. */
  function requireString(v: Val, what: string, line?: number): string {
    if (typeof v !== 'string')
      throw new NeedlescriptError(`"${what}" expected a string, got ${describeVal(v)}`, line);
    return v;
  }

  /** ASCII-only uppercase (A-Z). */
  function asciiUpper(s: string): string {
    let out = '';
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      out += code >= 97 && code <= 122 ? String.fromCharCode(code - 32) : ch;
    }
    return out;
  }

  /** ASCII-only lowercase (a-z). */
  function asciiLower(s: string): string {
    let out = '';
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : ch;
    }
    return out;
  }

  // ---------- Generative math dispatcher (RFC-3) ----------
  //
  // Converts list values to plain points/paths (loud shape errors naming
  // the function), calls the pure modules, charges the op/cell budgets on
  // the way back. Draw accounting (§7): gauss = 2 direct draws; scatter and
  // shuffle draw exactly 1 and fork; voronoi/relax/… draw 0.

  function genFunc(name: string, args: Val[], line: number | undefined): Val {
    const sc = (i: number) => num(args[i], name, line);
    const pointArg = (i: number) => gm.toPoint(args[i], name, line);
    const pathArg = (i: number, min = 2) => gm.toPath(args[i], name, line, min);
    const regionArg = (i: number) => gm.toRegion(args[i], name, line);
    const point = (p: Pt) => allocList([p[0], p[1]], line);
    const path = (pts: Pt[]) => gm.fromPoints(pts, (items) => allocList(items, line));
    const regions = (rs: Pt[][]) =>
      allocList(
        rs.map((r) => path(r) as Val),
        line,
      );
    const domainArg = (i: number): Domain => {
      if (args.length > i) return { kind: 'poly', pts: regionArg(i) };
      // No explicit region: use the configured field and lock it so a subsequent
      // `hoop` call produces a clear error instead of silently using the wrong field.
      m.fieldLocked = true;
      return hoopFieldDomain(m.hoopInfo);
    };
    const delaunayInput = (i: number, min: number) => {
      const pts = pathArg(i, min);
      if (pts.length > m.effectiveLimits.maxDelaunayPoints)
        throw new NeedlescriptError(
          `${name}: too many points (${pts.length.toLocaleString('en-US')}, limit ${m.effectiveLimits.maxDelaunayPoints.toLocaleString('en-US')})`,
          line,
        );
      tickN(pts.length, line);
      return pts;
    };

    switch (name) {
      // ----- §4.1 scalars -----
      case 'lerp':
        return gm.lerp(sc(0), sc(1), sc(2));
      case 'remap':
        return gm.remap(sc(0), sc(1), sc(2), sc(3), sc(4));
      case 'clamp':
        return gm.clamp(sc(0), sc(1), sc(2));
      case 'smoothstep':
        return gm.smoothstep(sc(0), sc(1), sc(2));
      case 'gauss':
        return gauss(rng, sc(0), sc(1)); // exactly 2 main-stream draws

      // ----- §4.2 noise (range −1…1; legacy noise/noise2 keep 0…1) -----
      case 'snoise2':
        return snoise2(sc(0), sc(1));
      case 'snoise3':
        return snoise3(sc(0), sc(1), sc(2));
      case 'fbm2': {
        const x = sc(0),
          y = sc(1);
        const want = Math.round(sc(2));
        const oct = gm.clamp(want, 1, 8);
        if (oct !== want)
          m.warnings.push(`fbm2 octaves ${formatNum(sc(2))} clamped to ${oct} (range 1–8)`);
        let sum = 0,
          ampSum = 0,
          amp = 1,
          freq = 1;
        for (let o = 0; o < oct; o++) {
          sum += snoise2(x * freq, y * freq) * amp;
          ampSum += amp;
          amp *= 0.5;
          freq *= 2; // lacunarity 2.0, gain 0.5 (§4.2)
        }
        return sum / ampSum;
      }

      // ----- §4.3 vectors -----
      case 'vadd':
        return point(gm.vadd(pointArg(0), pointArg(1)));
      case 'vsub':
        return point(gm.vsub(pointArg(0), pointArg(1)));
      case 'vscale':
        return point(gm.vscale(pointArg(0), sc(1)));
      case 'vlerp':
        return point(gm.vlerp(pointArg(0), pointArg(1), sc(2)));
      case 'vdot':
        return gm.vdot(pointArg(0), pointArg(1));
      case 'vlen':
        return gm.vlen(pointArg(0));
      case 'vdist':
        return gm.vdist(pointArg(0), pointArg(1));
      case 'vnorm':
        return point(gm.vnorm(pointArg(0), line));
      case 'vrot':
        return point(gm.vrot(pointArg(0), sc(1)));
      case 'vheading':
        return gm.vheading(pointArg(0));
      case 'vfromheading':
        return point(gm.vfromheading(sc(0), sc(1)));

      // ----- §4.3b segments -----
      case 'segisect': {
        const r = gm.segisect(pointArg(0), pointArg(1), pointArg(2), pointArg(3));
        return r ? point(r) : allocList([], line);
      }
      case 'segdist':
        return gm.segdist(pointArg(0), pointArg(1), pointArg(2));
      case 'nearestonpath': {
        const p = pointArg(0);
        const pts = gm.toPath(args[1], name, line, 1);
        tickN(pts.length, line);
        return point(gm.nearestOnPath(p, pts, line));
      }

      // ----- §4.4 paths & curves -----
      case 'pathlen': {
        const p = pathArg(0);
        tickN(p.length, line);
        return gm.pathlen(p);
      }
      case 'resample': {
        const pts = pathArg(0);
        const spec = args[1];
        if (isFuncRef(spec)) {
          // Reporter form: resample(path, @fn)  [phase ignored]
          const ref = spec;
          // Arity check: the reporter must take 4 params (t, s, i, p)
          applyStitchLenReporterArity(ref, line);
          tickN(pts.length * 4, line);
          return path(
            gm.resampleReporter(
              pts,
              (t, s, i, p) => applyStitchLenReporter(ref, t, s, i, p, line),
              m.effectiveLimits.maxListLen,
              line,
            ),
          );
        }
        if (isList(spec)) {
          // List form: resample(path, [pat])  or  resample(path, [pat], phase)
          if (spec.items.length === 0)
            throw new NeedlescriptError('resample: pattern list must not be empty', line);
          const patRaw: number[] = spec.items.map((el, idx) => {
            if (typeof el !== 'number' || isList(el))
              throw new NeedlescriptError(
                `resample: pattern element ${idx} must be a number, got ${describeVal(el)}`,
                line,
              );
            return el as number;
          });
          const phase = args.length > 2 ? Math.round(sc(2)) : 0;
          tickN(pts.length * 4, line);
          return path(gm.resampleList(pts, patRaw, phase, m.effectiveLimits.maxListLen, line));
        }
        // Numeric form (unchanged)
        return path(gm.resample(pts, sc(1), m.effectiveLimits.maxListLen, line));
      }
      case 'chaikin': {
        const p = pathArg(0);
        const want = Math.round(sc(1));
        const n = gm.clamp(want, 1, 6);
        if (n !== want)
          m.warnings.push(`chaikin iterations ${formatNum(sc(1))} clamped to ${n} (range 1–6)`);
        if (p.length * Math.pow(2, n) > m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `List too long (chaikin would produce over ${m.effectiveLimits.maxListLen.toLocaleString('en-US')} points)`,
            line,
          );
        return path(gm.chaikin(p, n));
      }
      case 'catmull':
        return path(gm.catmull(pathArg(0), sc(1), m.effectiveLimits.maxListLen, line));
      case 'bezier':
        return path(
          gm.bezier(
            pointArg(0),
            pointArg(1),
            pointArg(2),
            pointArg(3),
            sc(4),
            m.effectiveLimits.maxListLen,
            line,
          ),
        );
      case 'centroid':
        return point(gm.centroid(pathArg(0)));
      case 'bbox': {
        const [minx, miny, maxx, maxy] = gm.bbox(pathArg(0));
        return allocList([minx, miny, maxx, maxy], line);
      }

      // ----- §4.5 generators -----
      case 'scatter': {
        // fork convention (§7): exactly one main-stream draw
        const pts = scatter(
          sc(0),
          domainArg(1),
          fork(rng),
          m.effectiveLimits.maxScatterPoints,
          line,
        );
        tickN(pts.length * 4, line);
        return path(pts.length ? pts : []);
      }
      case 'voronoi': {
        const pts = delaunayInput(0, 1);
        const cells = voronoiCells(pts, domainArg(1), line);
        tickN(pts.length * 8, line);
        return allocList(
          cells.map((c) => (c.length ? path(c) : allocList([], line)) as Val),
          line,
        );
      }
      case 'triangulate': {
        const pts = delaunayInput(0, 3);
        const tris = triangulate(pts, line);
        return allocList(
          tris.map(([a, b, c]) => path([pts[a], pts[b], pts[c]]) as Val),
          line,
        );
      }
      case 'hull':
        return path(hull(delaunayInput(0, 3), line));
      case 'relax': {
        const pts = delaunayInput(0, 1);
        const want = Math.round(sc(1));
        const n = gm.clamp(want, 0, 50);
        if (n !== want)
          m.warnings.push(`relax iterations ${formatNum(sc(1))} clamped to ${n} (range 0–50)`);
        tickN(pts.length * 8 * Math.max(1, n), line);
        // Use the configured field (and lock it so a subsequent hoop call errors).
        m.fieldLocked = true;
        return path(relax(pts, n, hoopFieldDomain(m.hoopInfo), line));
      }

      // ----- §4.6 geometry ops -----
      case 'offsetpath': {
        const r = regionArg(0);
        tickN(r.length * 4, line);
        return regions(offsetRegion(r, sc(1), line, m.effectiveLimits.maxClipVerts));
      }
      case 'clippaths': {
        const a = regionArg(0),
          b = regionArg(1);
        // Third arg is now a string expression (not a parse-time qword).
        const opVal = args[2];
        if (typeof opVal !== 'string')
          throw new NeedlescriptError(
            `clippaths: operation must be a string, got ${describeVal(opVal)} — e.g. clippaths(a, b, 'difference')`,
            line,
          );
        const op = opVal.toLowerCase();
        const allowed = GEN_QWORD_ARG['clippaths'].allowed;
        if (!allowed.includes(op))
          throw new NeedlescriptError(
            `clippaths doesn't know '${op}'${didYouMean(op, allowed)} — choices: ${allowed.join(', ')}`,
            line,
          );
        tickN((a.length + b.length) * 4, line);
        return regions(clipRegions(a, b, op, line, m.effectiveLimits.maxClipVerts));
      }
      case 'inpath':
        return gm.pointInRegion(pointArg(0), regionArg(1)) ? 1 : 0;

      // ----- §hoop: field reporters -----
      case 'infield': {
        // Map point through the CTM (local → hoop space) then test against field.
        const p = gm.toPoint(args[0], 'infield', line);
        const [hx, hy] = apply(m.ctm, p[0], p[1]);
        return m.hoopInfo.shape === 'circle'
          ? hx * hx + hy * hy <= (m.hoopInfo.fieldWidthMM / 2) ** 2
            ? 1
            : 0
          : Math.abs(hx) <= m.hoopInfo.fieldWidthMM / 2 &&
              Math.abs(hy) <= m.hoopInfo.fieldHeightMM / 2
            ? 1
            : 0;
      }
      case 'fieldbounds': {
        // Bounding box of the sewable field: [minX, minY, maxX, maxY] (hoop space).
        const hw = m.hoopInfo.fieldWidthMM / 2;
        const hh = m.hoopInfo.fieldHeightMM / 2;
        return allocList([-hw, -hh, hw, hh], line);
      }
      case 'fieldpath': {
        // Sewable field boundary as a CCW polygon (hoop space). Zero RNG draws.
        const pts = hoopFieldPolygon(m.hoopInfo, 2);
        return path(pts);
      }

      // ----- §4.7 pure path transforms (companions to the block commands) -----
      case 'xlate':
        return path(applyPath(mTranslate(sc(1), sc(2)), pathArg(0)));
      case 'xrotate': {
        if (args.length === 3)
          throw new NeedlescriptError(
            'xrotate takes a pivot as two numbers: xrotate(path, deg, cx, cy)',
            line,
          );
        const m = args.length >= 4 ? mRotateAbout(sc(1), sc(2), sc(3)) : mRotate(sc(1));
        return path(applyPath(m, pathArg(0)));
      }
      case 'xscale': {
        const m = args.length >= 3 ? mScaleXY(sc(1), sc(2)) : mScale(sc(1));
        return path(applyPath(m, pathArg(0)));
      }
      case 'xmirror':
        return path(applyPath(mMirror(sc(1)), pathArg(0)));

      // ----- effects: pure path companions to the effect block commands -----
      // The block forms are sugar over these same maps (effects §): a block
      // applies the map to emitted penetrations, the function maps an explicit
      // point list — pinned identical on pre-resampled paths.
      case 'warppath': {
        const p = pathArg(0);
        if (!isFuncRef(args[1]))
          throw new NeedlescriptError(
            'warppath needs a procedure reference as its second argument, e.g.  warppath(path, @push_out)',
            line,
          );
        const ref = args[1];
        tickN(p.length, line);
        return path(p.map((pt) => applyReporter(ref, pt[0], pt[1], line)));
      }
      case 'humanizepath': {
        const p = pathArg(0);
        const amount = clampHumanize(sc(1));
        // One main-stream draw seeds the coherent field (fork convention §7).
        const childSeed = Math.floor(rng() * 4294967296);
        const fn = humanizeMap(amount, childSeed, snoise2);
        tickN(p.length, line);
        return path(p.map((pt) => fn(pt[0], pt[1])));
      }
      case 'snappath': {
        const p = pathArg(0);
        const nums = args.slice(1).map((_, i) => sc(i + 1));
        const fn = snapMapFromSpec(nums, (msg) => new NeedlescriptError(`snappath ${msg}`, line));
        tickN(p.length, line);
        return path(p.map((pt) => fn(pt[0], pt[1])));
      }
      case 'declumppath': {
        // Pure data twin of `declump`: runs the identical greedy fold over an
        // explicit point list, reading real committed history but committing
        // nothing. Drawless — the fold is deterministic given the density grid.
        // Resample to stitch pitch first: sewpath(declumppath(resample(spine, 2.5), 2, 1.5))
        const p = pathArg(0);
        const limit = Math.max(0, sc(1));
        const maxshift = args.length >= 3 ? clampMaxshift(sc(2)) : 1.5;
        tickN(p.length, line);
        const state = makeDeclumpState(limit, maxshift);
        const result: [number, number][] = p.map((pt, i) => {
          const nextPt = i + 1 < p.length ? ([p[i + 1][0], p[i + 1][1]] as [number, number]) : null;
          // density reads only — no _push, nothing committed
          return declumpFoldPoint(state, [pt[0], pt[1]] as [number, number], nextPt, m.density);
        });
        return path(result);
      }

      // ---- DX: satin-tuple helpers ----
      // Build the 5-slot contract list by intent rather than memorising slot order.
      case 'satinpair': {
        // satinpair(advance, width) ≡ [advance, width, width, 0, 0]
        const advance = sc(0),
          width = sc(1);
        return allocList([advance, width, width, 0, 0], line);
      }
      case 'satinrake': {
        // satinrake(advance, width, lag) ≡ [advance, width, width, -lag, lag]
        const advance = sc(0),
          width = sc(1),
          lag = sc(2);
        return allocList([advance, width, width, -lag, lag], line);
      }
      case 'satinasym': {
        // satinasym(advance, leftw, rightw) ≡ [advance, leftw, rightw, 0, 0]
        const advance = sc(0),
          leftw = sc(1),
          rightw = sc(2);
        return allocList([advance, leftw, rightw, 0, 0], line);
      }

      // ---- DX: fill-shaper helper ----
      case 'tatamirow': {
        // tatamirow(spacing, len) ≡ [spacing, len, 0.5]  (standard brick offset)
        // tatamirow(spacing, len, phase) ≡ [spacing, len, phase]
        const spacing = sc(0),
          len = sc(1);
        const phase = args.length >= 3 ? sc(2) : 0.5;
        return allocList([spacing, len, phase], line);
      }
    }
    throw new NeedlescriptError(`Unknown function ${name}`, line);
  }

  // ---------- Stitch-history queries (closed-loop generation) ----------
  //
  // Pure, zero-draw, sewing-order reporters over the engine's live coverage
  // grid (m.density), fed in _push. They read accumulated state and let the
  // program branch on it, but consume no RNG and emit nothing, so the stitch
  // stream stays a deterministic function of (seed, source): same seed → same
  // queries → same branches → same design. Point arguments are in the local
  // (turtle) frame like pos()/distance and are mapped through the affine CTM to
  // the hoop grid; returned points are hoop-space fabric facts. Queries see
  // committed (flushed) penetrations only — a buffered satin column isn't
  // visible until it ends (pen-up / trim / mode change), and tie-off locks are
  // excluded (added after analysis), so the numbers match the heatmap exactly.

  function queryFunc(name: string, args: Val[], line: number | undefined): Val {
    m.usedQuery = true;
    // Local → hoop through the affine transform stack (warp is not inverted).
    const hoop = (i: number): [number, number] => {
      const p = gm.toPoint(args[i], name, line);
      return apply(m.ctm, p[0], p[1]);
    };
    const point = (p: [number, number]) => allocList([p[0], p[1]], line);

    switch (name) {
      case 'coverat': {
        const [hx, hy] = hoop(0);
        if (args.length >= 2) {
          const r = num(args[1], 'coverat', line);
          if (!(r >= 0)) throw new NeedlescriptError('coverat radius must be 0 or more', line);
          tickN(Math.max(1, Math.ceil(Math.PI * r * r)), line);
          return m.density.coverAvg(hx, hy, r);
        }
        tick(line);
        return m.density.coverAt(hx, hy);
      }
      case 'countat': {
        const [hx, hy] = hoop(0);
        tick(line);
        return m.density.countAt(hx, hy);
      }
      case 'nearestsewn': {
        const [hx, hy] = hoop(0);
        tickN(8, line);
        const p = m.density.nearestSewn(hx, hy);
        return p ? point(p) : allocList([], line);
      }
      case 'sewnwithin': {
        const [hx, hy] = hoop(0);
        const r = num(args[1], 'sewnwithin', line);
        if (!(r >= 0)) throw new NeedlescriptError('sewnwithin radius must be 0 or more', line);
        const found = m.density.sewnWithin(hx, hy, r);
        tickN(found.length + 4, line);
        return allocList(
          found.map((p) => point(p) as Val),
          line,
        );
      }
      case 'stitchedpoints': {
        const pts = m.density.snapshot();
        if (pts.length > m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `stitchedpoints: ${pts.length.toLocaleString('en-US')} penetrations exceeds the list limit ${m.effectiveLimits.maxListLen.toLocaleString('en-US')}`,
            line,
          );
        tickN(pts.length, line);
        return allocList(
          pts.map((p) => point(p) as Val),
          line,
        );
      }
    }
    throw new NeedlescriptError(`Unknown query ${name}`, line);
  }

  function evalExpr(
    node: ExprNode,
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
  ): Val {
    tick((node as { line?: number }).line);
    switch (node.k) {
      case 'num':
        return node.v;
      case 'str':
        // String literals: check per-string limit only (no allocation budget
        // for literals — they come from source, not from computation).
        if (node.v.length > m.effectiveLimits.maxStringLength)
          throw new NeedlescriptError(
            `String literal is too long (${node.v.length} chars, limit ${m.effectiveLimits.maxStringLength})`,
            node.line,
          );
        return node.v;
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
          throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`, node.line);
        return out;
      }
      case 'index': {
        const obj = evalExpr(node.obj, env, repcount, depth);
        if (typeof obj === 'string') {
          const i = toIndex(
            evalExpr(node.idx, env, repcount, depth),
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
        const i = toIndex(
          evalExpr(node.idx, env, repcount, depth),
          obj.items.length,
          'indexing',
          node.line,
        );
        return obj.items[i];
      }
      case 'callval': {
        const callTarget = evalExpr(node.obj, env, repcount, depth);
        if (typeof callTarget === 'string')
          throw new NeedlescriptError("a string value can't be called like a procedure", node.line);
        throw new NeedlescriptError("a list value can't be called like a procedure", node.line);
      }
      case 'listfunc': {
        const args = node.args.map((a) => evalExpr(a, env, repcount, depth));
        if (GEN_FUNCS[node.name] !== undefined) return genFunc(node.name, args, node.line);
        if (QUERY_FUNCS[node.name] !== undefined) return queryFunc(node.name, args, node.line);
        return listFunc(node.name, args, node.line, depth);
      }
      case 'bin': {
        // and / or short-circuit so guards like  :i > 0 and 10 / :i > 2  are safe
        if (node.op === 'and')
          return truthy(evalExpr(node.left, env, repcount, depth), 'and', undefined) !== 0 &&
            truthy(evalExpr(node.right, env, repcount, depth), 'and', undefined) !== 0
            ? 1
            : 0;
        if (node.op === 'or')
          return truthy(evalExpr(node.left, env, repcount, depth), 'or', undefined) !== 0 ||
            truthy(evalExpr(node.right, env, repcount, depth), 'or', undefined) !== 0
            ? 1
            : 0;
        const av = evalExpr(node.left, env, repcount, depth);
        const bv = evalExpr(node.right, env, repcount, depth);
        const lineHint =
          (node.left as { line?: number }).line ?? (node.right as { line?: number }).line;
        // Equality: deep equal handles all types (strings, lists, numbers).
        // Cross-type always returns 0/1 without error — equality is a question.
        if (node.op === '=' || node.op === '!=') {
          if (isList(av) || isList(bv) || typeof av === 'string' || typeof bv === 'string') {
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
        const vals = node.args.map((a) => evalExpr(a, env, repcount, depth));
        return scalarBuiltin(node.name, vals, node.line);
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
      case 'procref':
        return new FuncRef(node.name);

      case 'trace': {
        // ── Trace sandbox (RFC-trace §4) ──────────────────────────────────
        // Snapshot the machine, enter recording mode with a clean coordinate
        // frame, execute the block, restore everything except warnings/RNG/
        // variables, and return the captured path(s).
        const snap = m.snapshotForTrace();
        m.setupTraceSandbox();
        insideTrace++;
        let runs: [number, number][][];
        try {
          execBlock(node.body, env, repcount, depth, node.line);
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
          runs = m.endTrace();
          m.restoreFromTrace(snap);
          insideTrace--;
        }

        if (node.multi) {
          // tracerings: return a list of paths (§4.3), possibly empty
          if (runs.length === 0)
            m.warnings.push('trace captured nothing — no pen-down movement in the block');
          const paths: Val[] = runs.map((run) =>
            allocList(
              run.map(([x, y]) => allocList([x, y], node.line)),
              node.line,
            ),
          );
          return allocList(paths, node.line);
        }
        // trace: exactly one run expected (§4.3)
        if (runs.length === 0) {
          m.warnings.push('trace captured nothing — no pen-down movement in the block');
          return allocList([], node.line);
        }
        if (runs.length > 1)
          throw new NeedlescriptError(
            `trace captured ${runs.length} separate runs — use tracerings to capture all of them`,
            node.line,
          );
        const pts: Val[] = runs[0].map(([x, y]) => allocList([x, y], node.line));
        return allocList(pts, node.line);
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
    if (depth >= m.effectiveLimits.maxCallDepth)
      throw new NeedlescriptError(`Too much recursion in "${name}"`, line);
    const newEnv: Record<string, Val> = Object.create(null);
    proc.params.forEach((p, i) => {
      newEnv[p] = evalExpr(argNodes[i], env, repcount, depth);
    });
    try {
      // Pass the call-site line as contextLine so that machine commands
      // inside the procedure stamp the caller's source line onto stitches
      // rather than their own internal line number within the proc body.
      execBlock(proc.body, newEnv, repcount, depth + 1, line);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof LoopSignal)
        throw new NeedlescriptError(`"${e.kind}" can only be used inside a loop`, e.line);
      throw e;
    }
    return undefined;
  }

  /**
   * Call a procedure with already-evaluated argument values (rather than AST
   * nodes). Used by `warp`/`warppath` to invoke a reporter once per point.
   */
  function callProcVals(
    name: string,
    argVals: Val[],
    depth: number,
    line?: number,
  ): Val | undefined {
    const proc = procs[name];
    if (!proc)
      throw new NeedlescriptError(`Procedure "${name}" is used before it is defined`, line);
    if (depth >= m.effectiveLimits.maxCallDepth)
      throw new NeedlescriptError(`Too much recursion in "${name}"`, line);
    const newEnv: Record<string, Val> = Object.create(null);
    proc.params.forEach((p, i) => {
      newEnv[p] = argVals[i];
    });
    try {
      execBlock(proc.body, newEnv, 0, depth + 1, line);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof LoopSignal)
        throw new NeedlescriptError(`"${e.kind}" can only be used inside a loop`, e.line);
      throw e;
    }
    return undefined;
  }

  // ---------- Built-in function reference dispatch ----------
  //
  // When map/filter/reduce receive a @ref, callRef dispatches it:
  //   1. user proc (shadows builtins)  → callProcVals
  //   2. scalar builtin (sin, cos …)   → scalarBuiltin
  //   3. list/gen/query builtin        → listFunc / genFunc / queryFunc
  //
  // The scalar built-in switch is extracted so evalExpr case 'func' and
  // callRef can share it without duplication.

  /**
   * Evaluate a scalar built-in function (`FUNC_ARITY` / `ZERO_FUNCS` tier)
   * on already-evaluated argument values. Used by both `evalExpr` and `callRef`.
   */
  function scalarBuiltin(name: string, argVals: Val[], line?: number): Val {
    if (name === 'not') return truthy(argVals[0], 'not', line) === 0 ? 1 : 0;
    const args = argVals.map((a) => num(a, name, line));
    switch (name) {
      case 'random':
        return rng() * args[0];
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
      case 'mod':
        return ((args[0] % args[1]) + args[1]) % args[1];
      case 'atan':
        return ((Math.atan2(args[0], args[1]) * 180) / Math.PI + 360) % 360;
      case 'noise':
        return noise(args[0]);
      case 'noise2':
        return noise(args[0], args[1]);
      case 'distance':
        return Math.hypot(args[0] - m.x, args[1] - m.y);
      case 'towards':
        return ((Math.atan2(args[0] - m.x, args[1] - m.y) * 180) / Math.PI + 360) % 360;
      // Zero-arg reporters
      case 'xcor':
        return m.x;
      case 'ycor':
        return m.y;
      case 'heading':
        return m.heading;
    }
    throw new NeedlescriptError(`Unknown function ${name}`, line);
  }

  /**
   * Invoke a function reference (user proc or built-in) with the given
   * argument values. Used by map, filter, reduce, and any future HOFs.
   */
  function callRef(ref: FuncRef, argVals: Val[], depth: number, line?: number): Val {
    // 0. Composed reference — pipe through each step left-to-right
    if (ref instanceof ComposedRef) {
      let result = callRef(ref.steps[0], argVals, depth, line);
      for (let i = 1; i < ref.steps.length; i++) {
        tick(line);
        result = callRef(ref.steps[i], [result], depth, line);
      }
      return result;
    }
    // 1. User-defined proc takes priority (can shadow builtins)
    if (procs[ref.name]) {
      const result = callProcVals(ref.name, argVals, depth, line);
      if (result === undefined)
        throw new NeedlescriptError(
          `"${ref.name}" must return a value when used as a callback`,
          line,
        );
      return result;
    }
    // 2. Scalar builtins (FUNC_ARITY + ZERO_FUNCS)
    if (FUNC_ARITY[ref.name] !== undefined || ZERO_FUNCS.has(ref.name))
      return scalarBuiltin(ref.name, argVals, line);
    // 3. List / Gen / Query / String builtins
    if (LIST_FUNCS[ref.name] !== undefined) return listFunc(ref.name, argVals, line);
    if (GEN_FUNCS[ref.name] !== undefined) return genFunc(ref.name, argVals, line);
    if (QUERY_FUNCS[ref.name] !== undefined) return queryFunc(ref.name, argVals, line);
    if (STRING_FUNCS[ref.name] !== undefined) return stringFunc(ref.name, argVals, line);

    throw new NeedlescriptError(`Unknown function "${ref.name}" in @${ref.name} reference`, line);
  }

  /**
   * Invoke a `@name` reporter on a point, returning the mapped point. This is
   * the one piece of effect machinery that runs user code per emitted vertex:
   * it enforces the reporter contract (exactly one argument, returns a point)
   * with errors that name exactly what went wrong.
   */
  function applyReporter(ref: FuncRef, x: number, y: number, line?: number): Pt {
    const proc = procs[ref.name];
    if (!proc) throw new NeedlescriptError(`the warp reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 1)
      throw new NeedlescriptError(
        `the warp reporter @${ref.name} must take exactly one argument (the point [x, y]), but takes ${proc.params.length}`,
        line,
      );
    const out = callProcVals(ref.name, [allocList([x, y], line)], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the warp reporter @${ref.name} never reached output/return — it must return a point [x, y]`,
        line,
      );
    return gm.toPoint(out, `the warp reporter @${ref.name}`, line);
  }

  /**
   * Invoke a `@name` shape reporter for one satin pair, returning the validated
   * 5-number contract `[advance, leftw, rightw, leftlag, rightlag]`. Mirrors
   * `applyReporter`'s posture: every contract violation (wrong arity, no
   * return, non-list, wrong length, non-number slot) is a loud, line-numbered
   * error that names exactly what is wrong. Inputs are spine-local (§3.2).
   */
  /**
   * Eager half of the shape-reporter contract: the reporter exists and takes
   * exactly 4 parameters. Run at the `satin @fn` engage site so a malformed
   * signature is reported there; the return-value half is checked per call.
   */
  function applyShapeReporterArity(ref: FuncRef, line?: number) {
    const proc = procs[ref.name];
    if (!proc) throw new NeedlescriptError(`the satin reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must take exactly 4 parameters (t, s, i, u), but takes ${proc.params.length}`,
        line,
      );
  }

  function applyShapeReporter(
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    u: number,
    line?: number,
  ): [number, number, number, number, number] {
    const proc = procs[ref.name];
    if (!proc) throw new NeedlescriptError(`the satin reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must take exactly 4 parameters (t, s, i, u), but takes ${proc.params.length}`,
        line,
      );
    const out = callProcVals(ref.name, [t, s, i, u], 0, line);
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
  }

  // ---- Programmable stitchlen reporter (`stitchlen @fn`, §5) ----------
  //
  // Same two-phase posture as satin: eager arity check at the engage site,
  // then a per-stitch return-value check. The reporter takes (t, s, i, p) and
  // returns a single number (the advance in mm). Inputs are: t = arc-length from
  // stretch start (mm), s = normalised 0..1, i = stitch index, p = hoop-space [x, y].
  // The reporter runs with identity CTM (set by _splitBufferedStretch) so that
  // coverat(p) calls inside it treat p as hoop-space.

  function applyStitchLenReporterArity(ref: FuncRef, line?: number) {
    const proc = procs[ref.name];
    if (!proc)
      throw new NeedlescriptError(`the stitchlen reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the stitchlen reporter @${ref.name} must take exactly 4 parameters (t, s, i, p), but takes ${proc.params.length}`,
        line,
      );
  }

  /** Invoke a stitchlen reporter once; validates and returns the advance (mm). */
  function applyStitchLenReporter(
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    p: [number, number],
    line?: number,
  ): number {
    const proc = procs[ref.name];
    if (!proc)
      throw new NeedlescriptError(`the stitchlen reporter @${ref.name} is not defined`, line);
    const out = callProcVals(ref.name, [t, s, i, allocList([p[0], p[1]], line)], 0, line);
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
  }

  // ---- Programmable fill rows — stitchlen equivalent (`filllen @fn`) ----------

  function applyFillLenReporterArity(ref: FuncRef, line?: number) {
    const proc = procs[ref.name];
    if (!proc)
      throw new NeedlescriptError(`the filllen reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the filllen reporter @${ref.name} must take exactly 4 parameters (t, s, i, p), but takes ${proc.params.length}`,
        line,
      );
  }

  /** Invoke a filllen reporter once; validates and returns the requested advance (mm). */
  function applyFillLenReporter(
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    p: [number, number],
    line?: number,
  ): number {
    const proc = procs[ref.name];
    if (!proc)
      throw new NeedlescriptError(`the filllen reporter @${ref.name} is not defined`, line);
    const out = callProcVals(ref.name, [t, s, i, allocList([p[0], p[1]], line)], 0, line);
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
  }

  // ---- Programmable fill reporters (`fill dir @d shape @s`, §3) ----------
  // Same two-phase posture as satin: an eager arity check at the arming site,
  // then a per-sample return-value check. Every violation is a loud,
  // line-numbered error naming the offending channel. Inputs are LOCAL-space.

  function applyFillDirArity(name: string, line?: number) {
    const proc = procs[name];
    if (!proc) throw new NeedlescriptError(`the fill dir reporter @${name} is not defined`, line);
    if (proc.params.length !== 1)
      throw new NeedlescriptError(
        `the fill dir reporter @${name} must take exactly 1 parameter (the point [x, y]), but takes ${proc.params.length}`,
        line,
      );
  }

  /** Invoke a dir reporter; returns a turtle heading. Non-finite ⇒ NaN (a field
   * singularity the generator handles per §5.2), not an error. */
  function applyFillDir(name: string, px: number, py: number, line?: number): number {
    const out = callProcVals(name, [allocList([px, py], line)], 0, line);
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
  }

  function applyFillShapeArity(name: string, line?: number) {
    const proc = procs[name];
    if (!proc) throw new NeedlescriptError(`the fill shape reporter @${name} is not defined`, line);
    if (proc.params.length !== 3)
      throw new NeedlescriptError(
        `the fill shape reporter @${name} must take exactly 3 parameters (p, row, v), but takes ${proc.params.length}`,
        line,
      );
  }

  /** Invoke a shape reporter; returns the validated [spacing, len, phase]. */
  function applyFillShape(
    name: string,
    px: number,
    py: number,
    row: number,
    v: number,
    line?: number,
  ): [number, number, number] {
    const out = callProcVals(name, [allocList([px, py], line), row, v], 0, line);
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
  }

  /** Clamp humanize jitter to a sane embroidery range (0–2 mm), warning if out. */
  function clampHumanize(amount: number): number {
    const v = Math.min(Math.max(amount, 0), 2);
    if (v !== amount)
      m.warnings.push(`humanize ${formatNum(amount)} clamped to ${formatNum(v)} mm (range 0–2)`);
    return v;
  }

  /** Clamp declump maxshift to the allowed physical range (0–5 mm), warning if out. */
  function clampMaxshift(amount: number): number {
    const v = Math.min(Math.max(amount, 0), MAXSHIFT_MAX);
    if (v !== amount)
      m.warnings.push(
        `declump maxshift ${formatNum(amount)} clamped to ${formatNum(v)} mm (range 0–${MAXSHIFT_MAX})`,
      );
    return v;
  }

  function execBlock(
    stmts: ASTNode[],
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
    contextLine?: number,
  ) {
    for (const st of stmts) execStmt(st, env, repcount, depth, contextLine);
  }

  /**
   * Run one loop iteration, absorbing loop-control signals (RFC-4).
   * Returns false if the loop should stop (`break`), true otherwise
   * (`continue` simply ends the iteration early).
   */
  function runLoopBody(
    body: ASTNode[],
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
    contextLine?: number,
  ): boolean {
    try {
      execBlock(body, env, repcount, depth, contextLine);
    } catch (e) {
      if (e instanceof LoopSignal) return e.kind !== 'break';
      throw e;
    }
    return true;
  }

  function execStmt(
    st: ASTNode,
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
    contextLine?: number,
  ) {
    tick(st.line);
    switch (st.k) {
      case 'to':
        procs[st.name] = st;
        return;
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
        st.names.forEach((n, i) => {
          scope[n] = v.items[i];
        });
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
          const i = toIndex(
            evalExpr(st.indices[k], env, repcount, depth),
            target.items.length,
            'indexing',
            st.line,
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
        if (n > m.effectiveLimits.maxLoopIters)
          throw new NeedlescriptError(
            `repeat count too large (${n.toLocaleString('en-US')}, limit ${m.effectiveLimits.maxLoopIters.toLocaleString('en-US')})`,
            st.line,
          );
        structuralDepth++;
        for (let i = 1; i <= n; i++) if (!runLoopBody(st.body, env, i, depth, contextLine)) break;
        structuralDepth--;
        return;
      }
      case 'while': {
        structuralDepth++;
        while (truthy(evalExpr(st.cond, env, repcount, depth), 'while', st.line) !== 0) {
          tick(st.line); // ops budget catches endless loops
          if (!runLoopBody(st.body, env, repcount, depth, contextLine)) break;
        }
        structuralDepth--;
        return;
      }
      case 'for': {
        const from = num(evalExpr(st.from, env, repcount, depth), 'for', st.line);
        const to = num(evalExpr(st.to, env, repcount, depth), 'for', st.line);
        const step = num(evalExpr(st.step, env, repcount, depth), 'for', st.line);
        if (step === 0) throw new NeedlescriptError('for step can\u2019t be 0', st.line);
        if ((to - from) / step > m.effectiveLimits.maxLoopIters)
          throw new NeedlescriptError(
            `for runs too many times (over ${m.effectiveLimits.maxLoopIters.toLocaleString('en-US')})`,
            st.line,
          );
        const scope = env ?? globals;
        const had = st.varName in scope;
        const prev = scope[st.varName];
        structuralDepth++;
        for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) {
          tick(st.line);
          scope[st.varName] = v;
          if (!runLoopBody(st.body, env, repcount, depth, contextLine)) break;
        }
        structuralDepth--;
        if (had) scope[st.varName] = prev;
        else delete scope[st.varName];
        return;
      }
      case 'forin': {
        // for x in xs — iterates list elements or string characters.
        // Loop variable doesn't leak.
        const v = evalExpr(st.list, env, repcount, depth);
        if (typeof v === 'string') {
          // String iteration: each character is a 1-char string.
          const scope = env ?? globals;
          const had = st.varName in scope;
          const prev = scope[st.varName];
          structuralDepth++;
          for (const ch of v) {
            tick(st.line);
            scope[st.varName] = ch;
            if (!runLoopBody(st.body, env, repcount, depth, contextLine)) break;
          }
          structuralDepth--;
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
        const scope = env ?? globals;
        const had = st.varName in scope;
        const prev = scope[st.varName];
        structuralDepth++;
        for (let i = 0; i < n; i++) {
          tick(st.line);
          scope[st.varName] = v.items[i];
          if (!runLoopBody(st.body, env, repcount, depth, contextLine)) break;
        }
        structuralDepth--;
        if (had) scope[st.varName] = prev;
        else delete scope[st.varName];
        return;
      }
      case 'if': {
        structuralDepth++;
        if (truthy(evalExpr(st.cond, env, repcount, depth), 'if', st.line) !== 0)
          execBlock(st.body, env, repcount, depth, contextLine);
        else if (st.elseBody) execBlock(st.elseBody, env, repcount, depth, contextLine);
        structuralDepth--;
        return;
      }
      case 'transform': {
        // Build the delta matrix from the args, compose it onto the CTM for
        // the duration of the block, then restore. flushSatin on both edges
        // guarantees a satin column is sewn entirely under one matrix. The
        // turtle (x/y/heading) is untouched — only emitted geometry is mapped.
        const a = st.args.map((x) => num(evalExpr(x, env, repcount, depth), st.name, st.line));
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
        m.currentLine = contextLine ?? st.line;
        m.flushSatin();
        m.pushTransform(delta);
        structuralDepth++;
        try {
          execBlock(st.body, env, repcount, depth, contextLine);
        } finally {
          structuralDepth--;
          m.flushSatin();
          m.popOut();
        }
        return;
      }
      case 'effect': {
        // Effects share the transform discipline: flush satin on both edges so
        // a column lives under one map, push the map for the block, restore on
        // exit. `warp` is a pre-split, post-CTM point map (it deforms the
        // emitted path like a transform); `humanize`/`snaptogrid` are
        // after-split penetration maps (effects §).
        m.currentLine = contextLine ?? st.line;
        m.flushSatin();
        if (st.name === 'warp') {
          const refVal = evalExpr(st.args[0], env, repcount, depth);
          if (!isFuncRef(refVal))
            throw new NeedlescriptError(
              'warp needs a procedure reference, e.g.  warp @push_out [ … ]',
              st.line,
            );
          const ref = refVal;
          m.pushWarp((x, y) => applyReporter(ref, x, y, st.line));
          structuralDepth++;
          try {
            execBlock(st.body, env, repcount, depth, contextLine);
          } finally {
            structuralDepth--;
            m.flushSatin();
            m.popOut();
          }
          return;
        }
        const a = st.args.map((x) => num(evalExpr(x, env, repcount, depth), st.name, st.line));

        if (st.name === 'declump') {
          // declump: stateful along-axis crowd-relief fold. Drawless (zero
          // RNG draws), so inserting/removing the block never reshuffles
          // downstream randomness (§6 determinism contract). Inert inside
          // trace (the sandbox has no committed history).
          traceNote(
            'declump',
            'note: declump inside trace is inert — use declumppath(...) on the result instead',
          );
          const limit = Math.max(0, a[0]);
          const maxshift = a.length >= 2 ? clampMaxshift(a[1]) : 1.5;
          const state = makeDeclumpState(limit, maxshift);
          m.pushDeclump(state);
          structuralDepth++;
          try {
            execBlock(st.body, env, repcount, depth, contextLine);
          } finally {
            structuralDepth--;
            m.flushSatin();
            m.popDeclump();
            // Saturation note: summarise points that had no along-axis relief (§7).
            if (state.saturationCount > 0)
              m.warnings.push(
                `declump: ${state.saturationCount} penetration${state.saturationCount === 1 ? '' : 's'} stayed in saturated areas (no along-axis relief within maxshift)`,
              );
          }
          return;
        }

        let fn: (x: number, y: number) => [number, number];
        if (st.name === 'humanize') {
          traceNote(
            'humanize',
            'note: humanize inside trace has no effect on the captured path — use humanizepath(...) on the result',
          );
          const amount = clampHumanize(a[0]);
          // One main-stream draw seeds the coherent field (fork convention §7):
          // dropping a humanize block shifts downstream randomness by exactly
          // one draw, never by however many stitches were inside.
          const childSeed = Math.floor(rng() * 4294967296);
          fn = humanizeMap(amount, childSeed, snoise2);
        } else {
          // snaptogrid — pure, drawless, fixed hoop-space lattice
          traceNote(
            'snaptogrid',
            'note: snaptogrid inside trace has no effect on the captured path — use snappath(...) on the result',
          );
          fn = snapMapFromSpec(a, (msg) => new NeedlescriptError(`snaptogrid ${msg}`, st.line));
        }
        m.pushPen(fn);
        structuralDepth++;
        try {
          execBlock(st.body, env, repcount, depth, contextLine);
        } finally {
          structuralDepth--;
          m.flushSatin();
          m.popPen();
        }
        return;
      }
      case 'output': {
        if (depth === 0)
          throw new NeedlescriptError(
            `"${st.value ? 'output' : 'exit'}" can only be used inside a procedure`,
            st.line,
          );
        throw new ReturnSignal(st.value ? evalExpr(st.value, env, repcount, depth) : undefined);
      }
      // Loop control (RFC-4): unwinds to the innermost enclosing loop.
      // The parser guarantees one exists in the same procedure body.
      case 'break':
        throw new LoopSignal('break', st.line);
      case 'continue':
        throw new LoopSignal('continue', st.line);
      case 'call': {
        callProc(st.name, st.args, env, repcount, depth, contextLine ?? st.line);
        return;
      }
      case 'fillarm': {
        m.currentLine = contextLine ?? st.line;
        // Arm programmable fill for the next beginfill…endfill (§2). Validate
        // each channel's reporter arity eagerly so a malformed signature is
        // caught here, at the arming site, not deep in the generator.
        if (m.recording)
          throw new NeedlescriptError(
            'fill armed while a beginfill is open — close it with endfill before arming a new fill',
            st.line,
          );
        if (st.dirRef) {
          applyFillDirArity(st.dirRef, st.line);
          const ref = st.dirRef;
          m.fillDirReporter = (px, py) => applyFillDir(ref, px, py, st.line);
        } else {
          m.fillDirReporter = null;
        }
        if (st.shapeRef) {
          applyFillShapeArity(st.shapeRef, st.line);
          const ref = st.shapeRef;
          m.fillShapeReporter = (px, py, row, v) => applyFillShape(ref, px, py, row, v, st.line);
        } else {
          m.fillShapeReporter = null;
        }
        m.fillArmed = true;
        // One-time note when a channel supersedes a non-default numeric setting (§2).
        if (m.fillDirReporter && m.fillAngle !== 0)
          m.warnings.push(
            `fillangle is ignored while fill dir @${st.dirRef} is engaged — the direction field supersedes it`,
          );
        if (m.fillShapeReporter && (m.fillSpacing !== 0.4 || m.fillLen !== null))
          m.warnings.push(
            `fillspacing/filllen are ignored while fill shape @${st.shapeRef} is engaged — the shape reporter supersedes them`,
          );
        return;
      }
      case 'listcmd': {
        m.currentLine = contextLine ?? st.line;
        const a = st.args.map((x) => evalExpr(x, env, repcount, depth));
        switch (st.name) {
          case 'append':
          case 'prepend': {
            if (typeof a[0] === 'string')
              throw new NeedlescriptError(
                `strings are immutable — "${st.name}" needs a list; use concat(a, b) to build longer strings`,
                st.line,
              );
            const xs = list(a[0], st.name, st.line);
            if (xs.items.length + 1 > m.effectiveLimits.maxListLen)
              throw new NeedlescriptError(
                `List too long (limit ${m.effectiveLimits.maxListLen.toLocaleString('en-US')} elements)`,
                st.line,
              );
            checkDepth(a[1], st.line);
            charge(1, st.line);
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
            const xs = list(a[0], 'insertat', st.line);
            if (xs.items.length + 1 > m.effectiveLimits.maxListLen)
              throw new NeedlescriptError(
                `List too long (limit ${m.effectiveLimits.maxListLen.toLocaleString('en-US')} elements)`,
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
          case 'sewpath': {
            // ≡ for p in path [ setpos(p) ] — pen state, stitch mode, satin
            // and auto-split all apply exactly as if hand-walked (§4.4).
            const pts = gm.toPath(a[0], 'sewpath', st.line);
            tickN(pts.length, st.line);
            for (const [x, y] of pts) m.setXY(x, y);
            return;
          }
        }
        throw new NeedlescriptError(`Unhandled command ${st.name}`, st.line);
      }
      case 'cmd': {
        m.currentLine = contextLine ?? st.line;

        // assert: evaluate condition first; message only on failure (lazy).
        if (st.name === 'assert') {
          const condVal = evalExpr(st.args[0], env, repcount, depth);
          if (truthy(condVal, 'assert', st.line) === 0) {
            let msg = 'assertion failed';
            if (st.args.length === 2) {
              const msgVal = evalExpr(st.args[1], env, repcount, depth);
              const msgStr = typeof msgVal === 'string' ? msgVal : formatVal(msgVal);
              msg = `assertion failed: ${msgStr}`;
            }
            throw new NeedlescriptError(msg, st.line);
          }
          return;
        }

        const vals = st.args.map((x) => evalExpr(x, env, repcount, depth));

        if (st.name === 'print') {
          // Multi-arg call form: print(v1, v2, …) — concatenate renderings.
          // Classic form: print expr or print "label expr — single arg.
          const renderVal = (v: Val) => (isString(v) ? v : formatVal(v));
          if (st.args.length > 1) {
            // Variadic call form — no label, just concatenate
            printed.push(vals.map(renderVal).join(''));
          } else {
            printed.push((st.label ? st.label + ': ' : '') + renderVal(vals[0]));
          }
          return;
        }
        if (st.name === 'printloc') {
          // DX: printloc — logs local-frame needle position, like pos() formatted.
          // Reports m.x / m.y (local turtle coordinates, same as pos()).
          printed.push((st.label ?? 'loc') + ': [' + formatNum(m.x) + ', ' + formatNum(m.y) + ']');
          return;
        }
        // `satin @fn` — engage programmable satin: a user shape reporter
        // supersedes the built-in generator (§2/§3). Same mode switch as the
        // numeric form; it begins buffering a column and flushes on the usual
        // triggers. The reporter is queried once per stitch pair at flush time.
        if (st.name === 'satin' && isFuncRef(vals[0])) {
          traceNote('satin', 'note: satin inside trace has no effect on the captured path');
          const ref = vals[0];
          // Validate the contract eagerly so a malformed reporter is caught at
          // the engage site, even before the column has any geometry.
          applyShapeReporterArity(ref, st.line);
          m.flushSatin();
          m.satinReporter = (t, s, i, u) => applyShapeReporter(ref, t, s, i, u, st.line);
          m.mode = 'satin';
          // The numeric `density` command is ignored while a reporter is
          // engaged (advance supersedes it) — note it once if one was set.
          if (m.satinSpacing !== 0.4 && !m.satinDensityNoted) {
            m.warnings.push(
              `density is ignored while satin @${ref.name} is engaged — the reporter's advance return controls penetration spacing`,
            );
            m.satinDensityNoted = true;
          }
          return;
        }
        // `stitchlen [list]` — list-cycling form (§4). Optional second arg is the
        // phase offset (start index).
        // `stitchlen @fn` — reporter form (§5). Buffered: travel() accumulates
        // the spine and flushRunningStitch() splits it at stretch end.
        if (st.name === 'stitchlen' && (isFuncRef(vals[0]) || isList(vals[0]))) {
          traceNote('stitchlen', 'note: stitchlen inside trace has no effect on the captured path');
          m.flushSatin(); // flushes running-stitch buffer too
          if (isFuncRef(vals[0])) {
            // Reporter form
            const ref = vals[0];
            applyStitchLenReporterArity(ref, st.line);
            m.stitchLenList = null;
            m.stitchLenListPhase = 0;
            m.stitchLenReporter = (t, s, i, p) => applyStitchLenReporter(ref, t, s, i, p, st.line);
          } else {
            // List form — validate elements
            const raw = vals[0];
            if (raw.items.length === 0)
              throw new NeedlescriptError('stitchlen list must not be empty', st.line);
            const clamped: number[] = raw.items.map((el, idx) => {
              if (typeof el !== 'number' || isList(el))
                throw new NeedlescriptError(
                  `stitchlen list element ${idx} must be a number, got ${describeVal(el)}`,
                  st.line,
                );
              const v = el as number;
              if (v < LIMITS.minStitch || v > LIMITS.maxStitch)
                m.warnings.push(
                  `stitchlen list element ${idx} (${v}) clamped to ${Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch)} mm`,
                );
              return Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch);
            });
            const phase = vals.length > 1 ? Math.round(num(vals[1], 'stitchlen', st.line)) : 0;
            m.stitchLenReporter = null;
            m.stitchLenList = clamped; // snapshot at command time
            m.stitchLenListPhase = ((phase % clamped.length) + clamped.length) % clamped.length;
          }
          m.stitchLenStretchStart = true;
          m.stitchLenStretchIndex = 0;
          return;
        }
        // `filllen [list]` / `filllen @fn` — list-cycling and reporter forms.
        if (st.name === 'filllen' && (isFuncRef(vals[0]) || isList(vals[0]))) {
          traceNote('filllen', 'note: filllen inside trace has no effect on the captured path');
          if (isFuncRef(vals[0])) {
            const ref = vals[0];
            applyFillLenReporterArity(ref, st.line);
            m.fillLenList = null;
            m.fillLenListPhase = 0;
            m.fillLen = null; // disengage numeric form
            m.fillLenReporter = (t, s, i, p) => applyFillLenReporter(ref, t, s, i, p, st.line);
          } else {
            const raw = vals[0];
            if (raw.items.length === 0)
              throw new NeedlescriptError('filllen list must not be empty', st.line);
            const FILL_MIN = 1,
              FILL_MAX = 7;
            const clamped: number[] = raw.items.map((el, idx) => {
              if (typeof el !== 'number' || isList(el))
                throw new NeedlescriptError(
                  `filllen list element ${idx} must be a number, got ${describeVal(el)}`,
                  st.line,
                );
              const v = el as number;
              if (v < FILL_MIN || v > FILL_MAX)
                m.warnings.push(
                  `filllen list element ${idx} (${v}) clamped to ${Math.min(Math.max(v, FILL_MIN), FILL_MAX)} mm`,
                );
              return Math.min(Math.max(v, FILL_MIN), FILL_MAX);
            });
            const phase = vals.length > 1 ? Math.round(num(vals[1], 'filllen', st.line)) : 0;
            m.fillLenReporter = null;
            m.fillLen = null; // disengage numeric form
            m.fillLenList = clamped;
            m.fillLenListPhase = ((phase % clamped.length) + clamped.length) % clamped.length;
          }
          return;
        }
        // String-argument mode commands — handled before the bulk num() conversion.
        if (st.name === 'fabric' || st.name === 'underlay' || st.name === 'fillunderlay') {
          traceNote(st.name, `note: ${st.name} inside trace has no effect on the captured path`);
          const modeVal = vals[0];
          if (typeof modeVal !== 'string')
            throw new NeedlescriptError(
              `${st.name} expects a string mode, got ${describeVal(modeVal)} — e.g. ${st.name} '${QWORD_BUILTINS[st.name][0]}'`,
              st.line,
            );
          const mode = modeVal.toLowerCase();
          const allowed = QWORD_BUILTINS[st.name];
          if (!allowed.includes(mode))
            throw new NeedlescriptError(
              `Unknown ${st.name} '${mode}'${didYouMean(mode, allowed)} — expected ${allowed.map((w) => `'${w}'`).join(', ')}`,
              st.line,
            );
          if (st.name === 'underlay') {
            m.underlayMode = mode as typeof m.underlayMode;
          } else if (st.name === 'fillunderlay') {
            m.fillUnderlayMode = mode as typeof m.fillUnderlayMode;
          } else {
            // fabric
            const f = FABRICS[mode];
            m.pullComp = f.pull;
            m.underlayMode = 'auto';
            m.fillUnderlayMode = 'auto';
            m.maxDensity = f.maxDensity;
            m.doubleUnderlay = !!f.doubleUnderlay;
            if (f.densityFloor && m.satinSpacing < f.densityFloor) m.satinSpacing = f.densityFloor;
            if (f.note && !m.warnings.includes(f.note)) m.warnings.push(f.note);
          }
          return;
        }
        // ---------- hoop — configure the sewable field (§hoop) ----------
        if (st.name === 'hoop') {
          // Placement guards: top-level only, before any stitch, at most once.
          const directiveGuard = (cmdName: string) => {
            if (insideTrace > 0)
              throw new NeedlescriptError(
                `${cmdName} and override are program directives — add them to the top of the editor and re-run`,
                st.line,
              );
            if (structuralDepth > 0 || depth > 0)
              throw new NeedlescriptError(
                `${cmdName} must be at the top level — not inside a loop, if branch, or procedure; put it on line 1`,
                st.line,
              );
            if (m.started)
              throw new NeedlescriptError(
                `${cmdName} must run before the first stitch — ${m.events.filter((e) => e.t === 'stitch').length.toLocaleString('en-US')} stitch${m.events.filter((e) => e.t === 'stitch').length === 1 ? '' : 'es'} already sewn; move it to the top of the program`,
                st.line,
              );
          };
          directiveGuard('hoop');
          if (m.hoopSet)
            throw new NeedlescriptError(
              `hoop already set${m.hoopSetLine !== undefined ? ` on line ${m.hoopSetLine}` : ''} — only one hoop directive is allowed per program`,
              st.line,
            );
          if (m.fieldLocked)
            throw new NeedlescriptError(
              `hoop must be set before scatter/voronoi/relax uses the field — a generator already ran with the default field; move hoop to line 1`,
              st.line,
            );

          // Parse the argument: string (preset), number (round), or list [w, h] (rect).
          const arg = vals[0];
          let info: HoopInfo;
          if (typeof arg === 'string') {
            const preset = lookupHoopPreset(arg);
            if (!preset) {
              const allNames = Array.from(HOOP_PRESET_NAMES);
              throw new NeedlescriptError(
                `Unknown hoop preset '${arg}'${didYouMean(arg.toLowerCase(), allNames)} — known presets: ${allNames.map((n) => `'${n}'`).join(', ')}. Or: hoop <diameter mm>  or  hoop [width, height]`,
                st.line,
              );
            }
            info = preset;
          } else if (typeof arg === 'number') {
            if (arg < 20 || arg > 400)
              throw new NeedlescriptError(
                `hoop ${formatNum(arg)} — diameter out of range (must be 20–400 mm)`,
                st.line,
              );
            info = buildHoopInfo(arg, arg, 'circle');
          } else if (isList(arg) && arg.items.length === 2) {
            const w = num(arg.items[0], 'hoop', st.line);
            const h = num(arg.items[1], 'hoop', st.line);
            if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0)
              throw new NeedlescriptError(
                `hoop [${formatNum(w)}, ${formatNum(h)}] — each dimension must be a positive finite number`,
                st.line,
              );
            if (w < 20 || w > 400 || h < 20 || h > 400)
              throw new NeedlescriptError(
                `hoop [${formatNum(w)}, ${formatNum(h)}] — each dimension must be 20–400 mm`,
                st.line,
              );
            info = buildHoopInfo(w, h, 'rectangle');
          } else {
            throw new NeedlescriptError(
              `hoop expects a preset name (e.g. hoop '5x7'), a diameter (e.g. hoop 130), or [width, height] (e.g. hoop [130, 180])`,
              st.line,
            );
          }

          m.hoopInfo = info;
          m.hoopSet = true;
          m.hoopSetLine = st.line;
          return;
        }

        // ---------- override — raise or lower a run-envelope budget (§override) ----------
        if (st.name === 'override') {
          // Placement guards (same as hoop).
          if (insideTrace > 0)
            throw new NeedlescriptError(
              `hoop and override are program directives — add them to the top of the editor and re-run`,
              st.line,
            );
          if (structuralDepth > 0 || depth > 0)
            throw new NeedlescriptError(
              `override must be at the top level — not inside a loop, if branch, or procedure; put it near the top of the program`,
              st.line,
            );
          if (m.started)
            throw new NeedlescriptError(
              `override must run before the first stitch; move it to the top of the program`,
              st.line,
            );

          const keyVal = vals[0];
          if (typeof keyVal !== 'string')
            throw new NeedlescriptError(
              `override: first argument must be a limit name string, e.g. override 'stitches' 120000`,
              st.line,
            );
          const keyStr = keyVal.toLowerCase() as OverrideKey;

          // Map OverrideKey → BudgetKey
          const KEY_MAP: Record<OverrideKey, BudgetKey> = {
            stitches: 'maxStitches',
            ops: 'maxOps',
            calldepth: 'maxCallDepth',
            loopiters: 'maxLoopIters',
            listlen: 'maxListLen',
            listcells: 'maxListCells',
            stringlen: 'maxStringLength',
            stringtotal: 'maxStringChars',
            scatterpoints: 'maxScatterPoints',
            geoinput: 'maxDelaunayPoints',
            clipverts: 'maxClipVerts',
          };
          // Explanatory message for non-overridable physics/format keys.
          const PHYSICS_KEYS: Record<string, string> = {
            stitchlen: 'stitch length bounds protect the machine and fabric',
            minstitch: 'stitch length bounds protect the machine and fabric',
            maxstitch: 'stitch length bounds protect the machine and fabric',
          };

          if (keyStr in PHYSICS_KEYS) {
            throw new NeedlescriptError(
              `override '${keyStr}' — ${PHYSICS_KEYS[keyStr]}; they are not a computational budget and cannot be changed`,
              st.line,
            );
          }

          const budgetKey = KEY_MAP[keyStr];
          if (!budgetKey) {
            const allKeys = Object.keys(KEY_MAP);
            throw new NeedlescriptError(
              `override: unknown limit '${keyStr}'${didYouMean(keyStr, allKeys)} — valid keys: ${allKeys.map((k) => `'${k}'`).join(', ')}`,
              st.line,
            );
          }

          if (m.activeOverrides.has(keyStr))
            throw new NeedlescriptError(
              `'${keyStr}' already overridden on line ${m.activeOverrides.get(keyStr)!.line}`,
              st.line,
            );

          const rawValue = num(vals[1], 'override', st.line);
          const value = Math.floor(rawValue); // non-integers are floored silently
          const floor = OVERRIDE_FLOORS[budgetKey];
          const ceiling = OVERRIDE_CEILINGS[budgetKey];

          if (value < floor || value > ceiling)
            throw new NeedlescriptError(
              `override '${keyStr}' ${value.toLocaleString('en-US')} — out of range (${floor.toLocaleString('en-US')}–${ceiling.toLocaleString('en-US')}; stock is ${STOCK_LIMITS[budgetKey].toLocaleString('en-US')})`,
              st.line,
            );

          m.effectiveLimits[budgetKey] = value;
          m.activeOverrides.set(keyStr, { value, line: st.line });

          // Emit a note if lowering, a warning if raising.
          const stock = STOCK_LIMITS[budgetKey];
          if (value < stock) {
            m.warnings.push(
              `note: override '${keyStr}' set to ${value.toLocaleString('en-US')} (below stock ${stock.toLocaleString('en-US')}). Hitting it will produce: ${keyStr} budget reached — ${value.toLocaleString('en-US')} (lowered by override; stock is ${stock.toLocaleString('en-US')})`,
            );
          }
          // Warnings for raises are emitted at end-of-run (so the console shows them every run).
          return;
        }
        if (st.name === 'mark') {
          traceNote(
            'mark',
            'note: mark inside trace has no effect — pins mark sewn positions; nothing is sewn',
          );
          if (st.args.length === 1) {
            const labelVal = vals[0];
            if (typeof labelVal !== 'string')
              throw new NeedlescriptError(
                `mark label must be a string, got ${describeVal(labelVal)}`,
                st.line,
              );
            m.markHere(labelVal);
          } else {
            m.markHere();
          }
          return;
        }
        // Every other command is scalar — a string or list argument is a type error
        // naming the command (RFC-2 §2).
        const a = vals.map((v) => num(v, st.name, st.line));
        switch (st.name) {
          case 'fd':
            m.forward(a[0]);
            return;
          case 'bk':
            m.forward(-a[0]);
            return;
          case 'rt':
            m.heading = (m.heading + a[0]) % 360;
            return;
          case 'lt':
            m.heading = (m.heading - a[0]) % 360;
            return;
          case 'up':
            m.flushSatin();
            m.penDown = false;
            return;
          case 'down':
            m.penDown = true;
            return;
          case 'home':
            m.setXY(0, 0);
            m.heading = 0;
            return;
          case 'cs':
            return;
          case 'setxy':
            m.setXY(a[0], a[1]);
            return;
          case 'setx':
            m.setXY(a[0], m.y);
            return;
          case 'sety':
            m.setXY(m.x, a[0]);
            return;
          case 'seth':
            m.heading = a[0] % 360;
            return;
          case 'arc':
            m.arc(a[0], a[1]);
            return;
          // DX: moveto — reposition without sewing, pen state preserved.
          // Equivalent to: save pen → up → setxy → restore pen.
          case 'moveto': {
            const wasDown = m.penDown;
            m.flushSatin();
            m.penDown = false;
            m.setXY(a[0], a[1]);
            m.penDown = wasDown;
            return;
          }
          // DX: gohome — pen-safe return to origin (≡ moveto 0 0).
          // Does NOT reset heading; use seth 0 separately if needed.
          case 'gohome': {
            const wasDown = m.penDown;
            m.flushSatin();
            m.penDown = false;
            m.setXY(0, 0);
            m.penDown = wasDown;
            return;
          }
          // DX: circle r — full closed circle (≡ arc 360 r).
          case 'circle':
            m.arc(360, a[0]);
            return;
          case 'push':
            m.pushState();
            return;
          case 'pop':
            m.popState();
            return;
          case 'stitchlen': {
            traceNote(
              'stitchlen',
              'note: stitchlen inside trace has no effect on the captured path',
            );
            // Numeric form: disengage list/reporter and set plain length.
            m.flushSatin(); // also flushes running-stitch buffer
            m.stitchLenList = null;
            m.stitchLenListPhase = 0;
            m.stitchLenReporter = null;
            const v = a[0];
            if (v < LIMITS.minStitch || v > LIMITS.maxStitch)
              m.warnings.push(
                `stitchlen ${v} clamped to ${Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch)} mm (machine-safe range is ${LIMITS.minStitch}–${LIMITS.maxStitch})`,
              );
            m.stitchLen = Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch);
            return;
          }
          case 'satin': {
            traceNote('satin', 'note: satin inside trace has no effect on the captured path');
            m.flushSatin();
            m.satinReporter = null; // numeric form returns to the built-in generator
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
            traceNote('estitch', 'note: estitch inside trace has no effect on the captured path');
            m.flushSatin();
            m.satinReporter = null; // leaving satin mode disengages the reporter
            const v = Math.max(0, a[0]);
            if (v > 10)
              m.warnings.push(`estitch ${v} mm is very wide — prongs over ~8 mm tend to snag`);
            m.eWidth = v;
            m.mode = v > 0.05 ? 'estitch' : 'run';
            return;
          }
          case 'bean': {
            traceNote('bean', 'note: bean inside trace has no effect on the captured path');
            let n = Math.round(a[0]);
            if (n <= 1) {
              m.beanRepeats = 1;
              return;
            }
            if (n % 2 === 0) {
              n += 1;
              m.warnings.push(`bean must be odd to keep advancing — using ${n}`);
            }
            if (n > 9) {
              n = 9;
              m.warnings.push('bean clamped to 9 passes');
            }
            m.beanRepeats = n;
            return;
          }
          case 'lock': {
            traceNote('lock', 'note: lock inside trace has no effect on the captured path');
            if (a[0] <= 0) {
              m.lockLen = 0;
              return;
            }
            const v = Math.min(Math.max(a[0], 0.3), 1.5);
            if (v !== a[0]) m.warnings.push(`lock ${a[0]} clamped to ${v} mm (safe range 0.3–1.5)`);
            m.lockLen = v;
            return;
          }
          case 'beginfill':
            if (insideTrace > 0)
              throw new NeedlescriptError(
                'a fill cannot run inside trace — capture the boundary and fill it afterward',
                st.line,
              );
            m.beginFill();
            return;
          case 'endfill':
            if (insideTrace > 0)
              throw new NeedlescriptError(
                'a fill cannot run inside trace — capture the boundary and fill it afterward',
                st.line,
              );
            m.endFill();
            return;
          case 'fillangle':
            traceNote(
              'fillangle',
              'note: fillangle inside trace has no effect on the captured path',
            );
            m.fillAngle = a[0];
            return;
          case 'fillspacing': {
            traceNote(
              'fillspacing',
              'note: fillspacing inside trace has no effect on the captured path',
            );
            const v = Math.min(Math.max(a[0], 0.25), 5);
            if (v !== a[0])
              m.warnings.push(`fillspacing ${a[0]} clamped to ${v} mm (safe range 0.25–5)`);
            m.fillSpacing = v;
            return;
          }
          case 'filllen': {
            traceNote('filllen', 'note: filllen inside trace has no effect on the captured path');
            // Numeric form: disengage list/reporter forms.
            m.fillLenList = null;
            m.fillLenListPhase = 0;
            m.fillLenReporter = null;
            if (a[0] <= 0) {
              m.fillLen = null; // 0 = "follow stitchlen"
              return;
            }
            const v = Math.min(Math.max(a[0], 1), 7);
            if (v !== a[0]) m.warnings.push(`filllen ${a[0]} clamped to ${v} mm (safe range 1–7)`);
            m.fillLen = v;
            return;
          }
          case 'density':
            traceNote('density', 'note: density inside trace has no effect on the captured path');
            m.flushSatin();
            m.satinSpacing = Math.min(Math.max(a[0], 0.25), 5);
            return;
          case 'pullcomp': {
            traceNote('pullcomp', 'note: pullcomp inside trace has no effect on the captured path');
            const v = Math.min(Math.max(a[0], 0), 1.5);
            if (v !== a[0])
              m.warnings.push(`pullcomp ${a[0]} clamped to ${v} mm (safe range 0–1.5)`);
            m.pullComp = v;
            return;
          }
          case 'shortstitch':
            traceNote(
              'shortstitch',
              'note: shortstitch inside trace has no effect on the captured path',
            );
            m.shortStitch = a[0] !== 0;
            return;
          case 'autotrim': {
            traceNote('autotrim', 'note: autotrim inside trace has no effect on the captured path');
            if (a[0] <= 0) {
              m.autoTrim = 0;
              return;
            }
            const v = Math.min(Math.max(a[0], 3), 30);
            if (v !== a[0])
              m.warnings.push(`autotrim ${a[0]} clamped to ${v} mm (safe range 3–30, 0 = off)`);
            m.autoTrim = v;
            return;
          }
          case 'maxdensity': {
            traceNote(
              'maxdensity',
              'note: maxdensity inside trace has no effect on the captured path',
            );
            if (a[0] <= 0) {
              m.maxDensity = 0;
              return;
            }
            m.maxDensity = Math.min(Math.max(a[0], 1), 8);
            return;
          }
          case 'color':
            traceNote('color', 'note: color inside trace has no effect on the captured path');
            m.colorChange(a[0]);
            return;
          case 'stop':
            traceNote('stop', 'note: stop inside trace has no effect on the captured path');
            m.colorChange(m.colorIdx + 1);
            return;
          case 'trim':
            traceNote('trim', 'note: trim inside trace has no effect on the captured path');
            m.trimThread();
            return;
          case 'seed': {
            if (insideTrace > 0)
              throw new NeedlescriptError(
                'reseed outside trace — the random stream escapes the sandbox',
                st.line,
              );
            const s = Math.floor(a[0]);
            rng = makeRNG(s);
            noise = makeNoise(s);
            snoise2 = createNoise2D(makeRNG(s));
            snoise3 = createNoise3D(makeRNG(s ^ 0x9e3779b9));
            return;
          }
        }
        throw new NeedlescriptError(`Unhandled command ${st.name}`, st.line);
      }
    }
  }

  try {
    execBlock(program, null, 0, 0);
  } catch (e) {
    // Defensive: parse-time validation makes an escaping loop signal unreachable.
    if (e instanceof LoopSignal)
      throw new NeedlescriptError(`"${e.kind}" can only be used inside a loop`, e.line);
    throw e;
  }

  m.flushSatin();
  const warningLocations: WarningLocation[] = [];
  if (m.recording) {
    m.warnings.push('beginfill was never closed — endfill added at the end of the program');
    m.endFill();
  }
  if (m.tinyDropped > 0) {
    const spots = m.tinyDroppedSpots;
    if (spots.length) {
      const lines = [
        ...new Set(spots.map((s) => s.line).filter((l): l is number => l !== undefined)),
      ];
      warningLocations.push({
        index: m.warnings.length,
        points: spots.map((s) => ({ x: s.x, y: s.y })),
        lines,
        kind: 'tiny',
      });
    }
    m.warnings.push(
      `${m.tinyDropped} sub-${LIMITS.minStitch} mm moves merged into neighbours (too short to sew safely)`,
    );
  }

  if (m.autoTrim > 0) {
    const at = applyAutoTrim(m.events, m.autoTrim);
    m.events = at.events;
  }

  // Analyse coverage before the lock pass: tie-offs are deliberate micro
  // stitches and would otherwise read as false hotspots at every thread end.
  // The machine already accumulated this grid live (in sewing order) so the
  // history queries and this heatmap are one and the same — finalize it.
  const density = m.density.finalize(m.maxDensity);
  if (m.maxDensity > 0) {
    const dens = density.hotspots.filter((h) => h.kind === 'density').slice(0, 3);
    for (const h of dens) {
      warningLocations.push({
        index: m.warnings.length,
        points: [{ x: h.x, y: h.y }],
        lines: h.lines,
        kind: 'density',
      });
      m.warnings.push(
        `${h.value.toFixed(1)} layers of thread (limit ${m.maxDensity}) near (${h.x.toFixed(0)}, ${h.y.toFixed(0)})` +
          (h.lines.length
            ? ` — mostly line${h.lines.length > 1 ? 's' : ''} ${h.lines.join(', ')}`
            : '') +
          ' — may pucker or break needles',
      );
    }
    const stacks = density.hotspots.filter((h) => h.kind === 'stack').slice(0, 2);
    for (const h of stacks) {
      warningLocations.push({
        index: m.warnings.length,
        points: [{ x: h.x, y: h.y }],
        lines: h.lines,
        kind: 'stack',
      });
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

  // ---------- Overflow warnings (§hoop §2.5) ----------
  if (m.fieldOverflows.length > 0) {
    const fieldHits = m.fieldOverflows.filter((o) => o.kind === 'field');
    const hoopHits = m.fieldOverflows.filter((o) => o.kind === 'hoop');
    if (fieldHits.length > 0) {
      const pts = fieldHits.slice(0, 10);
      const lines = [
        ...new Set(pts.map((o) => o.line).filter((l): l is number => l !== undefined)),
      ];
      warningLocations.push({
        index: m.warnings.length,
        points: pts.map((o) => ({ x: o.x, y: o.y })),
        lines,
        kind: 'overflow',
      });
      const first = fieldHits[0];
      m.warnings.push(
        `${fieldHits.length} stitch${fieldHits.length === 1 ? '' : 'es'} outside the ${fieldDescription(m.hoopInfo)}` +
          (first.line !== undefined ? `, line ${first.line}` : '') +
          ` at (${first.x.toFixed(1)}, ${first.y.toFixed(1)})` +
          (fieldHits.length > 1 ? ` and ${fieldHits.length - 1} more` : ''),
      );
    }
    if (hoopHits.length > 0) {
      const pts = hoopHits.slice(0, 10);
      const lines = [
        ...new Set(pts.map((o) => o.line).filter((l): l is number => l !== undefined)),
      ];
      warningLocations.push({
        index: m.warnings.length,
        points: pts.map((o) => ({ x: o.x, y: o.y })),
        lines,
        kind: 'overflow',
      });
      const first = hoopHits[0];
      m.warnings.push(
        `${hoopHits.length} stitch${hoopHits.length === 1 ? '' : 'es'} outside the ${hoopDescription(m.hoopInfo)} — the machine physically cannot reach this point` +
          (first.line !== undefined ? `, line ${first.line}` : '') +
          ` at (${first.x.toFixed(1)}, ${first.y.toFixed(1)})`,
      );
    }
  }

  // ---------- Override raise warnings (emitted every run, §override §3.5) ----------
  for (const [keyStr, { value, line: overrideLine }] of m.activeOverrides) {
    const budgetKey = (
      {
        stitches: 'maxStitches',
        ops: 'maxOps',
        calldepth: 'maxCallDepth',
        loopiters: 'maxLoopIters',
        listlen: 'maxListLen',
        listcells: 'maxListCells',
        stringlen: 'maxStringLength',
        stringtotal: 'maxStringChars',
        scatterpoints: 'maxScatterPoints',
        geoinput: 'maxDelaunayPoints',
        clipverts: 'maxClipVerts',
      } as Record<string, BudgetKey>
    )[keyStr];
    if (!budgetKey) continue;
    const stock = STOCK_LIMITS[budgetKey];
    if (value <= stock) continue; // lowered limits get an info note at parse time, not here
    const tailored: Record<string, string> = {
      stitches: 'Expect a slower preview and longer sew-out time.',
      ops: 'Expect a multi-second run. Avoid infinite loops.',
      calldepth: 'Deep recursion may slow or crash some environments.',
      loopiters: 'Very long loops may freeze the tab briefly.',
      listlen: 'Large lists may use significant browser memory.',
      listcells: 'Large total list allocation may use significant browser memory.',
      stringlen: 'Very long strings may use significant browser memory.',
      stringtotal: 'Large string allocation may use significant browser memory.',
      scatterpoints: 'Poisson-disc at high density may be slow.',
      geoinput: 'Voronoi/triangulate with many points may be slow.',
      clipverts: 'Clip operations with many vertices may be slow.',
    };
    m.warnings.push(
      `⚠ override: ${keyStr} raised ${stock.toLocaleString('en-US')} → ${value.toLocaleString('en-US')} (line ${overrideLine}). ${tailored[keyStr] ?? ''} You are outside the tested envelope.`,
    );
  }

  // ---------- Build RunResult ----------
  const activeHoop: typeof m.hoopInfo | undefined = m.hoopSet ? m.hoopInfo : undefined;
  const activeOverrides: Partial<Record<OverrideKey, number>> | undefined =
    m.activeOverrides.size > 0
      ? Object.fromEntries([...m.activeOverrides.entries()].map(([k, v]) => [k, v.value]))
      : undefined;

  return {
    events: m.events,
    warnings: m.warnings,
    warningLocations,
    printed,
    locks,
    density,
    activeHoop,
    activeOverrides,
    globals,
  };
}
