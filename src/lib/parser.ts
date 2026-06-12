// ---------- Parser ----------
//
// Accepts both classic Logo syntax and the modern syntax (RFC-1). Every
// modern form lowers to an existing AST node, so the interpreter, stitch
// machine and exports are untouched. Legacy syntax remains valid.

import type { ASTNode, ExprNode, Token } from './types.ts';
import { NeedlescriptError } from './errors.ts';
import { ALIASES, BUILTIN_ARITY, QWORD_BUILTINS, FUNC_ARITY, ZERO_FUNCS, RESERVED, LIST_FUNCS, LIST_CMDS, GEN_FUNCS, GEN_CMDS, GEN_QWORD_ARG, LIBRARY_FUNCS } from './commands.ts';
import { didYouMean, didYouMeanKinded } from './suggestions.ts';
import { prescan } from './prescan.ts';
import { COMPOUND_ASSIGN_OPS } from './tokenizer.ts';

const COMPARE_OPS = new Set(['<', '>', '=', '<=', '>=', '!=']);

export function parse(tokens: Token[], notes?: string[]): ASTNode[] {
  // Pre-scan procedures, globals and per-procedure locals so both call arity
  // and bare-name resolution are known at parse time.
  const ps = prescan(tokens);
  const procArity = ps.procArity;

  /** Library-tier names already noted as shadowed (one note per name, §3). */
  const shadowNoted = new Set<string>();

  /**
   * Library-tier shadowing (RFC-3 §3): a user definition of a Library
   * builtin wins for the whole program, with a one-time console note.
   * Core names (RESERVED) stay a hard error — checked by the caller.
   */
  function noteLibraryShadow(name: string) {
    if (!LIBRARY_FUNCS.has(name) || shadowNoted.has(name)) return;
    shadowNoted.add(name);
    notes?.push(
      `note: "${name}" shadows a built-in library function (since v3) — rename to silence`,
    );
  }

  let pos = 0;
  /** Name of the procedure whose body is being parsed (null at top level). */
  let currentProc: string | null = null;
  /** Textual `let`/param/`local` declarations, for the double-`let` error. */
  const declaredGlobal = new Set<string>();
  const declaredLocal: Record<string, Set<string>> = {};

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const atEnd = () => pos >= tokens.length;
  const lineOf = (tok?: Token) =>
    tok ? tok.line : (tokens.length ? tokens[tokens.length - 1].line : 1);

  const declaredScope = () =>
    currentProc ? (declaredLocal[currentProc] ??= new Set()) : declaredGlobal;

  const isLocalName = (w: string) =>
    !!(currentProc && ps.procLocals[currentProc] && ps.procLocals[currentProc].has(w));
  const isVariableName = (w: string) => isLocalName(w) || ps.globalNames.has(w);

  const isAssignTok = (tok?: Token) =>
    !!tok && tok.t === 'op' && (tok.v === '=' || COMPOUND_ASSIGN_OPS.has(tok.v as string));

  /** Is the `(` immediately after the current token glued to it (call syntax)? */
  const gluedParenNext = (tok: Token) => {
    const nxt = tokens[pos + 1];
    return !!(nxt && nxt.t === '(' && nxt.start === tok.end);
  };

  // ----- `[` disambiguation state (RFC-2 §3.1) -----
  // While parsing the header expression of repeat/while/if/for, a glued `[`
  // after a bare identifier reads as indexing. If that turns out to swallow
  // the block, the error must say so (the one sharp edge of the grammar).
  let headerCtx = false;
  let lastHeaderIndex: { name: string; line: number } | null = null;

  const headerIndexHint = (name: string, line: number) =>
    new NeedlescriptError(
      `"[" glued to "${name}" reads as indexing — add a space before the block`,
      line,
    );

  function builtinKind(w: string): string | null {
    if (FUNC_ARITY[w] !== undefined || ZERO_FUNCS.has(w)) return 'built-in function';
    if (BUILTIN_ARITY[w] !== undefined || ALIASES[w] !== undefined || QWORD_BUILTINS[w] !== undefined)
      return 'built-in command';
    if (RESERVED.has(w)) return 'reserved word';
    return null;
  }

  /** Names that hold values or definitions must never collide (§4.3). */
  function checkBindable(name: string, what: string, line: number) {
    const kind = builtinKind(name);
    if (kind)
      throw new NeedlescriptError(`"${name}" is a ${kind} and can't be ${what}`, line);
    if (procArity[name] !== undefined)
      throw new NeedlescriptError(
        `"${name}" is already a procedure (line ${ps.procLine[name]})`,
        line,
      );
  }

  function checkParam(p: string, line: number, params: string[]) {
    checkBindable(p, 'a parameter', line);
    if (params.includes(p))
      throw new NeedlescriptError(`Duplicate parameter "${p}"`, line);
  }

  /** Merged namespace for did-you-mean, with kind labels. */
  function nameCandidates(): Map<string, string> {
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
    for (const k of Object.keys(procArity)) m.set(k, 'procedure');
    for (const k of ps.globalNames) m.set(k, 'variable');
    if (currentProc && ps.procLocals[currentProc])
      for (const k of ps.procLocals[currentProc]) m.set(k, 'variable');
    return m;
  }

  function parseProgram(): ASTNode[] {
    const stmts: ASTNode[] = [];
    while (!atEnd()) stmts.push(parseStatement());
    return stmts;
  }

  function parseBracketBlock(): ASTNode[] {
    const open = peek();
    if (!open || open.t !== '[')
      throw new NeedlescriptError('Expected [ to open a block', lineOf(open));
    next();
    const stmts: ASTNode[] = [];
    while (!atEnd() && peek().t !== ']') stmts.push(parseStatement());
    if (atEnd()) throw new NeedlescriptError('Missing ] to close a block opened', open.line);
    next(); // consume ]
    return stmts;
  }

  /**
   * Parse the header expression of repeat/while/if/for and then its block.
   * If a glued index in the header consumed the `[` that was meant to open
   * the block, the error points at the missing space (RFC-2 §3.1).
   */
  function parseHeaderExpr(): ExprNode {
    const prevCtx = headerCtx;
    headerCtx = true;
    lastHeaderIndex = null;
    try {
      return parseExpr();
    } finally {
      headerCtx = prevCtx;
    }
  }

  function parseHeaderBlock(): ASTNode[] {
    if ((atEnd() || peek().t !== '[') && lastHeaderIndex)
      throw headerIndexHint(lastHeaderIndex.name, lastHeaderIndex.line);
    return parseBracketBlock();
  }

  /** Parse a parenthesised argument list:  ( expr {, expr} [,] )  */
  function parseParenArgs(callee: string, arity: number, line: number): ExprNode[] {
    return parseParenArgsRange(callee, arity, arity, line);
  }

  /** Like parseParenArgs, but the arity may be a range (list builtins). */
  function parseParenArgsRange(callee: string, min: number, max: number, line: number): ExprNode[] {
    next(); // consume '('
    const args: ExprNode[] = [];
    if (!atEnd() && peek().t === ')') {
      next();
    } else {
      for (;;) {
        if (atEnd()) throw new NeedlescriptError(`Missing ) in ${callee}(…)`, line);
        args.push(parseExpr());
        if (!atEnd() && peek().t === ',') {
          next();
          if (!atEnd() && peek().t === ')') { next(); break; } // trailing comma
          continue;
        }
        if (!atEnd() && peek().t === ')') { next(); break; }
        const bad = peek();
        throw new NeedlescriptError(
          `Expected , or ) in the arguments of ${callee}(…), got "${bad ? (bad.v !== undefined ? bad.v : bad.t) : 'end of program'}"`,
          bad ? bad.line : line,
        );
      }
    }
    if (args.length < min || args.length > max) {
      const want = min === max
        ? `${min} argument${min === 1 ? '' : 's'}`
        : `${min} to ${max} arguments`;
      // push/pop are the turtle state stack, not list operations.
      const hint = callee === 'push' && args.length > 0
        ? ' — push/pop save the turtle state; to add a value to a list, use append(xs, v)'
        : '';
      throw new NeedlescriptError(
        `${callee}(…) expects ${want}, got ${args.length}${hint}`,
        line,
      );
    }
    return args;
  }

  /**
   * Parse a generative-math call (RFC-3 §4). Most are plain ranged-arity
   * calls; the ones in GEN_QWORD_ARG take a quoted word in one slot
   * (e.g.  clippaths(a, b, "union") ) — validated here, at parse time,
   * because the runtime has no string values.
   */
  function parseGenCall(name: string, line: number): ExprNode {
    const a = GEN_FUNCS[name];
    const q = GEN_QWORD_ARG[name];
    if (!q) {
      return {
        k: 'listfunc', name,
        args: parseParenArgsRange(name, a.min, a.max, line), line,
      };
    }
    next(); // consume '('
    const args: ExprNode[] = [];
    let word: string | undefined;
    let slot = 0;
    for (;;) {
      if (atEnd()) throw new NeedlescriptError(`Missing ) in ${name}(…)`, line);
      if (slot === q.index) {
        const wTok = peek();
        if (!wTok || wTok.t !== 'qword')
          throw new NeedlescriptError(
            `${name} needs a quoted word here, e.g.  ${name}(a, b, "${q.allowed[0]}")`,
            lineOf(wTok),
          );
        next();
        word = wTok.v as string;
        if (!q.allowed.includes(word))
          throw new NeedlescriptError(
            `${name} doesn't know "${word}"${didYouMean(word, q.allowed)} (choices: ${q.allowed.join(', ')})`,
            wTok.line,
          );
      } else {
        args.push(parseExpr());
      }
      slot++;
      if (!atEnd() && peek().t === ',') {
        next();
        if (!atEnd() && peek().t === ')') { next(); break; } // trailing comma
        continue;
      }
      if (!atEnd() && peek().t === ')') { next(); break; }
      const bad = peek();
      throw new NeedlescriptError(
        `Expected , or ) in the arguments of ${name}(…), got "${bad ? (bad.v !== undefined ? bad.v : bad.t) : 'end of program'}"`,
        bad ? bad.line : line,
      );
    }
    if (slot < a.min || slot > a.max)
      throw new NeedlescriptError(
        `${name}(…) expects ${a.min === a.max ? `${a.min} arguments` : `${a.min} to ${a.max} arguments`}, got ${slot}`,
        line,
      );
    if (word === undefined)
      throw new NeedlescriptError(
        `${name} needs a quoted word, e.g.  ${name}(a, b, "${q.allowed[0]}")`,
        line,
      );
    return { k: 'listfunc', name, args, line, word };
  }

  function parseStatement(): ASTNode {
    const tok = peek();
    if (!tok) throw new NeedlescriptError('Unexpected end of program');
    if (tok.t === ',')
      throw new NeedlescriptError(
        'Commas can only separate arguments inside call parentheses, e.g.  setxy(10, 20)',
        tok.line,
      );
    if (tok.t === '[')
      throw new NeedlescriptError("a list literal can't be a statement", tok.line);
    if (tok.t !== 'word')
      throw new NeedlescriptError(
        `Expected a command, got "${tok.v !== undefined ? tok.v : tok.t}"`,
        tok.line,
      );
    const name = tok.v as string;

    if (name === 'to') {
      next();
      const nameTok = next();
      if (!nameTok || nameTok.t !== 'word')
        throw new NeedlescriptError('"to" needs a procedure name', tok.line);
      if (RESERVED.has(nameTok.v as string))
        throw new NeedlescriptError(
          `"${nameTok.v}" is a built-in word and can't be redefined`,
          tok.line,
        );
      const procName = nameTok.v as string;
      noteLibraryShadow(procName);
      const params: string[] = [];
      while (!atEnd() && peek().t === 'var') {
        const pTok = next();
        checkParam(pTok.v as string, pTok.line, params);
        params.push(pTok.v as string);
      }
      const prevProc = currentProc;
      currentProc = procName;
      const declared = (declaredLocal[procName] ??= new Set());
      for (const p of params) declared.add(p);
      const body: ASTNode[] = [];
      while (!atEnd() && !(peek().t === 'word' && peek().v === 'end'))
        body.push(parseStatement());
      if (atEnd())
        throw new NeedlescriptError(`Procedure "${procName}" is missing "end"`, tok.line);
      next(); // consume end
      currentProc = prevProc;
      return { k: 'to', name: procName, params, body, line: tok.line };
    }

    if (name === 'def') {
      if (currentProc)
        throw new NeedlescriptError(
          '"def" can\'t be used inside another procedure',
          tok.line,
        );
      next();
      const nameTok = next();
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
      noteLibraryShadow(procName);
      if (atEnd() || peek().t !== '(')
        throw new NeedlescriptError(
          `"def ${procName}" needs a parameter list in parentheses, e.g.  def ${procName}(size) [ … ]`,
          tok.line,
        );
      next(); // consume (
      const params: string[] = [];
      if (!atEnd() && peek().t === ')') {
        next();
      } else {
        for (;;) {
          const pTok = peek();
          if (pTok && pTok.t === 'var')
            throw new NeedlescriptError(
              `Parameters in def are bare names — write ${pTok.v}, not :${pTok.v}`,
              pTok.line,
            );
          if (!pTok || pTok.t !== 'word')
            throw new NeedlescriptError(
              `Expected a parameter name in def ${procName}( … )`,
              lineOf(pTok),
            );
          next();
          checkParam(pTok.v as string, pTok.line, params);
          params.push(pTok.v as string);
          if (!atEnd() && peek().t === ',') {
            next();
            if (!atEnd() && peek().t === ')') { next(); break; } // trailing comma
            continue;
          }
          if (!atEnd() && peek().t === ')') { next(); break; }
          throw new NeedlescriptError(
            `Expected , or ) in def ${procName}( … )`,
            lineOf(peek()),
          );
        }
      }
      currentProc = procName;
      const declared = (declaredLocal[procName] ??= new Set());
      for (const p of params) declared.add(p);
      const body = parseBracketBlock();
      currentProc = null;
      return { k: 'to', name: procName, params, body, line: tok.line };
    }

    if (name === 'let') {
      next();
      const nameTok = peek();
      // Destructuring:  let [x, y] = expr  — fixed arity, flat only (RFC-2 §3.3)
      if (nameTok && nameTok.t === '[') {
        next(); // consume [
        const names: string[] = [];
        const scope = declaredScope();
        for (;;) {
          const nTok = peek();
          if (nTok && nTok.t === ']' && names.length > 0) { next(); break; }
          if (!nTok || nTok.t !== 'word')
            throw new NeedlescriptError(
              'let [ … ] needs bare names, e.g.  let [x, y] = pos()',
              lineOf(nTok ?? tok),
            );
          const w = nTok.v as string;
          checkBindable(w, 'a variable', nTok.line);
          if (scope.has(w) || names.includes(w))
            throw new NeedlescriptError(
              `"${w}" is already declared — assign with  ${w} = …`,
              nTok.line,
            );
          next();
          names.push(w);
          if (!atEnd() && peek().t === ',') {
            next();
            if (!atEnd() && peek().t === ']') { next(); break; } // trailing comma
            continue;
          }
          if (!atEnd() && peek().t === ']') { next(); break; }
          throw new NeedlescriptError(
            'Expected , or ] in  let [x, y] = …',
            lineOf(peek()),
          );
        }
        if (atEnd() || peek().t !== 'op' || peek().v !== '=')
          throw new NeedlescriptError(
            `let needs "=", e.g.  let [${names.join(', ')}] = pos()`,
            tok.line,
          );
        next();
        const value = parseExpr();
        for (const w of names) scope.add(w);
        return { k: 'letlist', names, value, line: tok.line, isLocal: !!currentProc };
      }
      if (!nameTok || nameTok.t !== 'word')
        throw new NeedlescriptError('let needs a name, e.g.  let x = 5', tok.line);
      const w = nameTok.v as string;
      checkBindable(w, 'a variable', nameTok.line);
      const scope = declaredScope();
      if (scope.has(w))
        throw new NeedlescriptError(
          `"${w}" is already declared — assign with  ${w} = …`,
          tok.line,
        );
      next();
      if (atEnd() || peek().t !== 'op' || peek().v !== '=')
        throw new NeedlescriptError(`let needs "=", e.g.  let ${w} = 5`, tok.line);
      next();
      const value = parseExpr();
      scope.add(w);
      return currentProc
        ? { k: 'local', name: w, value, line: tok.line }
        : { k: 'make', name: w, value, line: tok.line };
    }

    if (name === 'return') {
      next();
      const nxt = peek();
      const isValueWord = (w: string) =>
        FUNC_ARITY[w] !== undefined || ZERO_FUNCS.has(w) ||
        LIST_FUNCS[w] !== undefined || GEN_FUNCS[w] !== undefined ||
        procArity[w] !== undefined || isVariableName(w);
      const startsValue = !!nxt && (
        nxt.t === 'num' || nxt.t === 'var' || nxt.t === '(' ||
        nxt.t === '[' || // list literal (RFC-2)
        (nxt.t === 'op' && nxt.v === '-') ||
        (nxt.t === 'word' && isValueWord(nxt.v as string))
      );
      // return expr ≡ output expr; bare return ≡ exit
      return { k: 'output', value: startsValue ? parseExpr() : null, line: tok.line };
    }

    if (name === 'repeat') {
      next();
      const count = parseHeaderExpr();
      const body = parseHeaderBlock();
      return { k: 'repeat', count, body, line: tok.line };
    }

    if (name === 'while') {
      next();
      const cond = parseHeaderExpr();
      const body = parseHeaderBlock();
      return { k: 'while', cond, body, line: tok.line };
    }

    if (name === 'for') {
      next();
      const nm = peek();
      // Classic:  for "i 0 10 1 [ … ]
      if (nm && nm.t === 'qword') {
        next();
        const from = parseExpr();
        const to = parseExpr();
        const step = parseHeaderExpr();
        const body = parseHeaderBlock();
        return { k: 'for', varName: nm.v as string, from, to, step, body, line: tok.line };
      }
      // Modern:  for i = 1 to 10 [ step 2 ] [ … ]
      if (nm && nm.t === 'word' && isAssignTok(tokens[pos + 1])) {
        const w = nm.v as string;
        checkBindable(w, 'a loop counter', nm.line);
        next(); // name
        if (peek().v !== '=')
          throw new NeedlescriptError(`for needs "=", e.g.  for ${w} = 1 to 10 [ … ]`, tok.line);
        next(); // =
        const from = parseExpr();
        if (atEnd() || peek().t !== 'word' || peek().v !== 'to')
          throw new NeedlescriptError(
            `for needs "to":  for ${w} = 1 to 10 [ … ]`,
            tok.line,
          );
        next(); // to
        const toExpr = parseHeaderExpr();
        let step: ExprNode = { k: 'num', v: 1 };
        if (!atEnd() && peek().t === 'word' && peek().v === 'step') {
          next();
          step = parseHeaderExpr();
        }
        const body = parseHeaderBlock();
        return { k: 'for', varName: w, from, to: toExpr, step, body, line: tok.line };
      }
      // Modern (RFC-2):  for x in xs [ … ]
      if (
        nm && nm.t === 'word' &&
        tokens[pos + 1] && tokens[pos + 1].t === 'word' && tokens[pos + 1].v === 'in'
      ) {
        const w = nm.v as string;
        checkBindable(w, 'a loop variable', nm.line);
        next(); // name
        next(); // in
        const list = parseHeaderExpr();
        const body = parseHeaderBlock();
        return { k: 'forin', varName: w, list, body, line: tok.line };
      }
      throw new NeedlescriptError(
        'for needs a counter, e.g.  for i = 1 to 10 [ … ]  or  for x in xs [ … ]  (or classic:  for "i 1 10 1 [ … ])',
        tok.line,
      );
    }

    if (name === 'if') {
      next();
      const cond = parseHeaderExpr();
      const body = parseHeaderBlock();
      let elseBody: ASTNode[] | null = null;
      if (!atEnd() && peek().t === 'word' && peek().v === 'else') {
        next();
        if (!atEnd() && peek().t === 'word' && peek().v === 'if') {
          // else if c [ … ]  lowers to  else [ if c [ … ] ] — chains recurse.
          elseBody = [parseStatement()];
        } else {
          elseBody = parseBracketBlock();
        }
      }
      return { k: 'if', cond, body, elseBody, line: tok.line };
    }

    if (name === 'make' || name === 'local') {
      next();
      const nm = next();
      if (!nm || nm.t !== 'qword')
        throw new NeedlescriptError(
          `${name} needs a quoted name, e.g.  ${name} "size 10`,
          tok.line,
        );
      checkBindable(nm.v as string, 'a variable', nm.line);
      if (name === 'local' && currentProc) declaredScope().add(nm.v as string);
      const value = parseExpr();
      return { k: name as 'make' | 'local', name: nm.v as string, value, line: tok.line };
    }

    if (name === 'output' || name === 'op') {
      next();
      return { k: 'output', value: parseExpr(), line: tok.line };
    }

    if (name === 'exit') {
      next();
      return { k: 'output', value: null, line: tok.line };
    }

    // Index assignment (RFC-2):  xs[i] = e   |   grid[i][j] += e
    // Only a glued `[` after a variable name reads as an lvalue index chain.
    {
      const nb = tokens[pos + 1];
      if (nb && nb.t === '[' && nb.start === tok.end && isVariableName(name)) {
        next(); // name
        const indices: ExprNode[] = [];
        while (
          !atEnd() && peek().t === '[' &&
          tokens[pos - 1] && peek().start === tokens[pos - 1].end
        ) {
          const open = next(); // [
          const idx = parseExpr();
          if (atEnd() || peek().t !== ']')
            throw new NeedlescriptError(`Missing ] after the index of "${name}"`, open.line);
          next(); // ]
          indices.push(idx);
        }
        const opTok = peek();
        if (!isAssignTok(opTok))
          throw new NeedlescriptError(
            `Expected =, +=, -=, *= or /= after the index, e.g.  ${name}[i] = 5`,
            lineOf(opTok ?? tok),
          );
        next(); // op
        const value = parseExpr();
        return {
          k: 'setindex', name, indices,
          op: opTok!.v as string, value, line: tok.line,
        };
      }
    }

    // Modern assignment:  x = e   |   x += e  (⇒ x = x + e)
    if (isAssignTok(tokens[pos + 1])) {
      checkBindable(name, 'assigned', tok.line);
      next(); // name
      const opTok = next(); // = or op=
      let value = parseExpr();
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
    if (gluedParenNext(tok)) {
      const canonical = ALIASES[name] || name;
      if (procArity[name] !== undefined) {
        next();
        const args = parseParenArgs(name, procArity[name], tok.line);
        return { k: 'call', name, args, line: tok.line };
      }
      if (BUILTIN_ARITY[canonical] !== undefined) {
        next();
        const args = parseParenArgs(name, BUILTIN_ARITY[canonical], tok.line);
        return { k: 'cmd', name: canonical, args, line: tok.line };
      }
      if (LIST_CMDS[name] !== undefined) {
        next();
        const a = LIST_CMDS[name];
        const args = parseParenArgsRange(name, a.min, a.max, tok.line);
        return { k: 'listcmd', name, args, line: tok.line };
      }
      if (GEN_CMDS[name] !== undefined) {
        next();
        const a = GEN_CMDS[name];
        const args = parseParenArgsRange(name, a.min, a.max, tok.line);
        return { k: 'listcmd', name, args, line: tok.line };
      }
      if (QWORD_BUILTINS[canonical])
        throw new NeedlescriptError(
          `${canonical} takes a quoted word, e.g.  ${canonical} "${QWORD_BUILTINS[canonical][0]}"`,
          tok.line,
        );
      if (FUNC_ARITY[name] !== undefined || ZERO_FUNCS.has(name) || LIST_FUNCS[name] !== undefined || GEN_FUNCS[name] !== undefined)
        throw new NeedlescriptError(
          `"${name}" returns a value — use it inside an expression`,
          tok.line,
        );
      if (isVariableName(name))
        throw new NeedlescriptError(`"${name}" is a variable, not a procedure`, tok.line);
      throw new NeedlescriptError(
        `Unknown name "${name}"${didYouMeanKinded(name, nameCandidates())}`,
        tok.line,
      );
    }

    const canonical = ALIASES[name] || name;
    if (canonical === 'print') {
      next();
      // Optional label:  print "radius :r
      let label: string | undefined;
      if (!atEnd() && peek().t === 'qword') label = next().v as string;
      return { k: 'cmd', name: 'print', args: [parseExpr()], line: tok.line, label };
    }
    if (QWORD_BUILTINS[canonical]) {
      next();
      const allowed = QWORD_BUILTINS[canonical];
      const wTok = next();
      if (!wTok || wTok.t !== 'qword')
        throw new NeedlescriptError(
          `${canonical} needs a quoted word, e.g.  ${canonical} "${allowed[0]}`,
          tok.line,
        );
      const word = wTok.v as string;
      if (!allowed.includes(word))
        throw new NeedlescriptError(
          `${canonical} doesn't know "${word}"${didYouMean(word, allowed)} (choices: ${allowed.join(', ')})`,
          tok.line,
        );
      return { k: 'cmd', name: canonical, args: [], line: tok.line, word };
    }
    if (BUILTIN_ARITY[canonical] !== undefined) {
      next();
      const args: ExprNode[] = [];
      for (let a = 0; a < BUILTIN_ARITY[canonical]; a++) args.push(parseExpr());
      return { k: 'cmd', name: canonical, args, line: tok.line };
    }

    if (procArity[name] !== undefined) {
      next();
      const args: ExprNode[] = [];
      for (let a = 0; a < procArity[name]; a++) args.push(parseExpr());
      return { k: 'call', name, args, line: tok.line };
    }

    if (isVariableName(name)) {
      const nb = tokens[pos + 1];
      if (nb && nb.t === '[' && nb.start > tok.end)
        throw new NeedlescriptError(
          `to index "${name}", glue the bracket to the name:  ${name}[…]`,
          tok.line,
        );
      throw new NeedlescriptError(
        `"${name}" is a variable — assign with  ${name} = …`,
        tok.line,
      );
    }

    // List/gen builtins are glued-call only (RFC-2 §4): no prefix form exists.
    if (
      LIST_CMDS[name] !== undefined || LIST_FUNCS[name] !== undefined ||
      GEN_CMDS[name] !== undefined || GEN_FUNCS[name] !== undefined
    )
      throw new NeedlescriptError(
        `list functions need call syntax:  ${name}(…)`,
        tok.line,
      );

    throw new NeedlescriptError(
      `Unknown command "${name}"${didYouMeanKinded(name, nameCandidates())}`,
      tok.line,
    );
  }

  function parseExpr(): ExprNode { return parseOr(); }

  function parseOr(): ExprNode {
    let left = parseAnd();
    while (!atEnd() && peek().t === 'word' && peek().v === 'or') {
      next();
      left = { k: 'bin', op: 'or', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): ExprNode {
    let left = parseCompare();
    while (!atEnd() && peek().t === 'word' && peek().v === 'and') {
      next();
      left = { k: 'bin', op: 'and', left, right: parseCompare() };
    }
    return left;
  }

  function parseCompare(): ExprNode {
    let left = parseAdd();
    while (
      !atEnd() &&
      peek().t === 'op' &&
      COMPARE_OPS.has(peek().v as string)
    ) {
      const op = next().v as string;
      left = { k: 'bin', op, left, right: parseAdd() };
    }
    return left;
  }

  function parseAdd(): ExprNode {
    let left = parseMul();
    while (!atEnd() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      // Logo convention: " -5" (space before, glued after) is a value, not subtraction.
      if (peek().v === '-' && peek().spBefore && !peek().spAfter) break;
      const op = next().v as string;
      left = { k: 'bin', op, left, right: parseMul() };
    }
    return left;
  }

  function parseMul(): ExprNode {
    let left = parseUnary();
    while (
      !atEnd() &&
      peek().t === 'op' &&
      (peek().v === '*' || peek().v === '/' || peek().v === '%')
    ) {
      const opTok = next();
      const right = parseUnary();
      // a % b lowers to mod(a, b): floor modulo, the result takes the sign
      // of the divisor (one semantics in the engine).
      left = opTok.v === '%'
        ? { k: 'func', name: 'mod', args: [left, right], line: opTok.line }
        : { k: 'bin', op: opTok.v as string, left, right };
    }
    return left;
  }

  function parseUnary(): ExprNode {
    if (!atEnd() && peek().t === 'op' && peek().v === '-') {
      const tok = next();
      return { k: 'neg', val: parseUnary(), line: tok.line };
    }
    return parsePrimary();
  }

  /**
   * Postfix index chains (RFC-2 §3.1/3.2):  xs[0], pos()[1], grid[i][j].
   * Only runs when the primary just parsed is a valid index left-context
   * (bare IDENT, `)` or `]` — never a number literal or legacy `:var`).
   * A glued `(` after `]` also parses (type error at runtime, not parse).
   */
  function parsePostfix(expr: ExprNode, indexable: boolean): ExprNode {
    if (!indexable) return expr;
    for (;;) {
      const nxt = peek();
      const prev = tokens[pos - 1];
      if (!nxt || !prev || nxt.start !== prev.end) return expr;
      if (nxt.t === '[') {
        const open = next(); // [
        const headName =
          prev.t === 'word' ? (prev.v as string) : prev.t; // ")" / "]"
        const recordHeader = headerCtx;
        if (recordHeader) lastHeaderIndex = { name: headName, line: open.line };
        let idx: ExprNode;
        try {
          idx = parseExpr();
          if (atEnd() || peek().t !== ']')
            throw new NeedlescriptError('Missing ] after an index', open.line);
        } catch (e) {
          // In a repeat/while/if/for header, a glued `[` that fails to parse
          // as an index almost always swallowed the block. Say so.
          if (recordHeader && e instanceof NeedlescriptError)
            throw headerIndexHint(headName, open.line);
          throw e;
        }
        next(); // ]
        expr = { k: 'index', obj: expr, idx, line: open.line };
        continue;
      }
      if (nxt.t === '(' && prev.t === ']') {
        // paths[i](…) — parses; erroring is the runtime's job (§3.1).
        const args = parseParenArgsRange('a list value', 0, Infinity, nxt.line);
        expr = { k: 'callval', obj: expr, args, line: nxt.line };
        continue;
      }
      return expr;
    }
  }

  /** Parse a list literal after peeking `[`:  [1, 2, [3, 4],] */
  function parseListLiteral(): ExprNode {
    const open = next(); // [
    const items: ExprNode[] = [];
    if (!atEnd() && peek().t === ']') {
      next();
    } else {
      for (;;) {
        if (atEnd())
          throw new NeedlescriptError('Missing ] to close a list', open.line);
        items.push(parseExpr());
        if (!atEnd() && peek().t === ',') {
          next();
          if (!atEnd() && peek().t === ']') { next(); break; } // trailing comma
          continue;
        }
        if (!atEnd() && peek().t === ']') { next(); break; }
        const bad = peek();
        throw new NeedlescriptError(
          `Expected , or ] in a list, got "${bad ? (bad.v !== undefined ? bad.v : bad.t) : 'end of program'}" — separate elements with commas`,
          bad ? bad.line : open.line,
        );
      }
    }
    return { k: 'list', items, line: open.line };
  }

  function parsePrimary(): ExprNode {
    const tok = peek();
    if (!tok) throw new NeedlescriptError('Expected a value but the program ended');
    if (tok.t === 'num') { next(); return { k: 'num', v: tok.v as number }; }
    if (tok.t === 'var') {
      // Legacy :var tokens are excluded from index left-context — legacy
      // code predates indexing by definition.
      next();
      return { k: 'var', name: tok.v as string, line: tok.line };
    }
    if (tok.t === ',')
      throw new NeedlescriptError(
        'Commas can only separate arguments inside call parentheses, e.g.  setxy(10, 20)',
        tok.line,
      );
    if (tok.t === '[')
      return parsePostfix(parseListLiteral(), true);
    if (tok.t === '(') {
      next();
      const e = parseExpr();
      if (!atEnd() && peek().t === ',')
        throw new NeedlescriptError(
          'Commas can only separate arguments inside call parentheses — glue the ( to the name:  f(a, b)',
          peek().line,
        );
      if (atEnd() || peek().t !== ')') throw new NeedlescriptError('Missing )', tok.line);
      next();
      return parsePostfix(e, true);
    }
    if (tok.t === 'word') {
      const w = tok.v as string;

      // Call syntax: name(args) — only when ( is glued to the name; with a
      // space between,  f (10)  keeps its Logo meaning (grouped expression).
      if (gluedParenNext(tok)) {
        if (FUNC_ARITY[w] !== undefined) {
          next();
          return parsePostfix(
            { k: 'func', name: w, args: parseParenArgs(w, FUNC_ARITY[w], tok.line), line: tok.line },
            true,
          );
        }
        if (ZERO_FUNCS.has(w)) {
          next();
          return parsePostfix(
            { k: 'func', name: w, args: parseParenArgs(w, 0, tok.line), line: tok.line },
            true,
          );
        }
        if (procArity[w] !== undefined) {
          next();
          return parsePostfix(
            { k: 'callexpr', name: w, args: parseParenArgs(w, procArity[w], tok.line), line: tok.line },
            true,
          );
        }
        // List builtins resolve only here (soft reservation): procedures
        // shadow them, and variables are never callable so there is no clash.
        if (LIST_FUNCS[w] !== undefined) {
          next();
          const a = LIST_FUNCS[w];
          return parsePostfix(
            { k: 'listfunc', name: w, args: parseParenArgsRange(w, a.min, a.max, tok.line), line: tok.line },
            true,
          );
        }
        // Generative-math builtins (RFC-3): same soft reservation.
        if (GEN_FUNCS[w] !== undefined) {
          next();
          return parsePostfix(parseGenCall(w, tok.line), true);
        }
        if (isVariableName(w))
          throw new NeedlescriptError(`"${w}" is a variable, not a procedure`, tok.line);
        if (BUILTIN_ARITY[ALIASES[w] || w] !== undefined || LIST_CMDS[w] !== undefined || GEN_CMDS[w] !== undefined)
          throw new NeedlescriptError(
            `"${w}" is a command — it doesn't return a value`,
            tok.line,
          );
        throw new NeedlescriptError(
          `Unknown name "${w}"${didYouMeanKinded(w, nameCandidates())}`,
          tok.line,
        );
      }

      // Bare name — unified resolution (§4.2):
      // local → global → zero-arg reporter → prefix call → unknown.
      if (isVariableName(w)) {
        next();
        // Glued `[` after a bare modern IDENT is an index chain (§3.1).
        return parsePostfix({ k: 'var', name: w, line: tok.line, bare: true }, true);
      }
      if (ZERO_FUNCS.has(w)) {
        next();
        return { k: 'func', name: w, args: [], line: tok.line };
      }
      if (procArity[w] === 0) {
        next();
        return { k: 'callexpr', name: w, args: [], line: tok.line };
      }
      if (FUNC_ARITY[w] !== undefined) {
        next();
        const args: ExprNode[] = [];
        for (let a = 0; a < FUNC_ARITY[w]; a++)
          args.push(FUNC_ARITY[w] > 1 ? parseExpr() : parseUnary());
        return { k: 'func', name: w, args, line: tok.line };
      }
      // User procedure used as a reporter (must "output" a value)
      if (procArity[w] !== undefined) {
        next();
        const args: ExprNode[] = [];
        for (let a = 0; a < procArity[w]; a++) args.push(parseExpr());
        return { k: 'callexpr', name: w, args, line: tok.line };
      }
      // List/gen builtins are glued-call only (RFC-2 §4): no prefix form exists.
      if (LIST_FUNCS[w] !== undefined || GEN_FUNCS[w] !== undefined)
        throw new NeedlescriptError(
          `list functions need call syntax:  ${w}(…)`,
          tok.line,
        );
      throw new NeedlescriptError(
        `Unknown name "${w}"${didYouMeanKinded(w, nameCandidates())}`,
        tok.line,
      );
    }
    throw new NeedlescriptError(
      `Expected a value, got "${tok.v !== undefined ? tok.v : tok.t}"`,
      tok.line,
    );
  }

  return parseProgram();
}
