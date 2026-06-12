import type { Monaco } from '@monaco-editor/react';

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

  // ── Language registration ─────────────────────────────────────────
  monaco.languages.register({
    id: 'needlescript',
    extensions: ['.ns'],
    aliases: ['Needlescript', 'needlescript'],
  });

  // ── Monarch tokenizer ─────────────────────────────────────────────
  // ignoreCase: true makes all regexes /i AND lowercases the matched
  // text before checking @keyword arrays — perfect for a case-insensitive
  // language like Needlescript.
  monaco.languages.setMonarchTokensProvider('needlescript', {
    ignoreCase: true,

    // ── Control flow & definition keywords (gold) ──────────────────
    keywords: [
      'repeat', 'if', 'else', 'while', 'for', 'break', 'continue',
      'return', 'exit', 'output', 'op', 'to', 'end', 'def',
      'let', 'make', 'local', 'in', 'step', 'true', 'false', 'and', 'or',
    ],

    // ── Turtle movement commands + pen + state reporters (teal) ─────
    movementCmds: [
      'fd', 'forward', 'bk', 'back', 'backward',
      'rt', 'right', 'lt', 'left',
      'up', 'down', 'penup', 'pendown', 'pu', 'pd',
      'setxy', 'setx', 'sety', 'seth', 'setheading',
      'home', 'arc', 'push', 'pop', 'cs', 'clearscreen', 'clear',
      // zero-argument reporters that describe the turtle's current state
      'xcor', 'ycor', 'heading', 'repcount',
    ],

    // ── Stitch / thread / professional / debug commands (amber) ─────
    stitchCmds: [
      'stitchlen', 'stitchlength', 'satin', 'density', 'bean', 'estitch',
      'beginfill', 'endfill', 'fillangle', 'fillspacing', 'filllen',
      'lock', 'pullcomp', 'shortstitch', 'autotrim', 'maxdensity',
      'color', 'stop', 'trim',
      'seed', 'print', 'mark', 'assert',
      'fabric', 'underlay', 'fillunderlay',
    ],

    // ── Core built-in math functions (lavender) ─────────────────────
    mathFuncs: [
      'random', 'sin', 'cos', 'sqrt', 'abs', 'round', 'mod',
      'floor', 'ceil', 'min', 'max', 'pow', 'atan',
      'noise', 'noise2', 'distance', 'towards', 'not',
    ],

    // ── Library functions: list + generative math (mint) ────────────
    libFuncs: [
      // list functions
      'range', 'filled', 'len', 'islist', 'first', 'last',
      'concat', 'slice', 'reverse', 'sort', 'copy',
      'indexof', 'contains', 'sum', 'mean', 'minof', 'maxof',
      'pick', 'shuffle', 'pos', 'removeat',
      'append', 'prepend', 'insertat', 'setpos',
      // generative math
      'snoise2', 'snoise3', 'fbm2',
      'lerp', 'remap', 'clamp', 'smoothstep', 'gauss',
      'vadd', 'vsub', 'vscale', 'vlerp', 'vdot', 'vlen', 'vdist',
      'vnorm', 'vrot', 'vheading', 'vfromheading',
      'pathlen', 'resample', 'chaikin', 'catmull', 'bezier',
      'centroid', 'bbox',
      'scatter', 'voronoi', 'triangulate', 'hull', 'relax',
      'offsetpath', 'clippaths', 'inpath',
      'sewpath',
    ],

    tokenizer: {
      root: [
        // Comments — three valid styles: // # ;
        [/\/\/.*$/, 'ns-comment'],
        [/#.*$/, 'ns-comment'],
        [/;.*$/, 'ns-comment'],

        // Quoted-word (Logo "string" syntax): "woven "knit "label
        [/"[a-z_][a-z0-9_]*/, 'ns-string'],

        // Classic variable deref: :varname  :size
        [/:[a-z_][a-z0-9_]*/, 'ns-variable'],

        // Numbers — float before integer so 2.5 isn't tokenised as 2 then .5
        [/\d+\.\d+/, 'ns-number'],
        [/\d+/, 'ns-number'],

        // Identifiers — dispatch to the appropriate semantic group
        [/[a-z_][a-z0-9_]*/, {
          cases: {
            '@keywords':     'ns-keyword',
            '@movementCmds': 'ns-movement',
            '@stitchCmds':   'ns-stitch',
            '@mathFuncs':    'ns-math',
            '@libFuncs':     'ns-lib',
            '@default':      'ns-identifier',
          },
        }],

        // Multi-char operators before single-char so != etc. don't split
        [/[=!<>]=/, 'ns-operator'],
        // Single-char operators
        [/[+\-*/%<>!]/, 'ns-operator'],
        [/=/, 'ns-operator'],

        // Brackets and delimiters
        [/[[\]()]/, 'ns-bracket'],
        [/,/, 'ns-delimiter'],

        // Whitespace
        [/\s+/, ''],
      ],
    },
  } as Monaco['languages']['IMonarchLanguage']);

  // ── Custom dark theme ─────────────────────────────────────────────
  // Colour palette mirrors the app's CSS custom properties but is
  // provided as hex strings (no CSS variables available here).
  //
  // --night  #1B2030  --desk   #252B41  --desk-2 #2D3450
  // --line   #3A4163  --pale   #EDE7DA  --dim    #9BA1BD
  // --gold   #D9A441  --red    #C8472F
  monaco.editor.defineTheme('needlescript-dark', {
    base: 'vs-dark',
    inherit: false,
    rules: [
      // Default / plain identifiers
      { token: '',              foreground: 'EDE7DA' },
      { token: 'ns-identifier', foreground: 'EDE7DA' },
      // Comments — muted, italic
      { token: 'ns-comment',    foreground: '5E6585', fontStyle: 'italic' },
      // Control flow & definition keywords — brand gold, bold
      { token: 'ns-keyword',    foreground: 'D9A441', fontStyle: 'bold' },
      // Turtle movement + reporters — sky teal
      { token: 'ns-movement',   foreground: '62C4D4' },
      // Stitch / thread / fabric commands — warm amber
      { token: 'ns-stitch',     foreground: 'C87C3C' },
      // Core math functions — soft lavender
      { token: 'ns-math',       foreground: '9888CC' },
      // Library functions (list + generative) — mint green
      { token: 'ns-lib',        foreground: '6AB898' },
      // Numbers
      { token: 'ns-number',     foreground: 'D4B04A' },
      // Quoted words / Logo "strings"
      { token: 'ns-string',     foreground: '80B864' },
      // Classic variable deref :var — steel blue, italic
      { token: 'ns-variable',   foreground: 'A8C4E0', fontStyle: 'italic' },
      // Operators and punctuation — muted
      { token: 'ns-operator',   foreground: '9BA1BD' },
      { token: 'ns-bracket',    foreground: '7A80A0' },
      { token: 'ns-delimiter',  foreground: '7A80A0' },
    ],
    colors: {
      // Editor surface
      'editor.background':                    '#252B41',
      'editor.foreground':                    '#EDE7DA',
      // Cursor
      'editorCursor.foreground':              '#D9A441',
      // Selection
      'editor.selectionBackground':           '#D9A44140',
      'editor.inactiveSelectionBackground':   '#D9A44122',
      // Current-line highlight (cursor line, not the playback line)
      'editor.lineHighlightBackground':       '#2D3454',
      'editor.lineHighlightBorder':           '#00000000',
      // Line numbers
      'editorLineNumber.foreground':          '#454C6E',
      'editorLineNumber.activeForeground':    '#9BA1BD',
      // Gutter (slightly darker than editor background)
      'editorGutter.background':              '#1F253A',
      // Indent guides
      'editorIndentGuide.background1':        '#3A416333',
      'editorIndentGuide.activeBackground1':  '#5A618388',
      // Bracket pair colorization defaults
      'editorBracketHighlight.foreground1':   '#D9A441',
      'editorBracketHighlight.foreground2':   '#62C4D4',
      'editorBracketHighlight.foreground3':   '#9888CC',
      // Find/match highlight
      'editor.findMatchBackground':           '#D9A44150',
      'editor.findMatchHighlightBackground':  '#D9A44128',
      // Scrollbar
      'scrollbarSlider.background':           '#3A416344',
      'scrollbarSlider.hoverBackground':      '#5A618388',
      'scrollbarSlider.activeBackground':     '#7A81A3AA',
      // Overview ruler
      'editorOverviewRuler.border':           '#00000000',
      // Widget popups (find bar, etc.)
      'editorWidget.background':              '#1B2030',
      'editorWidget.border':                  '#3A4163',
      'editorWidget.foreground':              '#EDE7DA',
      // Input boxes inside widgets
      'input.background':                     '#252B41',
      'input.foreground':                     '#EDE7DA',
      'inputOption.activeBorder':             '#D9A441',
      'inputOption.activeBackground':         '#D9A44130',
      // Focus border
      'focusBorder':                          '#D9A441',
    },
  });

  // ── Language configuration ────────────────────────────────────────
  // Enables auto-close brackets, comment toggling, etc. as Monaco features.
  monaco.languages.setLanguageConfiguration('needlescript', {
    comments: {
      lineComment: '//',
    },
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
