import type { Monaco } from '@monaco-editor/react';
import { registerNeedlescriptConfiguration } from './needlescript-monaco/configuration.ts';
import {
  registerNeedlescriptDefinitionProvider,
  registerNeedlescriptProviders,
} from './needlescript-monaco/providers.ts';
import { registerNeedlescriptTokenizer } from './needlescript-monaco/tokenizer.ts';
import {
  registerNeedlescriptDarkTheme,
  registerNeedlescriptLightTheme,
} from './needlescript-monaco/themes.ts';

let registered = false;

/**
 * Registers the Needlescript language with Monaco Editor.
 * Safe to call multiple times — registration only runs once.
 *
 * Call this in the `beforeMount` prop of <Editor>:
 *   <Editor beforeMount={registerNeedlescript} … />
 */
export function registerNeedlescript(monaco: Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({
    id: 'needlescript',
    extensions: ['.ns'],
    aliases: ['Needlescript', 'needlescript'],
  });

  registerNeedlescriptTokenizer(monaco);
  registerNeedlescriptDarkTheme(monaco);
  registerNeedlescriptConfiguration(monaco);
  registerNeedlescriptProviders(monaco);
  registerNeedlescriptLightTheme(monaco);
  registerNeedlescriptDefinitionProvider(monaco);
}

export { registerNeedlescriptLightTheme };
