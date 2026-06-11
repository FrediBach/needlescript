// ---------- Parser ----------

import type { ASTNode, ExprNode, Token } from './types.ts';
import { NeedlescriptError } from './errors.ts';
import { ALIASES, BUILTIN_ARITY, QWORD_BUILTINS, FUNC_ARITY, ZERO_FUNCS, RESERVED } from './commands.ts';
import { didYouMean } from './suggestions.ts';

const COMPARE_OPS = new Set(['<', '>', '=', '<=', '>=', '!=']);

export function parse(tokens: Token[]): ASTNode[] {
  // Pre-scan procedure signatures so call arity is known at parse time.
  const procArity: Record<string, number> = {};
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (tok.t === 'word' && tok.v === 'to') {
      const nameTok = tokens[k + 1];
      if (!nameTok || nameTok.t !== 'word')
        throw new NeedlescriptError('"to" must be followed by a procedure name', tok.line);
      let p = k + 2, n = 0;
      while (p < tokens.length && tokens[p].t === 'var') { n++; p++; }
      procArity[nameTok.v as string] = n;
    }
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const atEnd = () => pos >= tokens.length;
  const lineOf = (tok?: Token) =>
    tok ? tok.line : (tokens.length ? tokens[tokens.length - 1].line : 1);

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

  function parseStatement(): ASTNode {
    const tok = peek();
    if (!tok) throw new NeedlescriptError('Unexpected end of program');
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
      const params: string[] = [];
      while (!atEnd() && peek().t === 'var') params.push(next().v as string);
      const body: ASTNode[] = [];
      while (!atEnd() && !(peek().t === 'word' && peek().v === 'end'))
        body.push(parseStatement());
      if (atEnd())
        throw new NeedlescriptError(`Procedure "${nameTok.v}" is missing "end"`, tok.line);
      next(); // consume end
      return { k: 'to', name: nameTok.v as string, params, body, line: tok.line };
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
      const nm = next();
      if (!nm || nm.t !== 'qword')
        throw new NeedlescriptError(
          'for needs a quoted counter name, e.g.  for "i 0 10 1 [ … ]',
          tok.line,
        );
      const from = parseExpr();
      const to = parseExpr();
      const step = parseExpr();
      const body = parseBracketBlock();
      return { k: 'for', varName: nm.v as string, from, to, step, body, line: tok.line };
    }

    if (name === 'if') {
      next();
      const cond = parseExpr();
      const body = parseBracketBlock();
      let elseBody: ASTNode[] | null = null;
      if (!atEnd() && peek().t === 'word' && peek().v === 'else') {
        next();
        elseBody = parseBracketBlock();
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

    throw new NeedlescriptError(
      `Unknown command "${name}"${didYouMean(name, [...RESERVED, ...Object.keys(procArity)])}`,
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
    while (!atEnd() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v as string;
      left = { k: 'bin', op, left, right: parseUnary() };
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
    if (tok.t === '(') {
      next();
      const e = parseExpr();
      if (atEnd() || peek().t !== ')') throw new NeedlescriptError('Missing )', tok.line);
      next();
      return e;
    }
    if (tok.t === 'word') {
      const w = tok.v as string;
      if (FUNC_ARITY[w] !== undefined) {
        next();
        const args: ExprNode[] = [];
        for (let a = 0; a < FUNC_ARITY[w]; a++)
          args.push(FUNC_ARITY[w] > 1 ? parseExpr() : parseUnary());
        return { k: 'func', name: w, args, line: tok.line };
      }
      if (ZERO_FUNCS.has(w)) {
        next();
        return { k: 'func', name: w, args: [], line: tok.line };
      }
      // User procedure used as a reporter (must "output" a value)
      if (procArity[w] !== undefined) {
        next();
        const args: ExprNode[] = [];
        for (let a = 0; a < procArity[w]; a++) args.push(parseExpr());
        return { k: 'callexpr', name: w, args, line: tok.line };
      }
      throw new NeedlescriptError(
        `"${w}" is not a value${didYouMean(w, [
          ...Object.keys(FUNC_ARITY),
          ...ZERO_FUNCS,
          ...Object.keys(procArity),
        ])}`,
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
