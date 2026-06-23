import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  bgApp, bgPanel, bgPanelRaised, text, textFaint,
  gold, borderCool,
  synComment, synKeyword, synMovement, synStitch, synMath, synLib,
  synNumber, synString, synVariable, synOperator, synBracket,
  monacoGutter, monacoLineNumber, monacoLineNumberActive, monacoLineHighlight,
  monacoIndentGuide, monacoIndentGuideActive,
  m,
} from '../theme.ts';

// Minimal position interface — structurally compatible with monaco.Position / IPosition.
type IPos = { readonly lineNumber: number; readonly column: number };

// ── NS_ITEMS: static catalog of all Needlescript built-ins ───────────────────
//
// kindName maps to monaco.languages.CompletionItemKind inside registerNeedlescript.
// params: string[][] — overloads for signature help; each sub-array is the
//   parameter display names for one overload.  [[]] means zero-arg reporter.
//   Absent means "no signature help for this item" (keywords, QWORD commands).
// isSnippet: true when insertText uses ${ } placeholder syntax.

type NSItemKind = 'keyword' | 'function' | 'variable' | 'constant';

interface NSItem {
  label:         string;
  kindName:      NSItemKind;
  detail:        string;       // short inline hint in the suggestion dropdown
  documentation: string;       // Markdown shown in the details panel
  insertText:    string;
  isSnippet?:    boolean;
  params?:       string[][];   // overloads for signature help
}

