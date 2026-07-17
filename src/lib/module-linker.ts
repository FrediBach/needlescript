import { LIBRARY_FUNCS, RESERVED } from './commands.ts';
import { NeedlescriptError } from './errors.ts';
import { parse, type KnownProcedure } from './parser/index.ts';
import { allPathsReturn, collectValueUses } from './parser/analysis.ts';
import { resolveStandardModule } from './standard-library/index.ts';
import { tokenize } from './tokenizer.ts';
import type { ASTNode, ExprNode, Token } from './types.ts';

interface ImportDirective {
  moduleId: string;
  exportName: string;
  alias: string;
  line: number;
}

interface ModuleDirectives {
  body: Token[];
  imports: ImportDirective[];
  exports: Map<string, number>;
}

interface LinkedExport extends KnownProcedure {
  qualifiedName: string;
}

interface LinkedModule {
  exports: Map<string, LinkedExport>;
}

const IDENTIFIER = /^[a-z_][a-z0-9_?]*$/;

function readImport(tokens: Token[], index: number): ImportDirective {
  const importToken = tokens[index];
  const pathToken = tokens[index + 1];
  const asToken = tokens[index + 2];
  const aliasToken = tokens[index + 3];
  if (
    pathToken?.t !== 'word' ||
    asToken?.t !== 'word' ||
    asToken.v !== 'as' ||
    aliasToken?.t !== 'word'
  ) {
    throw new NeedlescriptError(
      'import syntax is: import std.module.name as localname',
      importToken.line,
    );
  }
  const specifier = pathToken.v as string;
  const dot = specifier.lastIndexOf('.');
  if (dot <= 0 || dot === specifier.length - 1)
    throw new NeedlescriptError(
      `Import "${specifier}" must name a module and exported procedure`,
      pathToken.line,
    );
  const alias = aliasToken.v as string;
  if (!IDENTIFIER.test(alias))
    throw new NeedlescriptError(`Invalid import alias "${alias}"`, aliasToken.line);
  if (RESERVED.has(alias) || LIBRARY_FUNCS.has(alias))
    throw new NeedlescriptError(
      `"${alias}" is a built-in word and can't be an import alias`,
      aliasToken.line,
    );
  return {
    moduleId: specifier.slice(0, dot),
    exportName: specifier.slice(dot + 1),
    alias,
    line: importToken.line,
  };
}

function extractDirectives(tokens: Token[], sourceName: string): ModuleDirectives {
  const body: Token[] = [];
  const imports: ImportDirective[] = [];
  const exports = new Map<string, number>();
  const aliases = new Set<string>();
  let bracketDepth = 0;
  let classicProcedure = false;
  let topLevelForHeader = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.t === 'word' && (token.v === 'import' || token.v === 'export')) {
      if (bracketDepth > 0 || classicProcedure)
        throw new NeedlescriptError(`"${token.v}" is only valid at the top level`, token.line);
      if (token.v === 'import') {
        const directive = readImport(tokens, i);
        if (aliases.has(directive.alias))
          throw new NeedlescriptError(`Duplicate import alias "${directive.alias}"`, token.line);
        aliases.add(directive.alias);
        imports.push(directive);
        i += 3;
        continue;
      }

      const defToken = tokens[i + 1];
      const nameToken = tokens[i + 2];
      if (
        defToken?.t !== 'word' ||
        (defToken.v !== 'def' && defToken.v !== 'to') ||
        nameToken?.t !== 'word'
      ) {
        throw new NeedlescriptError(
          'export must prefix a procedure definition: export def name(…) [ … ]',
          token.line,
        );
      }
      const name = nameToken.v as string;
      if (exports.has(name))
        throw new NeedlescriptError(`Procedure "${name}" is exported more than once`, token.line);
      exports.set(name, token.line);
      continue;
    }

    body.push(token);
    if (token.t === '[') {
      bracketDepth++;
      topLevelForHeader = false;
    } else if (token.t === ']') bracketDepth--;
    else if (token.t === 'word' && token.v === 'for' && bracketDepth === 0 && !classicProcedure)
      topLevelForHeader = true;
    else if (token.t === 'word' && token.v === 'to' && bracketDepth === 0 && !topLevelForHeader)
      classicProcedure = true;
    else if (token.t === 'word' && token.v === 'end' && classicProcedure) classicProcedure = false;
  }

  if (bracketDepth !== 0)
    throw new NeedlescriptError(`Unbalanced brackets while reading module ${sourceName}`);
  return { body, imports, exports };
}

