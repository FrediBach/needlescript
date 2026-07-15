import type { Monaco } from '@monaco-editor/react';
import {
  bgApp,
  bgPanel,
  bgPanelRaised,
  borderCool,
  gold,
  m,
  monacoGutter,
  monacoIndentGuide,
  monacoIndentGuideActive,
  monacoLineHighlight,
  monacoLineNumber,
  monacoLineNumberActive,
  synBracket,
  synComment,
  synKeyword,
  synLib,
  synMath,
  synMovement,
  synNumber,
  synOperator,
  synStitch,
  synString,
  synVariable,
  text,
  textFaint,
} from '../../theme.ts';

export function registerNeedlescriptDarkTheme(monaco: Monaco): void {
  // ── Custom dark theme ─────────────────────────────────────────────
  // All colours sourced from src/theme.ts to stay in sync with the
  // global design system defined in src/index.css.
  monaco.editor.defineTheme('needlescript-dark', {
    base: 'vs-dark',
    inherit: false,
    rules: [
      // Default / plain identifiers
      { token: '', foreground: m(text) },
      { token: 'ns-identifier', foreground: m(text) },
      // Comments — muted, italic
      { token: 'ns-comment', foreground: m(synComment), fontStyle: 'italic' },
      // Control flow & definition keywords — brand gold, bold
      { token: 'ns-keyword', foreground: m(synKeyword), fontStyle: 'bold' },
      // Turtle movement + reporters — sky teal
      { token: 'ns-movement', foreground: m(synMovement), fontStyle: 'italic' },
      // Turtle state reporters (bridges: read-only) — same teal, not italic
      { token: 'ns-sensor', foreground: m(synMovement) },
      // Stitch / thread / fabric commands — warm amber, italic
      { token: 'ns-stitch', foreground: m(synStitch), fontStyle: 'italic' },
      // Debug / neutral / data-world auxiliaries — same amber, not italic
      { token: 'ns-debug', foreground: m(synStitch) },
      // Sewing-world transform & effect block commands — gold, bold + italic
      { token: 'ns-sewing-kw', foreground: m(synKeyword), fontStyle: 'bold italic' },
      // Core math functions — soft lavender
      { token: 'ns-math', foreground: m(synMath) },
      // Library functions (list + generative) — mint green
      { token: 'ns-lib', foreground: m(synLib) },
      // Numbers
      { token: 'ns-number', foreground: m(synNumber) },
      // Quoted words / Logo "strings" / single-quoted string literals
      { token: 'ns-string', foreground: m(synString) },
      { token: 'ns-string-escape', foreground: m(synString), fontStyle: 'bold' },
      // Classic variable deref :var — steel blue, italic
      { token: 'ns-variable', foreground: m(synVariable), fontStyle: 'italic' },
      // Operators and punctuation — muted
      { token: 'ns-operator', foreground: m(synOperator) },
      { token: 'ns-bracket', foreground: m(synBracket) },
      { token: 'ns-delimiter', foreground: m(synBracket) },
    ],
    colors: {
      // Editor surface
      'editor.background': bgPanel,
      'editor.foreground': text,
      // Cursor
      'editorCursor.foreground': gold,
      // Selection
      'editor.selectionBackground': gold + '40',
      'editor.inactiveSelectionBackground': gold + '22',
      // Current-line highlight (cursor line, not the playback line)
      'editor.lineHighlightBackground': monacoLineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      // Line numbers
      'editorLineNumber.foreground': monacoLineNumber,
      'editorLineNumber.activeForeground': monacoLineNumberActive,
      // Gutter
      'editorGutter.background': monacoGutter,
      // Indent guides
      'editorIndentGuide.background1': monacoIndentGuide,
      'editorIndentGuide.activeBackground1': monacoIndentGuideActive,
      // Bracket pair colorization
      'editorBracketHighlight.foreground1': gold,
      'editorBracketHighlight.foreground2': synMovement,
      'editorBracketHighlight.foreground3': synMath,
      // Find/match highlight
      'editor.findMatchBackground': gold + '50',
      'editor.findMatchHighlightBackground': gold + '28',
      // Scrollbar
      'scrollbarSlider.background': borderCool + '44',
      'scrollbarSlider.hoverBackground': monacoIndentGuideActive,
      'scrollbarSlider.activeBackground': textFaint + 'AA',
      // Overview ruler
      'editorOverviewRuler.border': '#00000000',
      // Widget popups (find bar, etc.)
      'editorWidget.background': bgApp,
      'editorWidget.border': borderCool,
      'editorWidget.foreground': text,
      // Input boxes inside widgets
      'input.background': bgPanel,
      'input.foreground': text,
      'inputOption.activeBorder': gold,
      'inputOption.activeBackground': gold + '30',
      // Focus border
      focusBorder: gold,
      // ── Suggestion / IntelliSense widget ───────────────────────────
      'editorSuggestWidget.background': bgApp,
      'editorSuggestWidget.border': borderCool,
      'editorSuggestWidget.foreground': text,
      'editorSuggestWidget.selectedBackground': bgPanelRaised,
      'editorSuggestWidget.selectedForeground': text,
      'editorSuggestWidget.highlightForeground': gold,
      'editorSuggestWidget.focusHighlightForeground': gold,
      // ── Hover widget ───────────────────────────────────────────────
      'editorHoverWidget.background': bgApp,
      'editorHoverWidget.border': borderCool,
      'editorHoverWidget.foreground': text,
      // ── Parameter hints widget ─────────────────────────────────────
      editorHintForeground: text,
      'parameterHints.background': bgApp,
      'parameterHints.border': borderCool,
    },
  });
}

