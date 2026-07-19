import type { Monaco } from '@monaco-editor/react';
import type { languages } from 'monaco-editor';

export function registerNeedlescriptTokenizer(monaco: Monaco): void {
  // ── Monarch tokenizer ─────────────────────────────────────────────
  // ignoreCase: true makes all regexes /i AND lowercases the matched
  // text before checking @keyword arrays — perfect for a case-insensitive
  // language like Needlescript.
  monaco.languages.setMonarchTokensProvider('needlescript', {
    ignoreCase: true,

    // ── Control flow & definition keywords (gold) ──────────────────
    keywords: [
      'repeat',
      'if',
      'else',
      'while',
      'for',
      'break',
      'continue',
      'return',
      'exit',
      'output',
      'op',
      'to',
      'end',
      'def',
      'import',
      'export',
      'as',
      'let',
      'make',
      'local',
      'in',
      'step',
      'true',
      'false',
      'and',
      'or',
      // Trace block expressions — bridge: sewing runs sandboxed, a path comes out.
      'trace',
      'tracerings',
    ],

    // ── Sewing-world transform & effect block commands (gold, italic) ─
    sewingKwCmds: [
      // Construction configuration scope.
      'stitchscope',
      // Transform block commands (CTM stack) — mutate the stitch transform.
      'translate',
      'rotate',
      'rotateabout',
      'scale',
      'scalexy',
      'mirror',
      'skew',
      'transform',
      // Effect block commands — warp/perturb the emitted stitch geometry.
      'warp',
      'humanize',
      'snaptogrid',
      'declump',
    ],

    // ── Turtle movement & pen commands — sewing world (teal, italic) ─
    movementCmds: [
      'fd',
      'forward',
      'bk',
      'back',
      'backward',
      'rt',
      'right',
      'lt',
      'left',
      'up',
      'down',
      'penup',
      'pendown',
      'pu',
      'pd',
      'setxy',
      'setx',
      'sety',
      'seth',
      'setheading',
      'home',
      'arc',
      'circle',
      'moveto',
      'jump',
      'gohome',
      'push',
      'pop',
      'cs',
      'clearscreen',
      'clear',
    ],

    // ── Turtle & loop state reporters — bridge: read-only (teal) ────
    sensorCmds: ['xcor', 'ycor', 'heading', 'repcount'],

    // ── Stitch / thread / professional commands — sewing world (amber, italic) ─
    stitchCmds: [
      'stitchlen',
      'stitchlength',
      'satin',
      'satinbetween',
      'density',
      'bean',
      'estitch',
      'beginfill',
      'endfill',
      'fill',
      'fillangle',
      'fillspacing',
      'filllen',
      'lock',
      'pullcomp',
      'shortstitch',
      'autotrim',
      'maxdensity',
      'color',
      'palette',
      'background',
      'stop',
      'trim',
      'fabric',
      'underlay',
      'fillunderlay',
      'hoop', // hoop directive (§hoop)
      'override', // override directive (§override)
    ],

    // ── Debug / neutral / data-world auxiliaries (amber) ────────────
    debugCmds: [
      'seed', // data-world RNG config
      'print',
      'printloc',
      'mark',
      'chalk',
      'assert',
    ],

    // ── Core built-in math functions (lavender) ─────────────────────
    mathFuncs: [
      'random',
      'sin',
      'cos',
      'sqrt',
      'abs',
      'round',
      'mod',
      'floor',
      'ceil',
      'min',
      'max',
      'pow',
      'log',
      'atan',
      'noise',
      'noise2',
      'distance',
      'towards',
      'not',
    ],

    // ── Library functions: list + generative math (mint) ────────────
    libFuncs: [
      // list functions
      'range',
      'filled',
      'len',
      'islist',
      'isref',
      'first',
      'last',
      'concat',
      'slice',
      'reverse',
      'sort',
      'copy',
      'indexof',
      'contains',
      'sum',
      'mean',
      'minof',
      'maxof',
      'pick',
      'shuffle',
      'pos',
      'removeat',
      'append',
      'prepend',
      'insertat',
      'setpos',
      // higher-order list functions
      'steps',
      'map',
      'filter',
      'reduce',
      'compose',
      'bind',
      // generative math
      'snoise2',
      'snoise3',
      'fbm2',
      'lerp',
      'remap',
      'clamp',
      'smoothstep',
      'gauss',
      'rgb',
      'hsl',
      'hexparts',
      'lerpcolor',
      'nearestcolor',
      'colordist',
      'slotcolor',
      'colorindex',
      'colorhex',
      'backgroundcolor',
      'vadd',
      'vsub',
      'vscale',
      'vlerp',
      'vdot',
      'vlen',
      'vdist',
      'vnorm',
      'vrot',
      'vheading',
      'vfromheading',
      'segisect',
      'segdist',
      'nearestonpath',
      'pathlen',
      'resample',
      'chaikin',
      'catmull',
      'bezier',
      'centroid',
      'bbox',
      'scatter',
      'voronoi',
      'triangulate',
      'hull',
      'relax',
      'offsetpath',
      'contourpaths',
      'spiralpath',
      'fillrows',
      'closepath',
      'clippaths',
      'inpath',
      'infield',
      'fieldbounds',
      'fieldpath',
      'sewpath',
      'xlate',
      'xrotate',
      'xscale',
      'xmirror',
      'warppath',
      'humanizepath',
      'snappath',
      'declumppath',
      'railspine',
      // satin-tuple helpers
      'satinpair',
      'satinrake',
      'satinasym',
      'railinset',
      'railrake',
      // fill-shaper helper
      'tatamirow',
      // stitch-history queries (closed-loop generation)
      'coverat',
      'countat',
      'nearestsewn',
      'sewnwithin',
      'stitchedpoints',
      // string functions
      'str',
      'num',
      'isstring',
      'chars',
      'split',
      'joinstr',
      'upper',
      'lower',
      'strip',
      'repeatstr',
    ],

    tokenizer: {
      root: [
        // Comments — three valid styles: // # ;
        [/\/\/.*$/, 'ns-comment'],
        [/#.*$/, 'ns-comment'],
        [/;.*$/, 'ns-comment'],

        // Single-quoted string literals: 'text' with \' \\ \n \t escapes
        [/'/, { token: 'ns-string', next: '@singleString' }],

        // Quoted-word (Logo "string" syntax): "woven "knit "label
        [/"[a-z_][a-z0-9_]*/, 'ns-string'],

        // Classic variable deref: :varname  :size
        [/:[a-z_][a-z0-9_]*/, 'ns-variable'],

        // Procedure reference: @push_out  @ripple  (fed to warp / warppath)
        [/@[a-z_][a-z0-9_]*/, 'ns-variable'],

        // Numbers — float before integer so 2.5 isn't tokenised as 2 then .5
        [/\d+\.\d+/, 'ns-number'],
        [/\d+/, 'ns-number'],

        // Identifiers — dispatch to the appropriate semantic group
        [
          /[a-z_][a-z0-9_]*/,
          {
            cases: {
              '@sewingKwCmds': 'ns-sewing-kw',
              '@keywords': 'ns-keyword',
              '@movementCmds': 'ns-movement',
              '@sensorCmds': 'ns-sensor',
              '@stitchCmds': 'ns-stitch',
              '@debugCmds': 'ns-debug',
              '@mathFuncs': 'ns-math',
              '@libFuncs': 'ns-lib',
              '@default': 'ns-identifier',
            },
          },
        ],

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
      // Single-quoted string state — handles \' \\ \n \t escapes and terminates on '
      singleString: [
        [/[^'\\]+/, 'ns-string'],
        [/\\./, 'ns-string-escape'],
        [/'/, { token: 'ns-string', next: '@pop' }],
      ],
    },
  } as languages.IMonarchLanguage);
}
