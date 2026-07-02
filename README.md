# NeedleScript

A Logo-inspired programming language and playground for **generative embroidery**. You write turtle-graphics code, NeedleScript turns it into machine-ready stitches — running stitch, satin, bean, blanket and tatami fills — previews them in a virtual hoop, and exports a Tajima `.DST` file you can sew on a real embroidery machine.

The goal: let creatives make embroidery that can't easily be drawn in traditional embroidery software — noise fields, recursion, parametric curves, randomness with a seed.

```text
// strands drift through a smooth noise field
def strand() [
  repeat 90 [
    seth (noise2 xcor / 16 ycor / 16) * 720
    fd 1.8
    if distance(0, 0) > 40 [ return ]
  ]
]

seed 9
stitchlen 2
repeat 14 [
  moveto random(64) - 32, random(64) - 32
  strand()
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

| Command                 | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `npm run build`         | typecheck + production build into `dist/`                     |
| `npm run build:lib`     | build the publishable `needlescript` library into `dist-lib/` |
| `npm run preview`       | serve the production build locally                            |
| `npm test`              | run the test suite once (Vitest)                              |
| `npm run test:watch`    | run tests in watch mode                                       |
| `npm run test:coverage` | run tests with V8 coverage                                    |
| `npm run lint`          | ESLint over the whole project                                 |

The app is a React 19 + TypeScript + Vite single-page app. The language engine itself (`src/lib/`) has **no DOM dependencies** and can be used as a standalone library (see [Using the engine as a library](#using-the-engine-as-a-library)).

### Project structure

```
src/
├── lib/                  the language engine (DOM-free)
│   ├── engine.ts         public library surface (re-exports everything below)
│   ├── tokenizer.ts      source → tokens (with character offsets)
│   ├── prescan.ts        procedures, globals and locals, collected before parsing
│   ├── parser.ts         tokens → AST (modern + classic syntax)
│   ├── interpreter.ts    AST → stitch events
│   ├── genmath.ts        scalars, vectors, paths & curves (RFC-3, hand-rolled)
│   ├── generators.ts     Poisson-disc scatter, Voronoi, hull, Lloyd's relax
│   ├── geometry.ts       Clipper2-backed offset & boolean ops (µm integer coords)
│   ├── machine.ts        stitch machine: satin, fills, underlay, limits
│   ├── postprocess.ts    locks, autotrim, density analysis, stats
│   ├── dst.ts            Tajima .DST binary encoder
│   ├── svg-importer.ts   SVG → NeedleScript source converter
│   └── __tests__/        Vitest suites (the de-facto behavioural spec)
├── components/           playground UI (editor, stage, playback, reference)
├── data.ts               thread palette, hoop constants, bundled examples
└── App.tsx               run pipeline, DST export, SVG import, drag & drop
```

---

## The playground

- **Editor** — write NeedleScript; `⌘`/`Ctrl`+`Enter` runs, `Tab` inserts two spaces.
- **REPL** — type a single command below the console; it's appended to the program and re-run (`↑`/`↓` for history). Great for nudging a design live.
- **Console** — run results, warnings, `print` output, and errors with line numbers.
- **Stage** — a 100 mm virtual hoop rendered on canvas: thread per colour, underlay drawn thinner and lighter, dashed jump lines, needle penetration points when zoomed, hoop-overflow and density warnings as chips, plus a **density heatmap toggle** (thread coverage in layers) for spotting bulletproof patches before they pucker.
- **Playback** — play (~7 s) or scrub the stitch sequence stitch by stitch. While scrubbed, the **source line currently sewing is highlighted in the editor** and shown next to the counter — the fastest way to answer "which line made this stitch?"
- **Examples** — bundled programs in the header dropdown (bloom, wreath, wander, star, badge, sampler, waves, tree, fern, flow, shell, patch, meadow, echo, shatter).
- **Parameters** — annotate any variable with a `// [min:max]` comment to expose it as a live slider or toggle in the Parameters panel below the editor. Drag sliders, lock individual parameters, randomize unlocked ones with the shuffle button, and pick named presets from a dropdown — all without re-running the program. See [Customizer](#customizer) below.
- **Download .DST** — export the current design as a Tajima stitch file.
- **Import SVG** — convert an SVG (button or drag & drop) into _editable_ NeedleScript code: filled shapes become `beginfill` blocks (subpaths become holes), strokes become outlines, colours map to the nearest thread. Supports `<path>` (M L H V C S Q T A Z), rect/circle/ellipse/line/polyline/polygon, groups and transforms.

---

## Customizer

Annotate variable declarations with comment brackets to expose them as **live controls** in the Parameters panel below the editor. The interpreter never sees the annotations — a program with sliders is still an ordinary program.

### Parameter controls

| Annotation                           | Control                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `let radius = 15  // [5:30]`         | **integer slider** — both bounds are whole numbers and the range spans > 1    |
| `let smooth = 0.5  // [0:1]`         | **smooth slider** — at least one float bound, or range ≤ 1; 100 steps         |
| `let n = 4  // [0.5:0.5:8]`          | **stepped slider** — `[min:step:max]`; any positive step including fractional |
| `let wave = 1  // [switch]`          | **toggle** — `0` = off, `1` = on                                              |
| `let mode = 0  // [switch:hypo,epi]` | **labelled toggle** — label pair shown on each side                           |
| `// --- Section ---`                 | **section divider** — groups controls with a horizontal rule and title        |

All three declaration styles work: `let name = value`, `make "name value`, and bare `name = value`.

### Randomize & lock

The **shuffle button** in the panel header randomises all unlocked parameters at once. Each parameter row has a **lock icon** (appears on hover; gold when active). Click it to pin that parameter from randomization without affecting manual slider control.

### Presets (snapshots)

Bundle curated values into named presets defined as comment lines — one per line, anywhere in the source:

```text
// @preset Classic Flower : bigR=96, rollR=60, pen=40, inside=1, layers=8
// @preset Dense Rosette  : bigR=100, rollR=63, pen=50, inside=1, layers=12
// @preset Minimal        : layers=1
```

`@snapshot` is accepted as an alias for `@preset`.

**Partial presets** (fewer keys than the total parameter count) set only the named parameters and leave the rest at their current values — the most common case. Values are always numbers (including `0`/`1` for switches); they are clamped and snapped to each parameter's configured range on apply.

When at least one `@preset` line exists, a **preset dropdown** appears below the panel header. Selecting a preset applies all its values immediately, overriding any locks. Moving any slider or switch after selecting a preset resets the dropdown to `—` to indicate a custom state.

**Copying a snapshot:** the **copy icon** next to the dropdown writes the current full parameter state as a `// @preset My Preset : …` comment to the clipboard. Before any presets exist, **right-click the panel header** → _Copy as preset_ achieves the same thing. Paste the result into the source, rename it, and it appears in the dropdown on the next run.

---

## AI generation

