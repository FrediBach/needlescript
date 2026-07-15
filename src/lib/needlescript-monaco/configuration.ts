import type { Monaco } from '@monaco-editor/react';

export function registerNeedlescriptConfiguration(monaco: Monaco): void {
  // ── Language configuration ────────────────────────────────────────
  // Enables auto-close brackets, comment toggling, etc. as Monaco features.
  //
  // Comment style note: NeedleScript accepts three line-comment starters —
  // `//` (canonical), `#` (legacy), and `;` (legacy). The Monarch tokenizer
  // colours all three correctly. Monaco only supports a single `lineComment`
  // value, so `//` is registered as the toggle-comment character (Cmd/Ctrl+/).
  // `#` and `;` are intentionally kept as tokenizer-only aliases.
  monaco.languages.setLanguageConfiguration('needlescript', {
    comments: {
      lineComment: '//',
    },
    // Custom word pattern — matches the real tokenizer `isWordChar` rule which
    // accepts letters, digits, underscore, dot, and `?` in identifiers.  Without
    // this, Monaco's default `\w+` pattern would split `is.ok?` into three
    // separate words, breaking double-click selection, hover, and completion.
    wordPattern: /[A-Za-z_][A-Za-z0-9_.?]*/,
    brackets: [
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
    ],
    surroundingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
    ],
    indentationRules: {
      // Increase indent after opening [
      increaseIndentPattern: /\[/,
      // Decrease indent before or after closing ]
      decreaseIndentPattern: /^\s*\]/,
    },
  });
}
