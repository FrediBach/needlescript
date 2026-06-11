# Needlescript

A Logo-inspired programming language and playground for **generative embroidery**. You write turtle-graphics code, Needlescript turns it into machine-ready stitches — running stitch, satin, bean, blanket and tatami fills — previews them in a virtual hoop, and exports a Tajima `.DST` file you can sew on a real embroidery machine.

The goal: let creatives make embroidery that can't easily be drawn in traditional embroidery software — noise fields, recursion, parametric curves, randomness with a seed.

```text
; strands drift through a smooth noise field
to strand
  repeat 90 [
    seth ( noise2 xcor / 16 ycor / 16 ) * 720
    fd 1.8
    if distance 0 0 > 40 [ exit ]
  ]
end

seed 9
stitchlen 2
repeat 14 [
  up setxy random 64 - 32 random 64 - 32 down
  strand
  trim
]
```

---

## Setup

Requirements: Node.js ≥ 20 and npm.

```bash
npm install        # install dependencies
npm run dev        # start the playground at http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | typecheck + production build into `dist/` |
| `npm run preview` | serve the production build locally |
| `npm test` | run the test suite once (Vitest) |
| `npm run test:watch` | run tests in watch mode |
| `npm run test:coverage` | run tests with V8 coverage |
| `npm run lint` | ESLint over the whole project |

The app is a React 19 + TypeScript + Vite single-page app. The language engine itself (`src/lib/`) has **no DOM dependencies** and can be used as a standalone library (see [Using the engine as a library](#using-the-engine-as-a-library)).

### Project structure

```
src/
├── lib/                  the language engine (DOM-free)
│   ├── engine.ts         tokenizer, parser, interpreter, stitch machine, fills, locks
│   ├── dst.ts            Tajima .DST binary encoder
│   ├── svg-importer.ts   SVG → Needlescript source converter
│   ├── index.ts          public library surface
│   └── __tests__/        Vitest suites (the de-facto behavioural spec)
├── components/           playground UI (editor, stage, playback, reference)
├── data.ts               thread palette, hoop constants, bundled examples
└── App.tsx               run pipeline, DST export, SVG import, drag & drop
```

---

## The playground

- **Editor** — write Needlescript; `⌘`/`Ctrl`+`Enter` runs, `Tab` inserts two spaces.
- **REPL** — type a single command below the console; it's appended to the program and re-run (`↑`/`↓` for history). Great for nudging a design live.
- **Console** — run results, warnings, `print` output, and errors with line numbers.
- **Stage** — a 100 mm virtual hoop rendered on canvas: thread per colour, dashed jump lines, needle penetration points when zoomed, hoop-overflow and density warnings as chips.
- **Playback** — play (~7 s) or scrub the stitch sequence stitch by stitch. While scrubbed, the **source line currently sewing is highlighted in the editor** and shown next to the counter — the fastest way to answer "which line made this stitch?"
- **Examples** — bundled programs in the header dropdown (bloom, wreath, wander, star, badge, sampler, waves, tree, fern, flow, shell).
- **Download .DST** — export the current design as a Tajima stitch file.
- **Import SVG** — convert an SVG (button or drag & drop) into *editable* Needlescript code: filled shapes become `beginfill` blocks (subpaths become holes), strokes become outlines, colours map to the nearest thread. Supports `<path>` (M L H V C S Q T A Z), rect/circle/ellipse/line/polyline/polygon, groups and transforms.

---

# Language guide

## Basics

- **Units are millimetres.** The hoop is 100 mm across; the sewable field is a 47 mm radius around the origin `(0, 0)` at the centre.
- **Heading is in degrees, `0` = up/north, clockwise** (Logo convention). `rt 90` faces east.
- Words are **case-insensitive** (`FD 10` = `fd 10`).
- `;` starts a comment to the end of the line.
- There are no statement separators — whitespace and newlines are interchangeable.
- The only value type is the **number** (millimetres, degrees, counts, truth values).
- Truthiness: `0` is false, anything else is true. Comparisons return `1` or `0`.

### Negative numbers vs subtraction

Following Logo convention, a minus sign with a space before it and none after it is a **negative literal**, not subtraction:

```text
setxy -6 -21       ; two arguments: the point (-6, -21)
fd 10 - 5          ; one argument: fd 5 (subtraction)
fd 10 -5           ; error — "-5" is a second value, but fd takes one argument
```

## Movement

| Command | Aliases | Effect |
|---|---|---|
| `fd n` | `forward` | sew forward *n* mm (long moves auto-split at `stitchlen`) |
| `bk n` | `back`, `backward` | sew backward *n* mm |
| `rt deg` / `lt deg` | `right` / `left` | turn right / left |
| `arc deg radius` | | sew along a circle of *radius*, turning *deg* in total — positive curves right, negative curves left. Works with every stitch mode (satin arcs!) |
| `up` / `down` | `penup`/`pu`, `pendown`/`pd` | needle up = travel as a jump · needle down = sew |
| `setxy x y` | | move to an absolute position |
| `setx x` / `sety y` | | move one axis at a time |
| `seth deg` | `setheading` | set the heading absolutely |
| `home` | | return to `(0, 0)`, heading `0` |
| `push` / `pop` | | save the needle state (position, heading, pen) on a stack · jump back to it without sewing. Perfect for branching structures — no more sewing back out of every branch. Max 500 saved states; `pop` on an empty stack warns and is ignored |
| `cs` | `clearscreen`, `clear` | accepted for Logo familiarity; does nothing |

## Thread & stitch quality

| Command | Effect |
|---|---|
| `stitchlen mm` (`stitchlength`) | running-stitch length, clamped to 0.4–12 mm (default **2.5**) |
| `satin mm` | zigzag column of this width; penetration spacing set by `density`. `satin 0` returns to running stitch. Widths over ~8 mm tend to snag (you'll get a warning) |
| `density mm` | satin penetration spacing, 0.25–5 mm (default **0.4**) |
| `bean n` | bold line: each stitch sewn *n* times (forced odd, max 9). `bean 1` off |
| `estitch mm` | blanket stitch: prongs of this length on the left of travel, spaced by `stitchlen`. `estitch 0` off |
| `color n` | switch to thread *n* (emits a DST colour-change stop) |
| `stop` | shorthand for "next colour" |
| `trim` | cut the thread here (do this before a long jump) |
| `lock mm` | tie-in/tie-off securing: 4 micro back-stitches are sewn automatically wherever the thread starts or ends (design start/end, colour changes, trims, jumps ≥ 4 mm) so runs can't unravel. Size 0.3–1.5 mm (default **0.7**); `lock 0` disables |

## Fills

```text
fillangle 30
up setxy -26 -15 down
beginfill
  repeat 6 [ fd 30 rt 60 ]
