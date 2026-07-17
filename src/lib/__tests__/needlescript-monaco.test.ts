import { describe, expect, it } from 'vitest';
import {
  codePortionOfLine,
  extractUserSymbols,
  getSignatureContext,
} from '../needlescript-monaco/symbols.ts';

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

  it('removes every supported line-comment style before folding scans', () => {
    expect(codePortionOfLine('repeat 4 [ fd 10 ] // [ ignored')).toBe('repeat 4 [ fd 10 ] ');
    expect(codePortionOfLine('fd 10 # ] ignored')).toBe('fd 10 ');
    expect(codePortionOfLine('rt 90 ; [ ignored')).toBe('rt 90 ');
  });
});
