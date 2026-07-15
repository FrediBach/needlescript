// ---------- Expression parsers ----------
//
// The full expression precedence ladder plus argument-list helpers.
// All functions take a ParseContext so they can share mutable parser state
// without a shared closure. Cross-module calls (parseBracketBlock, used by
// parsePrimary for trace/tracerings) go through ctx to avoid circular imports.

import type { ExprNode } from '../types.ts';
import { NeedlescriptError } from '../errors.ts';
import {
  FUNC_ARITY,
  ZERO_FUNCS,
  LIST_FUNCS,
  LIST_CMDS,
  GEN_FUNCS,
  GEN_CMDS,
  QUERY_FUNCS,
  STRING_FUNCS,
  BUILTIN_ARITY,
  ALIASES,
} from '../commands.ts';
import { didYouMean, didYouMeanKinded } from '../suggestions.ts';
import type { ParseContext } from './context.ts';

const COMPARE_OPS = new Set(['<', '>', '=', '<=', '>=', '!=']);

// ---------- Argument-list helpers ----------

/**
 * Returns true if the next token unambiguously opens an expression, so an
 * optional extra arg can be consumed without stealing a subsequent command.
 * Conservative: only tokens that can NEVER be the start of a statement
 * (number, string, list, paren, :var, @name) are accepted; bare words are
 * not, because they might be the next command.
 */
export function isOptArgStart(ctx: ParseContext): boolean {
  if (ctx.atEnd()) return false;
  const nxt = ctx.peek()!;
  return (
    nxt.t === 'num' ||
    nxt.t === 'string' ||
    nxt.t === '[' ||
    nxt.t === '(' ||
    nxt.t === 'pref' ||
    nxt.t === 'var'
  );
}

/** Parse a parenthesised argument list:  ( expr {, expr} [,] )  */
export function parseParenArgs(
  ctx: ParseContext,
  callee: string,
  arity: number,
  line: number,
): ExprNode[] {
  return parseParenArgsRange(ctx, callee, arity, arity, line);
}

/** Like parseParenArgs, but the arity may be a range (list builtins). */
export function parseParenArgsRange(
  ctx: ParseContext,
  callee: string,
  min: number,
  max: number,
  line: number,
): ExprNode[] {
  ctx.next(); // consume '('
  const args: ExprNode[] = [];
  if (!ctx.atEnd() && ctx.peek()!.t === ')') {
    ctx.next();
  } else {
    for (;;) {
      if (ctx.atEnd()) throw new NeedlescriptError(`Missing ) in ${callee}(…)`, line);
      args.push(parseExpr(ctx));
      if (!ctx.atEnd() && ctx.peek()!.t === ',') {
        ctx.next();
        if (!ctx.atEnd() && ctx.peek()!.t === ')') {
          ctx.next();
          break;
        } // trailing comma
        continue;
      }
      if (!ctx.atEnd() && ctx.peek()!.t === ')') {
        ctx.next();
        break;
      }
      const bad = ctx.peek();
      throw new NeedlescriptError(
        `Expected , or ) in the arguments of ${callee}(…), got "${bad ? (bad.v !== undefined ? bad.v : bad.t) : 'end of program'}"`,
        bad ? bad.line : line,
      );
    }
  }
  if (args.length < min || args.length > max) {
    const want =
      min === max ? `${min} argument${min === 1 ? '' : 's'}` : `${min} to ${max} arguments`;
    // push/pop are the turtle state stack, not list operations.
    const hint =
      callee === 'push' && args.length > 0
        ? ' — push/pop save the turtle state; to add a value to a list, use append(xs, v)'
        : '';
    throw new NeedlescriptError(`${callee}(…) expects ${want}, got ${args.length}${hint}`, line);
  }
  return args;
}

/**
 * Parse a generative-math call (RFC-3 §4). All calls use ranged-arity
 * plain-expression arguments. The `clippaths` operation mode (formerly a
 * quoted word) is now an ordinary string expression validated at runtime.
 */
