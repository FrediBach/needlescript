// ---------- Parser entry point ----------
//
// Accepts both classic Logo syntax and the modern syntax (RFC-1). Every
// modern form lowers to an existing AST node, so the interpreter, stitch
// machine and exports are untouched. Legacy syntax remains valid.
//
// The parse() function creates a ParseContext — a plain object containing all
// mutable parser state, utility methods and cross-module function references —
// and then drives the top-level parseProgram loop. The recursive-descent
// sub-parsers live in expressions.ts and statements.ts; static analysis
// helpers live in analysis.ts.

import type { ASTNode, Token } from '../../core/types.ts';
import { NeedlescriptError } from '../../core/errors.ts';
import {
  ALIASES,
  BUILTIN_ARITY,
  FUNC_ARITY,
  ZERO_FUNCS,
  RESERVED,
  LIST_FUNCS,
  LIST_CMDS,
  GEN_FUNCS,
  GEN_CMDS,
  QUERY_FUNCS,
  QWORD_BUILTINS,
  LIBRARY_FUNCS,
} from '../commands.ts';
import { prescan } from '../prescan.ts';
import { COMPOUND_ASSIGN_OPS } from '../tokenizer.ts';
import type { ParseContext } from './context.ts';
import { parseExpr, parsePrimary, parseParenArgs, parseParenArgsRange } from './expressions.ts';
import { parseBracketBlock, parseStatement } from './statements.ts';
import { collectValueUses, allPathsReturn } from './analysis.ts';
import { lowerClosures } from '../closure-lowering.ts';

// ---------- parseProgram ----------

function parseProgram(ctx: ParseContext): ASTNode[] {
  const stmts: ASTNode[] = [];
  while (!ctx.atEnd()) stmts.push(parseStatement(ctx));

  // RFC DX item 6: parse-time reporter-path check.
  // Any procedure referenced via @name or called in expression position (callexpr)
  // must return a value on every control-flow path. Detect this statically so
  // the author sees the error immediately — before running and waiting for an
  // unlucky seed to hit the missing branch.
  //
  // This check applies only to procedures used as values; procedures used
  // purely as commands (drawing side effects) are unaffected.
  // It rejects strictly fewer programs at runtime: any program this flags would
  // have already thrown "never reached output/return" at runtime.
  const usedAsValue = new Set<string>();
  collectValueUses(stmts, usedAsValue);
  for (const st of stmts) {
    if (st.k === 'to' && usedAsValue.has(st.name)) {
      if (!allPathsReturn(st.body)) {
        throw new NeedlescriptError(
          `Reporter "${st.name}" may finish without returning a value.\n` +
            `A procedure used as a value must reach return/output on every path.\n` +
            `Tip: add an else branch to every if that might fall through.`,
          st.line,
        );
      }
    }
  }

  return stmts;
}

// ---------- Public parse() export ----------

export interface KnownProcedure {
  arity: number;
  line?: number;
}

