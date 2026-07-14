import { NeedlescriptError } from '../errors.ts';
import { describeVal, formatNum, num } from '../list.ts';
import type { Val } from '../list.ts';
import type { RunContext } from './context.ts';

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

export function initStringFunc(ctx: RunContext): void {
  ctx.stringFunc = (name: string, args: Val[], line: number | undefined): Val => {
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
        return ctx.allocList(items, line);
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
        const items: Val[] = parts.map((p) => ctx.allocString(p, line));
        return ctx.allocList(items, line);
      }
      case 'joinstr': {
        const xs = ctx.list(args[0], 'joinstr', line);
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
        return ctx.allocString(parts.join(sep), line);
      }
      case 'upper':
        return ctx.allocString(asciiUpper(requireString(args[0], 'upper', line)), line);
      case 'lower':
        return ctx.allocString(asciiLower(requireString(args[0], 'lower', line)), line);
      case 'strip':
        return ctx.allocString(
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
        return ctx.allocString(s.repeat(n), line);
      }
    }
    throw new NeedlescriptError(`Unknown string function ${name}`, line);
  };
}
