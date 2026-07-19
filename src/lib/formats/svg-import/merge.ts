// Safe program merging for staged SVG append mode. The base program is
// inventoried with the real NeedleScript tokenizer/pre-scan so generated
// bindings cannot shadow existing variables, procedures, or import aliases.

import { RESERVED } from '../../language/commands.ts';
import { NeedlescriptError } from '../../core/errors.ts';
import { prescan } from '../../language/prescan.ts';
import { tokenize } from '../../language/tokenizer.ts';
import { emit, type EmitOptions, type EmitResult } from './emit.ts';
import type { StagedDocument } from './model.ts';

export interface ProgramImport {
  specifier: string;
  alias: string;
}

export interface ProgramInventory {
  usedNames: Set<string>;
  imports: ProgramImport[];
}

export interface AppendEmitResult extends EmitResult {
  /** The append-only fragment before it is merged with the base program. */
  fragmentCode: string;
}

function importFromTokens(source: string): ProgramImport {
  const tokens = tokenize(source);
  const [keyword, specifier, asKeyword, alias, ...rest] = tokens;
  if (
    keyword?.t !== 'word' ||
    keyword.v !== 'import' ||
    specifier?.t !== 'word' ||
    asKeyword?.t !== 'word' ||
    asKeyword.v !== 'as' ||
    alias?.t !== 'word' ||
    rest.length > 0
  ) {
    throw new NeedlescriptError(`Invalid generated import requirement: ${source}`);
  }
  return { specifier: String(specifier.v), alias: String(alias.v) };
}

export function inventoryProgram(source: string): ProgramInventory {
  const tokens = tokenize(source);
  const scan = prescan(tokens);
  const usedNames = new Set<string>([
    ...RESERVED,
    ...scan.globalNames,
    ...Object.keys(scan.procArity),
  ]);
  const imports: ProgramImport[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.t !== 'word' || token.v !== 'import') continue;
    const specifier = tokens[index + 1];
    const asKeyword = tokens[index + 2];
    const alias = tokens[index + 3];
    if (
      specifier?.t !== 'word' ||
      asKeyword?.t !== 'word' ||
      asKeyword.v !== 'as' ||
      alias?.t !== 'word'
    ) {
      throw new NeedlescriptError(
        'import syntax is: import std.module.name as localname',
        token.line,
      );
    }
    const requirement = { specifier: String(specifier.v), alias: String(alias.v) };
    imports.push(requirement);
    usedNames.add(requirement.alias);
    index += 3;
  }

  return { usedNames, imports };
}

function lineCount(source: string): number {
  return source === '' ? 0 : source.split('\n').length;
}

/** Merge an already collision-safe append fragment into a base program. */
export function mergeAppend(baseSource: string, fragment: EmitResult): AppendEmitResult {
  const inventory = inventoryProgram(baseSource);
  const existingByAlias = new Map(
    inventory.imports.map((requirement) => [requirement.alias, requirement.specifier]),
  );
  const missingImports: string[] = [];

  for (const line of fragment.imports) {
    const requirement = importFromTokens(line);
    const existingSpecifier = existingByAlias.get(requirement.alias);
    if (existingSpecifier === requirement.specifier) continue;
    if (existingSpecifier !== undefined) {
      throw new NeedlescriptError(
        `Append import alias "${requirement.alias}" already refers to "${existingSpecifier}"`,
      );
    }
    if (inventory.usedNames.has(requirement.alias)) {
      throw new NeedlescriptError(
        `Append import alias "${requirement.alias}" conflicts with an existing name`,
      );
    }
    missingImports.push(line);
    existingByAlias.set(requirement.alias, requirement.specifier);
    inventory.usedNames.add(requirement.alias);
  }

  const base = baseSource.trimEnd();
  const mergedBase = [missingImports.join('\n'), base].filter(Boolean).join('\n');
  const fragmentCode = [...fragment.preamble, ...fragment.body].join('\n');
  const fragmentStart = mergedBase ? lineCount(mergedBase) + 2 : 1;
  const code = mergedBase ? `${mergedBase}\n\n${fragmentCode}` : fragmentCode;
  const fragmentImportLines = fragment.imports.length;
  const sewSpans = Object.fromEntries(
    Object.entries(fragment.sewSpans).map(([id, span]) => [
      id,
      {
        start: span.start - fragmentImportLines + fragmentStart - 1,
        end: span.end - fragmentImportLines + fragmentStart - 1,
      },
    ]),
  );

  return { ...fragment, code, fragmentCode: fragment.code, sewSpans };
}

/** Emit and merge in one step so name allocation sees the current program. */
export function emitAppend(
  doc: StagedDocument,
  baseSource: string,
  opts: Omit<EmitOptions, 'mode' | 'reservedNames' | 'availableImports'> = {},
): AppendEmitResult {
  const inventory = inventoryProgram(baseSource);
  const fragment = emit(doc, {
    ...opts,
    mode: 'append',
    reservedNames: inventory.usedNames,
    availableImports: inventory.imports,
  });
  return mergeAppend(baseSource, fragment);
}
