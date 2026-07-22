import { describe, expect, it } from 'vitest';
import { buildEditorExplainRequest } from '../editor/ai-editor-context.ts';

describe('editor AI explanation context', () => {
  it('focuses a selected range and includes its exact source coordinates', () => {
    const request = buildEditorExplainRequest({
      position: { lineNumber: 4, column: 8 },
      lineText: 'repeat 8 [ fd 10 rt 45 ]',
      word: 'fd',
      selection: {
        startLineNumber: 4,
        startColumn: 1,
        endLineNumber: 5,
        endColumn: 12,
        text: 'repeat 8 [ fd 10 rt 45 ]\ncolor 2',
      },
    });

    expect(request).toContain('lines 4:1-5:12');
    expect(request).toContain('Focus on this selection');
    expect(request).toContain('repeat 8 [ fd 10 rt 45 ]\ncolor 2');
    expect(request).toContain('compiled visual geometry');
  });

  it('uses the context-menu line, column, and symbol without a selection', () => {
    const request = buildEditorExplainRequest({
      position: { lineNumber: 12, column: 17 },
      lineText: 'fillpath region 45 0.4',
      word: 'region',
    });

    expect(request).toContain('line 12, column 17');
    expect(request).toContain('symbol under the pointer is “region”');
    expect(request).toContain('Target line 12');
    expect(request).toContain('fillpath region 45 0.4');
    expect(request).toContain('nearby code');
  });

  it('bounds duplicated selection text while retaining the complete-source line range', () => {
    const request = buildEditorExplainRequest({
      position: { lineNumber: 1, column: 1 },
      lineText: 'fd 1',
      selection: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 900,
        endColumn: 1,
        text: 'x'.repeat(3_000),
      },
    });

    expect(request).toContain('lines 1:1-900:1');
    expect(request).toContain('selection preview truncated');
    expect(request.length).toBeLessThan(3_000);
  });
});