function rewriteExpr(expr: ExprNode, names: ReadonlyMap<string, string>): void {
  switch (expr.k) {
    case 'num':
    case 'str':
    case 'var':
      return;
    case 'neg':
      rewriteExpr(expr.val, names);
      return;
    case 'bin':
      rewriteExpr(expr.left, names);
      rewriteExpr(expr.right, names);
      return;
    case 'func':
    case 'listfunc':
      expr.args.forEach((arg) => rewriteExpr(arg, names));
      return;
    case 'list':
      expr.items.forEach((item) => rewriteExpr(item, names));
      return;
    case 'index':
      rewriteExpr(expr.obj, names);
      rewriteExpr(expr.idx, names);
      return;
    case 'callval':
      rewriteExpr(expr.obj, names);
      expr.args.forEach((arg) => rewriteExpr(arg, names));
      return;
    case 'callexpr':
      expr.name = names.get(expr.name) ?? expr.name;
      expr.args.forEach((arg) => rewriteExpr(arg, names));
      return;
    case 'procref':
      expr.name = names.get(expr.name) ?? expr.name;
      return;
    case 'trace':
      rewriteStatements(expr.body, names);
      return;
  }
}

function rewriteStatements(stmts: ASTNode[], names: ReadonlyMap<string, string>): void {
  for (const stmt of stmts) {
    switch (stmt.k) {
      case 'to':
        stmt.name = names.get(stmt.name) ?? stmt.name;
        rewriteStatements(stmt.body, names);
        break;
      case 'repeat':
        rewriteExpr(stmt.count, names);
        rewriteStatements(stmt.body, names);
        break;
      case 'while':
        rewriteExpr(stmt.cond, names);
        rewriteStatements(stmt.body, names);
        break;
      case 'for':
        rewriteExpr(stmt.from, names);
        rewriteExpr(stmt.to, names);
        rewriteExpr(stmt.step, names);
        rewriteStatements(stmt.body, names);
        break;
      case 'forin':
        rewriteExpr(stmt.list, names);
        rewriteStatements(stmt.body, names);
        break;
      case 'if':
        rewriteExpr(stmt.cond, names);
        rewriteStatements(stmt.body, names);
        if (stmt.elseBody) rewriteStatements(stmt.elseBody, names);
        break;
      case 'transform':
      case 'effect':
        stmt.args.forEach((arg) => rewriteExpr(arg, names));
        rewriteStatements(stmt.body, names);
        break;
      case 'make':
      case 'local':
        rewriteExpr(stmt.value, names);
        break;
      case 'letlist':
        rewriteExpr(stmt.value, names);
        break;
      case 'setindex':
        stmt.indices.forEach((index) => rewriteExpr(index, names));
        rewriteExpr(stmt.value, names);
        break;
      case 'output':
        if (stmt.value) rewriteExpr(stmt.value, names);
        break;
      case 'cmd':
      case 'listcmd':
        stmt.args.forEach((arg) => rewriteExpr(arg, names));
        break;
      case 'fillarm':
        if (stmt.dirRef) stmt.dirRef = names.get(stmt.dirRef) ?? stmt.dirRef;
        if (stmt.shapeRef) stmt.shapeRef = names.get(stmt.shapeRef) ?? stmt.shapeRef;
        if (stmt.pathsRef) stmt.pathsRef = names.get(stmt.pathsRef) ?? stmt.pathsRef;
        if (stmt.pathsExpr) rewriteExpr(stmt.pathsExpr, names);
        break;
      case 'call':
        stmt.name = names.get(stmt.name) ?? stmt.name;
        stmt.args.forEach((arg) => rewriteExpr(arg, names));
        break;
      case 'break':
      case 'continue':
        break;
    }
  }
}

