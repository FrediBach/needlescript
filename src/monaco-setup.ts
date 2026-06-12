/**
 * Monaco Editor worker and loader configuration for Vite.
 *
 * Import this module once at the app entry point (main.tsx) BEFORE any
 * React component that uses <Editor> renders.  The side effects here tell
 * Monaco where to find its Web Worker and tell @monaco-editor/react to use
 * the locally-bundled Monaco instead of the jsDelivr CDN.
 */

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Point Monaco's worker infrastructure at the Vite-bundled worker file.
// We only need the base editor worker; language-specific workers (TS, JSON,
// CSS…) are not required because Needlescript uses a Monarch tokenizer only.
(globalThis as Record<string, unknown>).MonacoEnvironment = {
  getWorker(_moduleId: string, _label: string): Worker {
    return new editorWorker();
  },
};

// Tell @monaco-editor/react to use the locally-bundled monaco-editor package
// rather than downloading it from CDN, so the app works offline and always
// uses the pinned version.
loader.config({ monaco });
