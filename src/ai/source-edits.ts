import type { AiCodeProposal, AiDraftState, AiLineDiff, SourceSnapshot } from './chat-types.ts';

export interface AiSourceEdit {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text: string;
}

/**
 * Fast, deterministic content identity for optimistic draft concurrency.
 *
 * This non-cryptographic FNV-1a hash detects stale model edits and apply conflicts; it must never be
 * treated as a security or tamper-proof digest.
 */
export function hashSource(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createSourceSnapshot(text: string, revision: number): SourceSnapshot {
  return { text, revision, hash: hashSource(text) };
}

export function createDraft(text: string, revision: number): AiDraftState {
  const base = createSourceSnapshot(text, revision);
  return { base, text, revision: 0, hash: base.hash, status: 'clean' };
}

/** Start from empty text while retaining the live source as the apply conflict base. */
export function createBlankDraft(liveText: string, revision: number): AiDraftState {
  return {
    base: createSourceSnapshot(liveText, revision),
    text: '',
    revision: 0,
    hash: hashSource(''),
    status: 'clean',
  };
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function offsetFor(
  text: string,
  starts: number[],
  line: number,
  column: number,
): number | { error: string } {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) {
    return { error: 'Lines and columns must be positive integers.' };
  }
  if (line > starts.length) return { error: `Line ${line} is outside the document.` };
  const start = starts[line - 1];
  const rawEnd = line === starts.length ? text.length : starts[line] - 1;
  const end = rawEnd > start && text[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd;
  if (column > end - start + 1) {
    return { error: `Column ${column} is outside line ${line}.` };
  }
  return start + column - 1;
}

export function applySourceEdits(
  source: string,
  edits: readonly AiSourceEdit[],
):
  | { ok: true; text: string; addedLines: number; removedLines: number }
  | { ok: false; error: string } {
  /*
   * Every range uses one-based line/column coordinates against the same pre-edit snapshot. Validate
   * the complete batch before changing text, then apply from the end so earlier offsets remain
   * stable. This gives the model atomic multi-edit behavior without position rebasing.
   */
  if (edits.length === 0 || edits.length > 24) {
    return { ok: false, error: 'An edit call must contain between 1 and 24 edits.' };
  }
  const starts = lineStarts(source);
  const ranges: Array<AiSourceEdit & { start: number; end: number }> = [];
  for (const edit of edits) {
    if (typeof edit.text !== 'string' || edit.text.length > 24_000) {
      return { ok: false, error: 'Each replacement must be at most 24,000 characters.' };
    }
    const start = offsetFor(source, starts, edit.startLine, edit.startColumn);
    const end = offsetFor(source, starts, edit.endLine, edit.endColumn);
    if (typeof start !== 'number') return { ok: false, error: start.error };
    if (typeof end !== 'number') return { ok: false, error: end.error };
    if (end < start) return { ok: false, error: 'Edit ranges may not be reversed.' };
    ranges.push({ ...edit, start, end });
  }
  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < ranges.length; index++) {
    if (ranges[index].start < ranges[index - 1].end) {
      return { ok: false, error: 'Edit ranges may not overlap.' };
    }
  }
  let text = source;
  let addedLines = 0;
  let removedLines = 0;
  for (const range of ranges.toReversed()) {
    const removed = source.slice(range.start, range.end);
    addedLines += (range.text.match(/\n/g) ?? []).length;
    removedLines += (removed.match(/\n/g) ?? []).length;
    text = text.slice(0, range.start) + range.text + text.slice(range.end);
  }
  if (text.length > 200_000) return { ok: false, error: 'The edited draft is too large.' };
  return { ok: true, text, addedLines, removedLines };
}

export function buildLineDiff(before: string, after: string): AiLineDiff[] {
  /*
   * Proposals need a compact review preview, not a general-purpose diff. Preserve the common prefix
   * and suffix and expose the changed middle with two surrounding context lines.
   */
  const oldLines = before.split(/\r?\n/);
  const newLines = after.split(/\r?\n/);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }
  const diff: AiLineDiff[] = [];
  const contextStart = Math.max(0, prefix - 2);
  for (let index = contextStart; index < prefix; index++) {
    diff.push({ kind: 'context', text: oldLines[index], oldLine: index + 1, newLine: index + 1 });
  }
  for (let index = prefix; index < oldLines.length - suffix; index++) {
    diff.push({ kind: 'removed', text: oldLines[index], oldLine: index + 1 });
  }
  for (let index = prefix; index < newLines.length - suffix; index++) {
    diff.push({ kind: 'added', text: newLines[index], newLine: index + 1 });
  }
  const suffixEnd = Math.min(suffix, 2);
  for (let index = 0; index < suffixEnd; index++) {
    const oldIndex = oldLines.length - suffix + index;
    const newIndex = newLines.length - suffix + index;
    diff.push({
      kind: 'context',
      text: oldLines[oldIndex],
      oldLine: oldIndex + 1,
      newLine: newIndex + 1,
    });
  }
  return diff;
}

export function createProposal(threadId: string, draft: AiDraftState): AiCodeProposal | null {
  if (draft.revision === 0 || draft.text === draft.base.text) return null;
  const diff = buildLineDiff(draft.base.text, draft.text);
  return {
    id: `${threadId}:${draft.revision}:${draft.hash}`,
    threadId,
    baseRevision: draft.base.revision,
    baseHash: draft.base.hash,
    draftRevision: draft.revision,
    source: draft.text,
    diff,
    addedLines: diff.filter(({ kind }) => kind === 'added').length,
    removedLines: diff.filter(({ kind }) => kind === 'removed').length,
    stale: draft.status === 'stale',
    compile: draft.lastCompile,
  };
}
