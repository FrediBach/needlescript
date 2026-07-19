// Static catalog of all Needlescript built-ins used by Monaco language services.

import { FABRIC_MODES, FILL_UNDERLAY_MODES, SATIN_UNDERLAY_MODES } from '../embroidery-registry.ts';
import { PLAN_MODES } from '../travel-planner.ts';
import { FILL_UNDERLAY_PASS_KINDS, SATIN_UNDERLAY_PASS_KINDS } from '../underlay-profile.ts';
import { FILL_CONSTRUCTION_RANGES, FILL_STAGGER_MODES } from '../fill-profile.ts';

export type NSItemKind = 'keyword' | 'function' | 'variable' | 'constant';

export interface NSItem {
  label: string;
  kindName: NSItemKind;
  detail: string;
  documentation: string;
  insertText: string;
  isSnippet?: boolean;
  params?: string[][];
}

function modeCommandSnippet(command: string, modes: readonly string[], quote: "'" | '"'): string {
  return `${command} ${quote}\${1|${modes.join(',')}|}${quote}`;
}

export const NS_ITEMS: NSItem[] = [
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
    label: 'stitchscope',
    kindName: 'keyword',
    detail: 'temporarily override stitch construction settings',
    documentation:
      "Run a block with temporary stitch-construction settings, then restore the outer configuration even after `return`, `break`, `continue`, or an error. It scopes running/satin/E-stitch/bean modes, fill settings and an armed fill, plus lock, compensation, underlay, auto-trim, and density policies. Turtle position, heading, pen, color, RNG, transforms/effects, output/history, hoop, budgets, and planning are not restored. Pending satin or reporter-running construction flushes at both boundaries; an active `beginfill` cannot cross a boundary.\n\n```\nstitchscope [\n  density 0.5\n  underlay 'edge'\n  satin 4\n  fd 20\n]\n```",
    insertText: 'stitchscope [\n\t$0\n]',
    isSnippet: true,
    params: [[]],
  },
  {
    label: 'import',
    kindName: 'keyword',
    detail: 'import a standard-library procedure',
    documentation:
      'Imports one exported procedure from a bundled standard-library module under a local name. Imports are compile-time only and must be top-level.\n\n```\nimport std.textures.radialdir as radial\nfill dir @radial\n```',
    insertText: 'import std.${1:module}.${2:name} as ${3:alias}',
    isSnippet: true,
  },
  {
    label: 'export',
    kindName: 'keyword',
    detail: 'export a module procedure',
    documentation:
      "Marks a top-level procedure as part of a source module's public surface. The keyword directly prefixes `def` or classic `to`.\n\n```\nexport def radialdir(p) [\n  return vheading(p)\n]\n```",
    insertText: 'export def ${1:name}(${2:params}) [\n\t$0\n]',
    isSnippet: true,
  },
  {
    label: 'def',
    kindName: 'keyword',
    detail: 'define a procedure',
    documentation:
      'Define a procedure. Parameters are local and can recurse (depth limit 200). Anonymous `def(params) [ … ]` expressions capture enclosing locals by snapshot and return a configured reference.\n\n```\ndef multiplier(k) [\n  return def(x) [ return x * k ]\n]\n```\nClassic form: `to name :a :b … end`',
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
    params: [[]],
  },
  {
    label: 'down',
    kindName: 'function',
    detail: 'pen down (sew mode)',
    documentation: 'Needle down — subsequent moves sew stitches.\n\nAliases: `pendown`, `pd`',
    insertText: 'down',
    params: [[]],
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
    params: [[]],
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
    params: [[]],
  },
  {
    label: 'push',
    kindName: 'function',
    detail: 'save needle state onto stack',
    documentation:
      'Save needle state (position, heading, pen up/down) onto a stack. Max 500 saved states.',
    insertText: 'push',
    params: [[]],
  },
  {
    label: 'pop',
    kindName: 'function',
    detail: 'restore needle state from stack',
    documentation:
      'Restore the last saved needle state from the stack. Pop on an empty stack warns and is ignored.',
    insertText: 'pop',
    params: [[]],
  },
  {
    label: 'cs',
    kindName: 'function',
    detail: 'clearscreen (no-op)',
    documentation:
      'Accepted for Logo familiarity; does nothing in NeedleScript.\n\nAliases: `clearscreen`, `clear`',
    insertText: 'cs',
    params: [[]],
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
  {
    label: 'declump',
    kindName: 'keyword',
    detail: 'along-axis perforation-crowd relief',
    documentation:
      "Ease crowded needle penetrations along the **thread's own line of travel** — never sideways, so stitch angles stay intact. Each penetration that exceeds `limit` layers of coverage is slid backward or forward along its axis until it finds clear fabric, within `maxshift` mm (default 1.5, clamped 0–5). Runs **after** stitch splitting, like `humanize`. Drawless (zero RNG draws) — adding or removing the block never reshuffles downstream randomness.\n\nThe fold is greedy: earlier stitches in the block win the space; later ones absorb the displacement. Sew the geometry whose fidelity matters most first.\n\n```\n// Relief for a radial motif whose centre takes dozens of hits\ndeclump 2 1.5 [\n  repeat 24 [\n    moveto 0 0\n    seth repcount * 15\n    fd 40\n    trim\n  ]\n]\n```\n\nExclusions: satin columns (warn + skip, as with `humanize`), fill boundary recording (skip + note), inside `trace` (inert + note).\n\nTypical values: `limit` 1.5–2.5, `maxshift` 0.5 (subtle) to 1.5 (default) to 3+ (visible variation).",
    insertText: 'declump ${1:limit} [\n\t$0\n]',
    isSnippet: true,
    params: [['limit'], ['limit', 'maxshift']],
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
    detail: 'running stitch length — three forms',
    documentation:
      'Running-stitch length, clamped 0.4–12 mm (default 2.5).  Alias: `stitchlength`\n\n**Three forms:**\n\n- `stitchlen 2.5` — uniform numeric (unchanged)\n- `stitchlen [4, 1.5]` — cycling list; optional phase offset: `stitchlen [4, 1.5] 1`\n- `stitchlen @fn` — reporter, queried once per stitch:  \n  `def fn(t, s, i, p) [ return mm ]`  \n  `t` = arc-length from stretch start (mm); `s` = normalised 0..1; `i` = stitch index; `p` = hoop-space `[x, y]`.  \n  Must return a positive number.  Clamped 0.4–12 mm.\n\nA numeric `stitchlen` disengages the list or reporter.',
    insertText: 'stitchlen ${1:mm}',
    isSnippet: true,
    params: [['mm'], ['[a, b, …]'], ['[a, b, …] phase'], ['@fn']],
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
    label: 'satinbetween',
    kindName: 'function',
    detail: 'satin column between two path rails',
    documentation:
      'Sews an immediate satin column between two independently authored path rails. Rails are mapped through the active transform/warp before arc-length pairing, so `density`, underlay, pull compensation, short-stitch relief, coverage, and ceiling checks use physical millimetres. Both rails must both be open or both be explicitly closed.\n\nForms:\n- `satinbetween(a, b)`\n- `satinbetween(a, b, checkpoints)` where checkpoints are ordered `[[pointA, pointB], …]`\n- `satinbetween(a, b, @shape)`\n- `satinbetween(a, b, checkpoints, @shape)`\n\nA shape reporter takes `(t, s, i, u)` and returns `[advance, insetA, insetB, lagA, lagB]`. Use `railinset` and `railrake` to build tuples. Drawless unless the reporter draws. Call syntax only; statement-only.',
    insertText: 'satinbetween(${1:railA}, ${2:railB})',
    isSnippet: true,
    params: [
      ['railA', 'railB'],
      ['railA', 'railB', 'checkpoints'],
      ['railA', 'railB', '@shape'],
      ['railA', 'railB', 'checkpoints', '@shape'],
    ],
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
    params: [[]],
  },
  {
    label: 'endfill',
    kindName: 'function',
    detail: 'end fill — sew the enclosed area',
    documentation: 'Close the fill boundary and sew a tatami fill of the enclosed area.',
    insertText: 'endfill',
    params: [[]],
  },
  {
    label: 'fill',
    kindName: 'function',
    detail: 'programmable fill (field, texture, or paths)',
    documentation:
      'Arm a programmable fill for the next `beginfill…endfill`. `fill dir @field` drives row direction; `fill shape @texture` drives spacing/length/brick; `fill paths @generator` supplies ordered path geometry; `fill paths pathsExpr` freezes static paths. The engine retains clipping, pull compensation, underlay, subdivision, coverage, and budgets.',
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
    label: 'fillinset',
    kindName: 'function',
    detail: 'inset the fill construction region (mm)',
    documentation: `Reserve space inside a fill boundary for a later border. Range ${FILL_CONSTRUCTION_RANGES.insetMM.min}–${FILL_CONSTRUCTION_RANGES.insetMM.max} mm (default 0). The complete compound even-odd region is inset in physical hoop space: outer boundaries shrink, holes expand, and concave regions may split. Topping and fill underlay use the inset region; disconnected pieces are crossed only by jumps. Collapsed or split geometry warns with a source line and preview location.`,
    insertText: 'fillinset ${1:mm}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'fillstagger',
    kindName: 'function',
    detail: 'choose fill-row penetration staggering',
    documentation:
      "Choose the topping-row phase policy. `'legacy'` preserves existing output; `'brick'` alternates 0 and `fillstaggeramount`; `'progressive'` repeats the wrapped four-row cycle `0, amount, 3×amount, 2×amount`; `'random'` hashes row geometry into a stable phase without drawing from the seeded RNG. A `fill shape @fn` reporter retains its cumulative phase as the base, then the policy offset is added and wrapped. Fill underlay is unaffected.",
    insertText: modeCommandSnippet('fillstagger', FILL_STAGGER_MODES, "'"),
    isSnippet: true,
    params: [['mode']],
  },
  {
    label: 'fillstaggeramount',
    kindName: 'function',
    detail: 'fill stagger phase amount (fraction)',
    documentation: `Set the wrapped phase fraction used by non-legacy fill staggering. Range ${FILL_CONSTRUCTION_RANGES.staggerAmount.min}–${FILL_CONSTRUCTION_RANGES.staggerAmount.max}; default ${FILL_CONSTRUCTION_RANGES.staggerAmount.default}. With fixed fill length, the fraction is multiplied by that length. List/reporter forms use the first effective stitch length of each row. Policy-created edge fragments below 0.4 mm are merged with a spatial, source-attributed warning.`,
    insertText: 'fillstaggeramount ${1:' + FILL_CONSTRUCTION_RANGES.staggerAmount.default + '}',
    isSnippet: true,
    params: [['fraction']],
  },
  {
    label: 'filllen',
    kindName: 'function',
    detail: 'fill stitch length — three forms',
    documentation:
      'Fill stitch length.  Defaults to `stitchlen`.  `filllen 0` follows `stitchlen` again.\n\n**Three forms:**\n\n- `filllen 3` — uniform numeric (1–7 mm)\n- `filllen [3.5, 1.0]` — cycling list per row stitch; optional phase offset\n- `filllen @fn` — reporter `def fn(t, s, i, p) [ return mm ]` per fill-row stitch\n\n`filllen 0` propagates whichever form `stitchlen` currently uses.',
    insertText: 'filllen ${1:mm}',
    isSnippet: true,
    params: [['mm'], ['[a, b, …]'], ['@fn']],
  },
  {
    label: 'color',
    kindName: 'function',
    detail: 'switch thread color',
    documentation:
      "Switch to numeric thread n, or resolve a color string such as `color '#e94560'` or `color 'crimson'`.",
    insertText: "color ${1:'#e94560'}",
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'palette',
    kindName: 'function',
    detail: 'declare thread colors',
    documentation:
      'Top-level, once-only palette metadata. Takes a list of 1–64 colors and must precede stitches, `color`, and `stop`.',
    insertText: "palette ['${1:#0b132b}', '${2:#5bc0be}', '${3:#e94560}']",
    isSnippet: true,
    params: [['colors']],
  },
  {
    label: 'background',
    kindName: 'function',
    detail: 'declare fabric color',
    documentation:
      'Top-level fabric-color metadata. Must precede the first stitch and does not affect DST output.',
    insertText: "background '${1:#f5efe4}'",
    isSnippet: true,
    params: [['color']],
  },
  {
    label: 'stop',
    kindName: 'function',
    detail: 'next color (shorthand)',
    documentation:
      'Shorthand for "next colour" — equivalent to incrementing the thread number by 1.',
    insertText: 'stop',
    params: [[]],
  },
  {
    label: 'trim',
    kindName: 'function',
    detail: 'cut thread here',
    documentation: 'Cut the thread here. Long travels also get one automatically (see `autotrim`).',
    insertText: 'trim',
    params: [[]],
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
    label: 'hoop',
    kindName: 'function',
    detail: 'set the physical hoop and sewable field',
    documentation:
      "Configure the physical hoop for this design. The sewable field is the hoop inset by 3 mm on every side.\n\n**Named presets:**\n- `'round100'` — ⌀100 mm round (default)\n- `'4x4'` — 100 × 100 mm\n- `'5x7'` — 130 × 180 mm  \n- `'6x10'` — 160 × 260 mm\n- `'8x8'` — 200 × 200 mm\n- `'8x12'` — 200 × 300 mm\n\n**Numeric (round hoop):** `hoop 150` → ⌀150 mm\n**List (rectangular):** `hoop [130, 180]` → 130 × 180 mm\n\nMust be at the top of the program, before any stitches. At most one per program.\n\n```\nhoop '5x7'\nseed 42\nlet pts = scatter(8)  // fills the 124 × 174 mm field\n```",
    insertText: "hoop '${1|round100,4x4,5x7,6x10,8x8,8x12|}'",
    isSnippet: true,
    params: [['preset'], ['diameter'], ['dimensions']],
  },
  {
    label: 'override',
    kindName: 'function',
    detail: 'raise or lower a run-envelope budget',
    documentation:
      "Raise (with a warning) or lower (with an info note) a run-envelope budget.\n\n**Keys and stock values:**\n| Key | Stock | Ceiling |\n|---|---|---|\n| `'stitches'` | 100,000 | 250,000 |\n| `'ops'` | 10,000,000 | 50,000,000 |\n| `'calldepth'` | 200 | 2,000 |\n| `'loopiters'` | 200,000 | 5,000,000 |\n| `'listlen'` | 100,000 | 1,000,000 |\n| `'listcells'` | 1,000,000 | 8,000,000 |\n| `'stringlen'` | 10,000 | 1,000,000 |\n| `'stringtotal'` | 1,000,000 | 20,000,000 |\n| `'scatterpoints'` | 20,000 | 100,000 |\n| `'geoinput'` | 10,000 | 50,000 |\n| `'clipverts'` | 50,000 | 250,000 |\n| `'chalks'` | 2,000 | 20,000 |\n| `'chalkverts'` | 200,000 | 2,000,000 |\n\nMust be at the top of the program, before any stitches.\n\n```\nhoop '6x10'\noverride 'stitches' 120000\n```",
    insertText:
      "override '${1|stitches,ops,calldepth,loopiters,listlen,listcells,stringlen,stringtotal,scatterpoints,geoinput,clipverts,chalks,chalkverts|}' ${2:value}",
    isSnippet: true,
    params: [['key', 'value']],
  },
  {
    label: 'plan',
    kindName: 'function',
    detail: 'reorder independent thread runs to shorten travel',
    documentation:
      "Top-level travel-planning directive. `plan 'nearest'` greedily reorders whole thread runs within each color block after execution and before autotrim/locks. `plan 'reversing-nearest'` may also enter eligible stitch-only runs from their nearer endpoint. Planning never crosses a color change, changes stitch geometry, or removes an explicit `trim`. Use `plan 'off'` for an explicit no-op. Must appear before the first stitch and at most once.",
    insertText: modeCommandSnippet('plan', PLAN_MODES, "'"),
    isSnippet: true,
    params: [['mode']],
  },
  {
    label: 'fabric',
    kindName: 'function',
    detail: 'fabric preset',
    documentation:
      'Apply a fabric preset. Sets pull compensation, density limit, and underlay defaults.\n\n- `"woven` — pull 0.2 mm, max 3.5 layers\n- `"knit` — pull 0.5 mm, max 3.0, density floor 0.45 mm\n- `"stretch` — pull 0.6 mm, max 2.8, density floor 0.5 mm\n- `"denim` / `"canvas` — pull 0.15 mm, max 4.0\n- `"fleece` — pull 0.3 mm, max 2.6, double underlay',
    insertText: modeCommandSnippet('fabric', FABRIC_MODES, '"'),
    isSnippet: true,
    params: [['preset']],
  },
  {
    label: 'underlay',
    kindName: 'function',
    detail: 'satin underlay style',
    documentation:
      'Stabilising stitches under each satin column.\n\n- `"auto` — picks by width: <1.5 mm none, <4 mm center, wider zigzag\n- `"center` — center walk\n- `"edge` — edge walk\n- `"zigzag` — cross-grain zigzag\n- `"off` — no underlay',
    insertText: modeCommandSnippet('underlay', SATIN_UNDERLAY_MODES, '"'),
    isSnippet: true,
    params: [['mode']],
  },
  {
    label: 'underlaypasses',
    kindName: 'function',
    detail: 'ordered satin underlay passes',
    documentation:
      "Set the exact ordered passes sewn beneath every satin column. Accepted pass names are `'center'`, `'edge'`, and `'zigzag'`; duplicates are allowed and an empty list disables underlay. Explicit pass order supersedes `fabric` doubling and `underlay 'auto'`. All underlay events retain the preview `u: 1` flag.\n\n```\nunderlaypasses ['center', 'edge']\nunderlaylen 2.8\nunderlayinset 0.6\nunderlayspacing 1.8\n```",
    insertText: `underlaypasses ['\${1|${SATIN_UNDERLAY_PASS_KINDS.join(',')}|}']`,
    isSnippet: true,
    params: [['passes']],
  },
  {
    label: 'underlaylen',
    kindName: 'function',
    detail: 'satin underlay running length (mm)',
    documentation:
      'Set center/edge running-stitch length and zigzag return-run length, in physical hoop millimetres. Range 0.4–12 mm. It tunes the current legacy pass selection unless `underlaypasses` supplies an explicit order.',
    insertText: 'underlaylen ${1:2.8}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'underlayinset',
    kindName: 'function',
    detail: 'absolute satin edge-underlay inset (mm)',
    documentation:
      'Set edge-pass inset inward from each topping rail, in physical hoop millimetres (0–10 mm). This command is deliberately absolute-only; ratio-based legacy settings are not overloaded into the same syntax. On a column narrower than twice the inset, the edge walks meet at the center and a warning is emitted.',
    insertText: 'underlayinset ${1:0.6}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'underlayspacing',
    kindName: 'function',
    detail: 'satin underlay zigzag spacing (mm)',
    documentation:
      'Set spacing along zigzag underlay passes in physical hoop millimetres. Range 0.25–5 mm. Zigzag width remains the unambiguous built-in 60% column-width ratio.',
    insertText: 'underlayspacing ${1:2}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'fillunderlay',
    kindName: 'function',
    detail: 'fill underlay style',
    documentation:
      'Underlay beneath fills.\n\n- `"auto` — tatami, plus edge run on areas > 100 mm²\n- `"tatami` — sparse cross-grain pass\n- `"edge` — inset edge run only\n- `"off` — no underlay',
    insertText: modeCommandSnippet('fillunderlay', FILL_UNDERLAY_MODES, '"'),
    isSnippet: true,
    params: [['mode']],
  },
  {
    label: 'fillunderlaypasses',
    kindName: 'function',
    detail: 'ordered fill underlay passes',
    documentation:
      "Set the exact ordered passes generated from each recorded fill region. Accepted pass names are `'edge'` and `'tatami'`; duplicates repeat and an empty list disables underlay. Explicit order supersedes `fillunderlay 'auto'` and fabric doubling. Custom path fills still generate these passes from the recorded compound region, not from returned decorative paths.\n\n```\nfillunderlaypasses ['edge', 'tatami']\nfillunderlaylen 3\nfillunderlayinset 0.8\nfillunderlayspacing 2.2\nfillunderlayangle 90\n```",
    insertText: `fillunderlaypasses ['\${1|${FILL_UNDERLAY_PASS_KINDS.join(',')}|}']`,
    isSnippet: true,
    params: [['passes']],
  },
  {
    label: 'fillunderlaylen',
    kindName: 'function',
    detail: 'fill underlay stitch length (mm)',
    documentation:
      'Set edge-walk and tatami-underlay stitch length in physical hoop millimetres. Range 1–7 mm. It tunes the selected legacy passes unless `fillunderlaypasses` supplies an explicit order.',
    insertText: 'fillunderlaylen ${1:3}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'fillunderlayinset',
    kindName: 'function',
    detail: 'fill underlay inset (mm)',
    documentation:
      'Set the inward physical inset for edge and tatami fill-underlay passes. Range 0–10 mm. Custom edge passes use a compound even-odd inset, preserving holes, concavities, and disconnected components.',
    insertText: 'fillunderlayinset ${1:0.8}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'fillunderlayspacing',
    kindName: 'function',
    detail: 'fill underlay row spacing (mm)',
    documentation:
      'Set tatami-underlay row spacing in physical hoop millimetres. Range 0.25–5 mm. Edge passes are unaffected.',
    insertText: 'fillunderlayspacing ${1:2.2}',
    isSnippet: true,
    params: [['mm']],
  },
  {
    label: 'fillunderlayangle',
    kindName: 'function',
    detail: 'fill underlay relative angle (degrees)',
    documentation:
      'Set the tatami-underlay angle relative to the topping direction. Plain fills use `fillangle + offset`; directional fills rotate the local direction field by the same offset before mapping it to hoop space. Any finite degree value is accepted.',
    insertText: 'fillunderlayangle ${1:90}',
    isSnippet: true,
    params: [['degrees']],
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
    params: [[]],
  },
  {
    label: 'mark',
    kindName: 'function',
    detail: 'drop debug pin on stage',
    documentation:
      "Drop a numbered pin on the preview at the needle position. Optional string label shown instead of the pin number.\n\n```\nmark         // numbered pin\nmark 'rose'  // labelled pin\n```\n\nNever exported to the machine or counted in stats.",
    insertText: 'mark',
    params: [[], ['label']],
  },
  {
    label: 'chalk',
    kindName: 'function',
    detail: 'preview path data without sewing',
    documentation:
      "Draw a point, path, or group of paths as a removable tailor's-chalk guide on the preview. It does not sew, move the needle, consume random draws, affect coverage, or enter machine exports.\n\n```\nchalk points\nchalk spine 'satin guide'\nchalk seeds 'layout' 'dots'\n```\n\nStyles: `'auto'`, `'dots'`, `'line'`.",
    insertText: "chalk ${1:value} '${2:label}'",
    isSnippet: true,
    params: [['value', 'label', 'style']],
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
    documentation:
      'Sine of an angle in degrees. Returns a value in −1…1 that rises to 1 at 90°, falls back to 0 at 180°, reaches −1 at 270°, and completes the cycle at 360°. Multiply by the amplitude you need.\n\nIn embroidery: produces widths or offsets that wave along a path. Combine with `cos` to trace circular arcs or orbiting motifs.\n\n```\n// Oscillating satin width — pulses wide and narrow along the column\ndef wave(t, s, i, u) [\n  return satinpair(0.4, 1.5 + sin(s * 360) * 1.0)\n]\nsatin @wave  fd 60\n```',
    insertText: 'sin(${1:degrees})',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'cos',
    kindName: 'function',
    detail: 'cosine (degrees)',
    documentation:
      'Cosine of an angle in degrees. Identical to `sin` but shifted 90° — `cos(0)` is 1 (peak) while `sin(0)` is 0. Returns a value in −1…1.\n\nPair with `sin` to trace circular paths: `setxy r*sin(a), r*cos(a)` steps around a circle of radius `r` as `a` runs 0…360.\n\n```\n// Draw a circle step-by-step using sin and cos\nup\nrepeat 36 [\n  setxy 20 * sin(repcount * 10), 20 * cos(repcount * 10)\n  down\n]\n```',
    insertText: 'cos(${1:degrees})',
    isSnippet: true,
    params: [['degrees']],
  },
  {
    label: 'sqrt',
    kindName: 'function',
    detail: 'square root',
    documentation:
      'Square root — the inverse of squaring. The most common use in generative embroidery is computing Euclidean distance: `sqrt(dx*dx + dy*dy)` gives the length of a line segment. Negative input is a runtime error. For distances between stored points, `vdist` is usually simpler.\n\n```\nlet dx = xcor    let dy = ycor\nlet d = sqrt(dx*dx + dy*dy)  // distance from needle to origin\n// equivalent to: distance(0, 0)\n```',
    insertText: 'sqrt(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'abs',
    kindName: 'function',
    detail: 'absolute value',
    documentation:
      'Strips the sign from a number — `abs(-3)` and `abs(3)` both return 3. Use it when you need a magnitude regardless of direction, such as mirroring a left/right offset or ensuring a width is never negative.\n\n```\n// Satin width grows with distance from centre, symmetrically left and right\ndef mirror_taper(t, s, i, u) [\n  return satinpair(0.4, abs(s - 0.5) * 4 + 0.5)\n]\n```',
    insertText: 'abs(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'round',
    kindName: 'function',
    detail: 'round to nearest integer',
    documentation:
      'Round to the nearest integer. `round(2.7)` → 3, `round(2.3)` → 2. Halfway values round away from zero: `round(2.5)` → 3.\n\nUseful for snapping a count or index to a whole number before using it in `repeat` or as a list subscript.',
    insertText: 'round(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'floor',
    kindName: 'function',
    detail: 'round down (floor)',
    documentation:
      'Round down toward negative infinity — always the integer at or below the value. `floor(2.9)` → 2, `floor(-2.1)` → -3.\n\nUse it for grid snapping ("which column does this x fall in?") or to produce a 0-based index from a continuous value: `floor(t / cellSize)`.',
    insertText: 'floor(${1:n})',
    isSnippet: true,
    params: [['n']],
  },
  {
    label: 'ceil',
    kindName: 'function',
    detail: 'round up (ceiling)',
    documentation:
      'Round up toward positive infinity — always the integer at or above the value. `ceil(2.1)` → 3, `ceil(-2.9)` → -2.\n\nUse it when you need a count that is guaranteed to cover a range: "how many stitches of length `l` fit in distance `d`?" → `ceil(d / l)`.',
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
    label: 'log',
    kindName: 'function',
    detail: 'natural logarithm',
    documentation:
      'Natural logarithm (base e) — the inverse of exponential growth. `log(1)` is 0 and `log(pow(e, x))` is x, where `e` is approximately 2.71828. Input must be positive; zero or a negative number is a runtime error. For another base, use `log(x) / log(base)`.',
    insertText: 'log(${1:n})',
    isSnippet: true,
    params: [['n']],
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
    documentation:
      'Create a new list containing `count` deep copies of `value`. Useful for initialising a collection of slots that you will fill in later with a loop.\n\n```\n// Start with 10 widths all at 2.5 mm, then override some\nlet widths = filled(10, 2.5)\nwidths[2] = 1.0\nwidths[7] = 3.8\n```',
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
    documentation:
      'Join two lists end-to-end, returning a new combined list. The elements are shared references (shallow copy) — mutating a nested list in the result also mutates the original. Use `copy` if you need full independence.\n\n```\n// Combine two traced paths into one continuous route\nlet full = concat(first_half, second_half)\nsewpath(resample(full, 2))\n```',
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
    documentation:
      'Arithmetic mean (average) of all elements in the list. Equivalent to `sum(xs) / len(xs)`. Errors on an empty list.\n\n```\n// Centre the needle on the average position of a point set\nlet xs = map(pts, @first)\nlet ys = map(pts, @last)\nmoveto mean(xs), mean(ys)\n```',
    insertText: 'mean(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'minof',
    kindName: 'function',
    detail: 'minimum element',
    documentation:
      'Smallest value in a list. Errors on an empty list. Often paired with `maxof` to find the full data range before remapping or normalising.\n\n```\nlet lo = minof(widths)\nlet hi = maxof(widths)\n// Normalise each width to 0..1\nfor w in widths [\n  print remap(w, lo, hi, 0, 1)\n]\n```',
    insertText: 'minof(${1:list})',
    isSnippet: true,
    params: [['list']],
  },
  {
    label: 'maxof',
    kindName: 'function',
    detail: 'maximum element',
    documentation:
      'Largest value in a list. Errors on an empty list. Often paired with `minof` to find the full data range.\n\n```\nlet hi = maxof(distances)\n// Scale all distances to fit inside a 40 mm circle\nfor d in distances [\n  print d / hi * 20\n]\n```',
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
  {
    label: 'bind',
    kindName: 'function',
    detail: 'bind leading reference arguments',
    documentation:
      'Return a configured reference with one or more leading arguments fixed. Values are evaluated once; lists retain reference semantics.\n\n```\ndef add(a, b) [ return a + b ]\nlet add10 = bind(@add, 10)\nprint add10(5)  // 15\n```',
    insertText: 'bind(@${1:fn}, ${2:value})',
    isSnippet: true,
    params: [['@fn', 'value', '...']],
  },
  {
    label: 'isref',
    kindName: 'function',
    detail: 'test for a reference value',
    documentation:
      'Return 1 when the value is a plain, bound, composed, or capturing reference; otherwise 0.',
    insertText: 'isref(${1:value})',
    isSnippet: true,
    params: [['value']],
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
    documentation:
      'Blend smoothly between two values. Returns `a` when `t = 0`, `b` when `t = 1`, and the midpoint when `t = 0.5`. `t` is unclamped — values outside 0…1 extrapolate.\n\nThe classic tool for things that change gradually: tapering a satin column from wide at the base to thin at the tip, or easing a spacing as the needle moves along a path.\n\n```\n// Taper a satin column from 3 mm at the root to 0.5 mm at the tip\ndef taper(t, s, i, u) [\n  return satinpair(0.4, lerp(3, 0.5, s))\n]\nsatin @taper  fd 40\n```',
    insertText: 'lerp(${1:a}, ${2:b}, ${3:t})',
    isSnippet: true,
    params: [['a', 'b', 't']],
  },
  {
    label: 'remap',
    kindName: 'function',
    detail: 'remap value between ranges',
    documentation:
      'Linearly rescale a value from one range to another — like converting between units. `remap(value, inMin, inMax, outMin, outMax)` maps `inMin → outMin` and `inMax → outMax`. Result is unclamped; use `clamp` around it if the input might exceed the source range.\n\nCommon use: translate noise (which lives in 0…1 or −1…1) into a practical stitch width or spacing.\n\n```\n// noise2 returns 0…1; drive a satin width between 1.5 mm and 3.5 mm\ndef textured(t, s, i, u) [\n  let w = remap(noise2(t / 12, 0), 0, 1, 1.5, 3.5)\n  return satinpair(0.4, w)\n]\nsatin @textured  fd 40\n```',
    insertText: 'remap(${1:value}, ${2:inMin}, ${3:inMax}, ${4:outMin}, ${5:outMax})',
    isSnippet: true,
    params: [['value', 'inMin', 'inMax', 'outMin', 'outMax']],
  },
  {
    label: 'clamp',
    kindName: 'function',
    detail: 'clamp value to [min, max]',
    documentation:
      'Constrain a value so it never falls below `min` or above `max`. Equivalent to `min(max(value, lo), hi)`. Use it when a calculation might produce negative lengths, out-of-range widths, or other implausible values.\n\n```\n// Keep a noise-driven satin width inside a safe range\ndef safe(t, s, i, u) [\n  let w = noise2(t / 10, 0) * 5   // 0…5, but noise can spike\n  return satinpair(0.4, clamp(w, 0.5, 4))\n]\nsatin @safe  fd 40\n```',
    insertText: 'clamp(${1:value}, ${2:min}, ${3:max})',
    isSnippet: true,
    params: [['value', 'min', 'max']],
  },
  {
    label: 'smoothstep',
    kindName: 'function',
    detail: 'Hermite smooth ease (0…1)',
    documentation:
      'S-curve transition: returns 0 when `x ≤ edge0`, 1 when `x ≥ edge1`, and a smooth ease-in/ease-out curve in between. The curve accelerates from 0 then decelerates into 1, so transitions look far more natural than a straight `lerp`.\n\nUse it for soft fade-ins at the start of a column, soft fade-outs at the end, or any width change that should feel gradual rather than mechanical.\n\n```\n// Fade a satin column up and back down — wide in the middle\ndef soft_taper(t, s, i, u) [\n  let fade = smoothstep(0, 0.2, s) * smoothstep(1, 0.8, s)\n  return satinpair(0.4, lerp(0.3, 3.5, fade))\n]\nsatin @soft_taper  fd 50\n```',
    insertText: 'smoothstep(${1:edge0}, ${2:edge1}, ${3:x})',
    isSnippet: true,
    params: [['edge0', 'edge1', 'x']],
  },
  {
    label: 'gauss',
    kindName: 'function',
    detail: 'seeded Gaussian random',
    documentation:
      'Seeded normally-distributed random number centred on `mean` with spread `sigma`. Unlike `random` (uniform), most values land close to the mean — only occasionally straying far. The larger `sigma` is, the wider the spread.\n\nExactly 2 RNG draws per call (Box-Muller method) — predictable cost for downstream reproducibility.\n\nGood for organic variation: scatter placement that clusters naturally, jitter that feels hand-made, or noise that emphasises the average rather than the extreme.\n\n```\n// Scatter stems that cluster naturally around the centre\nrepeat 24 [\n  moveto gauss(0, 10), gauss(0, 5)\n  down  fd 12  up  trim\n]\n```',
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
      'Fractal Brownian motion — layers multiple octaves of `snoise2` at increasing frequencies and decreasing amplitudes. Each octave adds finer detail on top of the large-scale shape, producing a rich, cloud-like texture. Returns approximately −1…1.\n\n- `octaves` controls how many detail layers are stacked. 1 = smooth (same as `snoise2`), 4–6 = rich and detailed, 8 = maximum.\n- `lacunarity` = 2.0 (each octave doubles in frequency)\n- `gain` = 0.5 (each octave halves in amplitude)\n\nSample at low spatial frequency: divide coordinates by 10–20 for broad organic drift.\n\n```\n// Flow-fill with richly textured noise direction\ndef noisy_dir(p) [\n  return fbm2(p[0] / 15, p[1] / 15, 5) * 45\n]\nfill dir @noisy_dir\nbeginfill\n  repeat 6 [ fd 30 rt 60 ]\nendfill\n```',
    insertText: 'fbm2(${1:x}, ${2:y}, ${3:octaves})',
    isSnippet: true,
    params: [['x', 'y', 'octaves']],
  },

  // ── Generative math — vectors ────────────────────────────────────────────
  {
    label: 'vadd',
    kindName: 'function',
    detail: 'add two vectors',
    documentation:
      'Add two 2D vectors (stored as `[x, y]` lists), returning a new point. Use it to offset a position by a direction or to accumulate steps.\n\n```\nlet p = [10, 5]\nlet nudge = [0, 3]\nsetpos vadd(p, nudge)   // moves to [10, 8]\n```',
    insertText: 'vadd(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'vsub',
    kindName: 'function',
    detail: 'subtract two vectors',
    documentation:
      'Subtract vector `b` from `a`, returning a new point `[a[0]-b[0], a[1]-b[1]]`. The result is also the displacement vector from `b` to `a` — useful for computing the direction between two stored positions before normalising with `vnorm`.\n\n```\n// Direction from base to tip, then normalise to unit length\nlet dir = vnorm(vsub(tip, base))\nseth vheading(dir)   fd vdist(base, tip)\n```',
    insertText: 'vsub(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'vscale',
    kindName: 'function',
    detail: 'scale a vector',
    documentation:
      'Multiply both components of a vector by scalar `s`, returning a new point. Use it to extend or shorten a direction vector, or to resize an offset.\n\n```\n// Push a point 5 mm further away from the origin\nlet dir = vnorm(p)           // unit direction toward p\nlet pushed = vscale(dir, vlen(p) + 5)\n```',
    insertText: 'vscale(${1:vector}, ${2:scale})',
    isSnippet: true,
    params: [['vector', 'scale']],
  },
  {
    label: 'vlerp',
    kindName: 'function',
    detail: 'lerp between two vectors',
    documentation:
      'Interpolate between two 2D points — returns `a` at `t = 0`, `b` at `t = 1`. Works like `lerp` but for positions. Good for moving along a line segment, finding a midpoint, or distributing jump targets evenly between two anchor points.\n\n```\n// Find the midpoint between two corners\nlet mid = vlerp(cornerA, cornerB, 0.5)\nmoveto mid[0], mid[1]\n```',
    insertText: 'vlerp(${1:a}, ${2:b}, ${3:t})',
    isSnippet: true,
    params: [['a', 'b', 't']],
  },
  {
    label: 'vdot',
    kindName: 'function',
    detail: 'dot product',
    documentation:
      'Dot product: `a[0]*b[0] + a[1]*b[1]`. Measures how much two vectors point in the same direction. Positive when they agree, 0 when perpendicular, negative when they oppose each other.\n\nThe key projection tool: `vdot(v, dir)` (where `dir` is a unit vector) gives the signed distance of `v` along that direction.\n\n```\n// How far along the path has the needle advanced?\nlet fwd = vfromheading(heading, 1)         // forward unit vector\nlet advance = vdot(vsub(pos(), start), fwd)\n```',
    insertText: 'vdot(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'vlen',
    kindName: 'function',
    detail: 'vector length (magnitude)',
    documentation:
      'Length (magnitude) of a vector: `sqrt(v[0]² + v[1]²)`. Returns the distance from the origin to the point, or the "size" of a direction vector. To measure between two stored points, use `vdist`.\n\n```\n// Scale satin width proportional to distance from centre\nlet d = vlen(pos())   // distance from origin\nsatin clamp(d / 10, 0.5, 3.5)\n```',
    insertText: 'vlen(${1:vector})',
    isSnippet: true,
    params: [['vector']],
  },
  {
    label: 'vdist',
    kindName: 'function',
    detail: 'distance between two points',
    documentation:
      'Euclidean distance between two `[x, y]` points. Equivalent to `vlen(vsub(b, a))` but more readable. Use whenever you need the gap between two stored positions (e.g. decide whether to trim, check spacing, scale a motif).\n\n```\nif vdist(pos(), target) > 5 [\n  moveto target[0], target[1]\n]\n```',
    insertText: 'vdist(${1:a}, ${2:b})',
    isSnippet: true,
    params: [['a', 'b']],
  },
  {
    label: 'vnorm',
    kindName: 'function',
    detail: 'normalize to unit vector',
    documentation:
      'Returns a unit vector (length exactly 1.0) pointing in the same direction. Use it when you need a pure direction without caring about magnitude — then multiply by the length you want with `vscale`. The zero vector is a runtime error.\n\n```\n// Aim the needle toward a target, then sew 10 mm that way\nlet dir = vnorm(vsub(target, pos()))\nseth vheading(dir)\nfd 10\n```',
    insertText: 'vnorm(${1:vector})',
    isSnippet: true,
    params: [['vector']],
  },
  {
    label: 'vrot',
    kindName: 'function',
    detail: 'rotate a vector (clockwise)',
    documentation:
      "Rotate a vector clockwise by `deg` degrees. The rotation matches NeedleScript's turtle convention (clockwise positive, 0 = north). Use it to create perpendicular offsets, fan spread patterns, or to generate N evenly-rotated copies of a direction.\n\n```\n// Place 6 radial motifs evenly around the centre\nlet base = [0, 20]    // 20 mm north\nrepeat 6 [\n  let p = vrot(base, (repcount - 1) * 60)\n  moveto p[0], p[1]   fd 8   trim\n]\n```",
    insertText: 'vrot(${1:vector}, ${2:degrees})',
    isSnippet: true,
    params: [['vector', 'degrees']],
  },
  {
    label: 'vheading',
    kindName: 'function',
    detail: 'turtle heading of a vector',
    documentation:
      'Convert a 2D vector to a turtle heading in degrees (0 = north, clockwise positive). Equivalent to `atan(v[0], v[1])`. Use it with `seth` to aim the needle along a computed direction or path tangent.\n\n```\n// Aim along the tangent of a stored path segment\nlet tangent = vsub(path[i + 1], path[i])\nseth vheading(tangent)\n```',
    insertText: 'vheading(${1:vector})',
    isSnippet: true,
    params: [['vector']],
  },
  {
    label: 'vfromheading',
    kindName: 'function',
    detail: 'vector from heading + length',
    documentation:
      "Make a 2D vector of the given `length` pointing in turtle heading `deg`. The inverse of `vheading`. Use it to compute offsets in any direction relative to the needle's current path.\n\n```\n// Step 5 mm to the right of the current heading\nlet sideways = vfromheading(heading + 90, 5)\nsetpos vadd(pos(), sideways)\n```\n\n`vfromheading(heading, 1)` gives the unit forward direction vector.",
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
    documentation:
      'Total length of a polyline path in mm — the sum of all segment lengths. Use it to normalise travel along a curve (compute `t = distanceSoFar / pathlen(path)`), decide how many stitches to place, or verify a path is the expected size.\n\n```\nlet spine = trace [ fd 50  rt 30  fd 30 ]\nlet total = pathlen(spine)\nprint "spine mm:" total\n// Walk it with evenly-spaced motifs\nlet spacing = 8\nrepeat floor(total / spacing) [\n  // ... place motif at steps along the path\n]\n```',
    insertText: 'pathlen(${1:path})',
    isSnippet: true,
    params: [['path']],
  },
  {
    label: 'resample',
    kindName: 'function',
    detail: 'resample path to spacing (mm)',
    documentation:
      'New path whose consecutive vertices are each exactly `spacing` mm apart (last segment may be shorter). The bridge between math curves and physical stitch spacing — generate an arbitrary shape with `trace`/`bezier`/`catmull`, then `resample` it to stitch pitch before `sewpath`.\n\n```\nlet curve = bezier([-20,0], [-10,20], [10,-20], [20,0], 0.5)\nsewpath(resample(curve, 2))    // sew at 2 mm stitches\n```',
    insertText: 'resample(${1:path}, ${2:spacing})',
    isSnippet: true,
    params: [['path', 'spacing']],
  },
  {
    label: 'chaikin',
    kindName: 'function',
    detail: 'corner-cut smoothing',
    documentation:
      'Corner-cut smoothing: each pass replaces every sharp vertex with two new points placed 25% and 75% along the incoming and outgoing edges, rounding the bend into a smooth curve. Applying multiple iterations produces progressively rounder, more organic shapes.\n\nUse it to soften a jagged polygon or set of clicked waypoints before sewing.\n\n`iterations` 1–6 (values beyond 4 are rarely distinguishable).\n\n```\n// A rough pentagon becomes a flowing oval after 3 cuts\nlet poly = [[0,0],[20,5],[35,-8],[40,20],[15,30]]\nlet smooth = chaikin(poly, 3)\nsewpath(resample(smooth, 2))\n```',
    insertText: 'chaikin(${1:path}, ${2:iterations})',
    isSnippet: true,
    params: [['path', 'iterations']],
  },
  {
    label: 'catmull',
    kindName: 'function',
    detail: 'Catmull-Rom spline',
    documentation:
      'Smooth curve that passes exactly through every control point. Unlike Bézier curves, you do not need to supply separate handles — the spline infers the curvature from neighbouring points automatically. Resampled to `spacing` mm for sewing.\n\nGreat for animating paths through a set of waypoints or tracing an organic outline defined by hand-placed anchors.\n\n```\n// Sew a smooth curve through 4 waypoints\nlet pts = [[-20,0],[-5,20],[5,-20],[20,0]]\nsewpath(catmull(pts, 2))\n```',
    insertText: 'catmull(${1:points}, ${2:spacing})',
    isSnippet: true,
    params: [['points', 'spacing']],
  },
  {
    label: 'bezier',
    kindName: 'function',
    detail: 'cubic Bézier curve',
    documentation:
      'Cubic Bézier from start `p0` to end `p1`, shaped by control handles `c0` (near the start) and `c1` (near the end). The curve is pulled toward the handles without passing through them — the further out you place a handle, the more the curve bends in that direction. Resampled to `spacing` mm for sewing.\n\n```\nlet p0 = [-20, 0]   let c0 = [-10, 20]\nlet c1 = [10, -20]  let p1 = [20, 0]\nsewpath(bezier(p0, c0, c1, p1, 2))\n```',
    insertText: 'bezier(${1:p0}, ${2:c0}, ${3:c1}, ${4:p1}, ${5:spacing})',
    isSnippet: true,
    params: [['p0', 'c0', 'c1', 'p1', 'spacing']],
  },
  {
    label: 'centroid',
    kindName: 'function',
    detail: 'centroid of a path',
    documentation:
      'The geometric centre of a path — the average position of all its vertices. Use it to anchor rotation, find the middle of a region, or place a motif at the heart of a `voronoi` cell or scatter cluster.\n\n```\nlet cells = voronoi(scatter(8))\nfor cell in cells [\n  let c = centroid(cell)\n  moveto c[0], c[1]\n  down  arc 360 1  up  trim   // dot at cell centre\n]\n```',
    insertText: 'centroid(${1:path})',
    isSnippet: true,
    params: [['path']],
  },
  {
    label: 'bbox',
    kindName: 'function',
    detail: 'bounding box [minx, miny, maxx, maxy]',
    documentation:
      'Returns the smallest axis-aligned rectangle enclosing the path, as `[minx, miny, maxx, maxy]`. Use it to check a design\'s extents, frame a motif, compute a safe scatter region, or normalise coordinates to fit a specific area.\n\n```\nlet b = bbox(region)\nlet w = b[2] - b[0]   // width\nlet h = b[3] - b[1]   // height\nprint "size mm:" w h\n// Centre the region at the origin\nxlate(region, -(b[0] + w/2), -(b[1] + h/2))\n```',
    insertText: 'bbox(${1:path})',
    isSnippet: true,
    params: [['path']],
  },
  {
    label: 'routesort',
    kindName: 'function',
    detail: 'order points or paths by nearest travel',
    documentation:
      "Returns a new greedily routed list. `routesort(items)` anchors the first item; `routesort(items, start)` starts nearest `[x,y]`. Mode `'both'` may return reversed copies of path elements so their nearer endpoint is entered first; `'chain'` is the default. Pure, deterministic, and drawless.",
    insertText: "routesort(${1:items}, ${2:start}, '${3|chain,both|}')",
    isSnippet: true,
    params: [['items'], ['items', 'start'], ['items', 'mode'], ['items', 'start', 'mode']],
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
      'Divide the canvas into cells, one per input point. Each cell contains every location that is closer to its seed point than to any other seed. Returns a list of closed regions in input order, clipped to the sewable field (or a given region).\n\nCommon uses: organic tiling, stipple shading, cell-based fill patterns, or growing a motif inside each natural territory.\n\nMax 10,000 input points.\n\n```\nlet seeds = scatter(10)\nlet cells = voronoi(seeds)\nfor cell in cells [\n  beginfill\n    sewpath(resample(cell, 2))\n  endfill  trim\n]\n```',
    insertText: 'voronoi(${1:points})',
    isSnippet: true,
    params: [['points'], ['points', 'region']],
  },
  {
    label: 'triangulate',
    kindName: 'function',
    detail: 'Delaunay triangulation',
    documentation:
      'Delaunay triangulation: connects a set of points into triangles such that the circumcircle of each triangle contains no other point. Returns a list of 3-point regions. The "dual" of Voronoi — the same seeds that define Voronoi cells also define the triangle mesh connecting them.\n\nCommon uses: structural weaving patterns (sew along each triangle edge), mesh-based fill, or truss-like geometric motifs.\n\nMax 10,000 input points.\n\n```\nlet pts = scatter(14)\nlet tris = triangulate(pts)\nfor tri in tris [\n  up  setpos(tri[0])  down\n  sewpath(tri)\n  setpos(tri[0])  up  trim\n]\n```',
    insertText: 'triangulate(${1:points})',
    isSnippet: true,
    params: [['points']],
  },
  {
    label: 'hull',
    kindName: 'function',
    detail: 'convex hull of points',
    documentation:
      'Convex hull: the smallest convex polygon that encloses all given points, returned as a counter-clockwise region. Think of it as wrapping a rubber band around all the points — only the outermost ones form the boundary.\n\nUse it as a bounding region for scatter or fill, to outline a cluster of points, or as a clip region.\n\n```\nlet pts = scatter(5)\nlet outline = hull(pts)\nbeginfill\n  sewpath(resample(outline, 2))\nendfill  trim\n```',
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
    label: 'contourpaths',
    kindName: 'function',
    detail: 'concentric inset fill paths',
    documentation: 'Closed inset contours at half-gap then gap spacing, ordered outside-in.',
    insertText: 'contourpaths(${1:region}, ${2:gap})',
    isSnippet: true,
    params: [['region', 'gap']],
  },
  {
    label: 'spiralpath',
    kindName: 'function',
    detail: 'connected inward spiral paths',
    documentation: 'Contour rings spliced into one open inward path per disconnected fragment.',
    insertText: 'spiralpath(${1:region}, ${2:gap})',
    isSnippet: true,
    params: [['region', 'gap']],
  },
  {
    label: 'fillrows',
    kindName: 'function',
    detail: 'tatami row spines as data',
    documentation: 'Routed, unsplit tatami rows without pull compensation, ready for `fill paths`.',
    insertText: 'fillrows(${1:region}, ${2:spacing}, ${3:angle})',
    isSnippet: true,
    params: [['region', 'spacing', 'angle']],
  },
  {
    label: 'closepath',
    kindName: 'function',
    detail: 'explicitly close a ring',
    documentation: 'Return the ring with its first point repeated. Requires at least three points.',
    insertText: 'closepath(${1:ring})',
    isSnippet: true,
    params: [['ring']],
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

  // ── Field reporters (§hoop) ──────────────────────────────────────────────
  {
    label: 'infield',
    kindName: 'function',
    detail: '1 if point is inside the sewable field',
    documentation:
      '`1` if the point is inside the current sewable field, `0` otherwise. The point is mapped through the current transform (local frame → hoop space), consistent with `coverat`. Zero RNG draws.\n\n```\nif infield(pos()) [ fd 2 ]  // only sew if inside the field\n```',
    insertText: 'infield(${1:point})',
    isSnippet: true,
    params: [['point']],
  },
  {
    label: 'fieldbounds',
    kindName: 'function',
    detail: 'bounding box of the sewable field',
    documentation:
      'Returns `[minX, minY, maxX, maxY]` — the bounding box of the sewable field in hoop space (mm). Same format as `bbox()`. Zero RNG draws.\n\n```\nlet b = fieldbounds()  // e.g. [-47, -47, 47, 47] for round100\n```',
    insertText: 'fieldbounds()',
    isSnippet: false,
    params: [],
  },
  {
    label: 'fieldpath',
    kindName: 'function',
    detail: 'sewable field boundary as a CCW region',
    documentation:
      "Returns the boundary of the sewable field as a counter-clockwise polygon, ready for use as a region in `scatter`, `clippaths`, `offsetpath`, etc. Round fields are polygonised at ≤ 2 mm chords. Zero RNG draws.\n\n`offsetpath(fieldpath(), -5)` gives a 5 mm safety margin inside whatever hoop is configured.\n\n```\nhoop '5x7'\nlet margin = first(offsetpath(fieldpath(), -6))\nlet pts = scatter(5, margin)\n```",
    insertText: 'fieldpath()',
    isSnippet: false,
    params: [],
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
  {
    label: 'declumppath',
    kindName: 'function',
    detail: 'along-axis crowd relief on a path (pure, read-only)',
    documentation:
      "Run the `declump` fold over an explicit point list, reading real committed coverage history but committing nothing — the pure data twin of `declump`. Drawless.\n\nThe fold self-interacts exactly as the block form does (consecutive points see each other's moved positions), but the results are never fed to the density grid, so `coverat` is unchanged after the call.\n\n**Important:** resample to stitch pitch first, then sew:\n\n```\nsewpath(declumppath(resample(spine, 2.5), 2, 1.5))\n```\n\nArgs: `declumppath(path, limit)` or `declumppath(path, limit, maxshift)` — same units as the block form.",
    insertText: 'declumppath(${1:path}, ${2:limit})',
    isSnippet: true,
    params: [
      ['path', 'limit'],
      ['path', 'limit', 'maxshift'],
    ],
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
  {
    label: 'railinset',
    kindName: 'function',
    detail: 'rail-pair tuple: [adv, inset, inset, 0, 0]',
    documentation:
      '`railinset(advance, inset)` builds `[advance, inset, inset, 0, 0]` for a `satinbetween` shape reporter. Insets move inward from both authored rails. Pure, drawless, Library tier.',
    insertText: 'railinset(${1:advance}, ${2:inset})',
    isSnippet: true,
    params: [['advance', 'inset']],
  },
  {
    label: 'railrake',
    kindName: 'function',
    detail: 'rail-pair tuple: [adv, 0, 0, -lag, lag]',
    documentation:
      '`railrake(advance, lag)` builds `[advance, 0, 0, -lag, lag]` for a full-width raked `satinbetween` stitch. Pure, drawless, Library tier.',
    insertText: 'railrake(${1:advance}, ${2:lag})',
    isSnippet: true,
    params: [['advance', 'lag']],
  },
  {
    label: 'railspine',
    kindName: 'function',
    detail: 'derived midpoint path between two rails',
    documentation:
      'Returns the same derived midpoint path used by `satinbetween`, including orientation and deterministic closed-rail seam handling. Useful for a centre vein or manual run. Pure and drawless.',
    insertText: 'railspine(${1:railA}, ${2:railB})',
    isSnippet: true,
    params: [['railA', 'railB']],
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

export const NS_ITEM_MAP = new Map<string, NSItem>(NS_ITEMS.map((item) => [item.label, item]));
