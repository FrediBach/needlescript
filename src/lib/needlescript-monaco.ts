import type { Monaco } from '@monaco-editor/react';
import { registerNeedlescriptConfiguration } from './needlescript-monaco/configuration.ts';
import { registerNeedlescriptFormattingProvider } from './needlescript-monaco/formatting.ts';
import {
  registerNeedlescriptDefinitionProvider,
  registerNeedlescriptProviders as registerProviders,
} from './needlescript-monaco/providers.ts';
import { registerNeedlescriptTokenizer } from './needlescript-monaco/tokenizer.ts';
import {
  registerNeedlescriptDarkTheme,
  registerNeedlescriptLightTheme,
} from './needlescript-monaco/themes.ts';

let coreRegistered = false;
let providersRegistered = false;
let providersScheduled = false;

/**
 * Registers the Needlescript language with Monaco Editor.
 * Safe to call multiple times — registration only runs once.
 *
 * Call this in the `beforeMount` prop of <Editor>:
 *   <Editor beforeMount={registerNeedlescript} … />
 */
export function registerNeedlescript(monaco: Monaco): void {
  if (coreRegistered) return;
  coreRegistered = true;

  monaco.languages.register({
    id: 'needlescript',
    extensions: ['.ns'],
    aliases: ['Needlescript', 'needlescript'],
  });

  registerNeedlescriptTokenizer(monaco);
  registerNeedlescriptDarkTheme(monaco);
  registerNeedlescriptConfiguration(monaco);
  registerNeedlescriptFormattingProvider(monaco);
  registerNeedlescriptLightTheme(monaco);
}

/** Register non-critical editor services after the first tokenized paint. */
function registerNeedlescriptProviders(monaco: Monaco): void {
  if (providersRegistered) return;
  providersRegistered = true;
  registerProviders(monaco);
  registerNeedlescriptDefinitionProvider(monaco);
}

/**
 * Schedule completions, hover, signatures, folding, and definitions after the
 * editor has mounted. Syntax highlighting and the active theme stay on the
 * synchronous critical path.
 */
export function scheduleNeedlescriptProviders(monaco: Monaco): void {
  if (providersRegistered || providersScheduled) return;
  providersScheduled = true;

  const register = () => {
    providersScheduled = false;
    registerNeedlescriptProviders(monaco);
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => setTimeout(register, 0));
  } else {
    setTimeout(register, 0);
  }
}

export { registerNeedlescriptLightTheme };