The REPL also works as an AI interface. Type `/ai` commands to generate, improve, or fix designs using any model available on [OpenRouter](https://openrouter.ai). An API key is required (free tier available at openrouter.ai/settings/keys).

### Setup

```
/ai apikey sk-or-v1-…     set and persist your OpenRouter API key
/ai model claude sonnet   choose a model (fuzzy match — "gpt-4o", "gemini flash", "llama" all work)
/ai reset                 remove the stored key and model selection
/ai help                  show all commands
```

The API key and selected model are stored in `localStorage` and persist across reloads. Keys never leave the browser — they're sent directly to `api.openrouter.ai`.

### Commands

| Command                     | What it does                                                            |
| --------------------------- | ----------------------------------------------------------------------- |
| `/ai create <description>`  | Generate a new design from scratch — replaces the editor                |
| `/ai improve <instruction>` | Modify the current code to match the instruction                        |
| `/ai fix <instruction>`     | Fix the current code, including the last compile error                  |
| `/ai explain <question>`    | Answer a question about the current code; prints to the console         |
| `/ai <anything>`            | If there's existing code, acts as _improve_; otherwise acts as _create_ |

### Model autocomplete

When you type `/ai model ` the REPL shows a filtered list of all models available on your OpenRouter account. Use `↑`/`↓` to navigate, `Tab` to complete, `Enter` to confirm.

### How generation works

1. The AI receives a condensed NeedleScript language reference as its system prompt — all commands, limits, and embroidery best-practices.
2. For _improve_ and _fix_, the current source is included in the request.
3. For _fix_, the last compile error is included automatically so the model knows what went wrong.
4. The generated code is compiled silently. If it fails, the AI is asked once more with the error. The result is then placed in the editor and run.

---

# Language guide

NeedleScript has two dialects that **mix freely in the same program** and compile to exactly the same stitches:

- the **modern syntax** — `let x = 5`, `setxy(a, b)`, `def leaf(size) [ … ]`, `return`, `for i = 1 to 10`, `else if`, `%`, `!`, `==`, `true`/`false`, `//` comments;
- the **classic Logo syntax** — `make "x 5`, `setxy :a :b`, `to leaf :size … end`, `output`, `for "i 1 10 1`, `;` comments — which remains valid forever.

The intended idiom is a mix: classic prefix words where they shine (`fd 10 rt 90`, `up … down`), call parentheses wherever expressions nest. The bundled _meadow_ example is the reference for that style.

This guide is organised from the ground up. If you're new, read it top to bottom; if you're hunting a specific command, jump to its tier:

1. **Language fundamentals** — [Basics](#basics), [Movement](#movement), [Control flow](#control-flow), [Procedures](#procedures), [Variables](#variables), [Expressions](#expressions), [Lists](#lists).
2. **Embroidery fundamentals** — [how embroidery actually works](#how-embroidery-actually-works), [Thread & stitch quality](#thread--stitch-quality), [Fills](#fills).
3. **Generative toolkit** — [Generative math](#generative-math), [Randomness & determinism](#randomness--determinism).
4. **Advanced shaping** — [Transforms](#transforms), [Effects](#effects).
5. **Production quality** — [Professional embroidery & fabric physics](#professional-embroidery--fabric-physics).

## Basics

- **Units are millimetres.** The hoop is 100 mm across; the sewable field is a 47 mm radius around the origin `(0, 0)` at the centre.
- **Heading is in degrees, `0` = up/north, clockwise** (Logo convention). `rt 90` faces east.
- Words are **case-insensitive** (`FD 10` = `fd 10`).
- `//`, `#`, and `;` each start a comment to the end of the line. A lone `/` is still division — only two _adjacent_ slashes comment.
- There are no statement separators — whitespace and newlines are interchangeable.
- The only value type is the **number** (millimetres, degrees, counts, truth values).
- Truthiness: `0` is false, anything else is true. Comparisons return `1` or `0`. `true` and `false` are literals for `1` and `0`.
- The `'` character is reserved (`single-quote strings are reserved for a future version`) — it has never been valid, so quoted strings can arrive later without changing any program's meaning.

### Negative numbers vs subtraction

Following Logo convention, a minus sign with a space before it and none after it is a **negative literal**, not subtraction:

```text
setxy -6 -21       ; two arguments: the point (-6, -21)
fd 10 - 5          ; one argument: fd 5 (subtraction)
fd 10 -5           ; error — "-5" is a second value, but fd takes one argument
```

Inside call parentheses the ambiguity disappears: `setxy(-6, -21)` and `fd(10 - 5)` mean exactly what they say, with any spacing.

## Movement

| Command             | Aliases                      | Effect                                                                                                                                                                                                                                               |
| ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fd n`              | `forward`                    | sew forward _n_ mm (long moves auto-split at `stitchlen`)                                                                                                                                                                                            |
| `bk n`              | `back`, `backward`           | sew backward _n_ mm                                                                                                                                                                                                                                  |
| `rt deg` / `lt deg` | `right` / `left`             | turn right / left                                                                                                                                                                                                                                    |
| `arc deg radius`    |                              | sew along a circle of _radius_, turning _deg_ in total — positive curves right, negative curves left. Works with every stitch mode (satin arcs!)                                                                                                     |
| `circle r`          |                              | full closed circle of radius _r_ — exactly `arc 360 r`. Works in all stitch modes                                                                                                                                                                    |
| `up` / `down`       | `penup`/`pu`, `pendown`/`pd` | needle up = travel as a jump · needle down = sew                                                                                                                                                                                                     |
| `setxy x y`         |                              | move to an absolute position                                                                                                                                                                                                                         |
| `setx x` / `sety y` |                              | move one axis at a time                                                                                                                                                                                                                              |
| `seth deg`          | `setheading`                 | set the heading absolutely                                                                                                                                                                                                                           |
| `home`              |                              | return to `(0, 0)`, heading `0`. **Warning:** if the pen is _down_, this sews a line straight back to the origin. For a non-sewing return use `moveto 0 0` or `gohome`                                                                               |
| `moveto x y`        | `jump`                       | **jump to `(x, y)` without sewing.** Pen state is preserved: if the pen was down it ends down and the next move sews normally. Equivalent to `up setxy x y down` when pen is down, or `up setxy x y` when already up. Respects the current transform |
| `gohome`            |                              | pen-safe return to origin (`moveto 0 0`): jumps to `(0, 0)` without sewing, pen state preserved. Does _not_ reset heading — add `seth 0` for a full neutral reset                                                                                    |
| `push` / `pop`      |                              | save the needle state (position, heading, pen) on a stack · jump back to it without sewing. Perfect for branching structures — no more sewing back out of every branch. Max 500 saved states; `pop` on an empty stack warns and is ignored           |
| `cs`                | `clearscreen`, `clear`       | accepted for Logo familiarity; does nothing                                                                                                                                                                                                          |

## Control flow

| Syntax                                         | Meaning                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `repeat n [ … ]`                               | loop _n_ times; `repcount` is the 1-based counter of the innermost repeat   |
| `while cond [ … ]`                             | loop while the condition is true (non-zero)                                 |
| `for i = from to to [ … ]`                     | counted loop, inclusive of _to_; the step defaults to 1                     |
| `for i = from to to step s [ … ]`              | …with an explicit (possibly negative) step: `for i = 10 to 1 step -2 [ … ]` |
| `for "i from to step [ … ]`                    | the classic spelling; the step is required, read the counter with `:i`      |
| `for x in xs [ … ]`                            | iterate the elements of a [list](#lists); the loop variable doesn't leak    |
| `break`                                        | end the **innermost enclosing loop** immediately                            |
| `continue`                                     | skip to the next iteration of the innermost enclosing loop                  |
| `if cond [ … ]`                                | run the block if the condition is non-zero                                  |
| `if cond [ … ] else if cond2 [ … ] else [ … ]` | chains of alternatives, any depth                                           |

The loop counter is read as a plain name (`i`) or classic style (`:i`) and **doesn't leak** after the loop. `to` and `step` end the bound expressions naturally, so `for i = 1 to n * 2 [ … ]` needs no parentheses. (`step` is a reserved word — pick another name for variables and procedures.)

```text
for ring = 1 to 6 [
  arc 360 ring * 4
]
```

### Leaving loops early — `break` and `continue`

`break` and `continue` work in all loop forms — `repeat`, `while`, both `for` spellings, and `for … in` — and through any nesting of `if`/`else` blocks. `continue` skips the rest of the current iteration: `repcount` advances normally, a `while` re-evaluates its condition, a `for` applies the step (negative steps included), a `for … in` moves to the next element. With `true` as a literal, `while true [ … break ]` is the idiomatic search loop:

```text
repeat 30 [                         // walk until we leave the cell
  seth(snoise2(xcor / 11, ycor / 11) * 360)
  fd 1.5
  if !inpath(pos(), cell) [ break ]
]
```

The four control-transfer words, from smallest to largest jump:

| Word                    | Leaves                          | Notes                                                              |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `continue`              | current iteration               | innermost loop only                                                |
| `break`                 | innermost loop                  | outer loops unaffected; the outer `repcount` becomes visible again |
| `exit` / bare `return`  | current procedure               | unwinds any loops inside it                                        |
| `output e` / `return e` | current procedure, with a value | likewise                                                           |

`break` and `continue` are **lexical**, checked at parse time: they must be written inside a loop body in the same procedure. A `break` inside a helper procedure can't end a loop in its _caller_ — the parse error says so and points you at `return`/`exit`, which leave the procedure instead. (They're reserved words now — a program defining `to break … end` gets a loud error with a rename hint.) Loop control is invisible to the stitch machine: a buffered satin column survives a `break` and flushes on the next pen or mode change as always.

## Procedures

```text
def leaf(size) [
  repeat 2 [
    repeat 30 [ fd size rt 3 ]
    rt 90
  ]
]

repeat 8 [ leaf(1.2) rt 45 ]
```

- `def name(a, b) [ … ]` defines a procedure; the body is a bracket block like every other block. Parameters are local and read as plain names (`size`) or classic style (`:size`).
- The classic form `to name :a :b … end` is equivalent and remains valid.
- Calls work both ways: `leaf(1.2)` or `leaf 1.2` — see [Call syntax](#call-syntax-with-parentheses) for the one rule that separates them.
- Procedures may be **called before they're defined** in the source (signatures are pre-scanned).
- Recursion works; depth is limited to 200 calls.
- `return` (or classic `exit`) leaves the current procedure immediately.
- Names can't collide: built-in words can't be shadowed (`def while() [ … ]` is a parse error), a procedure and a variable can't share a name, and parameters can't reuse a procedure or built-in name. Loud and early beats clever.

### Reporters — procedures that return values

`return expr` (classic: `output expr`, alias `op`) returns a value from a procedure, which can then be used **anywhere an expression is expected**:

```text
def spiral_r(i) [
  return 2 * pow(1.1, i)
]

def clamp(v, lo, hi) [
  return min(hi, max(lo, v))
]

for i = 1 to 40 [ fd spiral_r(i) rt 25 ]
```

- A procedure used as a value must reach `return`/`output`, or you get a friendly error.
- `return` and `output`/`exit` are only valid inside a procedure.
- Reporters can recurse: `def fact(n) [ if n < 2 [ return 1 ] return n * fact(n - 1) ]`.

## Variables

| Syntax                                    | Meaning                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `let x = expr`                            | declare a variable: a **global** at the top level, a **local** inside a procedure |
| `x = expr`                                | assign: updates a local if one is in scope, otherwise writes a global             |
| `x += e` · `x -= e` · `x *= e` · `x /= e` | compound assignment: `x += 2` is `x = x + 2`                                      |
| `make "x expr`                            | the classic spelling of assignment — same store, same rules                       |
| `local "x expr`                           | the classic spelling of an in-procedure `let`                                     |

Variables are read as plain names (`fd x`) or classic style (`fd :x`) — both resolve identically.

Scoping rules:

- Assignment (`x = …` / `make`) updates an existing **local** (a parameter, `let`, or `local`) if one with that name is in scope; otherwise it writes a **global**. One mental model for both spellings.
- `let` of a name that's already declared in the same scope, or that collides with a built-in or procedure, is a parse error with a did-you-mean.
- Plain `x = 1` without a prior `let` is allowed (Logo `make` semantics — friendly for one-liners).
- `local` at the top level is an error — use `make` or a top-level `let` there.
- Reading a declared-but-never-assigned variable (e.g. only assigned inside an `if` that didn't run) is a runtime error: _"never assigned on this path"_.

```text
def wobble(len) [
  let pace = len / 10
  pace *= 2              // updates the local, not a global
  repeat 10 [ fd pace rt random(10) - 5 ]
]
```

## Expressions

Operator precedence, loosest to tightest:

1. `or`
2. `and`
3. comparisons `< > = == <= >= !=` (return `1`/`0`; equality compares with a 1e-9 tolerance — `=` and `==` are the same operator)
4. `+ -`
5. `* / %`
6. unary `-`, prefix functions (`not`/`!`, `sin`, …)
7. numbers, `true`/`false`, variables, `( … )`, calls

`and` / `or` **short-circuit**, so guards like `i > 0 and 10 / i > 2` are safe. `not` (spelled `!` if you prefer) is a prefix function and binds tightly — write `!(a = 1)` when negating a comparison. `%` is the same operation as `mod`: **floor modulo, the result takes the sign of the divisor** — `-7 % 3` is `2` here, not `-1` as in C or JavaScript.

### Call syntax with parentheses

Any function, command or procedure can be called with parentheses and commas — **when the `(` is glued to the name**:

```text
fd(10)                          // call: fd with one argument
fd (10)                         // classic: fd, argument is the grouped expression (10)
setxy(random(20), random 20)    // styles mix freely inside argument slots
xcor()                          // zero-argument calls are fine
min(3, 4)  ·  min 3 4           // identical
```

That one space is the entire rule: glued `(` = argument list, spaced `(` = Logo grouping, so every existing program means what it always meant. Argument counts are checked against the callee's signature, and a trailing comma is allowed.

Classic prefix arguments are written without commas or parentheses: `setxy random 20 random 20`. Use parentheses whenever you want to be explicit about grouping:

```text
seth ( noise2 xcor / 16 ycor / 16 ) * 720
```

> **Why parens pay off:** classic multi-argument calls parse each argument as a **full expression**, so a trailing operator is absorbed into the last argument — `distance 0 0 < 47` means `distance 0 (0 < 47)`. Single-argument functions bind tightly instead (`random 64 - 32` is `(random 64) - 32`), so you have to know each function's arity _and_ which rule it follows. Call parens give every callable one rule:
>
> ```text
> bloom clamp 2.5 + random 3 2.5 5 :kind          ; classic — correct, but you must count arities to read it
> bloom(clamp(2.5 + random(3), 2.5, 5), kind)     // modern — the parens are the structure
> ```

### Functions

| Function                                              | Returns                                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `random n`                                            | a number in 0…_n_ — **reproducible**, driven by the seed                                                                   |
| `noise x` · `noise2 x y`                              | smooth seeded value noise in 0…1. Sample it slowly (divide coordinates by 10–20) for organic drift; same seed → same field |
| `sin deg` · `cos deg`                                 | trigonometry in degrees                                                                                                    |
| `sqrt n` · `abs n` · `round n` · `floor n` · `ceil n` | the usual suspects (`sqrt` of a negative is an error)                                                                      |
| `min a b` · `max a b` · `pow a b`                     | minimum, maximum, power (a non-finite `pow` result is an error)                                                            |
| `mod a b`                                             | floor modulo — always returns a value with the sign of _b_. The `%` operator is the same operation                         |
| `atan x y`                                            | the **heading** of the vector (x, y): 0 = north, clockwise — so `atan 1 0` is 90                                           |
| `towards x y`                                         | heading from the needle to the point (x, y) — `seth towards 0 0` aims home                                                 |
| `distance x y`                                        | distance from the needle to the point (x, y)                                                                               |

> Classic multi-argument calls parse each argument as a **full expression**, so a trailing operator is absorbed into the last argument: `distance 0 0 < 47` means `distance 0 (0 < 47)`. Parenthesise when you mean the comparison — `(distance 0 0) < 47` — or use call parens, where it can't happen: `distance(0, 0) < 47`.

### Reporters (no arguments)

| Word            | Value                                     |
| --------------- | ----------------------------------------- |
| `xcor` · `ycor` | the needle's position                     |
| `heading`       | the needle's heading in degrees           |
| `repcount`      | 1-based counter of the innermost `repeat` |

## Lists

A second value type alongside numbers: ordered, nestable, ragged lists of numbers (and other lists). A point is `[x, y]`, a path is a list of points, a palette is a list of thread numbers. Lists live entirely in the program — they never reach the stitch stream.

```text
let palette = [2, 3, 5, 7]      // literal; nesting and trailing commas allowed
let path = []                   // empty list

print palette[0]                // 2  — indexing is 0-based
print palette[-1]               // 7  — negatives count from the end
palette[1] = 4                  // index assignment (+= -= *= /= work too)
let [x, y] = pos()              // destructuring (fixed arity, flat)

for p in path [                 // iterate elements; length is captured at
  setpos(p)                     // loop entry, elements are read live
]
```

**Reference semantics, like Python/JS.** Assignment shares the list; mutate through any alias and every alias sees it. `copy(xs)` makes an independent deep copy:

```text
let a = [1, 2, 3]
let b = a            // same list
b[0] = 9
print a              // [9, 2, 3]
let c = copy(a)      // deep copy — c is independent
```

**The `[` rule.** Brackets already delimit blocks; position decides the meaning. After a header with a space (`repeat 4 [ … ]`) or glued to a number or `:var` (`repeat 4[…]`, `repeat :n[…]`) a `[` is a **block** — classic programs are untouched. At the start of an expression it's a **list literal**. Glued to a bare name, `)` or `]` it's an **index**: `xs[0]`, `pos()[1]`, `grid[i][j]`. The one sharp edge: `repeat n[ fd 10 ]` with a modern bare name reads as indexing — the error tells you to add the space.

**Loud over convenient.** A non-integer index, an out-of-range index (either direction), a list in a condition (`if xs [ … ]` → _use `len(xs) > 0`_), a list in arithmetic (`[1, 2] + 1`), or a list fed to a scalar command (`fd [1, 2]`) are all errors that name the operation and the line — a wrong index in embroidery is a wrong stitch. Equality is the exception: `=`/`==` compare lists **deeply** (with the usual 1e-9 tolerance) and a number never equals a list (that's `0`, not an error).

### List functions

All list functions are **call-syntax only**: `len(xs)`, never `len xs` (this is what lets `range` and `slice` take optional arguments).

| Function                                           | Returns / effect                                                                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filled(n, v)`                                     | new list of _n_ deep copies of _v_                                                                                                                                            |
| `len(xs)` · `islist(v)`                            | element count · `1`/`0`                                                                                                                                                       |
| `first(xs)` · `last(xs)`                           | `xs[0]` · `xs[-1]` (the Logo heritage names)                                                                                                                                  |
| `append(xs, v)` · `prepend(xs, v)`                 | **mutates**: adds _v_ at the end / front (statement)                                                                                                                          |
| `insertat(xs, i, v)`                               | **mutates**: inserts at index _i_ (0…len allowed)                                                                                                                             |
| `removeat(xs, i)`                                  | **mutates**: removes index _i_ and **returns** the removed value                                                                                                              |
| `concat(a, b)`                                     | new list (shallow — elements are shared references)                                                                                                                           |
| `slice(xs, a)` · `slice(xs, a, b)`                 | new list, Python semantics incl. negative bounds, clamped                                                                                                                     |
| `reverse(xs)` · `sort(xs)`                         | **new** lists (pure on purpose — they compose in expressions); `sort` is numbers-only, ascending, stable                                                                      |
| `copy(xs)`                                         | deep copy                                                                                                                                                                     |
| `indexof(xs, v)` · `contains(xs, v)`               | first index of _v_ (deep, tolerant compare) or −1 · `1`/`0`                                                                                                                   |
| `sum(xs)` · `mean(xs)` · `minof(xs)` · `maxof(xs)` | aggregates, numbers only; `sum([])` is 0, the rest error on an empty list                                                                                                     |
| `pick(xs)`                                         | random element — **seeded**, exactly one RNG draw                                                                                                                             |
| `shuffle(xs)`                                      | new shuffled list — **seeded**, exactly one main-stream draw (it forks a child RNG, see [Randomness & determinism](#randomness--determinism)): same seed, same order, forever |
| `pos()`                                            | the needle's position as `[xcor, ycor]`                                                                                                                                       |
| `setpos(p)`                                        | command: like `setxy p[0] p[1]` — makes record/replay symmetric: `append(path, pos())` … `setpos(p)`                                                                          |

> **`push`/`pop` are taken.** They save and restore the _turtle state_ (see Movement) and keep that meaning. To grow a list, use `append(xs, v)` — the `push` arity error will remind you.

### Sequences

| Function                                      | Returns                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `range(n)` · `range(a, b)` · `range(a, b, s)` | `[0…n-1]` / `[a…b-1]` / stepped — 0-based, **end-exclusive**                                             |
| `steps(a, b)` · `steps(a, b, s)`              | `[a, a+s, a+2s, …, b]` — **end-inclusive**, default step 1. `steps(0, 6, 0.2)` → 31 elements ending at 6 |

`range` is your go-to for integer index loops and zero-based sequences. `steps` is for continuous sweeps where you want exact endpoints — angles, time parameters, grid coordinates.

### Higher-order functions — map, filter, reduce

Three functions that take a `@reference` to a procedure (or built-in) and apply it across a list:

| Function                | Returns                                                 |
| ----------------------- | ------------------------------------------------------- |
| `map(xs, @fn)`          | new list of `fn(element)` for each element              |
| `filter(xs, @fn)`       | new list keeping elements where `fn(element)` is truthy |
| `reduce(xs, @fn, init)` | single value: `fn(fn(fn(init, xs[0]), xs[1]), …)`       |

The `@name` syntax creates a reference to a user-defined procedure or a built-in function. Any name that returns a value works: `@abs`, `@vlen`, `@vadd`, `@sin`, etc. Statement-only commands like `@fd` are rejected.

```text
def double(x) [ return x * 2 ]
def big(x)    [ return x > 4 ]
def add(a, b) [ return a + b ]

print map([1, 2, 3], @double)          // [2, 4, 6]
print filter([1, 2, 3, 4, 5], @big)    // [5]
print reduce([1, 2, 3, 4], @add, 0)    // 10

// Built-in refs compose naturally:
print map([-3, -1, 2], @abs)           // [3, 1, 2]
print reduce([[1, 2], [3, 4]], @vadd, [0, 0])   // [4, 6]

// A pipeline: angle sweep → points → smooth curve
def petal(t) [ return vfromheading(t * 60, 20 + sin(t * 180) * 8) ]
let ring = map(steps(0, 6, 0.25), @petal)
sewpath(catmull(ring, 2))
```

`print` formats lists as `[1, 2, 3]` (nested as `[[0, 1], [2, 3]]`, capped at 64 elements with `… +n more`). List builtin names are resolved only at call position, so classic programs that use names like `:len` for parameters keep working, and a `def` of the same name shadows the builtin.

## How embroidery actually works

If your background is software more than the sewing room, a handful of physical facts explain almost every command in this guide. An embroidery machine doesn't _draw_ — it punches a needle through fabric along a path of points, and what you actually see is **thread held under tension**. That one constraint shapes everything below.

- **Three stitch families do most of the work.** _Running stitch_ is a thin dashed line — outlines, fine detail, and the travel runs that carry thread between shapes (`fd`, `stitchlen`). _Satin_ is a dense zigzag laying glossy parallel thread across a column — the go-to for borders, lettering, and leaves (`satin`). _Tatami_ fills a whole area with packed rows of running stitch (`beginfill … endfill`). Choose by shape: lines want running, thin strips want satin, broad areas want a fill.
- **Stitch length is bounded by physics, not taste.** Very short stitches pile thread up and perforate the fabric; very long ones snag and loop because nothing holds their middle down. That's why `stitchlen` clamps to 0.4–12 mm and satin columns wider than ~8 mm earn a snag warning.
- **Direction is visible.** Thread is shiny, so a shape reads differently depending on which way its stitches run — the same fill can look like two different colours under raking light. `fillangle` and the directional `fill @fn` exist because the _angle_ is a design decision, not an afterthought.
- **Coverage is measured in layers.** Pile too much thread on one spot and the fabric stiffens, puckers, and starts deflecting and breaking needles. NeedleScript tracks _thread coverage in layers_ (one clean satin column or fill pass ≈ one layer) and warns past ~2.5–3.5 — see `maxdensity` and the density heatmap.
- **Fabric fights back — push and pull.** Thread tension drags fabric inward along the stitch axis, so a digitized 4 mm column sews out narrower and outlines creep off their fills. `pullcomp` widens columns and extends fill rows to cancel this distortion so shapes sew at their intended size.
- **The fabric needs hidden help.** _Stabilizer_ (backing) under the hoop and _underlay_ (foundation stitches sewn before the visible layer) keep stretchy material from shifting and lift the top thread out of the pile. You never see underlay in the finished piece, but it's the single biggest difference between hobby and professional results — see `underlay` / `fillunderlay`.
- **Connector threads must be managed.** Every jump between shapes strings a loose thread across the fabric, and every run that starts or ends can unravel. `trim` / `autotrim` cut the connectors and `lock` ties off the ends automatically.

None of this is mandatory to begin — `fd`, `rt`, and `repeat` already sew. But these facts are _why_ the stitch-quality, fill, and professional commands further down exist, and why "what you preview is what the machine sews" is a promise NeedleScript works hard to keep.

## Thread & stitch quality

These commands switch between the stitch families from the [primer](#how-embroidery-actually-works) and tune how thread lands on fabric. Running stitch is the default; `satin` and the rest stay active until you change them, applying to every move that follows.

| Command                         | Effect                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stitchlen mm` (`stitchlength`) | running-stitch length, clamped to 0.4–12 mm (default **2.5**)                                                                                                                                                                                                                     |
| `satin mm`                      | zigzag column of this width; penetration spacing set by `density`. `satin 0` returns to running stitch. Widths over ~8 mm tend to snag (you'll get a warning). `satin @fn` instead drives the column from a **shape reporter** you write — see _Programmable satin columns_ below |
| `density mm`                    | satin penetration spacing, 0.25–5 mm (default **0.4**)                                                                                                                                                                                                                            |
| `bean n`                        | bold line: each stitch sewn _n_ times (forced odd, max 9). `bean 1` off                                                                                                                                                                                                           |
| `estitch mm`                    | blanket stitch: prongs of this length on the left of travel, spaced by `stitchlen`. `estitch 0` off                                                                                                                                                                               |
| `color n`                       | switch to thread _n_ (emits a DST colour-change stop)                                                                                                                                                                                                                             |
| `stop`                          | shorthand for "next colour"                                                                                                                                                                                                                                                       |
| `trim`                          | cut the thread here (long travels also get one automatically — see `autotrim`)                                                                                                                                                                                                    |
| `lock mm`                       | tie-in/tie-off securing: 4 micro back-stitches are sewn automatically wherever the thread starts or ends (design start/end, colour changes, trims, jumps ≥ 4 mm) so runs can't unravel. Size 0.3–1.5 mm (default **0.7**); `lock 0` disables                                      |

## Fills

A fill covers an enclosed area with rows of stitching (_tatami_). You don't sew the area directly — you trace its **boundary** between `beginfill` and `endfill`, and the engine packs rows inside. `fillangle` sets which way those rows run, and because thread is shiny that angle is a visible design choice, not a throwaway default.

```text
fillangle 30
up setxy -26 -15 down
beginfill
  repeat 6 [ fd 30 rt 60 ]
endfill
```

| Command                                   | Effect                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `beginfill … endfill`                     | moves between them trace a **boundary** instead of sewing; `endfill` sews a tatami fill of the enclosed area. A pen-up move (`up … down`) starts a new ring — inner rings become **holes** (even-odd rule)         |
| `fillangle deg`                           | direction of the fill rows (default 0)                                                                                                                                                                             |
| `fillspacing mm`                          | row spacing, 0.25–5 mm (default **0.4**)                                                                                                                                                                           |
| `filllen mm`                              | fill stitch length, 1–7 mm. By default the fill follows `stitchlen`; set `filllen` to override, `filllen 0` to follow again. Rows are brick-offset so penetrations don't line up                                   |
| `fill dir @field` / `fill shape @texture` | arms a **programmable fill** for the next `beginfill … endfill`: a reporter drives the row direction (a contour / grain / flow fill) and/or the per-row spacing, length and brick — see _Programmable fills_ below |

## Generative math

Lists made the data representable; the generative-math builtins make it _generatable_. Three conventions, stated once and used everywhere: **a point is `[x, y]`, a path is a list of points, a region is a closed path** (the closing segment is implicit). Every function below speaks that vocabulary, so outputs of one feed inputs of the next — `scatter` → `voronoi` → `offsetpath` → `resample` → `sewpath` compose without glue code. All of them are **call-syntax only**, like the list functions.

```text
seed 4
let tiles = voronoi(scatter(9))          // Poisson-disc points → Voronoi cells
for cell in tiles [
  for ring in offsetpath(cell, -0.9) [   // inset each cell (may vanish — loop skips)
    sewpath(resample(ring, 2.2))         // even 2.2 mm stitches along the ring
  ]
  trim
]
```

(See the bundled **shatter** example for the full version with flow-field hatching.)

### Scalars

| Function                             | Returns                                     |
| ------------------------------------ | ------------------------------------------- |
| `lerp(a, b, t)`                      | a + (b − a)·t, _t_ unclamped                |
| `remap(v, inlo, inhi, outlo, outhi)` | linear remap, unclamped                     |
| `clamp(v, lo, hi)`                   | min(hi, max(lo, v))                         |
| `smoothstep(e0, e1, x)`              | Hermite ease 0…1                            |
| `gauss(mu, sigma)`                   | seeded normal (Box-Muller, exactly 2 draws) |

### Noise

| Function                             | Returns                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snoise2(x, y)` · `snoise3(x, y, z)` | seeded simplex noise in **−1…1** (industry convention; legacy `noise`/`noise2` keep 0…1). Same seed, same field, forever. The _z_ axis is for **variation**, not space: `snoise3(x/14, y/14, motif * 50)` gives each motif its own field |
| `fbm2(x, y, octaves)`                | fractal sum of `snoise2`: lacunarity 2.0, gain 0.5, octaves 1–8 (clamped with a warning), normalised to ≈ −1…1                                                                                                                           |

### Vectors (points)

One angle rule: **everything heading-like uses turtle degrees** (0 = north, clockwise positive), matching `seth`, `atan`, `towards`.

| Function                                 | Returns                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `vadd(a, b)` · `vsub(a, b)`              | new point                                                                                              |
| `vscale(a, s)` · `vlerp(a, b, t)`        | new point                                                                                              |
| `vdot(a, b)` · `vlen(a)` · `vdist(a, b)` | number                                                                                                 |
| `vnorm(a)`                               | unit vector; the zero vector is an **error**, not `[0, 0]` — a silent default heading is a stealth bug |
| `vrot(a, deg)`                           | rotated **clockwise** for positive deg (matches `rt`)                                                  |
| `vheading(a)`                            | turtle heading of the vector (≡ `atan a[0] a[1]`)                                                      |
| `vfromheading(deg, len)`                 | the inverse — `vfromheading(heading, 1)` is the needle's direction                                     |

There is **no operator broadcasting**: `[1, 2] + [3, 4]` stays a loud error, now with hints (`use vadd(a, b) for element-wise, concat(a, b) to join`). The reason is audience-specific: in Python that expression is _concatenation_, and silently giving it NumPy semantics is the kind of bug that sews before it's noticed.

### Segments

Point-to-point distance is covered by `vdist`; point-in-region by `inpath`. These three fill the remaining gap: **point-to-segment** and **segment-to-segment** queries.

| Function                   | Returns                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `segisect(a0, a1, b0, b1)` | the intersection point `[x, y]` of segment `a0→a1` and `b0→b1`, or `[]` if they don't cross. Segment test, not infinite-line — the rails must actually meet. Collinear overlapping segments return the midpoint of the overlap |
| `segdist(p, a, b)`         | shortest distance from point `p` to segment `a→b` — if the perpendicular foot falls outside the segment, you get the distance to the nearer endpoint. A zero-length segment behaves like `vdist(p, a)`                         |
| `nearestonpath(p, path)`   | the closest point to `p` lying anywhere on `path` (vertices _or_ along its segments), as a single `[x, y]`. The path is open (no implicit closing segment). O(len(path)) per call                                              |

`segisect` returns `[]` (not an error) when segments don't meet — mirroring `nearestsewn`'s "empty list means none" convention. `nearestonpath` always returns a point for a non-empty path; an empty `path` is a loud error.

```text
// mark every crossing in a grid of segments
let hlines = []
let vlines = []
for i = -4 to 4 [
  append(hlines, [[-40, i * 9], [40, i * 9]])
  append(vlines, [[i * 9, -40], [i * 9, 40]])
]
for h in hlines [
  for v in vlines [
    let hit = segisect(h[0], h[1], v[0], v[1])
    if len(hit) > 0 [
      up  moveto hit[0] hit[1]  down
      circle 0.6
    ]
  ]
]
```

### Paths & curves

| Function                                            | Returns                                                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pathlen(path)`                                     | total polyline length                                                                                                                                                   |
| `resample(path, mm)`                                | new path whose segments are each exactly _mm_ long (the last may be shorter), first & last preserved — the bridge between math-space curves and physical stitch spacing |
| `chaikin(path, n)`                                  | corner-cut smoothing, _n_ iterations 1–6                                                                                                                                |
| `catmull(points, mm)`                               | Catmull-Rom spline through the control points, resampled                                                                                                                |
| `bezier(p0, c0, c1, p1, mm)`                        | cubic Bézier, resampled                                                                                                                                                 |
| `centroid(path)` · `bbox(path)`                     | point · `[minx, miny, maxx, maxy]`                                                                                                                                      |
| `xlate(path, dx, dy)`                               | new path, translated — the functional twin of `translate`                                                                                                               |
| `xrotate(path, deg)` · `xrotate(path, deg, cx, cy)` | new path, rotated clockwise (optional pivot) — twin of `rotate`/`rotateabout`                                                                                           |
| `xscale(path, s)` · `xscale(path, sx, sy)`          | new path, scaled uniformly or per-axis — twin of `scale`/`scalexy`                                                                                                      |
| `xmirror(path, deg)`                                | new path, reflected across heading _deg_ — twin of `mirror`                                                                                                             |
| `sewpath(path)`                                     | **command**: exactly `for p in path [ setpos(p) ]` — pen state, stitch mode, satin and auto-split all apply as if hand-walked                                           |

### Generators (seeded)

| Function                                        | Returns                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `scatter(mindist)` · `scatter(mindist, region)` | Poisson-disc (Bridson) points — over the sewable 47 mm field, or inside the region polygon. Capped at 20,000 points  |
| `voronoi(points)` · `voronoi(points, region)`   | one cell (a region) per input point, **in input order**, clipped to the sewable disc or the given region             |
| `triangulate(points)`                           | Delaunay triangles: a list of 3-point regions                                                                        |
| `hull(points)`                                  | convex hull as a region, counter-clockwise                                                                           |
| `relax(points, n)`                              | _n_ rounds of Lloyd's relaxation (each point moves to its Voronoi cell's centroid) — evens out spacing for stippling |

### Geometry ops

Backed by Clipper2 on ×1000 integer coordinates (µm precision) — results are platform-stable.

| Function                 | Returns                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `offsetpath(region, mm)` | list of regions — positive inflates, negative shrinks. Shrinking may split a shape into several or into **none** (an empty list, not an error — loops over it naturally do nothing). Round joins |
| `clippaths(a, b, "op)`   | boolean of two regions; op ∈ `"union` `"intersect` `"difference` `"xor`; returns a list of regions                                                                                               |
| `inpath(p, region)`      | 1/0, even-odd rule (consistent with fills)                                                                                                                                                       |

### Library names may be shadowed

Built-in words come in two tiers. **Core** — movement, stitching, control flow, everything that predates the generative-math release — can't be redefined (hard error, unchanged). **Library** — every list, generative-math and stitch-history function — can: your own `def clamp(v, lo, hi) [ … ]` wins for the whole program, with a one-time console note (`note: "clamp" shadows a built-in library function (since v3) — rename to silence`). This is what lets the language keep growing a standard library without breaking existing programs that innocently used the same names.

## Randomness & determinism

Every run is deterministic: `random`, `gauss`, `noise`, `snoise2/3`, `pick`, `shuffle` and `scatter` are all driven by a seed (default 42). Reseed with:

```text
seed 7
```

The same seed always reproduces the same design — change the seed, change the piece. This matters for embroidery: what you previewed is exactly what the machine sews. The test suite enforces it mechanically: `Math.random` is stubbed to **throw** during every engine test, so nondeterminism can't sneak in through a dependency.

Draw accounting follows the **fork convention**, so editing one part of a design doesn't reshuffle the rest:

- **Fixed-cost functions draw from the main stream:** `random` 1 draw, `pick` 1, `gauss` 2.
- **Variable-cost generators fork:** `scatter` and `shuffle` draw exactly **one** value from the main stream and use it to seed a child RNG for all internal work. (`voronoi` and `relax` draw nothing.)

Result: inserting a `scatter(6)` shifts a later `random 10` by exactly one draw — the same as inserting a `random`. Draw costs are part of each function's contract and are pinned by tests, as are golden output values per seed: same seed + same engine version ⇒ identical output, and an algorithm change that alters output is a major-version event.

## Transforms

Like OpenSCAD, NeedleScript has a **current transformation matrix (CTM) stack**: a transform command takes its arguments _then a block_, applies a coordinate transform to whatever that block draws, and restores the previous frame at the end. It reads exactly like `repeat n [ … ]` — native Logo, not a bolted-on DSL — and nests inside-out:

```text
// draw a leaf once; stamp it in four places, each rotated and scaled
def leaf() [
  satin 1.6
  repeat 2 [ repeat 18 [ fd 0.9 rt 5 ] rt 90 ]
  satin 0
]

repeat 4 [
  rotate repcount * 90 [
    translate 20 0 [
      scale 0.8 [ leaf() ]
    ]
  ]
]
```

Both spellings work, exactly like every other command:

```text
translate 20 0 [ leaf() ]      // classic prefix
translate(20, 0) [ leaf() ]    // glued paren — same thing
```

| Command                       | Effect                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `translate dx dy [ … ]`       | shift the block by `(dx, dy)` mm                                                                                      |
| `rotate deg [ … ]`            | rotate the block _deg_ clockwise about the current origin (0 = north, like `seth`/`rt`)                               |
| `rotateabout deg cx cy [ … ]` | rotate about an explicit pivot `(cx, cy)`                                                                             |
| `scale s [ … ]`               | uniform scale                                                                                                         |
| `scalexy sx sy [ … ]`         | independent axis scale                                                                                                |
| `mirror deg [ … ]`            | reflect across a line through the origin at heading _deg_ (`mirror 0` flips left/right, `mirror 90` flips top/bottom) |
| `skew ax ay [ … ]`            | shear by _ax_ / _ay_ degrees                                                                                          |
| `transform a b c d e f [ … ]` | raw 2×3 affine escape hatch: `(x, y) → (a·x + c·y + e, b·x + d·y + f)`                                                |

These are **Core** built-ins — like movement and stitching, they can't be redefined (so `scale`, `rotate`, `translate`, `transform`, … are off-limits as variable names; the did-you-mean machinery flags the clash loudly).

**The turtle lives in untransformed local space.** Inside a transform block, `xcor`/`ycor`/`distance`/`pos()` all report _pre-transform_ coordinates — the turtle walks normally and only the emitted stitches are mapped. A leaf doesn't know it's been scaled. This keeps reasoning local (a `distance(0,0) > 44` guard behaves the same no matter what transform wraps it) and keeps randomness stable (wrapping a motif in a transform draws the same `random`/`scatter` values, so nothing downstream reshuffles). `setxy` is in local space too — "absolute within this block's frame", which is exactly what you want when stamping the same motif in different places. The history queries (`coverat` and friends) take local points too and map them through the transform, so they read the right patch of fabric in any frame.

**Stitches stay physical.** The transform maps the turtle _path_; stitch-length splitting, satin width and the whole physics layer are then evaluated **in hoop space, after the transform**:

- `scale 3 [ fd 30 ]` sews nine 2.5 mm stitches over 90 mm — _not_ three 7.5 mm stitches stretched out. The path is transformed, _then_ stitched.
- Satin width is transformed perpendicular to the local travel direction, per segment — so under `scalexy 2 1` a column running north widens but one running east doesn't (direction-dependent, and real).
- The 8 mm snag warning and `shortstitch` curvature checks run on the **post-transform** geometry, since that's what actually sews.
- `pullcomp` is a fabric constant in real millimetres and is applied **after** the transform — it is never scaled.

So "what you previewed is exactly what the machine sews" holds under transforms, where a naive coordinate multiply would quietly break it.

### Transformed paths — `xlate` / `xrotate` / `xscale` / `xmirror`

The block form has pure-function counterparts that transform **point lists** (call-syntax only, returning new lists), so transforms compose with `scatter`/`voronoi`/`offsetpath` data, not just with imperative drawing. `translate dx dy [ block ]` is exactly "run `block`, but every emitted point passes through `xlate`" — the two forms share one matrix library and produce identical stitches.

```text
seed 4
let cell  = first(voronoi(scatter(9)))
let motif = resample(cell, 2.2)
repeat 6 [
  sewpath(xrotate(motif, repcount * 60))   // six rotated copies of one cell
  trim
]
```

(See the bundled **transforms** example.)

## Effects

Transforms are the _linear_ case of a more general idea: instead of a fixed affine matrix mapping points on the way out, an **effect** is an arbitrary per-point function applied to a block's emitted geometry. Effects live on the same block-scoped stack as transforms and nest freely with them — they're "run this block, but pass every emitted point through a function," differing only in _which_ function and _where_ in the pipeline it runs.

```text
scale 1.5 [
  warp @ripple [
    humanize 0.25 [
      leaf()
    ]
  ]
]
```

Reading inside-out: draw the leaf, humanize its penetrations, ripple the result, scale that. Each layer is a point→point map and they compose in sequence.

| Effect                                      | Linear? | Frame                  | Stage        | Seeded?                 |
| ------------------------------------------- | ------- | ---------------------- | ------------ | ----------------------- |
| transforms (`translate`/`rotate`/`scale`/…) | yes     | local, composing       | before split | no                      |
| `warp @fn`                                  | no      | local, post-transform  | before split | only if the reporter is |
| `humanize amount`                           | no      | hoop, post-transform   | after split  | yes (forks)             |
| `snaptogrid …`                              | no      | **fixed hoop lattice** | after split  | no                      |

The "stage" column is the one subtlety a naive implementation gets wrong. `warp` is a _geometric deformation_ — it maps the emitted path vertices **before** stitch-length splitting, so the deformed curve is still split into clean physical stitches (exactly like a transform). `humanize` and `snaptogrid` perturb _individual penetrations_, so they run **after** splitting — jitter or snap the final needle points, not the continuous path (warp-then-split would resample the irregularity away; snap-then-split would interpolate stitches back off the grid).

### `warp @fn` — the shader

`warp` takes a **procedure reference** and applies it to every point the block emits. The reporter receives a point `[x, y]` in hoop space and returns a new one — a fisheye, a ripple, a twist, a domain-warp are all just reporters:

```text
def push_out(p) [
  let d = vlen(p)
  return vscale(vnorm(p), d + 2 * snoise2(p[0] / 14, p[1] / 14))
]

warp @push_out [
  repeat 6 [ fd 30 rt 60 ]
]
```

The `@name` syntax is a **procedure reference** — the one new value kind effects introduce. It yields a reference to a reporter, callable by the effect machinery, and is consumed by `warp`/`warppath` and by `satin` (see _Programmable satin columns_); using it anywhere else is a loud type error. A `warp` reporter must take exactly one argument (the point) and `output`/`return` a point, or you get an error naming the problem.

Because `warp` hands control to arbitrary user code, a shader can push points off the hoop, fold the path over itself, or stretch segments into long loose stitches. The posture is the usual one — **don't forbid, warn**: hoop-overflow, density and long-stitch checks all run on the **post-warp** geometry (warp sits before the physics layer), so a misbehaving shader surfaces as chips and console warnings, not a quietly ruined garment. `warp` itself draws nothing from the seeded stream — it's seeded only if the reporter calls `random`/`snoise2`.

### `humanize amount` — hand-stitched imperfection

```text
humanize 0.3 [
  repeat 4 [ fd 20 rt 90 ]
]
```

`humanize` offsets each penetration by a small amount (the argument, in mm, clamped 0–2) so the work reads as hand-embroidered rather than machine-perfect. The details matter for embroidery specifically:

- **Coherent, not white, noise.** A human's error is correlated — the hand drifts, so consecutive stitches err in similar directions. `humanize` samples seeded `snoise2` slowly at each point's own coordinates, giving smooth wander. Naive per-point `random` would read as _damage_, not handwork.
- **Seeded, like everything else.** It draws from the seeded field, so the same seed reproduces the same imperfections. Re-running doesn't reshuffle the human-ness.
- **Forks, like `scatter`/`shuffle`.** It draws **exactly one** value from the main stream (to seed its coherent field), so dropping a `humanize` block into a design shifts everything downstream by exactly one draw — not by however many stitches were inside. Editing the _contents_ of a `humanize` block never reshuffles the rest of the piece.

### `snaptogrid …` — grid quantizing

```text
snaptogrid 2 [
  repeat 4 [ fd 20 rt 90 ]
]
```

`snaptogrid` quantizes each penetration to a lattice — a cross-stitch / pixel-grid aesthetic. Its one defining property is **frame-invariance**: a grid is a property of _the fabric, not the motif_, so the lattice is evaluated in **fixed hoop space, outside any enclosing transform**. Stamp the same motif at four places with `translate` and all four snap to _one shared lattice_ — their stitches register across the whole piece. `scale 2 [ snaptogrid 1 [ … ] ]` does **not** stretch the grid to 2 mm; the lattice stays 1 mm and the scaled motif lands on different nodes. The grid origin and rotation are hoop-space values, never mapped by the surrounding transform.

It overloads by arity (like `scatter`/`range`/`slice`), with the full form as the escape hatch:

| Form                                     | Grid                                                         |
| ---------------------------------------- | ------------------------------------------------------------ |
| `snaptogrid cell [ … ]`                  | square lattice, pitch `cell`, origin `(0, 0)`, axis-aligned  |
| `snaptogrid cellx celly [ … ]`           | rectangular lattice                                          |
| `snaptogrid cellx celly ox oy [ … ]`     | …with an origin offset                                       |
| `snaptogrid cellx celly ox oy ang [ … ]` | …rotated `ang` (turtle degrees) — isometric / diagonal grids |

`snaptogrid` is **pure and drawless** — rounding consumes no RNG, so its determinism doesn't even depend on the seed. Two cautions: snapping can push adjacent penetrations onto the same node (a zero-length stitch) — these **merge with the existing tiny-stitch warning**, so pick a cell size compatible with your `stitchlen`. And after-split effects deliberately **skip satin columns** (quantizing or jittering a precise satin rail wrecks the column) — the column sews unaffected, with a one-time warning.

### Effect paths — `warppath` / `humanizepath` / `snappath`

Like transforms, each effect has a pure-function companion that maps a **point list**, so effects compose with `scatter`/`voronoi`/`offsetpath` data, not just imperative drawing. The block form is exactly "run the block, mapping emitted points through the same function," and the two are pinned identical:

| Function                     | Returns                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| `warppath(path, @fn)`        | new path, every point mapped through the reporter                         |
| `humanizepath(path, amount)` | new path, seeded coherent jitter (forks, like the block)                  |
| `snappath(path, cell …)`     | new path, every point snapped to the fixed lattice (same arity overloads) |

```text
let coast = humanizepath(resample(cell, 2.0), 0.3)
sewpath(coast)

let pts = snappath(scatter(8), 2)   // Poisson points, quantized to a 2 mm grid
for p in pts [ up setpos(p) down arc 360 0.6 trim ]
```

`@name` references and the effect names (`warp`, `humanize`, `snaptogrid`) are **Core** built-ins — they can't be redefined.

(See the bundled **warp**, **humanize** and **snaptogrid** examples.)

## Professional embroidery & fabric physics

Geometry alone doesn't survive the sewing machine: thread tension pulls fabric inward, stitches sink into the material, tight curves crowd the needle, and layered stitching turns into a bulletproof patch. These commands compensate for the physics. They are **opt-in** — without them, programs sew exactly as written.

The quickest route is a fabric preset:

```text
fabric "knit       ; pull comp 0.5, auto underlay, lighter satin, density limit 1.2
```

| Fabric               | Pull comp | Coverage limit | Notes                                |
| -------------------- | --------- | -------------- | ------------------------------------ |
| `"woven`             | 0.2 mm    | 3.5 layers     | the baseline                         |
| `"knit`              | 0.5 mm    | 3.0 layers     | satin density floored at 0.45 mm     |
| `"stretch`           | 0.6 mm    | 2.8 layers     | satin density floored at 0.5 mm      |
| `"denim` / `"canvas` | 0.15 mm   | 4.0 layers     | stable, tolerates dense stitching    |
| `"fleece`            | 0.3 mm    | 2.6 layers     | doubled underlay, suggests a topping |

Explicit commands after `fabric` override the preset.

### Pull compensation — `pullcomp mm`

Thread tension shrinks stitching along the stitch axis: a 4 mm satin column sews ~3.6 mm wide. `pullcomp` (0–1.5 mm) widens satin columns and extends every fill row at both ends, so shapes sew out at their digitized size and borders actually meet their fills.

### Underlay — `underlay`, `fillunderlay`

Underlay is stabilising stitching sewn automatically _underneath_ the visible layer — the single biggest difference between hobby and professional digitizing. It anchors the fabric to the backing, stops shifting, and lifts the topping out of the material. Underlay is sewn in correct machine order (before the topping), shown thinner in the preview, and identical to normal stitches in exports.

| Command              | Modes                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `underlay "auto`     | for satin columns: `"center` (spine, out and back), `"edge` (runs offset ±30% width), `"zigzag` (open zigzag at 60% width + return run), `"off`. `"auto` picks by width: < 1.5 mm none, < 4 mm center, wider zigzag                                                                                                                                                    |
| `fillunderlay "auto` | for fills: `"tatami` (sparse cross-grain pass at `fillangle + 90`, inset 0.6 mm), `"edge` (run tracing the boundary inset 0.5 mm), `"off`. `"auto` = tatami, plus the edge run on areas over 100 mm². Under a directional `fill dir @fn`, the tatami pass follows the field **rotated +90°** so the underlay still anchors across the grain even when the grain curves |

A satin column is buffered while you draw it and sewn — underlay first, then the zigzag — when it ends (pen up, mode change, colour change, trim, fill, or end of program). The turtle's position and heading are unaffected.

### Short stitches on curves — `shortstitch 0/1`

On a tight satin curve the inner edge receives the same number of penetrations as the outer edge in a fraction of the space — they bunch up, break thread, and chew the fabric. NeedleScript detects local curvature (chord length ÷ turn angle) and pulls **alternate inner-edge stitches in to 60% width**. On by default; `shortstitch 0` disables. If a column is wider than the curve's radius you get a warning — that geometry can't sew cleanly at any setting.

### Programmable satin columns — `satin @fn`

`satin` followed by a **procedure reference** (the same `@name` value `warp` consumes) replaces the built-in zigzag with a **shape reporter** you write. It is queried once per stitch pair as the engine walks the column spine, and returns a list of five numbers:

```text
def shapeReporter(t, s, i, u) [
  //                              advance  leftw  rightw  leftlag  rightlag
  return [0.4, 2, 2, 0, 0]   //  ↑ all mm; this is exactly built-in satin
]
satin @shapeReporter
fd 40
satin 0                      // numeric form (or 0) disengages, flushing the column
```

The reporter sees the cursor's state and returns how to place the next pair:

| Input | Unit       | Meaning                                                                                                                                                     |
| ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t`   | mm         | cursor arc-length from the column start (real mm — on an arc this is arc length, so spatial effects don't rescale with column length)                       |
| `s`   | 0..1       | normalized arc-length over the whole column — the column is fully buffered before it sews, so the total length is known. Use it for tapers, tips, fades     |
| `i`   | count      | 0-based pair index — lets a reporter alternate behaviour ("every other stitch rakes the other way") **without holding state** (deliberately not `repcount`) |
| `u`   | turtle deg | local heading of the spine at the cursor (read-only context; most reporters ignore it)                                                                      |

| Return slot            | Unit | Meaning                                                                                                                                                                                                |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `advance`              | mm   | how far to step the cursor **forward** before the next pair — dynamic `density`. **Must be > 0** (the one hard rule: clamped to a 0.1 mm floor with a one-time warning, so the walk always terminates) |
| `leftw` / `rightw`     | mm   | half-widths of the left / right rail. Asymmetric columns (`leftw ≠ rightw`) fall out for free; negatives clamp to 0                                                                                    |
| `leftlag` / `rightlag` | mm   | longitudinal offset of each rail endpoint along the spine — negative = behind the cursor, positive = ahead (arc length on a curve)                                                                     |

The two lags placed **independently** are the whole trick: `leftlag = rightlag = 0` is an ordinary perpendicular bite, but opposite-sign lags rake a stitch into a diagonal, and alternating the rake by pair index makes successive diagonals **cross** — woven / cross-hatched satin — while the cursor still only ever moves forward. (Self-crossing stacks thread at every intersection and legitimately measures 4–5+ layers; raise `maxdensity` knowingly and pick a stable fabric.)

All inputs and outputs are in **spine-local space** — the reporter never sees hoop coordinates. The engine maps its output to the hoop _after_ it returns, which is why custom columns compose with transforms and `warp` exactly like built-in satin: `scale 1.5 [ satin @col … ]` sews 1.5× the extent with physical spacing intact (more stitches, not stretched ones), and a `warp` outside deforms the emitted rails. Because `satin @fn` **is** the generator (not an after-split effect), it sits upstream of the whole physics layer: `pullcomp` still widens its rails, `underlay "auto` picks by the column's widest realized width, the snag check measures the realized chord, and over-dense or over-curved columns warn through the existing checks. Like `warp`, the generator itself draws **nothing** from the seeded stream — it's seeded only if your reporter calls `random`/`snoise2`, so a purely geometric reporter is trivially reproducible.

A malformed reporter is a loud, line-numbered error (wrong arity, no `return`, a non-list or wrong-length return, a non-number slot) — the same posture as the `warp` reporter checks. A reporter that may finish **without** reaching `return` on some control-flow path is caught at **parse time** (not at runtime), naming the procedure and suggesting an `else` branch. `satin` and `@name` are **Core** and can't be redefined; the reporter is ordinary user code. The equivalence pin holds exactly: `satin 4` produces a byte-identical stream to `satin @c` where `def c(t, s, i, u) [ return [0.4, 2, 2, 0, 0] ]`.

**Satin-tuple helpers** (library tier, shadowable with a note):

| Helper                              | Expands to                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `satinpair(advance, width)`         | `[advance, width, width, 0, 0]` — symmetric perpendicular bite (the common case) |
| `satinasym(advance, leftw, rightw)` | `[advance, leftw, rightw, 0, 0]` — asymmetric column, no rake                    |
| `satinrake(advance, width, lag)`    | `[advance, width, width, -lag, lag]` — symmetric width raked into a diagonal     |

These are pure expression functions (call-syntax only, zero RNG draws), so they compose freely inside any reporter. Example — alternate rake direction for a woven crosshatch:

```text
def crosshatch(t, s, i, u) [
  if mod(i, 2) = 0 [ return satinrake(0.4, 2,  0.8) ]   // "/"
  return satinrake(0.4, 2, -0.8)                          // "\"
]
satin @crosshatch
fd 50
```

(See the bundled **custom satin** example — a leaf taper, a woven crosshatch, a ripple edge and an asymmetric ramp, side by side.)

### Programmable fills — `fill @fn`

Where `satin @fn` parameterizes a 1-D column, `fill @fn` parameterizes a 2-D fill. It arms the **next** `beginfill … endfill`, replacing the built-in tatami generator with up to two reporters you write — a **direction field** and a **stitch shaper** — while the engine keeps ownership of every structural guarantee (even-spacing coverage, hole clipping, pull-comp, underlay, the physics layer). The headline use is the **directional fill**: rows that follow a vector field, producing contour / grain / flow fills that curve with the shape of the work.

```text
def contour(p) [
  return vheading(vrot(p, 90))   // rows circle the origin
]
fill dir @contour                // arm the next region
beginfill
  arc 360 30
endfill                          // the generator runs here
```

Two channels, either or both (it mirrors custom satin's _shape + traversal_ split):

| Form                   | Meaning                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fill dir @field`      | a **direction field**: `def field(p) [ return heading ]` returns a turtle heading (0 = north, clockwise) at the local point `p = [x, y]`. The engine integrates **streamlines** through the field and lays one fill row along each |
| `fill shape @texture`  | a **stitch shaper**: `def texture(p, row, v) [ return [spacing, len, phase] ]` sets the row spacing (mm, must be > 0), stitch length (mm, clamped 1–7) and brick phase (0..1) — flat tatami rows with custom texture               |
| `fill dir @d shape @s` | both channels                                                                                                                                                                                                                      |
| `fill @name`           | shorthand: `@name` is the **direction** field (the common case)                                                                                                                                                                    |

The shaper's inputs are `p` (local penetration position, for spatially-varying texture and `coverat(p)` reads), `row` (0-based streamline index in placement order), and `v` (0..1 cross-field position, assigned by placement order). `spacing` is sampled once **per row** at its seed (it's the gap to the next row, so it can't vary continuously _along_ a row); `len`/`phase` are sampled **per penetration**. `phase = 0.5` reproduces standard brick tatami.

**Coverage is the engine's job.** Naively integrating one streamline at a time clumps and gaps; the engine uses evenly-spaced streamline placement (Jobard–Lefer) so rows stay a uniform distance apart even though the direction is arbitrary. A constant field reduces _exactly_ to parallel tatami scan lines — the equivalence pin: a plain `beginfill … endfill` is **byte-identical** to the same region armed with `def d(p) [ return 0 ]` and `def s(p, row, v) [ return [0.4, <stitchlen>, 0.5] ]`.

**Fill-row helper** (library tier, shadowable with a note):

| Helper                           | Expands to                                                 |
| -------------------------------- | ---------------------------------------------------------- |
| `tatamirow(spacing, len)`        | `[spacing, len, 0.5]` — a standard brick-offset tatami row |
| `tatamirow(spacing, len, phase)` | `[spacing, len, phase]` — explicit brick phase             |

`tatamirow` is a pure expression function (call-syntax only, zero RNG draws). Example — rows that fan open toward one side:

```text
def thin(p, row, v) [
  return tatamirow(remap(v, 0, 1, 0.4, 1.1), 2.5)
]
fill dir @grain shape @thin
```

A reporter that may finish without reaching `return` on some path is caught at **parse time**, naming the procedure and suggesting an `else` branch — the same rule as satin reporters (see above).

**Termination is guaranteed by two finite budgets**, not by trusting the field: each streamline halts at a length cap (so a streamline that spirals forever is truncated, with a one-time warning), and seeding draws from a finite budget (so a pathological field can't seed forever). A vortex, a singularity, or a chaotic field therefore produces a _finite, possibly imperfect fill with warnings_ — never a hang. A convergent field legitimately piles thread near its pole; that is **not** smoothed away — it surfaces honestly through the density heatmap, and you re-seed, accept it, or raise `maxdensity` knowingly.

Like `satin @fn`, `fill @fn` **is** the generator, so the whole professional pipeline applies unchanged: pull-comp extends rows at the boundary, `fillunderlay "auto` runs its tatami pass through the field rotated +90° (anchoring across the curving grain), the density grid and tiny-stitch merge feed off the emitted penetrations, and `humanize` / `snaptogrid` jitter them like any other stitch. Reporters see **local** space and the engine maps through the CTM afterward, so a directional fill under `scale 1.5 [ … ]` covers 1.5× the area with physical stitch spacing intact (more rows, not stretched stitches), and the field rotates with the work under `rotate`. The generator draws **nothing** from the seeded stream — a noise-driven flow-field fill is reproducible precisely because the field is. A reporter with the wrong arity or a bad return is a loud, line-numbered error; `fill`, `dir` and `shape` are **Core** (`dir`/`shape` are reserved only right after `fill`, so ordinary variables named `dir`/`shape` keep working), and the reporters are ordinary user code.

```text
seed 7
def grain(p) [
  return snoise2(p[0] / 20, p[1] / 20) * 180   // a reproducible noise flow field
]
def thin(p, row, v) [
  return [remap(v, 0, 1, 0.4, 1.1), 2.5, 0.5]  // rows fan open toward one side
]
fill dir @grain shape @thin
beginfill repeat 4 [ fd 50 rt 90 ] endfill
```

(See the bundled **custom fill** example — a contour swirl, a noise flow field, a graded-density fill, an adaptive fill that thins where it's already covered, and a curved grain with both channels, side by side.)

### Local density — `maxdensity n` + heatmap

The physical quantity that matters is **thread coverage**: millimetres of thread per mm² of fabric, expressed in _layers_ — one layer is a clean satin column or tatami fill. Past ~2.5–3.5 layers (fabric-dependent) embroidery stops being fabric: needles deflect, thread breaks, the patch puckers. Every run computes a 1 mm coverage grid (deliberate tie-off micro stitches are excluded so thread ends don't read as false hotspots). Hotspots above the limit produce warnings **with coordinates and the source lines that caused them**, and repeated penetrations in the same hole (≥ 5 within 0.15 mm — fabric-cutting territory) are flagged separately. The stage has a heatmap toggle (orange from ~1.2 layers, red from 3); the stats row shows the peak. `maxdensity n` tunes the threshold (default 3.5), `maxdensity 0` silences it. Some constructions legitimately run hot — a satin border over a fill edge measures ~4 layers — and the right move is to raise the limit _knowingly_, as the bundled _patch_ example does.

### Stitch history — closed-loop generation

That same coverage grid can be **read back** mid-program, so a design can respond to what's already been sewn — adaptive density, stippling toward a target, avoidance, growth that respects what's there. Five **pure reporters** (glued-call only, shadowable):

| Call                           | Returns                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `coverat(p)` · `coverat(p, r)` | coverage at `p` in **layers** (the heatmap unit) — point, or averaged over radius `r` mm |
| `countat(p)`                   | penetration count in the 1 mm cell at `p`                                                |
| `nearestsewn(p)`               | the closest prior penetration as `[x, y]`, or `[]` if none yet                           |
| `sewnwithin(p, r)`             | a list of prior penetrations within `r` mm of `p`                                        |
| `stitchedpoints()`             | a deep-copied snapshot of every penetration so far, as a path                            |

```text
seed 7
repeat 4000 [                                 // a stipple that self-levels
  let p = [random(80) - 40, random(80) - 40]
  if vlen(p) < 46 and coverat(p) < 1.5 [      // only sew where it isn't full yet
    up setpos(p) down  arc 360 0.5  trim
  ]
]
```

The contract that keeps closed-loop generation deterministic: the reporters **draw nothing from the random stream and emit nothing** — they're reads, so branching on them is still a function of `(seed, source)` and "same seed → same design" holds. They see **committed** penetrations in **sewing order** (a buffered satin column isn't visible until it flushes on pen-up / `trim` / mode change; tie-off locks are excluded, so the numbers match the heatmap exactly). `coverat`/`countat` are O(1) cell lookups and `nearestsewn`/`sewnwithin` are grid-bucketed O(local), so proximity logic never scans the whole history. Query points are local-frame and mapped through the current transform (so `coverat(pos())` works in any frame); returned points are hoop-space fabric facts. A loop that runs _until_ a coverage condition can run forever if the target is unreachable — give it a hard cap (`repeat N [ … if done [ break ] ]`, not `while`); the op-limit error hints when a feedback loop may not be terminating. The bundled _stipple_ example shows the pattern, and a `warp` reporter that reads `coverat` becomes a _reactive_ shader.

### Automatic trims — `autotrim mm`

Travels of 7 mm or more (configurable 3–30, `autotrim 0` off) automatically get a `trim` before the jump, so connector threads don't dangle and snag on the garment. Trims are never inserted when nothing has been sewn since the last cut.

## Debugging

| Tool                      | What it does                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `print expr`              | log a value to the console                                                                                                                                                                                                                                   |
| `print "label expr`       | …with a label: `print "radius :r` → `radius: 1.5`                                                                                                                                                                                                            |
| `printloc`                | log the needle's current local-frame position: `loc: [12.5, -3.0]`. The coordinates are what `pos()` returns — local-frame, so under a transform they reflect what the turtle "thinks"                                                                       |
| `printloc "label`         | …with a custom label: `printloc "origin` → `origin: [0, 0]`                                                                                                                                                                                                  |
| `mark`                    | drop a numbered pin on the preview at the needle's position. Pins appear as playback reaches them and are **never exported** to the machine or counted in stats                                                                                              |
| `assert cond`             | stop with an error (and line number) if the condition is false — great for geometric invariants (`assert (distance 0 0) < 47`)                                                                                                                               |
| Playback scrubber         | scrub the design stitch by stitch; the **source line being sewn is highlighted** in the editor and shown in the playback bar                                                                                                                                 |
| Did-you-mean              | typos in commands, variables, and procedure names suggest the closest match across every namespace, labelled by kind: `Unknown command "stichlen" — did you mean the command "stitchlen"?`                                                                   |
| Warnings                  | non-fatal issues surface as chips and console lines: clamped values, merged tiny stitches, unclosed fills, hoop overflow, excessive density                                                                                                                  |
| Parse-time reporter check | a reporter procedure used via `@name` or in expression position that may finish without `return`ing on some path is rejected at **parse time** with a message naming the procedure — no more waiting for a lucky/unlucky seed to hit the silent fall-through |

## Safety limits

NeedleScript guards both your browser and your machine:

| Limit                                                  | Value                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Max stitches per design                                | 60,000                                                                                  |
| Max interpreter operations                             | 2,000,000 (catches infinite `while`/recursion; list element reads and writes count too) |
| Max call depth                                         | 200                                                                                     |
| Max `repeat` / `for` iterations                        | 200,000                                                                                 |
| Max list length                                        | 100,000 elements                                                                        |
| Max total live list cells                              | 1,000,000                                                                               |
| Max list nesting depth                                 | 16                                                                                      |
| Max `scatter` output                                   | 20,000 points                                                                           |
| Max `voronoi` / `triangulate` / `hull` / `relax` input | 10,000 points                                                                           |
| Max `offsetpath` / `clippaths` input                   | 50,000 vertices per call                                                                |
| Stitch length                                          | clamped to 0.4–12 mm                                                                    |
| Sub-0.4 mm moves                                       | merged into neighbours (too short to sew safely), with a warning                        |

---

## DST export

`Download .DST` produces a standard Tajima file: 3-byte ternary delta records, moves longer than 12.1 mm split automatically, colour changes as stop records, trims as triple jumps, and a correct 512-byte header (label, stitch/colour counts, extents). Load it onto any machine or into commercial software for final checks.

## Using the engine as a library

The engine is published to npm as [`needlescript`](https://www.npmjs.com/package/needlescript) — an ESM-only, DOM-free package:

```bash
npm install needlescript
```

```ts
import { run, designStats, toDST } from 'needlescript';

const result = run('repeat 36 [ fd 4 rt 10 ]', { seed: 7 });
// result.events   — stitch/jump/color/trim/mark stream ({ t, x, y, c, line, u })
// result.warnings — non-fatal issues (clamps, density hotspots, hoop overflow…)
// result.printed  — output of print
// result.locks    — number of tie-in/tie-off locks added
// result.density  — local density grid, peak, and hotspot list

const stats = designStats(result.events); // counts, bounding box, max stitch…
const bytes = toDST(result.events, 'rose'); // Uint8Array, ready to save
```

Also exported: `tokenize`, `parse`, `toPES`, `toEXP`, `toSVG`, `applyLocks`, `applyAutoTrim`, `densityMap`, `makeRNG`, `makeNoise`, `fork`, `gauss`, `suggest`, the command tables (`BUILTIN_ARITY`, `QWORD_BUILTINS`, `FABRICS`, `FUNC_ARITY`, `ALIASES`, `RESERVED`, `ZERO_FUNCS`, `LIST_FUNCS`, `LIST_CMDS`, `GEN_FUNCS`, `GEN_CMDS`, `LIBRARY_FUNCS`), `LIMITS`, and `NeedlescriptError` (which carries the source line in `slLine`).

The engine's only runtime dependencies are three exactly-pinned libraries that each do something genuinely hard: `simplex-noise` (seeded noise tables), `delaunator` (Delaunay triangulation) and `clipper2-ts` (polygon offsetting & booleans). Everything else — `lerp` through `catmull`, even Bridson's Poisson-disc — is hand-rolled, because owning the code is cheaper than auditing a dependency for determinism. None of them touch `Math.random` (the test suite proves it).

## Tests

```bash
npm test
```

~3,000 lines of Vitest suites in `src/lib/__tests__/` cover the tokenizer, parser, interpreter, language features (loops, reporters, locals, noise, arc, push/pop, debugging commands), the modern syntax (`modern-syntax.test.ts` asserts every modern form produces event streams identical to its classic twin), the professional layer (underlay, pull compensation, short-stitch, density analysis, autotrim, fabric presets), locks, stats, DST encoding, and the SVG importer. The bundled examples are tested to run and fit the hoop. When in doubt about a behaviour, the tests are the spec.

## License

[MIT](./LICENSE) © Fredi Bach
