import type { Monaco } from '@monaco-editor/react';

let registered = false;

export function registerNeedlescriptFormattingProvider(monaco: Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerDocumentFormattingEditProvider('needlescript', {
    async provideDocumentFormattingEdits(model, options, token) {
      const source = model.getValue();
      const { formatNeedleScript } = await import('../needlescript-formatter.ts');
      if (token.isCancellationRequested) return [];
      const formatted = await formatNeedleScript(source, {
        tabWidth: options.tabSize,
        useTabs: !options.insertSpaces,
      });
      if (token.isCancellationRequested || formatted === source) return [];
      return [{ range: model.getFullModelRange(), text: formatted }];
    },
  });
}