endfill
```

| Command | Effect |
|---|---|
| `beginfill … endfill` | moves between them trace a **boundary** instead of sewing; `endfill` sews a tatami fill of the enclosed area. A pen-up move (`up … down`) starts a new ring — inner rings become **holes** (even-odd rule) |
| `fillangle deg` | direction of the fill rows (default 0) |
| `fillspacing mm` | row spacing, 0.25–5 mm (default **0.4**) |
| `filllen mm` | fill stitch length, 1–7 mm. By default the fill follows `stitchlen`; set `filllen` to override, `filllen 0` to follow again. Rows are brick-offset so penetrations don't line up |

## Control flow

| Syntax | Meaning |
|---|---|
| `repeat n [ … ]` | loop *n* times; `repcount` is the 1-based counter of the innermost repeat |
| `while cond [ … ]` | loop while the condition is true (non-zero) |
| `for "i from to step [ … ]` | counted loop, inclusive of *to*; read the counter with `:i`. The step is required and may be negative (`for "i 5 1 -2 [ … ]`). The counter doesn't leak after the loop |
| `if cond [ … ]` | run the block if the condition is non-zero |
| `if cond [ … ] else [ … ]` | …with an alternative |

```text
for "ring 1 6 1 [
  arc 360 :ring * 4
]
```

## Procedures

```text
to leaf :size
  repeat 2 [
    repeat 30 [ fd :size rt 3 ]
    rt 90
  ]
end

repeat 8 [ leaf 1.2 rt 45 ]
```

- `to name :a :b … end` defines a procedure with parameters. Parameters are local.
- Procedures may be **called before they're defined** in the source (signatures are pre-scanned).
- Recursion works; depth is limited to 200 calls.
- `exit` leaves the current procedure immediately.
- Built-in words can't be shadowed — `to while … end` is a parse error, not a silent surprise.

### Reporters — procedures that return values

`output expr` (alias `op`) returns a value from a procedure, which can then be used **anywhere an expression is expected**:

```text
to spiral_r :i
  output 2 * pow 1.1 :i
end

to clamp :v :lo :hi
  output min :hi max :lo :v
end

for "i 1 40 1 [ fd spiral_r :i rt 25 ]
```

- A procedure used as a value must reach `output`, or you get a friendly error.
- `output` and `exit` are only valid inside a procedure.
- Reporters can recurse: `to fact :n  if :n < 2 [ output 1 ]  output :n * fact :n - 1  end`.

## Variables

| Syntax | Meaning |
|---|---|
| `make "x expr` | set a variable; read it with `:x` |
| `local "x expr` | a variable that exists only inside the current procedure |

Scoping rules:

- `make` updates an existing **local** (a parameter or `local`) if one with that name is in scope; otherwise it writes a **global**.
- `local` at the top level is an error — use `make` there.

```text
to wobble :len
  local "step :len / 10
  make "step :step * 2   ; updates the local, not a global
  repeat 10 [ fd :step rt random 10 - 5 ]
end
```

## Expressions

Operator precedence, loosest to tightest:

1. `or`
2. `and`
3. comparisons `< > = <= >= !=` (return `1`/`0`; `=` and `!=` compare with a 1e-9 tolerance)
4. `+ -`
5. `* /`
6. unary `-`, prefix functions (`not`, `sin`, …)
7. numbers, `:variables`, `( … )`, reporter calls

