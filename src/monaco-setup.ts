/**
 * Monaco Editor worker and loader configuration for Vite.
 *
 * Import this module once at the app entry point (main.tsx) BEFORE any
 * React component that uses <Editor> renders.  The side effects here tell
 * Monaco where to find its Web Worker and tell @monaco-editor/react to use
 * the locally-bundled Monaco instead of the jsDelivr CDN.
 */

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Import only the editor contributions used by the playground and book cells.
// The `monaco-editor` package root also registers every bundled language (TS,
// CSS, JSON, Python, SQL, …), which adds megabytes of code that NeedleScript
// never uses and delays the first tokenized paint.
import 'monaco-editor/esm/vs/editor/browser/coreCommands.js';
import 'monaco-editor/esm/vs/editor/browser/widget/codeEditor/codeEditorWidget.js';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/esm/vs/editor/contrib/caretOperations/browser/caretOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions.js';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation.js';
import 'monaco-editor/esm/vs/editor/contrib/lineSelection/browser/lineSelection.js';
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/esm/vs/editor/contrib/parameterHints/browser/parameterHints.js';
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/esm/vs/editor/contrib/tokenization/browser/tokenization.js';
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/wordPartOperations/browser/wordPartOperations.js';
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codiconStyles.js';

// Point Monaco's worker infrastructure at the Vite-bundled worker file.
// We only need the base editor worker; language-specific workers (TS, JSON,
// CSS…) are not required because NeedleScript uses a Monarch tokenizer only.
(globalThis as Record<string, unknown>).MonacoEnvironment = {
  getWorker(): Worker {
    return new editorWorker();
  },
};

// Tell @monaco-editor/react to use the locally-bundled monaco-editor package
// rather than downloading it from CDN, so the app works offline and always
// uses the pinned version.
loader.config({ monaco });

performance.mark('needlescript:monaco-ready');
