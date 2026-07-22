import { describe, expect, it } from 'vitest';
import { applySourceEdits, createDraft, createProposal, hashSource } from './source-edits.ts';

describe('AI draft source edits', () => {
  it('applies disjoint edits against the same pre-edit document', () => {
    const source = 'make size 10\nforward size\nright 90\n';
    const result = applySourceEdits(source, [
      {
        startLine: 1,
        startColumn: 11,
        endLine: 1,
        endColumn: 13,
        text: '24',
      },
      {
        startLine: 3,
        startColumn: 1,
        endLine: 3,
        endColumn: 1,
        text: 'color "red"\n',
      },
    ]);
    expect(result).toEqual({
      ok: true,
      text: 'make size 24\nforward size\ncolor "red"\nright 90\n',
      addedLines: 1,
      removedLines: 0,
    });
  });

  it('rejects overlapping and out-of-range edits atomically', () => {
    const source = 'forward 10\nright 90';
    expect(
      applySourceEdits(source, [
        { startLine: 1, startColumn: 1, endLine: 1, endColumn: 8, text: 'fd' },
        { startLine: 1, startColumn: 4, endLine: 1, endColumn: 10, text: 'x' },
      ]),
    ).toEqual({ ok: false, error: 'Edit ranges may not overlap.' });
    expect(
      applySourceEdits(source, [
        { startLine: 9, startColumn: 1, endLine: 9, endColumn: 1, text: 'x' },
      ]),
    ).toEqual({ ok: false, error: 'Line 9 is outside the document.' });
  });

  it('builds a proposal from a changed draft with stable hashes', () => {
    const draft = createDraft('forward 10', 3);
    const changed = {
      ...draft,
      text: 'forward 20',
      hash: hashSource('forward 20'),
      revision: 1,
      status: 'changed' as const,
    };
    const proposal = createProposal('thread-1', changed);
    expect(proposal).toMatchObject({
      baseRevision: 3,
      draftRevision: 1,
      source: 'forward 20',
      addedLines: 1,
      removedLines: 1,
      stale: false,
    });
    expect(hashSource('forward 20')).toBe(hashSource('forward 20'));
    expect(hashSource('forward 20')).not.toBe(hashSource('forward 10'));
  });
});
