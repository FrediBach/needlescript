import { describe, expect, it } from 'vitest';
import {
  codePortionOfLine,
  extractUserSymbols,
  getImportCompletionContext,
  getSignatureContext,
} from '../editor/monaco/symbols.ts';
import { NS_ITEM_MAP } from '../editor/monaco/catalog.ts';
import { registerNeedlescriptTokenizer } from '../editor/monaco/tokenizer.ts';
import { STANDARD_LIBRARY_PROCEDURES } from '../language/standard-library/index.ts';
import { CORE_COMMAND_NAMES } from '../language/commands.ts';
import { EMBROIDERY_MODE_REGISTRIES } from '../embroidery/embroidery-registry.ts';
import {
  FILL_UNDERLAY_PASS_KINDS,
  SATIN_UNDERLAY_PASS_KINDS,
} from '../embroidery/underlay-profile.ts';
import { FILL_CONSTRUCTION_MODE_REGISTRIES } from '../embroidery/fill-profile.ts';
import { SATIN_CONSTRUCTION_MODE_REGISTRIES } from '../embroidery/satin-profile.ts';
import { PREFLIGHT_MODES } from '../embroidery/preflight.ts';
import { PLAN_MODES } from '../embroidery/travel-planner.ts';
import {
  catalogCoverageGaps,
  catalogExampleGaps,
  catalogModeGaps,
} from './helpers/catalog-coverage.ts';

const EMBROIDERY_RESULT_COMMANDS = [
  'stitchscope',
  'satincap',
  'satincaplen',
  'satinjoin',
  'satincorner',
  'satinwide',
  'satinmaxwidth',
  'satinsplitoverlap',
  'fillinset',
  'filledgerun',
  'filledgeshort',
  'fillstagger',
  'fillstaggeramount',
  'fillconnect',
  'compensation',
  'plan',
  'preflight',
  'planbarrier',
  'atomic',
  'routegroup',
  'fabric',
  'fabricgrain',
  'fabricstretch',
  'threadprofile',
  'threadwidth',
  'needle',
  'stabilizer',
  'topping',
  'underlay',
  'underlaypasses',
  'underlaylen',
  'underlayinset',
  'underlayspacing',
  'fillunderlay',
  'fillunderlaypasses',
  'fillunderlaylen',
  'fillunderlayinset',
  'fillunderlayspacing',
  'fillunderlayangle',
] as const;

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
    gaps.push(
      ...Object.entries(SATIN_CONSTRUCTION_MODE_REGISTRIES).flatMap(([command, modes]) =>
        catalogModeGaps(command, modes, NS_ITEM_MAP),
      ),
    );
    gaps.push(...catalogModeGaps('preflight', PREFLIGHT_MODES, NS_ITEM_MAP));
    gaps.push(...catalogModeGaps('plan', PLAN_MODES, NS_ITEM_MAP));
    expect(gaps).toEqual([]);
  });

  it('provides a concise catalog example for every embroidery-results command', () => {
    expect(catalogExampleGaps(EMBROIDERY_RESULT_COMMANDS, NS_ITEM_MAP)).toEqual([]);
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
    expect(tokenizer?.sewingKwCmds).toContain('atomic');
    expect(tokenizer?.sewingKwCmds).toContain('routegroup');
    expect(NS_ITEM_MAP.get('stitchscope')?.insertText).toContain('[\n');
    expect(NS_ITEM_MAP.get('atomic')?.insertText).toContain('[\n');
    expect(NS_ITEM_MAP.get('routegroup')?.insertText).toContain('[\n');
  });

  it('highlights planner directives as stitch commands', () => {
    let tokenizer: { stitchCmds?: string[] } | undefined;
    registerNeedlescriptTokenizer({
      languages: {
        setMonarchTokensProvider: (_language: string, definition: unknown) => {
          tokenizer = definition as { stitchCmds?: string[] };
        },
      },
    } as never);

    expect(tokenizer?.stitchCmds).toEqual(
      expect.arrayContaining(['plan', 'planbarrier', 'preflight']),
    );
  });

  it('highlights embroidery construction and material commands as stitch commands', () => {
    let tokenizer: { stitchCmds?: string[] } | undefined;
    registerNeedlescriptTokenizer({
      languages: {
        setMonarchTokensProvider: (_language: string, definition: unknown) => {
          tokenizer = definition as { stitchCmds?: string[] };
        },
      },
    } as never);

    const blockCommands = new Set(['stitchscope', 'atomic', 'routegroup']);
    const stitchCommands = EMBROIDERY_RESULT_COMMANDS.filter(
      (command) => !blockCommands.has(command),
    );
    expect(tokenizer?.stitchCmds).toEqual(expect.arrayContaining(stitchCommands));
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
        documentation: expect.stringContaining('Imported from `std.shapes.starpath`.'),
      },
      {
        label: 'easing',
        kindName: 'function',
        detail: 'imported easepow(power)',
        params: ['power'],
        line: 2,
        documentation: expect.stringContaining('Imported from `std.mathx.easepow`.'),
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
