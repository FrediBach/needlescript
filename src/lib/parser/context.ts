// ---------- Parser context ----------
//
// Shared mutable state for the recursive-descent parser, plus utility
// methods and cross-module function references used to break the mutual
// dependency between the expression and statement sub-parsers.

import type { ASTNode, ExprNode, Token } from '../types.ts';
import type { PreScan } from '../prescan.ts';
import type { NeedlescriptError } from '../errors.ts';

export interface ParseContext {
  // ---- Tokens and diagnostic output ----
  tokens: Token[];
  notes: string[] | undefined;

  // ---- Mutable parser state ----
  /** Current token cursor. */
  pos: number;
  /** Name of the procedure being parsed, or null at top level. */
  currentProc: string | null;
  /**
   * How many loop bodies enclose the current parse position (RFC-4).
   * Resets to 0 inside a `to`/`def` body.
   */
  loopDepth: number;
  /** Global names declared via `let`/`make`/assignment (for double-let detection). */
  declaredGlobal: Set<string>;
  /** Per-procedure declared names (params, `let`, `local`). */
  declaredLocal: Record<string, Set<string>>;
  /** True while parsing the header expression of repeat/while/if/for (RFC-2 §3.1). */
  headerCtx: boolean;
  /** Last glued-index seen in a header expression, for `[` disambiguation errors. */
  lastHeaderIndex: { name: string; line: number } | null;
  /** Library-tier names already noted as shadowed (one note per name, §3). */
  shadowNoted: Set<string>;
  /** Procedure name → parameter count (from prescan). */
  procArity: Record<string, number>;
  /** Full prescan result. */
  ps: PreScan;

  // ---- Token stream utilities ----
  peek(): Token | undefined;
  next(): Token;
  atEnd(): boolean;
  lineOf(tok?: Token): number;
  declaredScope(): Set<string>;
  isLocalName(w: string): boolean;
  isVariableName(w: string): boolean;
  isAssignTok(tok?: Token): boolean;
  /** Is the `(` immediately after the current token glued to it (call syntax)? */
  gluedParenNext(tok: Token): boolean;

  // ---- Diagnostic helpers ----
  headerIndexHint(name: string, line: number): NeedlescriptError;
  builtinKind(w: string): string | null;
  checkBindable(name: string, what: string, line: number): void;
  checkParam(p: string, line: number, params: string[]): void;
  nameCandidates(): Map<string, string>;
  noteLibraryShadow(name: string): void;

  // ---- Cross-module parser function references ----
  // These break the mutual dependency between expressions.ts and statements.ts.
  // Wired in index.ts after all modules are loaded.
  parseExpr(): ExprNode;
  parsePrimary(): ExprNode;
  parseBracketBlock(): ASTNode[];
  parseParenArgs(callee: string, arity: number, line: number): ExprNode[];
  parseParenArgsRange(callee: string, min: number, max: number, line: number): ExprNode[];
}