const NS_ITEMS: NSItem[] = [

  // ── Keywords & control flow ──────────────────────────────────────────────
  {
    label: 'repeat',
    kindName: 'keyword',
    detail: 'loop n times',
    documentation: 'Loop n times. `repcount` is the 1-based counter of the innermost repeat.\n\n```\nrepeat 36 [\n  fd 5  rt 10\n]\n```',
    insertText: 'repeat ${1:n} [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'while',
    kindName: 'keyword',
    detail: 'loop while condition is true',
    documentation: 'Loop while the condition is true (non-zero). `while true [ … break ]` is the idiomatic search loop.',
    insertText: 'while ${1:condition} [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'for',
    kindName: 'keyword',
    detail: 'counted or for-in loop',
    documentation: '**Counted loop:** `for i = 0 to n [ … ]` — inclusive of *to*, step defaults to 1.\n\n**For-in loop:** `for x in xs [ … ]` — iterate list elements.\n\n**With step:** `for i = 10 to 1 step -2 [ … ]`',
    insertText: 'for ${1:i} = ${2:0} to ${3:n} [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'if',
    kindName: 'keyword',
    detail: 'conditional',
    documentation: 'Conditional block. Chains with `else if` and `else`.\n\n```\nif x > 0 [\n  fd x\n] else [\n  bk x\n]\n```',
    insertText: 'if ${1:condition} [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'else',
    kindName: 'keyword',
    detail: 'alternative branch',
    documentation: 'Follows an `if` block. Can chain: `if … else if … else …`.',
    insertText: 'else [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'break',
    kindName: 'keyword',
    detail: 'exit innermost loop',
    documentation: 'Exits the innermost `repeat`, `while`, or `for` loop immediately.',
    insertText: 'break',
  },
  {
    label: 'continue',
    kindName: 'keyword',
    detail: 'skip to next iteration',
    documentation: 'Skips to the next iteration of the innermost loop.',
    insertText: 'continue',
  },
  {
    label: 'def',
    kindName: 'keyword',
    detail: 'define a procedure',
    documentation: 'Define a procedure. Parameters are local and can recurse (depth limit 200).\n\n```\ndef leaf(size) [\n  fd size  bk size\n]\n```\nClassic form: `to name :a :b … end`',
    insertText: 'def ${1:name}(${2:params}) [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'to',
    kindName: 'keyword',
    detail: 'classic procedure definition',
    documentation: 'Classic Logo procedure definition. Modern equivalent: `def name(a, b) [ … ]`.\n\n```\nto leaf :size\n  fd :size  bk :size\nend\n```',
    insertText: 'to ${1:name} :${2:param}\n\t$0\nend',
    isSnippet: true,
  },
  {
    label: 'end',
    kindName: 'keyword',
    detail: 'close classic procedure',
    documentation: 'Closes a `to … end` procedure definition.',
    insertText: 'end',
  },
  {
    label: 'return',
    kindName: 'keyword',
    detail: 'return value / exit early',
    documentation: 'Return a value from a procedure. Without argument, exits early. Classic aliases: `output`, `op`.',
    insertText: 'return ${1:value}',
    isSnippet: true,
  },
  {
    label: 'output',
    kindName: 'keyword',
    detail: 'classic return (alias)',
    documentation: 'Classic Logo alias for `return`. Only valid inside a procedure.',
    insertText: 'output ${1:value}',
    isSnippet: true,
  },
  {
    label: 'exit',
    kindName: 'keyword',
    detail: 'exit procedure early',
    documentation: 'Classic Logo alias for `return` with no value.',
    insertText: 'exit',
  },
  {
    label: 'let',
    kindName: 'keyword',
    detail: 'declare a variable',
    documentation: 'Declare a variable — global at top level, local inside a procedure. Redeclaring the same name in the same scope is a parse error.',
    insertText: 'let ${1:name} = ${2:value}',
    isSnippet: true,
  },
  {
    label: 'make',
    kindName: 'keyword',
    detail: 'classic variable assignment',
    documentation: 'Classic Logo assignment: `make "x expr`. Same rules as `x = expr`.',
    insertText: 'make "${1:name} ${2:value}',
    isSnippet: true,
  },
  {
    label: 'local',
    kindName: 'keyword',
    detail: 'classic local variable',
    documentation: 'Classic Logo local variable declaration inside a procedure. Illegal at top level.',
    insertText: 'local "${1:name} ${2:value}',
    isSnippet: true,
  },
  {
    label: 'and',
    kindName: 'keyword',
    detail: 'logical AND (short-circuit)',
    documentation: 'Logical AND, short-circuits. `i > 0 and 10/i > 2` is safe.',
    insertText: 'and',
  },
  {
    label: 'or',
    kindName: 'keyword',
    detail: 'logical OR (short-circuit)',
    documentation: 'Logical OR, short-circuits.',
    insertText: 'or',
  },
  {
    label: 'true',
    kindName: 'constant',
    detail: 'literal 1',
    documentation: 'Literal for 1. Truthiness: anything non-zero is true.',
    insertText: 'true',
  },
  {
    label: 'false',
    kindName: 'constant',
    detail: 'literal 0',
    documentation: 'Literal for 0. Truthiness: 0 is false.',
    insertText: 'false',
  },
  {
    label: 'in',
    kindName: 'keyword',
    detail: 'for-in keyword',
    documentation: 'Used in `for x in xs [ … ]` to iterate list elements.',
    insertText: 'in',
  },
  {
    label: 'step',
    kindName: 'keyword',
    detail: 'loop step size',
    documentation: 'Optional step in a `for` loop: `for i = 10 to 1 step -2 [ … ]`.',
    insertText: 'step',
  },

  // ── Movement commands ────────────────────────────────────────────────────
  {
    label: 'fd',
    kindName: 'function',
    detail: 'sew forward (mm)',
    documentation: 'Sew forward n mm. Long moves auto-split at `stitchlen`.\n\nAlias: `forward`',
    insertText: 'fd ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'forward',
    kindName: 'function',
    detail: 'sew forward — alias for fd',
    documentation: 'Alias for `fd`. Sew forward n mm.',
    insertText: 'forward ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'bk',
    kindName: 'function',
    detail: 'sew backward (mm)',
    documentation: 'Sew backward n mm.\n\nAliases: `back`, `backward`',
    insertText: 'bk ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'back',
    kindName: 'function',
    detail: 'sew backward — alias for bk',
    documentation: 'Alias for `bk`. Sew backward n mm.',
    insertText: 'back ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'rt',
    kindName: 'function',
    detail: 'turn right (degrees)',
    documentation: 'Turn right by deg degrees.\n\nAlias: `right`',
    insertText: 'rt ${1:degrees}',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'right',
    kindName: 'function',
    detail: 'turn right — alias for rt',
    documentation: 'Alias for `rt`. Turn right by deg degrees.',
    insertText: 'right ${1:degrees}',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'lt',
    kindName: 'function',
    detail: 'turn left (degrees)',
    documentation: 'Turn left by deg degrees.\n\nAlias: `left`',
    insertText: 'lt ${1:degrees}',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'left',
    kindName: 'function',
    detail: 'turn left — alias for lt',
    documentation: 'Alias for `lt`. Turn left by deg degrees.',
    insertText: 'left ${1:degrees}',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'up',
    kindName: 'function',
    detail: 'pen up (travel mode)',
    documentation: 'Needle up — subsequent moves are jump travels, not stitches.\n\nAliases: `penup`, `pu`',
    insertText: 'up',
  },
  {
    label: 'down',
    kindName: 'function',
    detail: 'pen down (sew mode)',
    documentation: 'Needle down — subsequent moves sew stitches.\n\nAliases: `pendown`, `pd`',
    insertText: 'down',
  },
  {
    label: 'penup',
    kindName: 'function',
    detail: 'pen up — alias for up',
    documentation: 'Alias for `up`. Needle up — jump travel mode.',
    insertText: 'penup',
  },
  {
    label: 'pendown',
    kindName: 'function',
    detail: 'pen down — alias for down',
    documentation: 'Alias for `down`. Needle down — sewing mode.',
    insertText: 'pendown',
  },
  {
    label: 'arc',
    kindName: 'function',
    detail: 'sew an arc',
    documentation: 'Sew along a circle of radius mm, turning deg in total. Positive degrees curves right, negative left. Works in every stitch mode — including satin!',
    insertText: 'arc ${1:degrees} ${2:radius}',
    isSnippet: true,
    params: [['degrees', 'radius']],
  },
  {
    label: 'setxy',
    kindName: 'function',
    detail: 'move to absolute position',
    documentation: 'Move (sew or jump depending on pen state) to the absolute position (x, y).',
    insertText: 'setxy ${1:x} ${2:y}',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'setx',
    kindName: 'function',
    detail: 'set x position',
    documentation: 'Set the x coordinate absolutely; y stays the same.',
    insertText: 'setx ${1:x}',
    isSnippet: true,
    params: [['x']],
  },
  {
    label: 'sety',
    kindName: 'function',
    detail: 'set y position',
    documentation: 'Set the y coordinate absolutely; x stays the same.',
    insertText: 'sety ${1:y}',
    isSnippet: true,
    params: [['y']],
  },
  {
    label: 'seth',
    kindName: 'function',
    detail: 'set heading (degrees)',
    documentation: 'Set the heading absolutely. 0 = up/north, clockwise positive.\n\nAlias: `setheading`',
    insertText: 'seth ${1:degrees}',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'setheading',
    kindName: 'function',
    detail: 'set heading — alias for seth',
    documentation: 'Alias for `seth`. Set heading in degrees (0 = north, clockwise).',
    insertText: 'setheading ${1:degrees}',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'home',
    kindName: 'function',
    detail: 'return to (0,0), heading 0',
    documentation: 'Return to origin (0, 0) with heading 0 (north). Sews/jumps depending on pen state.',
    insertText: 'home',
  },
  {
    label: 'push',
    kindName: 'function',
    detail: 'save needle state onto stack',
    documentation: 'Save needle state (position, heading, pen up/down) onto a stack. Max 500 saved states.',
    insertText: 'push',
  },
  {
    label: 'pop',
    kindName: 'function',
    detail: 'restore needle state from stack',
    documentation: 'Restore the last saved needle state from the stack. Pop on an empty stack warns and is ignored.',
    insertText: 'pop',
  },
  {
    label: 'cs',
    kindName: 'function',
    detail: 'clearscreen (no-op)',
    documentation: 'Accepted for Logo familiarity; does nothing in NeedleScript.\n\nAliases: `clearscreen`, `clear`',
    insertText: 'cs',
  },
  // Zero-arg reporters
  {
    label: 'xcor',
    kindName: 'variable',
    detail: 'current needle x (mm)',
    documentation: 'Reports the current needle x position in mm.',
    insertText: 'xcor',
    params: [[]],
  },
  {
    label: 'ycor',
    kindName: 'variable',
    detail: 'current needle y (mm)',
    documentation: 'Reports the current needle y position in mm.',
    insertText: 'ycor',
    params: [[]],
  },
  {
    label: 'heading',
    kindName: 'variable',
    detail: 'current heading (degrees)',
    documentation: 'Reports the current heading in degrees (0 = north, clockwise positive).',
    insertText: 'heading',
    params: [[]],
  },
  {
    label: 'repcount',
    kindName: 'variable',
    detail: '1-based repeat counter',
    documentation: 'Reports the 1-based counter of the innermost `repeat` loop.',
    insertText: 'repcount',
    params: [[]],
  },

  // ── Transforms (CTM stack: args then a block) ────────────────────────────
  {
    label: 'translate',
    kindName: 'keyword',
    detail: 'shift a block by (dx, dy) mm',
    documentation: 'Shift everything the block draws by `(dx, dy)` mm. The turtle stays in local space — only emitted geometry moves.\n\n```\ntranslate 20 0 [ leaf() ]\ntranslate(20, 0) [ leaf() ]   // same thing\n```',
    insertText: 'translate ${1:dx} ${2:dy} [\n\t$0\n]',
    isSnippet: true,
    params: [['dx', 'dy']],
  },
  {
    label: 'rotate',
    kindName: 'keyword',
    detail: 'rotate a block (clockwise, about origin)',
    documentation: 'Rotate the block `deg` degrees clockwise about the current origin (0 = north, matching `seth`/`rt`).',
    insertText: 'rotate ${1:degrees} [\n\t$0\n]',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'rotateabout',
    kindName: 'keyword',
    detail: 'rotate about an explicit pivot',
    documentation: 'Rotate the block `deg` clockwise about the pivot `(cx, cy)`.',
    insertText: 'rotateabout ${1:degrees} ${2:cx} ${3:cy} [\n\t$0\n]',
    isSnippet: true,
    params: [['degrees', 'cx', 'cy']],
  },
  {
    label: 'scale',
    kindName: 'keyword',
    detail: 'uniform scale',
    documentation: 'Uniformly scale the block by `s`. Stitch length, satin width and the physics layer are re-evaluated **after** scaling, so a scaled motif still sews like real embroidery — not stretched stitches.',
    insertText: 'scale ${1:s} [\n\t$0\n]',
    isSnippet: true,
    params: [['s']],
  },
  {
    label: 'scalexy',
    kindName: 'keyword',
    detail: 'independent axis scale',
    documentation: 'Scale the block by `sx` on x and `sy` on y. Non-uniform scale makes satin width direction-dependent (a column running across the stretched axis widens).',
    insertText: 'scalexy ${1:sx} ${2:sy} [\n\t$0\n]',
    isSnippet: true,
    params: [['sx', 'sy']],
  },
  {
    label: 'mirror',
    kindName: 'keyword',
    detail: 'reflect across a heading line',
    documentation: 'Reflect the block across a line through the origin at heading `deg`. `mirror 0` flips left/right; `mirror 90` flips top/bottom.',
    insertText: 'mirror ${1:degrees} [\n\t$0\n]',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'skew',
    kindName: 'keyword',
    detail: 'shear by ax / ay degrees',
    documentation: 'Shear the block: `x += tan(ax)·y`, `y += tan(ay)·x`.',
    insertText: 'skew ${1:ax} ${2:ay} [\n\t$0\n]',
    isSnippet: true,
    params: [['ax', 'ay']],
  },
  {
    label: 'transform',
    kindName: 'keyword',
    detail: 'raw 2×3 affine escape hatch',
    documentation: 'Apply the raw affine `(x, y) → (a·x + c·y + e, b·x + d·y + f)` to the block — the power-user escape hatch behind the named transforms.',
    insertText: 'transform ${1:a} ${2:b} ${3:c} ${4:d} ${5:e} ${6:f} [\n\t$0\n]',
    isSnippet: true,
    params: [['a', 'b', 'c', 'd', 'e', 'f']],
  },

  // ── Thread & stitch commands ─────────────────────────────────────────────
  {
    label: 'stitchlen',
    kindName: 'function',
    detail: 'running stitch length (mm)',
    documentation: 'Running-stitch length, clamped 0.4–12 mm (default 2.5).\n\nAlias: `stitchlength`',
    insertText: 'stitchlen ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'stitchlength',
    kindName: 'function',
    detail: 'running stitch length — alias for stitchlen',
    documentation: 'Alias for `stitchlen`. Running-stitch length 0.4–12 mm.',
    insertText: 'stitchlength ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'satin',
    kindName: 'function',
    detail: 'satin column width (mm)',
    documentation: 'Zigzag satin column of this width; penetration spacing set by `density`. `satin 0` returns to running stitch. Width > ~8 mm risks snagging.',
    insertText: 'satin ${1:width}',
    isSnippet: true,
    params: [['width']],
  },
  {
    label: 'density',
    kindName: 'function',
    detail: 'satin penetration spacing (mm)',
    documentation: 'Satin penetration spacing, 0.25–5 mm (default 0.4).',
    insertText: 'density ${1:spacing}',
    isSnippet: true,
    params: [['spacing']],
  },
  {
    label: 'bean',
    kindName: 'function',
    detail: 'bold stitch repeat count (1–9)',
    documentation: 'Bold line: each stitch sewn n times (forced odd, max 9). `bean 1` off.',
    insertText: 'bean ${1:count}',
    isSnippet: true,
    params: [['count']],
  },
  {
    label: 'estitch',
    kindName: 'function',
    detail: 'blanket stitch prong length (mm)',
    documentation: 'Blanket stitch: prongs of this length on the left of travel direction, spaced by `stitchlen`. `estitch 0` off.',
    insertText: 'estitch ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'beginfill',
    kindName: 'function',
    detail: 'begin fill boundary trace',
    documentation: 'Start tracing a fill boundary. Moves between `beginfill` and `endfill` define the shape rather than sewing. A pen-up move starts a new ring — inner rings become holes (even-odd rule).',
    insertText: 'beginfill',
  },
  {
    label: 'endfill',
    kindName: 'function',
    detail: 'end fill — sew the enclosed area',
    documentation: 'Close the fill boundary and sew a tatami fill of the enclosed area.',
    insertText: 'endfill',
  },
  {
    label: 'fillangle',
    kindName: 'function',
    detail: 'fill row direction (degrees)',
    documentation: 'Direction of the fill stitch rows, in degrees (default 0 = vertical).',
    insertText: 'fillangle ${1:degrees}',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'fillspacing',
    kindName: 'function',
    detail: 'fill row spacing (mm)',
    documentation: 'Fill row spacing, 0.25–5 mm (default 0.4).',
    insertText: 'fillspacing ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'filllen',
    kindName: 'function',
    detail: 'fill stitch length (mm)',
    documentation: 'Fill stitch length, 1–7 mm. Defaults to `stitchlen`. `filllen 0` to follow `stitchlen` again. Rows are brick-offset so penetrations don\'t line up.',
    insertText: 'filllen ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'color',
    kindName: 'function',
    detail: 'switch thread color',
    documentation: 'Switch to thread n (emits a DST colour-change stop).',
    insertText: 'color ${1:n}',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'stop',
    kindName: 'function',
    detail: 'next color (shorthand)',
    documentation: 'Shorthand for "next colour" — equivalent to incrementing the thread number by 1.',
    insertText: 'stop',
  },
  {
    label: 'trim',
    kindName: 'function',
    detail: 'cut thread here',
    documentation: 'Cut the thread here. Long travels also get one automatically (see `autotrim`).',
    insertText: 'trim',
  },
  {
    label: 'lock',
    kindName: 'function',
    detail: 'tie-in/tie-off size (mm)',
    documentation: 'Tie-in/tie-off: 4 micro back-stitches where thread starts/ends. Size 0.3–1.5 mm (default 0.7). `lock 0` off.',
    insertText: 'lock ${1:size}',
    isSnippet: true,
    params: [['size']],
  },
  {
    label: 'pullcomp',
    kindName: 'function',
    detail: 'pull compensation (mm)',
    documentation: 'Pull compensation 0–1.5 mm: widens satin columns and extends fill rows so shapes sew out at their digitized size.',
    insertText: 'pullcomp ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'shortstitch',
    kindName: 'function',
    detail: 'short-stitch on/off (0 or 1)',
    documentation: 'Curve physics (on by default): on tight satin curves, alternate inner stitches are shortened to 60% width to prevent thread breaks.',
    insertText: 'shortstitch ${1:on}',
    isSnippet: true,
    params: [['on']],
  },
  {
    label: 'autotrim',
    kindName: 'function',
    detail: 'auto-trim threshold (mm)',
    documentation: 'Auto trim before travels ≥ n mm (default 7, range 3–30). `autotrim 0` off.',
    insertText: 'autotrim ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'maxdensity',
    kindName: 'function',
    detail: 'density warning threshold (layers)',
    documentation: 'Thread-coverage warning threshold in layers (default 3.5). `maxdensity 0` silences warnings.',
    insertText: 'maxdensity ${1:layers}',
    isSnippet: true,
    params: [['layers']],
  },
  // QWORD commands — snippet with inline choice list
  {
    label: 'fabric',
    kindName: 'function',
    detail: 'fabric preset',
    documentation: 'Apply a fabric preset. Sets pull compensation, density limit, and underlay defaults.\n\n- `"woven` — pull 0.2 mm, max 3.5 layers\n- `"knit` — pull 0.5 mm, max 3.0, density floor 0.45 mm\n- `"stretch` — pull 0.6 mm, max 2.8, density floor 0.5 mm\n- `"denim` / `"canvas` — pull 0.15 mm, max 4.0\n- `"fleece` — pull 0.3 mm, max 2.6, double underlay',
    insertText: 'fabric "${1|woven,knit,stretch,denim,canvas,fleece|}"',
    isSnippet: true,
  },
  {
    label: 'underlay',
    kindName: 'function',
    detail: 'satin underlay style',
    documentation: 'Stabilising stitches under each satin column.\n\n- `"auto` — picks by width: <1.5 mm none, <4 mm center, wider zigzag\n- `"center` — center walk\n- `"edge` — edge walk\n- `"zigzag` — cross-grain zigzag\n- `"off` — no underlay',
    insertText: 'underlay "${1|auto,center,edge,zigzag,off|}"',
    isSnippet: true,
  },
  {
    label: 'fillunderlay',
    kindName: 'function',
    detail: 'fill underlay style',
    documentation: 'Underlay beneath fills.\n\n- `"auto` — tatami, plus edge run on areas > 100 mm²\n- `"tatami` — sparse cross-grain pass\n- `"edge` — inset edge run only\n- `"off` — no underlay',
    insertText: 'fillunderlay "${1|auto,tatami,edge,off|}"',
    isSnippet: true,
  },
  // Debug commands
  {
    label: 'seed',
    kindName: 'function',
    detail: 'reseed the RNG',
    documentation: 'Reseed the random number generator (default 42). Same seed → same design.',
    insertText: 'seed ${1:n}',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'print',
    kindName: 'function',
    detail: 'log value to console',
    documentation: 'Log a value to the console. `print "label expr` adds a label:\n`print "radius r` → `radius: 1.5`',
    insertText: 'print ${1:value}',
    isSnippet: true,
    params: [['value']],
  },
  {
    label: 'mark',
    kindName: 'function',
    detail: 'drop debug pin on stage',
    documentation: 'Drop a numbered pin on the preview at the needle position. Never exported to the machine or counted in stats.',
    insertText: 'mark',
  },
  {
    label: 'assert',
    kindName: 'function',
    detail: 'assertion check',
    documentation: 'Stop with an error (and line number) if the condition is false.\n\nExample: `assert (distance 0 0) < 47`',
    insertText: 'assert ${1:condition}',
    isSnippet: true,
    params: [['condition']],
  },

  // ── Core math functions ──────────────────────────────────────────────────
  {
    label: 'random',
    kindName: 'function',
    detail: 'seeded random in 0…max',
    documentation: 'Seeded random number in 0…n. Reproducible — driven by `seed`.',
    insertText: 'random(${1:max})',
    isSnippet: true,
    params: [['max']],
  },
  {
    label: 'sin',
    kindName: 'function',
    detail: 'sine (degrees)',
    documentation: 'Sine in degrees.',
    insertText: 'sin(${1:degrees})',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'cos',
    kindName: 'function',
    detail: 'cosine (degrees)',
    documentation: 'Cosine in degrees.',
    insertText: 'cos(${1:degrees})',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'sqrt',
    kindName: 'function',
    detail: 'square root',
    documentation: 'Square root. Negative argument is a runtime error.',
    insertText: 'sqrt(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'abs',
    kindName: 'function',
    detail: 'absolute value',
    documentation: 'Absolute value.',
    insertText: 'abs(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'round',
    kindName: 'function',
    detail: 'round to nearest integer',
    documentation: 'Round to nearest integer.',
    insertText: 'round(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'floor',
    kindName: 'function',
    detail: 'round down (floor)',
    documentation: 'Round down (floor).',
    insertText: 'floor(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'ceil',
    kindName: 'function',
    detail: 'round up (ceiling)',
    documentation: 'Round up (ceiling).',
    insertText: 'ceil(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'mod',
    kindName: 'function',
    detail: 'floor modulo',
    documentation: 'Floor modulo — result always has the sign of b. `mod(-7, 3)` is 2, not −1. The `%` operator is the same operation.',
    insertText: 'mod(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'min',
    kindName: 'function',
    detail: 'minimum of two numbers',
    documentation: 'Minimum of a and b.',
    insertText: 'min(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'max',
    kindName: 'function',
    detail: 'maximum of two numbers',
    documentation: 'Maximum of a and b.',
    insertText: 'max(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'pow',
    kindName: 'function',
    detail: 'raise to a power',
    documentation: 'base raised to the exp. Non-finite result is a runtime error.',
    insertText: 'pow(${1:base}, ${2:exp})',
    isSnippet: true,
    params: [['base', 'exp']],
  },
  {
    label: 'atan',
    kindName: 'function',
    detail: 'heading of vector (x, y)',
    documentation: 'Heading of the vector (x, y) in turtle degrees: 0 = north, clockwise. `atan(1, 0)` is 90.',
    insertText: 'atan(${1:x}, ${2:y})',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'noise',
    kindName: 'function',
    detail: '1D value noise (0…1)',
    documentation: 'Smooth seeded value noise in 0…1. Sample slowly (divide coordinates by 10–20) for organic drift.',
    insertText: 'noise(${1:x})',
    isSnippet: true,
    params: [['x']],
  },
  {
    label: 'noise2',
    kindName: 'function',
    detail: '2D value noise (0…1)',
    documentation: '2D smooth seeded value noise in 0…1. Same seed → same field.',
    insertText: 'noise2(${1:x}, ${2:y})',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'distance',
    kindName: 'function',
    detail: 'distance from needle to point',
    documentation: 'Distance from the current needle position to the point (x, y).',
    insertText: 'distance(${1:x}, ${2:y})',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'towards',
    kindName: 'function',
    detail: 'heading from needle to point',
    documentation: 'Heading from the needle to the point (x, y). `seth towards(0, 0)` aims home.',
    insertText: 'towards(${1:x}, ${2:y})',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'not',
    kindName: 'function',
    detail: 'logical NOT',
    documentation: 'Logical NOT. Also written `!`. Binds tightly — write `!(a = 1)` when negating a comparison.',
    insertText: 'not(${1:value})',
    isSnippet: true,
    params: [['value']],
  },

  // ── List functions (call-syntax only) ────────────────────────────────────
  {
    label: 'range',
    kindName: 'function',
    detail: 'create a range list',
    documentation: '`range(n)` → [0…n-1]\n`range(a, b)` → [a…b-1]\n`range(a, b, step)` → stepped\n\n0-based, end-exclusive (like Python). Call-syntax only.',
    insertText: 'range(${1:n})',
    isSnippet: true,
    params: [['n'], ['start', 'end'], ['start', 'end', 'step']],
  },
  {
    label: 'filled',
    kindName: 'function',
    detail: 'list of n copies of a value',
    documentation: 'New list of n deep copies of v.',
    insertText: 'filled(${1:count}, ${2:value})',
    isSnippet: true,
    params: [['count', 'value']],
  },
  {
    label: 'len',
    kindName: 'function',
    detail: 'list element count',
    documentation: 'Element count of a list.',
    insertText: 'len(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'islist',
    kindName: 'function',
    detail: '1 if value is a list',
    documentation: '1 if the value is a list, 0 otherwise.',
    insertText: 'islist(${1:value})',
    isSnippet: true,
    params: [['value']],
  },
  {
    label: 'first',
    kindName: 'function',
    detail: 'first element (xs[0])',
    documentation: 'Returns the first element of a list (same as `xs[0]`).',
    insertText: 'first(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'last',
    kindName: 'function',
    detail: 'last element (xs[-1])',
    documentation: 'Returns the last element of a list (same as `xs[-1]`).',
    insertText: 'last(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'concat',
    kindName: 'function',
    detail: 'concatenate two lists',
    documentation: 'Returns a new list (shallow — elements are shared references).',
    insertText: 'concat(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'slice',
    kindName: 'function',
    detail: 'slice a list',
    documentation: '`slice(xs, start)` or `slice(xs, start, end)` — new list, Python semantics including negative bounds, clamped.',
    insertText: 'slice(${1:list}, ${2:start})',
    isSnippet: true,
    params: [['list', 'start'], ['list', 'start', 'end']],
  },
  {
    label: 'reverse',
    kindName: 'function',
    detail: 'reversed list (pure)',
    documentation: 'Returns a new reversed list (pure — does not mutate the original).',
    insertText: 'reverse(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'sort',
    kindName: 'function',
    detail: 'sorted list (pure, ascending)',
    documentation: 'Returns a new sorted list. Numbers only, ascending, stable. Pure — does not mutate.',
    insertText: 'sort(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'copy',
    kindName: 'function',
    detail: 'deep copy of a list',
    documentation: 'Deep copy — fully independent of the original.',
    insertText: 'copy(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'indexof',
    kindName: 'function',
    detail: 'first index of value (or -1)',
    documentation: 'First index of v (deep tolerant compare) or −1 if not found.',
    insertText: 'indexof(${1:list}, ${2:value})',
    isSnippet: true,
    params: [['list', 'value']],
  },
  {
    label: 'contains',
    kindName: 'function',
    detail: '1 if list contains value',
    documentation: '1 if the list contains v (deep tolerant compare), 0 otherwise.',
    insertText: 'contains(${1:list}, ${2:value})',
    isSnippet: true,
    params: [['list', 'value']],
  },
  {
    label: 'sum',
    kindName: 'function',
    detail: 'sum of list elements',
    documentation: 'Sum of all elements. `sum([])` is 0.',
    insertText: 'sum(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'mean',
    kindName: 'function',
    detail: 'mean of list elements',
    documentation: 'Arithmetic mean. Errors on an empty list.',
    insertText: 'mean(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'minof',
    kindName: 'function',
    detail: 'minimum element',
    documentation: 'Minimum element. Errors on an empty list.',
    insertText: 'minof(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'maxof',
    kindName: 'function',
    detail: 'maximum element',
    documentation: 'Maximum element. Errors on an empty list.',
    insertText: 'maxof(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'pick',
    kindName: 'function',
    detail: 'random element from list',
    documentation: 'Returns a random element — seeded, exactly one RNG draw.',
    insertText: 'pick(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'shuffle',
    kindName: 'function',
    detail: 'shuffled list (pure)',
    documentation: 'Returns a new shuffled list — seeded, forks a child RNG. Pure — does not mutate.',
    insertText: 'shuffle(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'pos',
    kindName: 'function',
    detail: 'needle position as [x, y]',
    documentation: 'Needle position as `[xcor, ycor]`. Pair with `setpos(p)` to save and restore positions.',
    insertText: 'pos()',
    params: [[]],
  },
  {
    label: 'removeat',
    kindName: 'function',
    detail: 'remove and return element at index',
    documentation: 'Mutates: removes element at index i and returns the removed value.',
    insertText: 'removeat(${1:list}, ${2:index})',
    isSnippet: true,
    params: [['list', 'index']],
  },
  {
    label: 'append',
    kindName: 'function',
    detail: 'add value to end of list',
    documentation: 'Mutates: adds v at the end of the list.',
    insertText: 'append(${1:list}, ${2:value})',
    isSnippet: true,
    params: [['list', 'value']],
  },
  {
    label: 'prepend',
    kindName: 'function',
    detail: 'add value to start of list',
    documentation: 'Mutates: adds v at the front of the list.',
    insertText: 'prepend(${1:list}, ${2:value})',
    isSnippet: true,
    params: [['list', 'value']],
  },
  {
    label: 'insertat',
    kindName: 'function',
    detail: 'insert value at index',
    documentation: 'Mutates: inserts v at index i (0 through len allowed).',
    insertText: 'insertat(${1:list}, ${2:index}, ${3:value})',
    isSnippet: true,
    params: [['list', 'index', 'value']],
  },
  {
    label: 'setpos',
    kindName: 'function',
    detail: 'move needle to [x, y] point',
    documentation: 'Command: move needle to the point p (like `setxy p[0] p[1]`). Pair with `pos()`.',
    insertText: 'setpos(${1:point})',
    isSnippet: true,
    params: [['point']],
  },

  // ── Generative math — scalars & noise ────────────────────────────────────
  {
    label: 'lerp',
    kindName: 'function',
    detail: 'linear interpolation',
    documentation: '`a + (b−a)·t`, t unclamped.',
    insertText: 'lerp(${1:a}, ${2:b}, ${3:t})',
    isSnippet: true,
    params: [['a', 'b', 't']],
  },
  {
    label: 'remap',
    kindName: 'function',
    detail: 'remap value between ranges',
    documentation: 'Linear remap from [inMin, inMax] to [outMin, outMax], unclamped.',
    insertText: 'remap(${1:value}, ${2:inMin}, ${3:inMax}, ${4:outMin}, ${5:outMax})',
    isSnippet: true,
    params: [['value', 'inMin', 'inMax', 'outMin', 'outMax']],
  },
  {
    label: 'clamp',
    kindName: 'function',
    detail: 'clamp value to [min, max]',
    documentation: '`min(hi, max(lo, v))`.',
    insertText: 'clamp(${1:value}, ${2:min}, ${3:max})',
    isSnippet: true,
    params: [['value', 'min', 'max']],
  },
  {
    label: 'smoothstep',
    kindName: 'function',
    detail: 'Hermite smooth ease (0…1)',
    documentation: 'Hermite ease between edge0 and edge1, returning 0…1.',
    insertText: 'smoothstep(${1:edge0}, ${2:edge1}, ${3:x})',
    isSnippet: true,
    params: [['edge0', 'edge1', 'x']],
  },
  {
    label: 'gauss',
    kindName: 'function',
    detail: 'seeded Gaussian random',
    documentation: 'Seeded normal distribution (Box-Muller, exactly 2 RNG draws).',
    insertText: 'gauss(${1:mean}, ${2:sigma})',
    isSnippet: true,
    params: [['mean', 'sigma']],
  },
  {
    label: 'snoise2',
    kindName: 'function',
    detail: '2D simplex noise (−1…1)',
    documentation: 'Seeded simplex noise in −1…1 (industry convention). Slightly finer-grained than legacy `noise2` (0…1).',
    insertText: 'snoise2(${1:x}, ${2:y})',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'snoise3',
    kindName: 'function',
    detail: '3D simplex noise (−1…1)',
    documentation: 'Seeded 3D simplex noise in −1…1. Use z for variation: `snoise3(x/14, y/14, motif*50)` gives each motif its own noise field.',
    insertText: 'snoise3(${1:x}, ${2:y}, ${3:z})',
    isSnippet: true,
    params: [['x', 'y', 'z']],
  },
  {
    label: 'fbm2',
    kindName: 'function',
    detail: 'fractal Brownian motion',
    documentation: 'Fractal sum of `snoise2`: lacunarity 2.0, gain 0.5, 1–8 octaves (clamped), normalised to ≈−1…1.',
    insertText: 'fbm2(${1:x}, ${2:y}, ${3:octaves})',
    isSnippet: true,
    params: [['x', 'y', 'octaves']],
  },

  // ── Generative math — vectors ────────────────────────────────────────────
  {
    label: 'vadd',
    kindName: 'function',
    detail: 'add two vectors',
    documentation: 'Returns a new point: element-wise addition.',
    insertText: 'vadd(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'vsub',
    kindName: 'function',
    detail: 'subtract two vectors',
    documentation: 'Returns a new point: element-wise subtraction.',
    insertText: 'vsub(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'vscale',
    kindName: 'function',
    detail: 'scale a vector',
    documentation: 'Returns a new point: element-wise scale by scalar s.',
    insertText: 'vscale(${1:vector}, ${2:scale})',
    isSnippet: true,
    params: [['vector', 'scale']],
  },
  {
    label: 'vlerp',
    kindName: 'function',
    detail: 'lerp between two vectors',
    documentation: 'Returns a new point: linear interpolation between a and b at t.',
    insertText: 'vlerp(${1:a}, ${2:b}, ${3:t})',
    isSnippet: true,
    params: [['a', 'b', 't']],
  },
  {
    label: 'vdot',
    kindName: 'function',
    detail: 'dot product',
    documentation: 'Dot product of two vectors.',
    insertText: 'vdot(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'vlen',
    kindName: 'function',
    detail: 'vector length (magnitude)',
    documentation: 'Length (magnitude) of a vector.',
    insertText: 'vlen(${1:vector})',
    isSnippet: true,
    params: [['vector']],
  },
  {
    label: 'vdist',
    kindName: 'function',
    detail: 'distance between two points',
    documentation: 'Euclidean distance between two points.',
    insertText: 'vdist(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'vnorm',
    kindName: 'function',
    detail: 'normalize to unit vector',
    documentation: 'Returns the unit vector. The zero vector is a runtime error.',
    insertText: 'vnorm(${1:vector})',
    isSnippet: true,
    params: [['vector']],
  },
  {
    label: 'vrot',
    kindName: 'function',
    detail: 'rotate a vector (clockwise)',
    documentation: 'Returns a new vector rotated clockwise by deg degrees (matches `rt`).',
    insertText: 'vrot(${1:vector}, ${2:degrees})',
    isSnippet: true,
    params: [['vector', 'degrees']],
  },
  {
    label: 'vheading',
    kindName: 'function',
    detail: 'turtle heading of a vector',
    documentation: 'Turtle heading of the vector (equivalent to `atan(a[0], a[1])`).',
    insertText: 'vheading(${1:vector})',
    isSnippet: true,
    params: [['vector']],
  },
  {
    label: 'vfromheading',
    kindName: 'function',
    detail: 'vector from heading + length',
    documentation: 'Make a vector from turtle heading + length. `vfromheading(heading, 1)` is the needle\'s direction unit vector.',
    insertText: 'vfromheading(${1:degrees}, ${2:length})',
    isSnippet: true,
    params: [['degrees', 'length']],
  },

  // ── Generative math — paths & curves ────────────────────────────────────
  {
    label: 'pathlen',
    kindName: 'function',
    detail: 'total path length (mm)',
    documentation: 'Total polyline length in mm.',
    insertText: 'pathlen(${1:path})',
    isSnippet: true,
    params: [['path']],
  },
  {
    label: 'resample',
    kindName: 'function',
    detail: 'resample path to spacing (mm)',
    documentation: 'New path whose segments are each exactly spacing mm long (last may be shorter). The bridge between math curves and physical stitch spacing.',
    insertText: 'resample(${1:path}, ${2:spacing})',
    isSnippet: true,
    params: [['path', 'spacing']],
  },
  {
    label: 'chaikin',
    kindName: 'function',
    detail: 'corner-cut smoothing',
    documentation: 'Corner-cut smoothing applied n times (1–6).',
    insertText: 'chaikin(${1:path}, ${2:iterations})',
    isSnippet: true,
    params: [['path', 'iterations']],
  },
  {
    label: 'catmull',
    kindName: 'function',
    detail: 'Catmull-Rom spline',
    documentation: 'Catmull-Rom spline through control points, resampled at spacing mm.',
    insertText: 'catmull(${1:points}, ${2:spacing})',
    isSnippet: true,
    params: [['points', 'spacing']],
  },
  {
    label: 'bezier',
    kindName: 'function',
    detail: 'cubic Bézier curve',
    documentation: 'Cubic Bézier from p0 to p1 through control points c0, c1, resampled at spacing mm.',
    insertText: 'bezier(${1:p0}, ${2:c0}, ${3:c1}, ${4:p1}, ${5:spacing})',
    isSnippet: true,
    params: [['p0', 'c0', 'c1', 'p1', 'spacing']],
  },
  {
    label: 'centroid',
    kindName: 'function',
    detail: 'centroid of a path',
    documentation: 'Returns the centroid (centre point) of a path.',
    insertText: 'centroid(${1:path})',
    isSnippet: true,
    params: [['path']],
  },
  {
    label: 'bbox',
    kindName: 'function',
    detail: 'bounding box [minx, miny, maxx, maxy]',
    documentation: 'Bounding box as `[minx, miny, maxx, maxy]`.',
    insertText: 'bbox(${1:path})',
    isSnippet: true,
    params: [['path']],
  },
  {
    label: 'sewpath',
    kindName: 'function',
    detail: 'sew along a list of points',
    documentation: 'Exactly `for p in path [ setpos(p) ]`. Pen state, stitch mode, satin, and auto-split all apply as if hand-walked.',
    insertText: 'sewpath(${1:path})',
    isSnippet: true,
    params: [['path']],
  },

  // ── Generative math — generators & geometry ──────────────────────────────
  {
    label: 'scatter',
    kindName: 'function',
    detail: 'Poisson-disc scatter points',
    documentation: 'Seeded Poisson-disc (Bridson) points.\n\n`scatter(minDist)` — over the 47 mm field\n`scatter(minDist, region)` — inside a region polygon\n\nCapped at 20,000 points.',
    insertText: 'scatter(${1:minDist})',
    isSnippet: true,
    params: [['minDist'], ['minDist', 'region']],
  },
  {
    label: 'voronoi',
    kindName: 'function',
    detail: 'Voronoi cells from points',
    documentation: 'One region per input point, in input order, clipped to the sewable field or a given region. Max 10,000 input points.',
    insertText: 'voronoi(${1:points})',
    isSnippet: true,
    params: [['points'], ['points', 'region']],
  },
  {
    label: 'triangulate',
    kindName: 'function',
    detail: 'Delaunay triangulation',
    documentation: 'Delaunay triangles: list of 3-point regions. Max 10,000 input points.',
    insertText: 'triangulate(${1:points})',
    isSnippet: true,
    params: [['points']],
  },
  {
    label: 'hull',
    kindName: 'function',
    detail: 'convex hull of points',
    documentation: 'Convex hull as a region (counter-clockwise winding).',
    insertText: 'hull(${1:points})',
    isSnippet: true,
    params: [['points']],
  },
  {
    label: 'relax',
    kindName: 'function',
    detail: "Lloyd's relaxation",
    documentation: "n rounds of Lloyd's relaxation — moves each point to its Voronoi cell's centroid for even stippling.",
    insertText: 'relax(${1:points}, ${2:iterations})',
    isSnippet: true,
    params: [['points', 'iterations']],
  },
  {
    label: 'offsetpath',
    kindName: 'function',
    detail: 'inflate / shrink a region',
    documentation: 'Inflate (+) or shrink (−) a region. Returns a list of regions. Shrinking may split or erase the shape entirely.',
    insertText: 'offsetpath(${1:region}, ${2:offset})',
    isSnippet: true,
    params: [['region', 'offset']],
  },
  {
    label: 'clippaths',
    kindName: 'function',
    detail: 'boolean of two regions',
    documentation: 'Boolean operation on two regions. Backed by Clipper2 at μm precision. Returns a list of regions.\n\nOperations: `"union` `"intersect` `"difference` `"xor`',
    insertText: 'clippaths(${1:a}, ${2:b}, "${3|union,intersect,difference,xor|}")',
    isSnippet: true,
    params: [['a', 'b', '"op']],
  },
  {
    label: 'inpath',
    kindName: 'function',
    detail: '1 if point is inside region',
    documentation: '1 if the point is inside the region (even-odd rule, consistent with fills).',
    insertText: 'inpath(${1:point}, ${2:region})',
    isSnippet: true,
    params: [['point', 'region']],
  },

  // ── Generative math — pure path transforms ───────────────────────────────
  {
    label: 'xlate',
    kindName: 'function',
    detail: 'translate a path (pure)',
    documentation: 'New path shifted by `(dx, dy)` mm. The functional companion to the `translate` block command — composes with `scatter`/`voronoi`/`offsetpath` data.',
    insertText: 'xlate(${1:path}, ${2:dx}, ${3:dy})',
    isSnippet: true,
    params: [['path', 'dx', 'dy']],
  },
  {
    label: 'xrotate',
    kindName: 'function',
    detail: 'rotate a path (pure)',
    documentation: 'New path rotated `deg` clockwise. Optional pivot: `xrotate(path, deg, cx, cy)`.',
    insertText: 'xrotate(${1:path}, ${2:degrees})',
    isSnippet: true,
    params: [['path', 'degrees'], ['path', 'degrees', 'cx', 'cy']],
  },
  {
    label: 'xscale',
    kindName: 'function',
    detail: 'scale a path (pure)',
    documentation: 'New path scaled by `sx` (and `sy`). `xscale(path, s)` is uniform; `xscale(path, sx, sy)` is per-axis.',
    insertText: 'xscale(${1:path}, ${2:s})',
    isSnippet: true,
    params: [['path', 's'], ['path', 'sx', 'sy']],
  },
  {
    label: 'xmirror',
    kindName: 'function',
    detail: 'mirror a path (pure)',
    documentation: 'New path reflected across a line through the origin at heading `deg`.',
    insertText: 'xmirror(${1:path}, ${2:degrees})',
    isSnippet: true,
    params: [['path', 'degrees']],
  },
];

