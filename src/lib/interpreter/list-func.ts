import { NeedlescriptError } from '../errors.ts';
import {
  isList,
  describeVal,
  formatNum,
  num,
  deepEqual,
  deepCopy,
  isFuncRef,
  FuncRef,
  ComposedRef,
} from '../list.ts';
import type { Val } from '../list.ts';
import { fork } from '../prng.ts';
import { STRING_FUNCS } from '../commands.ts';
import type { RunContext } from './context.ts';

export function initListFunc(ctx: RunContext): void {
  ctx.listFunc = (name: string, args: Val[], line: number | undefined, depth = 0): Val => {
    switch (name) {
      case 'range': {
        const a = args.length === 1 ? 0 : num(args[0], 'range', line);
        const b = args.length === 1 ? num(args[0], 'range', line) : num(args[1], 'range', line);
        const s = args.length === 3 ? num(args[2], 'range', line) : 1;
        if (s === 0) throw new NeedlescriptError("range step can't be 0", line);
        const count = Math.max(0, Math.ceil((b - a) / s - 1e-9));
        if (count > ctx.m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `List too long (${count.toLocaleString('en-US')} elements, limit ${ctx.m.effectiveLimits.maxListLen.toLocaleString('en-US')})`,
            line,
          );
        const out: Val[] = [];
        for (let k = 0; k < count; k++) out.push(a + k * s);
        return ctx.allocList(out, line);
      }
      case 'filled': {
        const n = num(args[0], 'filled', line);
        const r = Math.round(n);
        if (Math.abs(n - r) > 1e-9 || r < 0)
          throw new NeedlescriptError(
            `filled expected a whole number of elements, got ${formatNum(n)}`,
            line,
          );
        if (r > ctx.m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `List too long (${r.toLocaleString('en-US')} elements, limit ${ctx.m.effectiveLimits.maxListLen.toLocaleString('en-US')})`,
            line,
          );
        const out: Val[] = [];
        for (let k = 0; k < r; k++) out.push(deepCopy(args[1], () => ctx.charge(1, line)));
        return ctx.allocList(out, line);
      }
      case 'len':
        if (typeof args[0] === 'string') return args[0].length;
        return ctx.list(args[0], 'len', line).items.length;
      case 'islist':
        return isList(args[0]) ? 1 : 0;
      case 'isref':
        return isFuncRef(args[0]) ? 1 : 0;
      case 'first': {
        if (typeof args[0] === 'string') {
          if (args[0].length === 0) throw new NeedlescriptError('first of an empty string', line);
          return args[0][0];
        }
        const xs = ctx.list(args[0], 'first', line);
        if (xs.items.length === 0) throw new NeedlescriptError('first of an empty list', line);
        return xs.items[0];
      }
      case 'last': {
        if (typeof args[0] === 'string') {
          if (args[0].length === 0) throw new NeedlescriptError('last of an empty string', line);
          return args[0][args[0].length - 1];
        }
        const xs = ctx.list(args[0], 'last', line);
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
          return ctx.allocString(args[0] + args[1], line);
        }
        const a = ctx.list(args[0], 'concat', line);
        const b = ctx.list(args[1], 'concat', line);
        // shallow: elements are shared references
        return ctx.allocList([...a.items, ...b.items], line);
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
          return ctx.allocString(s.slice(a, b), line);
        }
        const xs = ctx.list(args[0], 'slice', line);
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
        return ctx.allocList(xs.items.slice(a, b), line);
      }
      case 'reverse': {
        if (typeof args[0] === 'string') {
          return ctx.allocString([...args[0]].reverse().join(''), line);
        }
        const xs = ctx.list(args[0], 'reverse', line);
        return ctx.allocList([...xs.items].reverse(), line);
      }
      case 'sort': {
        const xs = ctx.list(args[0], 'sort', line);
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
        return ctx.allocList(
          [...(xs.items as number[])].sort((a, b) => a - b),
          line,
        );
      }
      case 'copy':
        if (typeof args[0] === 'string') return args[0]; // strings are immutable, copy is identity
        return deepCopy(args[0], () => ctx.charge(1, line));
      case 'indexof': {
        if (typeof args[0] === 'string') {
          if (typeof args[1] !== 'string')
            throw new NeedlescriptError(
              `indexof on a string needs a string to search for, got ${describeVal(args[1])}`,
              line,
            );
          return args[0].indexOf(args[1]);
        }
        const xs = ctx.list(args[0], 'indexof', line);
        for (let i = 0; i < xs.items.length; i++) {
          ctx.tick(line);
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
        const xs = ctx.list(args[0], 'contains', line);
        for (const x of xs.items) {
          ctx.tick(line);
          if (deepEqual(x, args[1])) return 1;
        }
        return 0;
      }
      case 'sum':
      case 'mean':
      case 'minof':
      case 'maxof': {
        const xs = ctx.list(args[0], name, line);
        if (xs.items.length === 0) {
          if (name === 'sum') return 0;
          throw new NeedlescriptError(`${name} of an empty list`, line);
        }
        ctx.tickN(xs.items.length, line);
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
        const xs = ctx.list(args[0], 'pick', line);
        if (xs.items.length === 0) throw new NeedlescriptError('pick of an empty list', line);
        return xs.items[Math.floor(ctx.rng() * xs.items.length)]; // one RNG draw
      }
      case 'shuffle': {
        const xs = ctx.list(args[0], 'shuffle', line);
        const out = [...xs.items];
        // Fork convention (RFC-3 §7, amending RFC-2): exactly one draw from
        // the main stream seeds a child RNG; Fisher–Yates runs on the child,
        // high index down to 1. Inserting a shuffle shifts downstream
        // randomness by exactly one draw, regardless of list length.
        const child = fork(ctx.rng);
        for (let i = out.length - 1; i >= 1; i--) {
          const j = Math.floor(child() * (i + 1));
          const t = out[i];
          out[i] = out[j];
          out[j] = t;
        }
        return ctx.allocList(out, line);
      }
      case 'pos':
        return ctx.allocList([ctx.m.x, ctx.m.y], line);
      case 'removeat': {
        const xs = ctx.list(args[0], 'removeat', line);
        const i = ctx.toIndex(args[1], xs.items.length, 'removeat', line);
        const removed = xs.items.splice(i, 1)[0];
        ctx.cells -= 1;
        ctx.tick(line);
        return removed;
      }

      // ---------- steps: inclusive numeric sequence ----------
      case 'steps': {
        const start = num(args[0], 'steps', line);
        const end = num(args[1], 'steps', line);
        const step = args.length === 3 ? num(args[2], 'steps', line) : 1;
        if (step === 0) throw new NeedlescriptError("steps: step can't be 0", line);
        // Direction mismatch → empty list (consistent with range)
        if ((end - start) * step < 0) return ctx.allocList([], line);
        // Inclusive end with floating-point tolerance
        const count = Math.floor(Math.abs((end - start) / step) + 1e-9) + 1;
        if (count > ctx.m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `List too long (${count.toLocaleString('en-US')} elements, limit ${ctx.m.effectiveLimits.maxListLen.toLocaleString('en-US')})`,
            line,
          );
        const out: Val[] = [];
        for (let k = 0; k < count; k++) out.push(start + k * step);
        return ctx.allocList(out, line);
      }

      // ---------- Higher-order list functions ----------
      case 'map': {
        const xs = ctx.list(args[0], 'map', line);
        const ref = ctx.funcRef(args[1], 'map', line);
        const out: Val[] = [];
        for (const item of xs.items) {
          ctx.tick(line);
          out.push(ctx.callRef(ref, [item], depth + 1, line));
        }
        return ctx.allocList(out, line);
      }
      case 'filter': {
        const xs = ctx.list(args[0], 'filter', line);
        const ref = ctx.funcRef(args[1], 'filter', line);
        const out: Val[] = [];
        for (const item of xs.items) {
          ctx.tick(line);
          const result = ctx.callRef(ref, [item], depth + 1, line);
          if (ctx.truthy(result, `filter callback @${ref.name}`, line)) out.push(item);
        }
        return ctx.allocList(out, line);
      }
      case 'reduce': {
        const xs = ctx.list(args[0], 'reduce', line);
        const ref = ctx.funcRef(args[1], 'reduce', line);
        let acc = args[2]; // initial value (required)
        for (const item of xs.items) {
          ctx.tick(line);
          acc = ctx.callRef(ref, [acc, item], depth + 1, line);
        }
        return acc;
      }
      case 'compose': {
        const refs: FuncRef[] = [];
        for (let i = 0; i < args.length; i++) {
          const ref = ctx.funcRef(args[i], `compose argument ${i + 1}`, line);
          if (i > 0) ctx.assertRefArity(ref, 1, `compose argument ${i + 1}`, line);
          refs.push(ref);
        }
        return new ComposedRef(refs);
      }
      case 'bind':
      case '$bind': {
        const ref = ctx.funcRef(args[0], 'bind', line);
        return ctx.bindRef(ref, args.slice(1), line);
      }
    }
    // ---------- String builtins ----------
    if (STRING_FUNCS[name] !== undefined) return ctx.stringFunc(name, args, line);
    throw new NeedlescriptError(`Unknown function ${name}`, line);
  };
}
