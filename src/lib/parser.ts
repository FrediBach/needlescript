// ---------- Parser ----------
//
// Accepts both classic Logo syntax and the modern syntax (RFC-1). Every
// modern form lowers to an existing AST node, so the interpreter, stitch
// machine and exports are untouched. Legacy syntax remains valid.

import type { ASTNode, ExprNode, Token } from './types.ts';
import { NeedlescriptError } from './errors.ts';
import { ALIASES, BUILTIN_ARITY, QWORD_BUILTINS, FUNC_ARITY, ZERO_FUNCS, RESERVED } from './commands.ts';
import { didYouMean, didYouMeanKinded } from './suggestions.ts';
import { prescan } from './prescan.ts';
import { COMPOUND_ASSIGN_OPS } from './tokenizer.ts';

const COMPARE_OPS = new Set(['<', '>', '=', '<=', '>=', '!=']);

export function parse(tokens: Token[]): ASTNode[] {
  // Pre-scan procedures, globals and per-procedure locals so both call arity
  // and bare-name resolution are known at parse time.
  const ps = prescan(tokens);
  const procArity = ps.procArity;

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

  /** Parse a parenthesised argument list:  ( expr {, expr} [,] )  */
  function parseParenArgs(callee: string, arity: number, line: number): ExprNode[] {
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
    if (args.length !== arity)
      throw new NeedlescriptError(
        `${callee}(…) expects ${arity} argument${arity === 1 ? '' : 's'}, got ${args.length}`,
        line,
      );
    return args;
  }

  function parseStatement(): ASTNode {
    const tok = peek();
    if (!tok) throw new NeedlescriptError('Unexpected end of program');
    if (tok.t === ',')
      throw new NeedlescriptError(
        'Commas can only separate arguments inside call parentheses, e.g.  setxy(10, 20)',
        tok.line,
      );
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
        procArity[w] !== undefined || isVariableName(w);
      const startsValue = !!nxt && (
        nxt.t === 'num' || nxt.t === 'var' || nxt.t === '(' ||
        (nxt.t === 'op' && nxt.v === '-') ||
        (nxt.t === 'word' && isValueWord(nxt.v as string))
      );
      // return expr ≡ output expr; bare return ≡ exit
      return { k: 'output', value: startsValue ? parseExpr() : null, line: tok.line };
    }

    if (name === 'repeat') {
      next();
      const count = parseExpr();
      const body = parseBracketBlock();
      return { k: 'repeat', count, body, line: tok.line };
    }

    if (name === 'while') {
      next();
      const cond = parseExpr();
      const body = parseBracketBlock();
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
        const step = parseExpr();
        const body = parseBracketBlock();
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
        const toExpr = parseExpr();
        let step: ExprNode = { k: 'num', v: 1 };
        if (!atEnd() && peek().t === 'word' && peek().v === 'step') {
          next();
          step = parseExpr();
        }
        const body = parseBracketBlock();
        return { k: 'for', varName: w, from, to: toExpr, step, body, line: tok.line };
      }
      throw new NeedlescriptError(
        'for needs a counter, e.g.  for i = 1 to 10 [ … ]  (or classic:  for "i 1 10 1 [ … ])',
        tok.line,
      );
    }

    if (name === 'if') {
      next();
      const cond = parseExpr();
      const body = parseBracketBlock();
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
      if (QWORD_BUILTINS[canonical])
        throw new NeedlescriptError(
          `${canonical} takes a quoted word, e.g.  ${canonical} "${QWORD_BUILTINS[canonical][0]}"`,
          tok.line,
        );
      if (FUNC_ARITY[name] !== undefined || ZERO_FUNCS.has(name))
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

    if (isVariableName(name))
      throw new NeedlescriptError(
        `"${name}" is a variable — assign with  ${name} = …`,
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

  function parsePrimary(): ExprNode {
    const tok = peek();
    if (!tok) throw new NeedlescriptError('Expected a value but the program ended');
    if (tok.t === 'num') { next(); return { k: 'num', v: tok.v as number }; }
    if (tok.t === 'var') {
      next();
      return { k: 'var', name: tok.v as string, line: tok.line };
    }
    if (tok.t === ',')
      throw new NeedlescriptError(
        'Commas can only separate arguments inside call parentheses, e.g.  setxy(10, 20)',
        tok.line,
      );
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
      return e;
    }
    if (tok.t === 'word') {
      const w = tok.v as string;

      // Call syntax: name(args) — only when ( is glued to the name; with a
      // space between,  f (10)  keeps its Logo meaning (grouped expression).
      if (gluedParenNext(tok)) {
        if (FUNC_ARITY[w] !== undefined) {
          next();
          return { k: 'func', name: w, args: parseParenArgs(w, FUNC_ARITY[w], tok.line), line: tok.line };
        }
        if (ZERO_FUNCS.has(w)) {
          next();
          return { k: 'func', name: w, args: parseParenArgs(w, 0, tok.line), line: tok.line };
        }
        if (procArity[w] !== undefined) {
          next();
          return { k: 'callexpr', name: w, args: parseParenArgs(w, procArity[w], tok.line), line: tok.line };
        }
        if (isVariableName(w))
          throw new NeedlescriptError(`"${w}" is a variable, not a procedure`, tok.line);
        if (BUILTIN_ARITY[ALIASES[w] || w] !== undefined)
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
        return { k: 'var', name: w, line: tok.line, bare: true };
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
