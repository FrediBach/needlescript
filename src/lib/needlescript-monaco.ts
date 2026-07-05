import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor, languages, IMarkdownString } from 'monaco-editor';
import {
  bgApp,
  bgPanel,
  bgPanelRaised,
  text,
  textFaint,
  gold,
  borderCool,
  synComment,
  synKeyword,
  synMovement,
  synStitch,
  synMath,
  synLib,
  synNumber,
  synString,
  synVariable,
  synOperator,
  synBracket,
  monacoGutter,
  monacoLineNumber,
  monacoLineNumberActive,
  monacoLineHighlight,
  monacoIndentGuide,
  monacoIndentGuideActive,
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
  label: string;
  kindName: NSItemKind;
  detail: string; // short inline hint in the suggestion dropdown
  documentation: string; // Markdown shown in the details panel
  insertText: string;
  isSnippet?: boolean;
  params?: string[][]; // overloads for signature help
}

const NS_ITEMS: NSItem[] = [
  // ── Keywords & control flow ──────────────────────────────────────────────
  {
    label: 'repeat',
    kindName: 'keyword',
    detail: 'loop n times',
    documentation:
      'Loop n times. `repcount` is the 1-based counter of the innermost repeat.\n\n```\nrepeat 36 [\n  fd 5  rt 10\n]\n```',
    insertText: 'repeat ${1:n} [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'while',
    kindName: 'keyword',
    detail: 'loop while condition is true',
    documentation:
      'Loop while the condition is true (non-zero). `while true [ … break ]` is the idiomatic search loop.',
    insertText: 'while ${1:condition} [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'for',
    kindName: 'keyword',
    detail: 'counted or for-in loop',
    documentation:
      '**Counted loop:** `for i = 0 to n [ … ]` — inclusive of *to*, step defaults to 1.\n\n**For-in loop:** `for x in xs [ … ]` — iterate list elements.\n\n**With step:** `for i = 10 to 1 step -2 [ … ]`',
    insertText: 'for ${1:i} = ${2:0} to ${3:n} [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'if',
    kindName: 'keyword',
    detail: 'conditional',
    documentation:
      'Conditional block. Chains with `else if` and `else`.\n\n```\nif x > 0 [\n  fd x\n] else [\n  bk x\n]\n```',
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
    documentation:
      'Define a procedure. Parameters are local and can recurse (depth limit 200).\n\n```\ndef leaf(size) [\n  fd size  bk size\n]\n```\nClassic form: `to name :a :b … end`',
    insertText: 'def ${1:name}(${2:params}) [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'to',
    kindName: 'keyword',
    detail: 'classic procedure definition',
    documentation:
      'Classic Logo procedure definition. Modern equivalent: `def name(a, b) [ … ]`.\n\n```\nto leaf :size\n  fd :size  bk :size\nend\n```',
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
    documentation:
      'Return a value from a procedure. Without argument, exits early. Classic aliases: `output`, `op`.',
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
    documentation:
      'Declare a variable — global at top level, local inside a procedure. Redeclaring the same name in the same scope is a parse error.',
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
    documentation:
      'Classic Logo local variable declaration inside a procedure. Illegal at top level.',
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
    documentation:
      'Needle up — subsequent moves are jump travels, not stitches.\n\nAliases: `penup`, `pu`',
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
    documentation:
      'Sew along a circle of radius mm, turning deg in total. Positive degrees curves right, negative left. Works in every stitch mode — including satin!',
    insertText: 'arc ${1:degrees} ${2:radius}',
    isSnippet: true,
    params: [['degrees', 'radius']],
  },
  {
    label: 'circle',
    kindName: 'function',
    detail: 'full circle of radius r (≡ arc 360 r)',
    documentation:
      'Sew a full closed circle of radius r — exactly `arc 360 r`. Works in every stitch mode (satin ring, bean loop, etc.).\n\nDraw cost: 0. Byte-identical to `arc 360 r`.',
    insertText: 'circle ${1:radius}',
    isSnippet: true,
    params: [['radius']],
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
    documentation:
      'Set the heading absolutely. 0 = up/north, clockwise positive.\n\nAlias: `setheading`',
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
    documentation:
      'Return to origin (0, 0) with heading 0 (north). Sews/jumps depending on pen state.\n\n**Warning:** if the pen is *down*, this **sews a line** back to the origin. For a non-sewing return use `moveto 0 0` or `gohome`.',
    insertText: 'home',
  },
  {
    label: 'moveto',
    kindName: 'function',
    detail: 'jump to (x, y) without sewing',
    documentation:
      'Reposition the needle to `(x, y)` as a jump, **without sewing**. Pen state is preserved: if the pen was down it ends down and the next move sews normally; if up it stays up.\n\nEquivalent to `up setxy x y down` when pen is down, or `up setxy x y` when pen is already up. Respects the current transform.\n\nAlias: `jump`\n\nDraw cost: 0.\n\n```\nrepeat 18 [\n  moveto random(70) - 35, random(30) - 38\n  stem(14)\n  trim\n]\n```',
    insertText: 'moveto ${1:x} ${2:y}',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'jump',
    kindName: 'function',
    detail: 'jump to (x, y) — alias for moveto',
    documentation:
      'Alias for `moveto`. The embroidery industry term for a non-sewing travel. Pen state preserved.',
    insertText: 'jump ${1:x} ${2:y}',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'gohome',
    kindName: 'function',
    detail: 'pen-safe return to origin (≡ moveto 0 0)',
    documentation:
      'Jump to `(0, 0)` without sewing — pen state preserved. Does **not** reset heading; add `seth 0` for a full neutral reset.\n\nEquivalent to `moveto 0 0`. Contrast with `home`, which sews a line back when the pen is down.\n\nDraw cost: 0.',
    insertText: 'gohome',
  },
  {
    label: 'push',
    kindName: 'function',
    detail: 'save needle state onto stack',
    documentation:
      'Save needle state (position, heading, pen up/down) onto a stack. Max 500 saved states.',
    insertText: 'push',
  },
  {
    label: 'pop',
    kindName: 'function',
    detail: 'restore needle state from stack',
    documentation:
      'Restore the last saved needle state from the stack. Pop on an empty stack warns and is ignored.',
    insertText: 'pop',
  },
  {
    label: 'cs',
    kindName: 'function',
    detail: 'clearscreen (no-op)',
    documentation:
      'Accepted for Logo familiarity; does nothing in NeedleScript.\n\nAliases: `clearscreen`, `clear`',
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
    documentation:
      'Shift everything the block draws by `(dx, dy)` mm. The turtle stays in local space — only emitted geometry moves.\n\n```\ntranslate 20 0 [ leaf() ]\ntranslate(20, 0) [ leaf() ]   // same thing\n```',
    insertText: 'translate ${1:dx} ${2:dy} [\n\t$0\n]',
    isSnippet: true,
    params: [['dx', 'dy']],
  },
  {
    label: 'rotate',
    kindName: 'keyword',
    detail: 'rotate a block (clockwise, about origin)',
    documentation:
      'Rotate the block `deg` degrees clockwise about the current origin (0 = north, matching `seth`/`rt`).',
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
    documentation:
      'Uniformly scale the block by `s`. Stitch length, satin width and the physics layer are re-evaluated **after** scaling, so a scaled motif still sews like real embroidery — not stretched stitches.',
    insertText: 'scale ${1:s} [\n\t$0\n]',
    isSnippet: true,
    params: [['s']],
  },
  {
    label: 'scalexy',
    kindName: 'keyword',
    detail: 'independent axis scale',
    documentation:
      'Scale the block by `sx` on x and `sy` on y. Non-uniform scale makes satin width direction-dependent (a column running across the stretched axis widens).',
    insertText: 'scalexy ${1:sx} ${2:sy} [\n\t$0\n]',
    isSnippet: true,
    params: [['sx', 'sy']],
  },
  {
    label: 'mirror',
    kindName: 'keyword',
    detail: 'reflect across a heading line',
    documentation:
      'Reflect the block across a line through the origin at heading `deg`. `mirror 0` flips left/right; `mirror 90` flips top/bottom.',
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
    documentation:
      'Apply the raw affine `(x, y) → (a·x + c·y + e, b·x + d·y + f)` to the block — the power-user escape hatch behind the named transforms.',
    insertText: 'transform ${1:a} ${2:b} ${3:c} ${4:d} ${5:e} ${6:f} [\n\t$0\n]',
    isSnippet: true,
    params: [['a', 'b', 'c', 'd', 'e', 'f']],
  },

  // ── Effects (nonlinear / stochastic maps on the same block-scoped stack) ──
  {
    label: 'warp',
    kindName: 'keyword',
    detail: 'run a block through a point→point reporter',
    documentation:
      'Map every emitted point through a `@name` reporter (a procedure that takes a point `[x, y]` and returns a point), **before** stitch splitting — a geometric deformation, exactly like a transform but nonlinear. This is the shader: fisheye, ripple, twist, domain-warp are all just reporters.\n\n```\ndef push_out(p) [\n  let d = vlen(p)\n  return vscale(vnorm(p), d + 2 * snoise2(p[0] / 14, p[1] / 14))\n]\nwarp @push_out [ repeat 6 [ fd 30 rt 60 ] ]\n```',
    insertText: 'warp @${1:reporter} [\n\t$0\n]',
    isSnippet: true,
    params: [['reporter']],
  },
  {
    label: 'humanize',
    kindName: 'keyword',
    detail: 'seeded hand-stitched jitter (mm)',
    documentation:
      'Perturb each stitch penetration by coherent, seeded simplex noise (the hand drifts, so consecutive stitches err together — not white-noise damage). Runs **after** stitch splitting, on the final penetrations. `amount` is the jitter in mm (clamped 0–2). Draws exactly one value from the seeded stream (forks), so dropping a `humanize` block shifts downstream randomness by one draw, not by however many stitches were inside.\n\n```\nhumanize 0.3 [ repeat 4 [ fd 20 rt 90 ] ]\n```',
    insertText: 'humanize ${1:amount} [\n\t$0\n]',
    isSnippet: true,
    params: [['amount']],
  },
  {
    label: 'snaptogrid',
    kindName: 'keyword',
    detail: 'quantize penetrations to a fixed lattice',
    documentation:
      'Snap each penetration to a fixed hoop-space lattice, evaluated **outside** any enclosing transform — so the same grid config always yields the same lattice regardless of `translate`/`rotate`/`scale`. Pure and drawless. Overloads by arity:\n\n```\nsnaptogrid 2 [ … ]                       // square, pitch 2 mm, origin (0,0)\nsnaptogrid 2 3 [ … ]                     // rectangular\nsnaptogrid(1.5, 1.5, 0.75, 0.75) [ … ]   // …with an origin offset\nsnaptogrid(2, 2, 0, 0, 30) [ … ]         // …rotated 30°\n```',
    insertText: 'snaptogrid ${1:cell} [\n\t$0\n]',
    isSnippet: true,
    params: [['cell']],
  },

  // ── Trace block expressions (capture turtle paths as data) ───────────────
  {
    label: 'trace',
    kindName: 'keyword',
    detail: 'capture a single pen-down path as data',
    documentation:
      'Run a block in a sandbox — full language semantics, but the stitch machine is disconnected. Nothing is sewn, and on exit the turtle and all stitch state are restored. Returns the single pen-down path (a list of `[x, y]` points) at move-command resolution, unaffected by `stitchlen`. Errors if the block draws more than one pen-down run (use `tracerings` for that).\n\n```\nlet ring = trace [ repeat 6 [ fd 30 rt 60 ] ]\nsewpath(resample(ring, 2))\n```\n\n```\nlet disc = trace [ arc 360 28 ]\nfor p in scatter(3, disc) [\n  up setpos(p) down arc 360 0.5 trim\n]\n```',
    insertText: 'trace [\n\t$0\n]',
    isSnippet: true,
    params: [],
  },
  {
    label: 'tracerings',
    kindName: 'keyword',
    detail: 'capture multiple pen-down paths as data',
    documentation:
      'Like `trace`, but captures every pen-down run as a separate path. Returns a list of paths (list of lists of `[x, y]` points), in drawing order. Each pen-up/pen-down boundary starts a new ring.\n\n```\nlet donut = tracerings [\n  arc 360 25\n  up setxy 8 0 down\n  arc 360 12\n]\nfor ring in donut [ sewpath(resample(ring, 2)) trim ]\n```',
    insertText: 'tracerings [\n\t$0\n]',
    isSnippet: true,
    params: [],
  },

  // ── Thread & stitch commands ─────────────────────────────────────────────
  {
    label: 'stitchlen',
    kindName: 'function',
    detail: 'running stitch length (mm)',
    documentation:
      'Running-stitch length, clamped 0.4–12 mm (default 2.5).\n\nAlias: `stitchlength`',
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
    detail: 'satin column width (mm) — or @reporter',
    documentation:
      'Zigzag satin column of this width; penetration spacing set by `density`. `satin 0` returns to running stitch. Width > ~8 mm risks snagging.\n\n**Programmable satin:** `satin @fn` engages a user *shape reporter* that controls the column per stitch pair. The reporter takes `(t, s, i, u)` — cursor arc-length (mm), normalized position (0..1), 0-based pair index, local heading — and returns `[advance, leftw, rightw, leftlag, rightlag]` (all mm; `advance` > 0). A reporter that may not return on every path is caught at **parse time**.\n\n**Tuple helpers** (call-syntax, library tier):\n- `satinpair(adv, w)` → `[adv, w, w, 0, 0]` — symmetric perpendicular bite\n- `satinasym(adv, lw, rw)` → `[adv, lw, rw, 0, 0]` — asymmetric column\n- `satinrake(adv, w, lag)` → `[adv, w, w, -lag, lag]` — diagonal rake / crosshatch\n\n`satin 4 ≡ satin @c` where `def c(t,s,i,u) [ return satinpair(0.4, 2) ]`.',
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
    documentation:
      'Blanket stitch: prongs of this length on the left of travel direction, spaced by `stitchlen`. `estitch 0` off.',
    insertText: 'estitch ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'beginfill',
    kindName: 'function',
    detail: 'begin fill boundary trace',
    documentation:
      'Start tracing a fill boundary. Moves between `beginfill` and `endfill` define the shape rather than sewing. A pen-up move starts a new ring — inner rings become holes (even-odd rule).',
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
    label: 'fill',
    kindName: 'function',
    detail: 'programmable fill (directional / textured)',
    documentation:
      'Arm a programmable fill for the next `beginfill…endfill`. `fill dir @field` drives the row direction from a field reporter `def field(p) [ return heading ]` (a directional/contour/flow fill); `fill shape @texture` drives spacing/length/brick from `def texture(p, row, v) [ return [spacing, len, phase] ]`. `fill @field` is shorthand for the direction channel. The engine keeps even-spacing coverage, hole clipping, pull-comp and underlay.',
    insertText: 'fill dir @${1:field}',
    isSnippet: true,
    params: [['field']],
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
    documentation:
      "Fill stitch length, 1–7 mm. Defaults to `stitchlen`. `filllen 0` to follow `stitchlen` again. Rows are brick-offset so penetrations don't line up.",
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
    documentation:
      'Shorthand for "next colour" — equivalent to incrementing the thread number by 1.',
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
    documentation:
      'Tie-in/tie-off: 4 micro back-stitches where thread starts/ends. Size 0.3–1.5 mm (default 0.7). `lock 0` off.',
    insertText: 'lock ${1:size}',
    isSnippet: true,
    params: [['size']],
  },
  {
    label: 'pullcomp',
    kindName: 'function',
    detail: 'pull compensation (mm)',
    documentation:
      'Pull compensation 0–1.5 mm: widens satin columns and extends fill rows so shapes sew out at their digitized size.',
    insertText: 'pullcomp ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'shortstitch',
    kindName: 'function',
    detail: 'short-stitch on/off (0 or 1)',
    documentation:
      'Curve physics (on by default): on tight satin curves, alternate inner stitches are shortened to 60% width to prevent thread breaks.',
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
    documentation:
      'Thread-coverage warning threshold in layers (default 3.5). `maxdensity 0` silences warnings.',
    insertText: 'maxdensity ${1:layers}',
    isSnippet: true,
    params: [['layers']],
  },
  // QWORD commands — snippet with inline choice list
  {
    label: 'fabric',
    kindName: 'function',
    detail: 'fabric preset',
    documentation:
      'Apply a fabric preset. Sets pull compensation, density limit, and underlay defaults.\n\n- `"woven` — pull 0.2 mm, max 3.5 layers\n- `"knit` — pull 0.5 mm, max 3.0, density floor 0.45 mm\n- `"stretch` — pull 0.6 mm, max 2.8, density floor 0.5 mm\n- `"denim` / `"canvas` — pull 0.15 mm, max 4.0\n- `"fleece` — pull 0.3 mm, max 2.6, double underlay',
    insertText: 'fabric "${1|woven,knit,stretch,denim,canvas,fleece|}"',
    isSnippet: true,
  },
  {
    label: 'underlay',
    kindName: 'function',
    detail: 'satin underlay style',
    documentation:
      'Stabilising stitches under each satin column.\n\n- `"auto` — picks by width: <1.5 mm none, <4 mm center, wider zigzag\n- `"center` — center walk\n- `"edge` — edge walk\n- `"zigzag` — cross-grain zigzag\n- `"off` — no underlay',
    insertText: 'underlay "${1|auto,center,edge,zigzag,off|}"',
    isSnippet: true,
  },
  {
    label: 'fillunderlay',
    kindName: 'function',
    detail: 'fill underlay style',
    documentation:
      'Underlay beneath fills.\n\n- `"auto` — tatami, plus edge run on areas > 100 mm²\n- `"tatami` — sparse cross-grain pass\n- `"edge` — inset edge run only\n- `"off` — no underlay',
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
    documentation:
      'Log a value to the console. `print "label expr` adds a label:\n`print "radius r` → `radius: 1.5`',
    insertText: 'print ${1:value}',
    isSnippet: true,
    params: [['value']],
  },
  {
    label: 'printloc',
    kindName: 'function',
    detail: 'log needle position to console',
    documentation:
      'Log the current needle position to the console as `loc: [x, y]`.\n\nCoordinates are in the **local (turtle) frame** — the same as `pos()`. Under a transform they reflect what the turtle "thinks", which is what you usually want when debugging motif logic.\n\n`printloc "label` uses a custom label instead of `loc`.\n\nDraw cost: 0. Never exported.\n\n```\nfd 20  rt 45  fd 10\nprintloc "after-elbow\n// prints: after-elbow: [7.07, 27.07]\n```',
    insertText: 'printloc',
  },
  {
    label: 'mark',
    kindName: 'function',
    detail: 'drop debug pin on stage',
    documentation:
      "Drop a numbered pin on the preview at the needle position. Optional string label shown instead of the pin number.\n\n```\nmark         // numbered pin\nmark 'rose'  // labelled pin\n```\n\nNever exported to the machine or counted in stats.",
    insertText: 'mark',
  },
  {
    label: 'assert',
    kindName: 'function',
    detail: 'assertion check',
    documentation:
      'Stop with an error (and line number) if the condition is false.\n\nExample: `assert (distance 0 0) < 47`',
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
    documentation:
      'Floor modulo — result always has the sign of b. `mod(-7, 3)` is 2, not −1. The `%` operator is the same operation.',
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
    documentation:
      'Heading of the vector (x, y) in turtle degrees: 0 = north, clockwise. `atan(1, 0)` is 90.',
    insertText: 'atan(${1:x}, ${2:y})',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'noise',
    kindName: 'function',
    detail: '1D value noise (0…1)',
    documentation:
      'Smooth seeded value noise in 0…1. Sample slowly (divide coordinates by 10–20) for organic drift.',
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
    documentation:
      'Logical NOT. Also written `!`. Binds tightly — write `!(a = 1)` when negating a comparison.',
    insertText: 'not(${1:value})',
    isSnippet: true,
    params: [['value']],
  },

  // ── List functions (call-syntax only) ────────────────────────────────────
  {
    label: 'range',
    kindName: 'function',
    detail: 'create a range list',
    documentation:
      '`range(n)` → [0…n-1]\n`range(a, b)` → [a…b-1]\n`range(a, b, step)` → stepped\n\n0-based, end-exclusive (like Python). Call-syntax only.',
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
    detail: 'list or string length',
    documentation: 'Element count of a list, or character count of a string.',
    insertText: 'len(${1:xs})',
    isSnippet: true,
    params: [['xs']],
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
    documentation:
      '`slice(xs, start)` or `slice(xs, start, end)` — new list, Python semantics including negative bounds, clamped.',
    insertText: 'slice(${1:list}, ${2:start})',
    isSnippet: true,
    params: [
      ['list', 'start'],
      ['list', 'start', 'end'],
    ],
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
    documentation:
      'Returns a new sorted list. Numbers only, ascending, stable. Pure — does not mutate.',
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
    documentation:
      'Returns a new shuffled list — seeded, forks a child RNG. Pure — does not mutate.',
    insertText: 'shuffle(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'pos',
    kindName: 'function',
    detail: 'needle position as [x, y]',
    documentation:
      'Needle position as `[xcor, ycor]`. Pair with `setpos(p)` to save and restore positions.',
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
    documentation:
      'Command: move needle to the point p (like `setxy p[0] p[1]`). Pair with `pos()`.',
    insertText: 'setpos(${1:point})',
    isSnippet: true,
    params: [['point']],
  },

  // ── Higher-order list functions ──────────────────────────────────────────
  {
    label: 'steps',
    kindName: 'function',
    detail: 'inclusive numeric sequence',
    documentation:
      'Generate a list of evenly spaced numbers from `start` to `end` (inclusive).\n\n' +
      '`steps(0, 6)` → `[0, 1, 2, 3, 4, 5, 6]`\n\n' +
      '`steps(0, 6, 0.2)` → `[0, 0.2, 0.4, …, 5.8, 6]`\n\n' +
      'Unlike `range`, the end value is included when it falls exactly on a step boundary.',
    insertText: 'steps(${1:start}, ${2:end}, ${3:step})',
    isSnippet: true,
    params: [
      ['start', 'end'],
      ['start', 'end', 'step'],
    ],
  },
  {
    label: 'map',
    kindName: 'function',
    detail: 'apply function to every element',
    documentation:
      'Return a new list by applying `@fn` to each element of `list`.\n\n' +
      '```\ndef double(x) [ return x * 2 ]\nprint map([1, 2, 3], @double)  // [2, 4, 6]\n```\n\n' +
      'The callback can be a user-defined procedure (`@myProc`) or a built-in function (`@vlen`, `@abs`, …).',
    insertText: 'map(${1:list}, @${2:fn})',
    isSnippet: true,
    params: [['list', '@fn']],
  },
  {
    label: 'filter',
    kindName: 'function',
    detail: 'keep elements that pass a test',
    documentation:
      'Return a new list keeping only elements for which `@fn` returns a truthy value.\n\n' +
      '```\ndef big(x) [ return x > 2 ]\nprint filter([1, 2, 3, 4], @big)  // [3, 4]\n```',
    insertText: 'filter(${1:list}, @${2:fn})',
    isSnippet: true,
    params: [['list', '@fn']],
  },
  {
    label: 'reduce',
    kindName: 'function',
    detail: 'fold list into a single value',
    documentation:
      'Fold `list` with `@fn(accumulator, element)` starting from `init`.\n\n' +
      '```\ndef add(a, b) [ return a + b ]\nprint reduce([1, 2, 3], @add, 0)  // 6\n```\n\n' +
      'Works with built-in functions too: `reduce(points, @vadd, [0, 0])`.',
    insertText: 'reduce(${1:list}, @${2:fn}, ${3:init})',
    isSnippet: true,
    params: [['list', '@fn', 'init']],
  },
  {
    label: 'compose',
    kindName: 'function',
    detail: 'compose functions into a pipeline',
    documentation:
      'Create a left-to-right pipeline from two or more `@references`.\n\n' +
      '`compose(@f, @g, @h)` returns a reference where `step(x) = h(g(f(x)))`.\n\n' +
      '```\ndef double(x) [ return x * 2 ]\nlet step = compose(@double, @round)\nprint map([1.7, 2.3], step)  // [3, 5]\n```\n\n' +
      'Works with user procs, built-in refs, and nested composes.',
    insertText: 'compose(@${1:fn1}, @${2:fn2})',
    isSnippet: true,
    params: [['@fn1', '@fn2', '...']],
  },

  // ── String functions ─────────────────────────────────────────────────────
  {
    label: 'str',
    kindName: 'function',
    detail: 'number → string',
    documentation:
      'Convert a number to its string representation (same as `print` shows). `str` of a string is identity.',
    insertText: 'str(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'num',
    kindName: 'function',
    detail: 'string → number',
    documentation:
      'Parse a numeric string. Errors on non-numeric input unless a fallback is given.\n\n```\nnum("3.14")    // 3.14\nnum("bad", 0)  // 0\n```',
    insertText: 'num(${1:s})',
    isSnippet: true,
    params: [['s'], ['s', 'fallback']],
  },
  {
    label: 'isstring',
    kindName: 'function',
    detail: '1 if value is a string',
    documentation: '1 if the value is a string, 0 otherwise. The sibling of `islist`.',
    insertText: 'isstring(${1:value})',
    isSnippet: true,
    params: [['value']],
  },
  {
    label: 'chars',
    kindName: 'function',
    detail: 'string → list of chars',
    documentation:
      'Split a string into a list of 1-character strings. Bridge to the whole list toolkit.',
    insertText: 'chars(${1:s})',
    isSnippet: true,
    params: [['s']],
  },
  {
    label: 'split',
    kindName: 'function',
    detail: 'split by separator',
    documentation: 'Split `s` at every occurrence of `sep`. `sep` must be non-empty.',
    insertText: "split(${1:s}, '${2:,}')",
    isSnippet: true,
    params: [['s', 'sep']],
  },
  {
    label: 'joinstr',
    kindName: 'function',
    detail: 'join string list',
    documentation:
      'Concatenate a list of strings with `sep` between each. All elements must be strings.',
    insertText: "joinstr(${1:xs}, '${2:,}')",
    isSnippet: true,
    params: [['xs', 'sep']],
  },
  {
    label: 'upper',
    kindName: 'function',
    detail: 'ASCII uppercase',
    documentation: 'Return a copy of `s` with ASCII letters uppercased (A–Z only).',
    insertText: 'upper(${1:s})',
    isSnippet: true,
    params: [['s']],
  },
  {
    label: 'lower',
    kindName: 'function',
    detail: 'ASCII lowercase',
    documentation: 'Return a copy of `s` with ASCII letters lowercased (a–z only).',
    insertText: 'lower(${1:s})',
    isSnippet: true,
    params: [['s']],
  },
  {
    label: 'strip',
    kindName: 'function',
    detail: 'trim whitespace',
    documentation:
      'Return `s` with leading and trailing whitespace (space, tab, newline) removed.\n\n**Note:** `trim` cuts the thread — use `strip` for whitespace.',
    insertText: 'strip(${1:s})',
    isSnippet: true,
    params: [['s']],
  },
  {
    label: 'repeatstr',
    kindName: 'function',
    detail: 'repeat a string n times',
    documentation: 'Return `s` repeated `n` times (n must be a non-negative integer).',
    insertText: 'repeatstr(${1:s}, ${2:n})',
    isSnippet: true,
    params: [['s', 'n']],
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
    documentation:
      'Seeded simplex noise in −1…1 (industry convention). Slightly finer-grained than legacy `noise2` (0…1).',
    insertText: 'snoise2(${1:x}, ${2:y})',
    isSnippet: true,
    params: [['x', 'y']],
  },
  {
    label: 'snoise3',
    kindName: 'function',
    detail: '3D simplex noise (−1…1)',
    documentation:
      'Seeded 3D simplex noise in −1…1. Use z for variation: `snoise3(x/14, y/14, motif*50)` gives each motif its own noise field.',
    insertText: 'snoise3(${1:x}, ${2:y}, ${3:z})',
    isSnippet: true,
    params: [['x', 'y', 'z']],
  },
  {
    label: 'fbm2',
    kindName: 'function',
    detail: 'fractal Brownian motion',
    documentation:
      'Fractal sum of `snoise2`: lacunarity 2.0, gain 0.5, 1–8 octaves (clamped), normalised to ≈−1…1.',
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
    documentation:
      "Make a vector from turtle heading + length. `vfromheading(heading, 1)` is the needle's direction unit vector.",
    insertText: 'vfromheading(${1:degrees}, ${2:length})',
    isSnippet: true,
    params: [['degrees', 'length']],
  },

  // ── Generative math — segments ──────────────────────────────────────────
  {
    label: 'segisect',
    kindName: 'function',
    detail: 'segment-segment intersection point (or [])',
    documentation:
      "Intersection point [x, y] of segment a0\u2192a1 and segment b0\u2192b1, or [] if they don't cross.\nSegment test, not infinite-line \u2014 endpoints must actually meet. Collinear overlapping segments return the midpoint of the overlap.",
    insertText: 'segisect(${1:a0}, ${2:a1}, ${3:b0}, ${4:b1})',
    isSnippet: true,
    params: [['a0', 'a1', 'b0', 'b1']],
  },
  {
    label: 'segdist',
    kindName: 'function',
    detail: 'distance from point to segment',
    documentation:
      'Shortest distance from point p to the segment a\u2192b. If the perpendicular foot falls outside the segment, returns the distance to the nearer endpoint. A zero-length segment behaves like vdist(p, a).',
    insertText: 'segdist(${1:p}, ${2:a}, ${3:b})',
    isSnippet: true,
    params: [['p', 'a', 'b']],
  },
  {
    label: 'nearestonpath',
    kindName: 'function',
    detail: 'closest point on a path to a point',
    documentation:
      'The closest point to p lying anywhere on path (vertices or along segments). Returns [x, y]. The path is treated as open (no implicit closing segment). O(len(path)) per call.',
    insertText: 'nearestonpath(${1:p}, ${2:path})',
    isSnippet: true,
    params: [['p', 'path']],
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
    documentation:
      'New path whose segments are each exactly spacing mm long (last may be shorter). The bridge between math curves and physical stitch spacing.',
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
    documentation:
      'Cubic Bézier from p0 to p1 through control points c0, c1, resampled at spacing mm.',
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
    documentation:
      'Exactly `for p in path [ setpos(p) ]`. Pen state, stitch mode, satin, and auto-split all apply as if hand-walked.',
    insertText: 'sewpath(${1:path})',
    isSnippet: true,
    params: [['path']],
  },

  // ── Generative math — generators & geometry ──────────────────────────────
  {
    label: 'scatter',
    kindName: 'function',
    detail: 'Poisson-disc scatter points',
    documentation:
      'Seeded Poisson-disc (Bridson) points.\n\n`scatter(minDist)` — over the 47 mm field\n`scatter(minDist, region)` — inside a region polygon\n\nCapped at 20,000 points.',
    insertText: 'scatter(${1:minDist})',
    isSnippet: true,
    params: [['minDist'], ['minDist', 'region']],
  },
  {
    label: 'voronoi',
    kindName: 'function',
    detail: 'Voronoi cells from points',
    documentation:
      'One region per input point, in input order, clipped to the sewable field or a given region. Max 10,000 input points.',
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
    documentation:
      "n rounds of Lloyd's relaxation — moves each point to its Voronoi cell's centroid for even stippling.",
    insertText: 'relax(${1:points}, ${2:iterations})',
    isSnippet: true,
    params: [['points', 'iterations']],
  },
  {
    label: 'offsetpath',
    kindName: 'function',
    detail: 'inflate / shrink a region',
    documentation:
      'Inflate (+) or shrink (−) a region. Returns a list of regions. Shrinking may split or erase the shape entirely.',
    insertText: 'offsetpath(${1:region}, ${2:offset})',
    isSnippet: true,
    params: [['region', 'offset']],
  },
  {
    label: 'clippaths',
    kindName: 'function',
    detail: 'boolean of two regions',
    documentation:
      "Boolean operation on two regions. Backed by Clipper2 at μm precision. Returns a list of regions.\n\nOperations: `'union'` `'intersect'` `'difference'` `'xor'`",
    insertText: "clippaths(${1:a}, ${2:b}, '${3|union,intersect,difference,xor|}')",
    isSnippet: true,
    params: [['a', 'b', "'op'"]],
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
    documentation:
      'New path shifted by `(dx, dy)` mm. The functional companion to the `translate` block command — composes with `scatter`/`voronoi`/`offsetpath` data.',
    insertText: 'xlate(${1:path}, ${2:dx}, ${3:dy})',
    isSnippet: true,
    params: [['path', 'dx', 'dy']],
  },
  {
    label: 'xrotate',
    kindName: 'function',
    detail: 'rotate a path (pure)',
    documentation:
      'New path rotated `deg` clockwise. Optional pivot: `xrotate(path, deg, cx, cy)`.',
    insertText: 'xrotate(${1:path}, ${2:degrees})',
    isSnippet: true,
    params: [
      ['path', 'degrees'],
      ['path', 'degrees', 'cx', 'cy'],
    ],
  },
  {
    label: 'xscale',
    kindName: 'function',
    detail: 'scale a path (pure)',
    documentation:
      'New path scaled by `sx` (and `sy`). `xscale(path, s)` is uniform; `xscale(path, sx, sy)` is per-axis.',
    insertText: 'xscale(${1:path}, ${2:s})',
    isSnippet: true,
    params: [
      ['path', 's'],
      ['path', 'sx', 'sy'],
    ],
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
  {
    label: 'warppath',
    kindName: 'function',
    detail: 'map a path through a reporter (pure)',
    documentation:
      'New path with every point mapped through a `@name` reporter — the functional companion to the `warp` block. `warp @f [ sewpath(P) ]` ≡ `sewpath(warppath(P, @f))`.',
    insertText: 'warppath(${1:path}, @${2:reporter})',
    isSnippet: true,
    params: [['path', 'reporter']],
  },
  {
    label: 'humanizepath',
    kindName: 'function',
    detail: 'seeded coherent jitter on a path (pure)',
    documentation:
      'New path with seeded coherent jitter (`amount` mm) — the functional companion to `humanize`. Forks one draw from the seeded stream.\n\n```\nlet coast = humanizepath(resample(cell, 2.0), 0.3)\nsewpath(coast)\n```',
    insertText: 'humanizepath(${1:path}, ${2:amount})',
    isSnippet: true,
    params: [['path', 'amount']],
  },
  {
    label: 'snappath',
    kindName: 'function',
    detail: 'quantize a path to a fixed lattice (pure)',
    documentation:
      'New path with every point snapped to the fixed lattice — the functional companion to `snaptogrid`, same arity overloads (cell | cellx celly | …ox oy | …ang).\n\n```\nlet pts = snappath(scatter(8), 2)   // Poisson points on a 2 mm grid\n```',
    insertText: 'snappath(${1:path}, ${2:cell})',
    isSnippet: true,
    params: [['path', 'cell']],
  },

  // ── Satin-tuple helpers (library tier) ──────────────────────────────────
  {
    label: 'satinpair',
    kindName: 'function',
    detail: 'symmetric satin tuple: [adv, w, w, 0, 0]',
    documentation:
      'Build the 5-slot satin reporter contract by intent.\n\n`satinpair(advance, width)` → `[advance, width, width, 0, 0]`\n\nThe common case: a symmetric perpendicular bite of the given width. Equivalent to the built-in `satin` generator.\n\nDraw cost: 0. Library tier — shadowable with a note.\n\n```\ndef leaf(t, s, i, u) [\n  return satinpair(0.45, sin(s * 180) * 2.2)\n]\n```',
    insertText: 'satinpair(${1:advance}, ${2:width})',
    isSnippet: true,
    params: [['advance', 'width']],
  },
  {
    label: 'satinrake',
    kindName: 'function',
    detail: 'raked satin tuple: [adv, w, w, -lag, lag]',
    documentation:
      'Build the 5-slot satin reporter contract by intent.\n\n`satinrake(advance, width, lag)` → `[advance, width, width, -lag, lag]`\n\nRakes the stitch into a diagonal by `lag` mm. Alternating the sign each pair makes successive diagonals cross — woven / crosshatch satin.\n\nDraw cost: 0. Library tier — shadowable with a note.\n\n```\ndef crosshatch(t, s, i, u) [\n  if mod(i, 2) = 0 [ return satinrake(0.4, 2, 0.8) ]\n  return satinrake(0.4, 2, -0.8)\n]\n```',
    insertText: 'satinrake(${1:advance}, ${2:width}, ${3:lag})',
    isSnippet: true,
    params: [['advance', 'width', 'lag']],
  },
  {
    label: 'satinasym',
    kindName: 'function',
    detail: 'asymmetric satin tuple: [adv, lw, rw, 0, 0]',
    documentation:
      'Build the 5-slot satin reporter contract by intent.\n\n`satinasym(advance, leftw, rightw)` → `[advance, leftw, rightw, 0, 0]`\n\nAsymmetric column: left and right rail widths are different, no rake.\n\nDraw cost: 0. Library tier — shadowable with a note.',
    insertText: 'satinasym(${1:advance}, ${2:leftw}, ${3:rightw})',
    isSnippet: true,
    params: [['advance', 'leftw', 'rightw']],
  },

  // ── Fill-shaper helper (library tier) ────────────────────────────────────
  {
    label: 'tatamirow',
    kindName: 'function',
    detail: 'fill row tuple: [spacing, len, phase]',
    documentation:
      'Build the 3-slot fill shape reporter contract by intent.\n\n`tatamirow(spacing, len)` → `[spacing, len, 0.5]` — standard brick offset\n`tatamirow(spacing, len, phase)` → `[spacing, len, phase]` — explicit phase\n\nUsed inside a `fill shape @fn` reporter to return the row descriptor without memorising slot order. `phase = 0.5` is the standard tatami brick offset.\n\nDraw cost: 0. Library tier — shadowable with a note.\n\n```\ndef thin(p, row, v) [\n  return tatamirow(remap(v, 0, 1, 0.4, 1.1), 2.5)\n]\nfill shape @thin\n```',
    insertText: 'tatamirow(${1:spacing}, ${2:len})',
    isSnippet: true,
    params: [
      ['spacing', 'len'],
      ['spacing', 'len', 'phase'],
    ],
  },
  {
    label: 'coverat',
    kindName: 'function',
    detail: 'thread coverage in layers at a point (live, pure)',
    documentation:
      'Coverage at a point, in **layers** (the heatmap / `maxdensity` unit; 1 ≈ one clean satin/tatami pass), read live and in sewing order over everything committed so far.\n\n`coverat(p)` — the containing 1 mm cell\n`coverat(p, r)` — averaged over radius `r` mm\n\nPure: zero RNG draws, draws nothing. Sees flushed penetrations (a buffered satin column isn\u2019t visible until it ends).\n\n```\nif coverat(p) < 1.5 [ up setpos(p) down arc 360 0.5 trim ]\n```',
    insertText: 'coverat(${1:p})',
    isSnippet: true,
    params: [['p'], ['p', 'r']],
  },
  {
    label: 'countat',
    kindName: 'function',
    detail: 'penetration count at a point (live, pure)',
    documentation:
      'The number of penetrations in the 1 mm cell containing `p`, read live. Pure: zero draws, draws nothing.',
    insertText: 'countat(${1:p})',
    isSnippet: true,
    params: [['p']],
  },
  {
    label: 'nearestsewn',
    kindName: 'function',
    detail: 'closest prior penetration to a point (or [])',
    documentation:
      'The closest already-sewn penetration to `p`, as `[x, y]` in hoop space, or `[]` if nothing is sewn yet. Backed by a spatial index, so it stays O(local) \u2014 no history scan. Pure: zero draws.',
    insertText: 'nearestsewn(${1:p})',
    isSnippet: true,
    params: [['p']],
  },
  {
    label: 'sewnwithin',
    kindName: 'function',
    detail: 'prior penetrations within r mm of a point',
    documentation:
      'A list of already-sewn penetrations within `r` mm of `p` (hoop space). Grid-bucketed, so proximity logic stays O(local) instead of scanning the whole history.\n\n```\nif len(sewnwithin(p, 2)) = 0 [ … ]   // nothing crowding p yet\n```\n\nPure: zero draws.',
    insertText: 'sewnwithin(${1:p}, ${2:r})',
    isSnippet: true,
    params: [['p', 'r']],
  },
  {
    label: 'stitchedpoints',
    kindName: 'function',
    detail: 'snapshot: a deep copy of all penetrations so far',
    documentation:
      'A deep-copied list of every penetration committed so far, as a path of `[x, y]` points (hoop space), captured at call time. Explicit and opt-in: you pay the O(n) copy when you ask, and the result is just a list (safe to mutate). Pure: zero draws.',
    insertText: 'stitchedpoints()',
    isSnippet: true,
    params: [[]],
  },
];

// ── Fast lookup map (label → NSItem) ─────────────────────────────────────────
const NS_ITEM_MAP = new Map<string, NSItem>(NS_ITEMS.map((item) => [item.label, item]));

// ── Helper: walk text backwards to find the active function call context ─────
//
// Returns the function name and the 0-based active parameter index, or null if
// the cursor is not inside a function call.  Handles nested parens/brackets.
//
function getSignatureContext(
  textBeforeCursor: string,
): { name: string; paramIndex: number } | null {
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

// ── Helper: convert a character offset to a 1-based line number ──────────────
//
// Counts newline characters in `text` up to `offset`. Used by extractUserSymbols
// to attach definition locations to user-defined symbols.

function offsetToLine(text: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

// ── Helper: return only the code portion of a source line ────────────────────
//
// Strips content starting from the first line-comment marker (// # ;) so the
// folding-range provider ignores brackets that appear inside comments.

function codePortionOfLine(line: string): string {
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if ((c === '/' && line[i + 1] === '/') || c === '#' || c === ';') {
      return line.slice(0, i);
    }
  }
  return line;
}

// ── Helper: scan document text for user-defined procedures and variables ──────
interface UserSymbol {
  label: string;
  kindName: 'function' | 'variable';
  detail: string;
  params?: string[]; // parameter names (for procedures)
  line: number; // 1-based line number of the definition in the source
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
    const params = rawParams ? rawParams.split(',').map((p) => p.trim().replace(/^:/, '')) : [];
    add({
      label: name,
      kindName: 'function',
      detail: `procedure(${params.join(', ')})`,
      params,
      line: offsetToLine(text, m.index),
    });
  }

  // Classic procedure: to name :a :b
  const classicProc = /\bto\s+([a-z_][a-z0-9_]*)((?:\s+:[a-z_][a-z0-9_]*)*)/gi;
  while ((m = classicProc.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const rawParams = m[2].trim();
    const params = rawParams
      ? rawParams
          .split(/\s+/)
          .filter(Boolean)
          .map((p) => p.replace(/^:/, ''))
      : [];
    add({
      label: name,
      kindName: 'function',
      detail: `procedure(${params.join(', ')})`,
      params,
      line: offsetToLine(text, m.index),
    });
  }

  // Modern variable: let name =
  const letVar = /\blet\s+([a-z_][a-z0-9_]*)\s*[=]/gi;
  while ((m = letVar.exec(text)) !== null) {
    add({
      label: m[1].toLowerCase(),
      kindName: 'variable',
      detail: 'variable',
      line: offsetToLine(text, m.index),
    });
  }

  // Classic variable: make "name
  const makeVar = /\bmake\s+"([a-z_][a-z0-9_]*)/gi;
  while ((m = makeVar.exec(text)) !== null) {
    add({
      label: m[1].toLowerCase(),
      kindName: 'variable',
      detail: 'variable (make)',
      line: offsetToLine(text, m.index),
    });
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
    keyword: CIK.Keyword,
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
      'stop',
      'trim',
      'fabric',
      'underlay',
      'fillunderlay',
    ],

    // ── Debug / neutral / data-world auxiliaries (amber) ────────────
    debugCmds: [
      'seed', // data-world RNG config
      'print',
      'printloc',
      'mark',
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
      // generative math
      'snoise2',
      'snoise3',
      'fbm2',
      'lerp',
      'remap',
      'clamp',
      'smoothstep',
      'gauss',
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
      'clippaths',
      'inpath',
      'sewpath',
      'xlate',
      'xrotate',
      'xscale',
      'xmirror',
      'warppath',
      'humanizepath',
      'snappath',
      // satin-tuple helpers
      'satinpair',
      'satinrake',
      'satinasym',
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

  // ── Completion provider ───────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider('needlescript', {
    triggerCharacters: [],

    provideCompletionItems(model: MonacoEditor.ITextModel, position: IPos) {
      const wordInfo = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      // Built-in completions
      const suggestions = NS_ITEMS.map((item) => ({
        label: item.label,
        kind: kindMap[item.kindName],
        detail: item.detail,
        documentation: {
          value: item.documentation,
          isTrusted: true,
        } as IMarkdownString,
        insertText: item.insertText,
        insertTextRules: item.isSnippet ? SNIPPET_RULE : undefined,
        range,
      }));

      // User-defined completions (scanned from the current document)
      const userSymbols = extractUserSymbols(model.getValue());
      for (const sym of userSymbols) {
        const userKind = sym.kindName === 'function' ? CIK.Function : CIK.Variable;

        if (sym.kindName === 'function' && sym.params && sym.params.length > 0) {
          const snippetText = `${sym.label}(${sym.params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`;
          suggestions.push({
            label: sym.label,
            kind: userKind,
            detail: sym.detail,
            documentation: { value: `User-defined procedure.`, isTrusted: false },
            insertText: snippetText,
            insertTextRules: SNIPPET_RULE,
            range,
          });
        } else {
          suggestions.push({
            label: sym.label,
            kind: userKind,
            detail: sym.detail,
            documentation: { value: `User-defined ${sym.kindName}.`, isTrusted: false },
            insertText: sym.label,
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

      const wordLower = wordAtPos.word.toLowerCase();

      // ── Built-in hover ───────────────────────────────────────────
      const item = NS_ITEM_MAP.get(wordLower);
      if (item) {
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
      }

      // ── User-defined symbol hover ────────────────────────────────
      const userSymbols = extractUserSymbols(model.getValue());
      const sym = userSymbols.find((s) => s.label === wordLower);
      if (!sym) return null;

      let sigLine = `**${sym.label}**`;
      if (sym.kindName === 'function') {
        const paramStr = sym.params && sym.params.length > 0 ? sym.params.join(', ') : '';
        sigLine += ` \`(${paramStr})\`  *(user procedure, line ${sym.line})*`;
      } else {
        sigLine += `  *(user variable, line ${sym.line})*`;
      }

      return {
        contents: [{ value: sigLine, isTrusted: false }],
      };
    },
  });

  // ── Signature help provider ───────────────────────────────────────
  monaco.languages.registerSignatureHelpProvider('needlescript', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],

    provideSignatureHelp(model: MonacoEditor.ITextModel, position: IPos) {
      // Gather text from document start to cursor
      const textBefore = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const ctx = getSignatureContext(textBefore);
      if (!ctx) return null;

      // ── Built-in signature help ──────────────────────────────────
      const item = NS_ITEM_MAP.get(ctx.name);
      if (item && item.params) {
        // Build one SignatureInformation per overload
        const signatures = item.params.map((paramNames) => {
          const label =
            paramNames.length > 0 ? `${item.label}(${paramNames.join(', ')})` : `${item.label}()`;

          // Compute label ranges for each parameter
          const parameters = paramNames.map((paramName) => {
            const start = label.indexOf(paramName);
            const end = start + paramName.length;
            return {
              label: [start, end] as [number, number],
              documentation: undefined,
            };
          });

          return {
            label,
            documentation: {
              value: item.documentation,
              isTrusted: true,
            } as IMarkdownString,
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
        const sig = signatures[activeSignature];
        const activeParam = Math.min(ctx.paramIndex, sig.parameters.length - 1);

        return {
          value: {
            signatures,
            activeSignature,
            activeParameter: Math.max(0, activeParam),
          },
          dispose() {},
        };
      }

      // ── User-defined procedure signature help ────────────────────
      const userSymbols = extractUserSymbols(model.getValue());
      const userProc = userSymbols.find((s) => s.label === ctx.name && s.kindName === 'function');
      if (!userProc || !userProc.params) return null;

      const paramNames = userProc.params;
      const procLabel = `${userProc.label}(${paramNames.join(', ')})`;
      const parameters = paramNames.map((pname) => {
        const start = procLabel.indexOf(pname);
        const end = start + pname.length;
        return { label: [start, end] as [number, number], documentation: undefined };
      });

      const activeParam =
        paramNames.length > 0 ? Math.min(ctx.paramIndex, paramNames.length - 1) : 0;

      return {
        value: {
          signatures: [
            {
              label: procLabel,
              documentation: {
                value: `User-defined procedure (line ${userProc.line}).`,
                isTrusted: false,
              } as IMarkdownString,
              parameters,
            },
          ],
          activeSignature: 0,
          activeParameter: Math.max(0, activeParam),
        },
        dispose() {},
      };
    },
  });

  // ── Folding range provider ────────────────────────────────────────
  // Produces fold regions for:
  //   • [ … ]  blocks — for repeat/if/while/for/def/transform bodies
  //   • to … end  blocks — classic Logo procedure definitions
  // Comments are stripped from each line before scanning, so brackets
  // inside // # ; comments do not produce ghost fold regions.
  monaco.languages.registerFoldingRangeProvider('needlescript', {
    provideFoldingRanges(model: MonacoEditor.ITextModel) {
      const lineCount = model.getLineCount();
      const ranges: languages.FoldingRange[] = [];

      // Stack of line numbers where an unmatched `[` was seen
      const bracketStack: number[] = [];
      // Stack of line numbers where `to name …` was seen
      const toStack: number[] = [];

      for (let lineNum = 1; lineNum <= lineCount; lineNum++) {
        const codeLine = codePortionOfLine(model.getLineContent(lineNum));

        // Scan for `[` and `]` in the code portion of this line
        for (let ci = 0; ci < codeLine.length; ci++) {
          const ch = codeLine[ci];
          if (ch === '[') {
            bracketStack.push(lineNum);
          } else if (ch === ']') {
            if (bracketStack.length > 0) {
              const startLine = bracketStack.pop()!;
              if (startLine < lineNum) {
                ranges.push({ start: startLine, end: lineNum });
              }
            }
          }
        }

        // Detect `to name …` procedure header lines
        if (/^\s*to\s+[a-z_]/i.test(codeLine)) {
          toStack.push(lineNum);
        } else if (/^\s*end(\s|$)/i.test(codeLine) && toStack.length > 0) {
          const startLine = toStack.pop()!;
          if (startLine < lineNum) {
            ranges.push({ start: startLine, end: lineNum });
          }
        }
      }

      return ranges;
    },
  });

  // ── Definition provider ───────────────────────────────────────────
  // F12 / Ctrl+click on a user-defined procedure name or variable
  // jumps to the line where it is defined.  Built-in names are ignored
  // (they have no source location within the user's file).
  monaco.languages.registerDefinitionProvider('needlescript', {
    provideDefinition(model: MonacoEditor.ITextModel, position: IPos) {
      const wordAtPos = model.getWordAtPosition(position);
      if (!wordAtPos) return null;

      const wordLower = wordAtPos.word.toLowerCase();

      // Only navigate for user-defined symbols; built-ins have no source location.
      if (NS_ITEM_MAP.has(wordLower)) return null;

      const userSymbols = extractUserSymbols(model.getValue());
      const sym = userSymbols.find((s) => s.label === wordLower);
      if (!sym) return null;

      return {
        uri: model.uri,
        range: {
          startLineNumber: sym.line,
          startColumn: 1,
          endLineNumber: sym.line,
          endColumn: model.getLineLength(sym.line) + 1,
        },
      };
    },
  });
}
