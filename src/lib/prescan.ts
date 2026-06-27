// ---------- Pre-scan (signature + name pass) ----------
//
// One pass family over the token stream before parsing. It collects every
// name the parser needs to resolve bare identifiers at parse time:
//
//   1. procedures + arity      — from both `to` and `def` headers
//   2. global variable names   — `make "x`, top-level `let x =`, and
//                                top-level statement-position `x =` / `x op=`
//   3. per-procedure locals    — params, `local "x`, in-body `let x =`,
//                                and keyword-for counters
//
// All names are literal tokens (no computed names exist in the language), so
// the pre-scan is exact. Whether a registered name has a *value* at read time
// is a runtime concern (see the interpreter's never-assigned error).

import type { Token } from './types.ts';
import { NeedlescriptError } from './errors.ts';
import { RESERVED } from './commands.ts';
import { COMPOUND_ASSIGN_OPS } from './tokenizer.ts';

export interface PreScan {
  /** Procedure name → parameter count (from `to` and `def` headers). */
  procArity: Record<string, number>;
  /** Procedure name → line of its header (for collision error messages). */
  procLine: Record<string, number>;
  /** Procedure name → set of local variable names known in its body. */
  procLocals: Record<string, Set<string>>;
  /** Every name that may hold a global value somewhere in the program. */
  globalNames: Set<string>;
}

const isAssignOp = (tok: Token | undefined) =>
  !!tok && tok.t === 'op' && (tok.v === '=' || COMPOUND_ASSIGN_OPS.has(tok.v as string));

/**
 * Walk the token stream tracking procedure context: which procedure body the
 * current token sits in (`to … end` and `def … ( … ) [ … ]`), and whether we
 * are inside the bound expressions of a keyword `for` (where `to`/`step` are
 * contextual, not procedure headers).
 */
function walk(
  tokens: Token[],
  visit: (i: number, inProc: string | null, forBounds: boolean) => void,
): void {
  let inProc: string | null = null;
  let procEnd: { kind: 'end' } | { kind: 'bracket'; depth: number } | null = null;
  let depth = 0;
  let forBounds = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t === '[') {
      depth++;
      forBounds = false;
    } else if (tok.t === ']') {
      depth--;
      if (procEnd && procEnd.kind === 'bracket' && depth <= procEnd.depth) {
        inProc = null;
        procEnd = null;
      }
    } else if (tok.t === 'word') {
      const w = tok.v as string;
      if (w === 'end' && procEnd && procEnd.kind === 'end') {
        visit(i, inProc, forBounds);
        inProc = null;
        procEnd = null;
        continue;
      }
      if (w === 'for') {
        const n1 = tokens[i + 1];
        if (n1 && n1.t === 'word' && isAssignOp(tokens[i + 2])) forBounds = true;
      }
      if (w === 'to' && !forBounds) {
        const nameTok = tokens[i + 1];
        if (!nameTok || nameTok.t !== 'word')
          throw new NeedlescriptError('"to" must be followed by a procedure name', tok.line);
        inProc = nameTok.v as string;
        procEnd = { kind: 'end' };
      }
      if (w === 'def') {
        const nameTok = tokens[i + 1];
        if (!nameTok || nameTok.t !== 'word')
          throw new NeedlescriptError('"def" must be followed by a procedure name', tok.line);
        inProc = nameTok.v as string;
        procEnd = { kind: 'bracket', depth };
      }
    }
    visit(i, inProc, forBounds);
  }
}

