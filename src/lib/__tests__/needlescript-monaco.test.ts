import { describe, expect, it } from 'vitest';
import {
  codePortionOfLine,
  extractUserSymbols,
  getImportCompletionContext,
  getSignatureContext,
} from '../needlescript-monaco/symbols.ts';
import { NS_ITEM_MAP } from '../needlescript-monaco/catalog.ts';
import { registerNeedlescriptTokenizer } from '../needlescript-monaco/tokenizer.ts';
import { STANDARD_LIBRARY_PROCEDURES } from '../standard-library/index.ts';
import { CORE_COMMAND_NAMES } from '../commands.ts';
import { EMBROIDERY_MODE_REGISTRIES } from '../embroidery-registry.ts';
import { FILL_UNDERLAY_PASS_KINDS, SATIN_UNDERLAY_PASS_KINDS } from '../underlay-profile.ts';
import { FILL_CONSTRUCTION_MODE_REGISTRIES } from '../fill-profile.ts';
import { catalogCoverageGaps, catalogModeGaps } from './helpers/catalog-coverage.ts';

describe('NeedleScript Monaco symbol analysis', () => {
  it('covers every Core command with completion, hover, and signature metadata', () => {
    expect(catalogCoverageGaps(CORE_COMMAND_NAMES, NS_ITEM_MAP)).toEqual([]);
  });

  it('documents every registered embroidery mode in its catalog item', () => {
    const gaps = Object.entries(EMBROIDERY_MODE_REGISTRIES).flatMap(([command, modes]) =>
      catalogModeGaps(command, modes, NS_ITEM_MAP),
    );
    gaps.push(...catalogModeGaps('underlaypasses', SATIN_UNDERLAY_PASS_KINDS, NS_ITEM_MAP));
    gaps.push(...catalogModeGaps('fillunderlaypasses', FILL_UNDERLAY_PASS_KINDS, NS_ITEM_MAP));
    gaps.push(
      ...Object.entries(FILL_CONSTRUCTION_MODE_REGISTRIES).flatMap(([command, modes]) =>
        catalogModeGaps(command, modes, NS_ITEM_MAP),
      ),
    );
    expect(gaps).toEqual([]);
  });

  it('highlights stitchscope as a sewing block command', () => {
    let tokenizer: { sewingKwCmds?: string[] } | undefined;
    registerNeedlescriptTokenizer({
      languages: {
        setMonarchTokensProvider: (_language: string, definition: unknown) => {
          tokenizer = definition as { sewingKwCmds?: string[] };
        },
      },
    } as never);

    expect(tokenizer?.sewingKwCmds).toContain('stitchscope');
    expect(NS_ITEM_MAP.get('stitchscope')?.insertText).toContain('[\n');
  });

  it('extracts modern and classic procedures and variables with source lines', () => {
    const symbols = extractUserSymbols(`let radius = 12
def petal(size, angle) [
]
make "turns 6
to leaf :length
end`);

    expect(symbols).toEqual([
      {
        label: 'petal',
        kindName: 'function',
        detail: 'procedure(size, angle)',
        params: ['size', 'angle'],
        line: 2,
      },
      {
        label: 'leaf',
        kindName: 'function',
        detail: 'procedure(length)',
        params: ['length'],
        line: 5,
      },
      { label: 'radius', kindName: 'variable', detail: 'variable', line: 1 },
      { label: 'turns', kindName: 'variable', detail: 'variable (make)', line: 4 },
    ]);
  });

  it('tracks nested signature arguments and stops at a block boundary', () => {
    expect(getSignatureContext('mix(1, curve(2, 3), ')).toEqual({ name: 'mix', paramIndex: 2 });
    expect(getSignatureContext('repeat 4 [ mix(1, ')).toEqual({ name: 'mix', paramIndex: 1 });
    expect(getSignatureContext('repeat 4 [')).toBeNull();
  });

  it('extracts standard-library aliases with their imported signatures', () => {
    expect(
      extractUserSymbols(`import std.shapes.starpath as star
import std.mathx.easepow as easing
star(5, 10, 4)`),
    ).toEqual([
      {
        label: 'star',
        kindName: 'function',
        detail: 'imported starpath(n, rout, rin)',
        params: ['n', 'rout', 'rin'],
        line: 1,
        documentation: 'Imported from `std.shapes.starpath`.',
      },
      {
        label: 'easing',
        kindName: 'function',
        detail: 'imported easepow(power)',
        params: ['power'],
        line: 2,
        documentation: 'Imported from `std.mathx.easepow`.',
      },
    ]);
  });

  it('recognizes import paths for standard-library completion', () => {
    expect(getImportCompletionContext('import std.shapes.')).toEqual({
      partialPath: 'std.shapes.',
      startColumn: 8,
    });
    expect(getImportCompletionContext('  import std.math')).toEqual({
      partialPath: 'std.math',
      startColumn: 10,
    });
    expect(getImportCompletionContext('import std.mathx.easein as ease')).toBeNull();
    expect(getImportCompletionContext('// import std.mathx.')).toBeNull();
  });

  it('derives Monaco metadata for every bundled standard-library export', () => {
    const importPaths = STANDARD_LIBRARY_PROCEDURES.map(
      (procedure) => `${procedure.moduleId}.${procedure.name}`,
    );
    expect(new Set(importPaths).size).toBe(importPaths.length);
    expect(importPaths.length).toBeGreaterThan(0);
    expect(STANDARD_LIBRARY_PROCEDURES).toContainEqual({
      moduleId: 'std.stitchcraft',
      name: 'appliquesteps',
      params: ['region', 'w'],
    });
  });

  it('removes every supported line-comment style before folding scans', () => {
    expect(codePortionOfLine('repeat 4 [ fd 10 ] // [ ignored')).toBe('repeat 4 [ fd 10 ] ');
    expect(codePortionOfLine('fd 10 # ] ignored')).toBe('fd 10 ');
    expect(codePortionOfLine('rt 90 ; [ ignored')).toBe('rt 90 ');
  });
});