export function parseGenCall(ctx: ParseContext, name: string, line: number): ExprNode {
  const a = GEN_FUNCS[name];
  return {
    k: 'listfunc',
    name,
    args: parseParenArgsRange(ctx, name, a.min, a.max, line),
    line,
  };
}

// ---------- Expression precedence ladder ----------

export function parseExpr(ctx: ParseContext): ExprNode {
  return parseOr(ctx);
}

function parseOr(ctx: ParseContext): ExprNode {
  let left = parseAnd(ctx);
  while (!ctx.atEnd() && ctx.peek()!.t === 'word' && ctx.peek()!.v === 'or') {
    ctx.next();
    left = { k: 'bin', op: 'or', left, right: parseAnd(ctx) };
  }
  return left;
}

function parseAnd(ctx: ParseContext): ExprNode {
  let left = parseCompare(ctx);
  while (!ctx.atEnd() && ctx.peek()!.t === 'word' && ctx.peek()!.v === 'and') {
    ctx.next();
    left = { k: 'bin', op: 'and', left, right: parseCompare(ctx) };
  }
  return left;
}

function parseCompare(ctx: ParseContext): ExprNode {
  let left = parseAdd(ctx);
  while (!ctx.atEnd() && ctx.peek()!.t === 'op' && COMPARE_OPS.has(ctx.peek()!.v as string)) {
    const op = ctx.next().v as string;
    left = { k: 'bin', op, left, right: parseAdd(ctx) };
  }
  return left;
}

function parseAdd(ctx: ParseContext): ExprNode {
  let left = parseMul(ctx);
  while (
    !ctx.atEnd() &&
    ctx.peek()!.t === 'op' &&
    (ctx.peek()!.v === '+' || ctx.peek()!.v === '-')
  ) {
    // Logo convention: " -5" (space before, glued after) is a value, not subtraction.
    if (ctx.peek()!.v === '-' && ctx.peek()!.spBefore && !ctx.peek()!.spAfter) break;
    const op = ctx.next().v as string;
    left = { k: 'bin', op, left, right: parseMul(ctx) };
  }
  return left;
}

function parseMul(ctx: ParseContext): ExprNode {
  let left = parseUnary(ctx);
  while (
    !ctx.atEnd() &&
    ctx.peek()!.t === 'op' &&
    (ctx.peek()!.v === '*' || ctx.peek()!.v === '/' || ctx.peek()!.v === '%')
  ) {
    const opTok = ctx.next();
    const right = parseUnary(ctx);
    // a % b lowers to mod(a, b): floor modulo, the result takes the sign
    // of the divisor (one semantics in the engine).
    left =
      opTok.v === '%'
        ? { k: 'func', name: 'mod', args: [left, right], line: opTok.line }
        : { k: 'bin', op: opTok.v as string, left, right };
  }
  return left;
}

export function parseUnary(ctx: ParseContext): ExprNode {
  if (!ctx.atEnd() && ctx.peek()!.t === 'op' && ctx.peek()!.v === '-') {
    const tok = ctx.next();
    return { k: 'neg', val: parseUnary(ctx), line: tok.line };
  }
  return parsePrimary(ctx);
}

/**
 * Postfix index chains (RFC-2 §3.1/3.2):  xs[0], pos()[1], grid[i][j].
 * Only runs when the primary just parsed is a valid index left-context
 * (bare IDENT, `)` or `]` — never a number literal or legacy `:var`).
 * A glued `(` after `]` also parses (type error at runtime, not parse).
 */
