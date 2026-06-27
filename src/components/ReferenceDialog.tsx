import { useState, useEffect, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import styles from './ReferenceDialog.module.css';
import tutorialMd from '../../needlescript-tutorial.md?raw';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog.tsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.tsx';
import { Input } from '@/components/ui/input.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { cn } from '@/lib/utils.ts';

// GitHub mark (lucide dropped brand icons, so inline the official logo path).
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

interface RefEntry {
  cmd: string;
  desc: string;
}

interface RefSection {
  title: string;
  note?: string;
  entries: RefEntry[];
}

const SECTIONS: RefSection[] = [
  {
    title: 'Basics',
    note: 'Units are mm · heading 0 = up (north), clockwise · hoop is 100 mm across, sewable field is 47 mm radius · words are case-insensitive · no statement separators — whitespace and newlines are interchangeable',
    entries: [
      {
        cmd: '// comment · # comment · ; comment',
        desc: 'rest of line ignored. A lone / still divides — only two adjacent slashes comment',
      },
      {
        cmd: 'true · false',
        desc: 'literals for 1 and 0. Truthiness: 0 is false, anything else is true. Comparisons return 1 or 0',
      },
      {
        cmd: 'seed n',
        desc: 'reseed the RNG (default 42). Same seed always reproduces the same design — change it to change the piece',
      },
    ],
  },
  {
    title: 'Movement',
    note: 'Heading 0 = up/north, clockwise. rt 90 faces east.',
    entries: [
      {
        cmd: 'fd n · bk n',
        desc: 'sew forward / back n mm; long moves auto-split at stitchlen. Aliases: forward, back, backward',
      },
      { cmd: 'rt deg · lt deg', desc: 'turn right / left by deg degrees. Aliases: right, left' },
      {
        cmd: 'arc deg radius',
        desc: 'sew along a circle of radius mm, turning deg in total — positive curves right, negative left. Works with every stitch mode (satin arcs!)',
      },
      {
        cmd: 'up · down',
        desc: 'needle up = travel as a jump · needle down = sew. Aliases: penup/pu, pendown/pd',
      },
      { cmd: 'setxy x y', desc: 'move to an absolute position' },
      { cmd: 'setx x · sety y', desc: 'move one axis at a time' },
      { cmd: 'seth deg', desc: 'set the heading absolutely. Alias: setheading' },
      { cmd: 'home', desc: 'return to (0, 0), heading 0' },
      {
        cmd: 'push · pop',
        desc: 'save / restore needle state (position, heading, pen) on a stack — jump back without sewing. Perfect for branching structures. Max 500 saved states; pop on an empty stack warns and is ignored',
      },
      {
        cmd: 'cs',
        desc: 'accepted for Logo familiarity; does nothing. Aliases: clearscreen, clear',
      },
    ],
  },
  {
    title: 'Control flow',
    entries: [
      {
        cmd: 'repeat n [ … ]',
        desc: 'loop n times; repcount is the 1-based counter of the innermost repeat',
      },
      {
        cmd: 'while cond [ … ]',
        desc: 'loop while the condition is true (non-zero). while true [ … break ] is the idiomatic search loop',
      },
      {
        cmd: 'for i = from to to [ … ]',
        desc: 'counted loop, inclusive of to; step defaults to 1. Counter does not leak after the loop. Classic: for "i from to step [ … ] (step required in classic form)',
      },
      {
        cmd: 'for i = from to to step s [ … ]',
        desc: 'counted loop with explicit (possibly negative) step: for i = 10 to 1 step -2 [ … ]',
      },
      {
        cmd: 'for x in xs [ … ]',
        desc: 'iterate elements of a list; the loop variable does not leak after the loop. Length is captured at loop entry, elements read live',
      },
      {
        cmd: 'break · continue',
        desc: 'end the innermost loop immediately / skip to its next iteration. Lexical — a break inside a helper procedure cannot end a loop in its caller; use return there instead',
      },
      {
        cmd: 'if cond [ … ] else if c2 [ … ] else [ … ]',
        desc: 'conditional. Compare with < > = == <= >= !=, combine with and or not (!). Chains of alternatives at any depth',
      },
    ],
  },
  {
    title: 'Procedures',
    note: 'Two dialects mix freely. Modern: def leaf(size) [ … ] · Classic Logo: to leaf :size … end. Procedures may be called before they are defined (signatures are pre-scanned).',
    entries: [
      {
        cmd: 'def name(a, b) [ … ]',
        desc: 'define a procedure with parameters. Classic: to name :a :b … end. Parameters are local, readable as plain names (size) or classic style (:size)',
      },
      {
        cmd: 'return expr · return',
        desc: 'return a value from a procedure (use as: fd double(5)) / leave early. Classic: output expr / exit (alias: op). return and output are only valid inside a procedure',
      },
      {
        cmd: 'f(a, b) · f a b',
        desc: 'call with glued parens (f(x)) or classic prefix (f x). Glued ( = argument list, spaced ( = Logo grouping — one space is the entire rule. Trailing commas allowed. Styles mix freely',
      },
      {
        cmd: 'recursion',
        desc: 'procedures can recurse; depth limit is 200 calls. Example: def fact(n) [ if n < 2 [ return 1 ] return n * fact(n - 1) ]',
      },
    ],
  },
  {
    title: 'Variables',
    entries: [
      {
        cmd: 'let x = expr',
        desc: 'declare a variable: global at the top level, local inside a procedure. let of a name already declared in the same scope is a parse error',
      },
      {
        cmd: 'x = expr',
        desc: 'assign: updates a local if one is in scope, otherwise writes a global. Plain assignment without let is allowed (Logo make semantics — friendly for one-liners)',
      },
      {
        cmd: 'x += e · x -= e · x *= e · x /= e',
        desc: 'compound assignment: x += 2 is x = x + 2',
      },
      {
        cmd: 'make "x expr',
        desc: 'classic spelling of assignment — same store, same rules as x = expr',
      },
      {
        cmd: 'local "x expr',
        desc: 'classic spelling of an in-procedure let. Illegal at the top level — use let or make there',
      },
      {
        cmd: 'fd x · fd :x',
        desc: 'read a variable: plain name or classic : prefix — both resolve identically',
      },
    ],
  },
  {
    title: 'Expressions & operators',
    note: 'Operator precedence (loosest to tightest): or → and → comparisons → + - → * / % → unary - / prefix functions → atoms. and/or short-circuit.',
    entries: [
      {
        cmd: '+ - * / %',
        desc: '% is floor modulo (same as mod) — -7 % 3 is 2, not -1 as in C/JS. The result takes the sign of the divisor',
      },
      {
        cmd: '< > = == <= >= !=',
        desc: 'comparisons return 1/0. = and == are the same operator (1e-9 tolerance for floats). Lists compare deeply with =',
      },
      {
        cmd: 'and · or · not · !',
        desc: 'logical operators. and/or short-circuit: i > 0 and 10/i > 2 is safe. not and ! are prefix, bind tightly — write !(a = 1) when negating a comparison',
      },
      {
        cmd: '( expr )',
        desc: 'Logo grouping (spaced from name). Guards: seth ( noise2 xcor/16 ycor/16 ) * 720. A ( glued to a name means call parens instead',
      },
    ],
  },
  {
    title: 'Math functions',
    entries: [
      { cmd: 'random n', desc: 'seeded random number in 0…n — reproducible, driven by seed' },
      {
        cmd: 'noise x · noise2 x y',
        desc: 'smooth seeded value noise in 0…1. Sample slowly (divide coordinates by 10–20) for organic drift; same seed → same field',
      },
      { cmd: 'sin deg · cos deg', desc: 'trigonometry in degrees' },
      {
        cmd: 'sqrt n · abs n · round n · floor n · ceil n',
        desc: 'the usual suspects (sqrt of a negative is an error)',
      },
      {
        cmd: 'min a b · max a b · pow a b',
        desc: 'minimum, maximum, power (non-finite pow result is an error)',
      },
      {
        cmd: 'mod a b',
        desc: 'floor modulo — always returns a value with the sign of b. The % operator is the same operation',
      },
      {
        cmd: 'atan x y',
        desc: 'heading of the vector (x, y): 0 = north, clockwise — atan 1 0 is 90',
      },
      {
        cmd: 'towards x y',
        desc: 'heading from the needle to the point (x, y) — seth towards 0 0 aims home',
      },
      { cmd: 'distance x y', desc: 'distance from the needle to the point (x, y)' },
      {
        cmd: 'xcor · ycor · heading · repcount',
        desc: 'reporters (no arguments): needle x/y position, heading in degrees, 1-based counter of the innermost repeat',
      },
    ],
  },
  {
    title: 'Lists',
    note: 'A second value type alongside numbers: ordered, nestable lists. Reference semantics — assignment shares the list; mutate through any alias and every alias sees it. Use copy(xs) for an independent deep copy. All list functions are call-syntax only: len(xs), never len xs.',
    entries: [
      {
        cmd: '[1, 2, 3] · []',
        desc: 'list literal; nesting and trailing commas allowed. Indexing is 0-based; negatives count from the end: xs[-1] is the last element',
      },
      {
        cmd: 'xs[i] · xs[i] = v',
        desc: 'index read / write. xs[i] += -= *= /= also work. Non-integer or out-of-range index is a runtime error',
      },
      {
        cmd: '[x, y] = pos()',
        desc: 'destructuring: assigns list elements to multiple variables in one step (fixed arity, flat)',
      },
      {
        cmd: 'range(n) · range(a, b) · range(a, b, s)',
        desc: 'new list [0…n-1] / [a…b-1] / stepped — 0-based, end-exclusive, like Python',
      },
      { cmd: 'filled(n, v)', desc: 'new list of n deep copies of v' },
      { cmd: 'len(xs) · islist(v)', desc: 'element count · 1/0 type check' },
      { cmd: 'first(xs) · last(xs)', desc: 'xs[0] · xs[-1] (the Logo heritage names)' },
      {
        cmd: 'append(xs, v) · prepend(xs, v)',
        desc: 'mutates: adds v at the end / front (use as a statement)',
      },
      { cmd: 'insertat(xs, i, v)', desc: 'mutates: inserts v at index i (0 through len allowed)' },
      { cmd: 'removeat(xs, i)', desc: 'mutates: removes index i and returns the removed value' },
      { cmd: 'concat(a, b)', desc: 'new list (shallow — elements are shared references)' },
      {
        cmd: 'slice(xs, a) · slice(xs, a, b)',
        desc: 'new list, Python semantics including negative bounds, clamped',
      },
      {
        cmd: 'reverse(xs) · sort(xs)',
        desc: 'new lists (pure — they compose in expressions); sort is numbers-only, ascending, stable',
      },
      { cmd: 'copy(xs)', desc: 'deep copy — independent of the original' },
      {
        cmd: 'indexof(xs, v) · contains(xs, v)',
        desc: 'first index of v (deep tolerant compare) or -1 · 1/0',
      },
      {
        cmd: 'sum(xs) · mean(xs) · minof(xs) · maxof(xs)',
        desc: 'aggregates, numbers only; sum([]) is 0, the rest error on an empty list',
      },
      { cmd: 'pick(xs)', desc: 'random element — seeded, exactly one RNG draw' },
      {
        cmd: 'shuffle(xs)',
        desc: 'new shuffled list — seeded, forks a child RNG so same seed gives same order, forever',
      },
      {
        cmd: 'pos() · setpos(p)',
        desc: 'needle position as [xcor, ycor] · command: like setxy p[0] p[1]. Symmetric pair: append(path, pos()) … setpos(p)',
      },
    ],
  },
  {
    title: 'Thread & stitch quality',
    entries: [
      {
        cmd: 'stitchlen mm',
        desc: 'running-stitch length, clamped 0.4–12 mm (default 2.5). Alias: stitchlength',
      },
      {
        cmd: 'satin mm',
        desc: "zigzag column of this width; penetration spacing set by density. satin 0 returns to running stitch. Widths over ~8 mm tend to snag (you'll get a warning)",
      },
      {
        cmd: 'satin @fn',
        desc: 'programmable column: a shape reporter def fn(t, s, i, u) you write, queried once per stitch pair, returns [advance, leftw, rightw, leftlag, rightlag] (mm). Independent rail lags rake stitches into self-crossing woven satin; advance must be > 0. satin 4 ≡ satin @[0.4,2,2,0,0]. Composes with transforms/warp; sits upstream of pullcomp/underlay/density',
      },
      {
        cmd: 'density mm',
        desc: 'satin penetration spacing, 0.25–5 mm (default 0.4). Ignored while a satin @fn reporter is engaged — its advance return controls spacing',
      },
      {
        cmd: 'bean n',
        desc: 'bold line: each stitch sewn n times (forced odd, max 9). bean 1 off',
      },
      {
        cmd: 'estitch mm',
        desc: 'blanket stitch: prongs of this length on the left of travel, spaced by stitchlen. estitch 0 off',
      },
      { cmd: 'color n', desc: 'switch to thread n (emits a DST colour-change stop)' },
      {
        cmd: 'stop',
        desc: 'shorthand for "next colour" — equivalent to incrementing the thread number',
      },
      {
        cmd: 'trim',
        desc: 'cut the thread here (long travels also get one automatically — see autotrim)',
      },
      {
        cmd: 'lock mm',
        desc: 'tie-in/tie-off: 4 micro back-stitches sewn automatically wherever thread starts/ends (design start/end, colour changes, trims, jumps ≥ 4 mm). Size 0.3–1.5 mm (default 0.7); lock 0 off',
      },
    ],
  },
  {
    title: 'Fills',
    note: 'Moves between beginfill and endfill trace a boundary rather than sewing. Inner rings (started with a pen-up move) become holes by the even-odd rule.',
    entries: [
      {
        cmd: 'beginfill … endfill',
        desc: 'trace a boundary; endfill sews a tatami fill of the enclosed area. A pen-up move (up … down) starts a new ring — inner rings become holes (even-odd)',
      },
      { cmd: 'fillangle deg', desc: 'direction of the fill rows (default 0)' },
      { cmd: 'fillspacing mm', desc: 'row spacing, 0.25–5 mm (default 0.4)' },
      {
        cmd: 'filllen mm',
        desc: "fill stitch length, 1–7 mm; by default follows stitchlen. Set filllen to override, filllen 0 to follow stitchlen again. Rows are brick-offset so penetrations don't line up",
      },
      {
        cmd: 'fill dir @field',
        desc: 'programmable directional fill: a reporter def field(p) [ return heading ] gives a turtle heading (0 = north) at local point p. The engine integrates evenly-spaced streamlines (Jobard–Lefer) and lays one fill row along each — contour / grain / flow fills that curve with the work. Arms the next beginfill … endfill',
      },
      {
        cmd: 'fill shape @texture · fill @name',
        desc: 'shape: def texture(p, row, v) [ return [spacing, len, phase] ] sets per-row spacing (>0), stitch length (1–7) and brick phase (0..1). fill dir @d shape @s uses both channels; fill @name is shorthand for the direction field. fill @fn IS the generator (upstream of pullcomp/underlay/density); a constant field reduces byte-identically to plain tatami',
      },
    ],
  },
  {
    title: 'Generative math — scalars & noise',
    note: 'All generative-math functions are call-syntax only. Conventions: a point is [x, y], a path is a list of points, a region is a closed path (closing segment implicit).',
    entries: [
      { cmd: 'lerp(a, b, t)', desc: 'a + (b−a)·t, t unclamped' },
      { cmd: 'remap(v, inlo, inhi, outlo, outhi)', desc: 'linear remap, unclamped' },
      { cmd: 'clamp(v, lo, hi)', desc: 'min(hi, max(lo, v))' },
      { cmd: 'smoothstep(e0, e1, x)', desc: 'Hermite ease 0…1' },
      { cmd: 'gauss(mu, sigma)', desc: 'seeded normal distribution (Box-Muller, exactly 2 draws)' },
      {
        cmd: 'snoise2(x, y) · snoise3(x, y, z)',
        desc: 'seeded simplex noise in -1…1 (industry convention). Legacy noise/noise2 keep 0…1. The z axis is for variation: snoise3(x/14, y/14, motif*50) gives each motif its own field',
      },
      {
        cmd: 'fbm2(x, y, octaves)',
        desc: 'fractal sum of snoise2: lacunarity 2.0, gain 0.5, octaves 1–8 (clamped), normalised to ≈-1…1',
      },
    ],
  },
  {
    title: 'Generative math — vectors',
    note: 'Everything heading-like uses turtle degrees (0 = north, clockwise positive) — matching seth, atan, towards. No operator broadcasting: [1,2] + [3,4] is an error; use vadd.',
    entries: [
      { cmd: 'vadd(a, b) · vsub(a, b)', desc: 'new point: element-wise addition / subtraction' },
      { cmd: 'vscale(a, s) · vlerp(a, b, t)', desc: 'new point: scale / lerp' },
      {
        cmd: 'vdot(a, b) · vlen(a) · vdist(a, b)',
        desc: 'dot product · length · distance between two points',
      },
      {
        cmd: 'vnorm(a)',
        desc: 'unit vector. The zero vector is an error (a silent default heading is a stealth bug)',
      },
      { cmd: 'vrot(a, deg)', desc: 'rotated clockwise for positive deg — matches rt' },
      { cmd: 'vheading(a)', desc: 'turtle heading of the vector (equivalent to atan a[0] a[1])' },
      {
        cmd: 'vfromheading(deg, len)',
        desc: "inverse: make a vector from heading + length. vfromheading(heading, 1) is the needle's direction",
      },
    ],
  },
  {
    title: 'Generative math — paths & curves',
    entries: [
      { cmd: 'pathlen(path)', desc: 'total polyline length in mm' },
      {
        cmd: 'resample(path, mm)',
        desc: 'new path whose segments are each exactly mm long (last may be shorter); first and last points preserved. The bridge between math curves and physical stitch spacing',
      },
      { cmd: 'chaikin(path, n)', desc: 'corner-cut smoothing, n iterations 1–6' },
      {
        cmd: 'catmull(points, mm)',
        desc: 'Catmull-Rom spline through the control points, resampled at mm spacing',
      },
      { cmd: 'bezier(p0, c0, c1, p1, mm)', desc: 'cubic Bézier, resampled at mm spacing' },
      {
        cmd: 'centroid(path) · bbox(path)',
        desc: 'centre point · bounding box as [minx, miny, maxx, maxy]',
      },
      {
        cmd: 'sewpath(path)',
        desc: 'command: exactly for p in path [ setpos(p) ] — pen state, stitch mode, satin, and auto-split all apply as if hand-walked',
      },
    ],
  },
  {
    title: 'Generative math — generators & geometry',
    note: 'Outputs compose: scatter → voronoi → offsetpath → resample → sewpath. All generators are seeded: same seed, same output.',
    entries: [
      {
        cmd: 'scatter(mindist) · scatter(mindist, region)',
        desc: 'seeded Poisson-disc (Bridson) points over the 47 mm field, or inside a region polygon. Capped at 20,000 points',
      },
      {
        cmd: 'voronoi(pts) · voronoi(pts, region)',
        desc: 'one cell (region) per input point, in input order, clipped to the sewable field or a given region. Max 10,000 input points',
      },
      {
        cmd: 'triangulate(pts)',
        desc: 'Delaunay triangles: list of 3-point regions. Max 10,000 input points',
      },
      { cmd: 'hull(pts)', desc: 'convex hull as a region (counter-clockwise winding)' },
      {
        cmd: 'relax(pts, n)',
        desc: "n rounds of Lloyd's relaxation — moves each point to its Voronoi cell's centroid for even stippling",
      },
      {
        cmd: 'offsetpath(region, mm)',
        desc: 'inflate (+) or shrink (−) a region; returns a list of regions. Shrinking may split a shape or erase it entirely (empty list — loops over it skip naturally)',
      },
      {
        cmd: 'clippaths(a, b, "op)',
        desc: 'boolean of two regions: "union "intersect "difference "xor; returns a list of regions. Backed by Clipper2 at µm precision',
      },
      {
        cmd: 'inpath(p, region)',
        desc: '1 if the point is inside the region (even-odd rule, consistent with fills)',
      },
    ],
  },
  {
    title: 'Transforms',
    note: "Block-scoped transform stack (a CTM, like OpenSCAD): a transform takes its args then a [ … ] block, maps everything the block draws, and restores the previous frame. Core built-ins — can't be redefined. The turtle stays in untransformed local space (xcor/ycor/pos() report pre-transform); only emitted stitches are mapped, and stitch length / satin width / pullcomp are evaluated in hoop space after the transform, so previews stay physical.",
    entries: [
      { cmd: 'translate dx dy [ … ]', desc: 'shift the block by (dx, dy) mm' },
      {
        cmd: 'rotate deg [ … ]',
        desc: 'rotate the block deg clockwise about the current origin (0 = north, like seth/rt)',
      },
      { cmd: 'rotateabout deg cx cy [ … ]', desc: 'rotate about an explicit pivot (cx, cy)' },
      {
        cmd: 'scale s [ … ]',
        desc: 'uniform scale. scale 3 [ fd 30 ] sews more stitches at physical spacing, not three stretched ones — the path is transformed, then stitched',
      },
      {
        cmd: 'scalexy sx sy [ … ]',
        desc: 'independent axis scale; satin width transforms per-segment, perpendicular to local travel',
      },
      {
        cmd: 'mirror deg [ … ]',
        desc: 'reflect across a line through the origin at heading deg (mirror 0 flips left/right, mirror 90 top/bottom)',
      },
      { cmd: 'skew ax ay [ … ]', desc: 'shear by ax / ay degrees' },
      {
        cmd: 'transform a b c d e f [ … ]',
        desc: 'raw 2×3 affine escape hatch: (x, y) → (a·x + c·y + e, b·x + d·y + f)',
      },
      {
        cmd: 'xlate · xrotate · xscale · xmirror',
        desc: 'pure-function twins that map a point list (call-syntax only, return new lists): xlate(path, dx, dy), xrotate(path, deg[, cx, cy]), xscale(path, s | sx, sy), xmirror(path, deg). translate dx dy [ block ] ≡ running block with every emitted point passed through xlate — same matrix library, identical stitches',
      },
    ],
  },
  {
    title: 'Effects',
    note: "Transforms with an arbitrary per-point function instead of an affine matrix. Same block-scoped stack; nest freely with transforms. @name is a procedure reference — the one new value kind effects introduce — consumed by warp/warppath and satin. warp maps path vertices before stitch-split; humanize/snaptogrid perturb final penetrations after split and deliberately skip satin columns. All Core — can't be redefined.",
    entries: [
      {
        cmd: 'warp @fn [ … ]',
        desc: 'shader: apply a reporter def fn(p) [ return [x,y] ] to every emitted point — fisheye, ripple, twist, domain-warp. Runs before stitch-split, so the deformed curve still splits into clean physical stitches. Hoop-overflow / density / long-stitch checks run on the post-warp geometry; draws nothing from the RNG unless the reporter does',
      },
      {
        cmd: 'humanize amount [ … ]',
        desc: 'hand-made imperfection: offset each penetration by amount mm (0–2) using slowly-sampled seeded snoise2 — coherent wander, not white-noise damage. Seeded; forks exactly one draw from the main stream, so dropping it in shifts downstream by one draw, not by stitch count',
      },
      {
        cmd: 'snaptogrid cell [ … ]',
        desc: 'quantize each penetration to a square lattice of pitch cell — cross-stitch / pixel aesthetic. Pure and drawless (no RNG, so determinism ignores the seed)',
      },
      {
        cmd: 'snaptogrid cellx celly [ ox oy [ ang ] ] [ … ]',
        desc: 'rectangular / origin-offset / rotated (ang turtle deg) lattice. Frame-invariant: the grid lives in fixed hoop space, never mapped by an enclosing transform — stamped motifs register on one shared lattice',
      },
      {
        cmd: 'warppath · humanizepath · snappath',
        desc: 'pure-function twins mapping a point list: warppath(path, @fn), humanizepath(path, amount) (forks, like the block), snappath(path, cell …) (same arity overloads). The block form is exactly the path form applied to emitted points',
      },
    ],
  },
  {
    title: 'Fabric & professional quality',
    note: 'Without these commands, programs sew exactly as written. Fabric presets are the quickest route — explicit commands afterwards override the preset.',
    entries: [
      { cmd: 'fabric "woven', desc: 'baseline preset: pull comp 0.2 mm, density limit 3.5 layers' },
      {
        cmd: 'fabric "knit',
        desc: 'pull comp 0.5 mm, density limit 3.0 layers, satin density floored at 0.45 mm',
      },
      {
        cmd: 'fabric "stretch',
        desc: 'pull comp 0.6 mm, density limit 2.8 layers, satin density floored at 0.5 mm',
      },
      {
        cmd: 'fabric "denim · "canvas',
        desc: 'pull comp 0.15 mm, density limit 4.0 layers — stable, tolerates dense stitching',
      },
      {
        cmd: 'fabric "fleece',
        desc: 'pull comp 0.3 mm, density limit 2.6 layers, doubled underlay — suggests a topping',
      },
      {
        cmd: 'pullcomp mm',
        desc: 'pull compensation 0–1.5 mm: thread tension shrinks stitching — widens satin columns and extends fill rows so shapes sew out at their digitized size',
      },
      {
        cmd: 'underlay "auto · "center · "edge · "zigzag · "off',
        desc: 'stabilising stitches under each satin column. auto picks by width: <1.5 mm none, <4 mm center, wider zigzag. Shown thinner in the preview',
      },
      {
        cmd: 'fillunderlay "auto · "tatami · "edge · "off',
        desc: 'underlay beneath fills: sparse cross-grain tatami pass and/or inset edge run. auto = tatami, plus edge run on areas over 100 mm²',
      },
      {
        cmd: 'shortstitch 0/1',
        desc: 'curve physics (on by default): on tight satin curves alternate inner stitches are automatically shortened to 60% width to prevent thread breaks and fabric damage',
      },
      {
        cmd: 'autotrim mm',
        desc: "auto trim before travels ≥ n mm (default 7, configurable 3–30) so connector threads don't snag. autotrim 0 off. Trim is never inserted when nothing has been sewn since the last cut",
      },
      {
        cmd: 'maxdensity n',
        desc: 'thread-coverage warning threshold in layers (default 3.5). Past ~2.5–3.5 layers embroidery stops being fabric: needles deflect, thread breaks, patch puckers. See the density heatmap toggle on the stage. maxdensity 0 silences warnings',
      },
    ],
  },
  {
    title: 'Stitch history',
    note: "Read the coverage grid back mid-program so a design can respond to what's already sewn — adaptive density, stippling toward a target, avoidance, growth. Pure reporters (glued-call only, shadowable): they draw nothing from the RNG and emit nothing, so branching on them stays deterministic. They see committed penetrations in sewing order (a buffered satin column isn't visible until it flushes; tie-off locks excluded, so numbers match the heatmap). Query points are local-frame, mapped through the current transform; returned points are hoop-space.",
    entries: [
      {
        cmd: 'coverat(p) · coverat(p, r)',
        desc: 'coverage at p in layers (the heatmap unit) — at the point, or averaged over radius r mm. O(1) cell lookup',
      },
      { cmd: 'countat(p)', desc: 'penetration count in the 1 mm cell at p' },
      { cmd: 'nearestsewn(p)', desc: 'the closest prior penetration as [x, y], or [] if none yet' },
      {
        cmd: 'sewnwithin(p, r)',
        desc: 'list of prior penetrations within r mm of p — grid-bucketed, O(local), never scans the whole history',
      },
      {
        cmd: 'stitchedpoints()',
        desc: 'a deep-copied snapshot of every penetration so far, as a path',
      },
    ],
  },
  {
    title: 'Debugging',
    entries: [
      {
        cmd: 'print expr · print "label expr',
        desc: 'log a value to the console, optionally with a label: print "radius r → radius: 1.5. Lists print as [1, 2, 3], capped at 64 elements',
      },
      {
        cmd: 'mark',
        desc: 'drop a numbered pin on the preview at the needle position. Pins appear as playback reaches them. Never exported to the machine or counted in stats',
      },
      {
        cmd: 'assert cond',
        desc: 'stop with an error (and line number) if the condition is false. Great for geometric invariants: assert (distance 0 0) < 47',
      },
      {
        cmd: 'playback scrubber',
        desc: 'scrub or play the stitch sequence. The source line being sewn is highlighted in red in the editor and shown in the playback bar counter',
      },
      {
        cmd: 'did-you-mean',
        desc: 'typos in commands, variables, and procedure names get a closest-match suggestion across every namespace, labelled by kind: Unknown command "stichlen" — did you mean "stitchlen"?',
      },
    ],
  },
  {
    title: 'SVG import',
    entries: [
      {
        cmd: 'Import SVG button · drag & drop',
        desc: 'converts an SVG into editable NeedleScript code. Filled shapes → beginfill blocks (subpaths → holes), strokes → outlines, shapes with both get a procedure for fill then border. Colours map to nearest thread',
      },
      {
        cmd: 'supported elements',
        desc: '<path> (M L H V C S Q T A Z), rect, circle, ellipse, line, polyline/polygon, groups and transforms. Text, images, and gradients are skipped',
      },
      {
        cmd: 'fit __ mm',
        desc: 'scale the imported SVG to fit within this many millimetres before converting. Adjustable in the toolbar (10–190 mm)',
      },
    ],
  },
  {
    title: 'Customizer — parameters & presets',
    note: 'Comment annotations expose variable declarations as live controls in the Parameters panel. The interpreter never sees them — a program with sliders is still an ordinary program. All three declaration styles work: let name = val, make "name val, or bare name = val.',
    entries: [
      {
        cmd: 'let x = 15  // [5:50]',
        desc: 'integer slider — both bounds are whole numbers and the range spans > 1. Value is clamped to [min, max] live',
      },
      {
        cmd: 'let x = 0.5  // [0:1]',
        desc: 'smooth slider — at least one float bound, or range ≤ 1. 100 steps between min and max',
      },
      {
        cmd: 'let x = 4  // [0.5:0.5:8]',
        desc: 'stepped slider: [min:step:max]. Any positive step, including fractional',
      },
      { cmd: 'let x = 1  // [switch]', desc: 'toggle: 0 = off, 1 = on' },
      {
        cmd: 'let x = 0  // [switch:off,on]',
        desc: 'labelled toggle — custom labels shown on each side of the switch',
      },
      {
        cmd: '// --- Section ---',
        desc: 'section divider between parameter groups. Any number of dashes; the text between them is the section label',
      },
      {
        cmd: 'shuffle button',
        desc: 'randomises all unlocked parameters at once. The lock icon on each row (visible on row hover, gold when active) pins that parameter so randomize skips it',
      },
      {
        cmd: '// @preset Name : k=v, k=v, …',
        desc: "named snapshot of parameter values. @snapshot is an accepted alias. Partial presets (fewer keys than total params) set only the named parameters and leave the rest unchanged. Values are clamped and snapped to each param's range",
      },
      {
        cmd: 'preset dropdown',
        desc: 'appears below the panel header when at least one @preset line exists. Selecting a preset applies all its values at once, overriding locks. Moving any slider afterwards resets the dropdown to — (custom state)',
      },
      {
        cmd: 'copy button · right-click header',
        desc: 'copies the current parameter values as a // @preset My Preset : … comment to the clipboard, ready to paste into source. Right-click the panel header works even before any presets are defined',
      },
    ],
  },
  {
    title: 'Safety limits',
    note: 'NeedleScript guards both your browser and your machine. Exceeding a limit stops the program with an error and a line number.',
    entries: [
      { cmd: 'max stitches', desc: '60,000 per design' },
      {
        cmd: 'max interpreter operations',
        desc: '2,000,000 — catches infinite while loops and unbounded recursion; list reads and writes count too',
      },
      { cmd: 'max call depth', desc: '200 nested procedure calls' },
      { cmd: 'max loop iterations', desc: '200,000 per repeat or for loop' },
      { cmd: 'max list length', desc: '100,000 elements per list' },
      { cmd: 'max live list cells', desc: '1,000,000 total across all lists at once' },
      { cmd: 'max list nesting depth', desc: '16 levels' },
      { cmd: 'max scatter output', desc: '20,000 points' },
      { cmd: 'max generator input', desc: '10,000 points for voronoi, triangulate, hull, relax' },
      { cmd: 'max geometry input', desc: '50,000 vertices per offsetpath / clippaths call' },
      {
        cmd: 'stitch length',
        desc: 'clamped to 0.4–12 mm. Sub-0.4 mm moves are merged into neighbours (too short to sew safely), with a warning',
      },
    ],
  },
];

// ── Glossary ──────────────────────────────────────────────────────────────────

interface GlossTerm {
  term: string;
  def: string;
}

interface GlossSection {
  title: string;
  intro?: string;
  terms: GlossTerm[];
}

const GLOSSARY_LEAD =
  'NeedleScript sits where two crafts meet: machine embroidery and generative programming. ' +
  'This glossary explains both vocabularies. If you arrive as a programmer, the embroidery sections tell you ' +
  'what the machine is physically doing to thread and fabric — and why a command like satin or pullcomp exists. ' +
  'If you arrive as an embroiderer, the math sections show how a handful of small rules (noise, vectors, random ' +
  'seeds) compound into designs that look hand-made yet stay perfectly reproducible. Generative design works ' +
  'precisely because it is deterministic: the same seed always sews the same piece, so randomness becomes a ' +
  'material you can shape rather than an accident you tolerate.';

const GLOSSARY: GlossSection[] = [
  {
    title: 'Stitches & thread',
    intro:
      'The atoms of embroidery. Every NeedleScript program ultimately reduces to needle penetrations joined by thread — these terms name the patterns those penetrations make.',
    terms: [
      {
        term: 'Stitch',
        def: 'One needle penetration to the next. The thread pulled between two consecutive needle-down points. Length matters: too long and the thread snags or floats above the fabric, too short and the needle perforates the cloth like a stamp.',
      },
      {
        term: 'Penetration',
        def: 'A single point where the needle pierces the fabric. Embroidery is really a sequence of penetrations; everything else (length, density, coverage) is a way of describing how they are spaced. The density heatmap counts penetrations per area.',
      },
      {
        term: 'Running stitch',
        def: 'The simplest stitch: a straight line of evenly spaced penetrations, one after another — like hand sewing. The default mode of the NeedleScript turtle; stitchlen sets the spacing.',
      },
      {
        term: 'Satin / satin column',
        def: 'A dense zigzag that lays thread back and forth across a narrow shape, giving a smooth, glossy, raised surface — used for lettering, outlines and borders. The two edges are called rails and the path you steer is the spine or centre-line.',
      },
      {
        term: 'Bean stitch',
        def: 'A bold running stitch where each segment is sewn several times (back and forth) so the line reads heavier and darker without changing colour. NeedleScript: bean n.',
      },
      {
        term: 'Blanket stitch',
        def: 'A decorative edging stitch with little perpendicular "prongs" along one side of the travel — traditionally used to finish the edge of a blanket. NeedleScript: estitch.',
      },
      {
        term: 'Jump / travel',
        def: 'Moving the needle without sewing (pen up). The machine carries the thread across a gap; if the gap is long the loose thread (a connector thread) must be trimmed so it does not snag.',
      },
      {
        term: 'Trim',
        def: 'Cutting the thread mid-design — either deliberately (trim) or automatically before a long jump (autotrim) — so no loose strand bridges two areas.',
      },
      {
        term: 'Tie-in / tie-off (lock)',
        def: 'A cluster of tiny back-stitches sewn wherever thread starts or ends, anchoring it so the embroidery cannot unravel. NeedleScript adds these automatically (lock) at design start/end, colour changes and trims.',
      },
      {
        term: 'Colour change / stop',
        def: 'A pause in the stitch file telling the machine operator to swap thread to the next colour. NeedleScript emits one with color n; stop advances to the next thread.',
      },
      {
        term: 'Thread palette',
        def: 'The ordered set of thread colours a design uses. Thread "number" refers to a slot in that palette, not a physical spool brand.',
      },
    ],
  },
  {
    title: 'Fills & coverage',
    intro:
      'How an area — rather than a line — gets covered in thread, and how much thread is too much.',
    terms: [
      {
        term: 'Fill',
        def: 'Stitching that covers an enclosed region rather than tracing a line. NeedleScript builds a fill between beginfill and endfill.',
      },
      {
        term: 'Tatami fill',
        def: 'The standard fill: long parallel rows of running stitch that march across a shape, with penetrations brick-offset row to row so the needle holes never line up into a visible seam. Named for the woven look of tatami mats.',
      },
      {
        term: 'Fill angle',
        def: 'The direction the fill rows run. Rotating it changes how light catches the thread, which reads as a different shade even in one colour.',
      },
      {
        term: 'Fill spacing / density',
        def: 'The gap between fill rows (or between satin penetrations). Tighter spacing means more thread, richer colour and more coverage — but past a point the fabric cannot absorb it.',
      },
      {
        term: 'Directional / contour fill',
        def: 'A fill whose rows follow a field of headings instead of straight parallel lines, so the grain of the stitching curves with the shape — like brush strokes following a form. NeedleScript: fill dir @field.',
      },
      {
        term: 'Coverage',
        def: 'How completely thread hides the fabric beneath, measured in layers — 1 layer means the area is covered once. Generative programs can read coverage back mid-design (coverat) to adapt.',
      },
      {
        term: 'Density (layers)',
        def: 'Thread stacked per unit area. Around 2.5–3.5 layers embroidery stops behaving like fabric: needles deflect, thread breaks and the patch puckers. maxdensity warns before you cross that line.',
      },
      {
        term: 'Even-odd rule',
        def: 'The rule that decides what counts as "inside" a shape with holes: a point is inside if a ray from it crosses the boundary an odd number of times. It is why an inner ring inside a fill becomes a hole rather than more fill.',
      },
    ],
  },
  {
    title: 'Stabilization & finishing',
    intro:
      'Real thread under tension distorts fabric. These terms cover the craft of making a design sew out at the size and quality you designed.',
    terms: [
      {
        term: 'Underlay',
        def: 'Light stitches laid down first, beneath the visible stitching, to stabilise the fabric and give the top layer something to grip — so satin and fills sit crisp instead of sinking into the cloth.',
      },
      {
        term: 'Pull compensation',
        def: 'Thread tension pulls fabric inward as it sews, so a column comes out narrower than drawn. Pull comp deliberately oversizes shapes (widens satin, extends fill rows) so the finished stitching lands at its true digitized size. NeedleScript: pullcomp.',
      },
      {
        term: 'Push / pull distortion',
        def: 'The fabric movement caused by stitching: thread pulls a shape narrower along the stitch direction and pushes it longer across it. Underlay and pull compensation exist to counter this.',
      },
      {
        term: 'Short stitch',
        def: 'On a tight curve, the inner edge of a satin column would crowd into one spot and break the needle or shred the fabric. Short-stitching automatically shortens alternate inner stitches to relieve that crowding.',
      },
      {
        term: 'Puckering',
        def: 'The wrinkling of fabric when too much thread is packed in too tightly. The visible failure mode that density limits and underlay are designed to prevent.',
      },
      {
        term: 'Digitizing',
        def: 'The craft of turning artwork into machine stitches — choosing stitch types, angles, density, underlay and order. NeedleScript is a programmable form of digitizing.',
      },
    ],
  },
  {
    title: 'Fabric, hoop & machine',
    intro: 'The physical stage the turtle performs on.',
    terms: [
      {
        term: 'Hoop',
        def: "The ring that clamps fabric taut under the needle. It defines the machine's reachable area. NeedleScript models a 100 mm hoop with a 47 mm-radius sewable field.",
      },
      {
        term: 'Sewable field',
        def: 'The usable area inside the hoop where the needle can actually reach. Stitches outside it trigger a hoop-overflow warning.',
      },
      {
        term: 'Woven / knit / stretch',
        def: 'Fabric families. Woven cloth (denim, canvas) is stable and tolerates dense stitching; knits and stretch fabrics move under the needle and need gentler density and more pull compensation. fabric presets bundle the right defaults.',
      },
      {
        term: 'Backing / topping',
        def: 'Stabiliser added to the fabric: backing behind it for support, topping on top of fluffy fabrics (like fleece) so stitches do not sink in.',
      },
      {
        term: 'Needle up / down',
        def: 'Whether the needle is sewing (down, pen down) or merely travelling (up, pen up). The single most important state of the turtle, since it decides whether motion lays thread.',
      },
    ],
  },
  {
    title: 'Stitch files & export',
    intro: 'How a finished design leaves NeedleScript and reaches a machine.',
    terms: [
      {
        term: 'Tajima DST',
        def: 'The most common embroidery stitch-file format. It stores the design as a list of relative needle moves plus control codes for colour stops and trims. NeedleScript compiles every program to a machine-ready .DST file.',
      },
      {
        term: 'Stitch sequence',
        def: 'The ordered list of every penetration and command in the order the machine will sew them. Playback scrubs through this sequence so you can watch the design build.',
      },
      {
        term: 'Machine-ready',
        def: "Geometry that has been resolved all the way down to concrete needle penetrations within the machine's limits — no longer abstract curves, but coordinates a machine can sew without interpretation.",
      },
    ],
  },
  {
    title: 'Coordinates & the turtle',
    intro:
      "NeedleScript inherits Logo's turtle: an agent that carries the needle through the hoop. Geometry is described by how the turtle moves, not by absolute drawing commands — which is what makes the language feel like giving directions.",
    terms: [
      {
        term: 'Turtle',
        def: 'The imaginary agent that holds the needle. It has a position and a heading; you move and turn it, and thread follows. A program is a set of instructions to this agent.',
      },
      {
        term: 'Heading',
        def: 'The direction the turtle faces, in degrees. In NeedleScript 0 points up (north) and angles increase clockwise, so rt 90 faces east. Matches a compass, not standard math angles.',
      },
      {
        term: 'Coordinate / point',
        def: 'A position in the hoop written [x, y] in millimetres, measured from the origin (0, 0) at the centre. The basic unit nearly every geometry function consumes and returns.',
      },
      {
        term: 'Origin',
        def: "The point (0, 0) — the centre of the hoop and the turtle's home. Rotations and mirrors happen about it unless told otherwise.",
      },
      {
        term: 'Local frame vs hoop space',
        def: 'The turtle moves in its own local coordinates; a transform block can map those into different hoop-space positions. Stitch length and satin width are measured in real hoop space so previews stay physically accurate.',
      },
      {
        term: 'Millimetre (mm)',
        def: "The unit of everything spatial in NeedleScript. Working in real-world millimetres means a design's size on screen is its size on the garment.",
      },
    ],
  },
  {
    title: 'Randomness & noise',
    intro:
      'The engine of generative design. The trick is controlled randomness: numbers that look unpredictable but are perfectly repeatable, so a design can feel organic while remaining a reproducible artifact.',
    terms: [
      {
        term: 'Seed',
        def: 'A starting number that determines an entire sequence of "random" values. Same seed, same sequence, same design — every time. Change the seed and you get a different but equally valid piece. This determinism is what makes generative art shareable and editable.',
      },
      {
        term: 'Deterministic / reproducible',
        def: 'A program that always produces the exact same output from the same inputs. NeedleScript is deterministic on purpose: randomness is a controlled ingredient, not chaos, so you can tweak one slider and trust everything else stays put.',
      },
      {
        term: 'RNG (random number generator)',
        def: 'The algorithm that turns a seed into a stream of numbers. NeedleScript can fork a child RNG (e.g. for shuffle) so one part of a design can be randomised without shifting the random stream the rest depends on.',
      },
      {
        term: 'Pseudo-random',
        def: 'Numbers that pass for random but are computed by a fixed formula from the seed. "Pseudo" is the whole point — true randomness could not be reproduced.',
      },
      {
        term: 'Value / Perlin noise',
        def: 'A smooth, continuous form of randomness: nearby points get similar values, so it drifts gently instead of jumping. Sampling it across the hoop gives organic, cloud-like variation — the basis of natural-looking texture. NeedleScript: noise, noise2.',
      },
      {
        term: 'Simplex noise',
        def: 'A faster, less grid-biased successor to Perlin noise, returning values in -1…1. The go-to source of organic drift for flow fields and jitter. NeedleScript: snoise2, snoise3.',
      },
      {
        term: 'Octaves / fbm',
        def: 'Fractal Brownian motion: adding several layers of noise at doubling frequencies (octaves) and halving strength, so you get both broad shapes and fine detail at once — the way real coastlines and clouds have structure at every scale. NeedleScript: fbm2.',
      },
      {
        term: 'Gaussian / normal distribution',
        def: 'The bell curve: random values that cluster around an average and rarely stray far. Used when you want natural variation that mostly stays near a target. NeedleScript: gauss.',
      },
      {
        term: 'Domain of a noise field',
        def: 'The coordinates you feed into a noise function. Dividing coordinates before sampling (noise(x/15)) "zooms out", making the variation slower and smoother — a key tuning knob.',
      },
    ],
  },
  {
    title: 'Vectors & geometry',
    intro:
      'A vector is just a pair of numbers [x, y], but it can mean either a point or a direction-with-length. Treating positions as vectors lets you add, scale and rotate geometry with arithmetic instead of step-by-step turtle moves.',
    terms: [
      {
        term: 'Vector',
        def: 'An ordered pair [x, y]. Read as a point it names a location; read as a displacement it names "move this far in this direction." Most generative geometry is vector arithmetic.',
      },
      {
        term: 'Unit vector',
        def: 'A vector exactly 1 long — pure direction, no magnitude. Useful as a building block: scale a unit vector by a length to step a precise distance. NeedleScript: vnorm.',
      },
      {
        term: 'Magnitude / length',
        def: 'How long a vector is (its distance from the origin), via the Pythagorean theorem. NeedleScript: vlen.',
      },
      {
        term: 'Dot product',
        def: 'A single number measuring how much two vectors point the same way: large when aligned, zero when perpendicular, negative when opposed. The workhorse of "are these facing the same direction?" tests. NeedleScript: vdot.',
      },
      {
        term: 'Centroid',
        def: 'The average position of a set of points — the geometric "centre of mass" of a shape. Used to find the middle of a region or to pull points toward balance (see Lloyd\'s relaxation). NeedleScript: centroid.',
      },
      {
        term: 'Bounding box',
        def: 'The smallest upright rectangle that contains a shape, given as its min and max corners. A cheap way to measure extent or test rough overlap. NeedleScript: bbox.',
      },
    ],
  },
  {
    title: 'Curves & paths',
    intro:
      'A machine sews straight segments, but designs want smooth curves. These tools build curves from a few control points, then chop them back into stitch-sized straight pieces.',
    terms: [
      {
        term: 'Path / polyline',
        def: 'A list of points joined by straight segments — the universal currency of generative geometry. A region is simply a closed path (the last point joins back to the first).',
      },
      {
        term: 'Resampling',
        def: 'Redistributing the points along a path so segments are a uniform length. This is the bridge from a mathematical curve to physical stitches: resample at your stitch length and the curve sews evenly. NeedleScript: resample.',
      },
      {
        term: 'Spline',
        def: 'A smooth curve guided by a handful of control points. Catmull-Rom splines pass through their points (good for tracing a freehand shape); Bézier curves are pulled toward off-curve handles (good for precise design). NeedleScript: catmull, bezier.',
      },
      {
        term: 'Chaikin smoothing',
        def: 'A simple corner-cutting algorithm that rounds a jagged polyline by repeatedly trimming its corners. Each pass makes it smoother. NeedleScript: chaikin.',
      },
      {
        term: 'Control point',
        def: 'A point that guides the shape of a curve. The curve either passes through it or is pulled toward it, depending on the curve type.',
      },
      {
        term: 'Streamline / flow field',
        def: 'A path traced by following a field of directions, like a leaf carried on a current. Generative fills lay rows along streamlines so the stitching flows with the form rather than across it.',
      },
    ],
  },
  {
    title: 'Generators & computational geometry',
    intro:
      'Higher-level recipes that turn scattered points into structure. These classic algorithms are how a few random dots become organic networks, cells and packed patterns.',
    terms: [
      {
        term: 'Poisson-disc sampling',
        def: 'Scattering points randomly but never closer than a minimum distance, giving a natural, evenly-spaced "blue noise" look — like freckles or seeds — without clumps or gaps. NeedleScript: scatter.',
      },
      {
        term: 'Voronoi diagram',
        def: 'Divides space into cells, one per seed point, where each cell is everywhere closer to its seed than to any other. Produces organic, cracked-mud or cellular patterns. NeedleScript: voronoi.',
      },
      {
        term: 'Delaunay triangulation',
        def: 'Connecting scattered points into triangles that avoid slivers (the dual of the Voronoi diagram). A natural way to mesh a point cloud into a surface. NeedleScript: triangulate.',
      },
      {
        term: 'Convex hull',
        def: 'The smallest convex outline that wraps a set of points — imagine a rubber band snapped around them. NeedleScript: hull.',
      },
      {
        term: "Lloyd's relaxation",
        def: 'Repeatedly nudging each point to the centroid of its Voronoi cell, which spreads a clumpy set of points into an even, restful arrangement — the basis of nice stippling. NeedleScript: relax.',
      },
      {
        term: 'Stippling',
        def: 'Representing tone and shape with many small dots rather than lines. Evenly relaxed scatter points make embroidery stippling.',
      },
      {
        term: 'Offsetting (inset/inflate)',
        def: 'Growing or shrinking a shape uniformly, like adding a margin or carving one away. Shrinking can split or erase a shape. NeedleScript: offsetpath.',
      },
      {
        term: 'Boolean operations',
        def: 'Combining two shapes by union (merge), intersection (overlap), difference (subtract) or xor (non-overlap). The cut-and-combine logic behind complex outlines. NeedleScript: clippaths.',
      },
    ],
  },
  {
    title: 'Transforms & deformation',
    intro:
      'Ways to move, scale or bend whole groups of stitches at once — so you can design one motif and stamp, mirror or warp it across the hoop.',
    terms: [
      {
        term: 'Transform',
        def: 'A rule that maps every point of a shape to a new position. Wrapping drawing in a transform block relocates everything it draws, then restores the previous frame — like working under a movable lens.',
      },
      {
        term: 'Affine transform',
        def: 'The family of transforms that keep straight lines straight and parallel lines parallel: translate, rotate, scale, mirror and skew. Expressible as a single 2×3 matrix. NeedleScript: transform a b c d e f.',
      },
      {
        term: 'Translate / rotate / scale',
        def: 'The three basic moves: slide a shape, turn it about a pivot, or resize it. NeedleScript scales by re-stitching the larger path at physical spacing rather than stretching existing stitches.',
      },
      {
        term: 'Mirror (reflection)',
        def: 'Flipping a shape across a line to produce its mirror image — the basis of symmetry. NeedleScript: mirror deg.',
      },
      {
        term: 'Skew (shear)',
        def: 'Slanting a shape so squares become parallelograms, as if pushed sideways. NeedleScript: skew.',
      },
      {
        term: 'CTM (current transformation matrix)',
        def: 'The single combined transform currently in effect — the product of all the nested transform blocks you are inside. Borrowed from graphics systems like PostScript and OpenSCAD.',
      },
      {
        term: 'Warp',
        def: 'A non-affine transform: instead of a matrix, an arbitrary function bends each point freely — fisheye, ripple, twist, domain-warp. Applied before stitches are split so the bent curve still sews cleanly. NeedleScript: warp.',
      },
      {
        term: 'Humanize',
        def: 'Adding small, coherent, seeded wobble to every penetration so machine-perfect lines gain a hand-stitched imperfection — variation that wanders smoothly rather than jittering randomly. NeedleScript: humanize.',
      },
      {
        term: 'Snap to grid (quantize)',
        def: 'Forcing every penetration onto a fixed lattice of points, producing a deliberate cross-stitch or pixel aesthetic. NeedleScript: snaptogrid.',
      },
    ],
  },
  {
    title: 'Core math operations',
    intro:
      'Small numeric helpers that recur everywhere in generative work — the glue between raw randomness and finished geometry.',
    terms: [
      {
        term: 'Interpolation (lerp)',
        def: 'Blending between two values by a fraction t: t=0 gives the first, t=1 the second, t=0.5 the midpoint. The fundamental "fade from A to B" operation. NeedleScript: lerp, vlerp.',
      },
      {
        term: 'Remap',
        def: "Rescaling a value from one range into another — e.g. turning a noise value in -1…1 into a stitch length in 1…4 mm. The standard way to connect one system's numbers to another's. NeedleScript: remap.",
      },
      {
        term: 'Clamp',
        def: 'Forcing a value to stay within a minimum and maximum, so a computed parameter never exceeds safe bounds. NeedleScript: clamp.',
      },
      {
        term: 'Smoothstep',
        def: 'A soft transition from 0 to 1 that eases in and out instead of switching abruptly — gentler and more natural than a straight ramp. NeedleScript: smoothstep.',
      },
      {
        term: 'Modulo',
        def: 'The remainder after division, which wraps numbers into a repeating range (useful for cycling through colours or tiling a pattern). NeedleScript uses floor modulo, so the result always takes the sign of the divisor.',
      },
      {
        term: 'Trigonometry (sin/cos)',
        def: 'Functions that convert an angle into the coordinates of a point on a circle — the mathematics of anything that rotates, waves or orbits. NeedleScript takes degrees, not radians.',
      },
    ],
  },
];

// ── Markdown renderer ─────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*[\]().]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function renderInline(text: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]*\))/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token[0] === '`') {
      parts.push(
        <code key={key++} className={styles.inlineCode}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{renderInline(token.slice(2, -2))}</strong>);
    } else if (token[0] === '*') {
      parts.push(<em key={key++}>{renderInline(token.slice(1, -1))}</em>);
    } else {
      const lm = token.match(/\[([^\]]+)\]\(([^)]*)\)/);
      if (lm) {
        const href = lm[2];
        if (href.startsWith('#')) {
          const targetId = 'tut-' + href.slice(1);
          parts.push(
            <a
              key={key++}
              className={styles.tutLink}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(targetId)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {renderInline(lm[1])}
            </a>,
          );
        } else {
          parts.push(<span key={key++}>{renderInline(lm[1])}</span>);
        }
      } else {
        parts.push(token);
      }
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function parseMarkdown(md: string): ReactNode[] {
  const lines = md.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let bk = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '---') {
      blocks.push(<hr key={bk++} className={styles.tutHr} />);
      i++;
      continue;
    }

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) codeLines.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={bk++} className={styles.tutPre}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const h3 = line.match(/^###\s+(.*)/);
    if (h3) {
      const txt = h3[1];
      blocks.push(
        <h3 key={bk++} id={'tut-' + slugify(txt)} className={styles.tutH3}>
          {renderInline(txt)}
        </h3>,
      );
      i++;
      continue;
    }
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      const txt = h2[1];
      blocks.push(
        <h2 key={bk++} id={'tut-' + slugify(txt)} className={styles.tutH2}>
          {renderInline(txt)}
        </h2>,
      );
      i++;
      continue;
    }
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) {
      blocks.push(
        <h1 key={bk++} className={styles.tutH1}>
          {renderInline(h1[1])}
        </h1>,
      );
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      const qLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) qLines.push(lines[i++].slice(2));
      blocks.push(
        <blockquote key={bk++} className={styles.tutBlockquote}>
          {renderInline(qLines.join(' '))}
        </blockquote>,
      );
      continue;
    }

    if (line.startsWith('|')) {
      const tLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) tLines.push(lines[i++]);
      const isSep = (s: string) => /^\|[-|: ]+\|$/.test(s.trim());
      const dataStart = tLines.length > 1 && isSep(tLines[1]) ? 2 : 1;
      const splitCells = (l: string) =>
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
      blocks.push(
        <div key={bk++} className={styles.tutTableWrap}>
          <table className={styles.tutTable}>
            <thead>
              <tr>
                {splitCells(tLines[0]).map((c, ci) => (
                  <th key={ci} className={styles.tutTh}>
                    {renderInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tLines.slice(dataStart).map((l, j) => (
                <tr key={j}>
                  {splitCells(l).map((c, ci) => (
                    <td key={ci} className={styles.tutTd}>
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].slice(2));
      blocks.push(
        <ul key={bk++} className={styles.tutUl}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i]))
        items.push(lines[i++].replace(/^\d+\. /, ''));
      blocks.push(
        <ol key={bk++} className={styles.tutOl}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('|') &&
      !lines[i].startsWith('> ') &&
      !/^[-*] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      lines[i].trim() !== '---'
    ) {
      pLines.push(lines[i++]);
    }
    if (pLines.length > 0) {
      blocks.push(
        <p key={bk++} className={styles.tutP}>
          {renderInline(pLines.join(' '))}
        </p>,
      );
    }
  }

  return blocks;
}

// ── About content ─────────────────────────────────────────────────────────────

function AboutContent() {
  return (
    <div className={styles.about}>
      <h2 className={styles.aboutTitle}>NeedleScript</h2>

      <p className={styles.aboutPara}>
        NeedleScript inherits its skeleton from <strong>Logo</strong> — the programming language
        created by Seymour Papert, Wally Feurzeig, and Cynthia Solomon at MIT in 1967. Logo
        introduced the <em>turtle</em>: an imaginary agent that moves through a plane, carrying a
        pen. Move it forward, turn it, repeat — and the pen traces geometry. The idea was radical
        for its time: make mathematics tangible and discoverable by having the learner act it out.
      </p>

      <p className={styles.aboutPara}>
        In NeedleScript the turtle carries a needle instead of a pen.{' '}
        <code className={styles.inlineCode}>fd 20</code> sews twenty millimetres of running stitch.{' '}
        <code className={styles.inlineCode}>arc 360 15</code> sews a closed circle.{' '}
        <code className={styles.inlineCode}>satin 3</code> turns the path into a glossy
        three-millimetre column. The classic Logo vocabulary —{' '}
        <code className={styles.inlineCode}>fd</code>, <code className={styles.inlineCode}>bk</code>
        , <code className={styles.inlineCode}>rt</code>,{' '}
        <code className={styles.inlineCode}>lt</code>,{' '}
        <code className={styles.inlineCode}>push</code>,{' '}
        <code className={styles.inlineCode}>pop</code>,{' '}
        <code className={styles.inlineCode}>repeat</code>,{' '}
        <code className={styles.inlineCode}>to&nbsp;…&nbsp;end</code> — works unchanged; every Logo
        movement program is valid NeedleScript.
      </p>

      <p className={styles.aboutPara}>
        On top of that foundation sits the toolkit that generative design requires today: seeded
        simplex noise fields for organic drift, Poisson-disc scattering and Voronoi tessellation for
        structured randomness, Catmull-Rom splines and Bézier curves that resample directly to
        stitch length, and Clipper2 boolean geometry for precise offsets and cuts. Everything
        compiles to a machine-ready Tajima DST file.
      </p>

      <p className={styles.aboutPara}>
        The goal is the one Papert had for Logo: collapse the distance between the idea and the
        physical result. In NeedleScript, that result is embroidery you can sew on a real machine
        and wear.
      </p>

      <p className={styles.aboutCopyright}>© 2026 Fredi Bach</p>
    </div>
  );
}

// ── Dialog ────────────────────────────────────────────────────────────────────

type TabId = 'reference' | 'glossary' | 'tutorial' | 'about';

const TAB_LABELS: Record<TabId, string> = {
  reference: 'Language Reference',
  glossary: 'Glossary',
  tutorial: 'Tutorial',
  about: 'About',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ReferenceDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('reference');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tutorialNodes = useMemo(() => parseMarkdown(tutorialMd), []);

  // Auto-focus search when dialog opens on a searchable tab, clear on close
  useEffect(() => {
    if (open && (tab === 'reference' || tab === 'glossary')) {
      setTimeout(() => inputRef.current?.focus(), 40);
    } else if (!open) {
      setQuery('');
    }
  }, [open, tab]);

  // Escape handled natively by base-ui Dialog; belt-and-suspenders
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? SECTIONS.map((s) => ({
        ...s,
        entries: s.entries.filter(
          (e) => e.cmd.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q),
        ),
      })).filter((s) => s.entries.length > 0)
    : SECTIONS;

  const filteredGloss = q
    ? GLOSSARY.map((s) => ({
        ...s,
        terms: s.terms.filter(
          (t) => t.term.toLowerCase().includes(q) || t.def.toLowerCase().includes(q),
        ),
      })).filter((s) => s.terms.length > 0)
    : GLOSSARY;

  // Shared TabsTrigger className
  const triggerCls = cn(
    'font-mono text-[11px] tracking-[0.07em] px-2.5 py-1.5 h-auto whitespace-nowrap',
    'rounded-[5px] border-transparent shadow-none bg-transparent',
    'text-muted-foreground hover:text-foreground transition-colors',
    'data-active:bg-[var(--gold-10)] data-active:text-gold',
    'data-active:border-transparent data-active:shadow-none',
    'after:hidden', // suppress line-variant underline indicator
    'focus-visible:ring-2 focus-visible:ring-ring/50',
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          // Responsive sizing: explicit height anchors the scroll chain;
          // max-width keeps it comfortable on wide screens.
          'w-full max-w-[min(900px,calc(100%-1.5rem))]',
          'h-[min(820px,calc(100dvh-2rem))]',
          // Custom layout
          'p-0 gap-0 flex flex-col',
          // Visual
          'rounded-xl overflow-hidden bg-card border border-border',
        )}
        aria-label="NeedleScript help"
      >
        {/* ── Row 1: branding + close ── */}
        <div className="flex items-center justify-between px-3.5 sm:px-4 h-10 flex-shrink-0 border-b border-dashed border-border">
          <span className="text-[11px] tracking-[0.16em] uppercase text-gold select-none whitespace-nowrap">
            ✣ NeedleScript
          </span>
          <div className="flex items-center gap-1">
            <a
              href="https://github.com/FrediBach/needlescript"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View NeedleScript on GitHub"
              title="View on GitHub"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-[6px] py-[3px] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <GithubIcon className="w-[15px] h-[15px]" />
            </a>
            <DialogClose className="text-[14px] font-mono text-muted-foreground bg-transparent border-none cursor-pointer px-[6px] py-[3px] rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              ✕
            </DialogClose>
          </div>
        </div>

        {/* ── Tabs: triggers (row 2) + panels (body) ── */}
        <Tabs
          value={tab}
          onValueChange={(v: string | null) => {
            if (v) setTab(v as TabId);
          }}
          className="flex-1 min-h-0 gap-0 overflow-hidden"
        >
          {/* Row 2: tab triggers + optional search */}
          <div className="flex items-center gap-2 px-3.5 sm:px-4 py-2 flex-shrink-0 border-b border-dashed border-border flex-wrap sm:flex-nowrap">
            <TabsList className="bg-transparent p-0 h-auto gap-0.5 flex-shrink-0">
              {(Object.keys(TAB_LABELS) as TabId[]).map((t) => (
                <TabsTrigger key={t} value={t} className={triggerCls}>
                  {TAB_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>

            {(tab === 'reference' || tab === 'glossary') && (
              <Input
                ref={inputRef}
                type="text"
                placeholder={tab === 'glossary' ? 'filter terms…' : 'filter commands…'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                spellCheck={false}
                aria-label={tab === 'glossary' ? 'Filter glossary' : 'Filter language reference'}
                className={cn(
                  'h-7 text-[12.5px] font-mono flex-1 min-w-[120px] w-full sm:w-auto',
                  'bg-secondary border-border text-foreground placeholder:text-muted-foreground',
                )}
              />
            )}
          </div>

          {/* ── Language Reference panel ── */}
          <TabsContent value="reference" className="flex flex-col min-h-0 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="pb-4">
                {filtered.length === 0 ? (
                  <div className={styles.empty}>no matches for &ldquo;{query}&rdquo;</div>
                ) : (
                  filtered.map((section) => (
                    <section key={section.title} className={styles.section}>
                      <h3 className={styles.sectionTitle}>{section.title}</h3>
                      {section.note && <p className={styles.sectionNote}>{section.note}</p>}
                      <div className={styles.entries}>
                        {section.entries.map((e, i) => (
                          <div key={i} className={styles.entry}>
                            <code className={styles.cmd}>{e.cmd}</code>
                            <span className={styles.desc}>{e.desc}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Glossary panel ── */}
          <TabsContent value="glossary" className="flex flex-col min-h-0 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="pb-4">
                {!q && <p className={styles.glossLead}>{GLOSSARY_LEAD}</p>}
                {filteredGloss.length === 0 ? (
                  <div className={styles.empty}>no matches for &ldquo;{query}&rdquo;</div>
                ) : (
                  filteredGloss.map((section) => (
                    <section key={section.title} className={styles.section}>
                      <h3 className={styles.sectionTitle}>{section.title}</h3>
                      {!q && section.intro && <p className={styles.sectionNote}>{section.intro}</p>}
                      <div className={styles.glossTerms}>
                        {section.terms.map((t, i) => (
                          <div key={i} className={styles.glossEntry}>
                            <span className={styles.term}>{t.term}</span>
                            <span className={styles.desc}>{t.def}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Tutorial panel ── */}
          <TabsContent value="tutorial" className="flex flex-col min-h-0 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className={styles.tutContent}>{tutorialNodes}</div>
            </ScrollArea>
          </TabsContent>

          {/* ── About panel ── */}
          <TabsContent value="about" className="flex flex-col min-h-0 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <AboutContent />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