`and` / `or` **short-circuit**, so guards like `:i > 0 and 10 / :i > 2` are safe. `not` is a prefix function and binds tightly — write `not (:a = 1)` when negating a comparison.

Arguments are written Logo-style, without commas or parentheses: `setxy random 20 random 20`. Use parentheses whenever you want to be explicit about grouping:

```text
seth ( noise2 xcor / 16 ycor / 16 ) * 720
```

### Functions

| Function | Returns |
|---|---|
| `random n` | a number in 0…*n* — **reproducible**, driven by the seed |
| `noise x` · `noise2 x y` | smooth seeded value noise in 0…1. Sample it slowly (divide coordinates by 10–20) for organic drift; same seed → same field |
| `sin deg` · `cos deg` | trigonometry in degrees |
| `sqrt n` · `abs n` · `round n` · `floor n` · `ceil n` | the usual suspects (`sqrt` of a negative is an error) |
| `min a b` · `max a b` · `pow a b` | minimum, maximum, power (a non-finite `pow` result is an error) |
| `mod a b` | floor modulo — always returns a value with the sign of *b* |
| `atan x y` | the **heading** of the vector (x, y): 0 = north, clockwise — so `atan 1 0` is 90 |
| `towards x y` | heading from the needle to the point (x, y) — `seth towards 0 0` aims home |
| `distance x y` | distance from the needle to the point (x, y) |

> Multi-argument functions parse each argument as a **full expression**, so a trailing operator is absorbed into the last argument: `distance 0 0 < 47` means `distance 0 (0 < 47)`. Parenthesise when you mean the comparison: `(distance 0 0) < 47`.

### Reporters (no arguments)

| Word | Value |
|---|---|
| `xcor` · `ycor` | the needle's position |
| `heading` | the needle's heading in degrees |
| `repcount` | 1-based counter of the innermost `repeat` |

## Randomness & determinism

Every run is deterministic: `random` and `noise` are driven by a seed (default 42). Reseed with:

```text
seed 7
```

The same seed always reproduces the same design — change the seed, change the piece. This matters for embroidery: what you previewed is exactly what the machine sews.

## Debugging

| Tool | What it does |
|---|---|
| `print expr` | log a value to the console |
| `print "label expr` | …with a label: `print "radius :r` → `radius: 1.5` |
| `mark` | drop a numbered pin on the preview at the needle's position. Pins appear as playback reaches them and are **never exported** to the machine or counted in stats |
| `assert cond` | stop with an error (and line number) if the condition is false — great for geometric invariants (`assert (distance 0 0) < 47`) |
| Playback scrubber | scrub the design stitch by stitch; the **source line being sewn is highlighted** in the editor and shown in the playback bar |
| Did-you-mean | typos in commands, variables, and procedure names suggest the closest match: `Unknown command "stichlen" — did you mean "stitchlen"?` |
| Warnings | non-fatal issues surface as chips and console lines: clamped values, merged tiny stitches, unclosed fills, hoop overflow, excessive density |

## Safety limits

Needlescript guards both your browser and your machine:

| Limit | Value |
|---|---|
| Max stitches per design | 60,000 |
| Max interpreter operations | 2,000,000 (catches infinite `while`/recursion) |
| Max call depth | 200 |
| Max `repeat` / `for` iterations | 200,000 |
| Stitch length | clamped to 0.4–12 mm |
| Sub-0.4 mm moves | merged into neighbours (too short to sew safely), with a warning |

---

## DST export

`Download .DST` produces a standard Tajima file: 3-byte ternary delta records, moves longer than 12.1 mm split automatically, colour changes as stop records, trims as triple jumps, and a correct 512-byte header (label, stitch/colour counts, extents). Load it onto any machine or into commercial software for final checks.

## Using the engine as a library

Everything in `src/lib/` is DOM-free:

```ts
import { run, designStats, toDST } from './lib/index.ts';

const result = run('repeat 36 [ fd 4 rt 10 ]', { seed: 7 });
// result.events   — stitch/jump/color/trim/mark stream ({ t, x, y, c, line })
// result.warnings — non-fatal issues
// result.printed  — output of print
// result.locks    — number of tie-in/tie-off locks added

const stats = designStats(result.events);  // counts, bounding box, max stitch…
const bytes = toDST(result.events, 'rose'); // Uint8Array, ready to save
```

Also exported: `tokenize`, `parse`, `applyLocks`, `makeRNG`, `makeNoise`, `suggest`, `svgToCode`, the command tables (`BUILTIN_ARITY`, `FUNC_ARITY`, `ALIASES`, `RESERVED`, `ZERO_FUNCS`), `LIMITS`, and `NeedlescriptError` (which carries the source line in `slLine`).

## Tests

```bash
npm test
```

~2,400 lines of Vitest suites in `src/lib/__tests__/` cover the tokenizer, parser, interpreter, language features (loops, reporters, locals, noise, arc, push/pop, debugging commands), locks, stats, DST encoding, and the SVG importer. The bundled examples are tested to run and fit the hoop. When in doubt about a behaviour, the tests are the spec.

## License

No license specified yet — all rights reserved.
