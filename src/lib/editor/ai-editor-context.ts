const MAX_SELECTION_PREVIEW_CHARS = 2_000;

export interface EditorExplainPosition {
  lineNumber: number;
  column: number;
}

export interface EditorExplainSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  text: string;
}

export interface EditorExplainTarget {
  position: EditorExplainPosition;
  lineText: string;
  word?: string;
  selection?: EditorExplainSelection;
}

function describeSelection(selection: EditorExplainSelection): string {
  const sameLine = selection.startLineNumber === selection.endLineNumber;
  return sameLine
    ? `line ${selection.startLineNumber}, columns ${selection.startColumn}-${selection.endColumn}`
    : `lines ${selection.startLineNumber}:${selection.startColumn}-${selection.endLineNumber}:${selection.endColumn}`;
}

function selectionPreview(text: string): string {
  if (text.length <= MAX_SELECTION_PREVIEW_CHARS) return text;
  return `${text.slice(0, MAX_SELECTION_PREVIEW_CHARS)}\n… [selection preview truncated; use the line range in the complete source]`;
}

/** Build an unambiguous explanation request from the editor selection or context-menu position. */
export function buildEditorExplainRequest(target: EditorExplainTarget): string {
  if (target.selection && target.selection.text.trim()) {
    return [
      `The user invoked Explain with AI for the selected NeedleScript code at ${describeSelection(target.selection)}.`,
      'Focus on this selection: explain what it does, how it contributes to the compiled visual geometry, how it interacts with the surrounding program, and any non-obvious embroidery or runtime behavior. Do not give a generic whole-program tour except where context is necessary.',
      'Selected code:',
      '```needlescript',
      selectionPreview(target.selection.text),
      '```',
    ].join('\n\n');
  }

  const word = target.word ? ` The symbol under the pointer is “${target.word}”.` : '';
  return [
    `The user invoked Explain with AI at line ${target.position.lineNumber}, column ${target.position.column}.${word}`,
    'Focus on the statement or expression at this location: explain what it does, why it produces its compiled visual result, how it relates to nearby code, and any non-obvious embroidery or runtime behavior. Do not give a generic whole-program tour.',
    `Target line ${target.position.lineNumber}:`,
    '```needlescript',
    target.lineText,
    '```',
  ].join('\n\n');
}