export function parsePostfix(ctx: ParseContext, expr: ExprNode, indexable: boolean): ExprNode {
  if (!indexable) return expr;
  for (;;) {
    const nxt = ctx.peek();
    const prev = ctx.tokens[ctx.pos - 1];
    if (!nxt || !prev || nxt.start !== prev.end) return expr;
    if (nxt.t === '[') {
      const open = ctx.next(); // [
      const headName = prev.t === 'word' ? (prev.v as string) : prev.t; // ")" / "]"
      const recordHeader = ctx.headerCtx;
      if (recordHeader) ctx.lastHeaderIndex = { name: headName, line: open.line };
      let idx: ExprNode;
      try {
        idx = parseExpr(ctx);
        if (ctx.atEnd() || ctx.peek()!.t !== ']')
          throw new NeedlescriptError('Missing ] after an index', open.line);
      } catch (e) {
        // In a repeat/while/if/for header, a glued `[` that fails to parse
        // as an index almost always swallowed the block. Say so.
        if (recordHeader && e instanceof NeedlescriptError)
          throw ctx.headerIndexHint(headName, open.line);
        throw e;
      }
      ctx.next(); // ]
      expr = { k: 'index', obj: expr, idx, line: open.line };
      continue;
    }
    if (nxt.t === '(' && prev.t === ']') {
      // paths[i](…) — parses; erroring is the runtime's job (§3.1).
      const args = parseParenArgsRange(ctx, 'a list value', 0, Infinity, nxt.line);
      expr = { k: 'callval', obj: expr, args, line: nxt.line };
      continue;
    }
    return expr;
  }
}

/** Parse a list literal after peeking `[`:  [1, 2, [3, 4],] */
function parseListLiteral(ctx: ParseContext): ExprNode {
  const open = ctx.next(); // [
  const items: ExprNode[] = [];
  if (!ctx.atEnd() && ctx.peek()!.t === ']') {
    ctx.next();
  } else {
    for (;;) {
      if (ctx.atEnd()) throw new NeedlescriptError('Missing ] to close a list', open.line);
      items.push(parseExpr(ctx));
      if (!ctx.atEnd() && ctx.peek()!.t === ',') {
        ctx.next();
        if (!ctx.atEnd() && ctx.peek()!.t === ']') {
          ctx.next();
          break;
        } // trailing comma
        continue;
      }
      if (!ctx.atEnd() && ctx.peek()!.t === ']') {
        ctx.next();
        break;
      }
      const bad = ctx.peek();
      throw new NeedlescriptError(
        `Expected , or ] in a list, got "${bad ? (bad.v !== undefined ? bad.v : bad.t) : 'end of program'}" — separate elements with commas`,
        bad ? bad.line : open.line,
      );
    }
  }
  return { k: 'list', items, line: open.line };
}

