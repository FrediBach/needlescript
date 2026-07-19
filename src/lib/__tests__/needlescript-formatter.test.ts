import { describe, expect, it } from 'vitest';
import {
  formatNeedleScript,
  formatNeedleScriptSource,
  needleScriptPlugin,
} from '../editor/formatter.ts';
import { registerNeedlescriptFormattingProvider } from '../editor/monaco/formatting.ts';

describe('NeedleScript Prettier formatter', () => {
  it('formats indentation, calls, commas, operators, and comments', async () => {
    const source = `def leaf(size,angle) [
fd(size)    // preserve the explanation
repeat 2 [
rt   90
]
]
`;

    await expect(formatNeedleScript(source)).resolves.toBe(`def leaf(size, angle) [
  fd(size) // preserve the explanation
  repeat 2 [
    rt 90
  ]
]
`);
  });

  it('preserves whitespace that distinguishes NeedleScript syntax', async () => {
    const source = `setxy   -6   -21
fd 10-5
fd 10 - 5
fd(10)
fd (10)
let point = positions[0]
repeat 2 [ fd 4 rt 90 ]
`;

    await expect(formatNeedleScript(source)).resolves.toBe(`setxy -6 -21
fd 10 - 5
fd 10 - 5
fd(10)
fd (10)
let point = positions[0]
repeat 2 [ fd 4 rt 90 ]
`);
  });

  it('keeps comment markers and comment-like text inside strings intact', () => {
    const source = `print   'https://example.com/#motif'   # note
; classic
repeat 1 [
print 'semi;hash#slash//'
]
`;

    expect(formatNeedleScriptSource(source)).toBe(`print 'https://example.com/#motif' # note
; classic
repeat 1 [
  print 'semi;hash#slash//'
]
`);
  });

  it('indents classic to/end procedures and normalizes unambiguous unary minus', async () => {
    const source = `to leaf :size
fd :size
repeat 2 [
fd(- 2)
]
end
`;

    await expect(formatNeedleScript(source)).resolves.toBe(`to leaf :size
  fd :size
  repeat 2 [
    fd(-2)
  ]
end
`);
  });

  it('is idempotent and exposes a Prettier plugin for .ns files', async () => {
    const once = await formatNeedleScript('repeat 2 [\nfd 3\n]\n');
    await expect(formatNeedleScript(once)).resolves.toBe(once);
    expect(needleScriptPlugin.languages?.[0]).toMatchObject({
      name: 'NeedleScript',
      extensions: ['.ns'],
      parsers: ['needlescript'],
    });
  });
});

describe('NeedleScript Monaco formatting provider', () => {
  it('returns one full-document edit using Monaco indentation options', async () => {
    let provideEdits: ((...args: never[]) => unknown) | undefined;
    registerNeedlescriptFormattingProvider({
      languages: {
        registerDocumentFormattingEditProvider: (_language: string, provider: unknown) => {
          provideEdits = (
            provider as { provideDocumentFormattingEdits: (...args: never[]) => unknown }
          ).provideDocumentFormattingEdits;
        },
      },
    } as never);

    const fullRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 2 };
    const edits = await provideEdits?.(
      {
        getValue: () => 'repeat 1 [\nfd 2\n]',
        getFullModelRange: () => fullRange,
      } as never,
      { tabSize: 4, insertSpaces: true } as never,
      { isCancellationRequested: false } as never,
    );

    expect(edits).toEqual([
      {
        range: fullRange,
        text: 'repeat 1 [\n    fd 2\n]\n',
      },
    ]);
  });
});
