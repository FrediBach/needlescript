import { useState, useEffect, useRef } from 'react';
import styles from './ReferenceDialog.module.css';

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
      { cmd: '// comment · # comment · ; comment', desc: 'rest of line ignored. A lone / still divides — only two adjacent slashes comment' },
      { cmd: 'true · false', desc: 'literals for 1 and 0. Truthiness: 0 is false, anything else is true. Comparisons return 1 or 0' },
      { cmd: 'seed n', desc: 'reseed the RNG (default 42). Same seed always reproduces the same design — change it to change the piece' },
    ],
  },
  {
    title: 'Movement',
    note: 'Heading 0 = up/north, clockwise. rt 90 faces east.',
    entries: [
      { cmd: 'fd n · bk n', desc: 'sew forward / back n mm; long moves auto-split at stitchlen. Aliases: forward, back, backward' },
      { cmd: 'rt deg · lt deg', desc: 'turn right / left by deg degrees. Aliases: right, left' },
      { cmd: 'arc deg radius', desc: 'sew along a circle of radius mm, turning deg in total — positive curves right, negative left. Works with every stitch mode (satin arcs!)' },
      { cmd: 'up · down', desc: 'needle up = travel as a jump · needle down = sew. Aliases: penup/pu, pendown/pd' },
      { cmd: 'setxy x y', desc: 'move to an absolute position' },
      { cmd: 'setx x · sety y', desc: 'move one axis at a time' },
      { cmd: 'seth deg', desc: 'set the heading absolutely. Alias: setheading' },
      { cmd: 'home', desc: 'return to (0, 0), heading 0' },
      { cmd: 'push · pop', desc: 'save / restore needle state (position, heading, pen) on a stack — jump back without sewing. Perfect for branching structures. Max 500 saved states; pop on an empty stack warns and is ignored' },
      { cmd: 'cs', desc: 'accepted for Logo familiarity; does nothing. Aliases: clearscreen, clear' },
    ],
  },
  {
    title: 'Thread & stitch quality',
    entries: [
      { cmd: 'stitchlen mm', desc: 'running-stitch length, clamped 0.4–12 mm (default 2.5). Alias: stitchlength' },
      { cmd: 'satin mm', desc: 'zigzag column of this width; penetration spacing set by density. satin 0 returns to running stitch. Widths over ~8 mm tend to snag (you\'ll get a warning)' },
      { cmd: 'density mm', desc: 'satin penetration spacing, 0.25–5 mm (default 0.4)' },
      { cmd: 'bean n', desc: 'bold line: each stitch sewn n times (forced odd, max 9). bean 1 off' },
      { cmd: 'estitch mm', desc: 'blanket stitch: prongs of this length on the left of travel, spaced by stitchlen. estitch 0 off' },
      { cmd: 'color n', desc: 'switch to thread n (emits a DST colour-change stop)' },
      { cmd: 'stop', desc: 'shorthand for "next colour" — equivalent to incrementing the thread number' },
      { cmd: 'trim', desc: 'cut the thread here (long travels also get one automatically — see autotrim)' },
      { cmd: 'lock mm', desc: 'tie-in/tie-off: 4 micro back-stitches sewn automatically wherever thread starts/ends (design start/end, colour changes, trims, jumps ≥ 4 mm). Size 0.3–1.5 mm (default 0.7); lock 0 off' },
    ],
  },
  {
    title: 'Fills',
    note: 'Moves between beginfill and endfill trace a boundary rather than sewing. Inner rings (started with a pen-up move) become holes by the even-odd rule.',
    entries: [
      { cmd: 'beginfill … endfill', desc: 'trace a boundary; endfill sews a tatami fill of the enclosed area. A pen-up move (up … down) starts a new ring — inner rings become holes (even-odd)' },
      { cmd: 'fillangle deg', desc: 'direction of the fill rows (default 0)' },
      { cmd: 'fillspacing mm', desc: 'row spacing, 0.25–5 mm (default 0.4)' },
      { cmd: 'filllen mm', desc: 'fill stitch length, 1–7 mm; by default follows stitchlen. Set filllen to override, filllen 0 to follow stitchlen again. Rows are brick-offset so penetrations don\'t line up' },
    ],
  },
  {
    title: 'Fabric & professional quality',
    note: 'Without these commands, programs sew exactly as written. Fabric presets are the quickest route — explicit commands afterwards override the preset.',
    entries: [
      { cmd: 'fabric "woven', desc: 'baseline preset: pull comp 0.2 mm, density limit 3.5 layers' },
      { cmd: 'fabric "knit', desc: 'pull comp 0.5 mm, density limit 3.0 layers, satin density floored at 0.45 mm' },
      { cmd: 'fabric "stretch', desc: 'pull comp 0.6 mm, density limit 2.8 layers, satin density floored at 0.5 mm' },
      { cmd: 'fabric "denim · "canvas', desc: 'pull comp 0.15 mm, density limit 4.0 layers — stable, tolerates dense stitching' },
      { cmd: 'fabric "fleece', desc: 'pull comp 0.3 mm, density limit 2.6 layers, doubled underlay — suggests a topping' },
      { cmd: 'pullcomp mm', desc: 'pull compensation 0–1.5 mm: thread tension shrinks stitching — widens satin columns and extends fill rows so shapes sew out at their digitized size' },
      { cmd: 'underlay "auto · "center · "edge · "zigzag · "off', desc: 'stabilising stitches under each satin column. auto picks by width: <1.5 mm none, <4 mm center, wider zigzag. Shown thinner in the preview' },
      { cmd: 'fillunderlay "auto · "tatami · "edge · "off', desc: 'underlay beneath fills: sparse cross-grain tatami pass and/or inset edge run. auto = tatami, plus edge run on areas over 100 mm²' },
      { cmd: 'shortstitch 0/1', desc: 'curve physics (on by default): on tight satin curves alternate inner stitches are automatically shortened to 60% width to prevent thread breaks and fabric damage' },
      { cmd: 'autotrim mm', desc: 'auto trim before travels ≥ n mm (default 7, configurable 3–30) so connector threads don\'t snag. autotrim 0 off. Trim is never inserted when nothing has been sewn since the last cut' },
      { cmd: 'maxdensity n', desc: 'thread-coverage warning threshold in layers (default 3.5). Past ~2.5–3.5 layers embroidery stops being fabric: needles deflect, thread breaks, patch puckers. See the density heatmap toggle on the stage. maxdensity 0 silences warnings' },
    ],
  },
  {
    title: 'Control flow',
    entries: [
      { cmd: 'repeat n [ … ]', desc: 'loop n times; repcount is the 1-based counter of the innermost repeat' },
      { cmd: 'while cond [ … ]', desc: 'loop while the condition is true (non-zero). while true [ … break ] is the idiomatic search loop' },
      { cmd: 'for i = from to to [ … ]', desc: 'counted loop, inclusive of to; step defaults to 1. Counter does not leak after the loop. Classic: for "i from to step [ … ] (step required in classic form)' },
      { cmd: 'for i = from to to step s [ … ]', desc: 'counted loop with explicit (possibly negative) step: for i = 10 to 1 step -2 [ … ]' },
      { cmd: 'for x in xs [ … ]', desc: 'iterate elements of a list; the loop variable does not leak after the loop. Length is captured at loop entry, elements read live' },
      { cmd: 'break · continue', desc: 'end the innermost loop immediately / skip to its next iteration. Lexical — a break inside a helper procedure cannot end a loop in its caller; use return there instead' },
      { cmd: 'if cond [ … ] else if c2 [ … ] else [ … ]', desc: 'conditional. Compare with < > = == <= >= !=, combine with and or not (!). Chains of alternatives at any depth' },
    ],
  },
  {
    title: 'Procedures',
    note: 'Two dialects mix freely. Modern: def leaf(size) [ … ] · Classic Logo: to leaf :size … end. Procedures may be called before they are defined (signatures are pre-scanned).',
    entries: [
      { cmd: 'def name(a, b) [ … ]', desc: 'define a procedure with parameters. Classic: to name :a :b … end. Parameters are local, readable as plain names (size) or classic style (:size)' },
      { cmd: 'return expr · return', desc: 'return a value from a procedure (use as: fd double(5)) / leave early. Classic: output expr / exit (alias: op). return and output are only valid inside a procedure' },
      { cmd: 'f(a, b) · f a b', desc: 'call with glued parens (f(x)) or classic prefix (f x). Glued ( = argument list, spaced ( = Logo grouping — one space is the entire rule. Trailing commas allowed. Styles mix freely' },
      { cmd: 'recursion', desc: 'procedures can recurse; depth limit is 200 calls. Example: def fact(n) [ if n < 2 [ return 1 ] return n * fact(n - 1) ]' },
    ],
  },
  {
    title: 'Variables',
    entries: [
      { cmd: 'let x = expr', desc: 'declare a variable: global at the top level, local inside a procedure. let of a name already declared in the same scope is a parse error' },
      { cmd: 'x = expr', desc: 'assign: updates a local if one is in scope, otherwise writes a global. Plain assignment without let is allowed (Logo make semantics — friendly for one-liners)' },
      { cmd: 'x += e · x -= e · x *= e · x /= e', desc: 'compound assignment: x += 2 is x = x + 2' },
      { cmd: 'make "x expr', desc: 'classic spelling of assignment — same store, same rules as x = expr' },
      { cmd: 'local "x expr', desc: 'classic spelling of an in-procedure let. Illegal at the top level — use let or make there' },
      { cmd: 'fd x · fd :x', desc: 'read a variable: plain name or classic : prefix — both resolve identically' },
    ],
  },
  {
    title: 'Expressions & operators',
    note: 'Operator precedence (loosest to tightest): or → and → comparisons → + - → * / % → unary - / prefix functions → atoms. and/or short-circuit.',
    entries: [
      { cmd: '+ - * / %', desc: '% is floor modulo (same as mod) — -7 % 3 is 2, not -1 as in C/JS. The result takes the sign of the divisor' },
      { cmd: '< > = == <= >= !=', desc: 'comparisons return 1/0. = and == are the same operator (1e-9 tolerance for floats). Lists compare deeply with =' },
      { cmd: 'and · or · not · !', desc: 'logical operators. and/or short-circuit: i > 0 and 10/i > 2 is safe. not and ! are prefix, bind tightly — write !(a = 1) when negating a comparison' },
      { cmd: '( expr )', desc: 'Logo grouping (spaced from name). Guards: seth ( noise2 xcor/16 ycor/16 ) * 720. A ( glued to a name means call parens instead' },
    ],
  },
  {
    title: 'Math functions',
    entries: [
      { cmd: 'random n', desc: 'seeded random number in 0…n — reproducible, driven by seed' },
      { cmd: 'noise x · noise2 x y', desc: 'smooth seeded value noise in 0…1. Sample slowly (divide coordinates by 10–20) for organic drift; same seed → same field' },
      { cmd: 'sin deg · cos deg', desc: 'trigonometry in degrees' },
      { cmd: 'sqrt n · abs n · round n · floor n · ceil n', desc: 'the usual suspects (sqrt of a negative is an error)' },
      { cmd: 'min a b · max a b · pow a b', desc: 'minimum, maximum, power (non-finite pow result is an error)' },
      { cmd: 'mod a b', desc: 'floor modulo — always returns a value with the sign of b. The % operator is the same operation' },
      { cmd: 'atan x y', desc: 'heading of the vector (x, y): 0 = north, clockwise — atan 1 0 is 90' },
      { cmd: 'towards x y', desc: 'heading from the needle to the point (x, y) — seth towards 0 0 aims home' },
      { cmd: 'distance x y', desc: 'distance from the needle to the point (x, y)' },
      { cmd: 'xcor · ycor · heading · repcount', desc: 'reporters (no arguments): needle x/y position, heading in degrees, 1-based counter of the innermost repeat' },
    ],
  },
  {
    title: 'Lists',
    note: 'A second value type alongside numbers: ordered, nestable lists. Reference semantics — assignment shares the list; mutate through any alias and every alias sees it. Use copy(xs) for an independent deep copy. All list functions are call-syntax only: len(xs), never len xs.',
    entries: [
      { cmd: '[1, 2, 3] · []', desc: 'list literal; nesting and trailing commas allowed. Indexing is 0-based; negatives count from the end: xs[-1] is the last element' },
      { cmd: 'xs[i] · xs[i] = v', desc: 'index read / write. xs[i] += -= *= /= also work. Non-integer or out-of-range index is a runtime error' },
      { cmd: '[x, y] = pos()', desc: 'destructuring: assigns list elements to multiple variables in one step (fixed arity, flat)' },
      { cmd: 'range(n) · range(a, b) · range(a, b, s)', desc: 'new list [0…n-1] / [a…b-1] / stepped — 0-based, end-exclusive, like Python' },
      { cmd: 'filled(n, v)', desc: 'new list of n deep copies of v' },
      { cmd: 'len(xs) · islist(v)', desc: 'element count · 1/0 type check' },
      { cmd: 'first(xs) · last(xs)', desc: 'xs[0] · xs[-1] (the Logo heritage names)' },
      { cmd: 'append(xs, v) · prepend(xs, v)', desc: 'mutates: adds v at the end / front (use as a statement)' },
      { cmd: 'insertat(xs, i, v)', desc: 'mutates: inserts v at index i (0 through len allowed)' },
      { cmd: 'removeat(xs, i)', desc: 'mutates: removes index i and returns the removed value' },
      { cmd: 'concat(a, b)', desc: 'new list (shallow — elements are shared references)' },
      { cmd: 'slice(xs, a) · slice(xs, a, b)', desc: 'new list, Python semantics including negative bounds, clamped' },
      { cmd: 'reverse(xs) · sort(xs)', desc: 'new lists (pure — they compose in expressions); sort is numbers-only, ascending, stable' },
      { cmd: 'copy(xs)', desc: 'deep copy — independent of the original' },
      { cmd: 'indexof(xs, v) · contains(xs, v)', desc: 'first index of v (deep tolerant compare) or -1 · 1/0' },
      { cmd: 'sum(xs) · mean(xs) · minof(xs) · maxof(xs)', desc: 'aggregates, numbers only; sum([]) is 0, the rest error on an empty list' },
      { cmd: 'pick(xs)', desc: 'random element — seeded, exactly one RNG draw' },
      { cmd: 'shuffle(xs)', desc: 'new shuffled list — seeded, forks a child RNG so same seed gives same order, forever' },
      { cmd: 'pos() · setpos(p)', desc: 'needle position as [xcor, ycor] · command: like setxy p[0] p[1]. Symmetric pair: append(path, pos()) … setpos(p)' },
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
      { cmd: 'snoise2(x, y) · snoise3(x, y, z)', desc: 'seeded simplex noise in -1…1 (industry convention). Legacy noise/noise2 keep 0…1. The z axis is for variation: snoise3(x/14, y/14, motif*50) gives each motif its own field' },
      { cmd: 'fbm2(x, y, octaves)', desc: 'fractal sum of snoise2: lacunarity 2.0, gain 0.5, octaves 1–8 (clamped), normalised to ≈-1…1' },
    ],
  },
  {
    title: 'Generative math — vectors',
    note: 'Everything heading-like uses turtle degrees (0 = north, clockwise positive) — matching seth, atan, towards. No operator broadcasting: [1,2] + [3,4] is an error; use vadd.',
    entries: [
      { cmd: 'vadd(a, b) · vsub(a, b)', desc: 'new point: element-wise addition / subtraction' },
      { cmd: 'vscale(a, s) · vlerp(a, b, t)', desc: 'new point: scale / lerp' },
      { cmd: 'vdot(a, b) · vlen(a) · vdist(a, b)', desc: 'dot product · length · distance between two points' },
      { cmd: 'vnorm(a)', desc: 'unit vector. The zero vector is an error (a silent default heading is a stealth bug)' },
      { cmd: 'vrot(a, deg)', desc: 'rotated clockwise for positive deg — matches rt' },
      { cmd: 'vheading(a)', desc: 'turtle heading of the vector (equivalent to atan a[0] a[1])' },
      { cmd: 'vfromheading(deg, len)', desc: 'inverse: make a vector from heading + length. vfromheading(heading, 1) is the needle\'s direction' },
    ],
  },
  {
    title: 'Generative math — paths & curves',
    entries: [
      { cmd: 'pathlen(path)', desc: 'total polyline length in mm' },
      { cmd: 'resample(path, mm)', desc: 'new path whose segments are each exactly mm long (last may be shorter); first and last points preserved. The bridge between math curves and physical stitch spacing' },
      { cmd: 'chaikin(path, n)', desc: 'corner-cut smoothing, n iterations 1–6' },
      { cmd: 'catmull(points, mm)', desc: 'Catmull-Rom spline through the control points, resampled at mm spacing' },
      { cmd: 'bezier(p0, c0, c1, p1, mm)', desc: 'cubic Bézier, resampled at mm spacing' },
      { cmd: 'centroid(path) · bbox(path)', desc: 'centre point · bounding box as [minx, miny, maxx, maxy]' },
      { cmd: 'sewpath(path)', desc: 'command: exactly for p in path [ setpos(p) ] — pen state, stitch mode, satin, and auto-split all apply as if hand-walked' },
    ],
  },
  {
    title: 'Generative math — generators & geometry',
    note: 'Outputs compose: scatter → voronoi → offsetpath → resample → sewpath. All generators are seeded: same seed, same output.',
    entries: [
      { cmd: 'scatter(mindist) · scatter(mindist, region)', desc: 'seeded Poisson-disc (Bridson) points over the 47 mm field, or inside a region polygon. Capped at 20,000 points' },
      { cmd: 'voronoi(pts) · voronoi(pts, region)', desc: 'one cell (region) per input point, in input order, clipped to the sewable field or a given region. Max 10,000 input points' },
      { cmd: 'triangulate(pts)', desc: 'Delaunay triangles: list of 3-point regions. Max 10,000 input points' },
      { cmd: 'hull(pts)', desc: 'convex hull as a region (counter-clockwise winding)' },
      { cmd: 'relax(pts, n)', desc: 'n rounds of Lloyd\'s relaxation — moves each point to its Voronoi cell\'s centroid for even stippling' },
      { cmd: 'offsetpath(region, mm)', desc: 'inflate (+) or shrink (−) a region; returns a list of regions. Shrinking may split a shape or erase it entirely (empty list — loops over it skip naturally)' },
      { cmd: 'clippaths(a, b, "op)', desc: 'boolean of two regions: "union "intersect "difference "xor; returns a list of regions. Backed by Clipper2 at µm precision' },
      { cmd: 'inpath(p, region)', desc: '1 if the point is inside the region (even-odd rule, consistent with fills)' },
    ],
  },
  {
    title: 'Debugging',
    entries: [
      { cmd: 'print expr · print "label expr', desc: 'log a value to the console, optionally with a label: print "radius r → radius: 1.5. Lists print as [1, 2, 3], capped at 64 elements' },
      { cmd: 'mark', desc: 'drop a numbered pin on the preview at the needle position. Pins appear as playback reaches them. Never exported to the machine or counted in stats' },
      { cmd: 'assert cond', desc: 'stop with an error (and line number) if the condition is false. Great for geometric invariants: assert (distance 0 0) < 47' },
      { cmd: 'playback scrubber', desc: 'scrub or play the stitch sequence. The source line being sewn is highlighted in red in the editor and shown in the playback bar counter' },
      { cmd: 'did-you-mean', desc: 'typos in commands, variables, and procedure names get a closest-match suggestion across every namespace, labelled by kind: Unknown command "stichlen" — did you mean "stitchlen"?' },
    ],
  },
  {
    title: 'SVG import',
    entries: [
      { cmd: 'Import SVG button · drag & drop', desc: 'converts an SVG into editable Needlescript code. Filled shapes → beginfill blocks (subpaths → holes), strokes → outlines, shapes with both get a procedure for fill then border. Colours map to nearest thread' },
      { cmd: 'supported elements', desc: '<path> (M L H V C S Q T A Z), rect, circle, ellipse, line, polyline/polygon, groups and transforms. Text, images, and gradients are skipped' },
      { cmd: 'fit __ mm', desc: 'scale the imported SVG to fit within this many millimetres before converting. Adjustable in the toolbar (10–190 mm)' },
    ],
  },
  {
    title: 'Safety limits',
    note: 'Needlescript guards both your browser and your machine. Exceeding a limit stops the program with an error and a line number.',
    entries: [
      { cmd: 'max stitches', desc: '60,000 per design' },
      { cmd: 'max interpreter operations', desc: '2,000,000 — catches infinite while loops and unbounded recursion; list reads and writes count too' },
      { cmd: 'max call depth', desc: '200 nested procedure calls' },
      { cmd: 'max loop iterations', desc: '200,000 per repeat or for loop' },
      { cmd: 'max list length', desc: '100,000 elements per list' },
      { cmd: 'max live list cells', desc: '1,000,000 total across all lists at once' },
      { cmd: 'max list nesting depth', desc: '16 levels' },
      { cmd: 'max scatter output', desc: '20,000 points' },
      { cmd: 'max generator input', desc: '10,000 points for voronoi, triangulate, hull, relax' },
      { cmd: 'max geometry input', desc: '50,000 vertices per offsetpath / clippaths call' },
      { cmd: 'stitch length', desc: 'clamped to 0.4–12 mm. Sub-0.4 mm moves are merged into neighbours (too short to sew safely), with a warning' },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ReferenceDialog({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();

  const filtered = q
    ? SECTIONS.map(s => ({
        ...s,
        entries: s.entries.filter(e =>
          e.cmd.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q)
        ),
      })).filter(s => s.entries.length > 0)
    : SECTIONS;

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Language reference">
        <div className={styles.header}>
          <span className={styles.title}>✣ Language Reference</span>
          <input
            ref={inputRef}
            className={styles.search}
            type="text"
            placeholder="filter commands…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            spellCheck={false}
            aria-label="Filter language reference"
          />
          <button className={styles.close} onClick={onClose} aria-label="Close reference">✕</button>
        </div>
        <div className={styles.body}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>no matches for &ldquo;{query}&rdquo;</div>
          ) : (
            filtered.map(section => (
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
      </div>
    </div>
  );
}