export function parsePrimary(ctx: ParseContext): ExprNode {
  const tok = ctx.peek();
  if (!tok) throw new NeedlescriptError('Expected a value but the program ended');
  if (tok.t === 'num') {
    ctx.next();
    return { k: 'num', v: tok.v as number };
  }
  // String literal: 'text' — a first-class string value.
  if (tok.t === 'string') {
    ctx.next();
    return parsePostfix(ctx, { k: 'str', v: tok.v as string, line: tok.line }, true);
  }
  // Quoted word in expression position evaluates to a string value (lowercased).
  // Binding positions (make "x, for "i, print "label) consume qwords before
  // parsePrimary is reached and are unaffected.
  if (tok.t === 'qword') {
    ctx.next();
    return parsePostfix(ctx, { k: 'str', v: tok.v as string, line: tok.line }, true);
  }
  if (tok.t === 'var') {
    // Legacy :var tokens are excluded from index left-context — legacy
    // code predates indexing by definition.
    ctx.next();
    return { k: 'var', name: tok.v as string, line: tok.line };
  }
  // "@name" — a procedure or function reference. User procs are resolved
  // from the pre-scan; built-in *functions* (value-returning) are also
  // accepted so that map/filter/reduce can use @vadd, @sin, etc.
  // Statement-only builtins (fd, sewpath, append…) are rejected because
  // they don't return a value.
  if (tok.t === 'pref') {
    ctx.next();
    const name = tok.v as string;
    // 1. User-defined procedure — always accepted (shadows builtins)
    if (ctx.procArity[name] !== undefined) {
      return { k: 'procref', name, line: tok.line };
    }
    // 2. Value-returning builtins — accepted as references
    if (
      FUNC_ARITY[name] !== undefined ||
      ZERO_FUNCS.has(name) ||
      LIST_FUNCS[name] !== undefined ||
      GEN_FUNCS[name] !== undefined ||
      QUERY_FUNCS[name] !== undefined ||
      STRING_FUNCS[name] !== undefined
    ) {
      return { k: 'procref', name, line: tok.line };
    }
    // 3. Statement-only builtins — explicit rejection with helpful message
    const kind = ctx.builtinKind(name);
    if (kind || LIST_CMDS[name] !== undefined || GEN_CMDS[name] !== undefined)
      throw new NeedlescriptError(
        `@${name} can't be used as a reference — "${name}" is a ${kind ?? 'command'} that doesn't return a value`,
        tok.line,
      );
    // 4. Unknown name
    throw new NeedlescriptError(
      `@${name} — no procedure or function named "${name}"${didYouMean(name, [...Object.keys(ctx.procArity), ...Object.keys(FUNC_ARITY), ...Object.keys(LIST_FUNCS), ...Object.keys(GEN_FUNCS), ...Object.keys(STRING_FUNCS)])}`,
      tok.line,
    );
  }
  if (tok.t === ',')
    throw new NeedlescriptError(
      'Commas can only separate arguments inside call parentheses, e.g.  setxy(10, 20)',
      tok.line,
    );
  if (tok.t === '[') return parsePostfix(ctx, parseListLiteral(ctx), true);
  if (tok.t === '(') {
    ctx.next();
    const e = parseExpr(ctx);
    if (!ctx.atEnd() && ctx.peek()!.t === ',')
      throw new NeedlescriptError(
        'Commas can only separate arguments inside call parentheses — glue the ( to the name:  f(a, b)',
        ctx.peek()!.line,
      );
    if (ctx.atEnd() || ctx.peek()!.t !== ')') throw new NeedlescriptError('Missing )', tok.line);
    ctx.next();
    return parsePostfix(ctx, e, true);
  }
  if (tok.t === 'word') {
    const w = tok.v as string;

    // Trace block expressions (RFC-trace): trace [ … ] / tracerings [ … ].
    // Header word then a bracket block, valid in expression position only.
    // Binds like a primary — tighter than any operator — so trace [ … ][0]
    // indexes the result, and len(trace [ … ]) needs no extra parentheses.
    if (w === 'trace' || w === 'tracerings') {
      ctx.next();
      const body = ctx.parseBracketBlock(); // cross-module via ctx
      return parsePostfix(
        ctx,
        { k: 'trace', multi: w === 'tracerings', body, line: tok.line },
        true,
      );
    }

    // Call syntax: name(args) — only when ( is glued to the name; with a
    // space between,  f (10)  keeps its Logo meaning (grouped expression).
    if (ctx.gluedParenNext(tok)) {
      if (FUNC_ARITY[w] !== undefined) {
        ctx.next();
        return parsePostfix(
          ctx,
          {
            k: 'func',
            name: w,
            args: parseParenArgs(ctx, w, FUNC_ARITY[w], tok.line),
            line: tok.line,
          },
          true,
        );
      }
      if (ctx.procArity[w] !== undefined) {
        ctx.next();
        return parsePostfix(
          ctx,
          {
            k: 'callexpr',
            name: w,
            args: parseParenArgs(ctx, w, ctx.procArity[w], tok.line),
            line: tok.line,
          },
          true,
        );
      }
      // Zero-argument reporters are Library tier too: a user procedure wins
      // at call sites, while a same-named variable remains non-callable.
      if (ZERO_FUNCS.has(w)) {
        ctx.next();
        return parsePostfix(
          ctx,
          { k: 'func', name: w, args: parseParenArgs(ctx, w, 0, tok.line), line: tok.line },
          true,
        );
      }
      // List builtins resolve only here (soft reservation): procedures
      // shadow them, and variables are never callable so there is no clash.
      if (LIST_FUNCS[w] !== undefined) {
        ctx.next();
        const a = LIST_FUNCS[w];
        return parsePostfix(
          ctx,
          {
            k: 'listfunc',
            name: w,
            args: parseParenArgsRange(ctx, w, a.min, a.max, tok.line),
            line: tok.line,
          },
          true,
        );
      }
      // Generative-math builtins (RFC-3): same soft reservation.
      if (GEN_FUNCS[w] !== undefined) {
        ctx.next();
        return parsePostfix(ctx, parseGenCall(ctx, w, tok.line), true);
      }
      // Stitch-history query reporters: pure value functions, ranged arity.
      if (QUERY_FUNCS[w] !== undefined) {
        ctx.next();
        const a = QUERY_FUNCS[w];
        return parsePostfix(
          ctx,
          {
            k: 'listfunc',
            name: w,
            args: parseParenArgsRange(ctx, w, a.min, a.max, tok.line),
            line: tok.line,
          },
          true,
        );
      }
      // String builtins (Library tier): call-only, soft reservation.
      if (STRING_FUNCS[w] !== undefined) {
        ctx.next();
        const a = STRING_FUNCS[w];
        return parsePostfix(
          ctx,
          {
            k: 'listfunc',
            name: w,
            args: parseParenArgsRange(ctx, w, a.min, a.max, tok.line),
            line: tok.line,
          },
          true,
        );
      }
      if (ctx.isVariableName(w))
        throw new NeedlescriptError(`"${w}" is a variable, not a procedure`, tok.line);
      if (
        BUILTIN_ARITY[ALIASES[w] || w] !== undefined ||
        LIST_CMDS[w] !== undefined ||
        GEN_CMDS[w] !== undefined
      )
        throw new NeedlescriptError(`"${w}" is a command — it doesn't return a value`, tok.line);
      throw new NeedlescriptError(
        `Unknown name "${w}"${didYouMeanKinded(w, ctx.nameCandidates())}`,
        tok.line,
      );
    }

    // Bare name — unified resolution (§4.2):
    // local → global → zero-arg user reporter → Library reporter → prefix call → unknown.
    if (ctx.isVariableName(w)) {
      ctx.next();
      // Glued `[` after a bare modern IDENT is an index chain (§3.1).
      return parsePostfix(ctx, { k: 'var', name: w, line: tok.line, bare: true }, true);
    }
    if (ctx.procArity[w] === 0) {
      ctx.next();
      return { k: 'callexpr', name: w, args: [], line: tok.line };
    }
    if (ZERO_FUNCS.has(w)) {
      ctx.next();
      return { k: 'func', name: w, args: [], line: tok.line };
    }
    if (FUNC_ARITY[w] !== undefined) {
      ctx.next();
      const args: ExprNode[] = [];
      for (let a = 0; a < FUNC_ARITY[w]; a++)
        args.push(FUNC_ARITY[w] > 1 ? parseExpr(ctx) : parseUnary(ctx));
      return { k: 'func', name: w, args, line: tok.line };
    }
    // User procedure used as a reporter (must "output" a value)
    if (ctx.procArity[w] !== undefined) {
      ctx.next();
      const args: ExprNode[] = [];
      for (let a = 0; a < ctx.procArity[w]; a++) args.push(parseExpr(ctx));
      return { k: 'callexpr', name: w, args, line: tok.line };
    }
    // List/gen/string builtins are glued-call only (RFC-2 §4): no prefix form exists.
    if (
      LIST_FUNCS[w] !== undefined ||
      GEN_FUNCS[w] !== undefined ||
      QUERY_FUNCS[w] !== undefined ||
      STRING_FUNCS[w] !== undefined
    )
      throw new NeedlescriptError(
        `${STRING_FUNCS[w] !== undefined ? 'string' : 'list'} functions need call syntax:  ${w}(…)`,
        tok.line,
      );
    throw new NeedlescriptError(
      `Unknown name "${w}"${didYouMeanKinded(w, ctx.nameCandidates())}`,
      tok.line,
    );
  }
  throw new NeedlescriptError(
    `Expected a value, got "${tok.v !== undefined ? tok.v : tok.t}"`,
    tok.line,
  );
}
