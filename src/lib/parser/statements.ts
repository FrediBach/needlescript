// ---------- Statement parsers ----------
//
// Parses every statement form in NeedleScript, plus the bracket-block and
// header-expression helpers. All functions take a ParseContext so they can
// share mutable parser state without a shared closure. Cross-module calls
// (parseExpr, parsePrimary, parseParenArgs, parseParenArgsRange) go through
// ctx to avoid circular imports with expressions.ts.

import type { ASTNode, ExprNode } from '../types.ts';
import { NeedlescriptError } from '../errors.ts';
import {
  ALIASES,
  BUILTIN_ARITY,
  BUILTIN_ARITY_OPT,
  TRANSFORM_ARITY,
  EFFECT_ARITY,
  QWORD_BUILTINS,
  FUNC_ARITY,
  ZERO_FUNCS,
  RESERVED,
  LIST_FUNCS,
  LIST_CMDS,
  GEN_FUNCS,
  GEN_CMDS,
  QUERY_FUNCS,
  STRING_FUNCS,
} from '../commands.ts';
import { didYouMeanKinded } from '../suggestions.ts';
import type { ParseContext } from './context.ts';
import { isOptArgStart } from './expressions.ts';

// ---------- Block parsers ----------

export function parseBracketBlock(ctx: ParseContext): ASTNode[] {
  const open = ctx.peek();
  if (!open || open.t !== '[')
    throw new NeedlescriptError('Expected [ to open a block', ctx.lineOf(open));
  ctx.next();
  const stmts: ASTNode[] = [];
  while (!ctx.atEnd() && ctx.peek()!.t !== ']') stmts.push(parseStatement(ctx));
  if (ctx.atEnd()) throw new NeedlescriptError('Missing ] to close a block opened', open.line);
  ctx.next(); // consume ]
  return stmts;
}

/**
 * Parse the header expression of repeat/while/if/for and then its block.
 * If a glued index in the header consumed the `[` that was meant to open
 * the block, the error points at the missing space (RFC-2 §3.1).
 */
function parseHeaderExpr(ctx: ParseContext): ExprNode {
  const prevCtx = ctx.headerCtx;
  ctx.headerCtx = true;
  ctx.lastHeaderIndex = null;
  try {
    return ctx.parseExpr(); // cross-module
  } finally {
    ctx.headerCtx = prevCtx;
  }
}

function parseHeaderBlock(ctx: ParseContext): ASTNode[] {
  if ((ctx.atEnd() || ctx.peek()!.t !== '[') && ctx.lastHeaderIndex)
    throw ctx.headerIndexHint(ctx.lastHeaderIndex.name, ctx.lastHeaderIndex.line);
  return parseBracketBlock(ctx);
}

/** A loop body: like parseHeaderBlock, but `break`/`continue` are valid inside. */
function parseLoopBlock(ctx: ParseContext): ASTNode[] {
  ctx.loopDepth++;
  try {
    return parseHeaderBlock(ctx);
  } finally {
    ctx.loopDepth--;
  }
}

// ---------- Effect arity ----------

function checkEffectArity(
  name: string,
  got: number,
  spec: { min: number; max: number },
  line: number,
): void {
  if (got >= spec.min && got <= spec.max) return;
  const want =
    spec.min === spec.max
      ? `${spec.min} argument${spec.min === 1 ? '' : 's'}`
      : `${spec.min} to ${spec.max} arguments`;
  throw new NeedlescriptError(`${name} expects ${want} then a block, got ${got}`, line);
}

// ---------- Main statement dispatcher ----------

