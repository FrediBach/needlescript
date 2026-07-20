import { NS_ITEM_MAP } from './catalog.ts';
import { STANDARD_LIBRARY_PROCEDURES } from '../../language/standard-library/index.ts';
import { LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURE_MAP } from '../../language/reference.ts';

const STANDARD_LIBRARY_PROCEDURE_MAP = new Map(
  STANDARD_LIBRARY_PROCEDURES.map((procedure) => [
    `${procedure.moduleId}.${procedure.name}`,
    procedure,
  ]),
);

// ── Helper: walk text backwards to find the active function call context ─────
//
// Returns the function name and the 0-based active parameter index, or null if
// the cursor is not inside a function call.  Handles nested parens/brackets.
//
export function getSignatureContext(
  textBeforeCursor: string,
): { name: string; paramIndex: number } | null {
  let depth = 0;
  let paramIndex = 0;

  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const ch = textBeforeCursor[i];
    if (ch === ')') {
      depth++;
    } else if (ch === '(') {
      if (depth === 0) {
        // Found the opening paren — extract the identifier before it.
        const before = textBeforeCursor.slice(0, i).trimEnd();
        const m = before.match(/([a-z_][a-z0-9_]*)$/i);
        if (!m) return null;
        return { name: m[1].toLowerCase(), paramIndex };
      }
      depth--;
    } else if (ch === '[') {
      // Hit a block delimiter — we're no longer in a function call.
      if (depth === 0) return null;
      depth--;
    } else if (ch === ']') {
      depth++;
    } else if (ch === ',' && depth === 0) {
      paramIndex++;
    }
  }

  return null;
}

// ── Helper: convert a character offset to a 1-based line number ──────────────
//
// Counts newline characters in `text` up to `offset`. Used by extractUserSymbols
// to attach definition locations to user-defined symbols.

function offsetToLine(text: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

// ── Helper: return only the code portion of a source line ────────────────────
//
// Strips content starting from the first line-comment marker (// # ;) so the
// folding-range provider ignores brackets that appear inside comments.

export function codePortionOfLine(line: string): string {
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if ((c === '/' && line[i + 1] === '/') || c === '#' || c === ';') {
      return line.slice(0, i);
    }
  }
  return line;
}

// ── Helper: scan document text for user-defined procedures and variables ──────
export interface UserSymbol {
  label: string;
  kindName: 'function' | 'variable';
  detail: string;
  params?: string[]; // parameter names (for procedures)
  line: number; // 1-based line number of the definition in the source
  documentation?: string;
}

export interface ImportCompletionContext {
  partialPath: string;
  startColumn: number;
}

/** Return the standard-library path being typed in a top-level import line. */
export function getImportCompletionContext(
  lineBeforeCursor: string,
): ImportCompletionContext | null {
  const code = codePortionOfLine(lineBeforeCursor);
  const match = code.match(/^\s*import\s+([a-z0-9_.]*)$/i);
  if (!match) return null;

  return {
    partialPath: match[1].toLowerCase(),
    startColumn: match.index! + match[0].length - match[1].length + 1,
  };
}

export function extractUserSymbols(text: string): UserSymbol[] {
  const seen = new Set<string>();
  const symbols: UserSymbol[] = [];

  const add = (sym: UserSymbol) => {
    if (!seen.has(sym.label) && !NS_ITEM_MAP.has(sym.label)) {
      seen.add(sym.label);
      symbols.push(sym);
    }
  };

  // Bundled import: import std.module.export as alias
  const importedProc =
    /\bimport\s+(std(?:\.[a-z_][a-z0-9_]*)+)\.([a-z_][a-z0-9_]*)\s+as\s+([a-z_][a-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = importedProc.exec(text)) !== null) {
    const importPath = `${m[1]}.${m[2]}`.toLowerCase();
    const procedure = STANDARD_LIBRARY_PROCEDURE_MAP.get(importPath);
    if (!procedure) continue;

    const alias = m[3].toLowerCase();
    const params = [...procedure.params];
    const reference = LANGUAGE_REFERENCE_STANDARD_LIBRARY_PROCEDURE_MAP.get(importPath);
    add({
      label: alias,
      kindName: 'function',
      detail: `imported ${procedure.name}(${params.join(', ')})`,
      params,
      line: offsetToLine(text, m.index),
      documentation: reference
        ? `${reference.documentation}\n\nImported from \`${importPath}\`.`
        : `Imported from \`${importPath}\`.`,
    });
  }

  // Modern procedure: def name(a, b) [
  const modernProc = /\bdef\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi;
  while ((m = modernProc.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const rawParams = m[2].trim();
    const params = rawParams ? rawParams.split(',').map((p) => p.trim().replace(/^:/, '')) : [];
    add({
      label: name,
      kindName: 'function',
      detail: `procedure(${params.join(', ')})`,
      params,
      line: offsetToLine(text, m.index),
    });
  }

  // Classic procedure: to name :a :b
  const classicProc = /\bto\s+([a-z_][a-z0-9_]*)((?:\s+:[a-z_][a-z0-9_]*)*)/gi;
  while ((m = classicProc.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const rawParams = m[2].trim();
    const params = rawParams
      ? rawParams
          .split(/\s+/)
          .filter(Boolean)
          .map((p) => p.replace(/^:/, ''))
      : [];
    add({
      label: name,
      kindName: 'function',
      detail: `procedure(${params.join(', ')})`,
      params,
      line: offsetToLine(text, m.index),
    });
  }

  // Modern variable: let name =
  const letVar = /\blet\s+([a-z_][a-z0-9_]*)\s*[=]/gi;
  while ((m = letVar.exec(text)) !== null) {
    add({
      label: m[1].toLowerCase(),
      kindName: 'variable',
      detail: 'variable',
      line: offsetToLine(text, m.index),
    });
  }

  // Classic variable: make "name
  const makeVar = /\bmake\s+"([a-z_][a-z0-9_]*)/gi;
  while ((m = makeVar.exec(text)) !== null) {
    add({
      label: m[1].toLowerCase(),
      kindName: 'variable',
      detail: 'variable (make)',
      line: offsetToLine(text, m.index),
    });
  }

  return symbols;
}
