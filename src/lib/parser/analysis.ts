// ---------- Static control-flow helpers for reporter-path checking ----------
//
// These are pure functions over the AST — no parser state needed. They live at
// module level so they can be inlined into test suites if needed, but logically
// they belong to the parse-time diagnostic pass in parseProgram().

import type { ASTNode, ExprNode } from '../types.ts';

/**
 * Walk every statement and expression in `stmts`, adding the name of every
 * procedure that appears in a value-producing position to `out`.
 * "Value-producing position" means either a `callexpr` (called in an expression
 * context) or a `procref` (@name reference passed to satin/fill/warp).
 */
export function collectValueUses(stmts: ASTNode[], out: Set<string>): void {
  for (const st of stmts) collectValueUsesStmt(st, out);
}

function collectValueUsesStmt(st: ASTNode, out: Set<string>): void {
  switch (st.k) {
    case 'to':
      collectValueUses(st.body, out);
      break;
    case 'repeat':
      collectValueUsesExpr(st.count, out);
      collectValueUses(st.body, out);
      break;
    case 'while':
      collectValueUsesExpr(st.cond, out);
      collectValueUses(st.body, out);
      break;
    case 'for':
      collectValueUsesExpr(st.from, out);
      collectValueUsesExpr(st.to, out);
      collectValueUsesExpr(st.step, out);
      collectValueUses(st.body, out);
      break;
    case 'forin':
      collectValueUsesExpr(st.list, out);
      collectValueUses(st.body, out);
      break;
    case 'if':
      collectValueUsesExpr(st.cond, out);
      collectValueUses(st.body, out);
      if (st.elseBody) collectValueUses(st.elseBody, out);
      break;
    case 'stitchscope':
      collectValueUses(st.body, out);
      break;
    case 'transform':
    case 'effect':
      st.args.forEach((e) => collectValueUsesExpr(e, out));
      collectValueUses(st.body, out);
      break;
    case 'make':
    case 'local':
      collectValueUsesExpr(st.value, out);
      break;
    case 'letlist':
      collectValueUsesExpr(st.value, out);
      break;
    case 'setindex':
      st.indices.forEach((e) => collectValueUsesExpr(e, out));
      collectValueUsesExpr(st.value, out);
      break;
    case 'output':
      if (st.value) collectValueUsesExpr(st.value, out);
      break;
    case 'cmd':
      st.args.forEach((e) => collectValueUsesExpr(e, out));
      break;
    case 'listcmd':
      st.args.forEach((e) => collectValueUsesExpr(e, out));
      break;
    case 'call':
      st.args.forEach((e) => collectValueUsesExpr(e, out));
      break;
    case 'fillarm':
      if (st.dirExpr) collectValueUsesExpr(st.dirExpr, out);
      if (st.shapeExpr) collectValueUsesExpr(st.shapeExpr, out);
      if (st.pathsExpr) collectValueUsesExpr(st.pathsExpr, out);
      break;
  }
}

function collectValueUsesExpr(expr: ExprNode, out: Set<string>): void {
  switch (expr.k) {
    case 'num':
    case 'var':
      break;
    case 'neg':
      collectValueUsesExpr(expr.val, out);
      break;
    case 'bin':
      collectValueUsesExpr(expr.left, out);
      collectValueUsesExpr(expr.right, out);
      break;
    case 'func':
    case 'listfunc':
      expr.args.forEach((e) => collectValueUsesExpr(e, out));
      break;
    case 'list':
      expr.items.forEach((e) => collectValueUsesExpr(e, out));
      break;
    case 'index':
      collectValueUsesExpr(expr.obj, out);
      collectValueUsesExpr(expr.idx, out);
      break;
    case 'callval':
      collectValueUsesExpr(expr.obj, out);
      expr.args.forEach((e) => collectValueUsesExpr(e, out));
      break;
    case 'callexpr':
      out.add(expr.name); // called in expression position → must return a value
      expr.args.forEach((e) => collectValueUsesExpr(e, out));
      break;
    case 'procref':
      out.add(expr.name); // @name reference → must return a value
      break;
  }
}

/**
 * True if `stmt` is guaranteed to terminate with a valued return on every
 * internal path — i.e. it acts as a "dominator" for the function exit.
 *
 * Conservative on loops: a `return` reachable only inside a `repeat`/`while`/
 * `for` body does NOT cover the path after the loop (the loop may run zero
 * times), matching the engine's existing runtime semantics.
 */
export function stmtAlwaysReturns(stmt: ASTNode): boolean {
  if (stmt.k === 'output') return stmt.value !== null; // valued return
  if (stmt.k === 'stitchscope') return allPathsReturn(stmt.body);
  if (stmt.k === 'if') {
    // Covers iff there is a final else AND both branches always return.
    return stmt.elseBody !== null && allPathsReturn(stmt.body) && allPathsReturn(stmt.elseBody);
  }
  return false;
}

/**
 * True if every execution path through `body` terminates with a valued return.
 * Equivalent to: there exists a statement in `body` that always returns
 * (because statements are sequential — once we hit a guaranteed return,
 * nothing after it matters).
 */
export function allPathsReturn(body: ASTNode[]): boolean {
  return body.some(stmtAlwaysReturns);
}