/**
 * Register the 'needlescript-light' Monaco theme for the interactive book.
 * Safe to call multiple times (defineTheme is idempotent).
 */
export function registerNeedlescriptLightTheme(monaco: Monaco): void {
  monaco.editor.defineTheme('needlescript-light', {
    base: 'vs',
    inherit: false,
    rules: [
      { token: '', foreground: '111111' },
      { token: 'ns-identifier', foreground: '111111' },
      { token: 'ns-comment', foreground: '888888', fontStyle: 'italic' },
      { token: 'ns-keyword', foreground: '6b4400', fontStyle: 'bold' },
      { token: 'ns-movement', foreground: '0b5e80', fontStyle: 'italic' },
      { token: 'ns-sensor', foreground: '0b5e80' },
      { token: 'ns-stitch', foreground: '7a3400', fontStyle: 'italic' },
      { token: 'ns-debug', foreground: '7a3400' },
      { token: 'ns-sewing-kw', foreground: '6b4400', fontStyle: 'bold italic' },
      { token: 'ns-math', foreground: '4a3380' },
      { token: 'ns-lib', foreground: '1e5c40' },
      { token: 'ns-number', foreground: '924d15' },
      { token: 'ns-string', foreground: '2e5c0e' },
      { token: 'ns-string-escape', foreground: '2e5c0e', fontStyle: 'bold' },
      { token: 'ns-variable', foreground: '1a4a6e', fontStyle: 'italic' },
      { token: 'ns-operator', foreground: '555555' },
      { token: 'ns-bracket', foreground: '777777' },
      { token: 'ns-delimiter', foreground: '777777' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#111111',
      'editorCursor.foreground': '#111111',
      'editor.selectionBackground': '#d8e8f4',
      'editor.inactiveSelectionBackground': '#e8f0f8',
      'editor.lineHighlightBackground': '#f5f5f5',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#bbbbbb',
      'editorLineNumber.activeForeground': '#777777',
      'editorGutter.background': '#f7f7f7',
      'editorIndentGuide.background1': '#e0e0e0',
      'editorIndentGuide.activeBackground1': '#bbbbbb',
      'editorBracketHighlight.foreground1': '#6b4400',
      'editorBracketHighlight.foreground2': '#0b5e80',
      'editorBracketHighlight.foreground3': '#4a3380',
      'editor.findMatchBackground': '#ffe08a',
      'editor.findMatchHighlightBackground': '#fff4c2',
      'scrollbarSlider.background': '#d0d0d040',
      'scrollbarSlider.hoverBackground': '#bbbbbb88',
      'scrollbarSlider.activeBackground': '#99999988',
      'editorOverviewRuler.border': '#00000000',
      'editorWidget.background': '#f7f7f7',
      'editorWidget.border': '#e0e0e0',
      'editorWidget.foreground': '#111111',
      'input.background': '#ffffff',
      'input.foreground': '#111111',
      'inputOption.activeBorder': '#6b4400',
      'inputOption.activeBackground': '#6b440030',
      focusBorder: '#6b4400',
      'editorSuggestWidget.background': '#f7f7f7',
      'editorSuggestWidget.border': '#e0e0e0',
      'editorSuggestWidget.foreground': '#111111',
      'editorSuggestWidget.selectedBackground': '#e8e8e8',
      'editorSuggestWidget.selectedForeground': '#111111',
      'editorSuggestWidget.highlightForeground': '#6b4400',
      'editorSuggestWidget.focusHighlightForeground': '#6b4400',
      'editorHoverWidget.background': '#f7f7f7',
      'editorHoverWidget.border': '#e0e0e0',
      'editorHoverWidget.foreground': '#111111',
      editorHintForeground: '#111111',
      'parameterHints.background': '#f7f7f7',
      'parameterHints.border': '#e0e0e0',
    },
  });
}