export function prescan(tokens: Token[]): PreScan {
  const procArity: Record<string, number> = {};
  const procLine: Record<string, number> = {};
  const procLocals: Record<string, Set<string>> = {};
  const globalNames = new Set<string>();

  const localsOf = (p: string) => (procLocals[p] ??= new Set<string>());

  // Pass 1 — procedure signatures (needed before variables so assignment
  // targets that are really procedure names can be skipped).
  walk(tokens, (i, _inProc, forBounds) => {
    const tok = tokens[i];
    if (tok.t !== 'word') return;
    if (tok.v === 'to' && !forBounds) {
      const nameTok = tokens[i + 1];
      // walk() already validated nameTok is a word (or this `to` is a for-bound)
      if (!nameTok || nameTok.t !== 'word') return;
      const name = nameTok.v as string;
      let p = i + 2,
        n = 0;
      const params = localsOf(name);
      while (p < tokens.length && tokens[p].t === 'var') {
        params.add(tokens[p].v as string);
        n++;
        p++;
      }
      procArity[name] = n;
      procLine[name] = tok.line;
    } else if (tok.v === 'def') {
      const nameTok = tokens[i + 1];
      if (!nameTok || nameTok.t !== 'word') return;
      const name = nameTok.v as string;
      const open = tokens[i + 2];
      if (!open || open.t !== '(')
        throw new NeedlescriptError(
          `"def ${name}" needs a parameter list in parentheses, e.g.  def ${name}(size) [ … ]`,
          tok.line,
        );
      let p = i + 3,
        n = 0;
      const params = localsOf(name);
      while (p < tokens.length && tokens[p].t !== ')') {
        if (tokens[p].t === 'word') {
          params.add(tokens[p].v as string);
          n++;
        }
        p++;
      }
      procArity[name] = n;
      procLine[name] = tok.line;
    }
  });

  const register = (name: string, inProc: string | null, forceLocal = false) => {
    if (RESERVED.has(name) || procArity[name] !== undefined) return;
    if (inProc && (forceLocal || localsOf(inProc).has(name))) localsOf(inProc).add(name);
    else globalNames.add(name);
  };

  // Pass 2a — explicit declarations (local / let / for counters / make).
  walk(tokens, (i, inProc) => {
    const tok = tokens[i];
    if (tok.t !== 'word') return;
    const nxt = tokens[i + 1];
    switch (tok.v) {
      case 'make':
        if (nxt && nxt.t === 'qword') register(nxt.v as string, null);
        break;
      case 'local':
        if (nxt && nxt.t === 'qword' && inProc) register(nxt.v as string, inProc, true);
        break;
      case 'let':
        if (nxt && nxt.t === 'word' && isAssignOp(tokens[i + 2]))
          register(nxt.v as string, inProc, true);
        // Destructuring:  let [x, y] = e  — register each name.
        else if (nxt && nxt.t === '[') {
          let p = i + 2;
          while (p < tokens.length && tokens[p].t !== ']') {
            if (tokens[p].t === 'word') register(tokens[p].v as string, inProc, true);
            p++;
          }
        }
        break;
      case 'for':
        // Counters live in the enclosing scope while the loop runs (and are
        // restored afterwards) — register so bare reads in the body resolve.
        if (nxt && nxt.t === 'qword') register(nxt.v as string, inProc, true);
        else if (nxt && nxt.t === 'word' && isAssignOp(tokens[i + 2]))
          register(nxt.v as string, inProc, true);
        // for-in (RFC-2):  for x in xs [ … ]
        else if (
          nxt &&
          nxt.t === 'word' &&
          tokens[i + 2] &&
          tokens[i + 2].t === 'word' &&
          tokens[i + 2].v === 'in'
        )
          register(nxt.v as string, inProc, true);
        break;
    }
  });

  // Pass 2b — statement-position assignment targets ( x = … / x += … ).
  // The token-level heuristic "word followed by an assignment operator" also
  // matches comparisons like `if x = 1`; that only ever *adds* a candidate
  // name, which at worst turns a parse-time "unknown name" into a runtime
  // "never assigned" — never a misparse, because reserved words and procedure
  // names are excluded.
  walk(tokens, (i, inProc) => {
    const tok = tokens[i];
    if (tok.t !== 'word') return;
    if (isAssignOp(tokens[i + 1])) register(tok.v as string, inProc);
  });

  return { procArity, procLine, procLocals, globalNames };
}