export function parseStatement(ctx: ParseContext): ASTNode {
  const tok = ctx.peek();
  if (!tok) throw new NeedlescriptError('Unexpected end of program');
  if (tok.t === ',')
    throw new NeedlescriptError(
      'Commas can only separate arguments inside call parentheses, e.g.  setxy(10, 20)',
      tok.line,
    );
  if (tok.t === '[') throw new NeedlescriptError("a list literal can't be a statement", tok.line);
  if (tok.t !== 'word')
    throw new NeedlescriptError(
      `Expected a command, got "${tok.v !== undefined ? tok.v : tok.t}"`,
      tok.line,
    );
  const name = tok.v as string;

  if (name === 'to') {
    ctx.next();
    const nameTok = ctx.next();
    if (!nameTok || nameTok.t !== 'word')
      throw new NeedlescriptError('"to" needs a procedure name', tok.line);
    if (RESERVED.has(nameTok.v as string))
      throw new NeedlescriptError(
        `"${nameTok.v}" is a built-in word and can't be redefined`,
        tok.line,
      );
    const procName = nameTok.v as string;
    ctx.noteLibraryShadow(procName);
    const params: string[] = [];
    while (!ctx.atEnd() && ctx.peek()!.t === 'var') {
      const pTok = ctx.next();
      ctx.checkParam(pTok.v as string, pTok.line, params);
      params.push(pTok.v as string);
    }
    const prevProc = ctx.currentProc;
    ctx.currentProc = procName;
    const prevLoopDepth = ctx.loopDepth;
    ctx.loopDepth = 0; // break/continue can't reach a loop in the caller
    const declared = (ctx.declaredLocal[procName] ??= new Set());
    for (const p of params) declared.add(p);
    const body: ASTNode[] = [];
    while (!ctx.atEnd() && !(ctx.peek()!.t === 'word' && ctx.peek()!.v === 'end'))
      body.push(parseStatement(ctx));
    if (ctx.atEnd())
      throw new NeedlescriptError(`Procedure "${procName}" is missing "end"`, tok.line);
    ctx.next(); // consume end
    ctx.currentProc = prevProc;
    ctx.loopDepth = prevLoopDepth;
    return { k: 'to', name: procName, params, body, line: tok.line };
  }

  if (name === 'def') {
    if (ctx.currentProc)
      throw new NeedlescriptError('"def" can\'t be used inside another procedure', tok.line);
    ctx.next();
    const nameTok = ctx.next();
    if (!nameTok || nameTok.t !== 'word')
      throw new NeedlescriptError(
        '"def" needs a procedure name, e.g.  def leaf(size) [ … ]',
        tok.line,
      );
    if (RESERVED.has(nameTok.v as string))
      throw new NeedlescriptError(
        `"${nameTok.v}" is a built-in word and can't be redefined`,
        tok.line,
      );
    const procName = nameTok.v as string;
    ctx.noteLibraryShadow(procName);
    if (ctx.atEnd() || ctx.peek()!.t !== '(')
      throw new NeedlescriptError(
        `"def ${procName}" needs a parameter list in parentheses, e.g.  def ${procName}(size) [ … ]`,
        tok.line,
      );
    ctx.next(); // consume (
    const params: string[] = [];
    if (!ctx.atEnd() && ctx.peek()!.t === ')') {
      ctx.next();
    } else {
      for (;;) {
        const pTok = ctx.peek();
        if (pTok && pTok.t === 'var')
          throw new NeedlescriptError(
            `Parameters in def are bare names — write ${pTok.v}, not :${pTok.v}`,
            pTok.line,
          );
        if (!pTok || pTok.t !== 'word')
          throw new NeedlescriptError(
            `Expected a parameter name in def ${procName}( … )`,
            ctx.lineOf(pTok),
          );
        ctx.next();
        ctx.checkParam(pTok.v as string, pTok.line, params);
        params.push(pTok.v as string);
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
        throw new NeedlescriptError(
          `Expected , or ) in def ${procName}( … )`,
          ctx.lineOf(ctx.peek()),
        );
      }
    }
    ctx.currentProc = procName;
    const prevLoopDepth = ctx.loopDepth;
    ctx.loopDepth = 0; // break/continue can't reach a loop in the caller
    const declared = (ctx.declaredLocal[procName] ??= new Set());
    for (const p of params) declared.add(p);
    const body = parseBracketBlock(ctx);
    ctx.currentProc = null;
    ctx.loopDepth = prevLoopDepth;
    return { k: 'to', name: procName, params, body, line: tok.line };
  }

  if (name === 'let') {
    ctx.next();
    const nameTok = ctx.peek();
    // Destructuring:  let [x, y] = expr  — fixed arity, flat only (RFC-2 §3.3)
    if (nameTok && nameTok.t === '[') {
      ctx.next(); // consume [
      const names: string[] = [];
      const scope = ctx.declaredScope();
      for (;;) {
        const nTok = ctx.peek();
        if (nTok && nTok.t === ']' && names.length > 0) {
          ctx.next();
          break;
        }
        if (!nTok || nTok.t !== 'word')
          throw new NeedlescriptError(
            'let [ … ] needs bare names, e.g.  let [x, y] = pos()',
            ctx.lineOf(nTok ?? tok),
          );
        const w = nTok.v as string;
        ctx.checkBindable(w, 'a variable', nTok.line);
        if (scope.has(w) || names.includes(w))
          throw new NeedlescriptError(
            `"${w}" is already declared — assign with  ${w} = …`,
            nTok.line,
          );
        ctx.next();
        names.push(w);
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
        throw new NeedlescriptError('Expected , or ] in  let [x, y] = …', ctx.lineOf(ctx.peek()));
      }
      if (ctx.atEnd() || ctx.peek()!.t !== 'op' || ctx.peek()!.v !== '=')
        throw new NeedlescriptError(
          `let needs "=", e.g.  let [${names.join(', ')}] = pos()`,
          tok.line,
        );
      ctx.next();
      const value = ctx.parseExpr(); // cross-module
      for (const w of names) scope.add(w);
      return { k: 'letlist', names, value, line: tok.line, isLocal: !!ctx.currentProc };
    }
    if (!nameTok || nameTok.t !== 'word')
      throw new NeedlescriptError('let needs a name, e.g.  let x = 5', tok.line);
    const w = nameTok.v as string;
    ctx.checkBindable(w, 'a variable', nameTok.line);
    const scope = ctx.declaredScope();
    if (scope.has(w))
      throw new NeedlescriptError(`"${w}" is already declared — assign with  ${w} = …`, tok.line);
    ctx.next();
    if (ctx.atEnd() || ctx.peek()!.t !== 'op' || ctx.peek()!.v !== '=')
      throw new NeedlescriptError(`let needs "=", e.g.  let ${w} = 5`, tok.line);
    ctx.next();
    const value = ctx.parseExpr(); // cross-module
    scope.add(w);
    return ctx.currentProc
      ? { k: 'local', name: w, value, line: tok.line }
      : { k: 'make', name: w, value, line: tok.line };
  }

  if (name === 'return') {
    ctx.next();
    const nxt = ctx.peek();
    const isValueWord = (w: string) =>
      w === 'trace' ||
      w === 'tracerings' ||
      FUNC_ARITY[w] !== undefined ||
      ZERO_FUNCS.has(w) ||
      LIST_FUNCS[w] !== undefined ||
      GEN_FUNCS[w] !== undefined ||
      QUERY_FUNCS[w] !== undefined ||
      ctx.procArity[w] !== undefined ||
      ctx.isVariableName(w);
    const startsValue =
      !!nxt &&
      (nxt.t === 'num' ||
        nxt.t === 'var' ||
        nxt.t === '(' ||
        nxt.t === '[' || // list literal (RFC-2)
        nxt.t === 'pref' || // procedure reference @name
        (nxt.t === 'op' && nxt.v === '-') ||
        (nxt.t === 'word' && isValueWord(nxt.v as string)));
    // return expr ≡ output expr; bare return ≡ exit
    return { k: 'output', value: startsValue ? ctx.parseExpr() : null, line: tok.line }; // cross-module
  }

  if (name === 'repeat') {
    ctx.next();
    const count = parseHeaderExpr(ctx);
    const body = parseLoopBlock(ctx);
    return { k: 'repeat', count, body, line: tok.line };
  }

  if (name === 'while') {
    ctx.next();
    const cond = parseHeaderExpr(ctx);
    const body = parseLoopBlock(ctx);
    return { k: 'while', cond, body, line: tok.line };
  }

  if (name === 'for') {
    ctx.next();
    const nm = ctx.peek();
    // Classic:  for "i 0 10 1 [ … ]
    if (nm && nm.t === 'qword') {
      ctx.next();
      const from = ctx.parseExpr(); // cross-module
      const to = ctx.parseExpr(); // cross-module
      const step = parseHeaderExpr(ctx);
      const body = parseLoopBlock(ctx);
      return { k: 'for', varName: nm.v as string, from, to, step, body, line: tok.line };
    }
    // Modern:  for i = 1 to 10 [ step 2 ] [ … ]
    if (nm && nm.t === 'word' && ctx.isAssignTok(ctx.tokens[ctx.pos + 1])) {
      const w = nm.v as string;
      ctx.checkBindable(w, 'a loop counter', nm.line);
      ctx.next(); // name
      if (ctx.peek()!.v !== '=')
        throw new NeedlescriptError(`for needs "=", e.g.  for ${w} = 1 to 10 [ … ]`, tok.line);
      ctx.next(); // =
      const from = ctx.parseExpr(); // cross-module
      if (ctx.atEnd() || ctx.peek()!.t !== 'word' || ctx.peek()!.v !== 'to')
        throw new NeedlescriptError(`for needs "to":  for ${w} = 1 to 10 [ … ]`, tok.line);
      ctx.next(); // to
      const toExpr = parseHeaderExpr(ctx);
      let step: ExprNode = { k: 'num', v: 1 };
      if (!ctx.atEnd() && ctx.peek()!.t === 'word' && ctx.peek()!.v === 'step') {
        ctx.next();
        step = parseHeaderExpr(ctx);
      }
      const body = parseLoopBlock(ctx);
      return { k: 'for', varName: w, from, to: toExpr, step, body, line: tok.line };
    }
    // Modern (RFC-2):  for x in xs [ … ]
    if (
      nm &&
      nm.t === 'word' &&
      ctx.tokens[ctx.pos + 1] &&
      ctx.tokens[ctx.pos + 1].t === 'word' &&
      ctx.tokens[ctx.pos + 1].v === 'in'
    ) {
      const w = nm.v as string;
      ctx.checkBindable(w, 'a loop variable', nm.line);
      ctx.next(); // name
      ctx.next(); // in
      const list = parseHeaderExpr(ctx);
      const body = parseLoopBlock(ctx);
      return { k: 'forin', varName: w, list, body, line: tok.line };
    }
    throw new NeedlescriptError(
      'for needs a counter, e.g.  for i = 1 to 10 [ … ]  or  for x in xs [ … ]  (or classic:  for "i 1 10 1 [ … ])',
      tok.line,
    );
  }

  if (name === 'if') {
    ctx.next();
    const cond = parseHeaderExpr(ctx);
    const body = parseHeaderBlock(ctx);
    let elseBody: ASTNode[] | null = null;
    if (!ctx.atEnd() && ctx.peek()!.t === 'word' && ctx.peek()!.v === 'else') {
      ctx.next();
      if (!ctx.atEnd() && ctx.peek()!.t === 'word' && ctx.peek()!.v === 'if') {
        // else if c [ … ]  lowers to  else [ if c [ … ] ] — chains recurse.
        elseBody = [parseStatement(ctx)];
      } else {
        elseBody = parseBracketBlock(ctx);
      }
    }
    return { k: 'if', cond, body, elseBody, line: tok.line };
  }

  // Trace block expressions (RFC-trace): trace/tracerings are expression-only;
  // using them as a bare statement is an error — the value would be discarded.
  if (name === 'trace' || name === 'tracerings') {
    throw new NeedlescriptError(
      `${name} produces a value — assign it, pass it, or remove it`,
      tok.line,
    );
  }

  // Transform block commands (CTM stack):  translate dx dy [ … ].
  // Args then a block, exactly like repeat/if. Both spellings work:
  //   translate 20 0 [ … ]     (classic prefix)
  //   translate(20, 0) [ … ]   (glued paren — handled in the call branch)
  if (TRANSFORM_ARITY[name] !== undefined && !ctx.gluedParenNext(tok)) {
    ctx.next();
    const arity = TRANSFORM_ARITY[name];
    const args: ExprNode[] = [];
    // Parse each argument in header context so a glued index in the last
    // one is reported as "add a space before the block" rather than
    // silently swallowing the block.
    for (let a = 0; a < arity; a++) args.push(parseHeaderExpr(ctx));
    const body = parseHeaderBlock(ctx);
    return { k: 'transform', name, args, body, line: tok.line };
  }

  // Effect block commands (effects §): warp/humanize/snaptogrid. Like
  // transforms — args then a block, both spellings — but ranged arity, so
  // the classic prefix form reads header expressions up to the opening `[`.
  if (EFFECT_ARITY[name] !== undefined && !ctx.gluedParenNext(tok)) {
    ctx.next();
    const spec = EFFECT_ARITY[name];
    const args: ExprNode[] = [];
    while (!ctx.atEnd() && ctx.peek()!.t !== '[') args.push(parseHeaderExpr(ctx));
    checkEffectArity(name, args.length, spec, tok.line);
    const body = parseHeaderBlock(ctx);
    return { k: 'effect', name, args, body, line: tok.line };
  }

  if (name === 'make' || name === 'local') {
    ctx.next();
    const nm = ctx.next();
    if (!nm || nm.t !== 'qword')
      throw new NeedlescriptError(`${name} needs a quoted name, e.g.  ${name} "size 10`, tok.line);
    ctx.checkBindable(nm.v as string, 'a variable', nm.line);
    if (name === 'local' && ctx.currentProc) ctx.declaredScope().add(nm.v as string);
    const value = ctx.parseExpr(); // cross-module
    return { k: name as 'make' | 'local', name: nm.v as string, value, line: tok.line };
  }

  if (name === 'output' || name === 'op') {
    ctx.next();
    return { k: 'output', value: ctx.parseExpr(), line: tok.line }; // cross-module
  }

  if (name === 'exit') {
    ctx.next();
    return { k: 'output', value: null, line: tok.line };
  }

  // Loop control (RFC-4). Lexical, like output/exit: a `break` inside a
  // procedure can't reach a loop in the caller, and the error says so.
  if (name === 'break' || name === 'continue') {
    if (ctx.loopDepth === 0)
      throw new NeedlescriptError(
        ctx.currentProc
          ? `"${name}" can only be used inside a loop — the loop is in the caller; ` +
              'use return (or exit/output) to leave the procedure'
          : `"${name}" can only be used inside a loop`,
        tok.line,
      );
    ctx.next();
    return { k: name, line: tok.line };
  }

  // Index assignment (RFC-2):  xs[i] = e   |   grid[i][j] += e
  // Only a glued `[` after a variable name reads as an lvalue index chain.
  {
    const nb = ctx.tokens[ctx.pos + 1];
    if (nb && nb.t === '[' && nb.start === tok.end && ctx.isVariableName(name)) {
      ctx.next(); // name
      const indices: ExprNode[] = [];
      while (
        !ctx.atEnd() &&
        ctx.peek()!.t === '[' &&
        ctx.tokens[ctx.pos - 1] &&
        ctx.peek()!.start === ctx.tokens[ctx.pos - 1].end
      ) {
        const open = ctx.next(); // [
        const idx = ctx.parseExpr(); // cross-module
        if (ctx.atEnd() || ctx.peek()!.t !== ']')
          throw new NeedlescriptError(`Missing ] after the index of "${name}"`, open.line);
        ctx.next(); // ]
        indices.push(idx);
      }
      const opTok = ctx.peek();
      if (!ctx.isAssignTok(opTok))
        throw new NeedlescriptError(
          `Expected =, +=, -=, *= or /= after the index, e.g.  ${name}[i] = 5`,
          ctx.lineOf(opTok ?? tok),
        );
      ctx.next(); // op
      const value = ctx.parseExpr(); // cross-module
      return {
        k: 'setindex',
        name,
        indices,
        op: opTok!.v as string,
        value,
        line: tok.line,
      };
    }
  }

  // Modern assignment:  x = e   |   x += e  (⇒ x = x + e)
  if (ctx.isAssignTok(ctx.tokens[ctx.pos + 1])) {
    ctx.checkBindable(name, 'assigned', tok.line);
    ctx.next(); // name
    const opTok = ctx.next(); // = or op=
    ctx.registerAssignmentName(name);
    let value = ctx.parseExpr(); // cross-module
    if (opTok.v !== '=')
      value = {
        k: 'bin',
        op: (opTok.v as string)[0],
        left: { k: 'var', name, line: tok.line, bare: true },
        right: value,
      };
    return { k: 'make', name, value, line: tok.line };
  }

  // Modern call syntax:  f(a, b) — only when the ( is glued to the name.
  if (ctx.gluedParenNext(tok)) {
    const canonical = ALIASES[name] || name;
    // print(v1, v2, …) — variadic call form.
    if (canonical === 'print') {
      ctx.next();
      const args = ctx.parseParenArgsRange('print', 1, 32, tok.line); // cross-module
      return { k: 'cmd', name: 'print', args, line: tok.line };
    }
    // assert(cond) or assert(cond, message) — call form.
    if (canonical === 'assert') {
      ctx.next();
      const args = ctx.parseParenArgsRange('assert', 1, 2, tok.line); // cross-module
      return { k: 'cmd', name: 'assert', args, line: tok.line };
    }
    // trim(x) — fast-reject: trim takes no arguments.
    if (canonical === 'trim') {
      throw new NeedlescriptError(
        `"trim" cuts the thread and takes no arguments — for whitespace, use strip(s)`,
        tok.line,
      );
    }
    if (ctx.procArity[name] !== undefined) {
      ctx.next();
      const args = ctx.parseParenArgs(name, ctx.procArity[name], tok.line); // cross-module
      return { k: 'call', name, args, line: tok.line };
    }
    if (BUILTIN_ARITY[canonical] !== undefined) {
      ctx.next();
      const fixedArity = BUILTIN_ARITY[canonical];
      const optExtra = BUILTIN_ARITY_OPT[canonical] ?? 0;
      const args =
        optExtra > 0
          ? ctx.parseParenArgsRange(name, fixedArity, fixedArity + optExtra, tok.line) // cross-module
          : ctx.parseParenArgs(name, fixedArity, tok.line); // cross-module
      return { k: 'cmd', name: canonical, args, line: tok.line };
    }
    if (TRANSFORM_ARITY[name] !== undefined) {
      ctx.next();
      const args = ctx.parseParenArgs(name, TRANSFORM_ARITY[name], tok.line); // cross-module
      // A transform is a header: the `[` after the argument list opens a
      // block, whether or not it is glued to the `)`.
      if (ctx.atEnd() || ctx.peek()!.t !== '[')
        throw new NeedlescriptError(
          `${name}(…) needs a block, e.g.  ${name}(…) [ … ]`,
          ctx.lineOf(ctx.peek() ?? tok),
        );
      const body = parseBracketBlock(ctx);
      return { k: 'transform', name, args, body, line: tok.line };
    }
    if (EFFECT_ARITY[name] !== undefined) {
      ctx.next();
      const spec = EFFECT_ARITY[name];
      const args = ctx.parseParenArgsRange(name, spec.min, spec.max, tok.line); // cross-module
      if (ctx.atEnd() || ctx.peek()!.t !== '[')
        throw new NeedlescriptError(
          `${name}(…) needs a block, e.g.  ${name}(…) [ … ]`,
          ctx.lineOf(ctx.peek() ?? tok),
        );
      const body = parseBracketBlock(ctx);
      return { k: 'effect', name, args, body, line: tok.line };
    }
    if (LIST_CMDS[name] !== undefined) {
      ctx.next();
      const a = LIST_CMDS[name];
      const args = ctx.parseParenArgsRange(name, a.min, a.max, tok.line); // cross-module
      return { k: 'listcmd', name, args, line: tok.line };
    }
    if (GEN_CMDS[name] !== undefined) {
      ctx.next();
      const a = GEN_CMDS[name];
      const args = ctx.parseParenArgsRange(name, a.min, a.max, tok.line); // cross-module
      return { k: 'listcmd', name, args, line: tok.line };
    }
    if (QWORD_BUILTINS[canonical])
      throw new NeedlescriptError(
        `${canonical} takes a quoted word, e.g.  ${canonical} "${QWORD_BUILTINS[canonical][0]}"`,
        tok.line,
      );
    if (
      FUNC_ARITY[name] !== undefined ||
      ZERO_FUNCS.has(name) ||
      LIST_FUNCS[name] !== undefined ||
      GEN_FUNCS[name] !== undefined ||
      QUERY_FUNCS[name] !== undefined ||
      STRING_FUNCS[name] !== undefined
    )
      throw new NeedlescriptError(
        `"${name}" returns a value — use it inside an expression`,
        tok.line,
      );
    if (ctx.isVariableName(name))
      throw new NeedlescriptError(`"${name}" is a variable, not a procedure`, tok.line);
    throw new NeedlescriptError(
      `Unknown name "${name}"${didYouMeanKinded(name, ctx.nameCandidates())}`,
      tok.line,
    );
  }

  const canonical = ALIASES[name] || name;
  if (canonical === 'print') {
    ctx.next();
    // Classic forms:  print "label expr   or   print expr
    // (call form print(…) is handled in the gluedParenNext block above)
    let label: string | undefined;
    if (!ctx.atEnd() && ctx.peek()!.t === 'qword') label = ctx.next().v as string;
    return { k: 'cmd', name: 'print', args: [ctx.parseExpr()], line: tok.line, label }; // cross-module
  }
  // DX: printloc — logs local-frame needle position with optional quoted label.
  // No value expression is taken (unlike print); reports pos() as "[x, y]".
  if (canonical === 'printloc') {
    ctx.next();
    let label: string | undefined;
    if (!ctx.atEnd() && ctx.peek()!.t === 'qword') label = ctx.next().v as string;
    return { k: 'cmd', name: 'printloc', args: [], line: tok.line, label };
  }
  // assert cond — classic 1-arg form (call form handled in gluedParenNext above).
  if (canonical === 'assert') {
    ctx.next();
    return { k: 'cmd', name: 'assert', args: [ctx.parseExpr()], line: tok.line }; // cross-module
  }
  // mark — optional string label:  mark  or  mark 'text'  or  mark :var  etc.
  if (canonical === 'mark') {
    ctx.next();
    const nxt = ctx.peek();
    const hasLabel =
      !!nxt &&
      (nxt.t === 'string' ||
        nxt.t === 'qword' ||
        nxt.t === 'var' ||
        nxt.t === 'num' ||
        nxt.t === 'pref' ||
        nxt.t === '(' ||
        nxt.t === '[' ||
        (nxt.t === 'word' && (ctx.isVariableName(nxt.v as string) || ctx.gluedParenNext(nxt))));
    const args: ExprNode[] = hasLabel ? [ctx.parseExpr()] : []; // cross-module
    return { k: 'cmd', name: 'mark', args, line: tok.line };
  }
  // `fill` arms programmable fill for the next beginfill…endfill (§2). Four
  // surface forms:  fill @d  |  fill dir @d  |  fill shape @s  |
  // fill dir @d shape @s. `dir`/`shape` are recognized only here, immediately
  // after `fill` (positional keywords, like clippaths' "op strings), so
  // ordinary variables named dir/shape are untouched.
  if (canonical === 'fill') {
    ctx.next();
    // Read one `@name` procedure reference, reusing parsePrimary's resolution
    // (it errors loudly if @name isn't a real def/to procedure).
    const readRef = (channel: string): string => {
      if (ctx.atEnd() || ctx.peek()!.t !== 'pref')
        throw new NeedlescriptError(
          `fill ${channel} needs a procedure reference, e.g.  fill ${channel} @${channel === 'shape' ? 'texture' : 'contour'}`,
          tok.line,
        );
      const e = ctx.parsePrimary(); // cross-module
      if (e.k !== 'procref')
        throw new NeedlescriptError(
          `fill ${channel} needs a procedure reference (@name)`,
          tok.line,
        );
      return e.name;
    };
    const isKw = (w: string) =>
      !ctx.atEnd() &&
      (ctx.peek()!.t === 'word' || ctx.peek()!.t === 'qword') &&
      ctx.peek()!.v === w;
    let dirRef: string | null = null;
    let shapeRef: string | null = null;
    let pathsRef: string | null = null;
    let pathsExpr: ExprNode | null = null;
    if (isKw('paths')) {
      ctx.next();
      if (ctx.atEnd())
        throw new NeedlescriptError(
          'fill paths expects a procedure reference (@name) or a list of paths',
          tok.line,
        );
      if (ctx.peek()!.t === 'pref') pathsRef = readRef('paths');
      else pathsExpr = ctx.parseExpr();
      if (isKw('dir') || isKw('shape'))
        throw new NeedlescriptError(
          'fill paths cannot be combined with dir/shape — they both define the fill geometry',
          tok.line,
        );
    } else if (isKw('dir')) {
      ctx.next();
      dirRef = readRef('dir');
      if (isKw('shape')) {
        ctx.next();
        shapeRef = readRef('shape');
      }
      if (isKw('paths'))
        throw new NeedlescriptError(
          'fill paths cannot be combined with dir/shape — they both define the fill geometry',
          tok.line,
        );
    } else if (isKw('shape')) {
      ctx.next();
      shapeRef = readRef('shape');
      if (isKw('paths'))
        throw new NeedlescriptError(
          'fill paths cannot be combined with dir/shape — they both define the fill geometry',
          tok.line,
        );
    } else {
      // Bare `fill @name` — the shorthand: @name is the DIRECTION field (§2).
      if (ctx.atEnd() || ctx.peek()!.t !== 'pref')
        throw new NeedlescriptError(
          'fill needs a direction field or shape reporter, e.g.  fill @contour  or  fill shape @texture',
          tok.line,
        );
      dirRef = readRef('dir');
    }
    return { k: 'fillarm', dirRef, shapeRef, pathsRef, pathsExpr, line: tok.line };
  }
  if (BUILTIN_ARITY[canonical] !== undefined) {
    ctx.next();
    const args: ExprNode[] = [];
    for (let a = 0; a < BUILTIN_ARITY[canonical]; a++) args.push(ctx.parseExpr()); // cross-module
    // Consume optional extra args (e.g. phase offset for stitchlen/filllen list form)
    const optExtra = BUILTIN_ARITY_OPT[canonical] ?? 0;
    for (let a = 0; a < optExtra; a++) {
      if (!isOptArgStart(ctx)) break;
      args.push(ctx.parseExpr()); // cross-module
    }
    return { k: 'cmd', name: canonical, args, line: tok.line };
  }

  if (ctx.procArity[name] !== undefined) {
    ctx.next();
    const args: ExprNode[] = [];
    for (let a = 0; a < ctx.procArity[name]; a++) args.push(ctx.parseExpr()); // cross-module
    return { k: 'call', name, args, line: tok.line };
  }

  if (ctx.isVariableName(name)) {
    const nb = ctx.tokens[ctx.pos + 1];
    if (nb && nb.t === '[' && nb.start > tok.end)
      throw new NeedlescriptError(
        `to index "${name}", glue the bracket to the name:  ${name}[…]`,
        tok.line,
      );
    throw new NeedlescriptError(`"${name}" is a variable — assign with  ${name} = …`, tok.line);
  }

  // List/gen/string builtins are glued-call only (RFC-2 §4): no prefix form exists.
  if (
    LIST_CMDS[name] !== undefined ||
    LIST_FUNCS[name] !== undefined ||
    GEN_CMDS[name] !== undefined ||
    GEN_FUNCS[name] !== undefined ||
    QUERY_FUNCS[name] !== undefined ||
    STRING_FUNCS[name] !== undefined
  )
    throw new NeedlescriptError(
      `${STRING_FUNCS[name] !== undefined ? 'string' : 'list'} functions need call syntax:  ${name}(…)`,
      tok.line,
    );

  throw new NeedlescriptError(
    `Unknown command "${name}"${didYouMeanKinded(name, ctx.nameCandidates())}`,
    tok.line,
  );
}