// ── Fast lookup map (label → NSItem) ─────────────────────────────────────────
const NS_ITEM_MAP = new Map<string, NSItem>(NS_ITEMS.map(item => [item.label, item]));

// ── Helper: walk text backwards to find the active function call context ─────
//
// Returns the function name and the 0-based active parameter index, or null if
// the cursor is not inside a function call.  Handles nested parens/brackets.
//
function getSignatureContext(textBeforeCursor: string): { name: string; paramIndex: number } | null {
  let depth = 0;
  let paramIndex = 0;

  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const ch = textBeforeCursor[i];
    if (ch === ')') {
      depth++;
    } else if (ch === '(') {
      if (depth === 0) {
        // Found the opening paren — extract the identifier before it.
        const before = textBeforeCursor.slice(0, i).trimEnd();
        const m = before.match(/([a-z_][a-z0-9_]*)$/i);
        if (!m) return null;
        return { name: m[1].toLowerCase(), paramIndex };
      }
      depth--;
    } else if (ch === '[') {
      // Hit a block delimiter — we're no longer in a function call.
      if (depth === 0) return null;
      depth--;
    } else if (ch === ']') {
      depth++;
    } else if (ch === ',' && depth === 0) {
      paramIndex++;
    }
  }

  return null;
}

// ── Helper: scan document text for user-defined procedures and variables ──────
interface UserSymbol {
  label:     string;
  kindName:  'function' | 'variable';
  detail:    string;
  params?:   string[];   // parameter names (for procedures)
}

