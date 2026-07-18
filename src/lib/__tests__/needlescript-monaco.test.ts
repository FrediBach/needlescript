import { describe, expect, it } from 'vitest';
import {
  codePortionOfLine,
  extractUserSymbols,
  getImportCompletionContext,
  getSignatureContext,
} from '../needlescript-monaco/symbols.ts';
import { STANDARD_LIBRARY_PROCEDURES } from '../standard-library/index.ts';

describe('NeedleScript Monaco symbol analysis', () => {
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