export function parse(
  tokens: Token[],
  notes?: string[],
  knownProcedures: Readonly<Record<string, KnownProcedure>> = {},
): ASTNode[] {
  tokens = lowerClosures(tokens);
  // Pre-scan procedures, globals and per-procedure locals so both call arity
  // and bare-name resolution are known at parse time.
  const ps = prescan(tokens);
  for (const [name, known] of Object.entries(knownProcedures)) {
    if (ps.procArity[name] !== undefined)
      throw new NeedlescriptError(
        `"${name}" is both imported and defined locally`,
        ps.procLine[name],
      );
    ps.procArity[name] = known.arity;
    ps.procLine[name] = known.line ?? 1;
  }

  // Build the ParseContext. All methods close over `ctx` so they can read and
  // mutate state without `this`. Cross-module function references (parseExpr,
  // parsePrimary, parseBracketBlock, parseParenArgs, parseParenArgsRange) are
  // stored as properties to avoid circular imports between expressions.ts and
  // statements.ts.
  const ctx: ParseContext = {
    tokens,
    notes,
    pos: 0,
    currentProc: null,
    loopDepth: 0,
    declaredGlobal: new Set(),
    declaredLocal: {},
    headerCtx: false,
    lastHeaderIndex: null,
    shadowNoted: new Set(),
    procArity: ps.procArity,
    ps,

    // ---- Token stream utilities ----
    peek() {
      return ctx.tokens[ctx.pos];
    },
    next() {
      return ctx.tokens[ctx.pos++];
    },
    atEnd() {
      return ctx.pos >= ctx.tokens.length;
    },
    lineOf(tok?) {
      return tok ? tok.line : ctx.tokens.length ? ctx.tokens[ctx.tokens.length - 1].line : 1;
    },
    declaredScope() {
      return ctx.currentProc
        ? (ctx.declaredLocal[ctx.currentProc] ??= new Set())
        : ctx.declaredGlobal;
    },
    isLocalName(w) {
      return !!(
        ctx.currentProc &&
        ctx.ps.procLocals[ctx.currentProc] &&
        ctx.ps.procLocals[ctx.currentProc].has(w)
      );
    },
    isVariableName(w) {
      return ctx.isLocalName(w) || ctx.ps.globalNames.has(w);
    },
    registerAssignmentName(w) {
      if (!ctx.isLocalName(w)) ctx.ps.globalNames.add(w);
    },
    isAssignTok(tok?) {
      return !!tok && tok.t === 'op' && (tok.v === '=' || COMPOUND_ASSIGN_OPS.has(tok.v as string));
    },
    gluedParenNext(tok) {
      const nxt = ctx.tokens[ctx.pos + 1];
      return !!(nxt && nxt.t === '(' && nxt.start === tok.end);
    },

    // ---- Diagnostic helpers ----
    headerIndexHint(name, line) {
      return new NeedlescriptError(
        `"[" glued to "${name}" reads as indexing — add a space before the block`,
        line,
      );
    },
    builtinKind(w) {
      if (FUNC_ARITY[w] !== undefined || ZERO_FUNCS.has(w)) return 'built-in function';
      if (
        BUILTIN_ARITY[w] !== undefined ||
        ALIASES[w] !== undefined ||
        QWORD_BUILTINS[w] !== undefined
      )
        return 'built-in command';
      if (RESERVED.has(w)) return 'reserved word';
      return null;
    },
    checkBindable(name, what, line) {
      const kind = ctx.builtinKind(name);
      if (kind && !LIBRARY_FUNCS.has(name))
        throw new NeedlescriptError(`"${name}" is a ${kind} and can't be ${what}`, line);
      if (ctx.procArity[name] !== undefined)
        throw new NeedlescriptError(
          `"${name}" is already a procedure (line ${ctx.ps.procLine[name]})`,
          line,
        );
    },
    checkParam(p, line, params) {
      ctx.checkBindable(p, 'a parameter', line);
      if (params.includes(p)) throw new NeedlescriptError(`Duplicate parameter "${p}"`, line);
    },
    nameCandidates() {
      const m = new Map<string, string>();
      for (const k of RESERVED) m.set(k, '');
      for (const k of Object.keys(BUILTIN_ARITY)) m.set(k, 'command');
      for (const k of Object.keys(ALIASES)) m.set(k, 'command');
      for (const k of Object.keys(QWORD_BUILTINS)) m.set(k, 'command');
      for (const k of Object.keys(FUNC_ARITY)) m.set(k, 'function');
      for (const k of ZERO_FUNCS) m.set(k, 'function');
      for (const k of Object.keys(LIST_FUNCS)) m.set(k, 'function');
      for (const k of Object.keys(LIST_CMDS)) m.set(k, 'command');
      for (const k of Object.keys(GEN_FUNCS)) m.set(k, 'function');
      for (const k of Object.keys(GEN_CMDS)) m.set(k, 'command');
      for (const k of Object.keys(QUERY_FUNCS)) m.set(k, 'function');
      for (const k of Object.keys(ctx.procArity)) m.set(k, 'procedure');
      for (const k of ctx.ps.globalNames) m.set(k, 'variable');
      if (ctx.currentProc && ctx.ps.procLocals[ctx.currentProc])
        for (const k of ctx.ps.procLocals[ctx.currentProc]) m.set(k, 'variable');
      return m;
    },
    noteLibraryShadow(name) {
      if (!LIBRARY_FUNCS.has(name) || ctx.shadowNoted.has(name)) return;
      ctx.shadowNoted.add(name);
      ctx.notes?.push(
        `note: "${name}" shadows a built-in library function (since v3) — rename to silence`,
      );
    },

    // ---- Cross-module parser function references ----
    // Stored as properties to break the mutual import dependency between
    // expressions.ts (which needs parseBracketBlock) and statements.ts (which
    // needs parseExpr, parsePrimary, parseParenArgs, parseParenArgsRange).
    parseExpr() {
      return parseExpr(ctx);
    },
    parsePrimary() {
      return parsePrimary(ctx);
    },
    parseBracketBlock() {
      return parseBracketBlock(ctx);
    },
    parseParenArgs(callee, arity, line) {
      return parseParenArgs(ctx, callee, arity, line);
    },
    parseParenArgsRange(callee, min, max, line) {
      return parseParenArgsRange(ctx, callee, min, max, line);
    },
  };

  return parseProgram(ctx);
}