function extractUserSymbols(text: string): UserSymbol[] {
  const seen = new Set<string>();
  const symbols: UserSymbol[] = [];

  const add = (sym: UserSymbol) => {
    if (!seen.has(sym.label) && !NS_ITEM_MAP.has(sym.label)) {
      seen.add(sym.label);
      symbols.push(sym);
    }
  };

  // Modern procedure: def name(a, b) [
  const modernProc = /\bdef\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = modernProc.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const rawParams = m[2].trim();
    const params = rawParams ? rawParams.split(',').map(p => p.trim().replace(/^:/, '')) : [];
    add({ label: name, kindName: 'function', detail: `procedure(${params.join(', ')})`, params });
  }

  // Classic procedure: to name :a :b
  const classicProc = /\bto\s+([a-z_][a-z0-9_]*)((?:\s+:[a-z_][a-z0-9_]*)*)/gi;
  while ((m = classicProc.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const rawParams = m[2].trim();
    const params = rawParams ? rawParams.split(/\s+/).filter(Boolean).map(p => p.replace(/^:/, '')) : [];
    add({ label: name, kindName: 'function', detail: `procedure(${params.join(', ')})`, params });
  }

  // Modern variable: let name =
  const letVar = /\blet\s+([a-z_][a-z0-9_]*)\s*[=]/gi;
  while ((m = letVar.exec(text)) !== null) {
    add({ label: m[1].toLowerCase(), kindName: 'variable', detail: 'variable' });
  }

  // Classic variable: make "name
  const makeVar = /\bmake\s+"([a-z_][a-z0-9_]*)/gi;
  while ((m = makeVar.exec(text)) !== null) {
    add({ label: m[1].toLowerCase(), kindName: 'variable', detail: 'variable (make)' });
  }

  return symbols;
}