function validateLinkedReporters(
  program: ASTNode[],
  publicNames: ReadonlyMap<string, string>,
): void {
  const usedAsValue = new Set<string>();
  collectValueUses(program, usedAsValue);
  for (const stmt of program) {
    if (stmt.k !== 'to' || !usedAsValue.has(stmt.name) || allPathsReturn(stmt.body)) continue;
    const displayName = publicNames.get(stmt.name) ?? stmt.name;
    throw new NeedlescriptError(
      `Reporter "${displayName}" may finish without returning a value.\n` +
        'A procedure used as a value must reach return/output on every path.',
      stmt.line,
    );
  }
}

/** Link bundled `std.*` imports, returning one ordinary interpreter program. */
export function linkStandardModules(rootTokens: Token[], notes?: string[]): ASTNode[] {
  const linkedStatements: ASTNode[] = [];
  const modules = new Map<string, LinkedModule>();
  const visiting = new Set<string>();
  const publicNames = new Map<string, string>();

  const linkModule = (moduleId: string): LinkedModule => {
    const cached = modules.get(moduleId);
    if (cached) return cached;
    if (visiting.has(moduleId))
      throw new NeedlescriptError(`Circular standard-library import involving "${moduleId}"`);
    if (!moduleId.startsWith('std.'))
      throw new NeedlescriptError(
        `Only bundled standard-library imports are available for now; got "${moduleId}"`,
      );
    const source = resolveStandardModule(moduleId);
    if (source === undefined)
      throw new NeedlescriptError(`Unknown standard-library module "${moduleId}"`);

    visiting.add(moduleId);
    const directives = extractDirectives(tokenize(source), moduleId);
    const importedNames = new Map<string, string>();
    const known: Record<string, KnownProcedure> = Object.create(null);
    for (const imported of directives.imports) {
      const dependency = linkModule(imported.moduleId);
      const target = dependency.exports.get(imported.exportName);
      if (!target)
        throw new NeedlescriptError(
          `Module "${imported.moduleId}" does not export "${imported.exportName}"`,
          imported.line,
        );
      importedNames.set(imported.alias, target.qualifiedName);
      known[imported.alias] = target;
    }

    const ast = parse(directives.body, notes, known);
    if (ast.some((stmt) => stmt.k !== 'to'))
      throw new NeedlescriptError(
        `Standard-library module "${moduleId}" may only contain imports and procedure definitions`,
      );
    const localNames = new Map(importedNames);
    for (const stmt of ast) {
      if (stmt.k === 'to') localNames.set(stmt.name, `${moduleId}.${stmt.name}`);
    }
    rewriteStatements(ast, localNames);

    const linkedExports = new Map<string, LinkedExport>();
    for (const [name, line] of directives.exports) {
      const definition = ast.find(
        (stmt): stmt is ASTNode & { k: 'to' } =>
          stmt.k === 'to' && stmt.name === `${moduleId}.${name}`,
      );
      if (!definition)
        throw new NeedlescriptError(`Export "${name}" has no procedure definition`, line);
      linkedExports.set(name, {
        arity: definition.params.length,
        line,
        qualifiedName: definition.name,
      });
    }
    const linked = { exports: linkedExports };
    modules.set(moduleId, linked);
    linkedStatements.push(...ast);
    visiting.delete(moduleId);
    return linked;
  };

  const root = extractDirectives(rootTokens, 'the main program');
  const rootNames = new Map<string, string>();
  const known: Record<string, KnownProcedure> = Object.create(null);
  for (const imported of root.imports) {
    const module = linkModule(imported.moduleId);
    const target = module.exports.get(imported.exportName);
    if (!target)
      throw new NeedlescriptError(
        `Module "${imported.moduleId}" does not export "${imported.exportName}"`,
        imported.line,
      );
    rootNames.set(imported.alias, target.qualifiedName);
    known[imported.alias] = target;
    publicNames.set(target.qualifiedName, imported.alias);
  }
  const rootAst = parse(root.body, notes, known);
  rewriteStatements(rootAst, rootNames);
  const program = [...linkedStatements, ...rootAst];
  validateLinkedReporters(program, publicNames);
  return program;
}