// ── Registration ──────────────────────────────────────────────────────────────

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

  // CompletionItemKind values
  const CIK = monaco.languages.CompletionItemKind;
  const kindMap: Record<NSItemKind, number> = {
    keyword:  CIK.Keyword,
    function: CIK.Function,
    variable: CIK.Variable,
    constant: CIK.Constant,
  };

  // InsertAsSnippet rule
  const SNIPPET_RULE = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

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
      // Transform block commands (CTM stack) — headers like repeat/if.
      'translate', 'rotate', 'rotateabout', 'scale', 'scalexy', 'mirror', 'skew', 'transform',
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
      'xlate', 'xrotate', 'xscale', 'xmirror',
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
  // All colours sourced from src/theme.ts to stay in sync with the
  // global design system defined in src/index.css.
  monaco.editor.defineTheme('needlescript-dark', {
    base: 'vs-dark',
    inherit: false,
    rules: [
      // Default / plain identifiers
      { token: '',              foreground: m(text) },
      { token: 'ns-identifier', foreground: m(text) },
      // Comments — muted, italic
      { token: 'ns-comment',    foreground: m(synComment),  fontStyle: 'italic' },
      // Control flow & definition keywords — brand gold, bold
      { token: 'ns-keyword',    foreground: m(synKeyword),  fontStyle: 'bold' },
      // Turtle movement + reporters — sky teal
      { token: 'ns-movement',   foreground: m(synMovement) },
      // Stitch / thread / fabric commands — warm amber
      { token: 'ns-stitch',     foreground: m(synStitch) },
      // Core math functions — soft lavender
      { token: 'ns-math',       foreground: m(synMath) },
      // Library functions (list + generative) — mint green
      { token: 'ns-lib',        foreground: m(synLib) },
      // Numbers
      { token: 'ns-number',     foreground: m(synNumber) },
      // Quoted words / Logo "strings"
      { token: 'ns-string',     foreground: m(synString) },
      // Classic variable deref :var — steel blue, italic
      { token: 'ns-variable',   foreground: m(synVariable), fontStyle: 'italic' },
      // Operators and punctuation — muted
      { token: 'ns-operator',   foreground: m(synOperator) },
      { token: 'ns-bracket',    foreground: m(synBracket) },
      { token: 'ns-delimiter',  foreground: m(synBracket) },
    ],
    colors: {
      // Editor surface
      'editor.background':                    bgPanel,
      'editor.foreground':                    text,
      // Cursor
      'editorCursor.foreground':              gold,
      // Selection
      'editor.selectionBackground':           gold + '40',
      'editor.inactiveSelectionBackground':   gold + '22',
      // Current-line highlight (cursor line, not the playback line)
      'editor.lineHighlightBackground':       monacoLineHighlight,
      'editor.lineHighlightBorder':           '#00000000',
      // Line numbers
      'editorLineNumber.foreground':          monacoLineNumber,
      'editorLineNumber.activeForeground':    monacoLineNumberActive,
      // Gutter
      'editorGutter.background':              monacoGutter,
      // Indent guides
      'editorIndentGuide.background1':        monacoIndentGuide,
      'editorIndentGuide.activeBackground1':  monacoIndentGuideActive,
      // Bracket pair colorization
      'editorBracketHighlight.foreground1':   gold,
      'editorBracketHighlight.foreground2':   synMovement,
      'editorBracketHighlight.foreground3':   synMath,
      // Find/match highlight
      'editor.findMatchBackground':           gold + '50',
      'editor.findMatchHighlightBackground':  gold + '28',
      // Scrollbar
      'scrollbarSlider.background':           borderCool + '44',
      'scrollbarSlider.hoverBackground':      monacoIndentGuideActive,
      'scrollbarSlider.activeBackground':     textFaint + 'AA',
      // Overview ruler
      'editorOverviewRuler.border':           '#00000000',
      // Widget popups (find bar, etc.)
      'editorWidget.background':              bgApp,
      'editorWidget.border':                  borderCool,
      'editorWidget.foreground':              text,
      // Input boxes inside widgets
      'input.background':                     bgPanel,
      'input.foreground':                     text,
      'inputOption.activeBorder':             gold,
      'inputOption.activeBackground':         gold + '30',
      // Focus border
      'focusBorder':                          gold,
      // ── Suggestion / IntelliSense widget ───────────────────────────
      'editorSuggestWidget.background':               bgApp,
      'editorSuggestWidget.border':                   borderCool,
      'editorSuggestWidget.foreground':               text,
      'editorSuggestWidget.selectedBackground':       bgPanelRaised,
      'editorSuggestWidget.selectedForeground':       text,
      'editorSuggestWidget.highlightForeground':      gold,
      'editorSuggestWidget.focusHighlightForeground': gold,
      // ── Hover widget ───────────────────────────────────────────────
      'editorHoverWidget.background':         bgApp,
      'editorHoverWidget.border':             borderCool,
      'editorHoverWidget.foreground':         text,
      // ── Parameter hints widget ─────────────────────────────────────
      'editorHintForeground':                 text,
      'parameterHints.background':            bgApp,
      'parameterHints.border':                borderCool,
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

  // ── Completion provider ───────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider('needlescript', {
    triggerCharacters: [],

    provideCompletionItems(model: MonacoEditor.ITextModel, position: IPos) {
      const wordInfo = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     wordInfo.startColumn,
        endColumn:       wordInfo.endColumn,
      };

      // Built-in completions
      const suggestions = NS_ITEMS.map(item => ({
        label:           item.label,
        kind:            kindMap[item.kindName],
        detail:          item.detail,
        documentation:   { value: item.documentation, isTrusted: true } as Monaco['languages']['IMarkdownString'],
        insertText:      item.insertText,
        insertTextRules: item.isSnippet ? SNIPPET_RULE : undefined,
        range,
      }));

      // User-defined completions (scanned from the current document)
      const userSymbols = extractUserSymbols(model.getValue());
      for (const sym of userSymbols) {
        const userKind = sym.kindName === 'function'
          ? CIK.Function
          : CIK.Variable;

        if (sym.kindName === 'function' && sym.params && sym.params.length > 0) {
          const snippetText = `${sym.label}(${sym.params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`;
          suggestions.push({
            label:           sym.label,
            kind:            userKind,
            detail:          sym.detail,
            documentation:   { value: `User-defined procedure.`, isTrusted: false },
            insertText:      snippetText,
            insertTextRules: SNIPPET_RULE,
            range,
          });
        } else {
          suggestions.push({
            label:           sym.label,
            kind:            userKind,
            detail:          sym.detail,
            documentation:   { value: `User-defined ${sym.kindName}.`, isTrusted: false },
            insertText:      sym.label,
            insertTextRules: undefined,
            range,
          });
        }
      }

      return { suggestions };
    },
  });

  // ── Hover provider ────────────────────────────────────────────────
  monaco.languages.registerHoverProvider('needlescript', {
    provideHover(model: MonacoEditor.ITextModel, position: IPos) {
      const wordAtPos = model.getWordAtPosition(position);
      if (!wordAtPos) return null;

      const item = NS_ITEM_MAP.get(wordAtPos.word.toLowerCase());
      if (!item) return null;

      // Build signature from params (first overload)
      let sigLine = `**${item.label}**`;
      if (item.params) {
        const firstOverload = item.params[0];
        if (firstOverload.length > 0) {
          sigLine += ` \`(${firstOverload.join(', ')})\``;
        } else {
          // zero-arg reporter
          sigLine += ' *(reporter)*';
        }
      }

      const content = `${sigLine}\n\n${item.documentation}`;

      return {
        contents: [{ value: content, isTrusted: true }],
      };
    },
  });

  // ── Signature help provider ───────────────────────────────────────
  monaco.languages.registerSignatureHelpProvider('needlescript', {
    signatureHelpTriggerCharacters:   ['(', ','],
    signatureHelpRetriggerCharacters: [','],

    provideSignatureHelp(model: MonacoEditor.ITextModel, position: IPos) {
      // Gather text from document start to cursor
      const textBefore = model.getValueInRange({
        startLineNumber: 1,
        startColumn:     1,
        endLineNumber:   position.lineNumber,
        endColumn:       position.column,
      });

      const ctx = getSignatureContext(textBefore);
      if (!ctx) return null;

      const item = NS_ITEM_MAP.get(ctx.name);
      if (!item || !item.params) return null;

      // Build one SignatureInformation per overload
      const signatures = item.params.map(paramNames => {
        const label = paramNames.length > 0
          ? `${item.label}(${paramNames.join(', ')})`
          : `${item.label}()`;

        // Compute label ranges for each parameter
        const parameters = paramNames.map(paramName => {
          const start = label.indexOf(paramName);
          const end   = start + paramName.length;
          return {
            label:         [start, end] as [number, number],
            documentation: undefined,
          };
        });

        return {
          label,
          documentation: { value: item.documentation, isTrusted: true } as Monaco['languages']['IMarkdownString'],
          parameters,
        };
      });

      if (signatures.length === 0) return null;

      // For overloaded functions (e.g. range, scatter), pick the overload
      // that best fits the number of arguments typed so far.
      let activeSignature = 0;
      const paramCount = ctx.paramIndex + 1;
      for (let i = 0; i < signatures.length; i++) {
        if (signatures[i].parameters.length >= paramCount) {
          activeSignature = i;
          break;
        }
      }

      // Cap the active parameter index at the last parameter in this overload
      const sig           = signatures[activeSignature];
      const activeParam   = Math.min(ctx.paramIndex, sig.parameters.length - 1);

      return {
        value: {
          signatures,
          activeSignature,
          activeParameter: Math.max(0, activeParam),
        },
        dispose() {},
      };
    },
  });
}
