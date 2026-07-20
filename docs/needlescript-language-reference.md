# NeedleScript Language Reference

Language reference for NeedleScript — a Logo-inspired language for generative machine embroidery. Programs are turtle-graphics code compiled to machine stitches (running, satin, bean, blanket, tatami fills) and exported as Tajima `.DST`.

---

## 1. Mental model

- **Units are millimetres.** Default hoop is ⌀100 mm; the sewable field is a 47 mm-radius disc around origin `(0, 0)`. Configurable via `hoop` (§18).
- **Heading is degrees clockwise from north.** `0` = up, `90` = right, `180` = down, `270` = left. All heading-like values (`seth`, `atan`, `towards`, `vheading`, `vrot`, fill direction fields) use this convention.
- **Words are case-insensitive** (`FD 10` ≡ `fd 10`). String _contents_ are case-sensitive.
- **No statement separators** — whitespace and newlines are interchangeable.
- **Comments:** `//`, `#`, `;` each run to end of line. A lone `/` is division. `..` is reserved and errors.
- **Three value types:** numbers, strings (immutable, single-quoted), lists (nestable). Lists and strings never reach the stitch stream.
- **Truthiness:** `0` false, anything else true. Comparisons return `1`/`0`. `true`/`false` are literals for `1`/`0`. A string or list in a condition is an **error** (use `len(x) > 0`).
- **Determinism contract:** same source + same seed + same hoop + same explicit run configuration →
  same stitches (§17). Local machine calibration belongs to `RunOptions`, never source text.

### Negative literals vs subtraction (classic prefix syntax)

A minus with a space before and none after is a **negative literal**:

```text
setxy -6 -21       // two args: point (-6, -21)
fd 10 - 5          // one arg: fd 5
fd 10 -5           // ERROR: "-5" is a second value, fd takes one arg
```

Inside call parentheses the ambiguity disappears: `setxy(-6, -21)`, `fd(10 - 5)`.

---

## 2. Critical generation rules

The most common code-generation errors, in order of frequency:

### 2.1 Blocks use `[ ]`, never `{ }`

Every block — loop bodies, `if`/`else`, `def` bodies, `stitchscope`, `atomic`, `routegroup`, and transform/effect blocks — is delimited by square brackets. The characters `{` and `}` must appear **nowhere**.

```text
repeat 6 [ fd 10 rt 60 ]        // correct
repeat 6 { fd 10 rt 60 }        // WRONG — parse error
```

### 2.2 Name reservation — two tiers

**Reserved keywords** — never usable as a variable, parameter, or procedure name:

```
to end for in while if else repeat def let local make
break continue return exit output true false and or not
```

**Contextual keywords** — ordinary identifiers everywhere _except_ the one syntactic position where they serve as separators:

| Keyword | Only reserved inside…                           | Elsewhere                           |
| ------- | ----------------------------------------------- | ----------------------------------- |
| `step`  | `for i = a to b step s` — after the `to <expr>` | ordinary name: `let step = 2` works |
| `dir`   | `fill dir @proc` — immediately after `fill`     | ordinary name                       |
| `shape` | `fill … shape @proc` — immediately after `fill` | ordinary name                       |
| `paths` | `fill paths @proc                               | expr`— immediately after`fill`      | ordinary name |

**Core tier** (hard error if redefined): all movement, stitching, thread, fill, control-flow, transform and effect commands, `@name` references, and the zero-arg reporters — e.g. `fd`, `rt`, `circle`, `color`, `satin`, `satinbetween`, `stitchscope`, `atomic`, `routegroup`, `scale`, `rotate`, `translate`, `transform`, `warp`, `humanize`, `snaptogrid`, `declump`, `pos`, `heading`, `xcor`, `ycor`, `repcount`, `random`, `trace`, `tracerings`. Cannot be used as variable, parameter, or procedure names.

**Library tier** (soft reservation): every list, string, generative-math, and stitch-history function (`len`, `clamp`, `scatter`, `str`, `upper`, `coverat`, `satinpair`, `tatamirow`, …). Variables and parameters **may** reuse these names (builtins resolve only at glued-call position); a user `def` of the same name shadows the builtin for the whole program with a one-time console note. **Best practice for generated code: avoid reusing any builtin name.** Safe alternatives:

| Tempting name                                                                                                                                                    | Why it fails / risks            | Use instead                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------- |
| `circle`                                                                                                                                                         | Core command                    | `ring`, `disc`, `blob`        |
| `pos`, `heading`                                                                                                                                                 | Core reporters                  | `p`, `pt`, `here`, `hdg`      |
| `color`                                                                                                                                                          | Core command                    | `hue`, `col`, `thread`        |
| `random`, `pick`, `sort`, `first`, `last`, `min`, `max`, `sum`, `range`, `trace`, `scale`, `distance`, `str`, `num`, `upper`, `lower`, `strip`, `chars`, `split` | keyword/Core/Library collisions | any distinct descriptive name |

A procedure and a variable can never share a name; parameters can't reuse a procedure or Core name.

### 2.3 Scope: one scope per procedure, `let` declares exactly once

- Exactly one local scope per procedure, plus the global scope at top level. `[ ]` blocks do **NOT** create scopes.
- `let x = …` declares once. Re-`let`ing a name already declared in the same procedure — including inside a nested block, and including parameters — is a **parse error**. After the first `let`, use bare assignment: `x = …`, `x += …`.
- Never `let` a parameter: `def f(n) [ let n = n * 2 ]` errors → write `n = n * 2` or use a new name.
- No shadowing of outer names, procedures, or Core builtins.
- The `for` loop variable is automatically local and doesn't leak — don't `let` it.
- Reading a variable declared but never assigned on the executed path is a runtime error ("never assigned on this path") — initialise defaults before conditional assignment (`let best = -1`).

```text
// WRONG — re-let inside a block: parse error
def spiral_r(i) [
  let r = 2
  repeat i [ let r = r * 1.1 ]
]

// RIGHT — declare once, assign afterwards
def spiral_r(i) [
  let r = 2
  repeat i [ r = r * 1.1 ]
  return r
]
```

---

## 3. Two dialects and call syntax

Classic Logo and modern syntax **mix freely** and compile to identical stitches:

- **Modern:** `let x = 5`, `def leaf(size) [ … ]`, `return`, `for i = 1 to 10`, `else if`, `%`, `!`, `==`, `true`/`false`, `//` comments.
- **Classic:** `make "x 5`, `to leaf :size … end`, `output`, `for "i 1 10 1`, `:x` variable reads, `;` comments.

Idiomatic style: classic prefix words where simple (`fd 10 rt 90`), call parentheses wherever expressions nest.

### The one rule of call syntax

A `(` **glued** to a name (no space) is an argument list; a `(` after a space is Logo expression grouping:

```text
fd(10)                          // call with one argument
fd (10)                         // classic: argument is grouped expression (10)
setxy(random(20), random 20)    // styles mix inside argument slots
xcor()                          // zero-arg call
min(3, 4)  ·  min 3 4           // identical
```

Argument counts are checked; trailing commas allowed. **Prefer glued-paren calls in generated code** — classic multi-argument calls parse each argument as a full expression, so `distance 0 0 < 47` means `distance 0 (0 < 47)`; write `distance(0, 0) < 47`.

### The `[` rule

Position decides meaning: after a statement header (`repeat 4 [ … ]`) it's a **block**; at the start of an expression it's a **list literal**; glued to a bare name, `)` or `]` it's an **index** (`xs[0]`, `pos()[1]`, `grid[i][j]`). Sharp edge: `repeat n[ fd 10 ]` reads as indexing `n` — always put a space before a block `[`.

---

## 4. Expressions

Operator precedence, loosest to tightest:

1. `or`
2. `and`
3. comparisons `< > = == <= >= !=` (return `1`/`0`; `=` and `==` are the same operator; equality uses 1e-9 tolerance)
4. `+ -`
5. `* / %`
6. unary `-`, prefix functions (`not`/`!`, `sin`, …)
7. numbers, `true`/`false`, strings, variables, `( … )`, calls, `trace [ … ]`

- `and`/`or` **short-circuit**. `not` (alias `!`) binds tightly — write `!(a = 1)` when negating a comparison.
- `%` ≡ `mod`: **floor modulo, result takes the sign of the divisor** — `-7 % 3` is `2` (not `-1` as in C/JS).
- `=`/`==` compare lists **deeply** (1e-9 tolerance); number vs list is `0`, not an error. No operator broadcasting: `[1,2] + [3,4]` is a loud error (use `vadd`/`concat`).
- Compound assignment: `+= -= *= /=` (also on list indices: `grid[i][j] += e`).

### Math functions

| Function                                              | Returns                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `random n`                                            | number in 0…n — seeded, 1 RNG draw                                    |
| `sin deg` · `cos deg`                                 | trig in degrees                                                       |
| `sqrt n` · `abs n` · `round n` · `floor n` · `ceil n` | usual semantics (`sqrt` of negative errors)                           |
| `min a b` · `max a b` · `pow a b`                     | non-finite `pow` result errors                                        |
| `log n`                                               | natural log; `n` positive; base `b` via `log(n) / log(b)`             |
| `mod a b`                                             | floor modulo (sign of `b`); same as `%`                               |
| `atan x y`                                            | **heading** of vector (x, y): 0 = north, clockwise — `atan 1 0` is 90 |
| `towards x y`                                         | heading from needle to (x, y) — `seth towards 0 0` aims home          |
| `distance x y`                                        | distance from needle to (x, y)                                        |
| `lerp(a, b, t)`                                       | a + (b−a)·t, t unclamped                                              |
| `remap(v, inlo, inhi, outlo, outhi)`                  | linear remap, unclamped                                               |
| `clamp(v, lo, hi)`                                    | min(hi, max(lo, v))                                                   |
| `smoothstep(e0, e1, x)`                               | Hermite ease 0…1                                                      |
| `gauss(mu, sigma)`                                    | seeded normal (Box–Muller, exactly 2 draws)                           |

### Noise (seeded)

| Function                             | Returns                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `snoise2(x, y)` · `snoise3(x, y, z)` | simplex noise in **−1…1**. `z` is a variation axis, not space: `snoise3(x/14, y/14, motif * 50)` gives each motif its own field |
| `fbm2(x, y, octaves)`                | fractal sum of `snoise2` (lacunarity 2.0, gain 0.5, octaves 1–8, clamped with warning), ≈ −1…1                                  |
| `noise x` · `noise2 x y`             | legacy value noise in **0…1**                                                                                                   |

Sample noise slowly: divide coordinates by 10–20 for smooth organic variation.

### Zero-arg reporters

| Word            | Value                                          |
| --------------- | ---------------------------------------------- |
| `xcor` · `ycor` | needle position (local frame under transforms) |
| `heading`       | needle heading in degrees                      |
| `repcount`      | 1-based counter of the innermost `repeat`      |
| `pos()`         | needle position as `[x, y]`                    |

---

## 5. Variables

| Syntax                        | Meaning                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| `let x = expr`                | declare once: **global** at top level, **local** inside a procedure       |
| `let [x, y] = expr`           | destructuring declaration (fixed arity, flat) — e.g. `let [x, y] = pos()` |
| `x = expr`                    | assign: updates a local if one is in scope, else writes a global          |
| `x += e` · `-=` · `*=` · `/=` | compound assignment                                                       |
| `make "x expr`                | classic assignment — same store, same rules                               |
| `local "x expr`               | classic in-procedure `let`; error at top level                            |

Reads: plain names (`fd x`) or classic (`fd :x`) resolve identically. Plain `x = 1` with no prior `let` is allowed (creates a global). Inside procedures, prefer `let` first so helpers never stomp on globals.

---

## 6. Control flow

| Syntax                                    | Meaning                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `repeat n [ … ]`                          | loop n times; `repcount` = 1-based counter of innermost repeat                          |
| `while cond [ … ]`                        | loop while non-zero                                                                     |
| `for i = a to b [ … ]`                    | counted loop, **inclusive** of b, step 1                                                |
| `for i = a to b step s [ … ]`             | explicit step, may be negative: `for i = 10 to 1 step -2 [ … ]`                         |
| `for "i a b s [ … ]`                      | classic spelling; step **required**; read counter as `:i`                               |
| `for x in xs [ … ]`                       | iterate list (or string → 1-char strings); length captured at entry, elements read live |
| `if cond [ … ]`                           | conditional                                                                             |
| `if c1 [ … ] else if c2 [ … ] else [ … ]` | chains of any depth                                                                     |
| `break`                                   | end innermost enclosing loop                                                            |
| `continue`                                | next iteration of innermost loop                                                        |
| `stitchscope [ … ]`                       | temporarily override stitch-construction settings; always restore them on exit          |
| `atomic [ … ]`                            | keep the block's planned output contiguous and in authored order                        |
| `routegroup [ … ]`                        | explicitly allow independent runs in the block to reorder                               |

- `to` and `step` end the bound expressions naturally: `for i = 1 to n * 2 [ … ]` needs no parens.
- The loop variable doesn't leak.
- `break`/`continue` are **lexical**, checked at parse time: they must be written inside a loop body in the **same procedure**. A `break` in a helper can't end a caller's loop — use `return`/`exit`.
- `while true [ … break ]` is the idiomatic search loop.
- Control-transfer words, smallest to largest jump: `continue` (iteration) < `break` (innermost loop) < `exit`/bare `return` (procedure) < `output e`/`return e` (procedure, with value).
- Loop control is invisible to the stitch machine — a buffered satin column survives a `break`.

---

## 7. Procedures

```text
def leaf(size) [
  repeat 2 [ repeat 30 [ fd size rt 3 ] rt 90 ]
]
repeat 8 [ leaf(1.2) rt 45 ]
```

- `def name(a, b) [ … ]` — parameters are local; classic `to name :a :b … end` is equivalent.
- Calls: `leaf(1.2)` or `leaf 1.2`.
- Forward calls allowed (signatures are pre-scanned). Recursion allowed; call depth 200 (overridable to 2,000).
- `return` / classic `exit` leaves the procedure. `return`/`output`/`exit` are only valid inside a procedure body.

### Reporters (procedures returning values)

`return expr` (classic `output expr`, alias `op`) makes a procedure usable anywhere an expression is expected.

- A reporter used as a value (called in expression position, or passed as `@name` to `satin`/`fill`/`warp`/`stitchlen`) must reach `return` on **every** control-flow path — checked at **parse time**. An `if` covers only with a final `else` where both branches return; a `return` only inside a loop body does not count (the loop may run zero times).

### `@name` procedure references

`@name` yields a first-class reference to a user reporter or value-returning builtin (`@abs`, `@vadd`, `@sin`, `@str`, …). References can be stored, returned, placed in lists, passed to every reporter consumer, and called directly (`f(x)`, `refs[i](x)`, `maker()(x)`). Statement-only commands such as `@fd` are rejected.

`bind(@fn, leading, …)` evaluates and fixes leading arguments once. Binding all arguments creates a zero-argument reference; binding more than the target accepts is an error. Stacked binds fix the next free arguments. At most 16 values may be bound. Lists retain ordinary reference semantics; use `copy(xs)` when isolation is required. `isref(value)` returns 1/0.

References are not comparable and have no truthiness, ordering, or arithmetic. `print` includes their effective arity, for example `@abs/1` or `@helper(+1 bound)/2`; `str(ref)` is an error.

### Capturing closures

Modern `def(params) [ … ]` is an anonymous reporter expression. It snapshots every enclosing parameter/local it reads and returns a configured reference:

```text
def multiplier(k) [
  return def(x) [ return x * k ]
]
let triple = multiplier(3)
print triple(4) // 12
```

- Captures are snapshotted when the expression evaluates. Reassigning the outer binding later does not change the closure.
- Captured bindings are read-only inside the closure. Captured lists remain shared mutable objects, consistent with ordinary list assignment.
- Globals are never captured; they are read live at invocation time.
- Parameters/locals may not shadow an enclosing procedure binding. A closure captures at most 16 values.
- Every anonymous body must return a value on every path.
- Anonymous syntax is modern-only. Classic procedures have equivalent capability through named reporters plus `bind`.

### Source modules and the standard library

For signatures, input contracts, edge cases, examples, state effects, and RNG draw counts for every
bundled export, see the
[NeedleScript Standard Library Reference](./needlescript-standard-library-reference.md).

Import one exported procedure from a bundled module with a local alias:

```text
import std.textures.radialdir as radial
fill dir @radial
```

- Imports are compile-time only, top-level, and currently restricted to bundled `std.*` modules.
- The final dotted component is the exported procedure; everything before it is the module ID.
- The alias is an ordinary local procedure name and must not collide with another import, a local definition, or a built-in.
- Module procedures are qualified internally, so private helpers and same-named procedures in different modules do not collide.
- Modules expose procedures by prefixing a top-level definition with `export`: `export def name(args) [ … ]` (classic `export to name … end` also works).
- Standard-library modules contain only imports and procedure definitions. Importing a module has no runtime side effects and consumes no RNG draws.

Bundled modules currently include:

- `std.debugx` — preview-only `chalkgrid`, `chalkbbox`, and `chalkfield` overlays plus
  live `threadestimate()` and `coverprofile(path, stride)` stitch-history diagnostics.
  `threadestimate` approximates millimetres of top thread from committed penetrations;
  `coverprofile` returns `[distanceMm, coverageLayers]` samples. All helpers are drawless.
- `std.shapes` — centered outline constructors (`polypath`, `starpath`, `rectpath`,
  `roundrect`, `ellipsepath`, `arcpath`, `coilpath`, `heartpath`, `gearpath`,
  `superellipsepath`, `wavepath`, `rosepath`, `lissajouspath`). Closed outlines repeat
  their first point; polygonal outlines start at north and proceed counter-clockwise.
- `std.pathops` — normalized arc-length queries and polyline operations. `pointat`,
  `headingat`, `paramof`, and `subpath` use parameters in 0…1. Positive `offsetopen`
  offsets to the polyline's left.
- `std.mathx` — easing, waveform, angle, vector, clamped remap, and deterministic random
  helpers, plus the configured easing factory `easepow(power)`. Draw counts are documented
  in the module source and tested.
- `std.listx` — callback-based sorting/selection and common structural list helpers.
- `std.regions` — area, interior-pole, repeated inset, clipped tiling, grid-point, and
  seeded Voronoi partition helpers. `partitions` follows the fork convention and consumes
  exactly one main-stream draw.
- `std.layout` — centered circle/grid placements, normalized along-path placements, and
  uniform path fitting. Placements have the form `[[x, y], heading]`.
- `std.stitchcraft` — running, satin, bean, appliqué, eyelet, gradient-band,
  density-neutral two- and N-color gradient rows with reversible serpentine routing, fixed two-color
  row-blend, fleece knockdown, bordered-fill and configurable appliqué recipes, and coverage-aware
  stipple rituals. `stipple` consumes exactly
  one main-stream draw through `scatter`; the other helpers are drawless.
- `std.textures` — drawless direction fields (`radialdir(p)`, `curldir(p)`), configured
  field factories (`griddir(deg)`, `radialdirfrom(cx, cy)`, `curldirwith(scale)`), fill
  shapers (`wovenshape(p, row, v)`, `gradientshape(p, row, v)`) and the configured
  `gradientshapewith(lo, hi)` factory, plus clipped geometric fill-path
  generators (`hilbertpaths(region, cell)`, `truchetpaths(region, cell)`,
  `hitomezashi(region, cell, rowbits, colbits)`, `seigaiha(region, r)`,
  `asanoha(region, cell)`, `herringbonepaths(region, w)`). `curldir` uses a fixed 14 mm
  divergence-free curl-noise scale. The shapers use embroidery-safe defaults; path
  generators return open fragments clipped to the supplied simple region.

---

## 8. Movement

| Command             | Aliases                      | Effect                                                                                                                |
| ------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `fd n`              | `forward`                    | sew forward n mm (long moves auto-split at `stitchlen`)                                                               |
| `bk n`              | `back`, `backward`           | sew backward n mm                                                                                                     |
| `rt deg` / `lt deg` | `right` / `left`             | turn right / left                                                                                                     |
| `arc deg radius`    |                              | sew along a circle, turning deg total — positive curves right, negative left; works in every stitch mode              |
| `circle r`          |                              | full closed circle = `arc 360 r`                                                                                      |
| `up` / `down`       | `penup`/`pu`, `pendown`/`pd` | needle up = travel as jump · down = sew                                                                               |
| `setxy x y`         |                              | move to absolute position (sews if pen down)                                                                          |
| `setx x` / `sety y` |                              | move one axis                                                                                                         |
| `seth deg`          | `setheading`                 | set heading absolutely                                                                                                |
| `moveto x y`        | `jump`                       | **jump without sewing**, pen state preserved; respects current transform                                              |
| `gohome`            |                              | pen-safe `moveto 0 0`; does NOT reset heading (add `seth 0`)                                                          |
| `home`              |                              | return to (0,0) heading 0 — **sews a line if pen is down**; prefer `moveto 0 0`                                       |
| `setpos(p)`         |                              | command: `setxy p[0] p[1]` — record/replay symmetric with `pos()`                                                     |
| `push` / `pop`      |                              | save/restore needle state (position, heading, pen) without sewing; stack max 500; `pop` on empty warns and is ignored |
| `cs`                | `clearscreen`, `clear`       | accepted for Logo familiarity; does nothing                                                                           |

Use `push`/`pop` to branch and return (trees, ferns) rather than sewing back out of every branch.

---

## 9. Thread & stitch quality

Modes are sticky: they apply to every move until changed.

| Command                         | Effect                                                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stitchlen mm` (`stitchlength`) | running-stitch length, clamped 0.4–12 mm (default **2.5**). Three forms: `stitchlen 2.5` (uniform) · `stitchlen [4, 1.5]` (cycling pattern, optional phase arg) · `stitchlen @fn` (per-stitch reporter) — §16.3 |
| `satin mm`                      | zigzag column of this width; spacing set by `density`. `satin 0` returns to running stitch. Recommended 2–8 mm; >~8 mm warns (snag risk). `satin @fn` = programmable column — §16.1                             |
| `satinbetween(railA, railB, …)` | immediate satin column between authored path rails; optional checkpoints/reporter — §16.2. Call syntax only                                                                                                     |
| `satincap 'mode'`               | open-column cap at both ends: `'legacy'`, `'butt'`, `'taper'`, `'point'`, or `'round'`; default `'legacy'`                                                                                                      |
| `satincaplen mm`                | physical taper/point/round transition length, 0.4–20 mm (default **2**)                                                                                                                                         |
| `satinjoin 'mode'`              | sharp-corner construction: `'legacy'`, `'continuous'`, `'fan'`, `'miter'`, or `'split'`; default `'legacy'`                                                                                                     |
| `satincorner degrees`           | absolute travel-direction change that selects a sharp join, 5–175° (default **60**)                                                                                                                             |
| `satinwide 'mode'`              | wide-column policy: `'warn'` keeps the legacy event path; `'split'` opts into safe adjacent subcolumns; default `'warn'`                                                                                        |
| `satinmaxwidth mm`              | physical width ceiling for each split subcolumn, 2–12 mm (default **7.5**)                                                                                                                                      |
| `satinsplitoverlap mm`          | interlocking shared-seam band, 0–1 mm (default **0.5**)                                                                                                                                                         |
| `density mm`                    | satin penetration spacing, 0.25–5 mm (default **0.4**)                                                                                                                                                          |
| `bean n`                        | each stitch sewn n times (forced odd, max 9); `bean 1` off                                                                                                                                                      |
| `estitch mm`                    | blanket stitch: prongs of this length on the left of travel, spaced by `stitchlen`; `estitch 0` off                                                                                                             |
| `color n`                       | switch to numeric thread index n (existing event/DST semantics are unchanged)                                                                                                                                   |
| `color c`                       | with a color string (`'#e94560'`, `'crimson'`), resolve the lowest exact palette match or append a new thread slot                                                                                              |
| `stop`                          | shorthand for "next colour"                                                                                                                                                                                     |
| `trim`                          | cut thread at current position                                                                                                                                                                                  |
| `lock mm`                       | tie-in/tie-off: 4 micro back-stitches auto-sewn wherever thread starts or ends (design start/end, colour changes, trims, jumps ≥ 4 mm). Size 0.3–1.5 mm (default **0.7**); `lock 0` disables                    |

A satin column is buffered while drawn and flushed (underlay first, then zigzag) when it ends: pen up, mode change, colour change, trim, fill, or end of program.

### Wide-column splitting

`satinwide 'split'` examines the completed column after transforms and pull compensation, in
physical hoop-space millimetres. If its widest realized rung exceeds `satinmaxwidth`, the machine
chooses enough adjacent subcolumns that every topping chord remains below the configured ceiling.
The construction supports numeric open spine satin and non-reporter `satinbetween` rails, including
smooth width changes, ordinary tapers, cap narrowing, straight columns, and gently curved columns.
The default `satinwide 'warn'` path does not run this planner: existing events and snag/curvature
warnings remain byte-identical, and `satinmaxwidth` does not replace the legacy ~8 mm advisory.

```needlescript
satinwide 'split'
satinmaxwidth 7.5
satinsplitoverlap 0.5
satin 12
fd 40
satin 0
```

Each shared split seam alternates which neighbor owns half of the `satinsplitoverlap` band. Both
neighbors use the same moving boundary, so the topping has neither a fabric gap nor a stationary
double-layer strip. The default 0.5 mm value is physical and is not scaled. The machine routes each
complete subcolumn from the nearest available end; that subcolumn's resolved underlay passes sew
before its topping, then a short jump moves to the next construction. No trim or color change is
inserted by the splitter itself, although the normal `autotrim` post-process may act on a long jump.

Splitting is deliberately conservative. Closed columns, sharp corners, cusps/U-turns, widths that
already exceed the local curve radius, reversed/crossed rails, programmable spine satin, and
reporter-driven `satinbetween` remain unsplit with a precise warning. Reporter-defined width,
inset, and rake do not provide a safe common partition topology. Split planning consumes no RNG
draws, has no effect in `trace`, is sticky and `stitchscope`-aware, and affects emitted stitches,
coverage/history, and warnings only when `'split'` is selected and the physical ceiling is exceeded.

### Scoped construction settings — `stitchscope`

`stitchscope [ … ]` temporarily overrides stitch construction without manually resetting every
command:

```text
stitchscope [
  density 0.5
  underlay 'edge'
  satin 4
  fd 20
]
// the previous stitch mode, density, and underlay are active again here
```

The scope snapshots and restores running-stitch numeric/list/reporter forms and list progress; bean
and E-stitch modes; satin width/reporter, density, alternating side, cap/join policies, wide-column
policy, maximum width, and seam interlock;
fill angle, spacing,
construction/edge-run insets, minimum useful edge-fragment length, connector/stagger policies,
length forms, and pending programmable/custom fill arm; plus lock, pull compensation, satin/fill
underlay, double underlay, short-stitch, auto-trim, and max-density settings.
`fabric` changes those same construction fields and is therefore scoped.

It does **not** restore turtle position/heading/pen or the `push`/`pop` stack; variables; events,
warnings, history, or budgets; color/palette; seed/RNG/noise; transforms/effects/declump; hoop,
override, plan, or preflight directives. In particular, movement and color changes inside remain in
effect afterward. Top-level-only directives remain illegal inside the block; ordinary side effects
such as `seed`, variables, and printing escape normally. `[ ]` still creates no variable scope.

Scopes nest in LIFO order and restore through `return`/`exit`, `break`, `continue`, and runtime
errors. Pending reporter-running or satin construction flushes at entry and exit so each buffered
construction uses one coherent configuration. A `beginfill…endfill` recording cannot cross either
boundary. An unused outer `fill` arm is restored after the block; replacing it inside produces the
existing one-time “replaced before use” note, while merely crossing a scope is silent.

`stitchscope` composes with procedures and transform/effect blocks in normal lexical order. Boundary
flushes occur under the transform/effect active at that boundary. Inside `trace`, construction
commands remain inert for captured geometry and emit their existing notes; scope restoration still
runs.

### Native color metadata

Colors are ordinary strings. Hex accepts `#rgb` or `#rrggbb` and normalizes to lowercase six-digit form; CSS named colors are case-insensitive. Alpha is rejected because thread is opaque. In classic syntax, named colors may use quoted words (`color "crimson`), but hex must use a string because `#` outside a string opens a comment.

```text
let bg = '#101418' // [color]
let inks = ['#0b132b', '#5bc0be', 'crimson'] // [palette]
background bg
palette inks
color nearestcolor(hsl(205, 0.6, 0.5), inks)
```

`palette colors` is a top-level, once-only directive accepting 1–64 colors. It must run before stitches, `color`, or `stop`. `background color` is also top-level and once-only, and must precede the first stitch. Both are metadata: they do not alter geometry or DST bytes. Missing slots repeat the built-in default palette; missing background uses the default fabric color.

Color reporters are `colorindex()`, `colorhex()`, `slotcolor(i)`, and `backgroundcolor()`. Pure Library-tier functions are `rgb(r,g,b)`, `hsl(h,s,l)`, `hexparts(c)`, `lerpcolor(a,b,t[,mode])`, `nearestcolor(c,colors)`, and `colordist(a,b)`. `lerpcolor` and nearest/distance use OKLab by default; pass `'rgb'` to `lerpcolor` for raw sRGB interpolation. All are drawless.

Customizer annotations: `[color]`, `[color:#112233,#445566]`, `[color:palette]`, fixed-length `[palette]`, and resizable `[palette:min:max]`. Color presets accept unquoted hex and lists of quoted colors.

---

## 10. Fills

Trace the **boundary** between `beginfill`/`endfill`; the engine packs tatami rows inside.

```text
fillangle 30
up setxy -26 -15 down
beginfill
  repeat 6 [ fd 30 rt 60 ]
endfill
```

| Command                                   | Effect                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginfill … endfill`                     | moves between them trace a boundary; `endfill` sews the fill. A pen-up move (`up … down`) inside starts a new ring — inner rings become **holes** (even-odd rule)                                                                                                                                                 |
| `fillangle deg`                           | direction of fill rows (default 0). Thread is shiny — the angle is a visible design choice                                                                                                                                                                                                                        |
| `fillspacing mm`                          | row spacing, 0.25–5 mm (default **0.4**)                                                                                                                                                                                                                                                                          |
| `fillinset mm`                            | inset the complete compound fill region by 0–10 physical mm (default **0**) to reserve border overlap. Outer boundaries shrink, holes expand, and split components are joined only by jumps. Topping and fill underlay use the inset region; collapsed/split results warn with a source line and preview location |
| `filledgerun mm`                          | add an inset closed boundary pass after fill underlay and before topping. 0–10 physical mm; default **0** disables it. Compound contours remain inside the construction region and use jumps between disconnected pieces                                                                                          |
| `filledgeshort mm`                        | minimum useful open topping-row fragment length in physical hoop-space mm, 0–10; default **0** disables filtering. Applies to fixed, programmable, and custom-path fills; closed contours and underlay are unchanged                                                                                              |
| `fillstagger 'mode'`                      | topping penetration phase: `'legacy'` (existing output), `'brick'` (alternating), `'progressive'` (four-row cycle), or `'random'` (stable geometry hash; zero RNG draws). See §16.3                                                                                                                               |
| `fillstaggeramount fraction`              | wrapped 0–1 phase amount for non-legacy staggering (default **0.65**). With fixed fill length this is a fraction of that length; list/reporter forms use each row's first effective length                                                                                                                        |
| `fillconnect 'mode'`                      | topping travel between rows/fragments: `'legacy'` (existing routing), `'inside'` (complete connector stays inside with edge clearance), `'jump'` (always jump), or `'trim'` (jump and cut at the active auto-trim threshold; 7 mm if auto-trim is off)                                                            |
| `filllen mm`                              | fill stitch length, 1–7 mm; default follows `stitchlen`; `filllen 0` = follow again. Rows are brick-offset. Same three forms as `stitchlen`: numeric · `[list]` rhythm per row · `@fn` reporter (t/s/i reset per row). `filllen 0` propagates whichever form `stitchlen` uses                                     |
| `fill dir @field` / `fill shape @texture` | arms a **programmable fill** for the next `beginfill…endfill` — §16.2                                                                                                                                                                                                                                             |

With `compensation 'directional'`, open topping rows use grain-aware pull along their final physical
direction. Curved programmable/custom rows resolve each end from its own tangent. Closed custom
contours are not widened. Use `fillinset` to reserve the compensated row ends beneath a border;
crossing the authored outer boundary or a hole produces one spatial warning. Push compensation is
not applied pending sew-out measurements. The default `'legacy'` mode retains scalar `pullcomp`.

---

## 11. Strings

Immutable character sequences in single quotes; must close on the same line. Escapes — **only** these four: `\'` `\\` `\n` `\t`. Any other backslash sequence and unterminated strings are hard errors.

- **Case-sensitive contents** (`'Anna' == 'anna'` → 0) in an otherwise case-insensitive language.
- Classic quoted words in **expression position** evaluate to lowercased strings: `fabric "knit` ≡ `fabric 'knit'`; `clippaths(a, b, "difference)` ≡ `clippaths(a, b, 'difference')`. Binding positions (`make "x`, `for "i`, `print "label`) unchanged.
- Equality `=`/`==`: exact, case-sensitive; cross-type is `0`. No truthiness (`if s […]` errors — use `len(s) > 0`). No ordering (`<` errors). No `+` (use `concat(a, b)`; `concat('x', 1)` errors — convert with `str`).
- Indexing `s[i]`: 0-based, negatives from end, returns 1-char string. Index assignment errors. `for c in s [ … ]` iterates 1-char strings.

### Sequence overloads (list functions that also accept strings)

`len(s)` · `first(s)`/`last(s)` (1-char strings) · `slice(s, a[, b])` (Python semantics, clamped) · `reverse(s)` · `concat(a, b)` (both strings) · `contains(s, sub)` · `indexof(s, sub)` (first index or −1) · `copy(s)` (identity).

### String functions (call-syntax only, Library tier)

| Function                      | Returns                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `str(v)`                      | number → string (exactly what `print` shows); identity on a string; error on a list    |
| `num(s)` · `num(s, fallback)` | parse number; error (or fallback) on non-numeric                                       |
| `isstring(v)`                 | `1`/`0` (sibling of `islist`)                                                          |
| `chars(s)`                    | list of 1-char strings                                                                 |
| `split(s, sep)`               | list of strings; `sep` must be non-empty (use `chars` for per-character)               |
| `joinstr(xs, sep)`            | join list of strings; every element must be a string                                   |
| `upper(s)` / `lower(s)`       | ASCII case (A–Z / a–z only)                                                            |
| `strip(s)`                    | remove leading/trailing whitespace — **`trim` cuts thread; `strip` strips whitespace** |
| `repeatstr(s, n)`             | s repeated n times (integer n ≥ 0)                                                     |

`@str`, `@upper`, etc. work as `@`-references in `map`/`filter`/`compose`.

### Mode consumers

`fabric`, `threadprofile`, `stabilizer`, `underlay`, `fillunderlay`, `clippaths`, `hoop`,
`routesort`, and `plan` accept any string expression for their mode argument, matched
case-insensitively. Unknown modes error with did-you-mean.

Strings inside lists: allowed; rendered single-quoted; `pick`/`shuffle`/`contains`/`indexof`/`for…in`/destructuring work; numeric aggregates (`sum`, `sort`, …) error on string elements.

---

## 12. Lists

Ordered, nestable, ragged lists of numbers, strings, and lists. A **point** is `[x, y]`, a **path** is a list of points, a **region** is a closed path (closing segment implicit).

```text
let palette = [2, 3, 5, 7]     // nesting and trailing commas allowed
print palette[0]               // 0-based; palette[-1] = last
palette[1] = 4                 // index assignment; += -= *= /= work
let [x, y] = pos()             // destructuring
for p in path [ setpos(p) ]
```

- **Reference semantics** (like Python/JS): assignment shares the list; `copy(xs)` makes an independent deep copy.
- **Loud errors:** non-integer index, out-of-range index, list in a condition, list in arithmetic, list fed to a scalar command. Exception: deep equality via `=`/`==` (1e-9 tolerance); number vs list compares as `0`.
- Max nesting depth 16.

### List functions (call-syntax only: `len(xs)`, never `len xs`)

| Function                                           | Returns / effect                                               |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `filled(n, v)`                                     | new list of n deep copies of v                                 |
| `len(xs)` · `islist(v)`                            | element count · `1`/`0`                                        |
| `first(xs)` · `last(xs)`                           | `xs[0]` · `xs[-1]`                                             |
| `append(xs, v)` · `prepend(xs, v)`                 | **mutates**: add at end / front (statements)                   |
| `insertat(xs, i, v)`                               | **mutates**: insert at index i (0…len allowed)                 |
| `removeat(xs, i)`                                  | **mutates**: remove index i, **returns** the removed value     |
| `concat(a, b)`                                     | new list (shallow — elements shared)                           |
| `slice(xs, a)` · `slice(xs, a, b)`                 | new list, Python semantics incl. negatives, clamped            |
| `reverse(xs)` · `sort(xs)`                         | **new** lists (pure); `sort` numbers-only, ascending, stable   |
| `copy(xs)`                                         | deep copy                                                      |
| `indexof(xs, v)` · `contains(xs, v)`               | first index (deep, tolerant compare) or −1 · `1`/`0`           |
| `sum(xs)` · `mean(xs)` · `minof(xs)` · `maxof(xs)` | numeric aggregates; `sum([])` = 0, the others error on empty   |
| `pick(xs)`                                         | random element — seeded, exactly 1 draw                        |
| `shuffle(xs)`                                      | new shuffled list — seeded, exactly 1 main-stream draw (forks) |

### Travel routing

`routesort(items[, start[, mode]])` returns a new greedy nearest-neighbor ordering of points and paths. Without `start`, `items[0]` stays first; with `[x, y]`, the nearest item starts. Paths advance the cursor from their first to last vertex. Mode `'both'` also considers the last endpoint and returns a reversed **copy** when it is nearer; `'chain'` is the default. The outer result is new, ordinary elements are shared, and reversed path containers are new. Empty and singleton inputs work naturally. Equal distances within `1e-9` choose the lowest original index.

The function is pure and drawless, Library-tier, charged to `'geoinput'` by item count and to ordinary list/op allocation budgets. Malformed elements name their original index.

`push`/`pop` are turtle-state commands, not list ops — use `append`.

### Sequences

| Function                                      | Returns                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `range(n)` · `range(a, b)` · `range(a, b, s)` | 0-based, **end-exclusive** integer sequences                                                        |
| `steps(a, b)` · `steps(a, b, inc)`            | **end-inclusive** numeric sweep, default increment 1 — `steps(0, 6, 0.2)` → 31 elements ending at 6 |

### Higher-order functions

| Function                | Returns                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `map(xs, @fn)`          | new list of `fn(element)`                                          |
| `filter(xs, @fn)`       | elements where `fn(element)` is truthy                             |
| `reduce(xs, @fn, init)` | fold: `fn(fn(init, xs[0]), xs[1]) …`                               |
| `compose(@f, @g, …)`    | left-to-right pipeline reference: `compose(@f, @g)(x)` = `g(f(x))` |
| `bind(@f, value, …)`    | reference with leading arguments fixed at creation                 |
| `isref(value)`          | 1 for plain, bound, composed, and capturing references; else 0     |

`print` renders lists as `[1, 2, 3]`, capped at 64 elements with `… +n more`.

---

## 13. Generative math

Conventions used everywhere: a point is `[x, y]`, a path is a list of points, a region is a closed path (implicit closing segment). All functions below are **call-syntax only**. Outputs compose: `scatter` → `voronoi` → `offsetpath` → `resample` → `sewpath`.

### 13.1 Vectors (points)

Everything heading-like uses turtle degrees (0 = north, clockwise), matching `seth`/`atan`/`towards`.

| Function                                 | Returns                                                        |
| ---------------------------------------- | -------------------------------------------------------------- |
| `vadd(a, b)` · `vsub(a, b)`              | new point                                                      |
| `vscale(a, s)` · `vlerp(a, b, t)`        | new point                                                      |
| `vdot(a, b)` · `vlen(a)` · `vdist(a, b)` | number                                                         |
| `vnorm(a)`                               | unit vector — the zero vector is an **error**                  |
| `vrot(a, deg)`                           | rotated **clockwise** for positive deg (matches `rt`)          |
| `vheading(a)`                            | turtle heading of the vector (≡ `atan a[0] a[1]`)              |
| `vfromheading(deg, len)`                 | inverse — `vfromheading(heading, 1)` is the needle's direction |

No operator broadcasting — `[1,2] + [3,4]` is a loud error (use `vadd` for element-wise, `concat` to join).

### 13.2 Segments

| Function                   | Returns                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segisect(a0, a1, b0, b1)` | intersection point `[x, y]` of segments a0→a1 and b0→b1, or `[]` if they don't cross (segment test, not infinite-line; collinear overlap → midpoint of overlap) |
| `segdist(p, a, b)`         | shortest distance from p to segment a→b (endpoint distance if the foot falls outside; zero-length segment ≡ `vdist(p, a)`)                                      |
| `nearestonpath(p, path)`   | closest point on an **open** polyline (vertices or along segments) as `[x, y]`; O(len(path)); empty path errors                                                 |

### 13.3 Paths & curves

| Function                                                           | Returns                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pathlen(path)`                                                    | total polyline length                                                                                                                                                                                                                                                                        |
| `resample(path, mm)`                                               | new path with segments exactly mm long (last may be shorter), first & last preserved — bridges math space and stitch spacing. Overloads: `resample(path, [4, 1.5][, phase])` cycling pattern · `resample(path, @fn)` per-point reporter with the `(t, s, i, p)` signature of `stitchlen @fn` |
| `curveflat(spec, tol[, 'closed'])`                                 | adaptively flatten editable cubic anchors `[[anchor, hin, hout], …]`; handles are relative offsets and compact `[x,y]` anchors are corners                                                                                                                                                   |
| `curvepath(spec, spacing[, phase][, mode])`                        | flatten at 0.05 mm tolerance and arc-length resample; mode is `'open'` (default) or `'closed'`                                                                                                                                                                                               |
| `isclosed(path)` · `openpath(path)` · `pathorientation(path)`      | canonical-ring detection/conversion and Cartesian orientation (`1` CCW, `-1` CW, `0` degenerate)                                                                                                                                                                                             |
| `pointat` · `headingat` · `normalat` · `paramof`                   | normalized arc-length path queries; the normal points left of travel                                                                                                                                                                                                                         |
| `paramtomm` · `mmtoparam` · `subpath` · `splitat` · `insertvertex` | normalized parameter/length conversion and shape-preserving path editing                                                                                                                                                                                                                     |
| `dashes(path, onmm, offmm[, phasemm])`                             | arc-length dash segments; optional phase enters the repeating dash/gap cycle                                                                                                                                                                                                                 |
| `ispoint(v)` · `ispath(v)` · `iscurvespec(v)`                      | non-throwing structural predicates                                                                                                                                                                                                                                                           |
| `chaikin(path, n)`                                                 | corner-cut smoothing, n iterations 1–6                                                                                                                                                                                                                                                       |
| `catmull(points, mm)`                                              | Catmull-Rom spline through control points, resampled                                                                                                                                                                                                                                         |
| `bezier(p0, c0, c1, p1, mm)`                                       | cubic Bézier, resampled                                                                                                                                                                                                                                                                      |
| `centroid(path)` · `bbox(path)`                                    | point · `[minx, miny, maxx, maxy]`                                                                                                                                                                                                                                                           |
| `xlate(path, dx, dy)`                                              | new translated path — functional twin of `translate`                                                                                                                                                                                                                                         |
| `xrotate(path, deg)` · `xrotate(path, deg, cx, cy)`                | new rotated path (clockwise), optional pivot                                                                                                                                                                                                                                                 |
| `xscale(path, s)` · `xscale(path, sx, sy)`                         | new scaled path                                                                                                                                                                                                                                                                              |
| `xmirror(path, deg)`                                               | new path reflected across heading deg                                                                                                                                                                                                                                                        |
| `sewpath(path)`                                                    | **command**: exactly `for p in path [ setpos(p) ]` — pen state, stitch mode, satin, auto-split all apply                                                                                                                                                                                     |

`resample(path, spacing[, phase], 'closed')` treats either ring form as closed,
distributes numeric spacing around the seam, and returns a canonical ring (first point repeated).
New closed producers return canonical rings; clipping and authored `[path: closed]` literals remain
implicit rings. Consumers accept both forms.

### 13.4 Generators (seeded)

| Function                                        | Returns                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `scatter(mindist)` · `scatter(mindist, region)` | Poisson-disc (Bridson) points over the configured sewable field, or inside `region`. Capped at 20,000 points (stock) |
| `voronoi(points)` · `voronoi(points, region)`   | one cell (region) per input point, **in input order**, clipped to field or region                                    |
| `triangulate(points)`                           | Delaunay triangles: list of 3-point regions                                                                          |
| `hull(points)`                                  | convex hull as a region, counter-clockwise                                                                           |
| `relax(points, n)`                              | n rounds of Lloyd's relaxation (evens spacing); uses the configured field like `voronoi`                             |

### 13.5 Geometry ops

Backed by Clipper2 on µm integer coordinates — platform-stable results.

| Function                                        | Returns                                                                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `offsetpath(region, mm)`                        | **list of regions** — positive inflates, negative shrinks; shrinking may split a shape or return an **empty list** (not an error). Round joins |
| `clippaths(a, b, 'op')`                         | boolean of two regions; op ∈ `'union'` `'intersect'` `'difference'` `'xor'` (string or `"op` form) → list of regions                           |
| `strokepath(path, width[, cap[, join]])`        | stroke outline as canonical regions; caps: round/butt/square, joins: round/miter/bevel                                                         |
| `clipopen(path, region[, mode])`                | open fragments inside (default) or outside a compound even-odd region                                                                          |
| `joinpaths(fragments, tol)`                     | deterministically weld nearby endpoints; closed chains become canonical rings                                                                  |
| `pathisectparams(a,b)` · `pathselfisects(path)` | intersection points plus normalized parameters                                                                                                 |
| `inpath(p, region)`                             | `1`/`0`, even-odd rule (consistent with fills)                                                                                                 |

---

## 14. Transforms (block-scoped, Core)

CTM stack, OpenSCAD-style: arguments then a block; nests inside-out. Both spellings work: `translate 20 0 [ … ]` or `translate(20, 0) [ … ]`.

| Command                       | Effect                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `translate dx dy [ … ]`       | shift by (dx, dy) mm                                                                                            |
| `rotate deg [ … ]`            | rotate clockwise about the current origin                                                                       |
| `rotateabout deg cx cy [ … ]` | rotate about explicit pivot                                                                                     |
| `scale s [ … ]`               | uniform scale                                                                                                   |
| `scalexy sx sy [ … ]`         | per-axis scale                                                                                                  |
| `mirror deg [ … ]`            | reflect across a line through origin at heading deg (`mirror 0` flips left/right, `mirror 90` flips top/bottom) |
| `skew ax ay [ … ]`            | shear by ax / ay degrees                                                                                        |
| `transform a b c d e f [ … ]` | raw 2×3 affine: `(x, y) → (a·x + c·y + e, b·x + d·y + f)`                                                       |

Semantics:

- **The turtle lives in untransformed local space.** Inside a transform block `xcor`/`ycor`/`pos()`/`distance` report pre-transform coordinates; `setxy` is local ("absolute within this block's frame"). A motif doesn't know it's transformed — guards like `distance(0,0) > 44` behave identically in any frame, and randomness draws are unchanged by wrapping.
- **Stitches stay physical.** The transform maps the path; stitch-length splitting, satin width, snag/curvature checks and the physics layer run in hoop space **after** the transform. `scale 3 [ fd 30 ]` sews physical 2.5 mm stitches over 90 mm — not three stretched 7.5 mm stitches. `pullcomp` is applied after the transform and never scaled.
- History queries (`coverat` etc.) take local points and map them through the CTM.

---

## 15. Effects (block-scoped, Core)

Per-point functions applied to a block's emitted geometry; live on the same stack as transforms and nest freely.

| Effect                           | Linear? | Frame                  | Pipeline stage      | Seeded?                    |
| -------------------------------- | ------- | ---------------------- | ------------------- | -------------------------- |
| transforms                       | yes     | local, composing       | before stitch split | no                         |
| `warp @fn [ … ]`                 | no      | local, post-transform  | before split        | only if the reporter draws |
| `humanize amount [ … ]`          | no      | hoop, post-transform   | after split         | yes (forks, 1 draw)        |
| `snaptogrid … [ … ]`             | no      | **fixed hoop lattice** | after split         | no (drawless)              |
| `declump limit [maxshift] [ … ]` | no      | hoop                   | after split         | no (drawless)              |

After-split effects (`humanize`, `snaptogrid`, `declump`) deliberately **skip satin columns** (one-time warning) — jittering a satin rail wrecks the column.

- **`warp @fn`** — reporter takes a point `[x, y]`, returns a point; must have exactly one parameter and return a point on every path. Deforms the pre-split path, so the result is still split into clean stitches. Hoop-overflow/density/long-stitch checks run on post-warp geometry (warn, don't forbid).
- **`humanize amount`** — offsets each penetration by up to `amount` mm (clamped 0–2) using **coherent** seeded `snoise2` (hand-drift, not white noise). Forks: draws exactly 1 main-stream value, so editing block contents never reshuffles the rest.
- **`snaptogrid …`** — quantizes penetrations to a lattice in **fixed hoop space, outside any enclosing transform** (a grid belongs to the fabric, not the motif — copies stamped via `translate` share one lattice). Arity overloads: `snaptogrid cell` · `cellx celly` · `cellx celly ox oy` · `cellx celly ox oy ang`. Pure and drawless. Snapped coincident penetrations merge with the tiny-stitch warning.
- **`declump limit [maxshift]`** — eases crowded penetrations **along their own line of travel**
  (never sideways) once coverage exceeds `limit` layers. `maxshift` defaults to 1.5 mm and is
  clamped to 0–5. Greedy: earlier stitches win. Generated fill underlay, edge-run, topping, and sewn
  topping connectors use the same active limit in sew order. A shifted fill point and its relief
  segment must remain inside the resolved compound region; shifted points retain 0.1 mm clearance
  from outer and hole boundaries, preserve local row order, and otherwise fall back unchanged.
  Fill jumps/trims reset the run. Satin columns still warn and skip the effect. Drawless. Typical:
  limit 1.5–2.5, declump **outermost**: `declump 2 [ humanize 0.3 [ … ] ]`. `maxshift 0` cancels
  easing without changing seed state (A/B testing).

### Effect-path functions (pure, on point lists)

| Function                               | Returns                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `warppath(path, @fn)`                  | new path, every point mapped through the reporter                                     |
| `humanizepath(path, amount)`           | new path with seeded coherent jitter (forks like the block)                           |
| `snappath(path, cell …)`               | new path snapped to the fixed lattice (same arity overloads)                          |
| `declumppath(path, limit[, maxshift])` | new path with along-axis relief using committed history (reads only, commits nothing) |

---

## 16. Programmable stitching

### Satin caps — `satincap` / `satincaplen`

Caps are opt-in construction policies for both ends of an **open** satin column:

| Mode       | Output semantics                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `'legacy'` | byte-identical compatibility path (default)                                                      |
| `'butt'`   | retain full realized width through the start and finish                                          |
| `'taper'`  | smoothly narrow over `satincaplen`, retaining a machine-safe nonzero terminal bite               |
| `'point'`  | converge both rails at the spine tip; coincident/sub-0.2 mm penetrations merge                   |
| `'round'`  | fan along a circular half-width profile, producing a semicircular end where the geometry permits |

`satincaplen` accepts 0.4–20 mm and defaults to 2 mm. It bounds taper and point transitions. A
round cap needs longitudinal space equal to half its realized endpoint width and must fit within
both `satincaplen` and half the column; otherwise a source warning names the affected end and the
generator falls back to point. On very short taper/point columns, each end is bounded to half the
available spine length. Closed columns have no tips, so they keep their deterministic seam and
legacy output even when a cap policy is active.

The engine keeps start and end modes independently, although the current command sets both.
Distances, endpoint widths, and fallback decisions are made in final physical hoop space after
affine transforms or warps; pull compensation is included in the realized width. The policy also
applies to `satin @fn` and `satinbetween`. Narrowing caps shorten every underlay pass by the same
physical transition span so it stays beneath the topping. Caps do not add trims, colors, or locks;
ordinary locks are still applied later at thread-run boundaries. All cap construction is
deterministic and consumes zero RNG draws. Both commands are sticky and restored by `stitchscope`.

### Satin corners — `satinjoin` / `satincorner`

`satinjoin` is an opt-in construction policy for turns whose absolute change in travel direction
is at least `satincorner`. The threshold accepts 5–175 degrees, defaults to 60, and is evaluated in
physical hoop space after transforms and warps. Lower values classify gentler bends as corners.

| Mode           | Output semantics                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `'legacy'`     | byte-identical compatibility path (default); `satincorner` has no effect                                                            |
| `'continuous'` | retain one continuous zigzag and, when `shortstitch` is enabled, pull alternating inner-corner bites to 60% width                   |
| `'fan'`        | distribute outer penetrations around the turn; retain at most eight outer points and two shortened inner bites in the corner window |
| `'miter'`      | end and restart straight topping legs at bounded intersections of their offset rails, with 0.5 mm physical overlap                  |
| `'split'`      | end the incoming topping leg past the vertex and start the outgoing leg before it, with 0.5 mm physical overlap                     |

Every underlay pass remains one continuous path through the authored spine or paired rails; only
the topping construction changes. Miter and split use ordinary stitch connectors, never implicit
jumps, trims, color changes, or locks. The fan penetration caps and miter limit bound repeated
outer holes and inner-corner stacks. If a selected construction lacks enough straight support, is
near a reversal, exceeds the miter limit, or requires unsupported closed-seam handling, the engine
emits a source warning and uses `continuous` at that corner.

The same policy applies to plain, transformed, programmable, and rail-pair satin. Rail-pair
construction retains the checkpoint-anchored correspondence prepared before corner selection.
Join construction is deterministic and drawless. Both settings are sticky and restored by
`stitchscope`.

### 16.1 Programmable satin — `satin @fn`

Replaces the built-in zigzag with a shape reporter, queried once per stitch pair walking the column spine. `satin 0` (or any numeric form) disengages and flushes.

Reporter signature `(t, s, i, u)` → returns a 5-list `[advance, leftw, rightw, leftlag, rightlag]` (all mm):

| Input | Unit       | Meaning                                                                         |
| ----- | ---------- | ------------------------------------------------------------------------------- |
| `t`   | mm         | cursor arc-length from column start                                             |
| `s`   | 0..1       | normalized arc-length over the whole (fully buffered) column — for tapers/fades |
| `i`   | count      | 0-based pair index — alternate behaviour without state                          |
| `u`   | turtle deg | local spine heading at the cursor                                               |

| Return slot            | Meaning                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `advance`              | forward cursor step (dynamic density). **Must be > 0**; clamped to a 0.1 mm floor with a one-time warning                                                     |
| `leftw` / `rightw`     | half-widths of left/right rail; asymmetry allowed; negatives clamp to 0                                                                                       |
| `leftlag` / `rightlag` | longitudinal rail-endpoint offset along the spine (− behind, + ahead) — opposite-sign lags rake diagonals; alternating rake by `i` crosses them (woven satin) |

All I/O is **spine-local**; the engine maps to hoop space afterwards, so custom columns compose with transforms and `warp` like built-in satin, and the full physics layer (pullcomp, underlay, snag/curvature checks, density) applies. Draws nothing from the seeded stream unless the reporter does. Equivalence pin: `satin 4` ≡ `satin @c` with `def c(t,s,i,u) [ return [0.4, 2, 2, 0, 0] ]`.

Helpers (Library tier, pure, zero draws):

| Helper                              | Expands to                           |
| ----------------------------------- | ------------------------------------ |
| `satinpair(advance, width)`         | `[advance, width, width, 0, 0]`      |
| `satinasym(advance, leftw, rightw)` | `[advance, leftw, rightw, 0, 0]`     |
| `satinrake(advance, width, lag)`    | `[advance, width, width, -lag, lag]` |

### 16.2 Rail-pair satin — `satinbetween(railA, railB)`

Sews an immediate satin column between two data paths. Unlike `satin`, the rails are the authored edges rather than offsets around a turtle spine.

| Form                                              | Meaning                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `satinbetween(railA, railB)`                      | pair by normalized arc length                                          |
| `satinbetween(railA, railB, checkpoints)`         | pin correspondence with ordered `[[pointA, pointB], …]` pairs (max 64) |
| `satinbetween(railA, railB, @shape)`              | reporter-shaped rail column                                            |
| `satinbetween(railA, railB, checkpoints, @shape)` | checkpoints plus reporter                                              |

Rails must each contain at least two points, have positive path length, and both be open or both closed. Open rail B auto-reverses only when its reversed endpoint pairing is strictly cheaper. Closed rails match winding and choose a deterministic seam. Checkpoints project to their rails and must increase strictly along both. Rails are mapped through the active transform/warp **before** pairing, so density, underlay, pull compensation, snag checks, and the 12 mm ceiling all operate in physical hoop millimetres. The command is atomic, ignores pen state, preserves heading and sticky stitch modes, commits history immediately, and draws no RNG values. It errors inside `trace`/`tracerings` and `beginfill…endfill`.

Reporter signature `(t, s, i, u)` returns `[advance, insetA, insetB, lagA, lagB]`. Inputs are hoop-space spine distance, normalized position, pair index, and hoop-space heading. Insets move inward from each rail; lags move along rail travel. Reporter advance replaces `density`; non-positive advance floors to 0.1 mm with a warning, and crossing insets clamp at the midpoint.

Helpers (Library tier, pure, zero draws):

| Helper                      | Expands to                      |
| --------------------------- | ------------------------------- |
| `railinset(advance, inset)` | `[advance, inset, inset, 0, 0]` |
| `railrake(advance, lag)`    | `[advance, 0, 0, -lag, lag]`    |
| `railspine(railA, railB)`   | shared derived midpoint path    |

The `satinpair`/`satinasym`/`satinrake` tuples describe half-widths and are not rail-pair helpers; use `railinset`/`railrake` here.

### 16.3 Programmable fills — `fill …`

Arms the **next** `beginfill … endfill`, replacing the tatami generator; the engine keeps coverage, hole clipping, pullcomp, underlay and physics.

| Form                   | Meaning                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fill dir @field`      | direction field: `def field(p) [ return heading ]` — turtle heading at local point p. The engine integrates evenly-spaced **streamlines** (Jobard–Lefer) and lays a row along each. Contour/grain/flow fills                        |
| `fill shape @texture`  | stitch shaper: `def texture(p, row, v) [ return [spacing, len, phase] ]` — spacing (mm, > 0, sampled once **per row**), stitch length (mm, clamped 1–7, per penetration), brick phase (0..1, per penetration; 0.5 = standard brick) |
| `fill dir @d shape @s` | both channels                                                                                                                                                                                                                       |
| `fill paths @gen`      | custom path generator: `def gen(rings) [ return paths ]`. The reporter receives the compound region in local coordinates; the engine clips, underlays, pull-compensates open ends, subdivides, connects, and accounts for coverage  |
| `fill paths pathsExpr` | static custom paths, evaluated, validated, and frozen when armed                                                                                                                                                                    |
| `fill @name`           | shorthand: `@name` is the direction field                                                                                                                                                                                           |

Shaper inputs: `p` local penetration position (usable with `coverat(p)`), `row` 0-based streamline index, `v` 0..1 cross-field position. A constant field reduces byte-identically to plain tatami. Termination is guaranteed by streamline-length and seeding budgets (pathological fields → finite fill with warnings, never a hang). Reporters see local space; the CTM maps afterwards (physical stitch spacing preserved under `scale`). Draws nothing from the seeded stream. `dir`/`shape` are reserved only right after `fill`.

Helper: `tatamirow(spacing, len[, phase])` → `[spacing, len, phase-or-0.5]`.

`fillstagger` controls topping penetrations without moving row spines. The policies are:

- `'legacy'`: the fixed tatami generator retains its historical three-row `0, 1/3, 2/3` cycle;
  programmable fills retain their historical cumulative shape-reporter phase. This is the default
  and is byte-identical.
- `'brick'`: add `0, amount` on alternating rows.
- `'progressive'`: repeat the wrapped four-row offsets `0, amount, 3×amount, 2×amount`.
- `'random'`: hash the row index and micrometre-quantized row geometry, then scale the result by
  `amount`. It consumes no seeded-stream draws, so editing an unrelated earlier fill cannot
  reshuffle later phases.

For `fill shape @texture`, the reporter's existing cumulative phase is the base; the policy offset
is added and wrapped into 0…1. With `filllen [list]`, `filllen @fn`, or inherited `stitchlen` forms,
that fraction is converted to millimetres using the first effective length of the row; later
penetrations continue using the authored list/reporter. Non-legacy policies also phase open custom
fill paths, while closed contours retain their authored seam. Fill underlay is unaffected. If a
chosen phase would leave an edge fragment below 0.4 mm, the fragment is merged into its neighbour
and one spatial, `endfill`-line warning identifies the fill. `fillstaggeramount 0` disables the
added offset; because phases wrap, 1 is equivalent to 0 for the alternating brick offset.

### 16.4 Programmable stitch splitting — `stitchlen @fn` / `stitchlen [list]`

Replaces the running-stitch splitter. Sticky mode command; the numeric form disengages.

- **List form:** `stitchlen [4, 1.5]` — stitch i uses `pat[i % len(pat)]`; optional second arg = phase offset. The list is snapshot-copied at command time. Phase resets to `pat[0]` at every new pen-down stretch. Strict eager validation (empty list, non-number, nested list → error); out-of-range elements clamped 0.4–12 with warning.
- **Reporter form:** `stitchlen @fn`, called once per stitch, returns the advance in mm. Signature `(t, s, i, p)`:

| Input | Unit | Meaning                                                                                  |
| ----- | ---- | ---------------------------------------------------------------------------------------- |
| `t`   | mm   | arc-length from stretch start                                                            |
| `s`   | 0..1 | normalized position over the (buffered) stretch — tapers/fades                           |
| `i`   | —    | 0-based stitch index within the stretch                                                  |
| `p`   | mm   | hoop-space cursor position `[x, y]` (post-transform/warp) — sample noise or `coverat(p)` |

Non-positive, non-number, or NaN returns are line-numbered errors; values outside 0.4–12 clamp with a one-time warning. The reporter runs with identity CTM.

`filllen` accepts the same three forms scoped to fill rows (each row is a stretch; `t`/`s`/`i` reset per row; clamp band 1–7 mm). `resample` has matching overloads (§13.3).

---

## 17. Randomness & determinism

All randomness is seeded and deterministic; default seed 42. `seed n` reseeds (top-level; forbidden inside `trace`).

**Contract: same source + same seed + same hoop + same explicit `RunOptions` → same stitches.**
`scatter`/`voronoi`/`relax` are functions of the field, so changing `hoop` changes the design. A
local machine profile may correct final coordinates, so reproducing calibrated output also requires
the same serialized profile.

Draw accounting (the **fork convention** — edits stay local):

| Call                                                                                                                               | Main-stream draws                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `random(n)`                                                                                                                        | 1                                            |
| `pick(xs)`                                                                                                                         | 1                                            |
| `gauss(mu, sigma)`                                                                                                                 | 2                                            |
| `scatter(…)`, `shuffle(xs)`, `humanize` block / `humanizepath`                                                                     | 1 each (forks a child RNG for internal work) |
| `snoise2/3`, `fbm2`, `noise`, `noise2`                                                                                             | 0 (seeded fields, no stream consumption)     |
| `voronoi`, `relax`, `snaptogrid`, `declump`, `trace`, `satinbetween`, `railspine`, `fillstagger 'random'`, field/history reporters | 0                                            |
| `@name`, `bind`, `compose`, anonymous `def` creation                                                                               | 0                                            |

Inserting a `scatter(6)` shifts a later `random 10` by exactly one draw.

---

## 18. Hoop, field, and budget overrides

### `hoop` directive

Top-level only, before any committed stitch, at most once per program (procedure _definitions_ before it are fine). Put it on line 1. The sewable field = hoop inset 3 mm per side; overflow warnings, `scatter`/`voronoi`/`relax` default domain, and the preview all track it.

```text
hoop 'round100'     // default — ⌀100 mm round, ⌀94 mm field
hoop '5x7'          // 130 × 180 mm portrait, 124 × 174 mm field
hoop 150            // custom round ⌀150 mm
hoop [180, 130]     // custom rectangle (landscape)
hoop [120, 75, 'oval'] // custom oval
```

Presets (case-insensitive): `'round100'` (default), `'4x4'` 100×100, `'5x7'` 130×180, `'6x10'` 160×260, `'8x8'` 200×200, `'8x12'` 200×300 mm. Rectangular presets are portrait; use the list form for landscape. A shaped list appends case-insensitive `'circle'`, `'oval'`, or `'rectangle'`; circle width and height must match.

### Field reporters (Library tier, call-syntax, zero draws)

| Call            | Returns                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `infield(p)`    | `1`/`0` — p inside the sewable field (maps through the current transform). Idiom: `if infield(pos()) [ … ]`                         |
| `fieldbounds()` | `[minX, minY, maxX, maxY]`                                                                                                          |
| `fieldpath()`   | field boundary as a closed CCW region (round/oval fields polygonised at ≤ 2 mm chords) — feed to `clippaths`/`offsetpath`/`scatter` |

Hoop-agnostic margin idiom: `let margin = first(offsetpath(fieldpath(), -6))`.

### `preflight` directive

`preflight 'off'|'warn'|'strict'` selects the post-run sewability policy. It is top-level only,
must execute before the first committed stitch, is forbidden in `trace`, and may appear at most
once. Modes are case-insensitive and consume zero RNG draws.

- **`off` (default):** preserves the existing always-on warning strings and their structured
  density, same-hole, tiny-movement, hoop-overflow, and satin-snag locations. It skips the extended
  event-stream and construction checks.
- **`warn`:** adds the bounded extended checks for short/reversal/near-hole clusters, long sewn or
  jump spans, continuous runs, sharp-turn clusters, and explicit fill/satin construction
  relationships. These are structured `RunResult.preflight.issues`; they do not add legacy warning
  strings and never change events.
- **`strict`:** runs exactly the same checks as `warn`, then rejects the run if and only if at least
  one issue has severity `error`. It reports the first error in deterministic issue order. Severity
  `warning` and `info` findings are recommendations and can never fail strict mode. The current
  strict errors are a penetration outside the physical hoop (`hoop.unreachable`) and a known
  construction planned with topping before underlay (`construction.layer-order`), plus an operation
  that an explicitly selected local machine profile marks unsupported (`machine.trim-unsupported`
  or `machine.color-change-unsupported`). Adding another strict-failing code requires promoting that
  code to severity `error` in a reviewed policy change.

All modes analyze completed output without rewriting it. Consequently `off`, `warn`, and a
successful `strict` run produce identical event arrays for identical source, seed, and explicit run
configuration. In the
playground, findings are grouped by severity and stable code; selecting one selects every attributed
source line and highlights its known hoop-space design points. Info findings can be hidden locally
without recompiling.

### Local machine profile (`RunOptions`, not language syntax)

Machine-specific constraints and measured correction are deliberately outside portable
NeedleScript source. Library callers may pass a serializable `MachineProfile` through
`run(source, { machineProfile })`:

```ts
const profile = {
  name: 'Studio machine A',
  minimumReliableMovementMM: 0.5,
  maximumPreferredStitchMM: 7,
  maximumPreferredJumpMM: 10,
  trimCapability: 'automatic', // automatic | manual | none
  colorChangeCapability: 'manual', // automatic | manual | none
  speedClass: 'slow', // advisory metadata
  calibration: {
    scaleX: 1.012,
    scaleY: 0.996,
    skewX: 0.003, // x' += skewX × y
    skewY: -0.002, // y' += skewY × x
    offsetXMM: 0,
    offsetYMM: 0,
  },
};
const result = run(source, { machineProfile: profile });
```

The resolved profile is always returned as `RunResult.machineProfile` and
`RunResult.preflight.profile`. With no profile, the name is `NeedleScript default`, correction is
identity, existing limits/capabilities remain active, and events/exports are unchanged. Input bounds
are exported as `MACHINE_PROFILE_LIMITS`: scale 0.9–1.1, each skew coefficient −0.05–0.05, offsets
−5–5 mm, reliable movement 0.1–2 mm, preferred sewn stitch 1–12 mm, and preferred jump 1–50 mm.
Values are rejected rather than clamped. Correction is deterministic and consumes no RNG draws.
The reliable-movement and preferred-length values are diagnostic thresholds: they do not rewrite
construction. The separate hard 12 mm movement ceiling remains enforced, including a deterministic
re-split when calibration stretches a completed movement beyond it.

Finalization applies the affine correction to completed events and explicit construction sidecars
before travel planning. Corrected movements stretched beyond the hard 12 mm ceiling are split again;
auto-trim, final density, locks, structured preflight, statistics, preview, exporters, and final
field/physical-hoop validation therefore observe the corrected coordinates. Source execution,
turtle reporters, trace, coverage/history reporters, and source-authored warning text observe the
portable uncorrected design. This is an intentional boundary: calibration cannot feed back into or
silently change program control flow.

Manual trim/color-change capabilities produce structured info findings; unsupported operations are
severity errors and can fail `preflight 'strict'`. They never delete or rewrite events. Speed class
is recorded for future evidence-backed advisories and currently changes no geometry or threshold.

Exporters always receive already-corrected `RunResult.events`. Callers may additionally pass
`{ machineProfile: result.machineProfile }` as exporter metadata: SVG retains the full resolved JSON
record and DST retains the local profile name in an `NS:` header field. PES/PEC and EXP have no safe
portable metadata slot in the current encoders, so they retain corrected coordinates only. Sharing
source text alone never embeds or selects a local profile; share the serialized profile separately
when calibrated reproduction is intended.

### `plan` directive

`plan 'nearest'` enables whole-design travel planning. `plan 'reversing-nearest'` uses the same route but may reverse eligible runs when their exit is the nearer entry point. `plan 'off'` is the default and a byte-identical no-op. Like `hoop`, it is top-level only, before any committed stitch, forbidden in `trace`, and allowed at most once.

After execution, planning partitions every color block into atomic thread runs at explicit trims and at jumps that active autotrim would cut. With no executed `routegroup`, compatibility behavior remains whole-design planning: each color/`planbarrier` intersection's first run stays first and keeps its authored direction; remaining runs are chained by nearest entry point, with deterministic original-index ties. If one or more route groups execute, only runs inside those spans are eligible and all output outside them stays in authored order. `nearest` never reverses runs. `reversing-nearest` may reverse stitch-only runs without internal jumps, mixed underlay/top-stitch ordering, or mid-run marks; this includes ordinary straight running-stitch lines and preserves their stitch geometry. Explicit trims remain, and color boundaries are never crossed. Connector jumps are rebuilt for the new adjacency and direction so the later lock pass retains a valid tie-in direction. The pass runs before autotrim, density finalization, and locks, so automatic trims and locks see the shortened route.

Planning can change which overlapping same-color run lies on top. History queries still see program order because they execute before this final pass; density is unchanged. If a history query ran and planning materially reordered the design, the plan diagnostic states this authored-order/final-order mismatch. Active planning prints before/after travel and autotrim counts and exposes `planMode`, `travelBeforeMm`, and `travelAfterMm` through result statistics.

#### `planbarrier`

`planbarrier` starts a new independent planner segment at its authored position. Runs may reorder
within either segment but never cross the barrier. The command has no arguments and emits no event;
consecutive barriers and barriers before or after all sewing are harmless. It is drawless and may
execute in ordinary branches, loops, or procedures.

During normal sewing execution, when planning is absent or set to `off`, `planbarrier` is a
byte-identical no-op and does not even flush buffered satin or reporter-driven running construction.
With planning active, pending construction is flushed before recording the boundary. A barrier is
always rejected inside `trace`, since trace output is sandboxed data rather than authored sewing.
With planning active it is also rejected inside an open `beginfill…endfill`, because the complete
buffered fill is committed only at `endfill`. Put the barrier before `beginfill` or after `endfill`
instead.

#### `atomic`

`atomic [ … ]` makes every routable run emitted by the block one indivisible, forward-only planner
item. Its stitches, jumps, trims, marks, underlay, and topping retain authored order, while the
complete item may move within its color and `planbarrier` segment. This is intended for compound
constructions whose foundation and decorative pass must remain adjacent:

```text
atomic [
  underlay 'edge'
  satin 4
  fd 20
  trim
]
```

Nested atomics do not create competing spans: the outermost executing block owns all nested output.
Entry and exit are exception-safe, so `return`, `break`, and `continue` close the span before control
continues. The form consumes no RNG draws.

With planning absent or explicitly `off`, `atomic` executes only its body. It records no span and
does not flush buffered satin or reporter-driven running construction, so output is byte-identical
to the unwrapped body. With active planning, the outer boundary flushes pending construction at both
edges so a whole satin or running construction cannot leak into or out of the span.

An active atomic cannot contain a color change because the current planner routes independent color
blocks; use one atomic per color. It also cannot contain `planbarrier`, run inside `trace`, start
inside an open `beginfill…endfill`, or leave a fill open when it ends. A complete fill may be wrapped
as `atomic [ beginfill … endfill ]`.

#### `routegroup`

`routegroup [ … ]` marks an explicit collection whose independent thread runs may reorder. The group
itself stays at its authored position; only complete runs inside it move. Once any group executes,
ungrouped output is no longer globally planned:

```text
routegroup [
  flower_at(20) trim
  flower_at(5) trim
  flower_at(12)
]
```

Each group first uses the selected nearest strategy, then a deterministic bounded 2-opt improvement.
The first run of every color/segment intersection remains anchored. Improvement retains every item's
chosen direction, accepts only strict travel reductions, searches at most 32 neighboring positions,
examines at most 4,096 exchanges, and accepts at most eight passes per intersection. Distance checks
are charged to the normal operation budget, so planning cannot bypass the run envelope. Equal-cost
candidates retain deterministic original-index order. The pass consumes no RNG draws.

Color changes and `planbarrier` split a group into independently planned intersections; runs never
cross either boundary. An `atomic` contained by the group remains one forward-only item, so its
internal construction never splits or reverses. A group cannot begin inside an active atomic; put
the complete `atomic [ … ]` inside `routegroup` instead. Nested route groups share the outermost
owner.

With planning absent or `off`, `routegroup` is byte-identical to its body and does not flush pending
construction. Active groups cannot run inside `trace`, start inside an open fill recording, or leave
a fill open at exit; a complete `routegroup [ beginfill … endfill ]` is valid. Each executed group
reports its source line, eligible and moved run counts, accepted 2-opt swaps, and before/after travel
in both console output and `RunResult.plan.groups`.

### 16.3 Custom fill-path helpers

These Library-tier functions are pure and call-syntax only. Region arguments accept one ring or a list of rings under the even-odd rule.

| Function                           | Result                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `contourpaths(region, gap)`        | closed inset contours, outside-in, beginning `gap / 2` inside the boundary     |
| `spiralpath(region, gap)`          | the contours spliced into one open spiral per disconnected fragment            |
| `fillrows(region, spacing, angle)` | routed, unsplit tatami row paths without pull compensation                     |
| `closepath(ring)`                  | explicit closed path with the first point repeated; requires at least 3 points |

`fill paths` is exclusive with `dir`/`shape`, applies to one `endfill`, and may be armed inside procedures and loops. A later arm replaces an unused arm with a note. Generator machine commands are discarded in a no-emission sandbox; deliberate RNG draws consume the main seeded stream. Returned paths must contain at least two finite `[x, y]` points. Closed paths are recognized when their endpoints are within 0.001 mm. Path order is preserved.

### `override 'key' N`

Adjusts a run-envelope budget. Top of program (with `hoop`), before any stitch, at most once per key. Raising above stock warns **every run** (deliberate friction); lowering emits a one-time note. A large hoop does not auto-raise `'stitches'`.

| Key               | Stock      | Ceiling    | Guards against                               |
| ----------------- | ---------- | ---------- | -------------------------------------------- |
| `'stitches'`      | 100,000    | 250,000    | long sew-outs                                |
| `'ops'`           | 10,000,000 | 50,000,000 | infinite loops                               |
| `'calldepth'`     | 200        | 2,000      | stack exhaustion                             |
| `'loopiters'`     | 200,000    | 5,000,000  | runaway single loops                         |
| `'listlen'`       | 100,000    | 1,000,000  | one giant list                               |
| `'listcells'`     | 1,000,000  | 8,000,000  | total list memory                            |
| `'stringlen'`     | 10,000     | 1,000,000  | one giant string                             |
| `'stringtotal'`   | 1,000,000  | 20,000,000 | total string allocation                      |
| `'scatterpoints'` | 20,000     | 100,000    | Poisson-disc blowup                          |
| `'geoinput'`      | 10,000     | 50,000     | `voronoi`/`triangulate`/`hull`/`relax` input |
| `'clipverts'`     | 50,000     | 250,000    | `offsetpath`/`clippaths` input               |
| `'chalks'`        | 2,000      | 20,000     | runaway preview-overlay calls                |
| `'chalkverts'`    | 200,000    | 2,000,000  | preview-overlay memory and rendering work    |

### Fixed physics/format limits (never overridable)

Stitch length clamped 0.4–12 mm · sub-0.4 mm moves merged into neighbours (warning) · moves > 12.1 mm auto-split (DST constraint) · max list nesting 16 · `push`/`pop` stack 500.

---

## 19. Trace — capturing paths as data

`trace [ … ]` and `tracerings [ … ]` run a block in a sandbox and return the pen-down path(s) as data, turning the whole drawing vocabulary (arcs, procedures, transforms, `warp`, recursion) into a region constructor.

| Word               | Returns       | Notes                                                                                                |
| ------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| `trace [ … ]`      | one path      | expects exactly one pen-down run: zero runs → `[]` with warning; ≥ 2 runs → error ("use tracerings") |
| `tracerings [ … ]` | list of paths | one per pen-down run, in drawing order (the shape of `beginfill`'s world)                            |

- **Block expressions**, valid only in expression position (`let r = trace [ … ]`, as an argument, in a condition). Statement position is a parse error. Binds like a primary: `trace [ … ][0]` indexes the result.
- **Sandbox:** turtle and stitch state snapshotted at entry, restored at exit. Nothing sews; the turtle doesn't move afterwards; the **pen starts down** regardless of ambient state. Escapes: the returned path(s), the block's RNG consumption, and ordinary effects (variable mutation, `print`, `assert`). Errors propagate normally.
- **Captured data:** the pre-split spine (`stitchlen` has no effect — `fd 30` contributes one 30 mm segment; call `resample` for controlled spacing). Stitch modes (satin/bean/estitch) don't change the capture. A **run** is a maximal pen-down sequence; pen-up, `pop`, and pen-up repositioning split runs. If a run closes on itself (within 1e-6 mm) the duplicate final vertex is dropped.
- **Frame:** points are relative to the frame at trace entry — transforms/warps opened _inside_ apply, enclosing ones do not. Round-trip identity: inside any frame, `sewpath(trace [ B ])` ≡ running `B` directly (single pen-down movement-only run).
- **No fork:** trace itself draws nothing; the block's `random`/`scatter` hit the main stream exactly as outside.
- Inside a trace block: `beginfill`/`endfill` **error**; `seed` **error**; `return`/`exit` crossing the boundary **error**; machine commands (`color`, `trim`, `lock`, …) and after-split effects are inert with a one-time note (use `humanizepath`/`snappath`/`declumppath` on the result); `coverat` etc. see the fabric as of trace entry; nested traces allowed.

```text
let disc = trace [ arc 360 28 ]
let bite = trace [ up setxy 18 0 down arc 360 14 ]
for piece in clippaths(disc, bite, 'difference') [
  beginfill sewpath(resample(piece, 2)) endfill
  trim
]
```

---

## 20. Professional layer & fabric physics

Opt-in — without these, programs sew exactly as written.

### `fabric 'preset'`

Applies pull comp, underlay policy, satin density floor, and coverage limit in one command. It also
records the preset in the resolved material intent and restores that profile's neutral grain/stretch
defaults. Explicit commands after `fabric` override the preset in source order.

| Fabric                 | Pull comp | Coverage limit | Notes                             |
| ---------------------- | --------- | -------------- | --------------------------------- |
| `'woven'`              | 0.2 mm    | 3.5 layers     | baseline                          |
| `'knit'`               | 0.5 mm    | 3.0            | satin density floored at 0.45 mm  |
| `'stretch'`            | 0.6 mm    | 2.8            | satin density floored at 0.5 mm   |
| `'denim'` / `'canvas'` | 0.15 mm   | 4.0            | stable, tolerates dense stitching |
| `'fleece'`             | 0.3 mm    | 2.6            | doubled underlay                  |

### Material and thread intent

Material commands record a portable, brand-neutral setup in `RunResult.material`. The resolved
object contains `fabricPreset`, grain heading, along/across stretch, thread profile and width,
optional needle size, stabilizer category, and topping state. Profiles and explicit values apply in
source order: `threadprofile 'rayon-60wt' threadwidth 0.35` resolves to 0.35 mm, while the reverse
order resolves back to the profile's 0.3 mm default.

The four generic thread profiles are `'rayon-40wt'`, `'rayon-60wt'`,
`'polyester-40wt'`, and `'polyester-60wt'`. Their coverage approximations are 0.4 mm for 40 wt and
0.3 mm for 60 wt. Resolved width scales `coverat`, final heatmap layers, and density warnings; it
does not alter stitch geometry, exports, penetration counts, locks, or RNG draws. Grain/stretch
also feeds the directional compensation preview described below; needle, stabilizer, and topping
remain advisory metadata. Only the pre-existing construction behavior of `fabric` changes stitches.

The live coverage grid retains raw thread-path length and applies one active resolved width to every
coverage read. Changing `threadprofile` or `threadwidth` therefore reinterprets already committed
coverage as well as later stitches; set the intended profile near the start of a program. A later
history query and `RunResult.density` use that same active width. `DensityResult.threadWidthMM`
records it. The default remains 0.4 mm, so default cell layers, peaks, hotspots, and warnings remain
value-identical. `maxdensity` stays an absolute layer threshold and is never silently rescaled.

Fabric profile grain/stretch defaults are deliberately neutral (`0°`, zero declared stretch) until
versioned sew-out evidence supports automatic directional values. Use `fabricgrain` and
`fabricstretch` to record measured or intended values explicitly. Material state is included in
`stitchscope` and trace snapshots, so scoped or sandboxed choices cannot leak into the final resolved
intent.

`RunResult.compensation` contains the current scalar `pullcomp`, its magnitude source, grain-aligned
signed pull/push tensors, and their along/across projections
for headings parallel and perpendicular to the grain. The selected fabric preset supplies the
existing pull magnitude. Unequal declared stretch redistributes that magnitude toward the more
stretchy axis while preserving the two-axis average; equal or zero stretch remains isotropic. With
no fabric preset the recommendation is zero. Push is represented as negative shortening but stays
zero until physical sew-out data supports non-zero values. Its compatibility-preserving
`appliedMode` continues to describe satin, while `fillEndpointMode` reports whether open fill paths
use legacy scalar or directional endpoint construction.

The default `compensation 'legacy'` mode keeps this diagnostic comparison-only and preserves scalar
geometry. Opt-in `'directional'` applies the across-column tensor projection to satin endpoints and
the along-row projection to open fill-row endpoints. Borders and running stitches remain
unadjusted; no generic affine scale is inferred from the tensor.

Directional satin works for numeric and reporter-driven spine columns plus `satinbetween`. The
centerline/rails are mapped before projection, so design rotation is measured relative to fixed hoop-
space grain. Rotating design and grain together preserves the result modulo rotation. Authored width
follows affine scaling, including non-uniform scaling; compensation remains an unscaled physical
millimetre amount. Compensated chords drive cap sizing, underlay choice/insets, curve warnings, wide-
column splitting, snag warnings, and the 12 mm stitch ceiling.

Override resolution follows source order. `fabric` supplies the directional mean pull and clears an
earlier explicit override. A later `pullcomp` replaces that mean while retaining `fabricstretch`'s
anisotropic ratio; a later `fabric` restores its profile magnitude and neutral stretch. Satin and
open fill rows share that resolved tensor. Push remains zero and unapplied pending sew-out evidence.

### Individual commands

| Command                  | Effect                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fabricgrain deg`        | fabric-grain heading in turtle degrees (`0` = up, clockwise positive); finite values wrap into 0–360. Feeds preview diagnostics and opt-in directional satin/fill                                                                                                                                                                   |
| `fabricstretch a b`      | declared fractional stretch along/across the grain, each 0–1. A later `fabric` command restores its profile defaults; redistributes preview and opt-in satin/fill pull while preserving the mean                                                                                                                                    |
| `threadprofile 'name'`   | generic rayon/polyester 40 wt or 60 wt profile; resets resolved thread width to 0.4 mm or 0.3 mm respectively                                                                                                                                                                                                                       |
| `threadwidth mm`         | explicit resolved thread-width approximation, 0.1–1 mm. Overrides the active profile in source order and scales coverage queries/heatmaps/warnings without changing stitch geometry                                                                                                                                                 |
| `needle nm`              | advisory metric needle size: 60, 65, 70, 75, 80, or 90; `needle 0` clears the optional value. Does not affect construction                                                                                                                                                                                                          |
| `stabilizer 'category'`  | portable category metadata: `'none'`, `'tearaway'`, `'cutaway'`, or `'washaway'`                                                                                                                                                                                                                                                    |
| `topping 0/1`            | records whether topping is used; accepts `false`/`true` because booleans are numeric. Does not automatically add or recommend a product                                                                                                                                                                                             |
| `compensation 'mode'`    | sticky `'legacy'` (default) or `'directional'`. Directional mode projects grain-aligned pull across physical satin headings and along open physical fill-row endpoint tangents. Closed fill contours remain unchanged. Included in `stitchscope`                                                                                    |
| `pullcomp mm`            | 0–1.5 mm. Widens legacy satin and fill rows. In directional mode it replaces the tensor's mean pull magnitude while retaining stretch anisotropy; a later `fabric` restores its profile value. Use `fillinset` to reserve fill compensation beneath a border                                                                        |
| `underlay 'mode'`        | satin-column underlay: `'center'` (spine out-and-back), `'edge'` (runs offset ±30% width), `'zigzag'` (open zigzag at 60% width + return run), `'off'`, `'auto'` (by width: < 1.5 mm none, < 4 mm center, wider zigzag)                                                                                                             |
| `underlaypasses xs`      | exact ordered satin passes from `'center'`, `'edge'`, and `'zigzag'`; duplicates repeat, up to 16 passes, and `[]` disables underlay. Explicit order supersedes `fabric` doubling and the pass choice from `underlay 'auto'`                                                                                                        |
| `underlaylen mm`         | running length for center/edge passes and zigzag return runs, 0.4–12 mm                                                                                                                                                                                                                                                             |
| `underlayinset mm`       | absolute physical inset inward from each topping edge, 0–10 mm. Ratio syntax is deliberately not overloaded into this command. If the two insets meet/cross, edge walks clamp to the center and warn                                                                                                                                |
| `underlayspacing mm`     | along-column spacing for zigzag underlay, 0.25–5 mm. Zigzag width remains the fixed 60% column-width ratio                                                                                                                                                                                                                          |
| `fillunderlay 'mode'`    | fill underlay: `'tatami'` (sparse cross-grain pass at `fillangle + 90`, inset 0.6 mm), `'edge'` (boundary run inset 0.5 mm), `'off'`, `'auto'` (tatami, plus edge on areas > 100 mm²). Under a directional `fill dir @fn`, the tatami pass follows the field rotated +90°                                                           |
| `fillunderlaypasses xs`  | exact ordered fill passes from `'edge'` and `'tatami'`; duplicates repeat, up to 16 passes, and `[]` disables underlay. Explicit order supersedes `fillunderlay 'auto'` area gates and `fabric` doubling                                                                                                                            |
| `fillunderlaylen mm`     | stitch length for both edge and tatami fill-underlay passes, 1–7 mm                                                                                                                                                                                                                                                                 |
| `fillunderlayinset mm`   | physical inset for both edge and tatami fill-underlay passes, 0–10 mm. Custom edge passes inset the complete even-odd region, so outer boundaries shrink, hole boundaries expand into the filled material, and disconnected contours stay separate                                                                                  |
| `fillunderlayspacing mm` | row spacing for tatami underlay, 0.25–5 mm; edge passes are unaffected                                                                                                                                                                                                                                                              |
| `fillunderlayangle deg`  | tatami-underlay angle relative to the topping direction. Plain fills use `fillangle + deg`; directional fills rotate their local field by `deg` before mapping it through the fill transform. Any finite degree value is accepted                                                                                                   |
| `fillinset mm`           | sticky 0–10 mm inset for the complete fill construction region. Applied after authored transforms in hoop space. Underlay follows the inset region. `fillinset 0` is the byte-identical compatibility path                                                                                                                          |
| `filledgerun mm`         | sticky 0–10 mm physical inset for an extra topping edge run; 0 disables it (default). The pass is sewn after all fill underlay and before topping, uses the active effective fill length, and jumps between separate compound contours. Included in `stitchscope`                                                                   |
| `filledgeshort mm`       | sticky 0–10 mm minimum physical length for useful open topping fragments; 0 disables it (default). Short fragments are omitted before connector routing in fixed, programmable, and custom-path fills. Closed custom contours and underlay are unaffected. Included in `stitchscope`                                                |
| `fillstagger 'mode'`     | sticky topping-row phase policy: `'legacy'`, `'brick'`, `'progressive'`, or `'random'`. Underlay retains its resolved legacy phase behavior                                                                                                                                                                                         |
| `fillstaggeramount n`    | sticky 0–1 wrapped phase fraction for non-legacy policies, default 0.65. Both values are included in `stitchscope`                                                                                                                                                                                                                  |
| `fillconnect 'mode'`     | sticky topping connector policy: `'legacy'`, `'inside'`, `'jump'`, or `'trim'`. `inside` requires compound-region containment with 0.1 mm edge clearance; `jump` never adds connector coverage; `trim` jumps and cuts at active `autotrim`, falling back to 7 mm when automatic trimming is off. Included in `stitchscope`          |
| `shortstitch 0/1`        | on by default: on tight satin curves, alternate inner-edge stitches pull in to 60% width. Column wider than the curve radius warns (can't sew cleanly at any setting)                                                                                                                                                               |
| `maxdensity n`           | coverage warning threshold in layers (default 3.5; `maxdensity 0` silences). Coverage = thread layers on a 1 mm grid (1 layer ≈ one clean satin/fill pass); hotspots warn with coordinates and source lines; ≥ 5 penetrations within 0.15 mm flagged separately. Past ~2.5–3.5 layers fabric fails — raise the limit only knowingly |
| `autotrim mm`            | travels ≥ this length (default 7, configurable 3–30, `autotrim 0` off) get an automatic `trim` before the jump; never inserted when nothing was sewn since the last cut                                                                                                                                                             |

Internally, these legacy mode names and each `fabric` preset lower to ordered typed pass profiles
after the satin width or fill area is known. This representation adds no syntax and does not change
events, warnings, exports, or RNG draws. Profile validation is pure and uses centralized physical
ranges so later parameter commands share one set of bounds.

The four parameterized satin commands are sticky. Numeric settings tune the current legacy pass
selection until `underlaypasses` supplies an explicit order. `underlay 'mode'` or `fabric 'preset'`
returns satin underlay to the complete legacy/preset profile, clearing these overrides. A valid
parameter command flushes a pending satin column under its old profile before changing the next
column; invalid input errors before that flush.

All custom underlay is emitted before the topping and carries `u: 1`. The same ordered profile is
used for numeric and reporter-driven buffered satin and, where rails define the width directly,
`satinbetween`. Authored geometry is transformed first, so `underlaylen`, `underlayinset`, and
`underlayspacing` remain hoop-space millimetres under affine transforms. These commands are drawless
and consume no RNG values.

The five parameterized fill-underlay commands are also sticky. Numeric settings tune the current
legacy `fillunderlay` selection until `fillunderlaypasses` supplies an exact pass list. Explicit
lists preserve authored order, allow duplicates, omit legacy area gates and preset doubling, and
use per-kind defaults when a numeric field has not been overridden: edge inset/length 0.5/2.5 mm,
tatami inset/length 0.6/4 mm, relative angle 90°, and row spacing derived from the topping spacing.
`fillunderlay 'mode'` or `fabric 'preset'` clears the complete custom fill profile.

All fill-underlay penetrations precede topping and carry `u: 1`. Length, inset, and spacing are
physical hoop-space millimetres. Plain tatami, programmable direction/shape fills, and custom path
fills consume the same resolved profile. For a direction reporter, the relative angle rotates the
local field consistently before affine mapping. For `fill paths`, underlay is generated from the
recorded compound fill region—not from the decorative paths returned by the reporter or static
expression. Custom edge passes use compound even-odd geometry and jump between distinct inset
contours, so holes, concavities, and disconnected components are not crossed by sewn connectors.
The commands are drawless; invalid lists and numeric values error before `endfill` can emit the
recorded region.

`fillinset` is a sticky construction setting and is included in `stitchscope`. A positive value
normalizes and offsets the recorded compound even-odd region through Clipper at micrometre integer
precision, after transforms, before underlay or topping generation. The resulting construction
region is shared by plain, programmable, and custom-path fills. Outer rings contract while hole
boundaries move outward into the filled material. Concave necks may split safely; fill routing uses
jumps rather than sewn connectors across the resulting fabric gaps. Empty, partially collapsed,
and split results warn with the `endfill` source line and a hoop-space preview location. The command
is deterministic and consumes zero RNG draws. At the default `fillinset 0`, the geometry operation
is skipped entirely, preserving existing events and warnings byte-for-byte.

`filledgerun` is also sticky and `stitchscope`-aware. A positive value offsets the already resolved
construction region inward once more in physical hoop space, then sews every resulting closed
contour with the active effective fill stitch length. This optional topping pass has the fixed order
**fill underlay → edge run → fill topping**. Outer and hole contours stay within the compound
even-odd construction region, and separate contours connect only by jumps. Offset collapse omits
the edge run with a spatial warning. The corner guard retains at most two visits within a 0.15 mm
needle-hole radius when the shortcut remains contained, allowing one closed-contour seam return
without letting acute or collapsed corners accumulate repeated penetrations. At program end, edge
run samples are checked against final coverage (so a satin border sewn afterward is visible); dense
border overlap warns with a location and recommends more inset or omitting the redundant edge run.
`maxdensity 0` silences this coverage warning. `filledgerun 0` bypasses all geometry and preserves
legacy output.

`filledgeshort` permanently means the **minimum useful open topping row-fragment length**, not a
stitch-length adjustment at row ends. The measurement is made after transforms in physical hoop
space and after pull compensation, before penetration subdivision and connector routing. Fixed
tatami rows, programmable streamlines, and open custom fill paths shorter than the configured value
are omitted with one spatial warning per fill. Underlay and closed decorative contours are never
filtered. `filledgeshort 0` is the byte-identical compatibility path. The policy is deterministic,
drawless, and does not consume seeded RNG values.

`fillconnect` controls only topping travel between generated rows or clipped custom-path fragments;
fill underlay keeps its resolved legacy routing. The default `'legacy'` path is byte-identical.
`'inside'` classifies the straight connector after authored transforms in physical hoop space: its
open interior must remain within the complete even-odd construction region, may not cross or touch
a hole or concave edge, and must keep 0.1 mm clearance except for short ramps from row endpoints on
the boundary. `'jump'` preserves row penetrations but replaces every connector with jump travel.
`'trim'` also jumps every connector and emits an explicit cut first when its physical length reaches
active `autotrim`, or 7 mm when `autotrim 0` disables the general pass. Custom paths retain their
returned and clipped order; the policy neither sorts nor reverses them. Sewn connectors alone enter
coverage/history, while jump and trim travel remains non-sewing. These ordinary jump/trim events
remain accurate boundaries for travel planning, automatic trimming, locks, preview, and exporters.

### Stitch-history queries (pure reporters, call-syntax, shadowable)

Read back the committed coverage grid mid-program for closed-loop generation (adaptive density, avoidance, self-levelling stipple).

| Call                           | Returns                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `coverat(p)` · `coverat(p, r)` | coverage at p in **layers** (heatmap unit) — point, or averaged over radius r mm |
| `countat(p)`                   | penetration count in the 1 mm cell at p                                          |
| `nearestsewn(p)`               | closest prior penetration `[x, y]`, or `[]` if none                              |
| `sewnwithin(p, r)`             | list of prior penetrations within r mm                                           |
| `stitchedpoints()`             | deep-copied snapshot of every penetration so far, as a path                      |

Contract: zero RNG draws, zero emission — branching on them keeps determinism. They see **committed** penetrations in sewing order (a buffered satin column is invisible until it flushes; tie-off locks excluded, matching the heatmap). `coverat` uses the resolved thread width also recorded in `RunResult.density.threadWidthMM`; `countat` is width-independent. Query points are local-frame and mapped through the CTM; returned points are hoop-space. `coverat`/`countat` O(1); `nearestsewn`/`sewnwithin` grid-bucketed. Coverage-conditioned loops must have a hard cap (`repeat N [ … if done [ break ] ]`, not open-ended `while`).

---

## 21. Debugging commands

| Command                        | Effect                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `print expr`                   | log to console; strings print raw, lists as `[1, 'a', …]`                                |
| `print "label expr`            | labelled: `print "radius :r` → `radius: 1.5`                                             |
| `print(v1, v2, …)`             | variadic; concatenates renderings with no separator                                      |
| `printloc` / `printloc "label` | log the needle's local-frame position (what `pos()` returns)                             |
| `mark` / `mark 'label'`        | drop a (optionally labelled) pin on the preview at the needle; never exported or counted |
| `chalk value [label [style]]`  | preview point/path data as removable tailor's-chalk marks; never sewn or exported        |
| `assert cond`                  | stop with a line-numbered error if false                                                 |
| `assert(cond, message)`        | with a message string, evaluated only on failure                                         |

Parse-time checks and diagnostics: reporter-path check (a `@name` / expression-position procedure that may miss `return` is rejected at parse time, naming the procedure), did-you-mean suggestions across all namespaces, glued-bracket hints, kind-aware rejections. Non-fatal issues (clamps, merged tiny stitches, unclosed fills, hoop overflow, density) surface as warnings. `RunResult.preflight` additionally exposes structured, deterministic issues for density hotspots, same-hole stacks, tiny merged movements, field/hoop overflow, satin snag risk, short-stitch clusters, repeated local reversals, moving-window near-hole penetrations, long sewn floats, long untrimmed jump chains, continuous stitch runs, and dense sharp direction changes. Explicit fill/satin construction records add underlay-envelope containment, fill-to-satin-border overlap, edge-run/border stacking, split-satin overlap, fill-connector containment, and post-plan underlay/topping order checks. Each issue has a stable code, severity, message, hoop-space points, source lines, optional construction IDs, and optional suggestion. Stream and construction checks observe planned/autotrimmed events before generated locks, produce no additional warning strings, and never alter stitches or exports. Construction relationships are checked only when generators supplied explicit IDs and hoop-space boundaries; arbitrary running stitches are never guessed to be a border, connector, or underlay. Conservative thresholds are exported as `EVENT_STREAM_PREFLIGHT_THRESHOLDS` and `CONSTRUCTION_PREFLIGHT_THRESHOLDS`; no fabric/thread-specific modifier is applied pending physical sew-out evidence.

`chalk` accepts a point `[x, y]`, an ordered path, or a mixed list of points and paths.
The optional styles are `'auto'` (line plus vertices), `'dots'`, and `'line'`.
It snapshots at the call, maps through the current affine transform, and records the
current playback position. It never enters the stitch stream, advances the turtle,
flushes satin, consumes RNG draws, affects stitch history/density/planning, or appears
in a machine export. Argument expressions still evaluate normally. Nonlinear `warp`
and penetration effects are not applied; preview their pure path counterparts instead.
Inside `trace` and fill/reporting callbacks, `chalk` remains active.

The playground's Data section lists final chalkable top-level values (except points
already represented by `[xy]` handles). Hovering draws a transient chalk guide;
pinning keeps it across recompiles. This inspector is an end-of-run snapshot—use an
in-code `chalk` statement for intermediate mutation states or local transform frames.

---

## 22. Customizer annotations (comment-level, invisible to the interpreter)

Annotate `let`/`make`/bare declarations to expose live controls in the playground; the program remains ordinary NeedleScript.

| Annotation                                                                                                                            | Control                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `let r = 15  // [5:30]`                                                                                                               | integer slider (whole bounds, range > 1)                 |
| `let s = 0.5  // [0:1]`                                                                                                               | smooth slider (float bound or range ≤ 1)                 |
| `let n = 4  // [0.5:0.5:8]`                                                                                                           | stepped slider `[min:step:max]`                          |
| `let w = 1  // [switch]`                                                                                                              | toggle 0/1                                               |
| `let m = 0  // [switch:hypo,epi]`                                                                                                     | labelled toggle                                          |
| `let name = 'Anna'  // [text]`                                                                                                        | free text                                                |
| `let op = 'union'  // [text:union,difference,intersect]`                                                                              | dropdown                                                 |
| `let p = [0, 18]  // [xy]`                                                                                                            | draggable point handle (free in field)                   |
| `// [xy: xMin:xMax, yMin:yMax]` · `[xy: disc R]` · `[xy: disc R @ cx,cy]` · `[xy: x min:max]` · `[xy: y min:max]` · `[xy: …, snap S]` | constrained handles                                      |
| `let p = [[0,0],[10,0]] // [path: closed, snap 1]`                                                                                    | editable polyline/region control                         |
| `let c = [[0,0],[[10,0],[-2,0],[2,0]]] // [curve]`                                                                                    | editable relative-handle cubic spec control              |
| `// --- Section ---`                                                                                                                  | section divider                                          |
| `// @preset Name : a=1, b=2, p=[x,y]`                                                                                                 | named preset (alias `@snapshot`); nested lists supported |

Path and curve controls support structural editing directly on the stage: double-click a segment
to insert, Alt-click an anchor to delete (down to `min`), and drag a segment body to move the whole
shape within its constraint. Double-click a curve anchor to toggle smooth/corner behavior. Dragging
a tangent on a smooth anchor keeps the opposite tangent collinear; Alt-drag breaks the pair.

---

## 23. Generation best practices

1. Keep designs within ~44 mm radius (default hoop) to avoid overflow warnings; for other hoops, guard with `infield(pos())` or inset `fieldpath()`.
2. Use `moveto` (not `setxy`) for repositioning — it jump-stitches correctly. Never use `home` for navigation (it sews when the pen is down).
3. Sort motif travel with `routesort`, or use `plan 'nearest'` / `plan 'reversing-nearest'` for emergent/imported order. Prefer autotrim for long connectors; explicit `trim` remains useful where a cut is mandatory.
4. Satin columns: 2–8 mm width; `density 0.35–0.5` typical; avoid > 8 mm (snag).
5. Fills: `fillspacing 0.35–0.5` for most work; smaller = denser = higher stitch count.
6. Put `seed N` at the top for reproducibility; `hoop`/`override`/`plan` at the very top, before any stitch.
7. Use `push`/`pop` to branch and return (trees, ferns).
8. Aim for 5,000–25,000 total stitches for typical designs (hard budget: 100,000 stock).
9. Avoid stitches < 0.5 mm and tight repeat loops that overcrowd one spot; watch density warnings; consider `declump` for radial/converging designs.
10. `humanize 0.2–0.4` for a hand-sewn look; `declump` outermost when combined.
11. Sample `snoise2` with coordinates divided by 10–20.
12. Prefer modern syntax with glued-paren calls for anything nested: `setxy(random(60) - 30, random(60) - 30)`.
13. Feedback loops on `coverat` etc. need a hard iteration cap.

The production example catalog includes focused 4 × 4 samplers for density-neutral
gradients, fleece knockdown with a topping-aware patch, inset fill-and-border construction, satin
caps/corners, split wide columns, constrained travel planning, and anisotropic compensation. Each
source declares its fabric, thread, needle, stabilizer, and topping assumptions. The corresponding
physical protocol and blank observation record are in `embroidery-example-sewout-suite-v1.md`;
software/export checks are not physical sew-out evidence.

`examples/production/preflight-issue-sampler.ns` is intentionally not export-ready. It uses
`preflight 'warn'` so its advisory and error findings remain inspectable together, including an
unreachable penetration. Do not send that diagnostic fixture to a machine.

---

## 24. Pre-flight checklist — verify every program before returning it

1. **Brackets:** every block opens `[` and closes `]`; the characters `{` and `}` appear nowhere.
2. **Names:** no variable, parameter, or procedure named `to`, `end`, `in`, or any reserved keyword; nothing reuses a Core builtin (`circle`, `pos`, `color`, `heading`, `random`, `scale`, `trace`, …); avoid Library names (`str`, `num`, `upper`, `lower`, `strip`, `chars`, `split`, `len`, `clamp`, …) too. (`step`, `dir`, `shape`, and `paths` are contextual keywords — safe to use as ordinary names outside their one special position.)
3. **Declarations:** each variable has exactly one `let`, placed before any loop/branch that updates it; all later writes are bare assignments; no `let` on parameters; no shadowing; conditionally-assigned variables have a default.
4. **Placement:** `return`/`output`/`exit` only inside `def`/`to` bodies; `break`/`continue` only inside loop bodies of the same procedure; every reporter returns on every path (add `else`); `hoop`/`override`/`plan`/`seed` at the top; `trace` only in expression position, never containing `beginfill`, `plan`, or `seed`.
5. **Negative literals:** ` -5` (space before, glued after) is a negative argument; `10 - 5` is subtraction — check argument counts around minus signs, or use glued-paren calls.
6. **Strings & types:** `concat(a, b)` not `a + b`; `strip(s)` not `trim(s)` for whitespace; conditions are numbers, never strings or lists (`len(x) > 0`); `vadd` for point math, never `+` on lists.
7. **Embroidery sanity:** trims between motifs, satin widths 2–8 mm, stitch count well under budget, everything inside the field.

---

## 25. Structured feature index

This index is generated from the same categorized feature records used by Monaco and the compact LLM edition. Use the dialog's `tag:…` and `category:…` search forms for metadata filtering.

### Syntax & control flow

Grammar, declarations, procedures, and control flow.

| Feature       | Summary                                                                                                                                                                                                                                                                                                                                                                                                                            | Tags                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `repeat`      | Loop n times. `repcount` is the 1-based counter of the innermost repeat.                                                                                                                                                                                                                                                                                                                                                           | block, keyword, library, syntax-control                                  |
| `while`       | Loop while the condition is true (non-zero). `while true [ … break ]` is the idiomatic search loop.                                                                                                                                                                                                                                                                                                                                | block, keyword, library, syntax-control                                  |
| `for`         | Counted loop: `for i = 0 to n [ … ]` — inclusive of _to_, step defaults to 1.                                                                                                                                                                                                                                                                                                                                                      | block, keyword, library, syntax-control                                  |
| `if`          | Conditional block. Chains with `else if` and `else`.                                                                                                                                                                                                                                                                                                                                                                               | block, keyword, library, syntax-control                                  |
| `else`        | Follows an `if` block. Can chain: `if … else if … else …`.                                                                                                                                                                                                                                                                                                                                                                         | block, keyword, library, syntax-control                                  |
| `break`       | Exits the innermost `repeat`, `while`, or `for` loop immediately.                                                                                                                                                                                                                                                                                                                                                                  | keyword, library, syntax-control                                         |
| `continue`    | Skips to the next iteration of the innermost loop.                                                                                                                                                                                                                                                                                                                                                                                 | keyword, library, syntax-control                                         |
| `stitchscope` | Run a block with temporary stitch-construction settings, then restore the outer configuration even after `return`, `break`, `continue`, or an error. It scopes running/satin/E-stitch/bean modes, satin cap/join/wide policies, fill settings and an armed fill, plus lock, compensation, underlay, auto-trim, and density policies. Turtle position, heading, pen, color, RNG, transforms/effects, output/history, hoop, budgets… | block, core, embroidery, heading, keyword, mode, syntax-control          |
| `import`      | Imports one exported procedure from a bundled standard-library module under a local name. Imports are compile-time only and must be top-level.                                                                                                                                                                                                                                                                                     | embroidery, keyword, library, syntax-control, top-level                  |
| `export`      | Marks a top-level procedure as part of a source module's public surface. The keyword directly prefixes `def` or classic `to`.                                                                                                                                                                                                                                                                                                      | block, call-syntax, heading, keyword, library, syntax-control, top-level |
| `def`         | Define a procedure. Parameters are local and can recurse (depth limit 200). Anonymous `def(params) [ … ]` expressions capture enclosing locals by snapshot and return a configured reference.                                                                                                                                                                                                                                      | block, call-syntax, keyword, library, syntax-control                     |
| `to`          | Classic Logo procedure definition. Modern equivalent: `def name(a, b) [ … ]`.                                                                                                                                                                                                                                                                                                                                                      | keyword, library, mode, syntax-control                                   |
| `end`         | Closes a `to … end` procedure definition.                                                                                                                                                                                                                                                                                                                                                                                          | keyword, library, syntax-control                                         |
| `return`      | Return a value from a procedure. Without argument, exits early. Classic aliases: `output`, `op`.                                                                                                                                                                                                                                                                                                                                   | keyword, library, syntax-control                                         |
| `output`      | Classic Logo alias for `return`. Only valid inside a procedure.                                                                                                                                                                                                                                                                                                                                                                    | keyword, library, syntax-control                                         |
| `exit`        | Classic Logo alias for `return` with no value.                                                                                                                                                                                                                                                                                                                                                                                     | keyword, library, syntax-control                                         |
| `let`         | Declare a variable — global at top level, local inside a procedure. Redeclaring the same name in the same scope is a parse error.                                                                                                                                                                                                                                                                                                  | keyword, library, stateful, syntax-control                               |
| `make`        | Classic Logo assignment: `make "x expr`. Same rules as `x = expr`.                                                                                                                                                                                                                                                                                                                                                                 | keyword, library, stateful, syntax-control                               |
| `local`       | Classic Logo local variable declaration inside a procedure. Illegal at top level.                                                                                                                                                                                                                                                                                                                                                  | keyword, library, syntax-control                                         |
| `and`         | Logical AND, short-circuits. `i > 0 and 10/i > 2` is safe.                                                                                                                                                                                                                                                                                                                                                                         | keyword, library, syntax-control                                         |
| `or`          | Logical OR, short-circuits.                                                                                                                                                                                                                                                                                                                                                                                                        | keyword, library, syntax-control                                         |
| `true`        | Literal for 1. Truthiness: anything non-zero is true.                                                                                                                                                                                                                                                                                                                                                                              | constant, library, syntax-control                                        |
| `false`       | Literal for 0. Truthiness: 0 is false.                                                                                                                                                                                                                                                                                                                                                                                             | constant, library, syntax-control                                        |
| `in`          | Used in `for x in xs [ … ]` to iterate list elements.                                                                                                                                                                                                                                                                                                                                                                              | keyword, library, syntax-control                                         |
| `step`        | Optional step in a `for` loop: `for i = 10 to 1 step -2 [ … ]`.                                                                                                                                                                                                                                                                                                                                                                    | keyword, library, syntax-control                                         |

### Movement & turtle state

Turtle movement, heading, pen state, and state stack.

| Feature       | Summary                                                                                                                                                                   | Tags                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `fd`          | Sew forward n mm. Long moves auto-split at `stitchlen`.                                                                                                                   | core, embroidery, function, millimetres, movement; aliases: forward        |
| `forward`     | Alias for `fd`. Sew forward n mm.                                                                                                                                         | embroidery, function, library, millimetres, movement                       |
| `bk`          | Sew backward n mm.                                                                                                                                                        | core, embroidery, function, millimetres, movement; aliases: back, backward |
| `back`        | Alias for `bk`. Sew backward n mm.                                                                                                                                        | embroidery, function, library, millimetres, movement                       |
| `rt`          | Turn right by deg degrees.                                                                                                                                                | core, function, heading, movement; aliases: right                          |
| `right`       | Alias for `rt`. Turn right by deg degrees.                                                                                                                                | function, heading, library, movement                                       |
| `lt`          | Turn left by deg degrees.                                                                                                                                                 | core, function, heading, movement; aliases: left                           |
| `left`        | Alias for `lt`. Turn left by deg degrees.                                                                                                                                 | function, heading, library, movement                                       |
| `up`          | Needle up — subsequent moves are jump travels, not stitches.                                                                                                              | core, embroidery, function, mode, movement; aliases: penup, pu             |
| `down`        | Needle down — subsequent moves sew stitches.                                                                                                                              | core, embroidery, function, mode, movement; aliases: pendown, pd           |
| `penup`       | Alias for `up`. Needle up — jump travel mode.                                                                                                                             | embroidery, function, library, mode, movement                              |
| `pendown`     | Alias for `down`. Needle down — sewing mode.                                                                                                                              | embroidery, function, library, mode, movement                              |
| `arc`         | Sew along a circle of radius mm, turning deg in total. Positive degrees curves right, negative left. Works in every stitch mode — including satin!                        | core, embroidery, function, heading, millimetres, mode, movement           |
| `circle`      | Sew a full closed circle of radius r — exactly `arc 360 r`. Works in every stitch mode (satin ring, bean loop, etc.).                                                     | core, embroidery, function, mode, movement                                 |
| `setxy`       | Move (sew or jump depending on pen state) to the absolute position (x, y).                                                                                                | core, embroidery, function, movement                                       |
| `setx`        | Set the x coordinate absolutely; y stays the same.                                                                                                                        | core, function, movement                                                   |
| `sety`        | Set the y coordinate absolutely; x stays the same.                                                                                                                        | core, function, movement                                                   |
| `seth`        | Set the heading absolutely. 0 = up/north, clockwise positive.                                                                                                             | core, function, heading, movement; aliases: setheading                     |
| `setheading`  | Alias for `seth`. Set heading in degrees (0 = north, clockwise).                                                                                                          | function, heading, library, movement                                       |
| `home`        | Return to origin (0, 0) with heading 0 (north). Sews/jumps depending on pen state.                                                                                        | core, embroidery, function, heading, movement                              |
| `moveto`      | Reposition the needle to `(x, y)` as a jump, without sewing. Pen state is preserved: if the pen was down it ends down and the next move sews normally; if up it stays up. | core, embroidery, function, movement; aliases: jump                        |
| `jump`        | Alias for `moveto`. The embroidery industry term for a non-sewing travel. Pen state preserved.                                                                            | embroidery, function, library, movement                                    |
| `gohome`      | Jump to `(0, 0)` without sewing — pen state preserved. Does not reset heading; add `seth 0` for a full neutral reset.                                                     | core, embroidery, function, heading, movement                              |
| `push`        | Save needle state (position, heading, pen up/down) onto a stack. Max 500 saved states.                                                                                    | core, embroidery, function, heading, movement                              |
| `pop`         | Restore the last saved needle state from the stack. Pop on an empty stack warns and is ignored.                                                                           | core, embroidery, function, movement                                       |
| `cs`          | Accepted for Logo familiarity; does nothing in NeedleScript.                                                                                                              | core, embroidery, function, movement; aliases: clearscreen, clear          |
| `xcor`        | Reports the current needle x position in mm.                                                                                                                              | embroidery, library, millimetres, movement, variable                       |
| `ycor`        | Reports the current needle y position in mm.                                                                                                                              | embroidery, library, millimetres, movement, variable                       |
| `heading`     | Reports the current heading in degrees (0 = north, clockwise positive).                                                                                                   | heading, library, movement, variable                                       |
| `repcount`    | Reports the 1-based counter of the innermost `repeat` loop.                                                                                                               | library, movement, variable                                                |
| `backward`    | Alias for `bk`. Sew backward n mm.                                                                                                                                        | embroidery, function, library, millimetres, movement                       |
| `pu`          | Alias for `up`. Needle up — subsequent moves are jump travels, not stitches.                                                                                              | embroidery, function, library, mode, movement                              |
| `pd`          | Alias for `down`. Needle down — subsequent moves sew stitches.                                                                                                            | embroidery, function, library, mode, movement                              |
| `clearscreen` | Alias for `cs`. Accepted for Logo familiarity; does nothing in NeedleScript.                                                                                              | embroidery, function, library, movement                                    |
| `clear`       | Alias for `cs`. Accepted for Logo familiarity; does nothing in NeedleScript.                                                                                              | embroidery, function, library, movement                                    |

### Transforms

Block-scoped affine transforms.

| Feature       | Summary                                                                                                                                                                                        | Tags                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `translate`   | Shift everything the block draws by `(dx, dy)` mm. The turtle stays in local space — only emitted geometry moves.                                                                              | block, core, geometry, keyword, millimetres, transforms |
| `rotate`      | Rotate the block `deg` degrees clockwise about the current origin (0 = north, matching `seth`/`rt`).                                                                                           | block, core, heading, keyword, transforms               |
| `rotateabout` | Rotate the block `deg` clockwise about the pivot `(cx, cy)`.                                                                                                                                   | block, core, heading, keyword, transforms               |
| `scale`       | Uniformly scale the block by `s`. Stitch length, satin width and the physics layer are re-evaluated after scaling, so a scaled motif still sews like real embroidery — not stretched stitches. | block, core, embroidery, keyword, transforms            |
| `scalexy`     | Scale the block by `sx` on x and `sy` on y. Non-uniform scale makes satin width direction-dependent (a column running across the stretched axis widens).                                       | block, core, embroidery, keyword, transforms            |
| `mirror`      | Reflect the block across a line through the origin at heading `deg`. `mirror 0` flips left/right; `mirror 90` flips top/bottom.                                                                | block, core, heading, keyword, transforms               |
| `skew`        | Shear the block: `x += tan(ax)·y`, `y += tan(ay)·x`.                                                                                                                                           | block, core, heading, keyword, transforms               |
| `transform`   | Apply the raw affine `(x, y) → (a·x + c·y + e, b·x + d·y + f)` to the block — the power-user escape hatch behind the named transforms.                                                         | block, core, keyword, transforms                        |

### Effects

Block-scoped nonlinear and stitch effects.

| Feature      | Summary                                                                                                                                                                                                                                                                                                                                                                                                                            | Tags                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `warp`       | Map every emitted point through a `@name` reporter (a procedure that takes a point `[x, y]` and returns a point), before stitch splitting — a geometric deformation, exactly like a transform but nonlinear. This is the shader: fisheye, ripple, twist, domain-warp are all just reporters.                                                                                                                                       | block, core, effects, embroidery, geometry, keyword                    |
| `humanize`   | Perturb each stitch penetration by coherent, seeded simplex noise (the hand drifts, so consecutive stitches err together — not white-noise damage). Runs after stitch splitting, on the final penetrations. `amount` is the jitter in mm (clamped 0–2). Draws exactly one value from the seeded stream (forks), so dropping a `humanize` block shifts downstream randomness by one draw, not by however many stitches were inside. | block, core, effects, embroidery, keyword, millimetres, seeded         |
| `snaptogrid` | Snap each penetration to a fixed hoop-space lattice, evaluated outside any enclosing transform — so the same grid config always yields the same lattice regardless of `translate`/`rotate`/`scale`. Pure and drawless. Overloads by arity:                                                                                                                                                                                         | block, core, effects, keyword, millimetres, pure                       |
| `declump`    | Ease crowded needle penetrations along the thread's own line of travel — never sideways, so stitch angles stay intact. Each penetration that exceeds `limit` layers of coverage is slid backward or forward along its axis until it finds clear fabric, within `maxshift` mm (default 1.5, clamped 0–5). Runs after stitch splitting, like `humanize`. Drawless (zero RNG draws) — adding or removing the block never reshuffles…  | block, core, effects, embroidery, geometry, keyword, millimetres, pure |

### Trace

Capturing turtle geometry as path data.

| Feature      | Summary                                                                                                                                                                                                                                                                                                                                                                      | Tags                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `trace`      | Run a block in a sandbox — full language semantics, but the stitch machine is disconnected. Nothing is sewn, and on exit the turtle and all stitch state are restored. Returns the single pen-down path (a list of `[x, y]` points) at move-command resolution, unaffected by `stitchlen`. Errors if the block draws more than one pen-down run (use `tracerings` for that). | block, embroidery, geometry, keyword, library, trace |
| `tracerings` | Like `trace`, but captures every pen-down run as a separate path. Returns a list of paths (list of lists of `[x, y]` points), in drawing order. Each pen-up/pen-down boundary starts a new ring.                                                                                                                                                                             | block, embroidery, geometry, keyword, library, trace |

### Stitching & machine control

Thread, fill, satin, planning, material, and machine commands.

| Feature               | Summary                                                                                                                                                                                                                                                                                                                                                                                                                            | Tags                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `stitchlen`           | Running-stitch length, clamped 0.4–12 mm (default 2.5). Alias: `stitchlength`                                                                                                                                                                                                                                                                                                                                                      | core, embroidery, function, millimetres, stitching; aliases: stitchlength       |
| `stitchlength`        | Alias for `stitchlen`. Running-stitch length 0.4–12 mm.                                                                                                                                                                                                                                                                                                                                                                            | embroidery, function, library, millimetres, stitching                           |
| `satin`               | Zigzag satin column of this width; penetration spacing set by `density`. `satin 0` returns to running stitch. Width > ~8 mm risks snagging.                                                                                                                                                                                                                                                                                        | core, embroidery, function, geometry, heading, millimetres, stitching           |
| `satinbetween`        | Sews an immediate satin column between two independently authored path rails. Rails are mapped through the active transform/warp before arc-length pairing, so `density`, underlay, pull compensation, short-stitch relief, coverage, and ceiling checks use physical millimetres. Both rails must both be open or both be explicitly closed.                                                                                      | call-syntax, core, embroidery, function, geometry, millimetres, pure, stitching |
| `satincap`            | Choose the construction at both ends of an open spine or rail-pair satin column. `'legacy'` preserves existing output; `'butt'` finishes at full width; `'taper'` narrows over `satincaplen` while retaining a safe terminal bite; `'point'` converges both rails with coincident tip penetrations merged; `'round'` fans through a semicircular profile when the column is long enough. Closed columns have no caps and retain t… | core, embroidery, function, geometry, mode, pure, stitching                     |
| `satincaplen`         | Set the physical transition length used by taper, point, and round caps. Range 0.4–20 mm; default 2. On a short column each end is bounded to half the available spine length. Round caps fall back to point when a true semicircle cannot fit.                                                                                                                                                                                    | core, embroidery, function, geometry, millimetres, stitching                    |
| `satinjoin`           | Choose how sharp corners at or above `satincorner` are constructed. `'legacy'` preserves the previous event stream; `'continuous'` keeps one continuous zigzag with short-stitch relief; `'fan'` distributes at most eight outer-rail penetrations around the turn and keeps at most two shortened inner bites; `'miter'` overlaps straight legs at their bounded rail intersections; `'split'` ends and restarts the topping leg… | core, embroidery, function, geometry, millimetres, mode, pure, stitching        |
| `satincorner`         | Set the minimum absolute change in travel direction that selects a non-legacy satin join. Range 5–175 degrees; default 60. Lower values classify gentler bends as corners. Measured after the authored output transform in physical hoop space.                                                                                                                                                                                    | core, embroidery, function, heading, stitching                                  |
| `satinwide`           | Choose how columns wider than `satinmaxwidth` are handled. `'warn'` is the byte-identical legacy path. `'split'` partitions a safe open, smooth column into adjacent hoop-space subcolumns. Shared seams alternate ownership of the `satinsplitoverlap` band so the topping interlocks without a fixed double-density strip. Each subcolumn sews its underlay before topping, and nearest-end routing limits jumps. Closed column… | core, embroidery, function, geometry, pure, stitching                           |
| `satinmaxwidth`       | Set the physical hoop-space width ceiling that activates and sizes `satinwide 'split'`. Range 2–12 mm; default 7.5. It does not replace the legacy snag warning while `satinwide 'warn'` is active.                                                                                                                                                                                                                                | core, embroidery, function, millimetres, stitching                              |
| `satinsplitoverlap`   | Set the physical width alternately assigned across neighboring split-column seams. Range 0–1 mm; default 0.5. The shared seam moves by half this amount to avoid both gaps and a stationary double-density band.                                                                                                                                                                                                                   | core, embroidery, function, millimetres, stitching                              |
| `density`             | Satin penetration spacing, 0.25–5 mm (default 0.4).                                                                                                                                                                                                                                                                                                                                                                                | core, embroidery, function, millimetres, stitching                              |
| `bean`                | Bold line: each stitch sewn n times (forced odd, max 9). `bean 1` off.                                                                                                                                                                                                                                                                                                                                                             | core, embroidery, function, stitching                                           |
| `estitch`             | Blanket stitch: prongs of this length on the left of travel direction, spaced by `stitchlen`. `estitch 0` off.                                                                                                                                                                                                                                                                                                                     | core, embroidery, function, millimetres, stitching                              |
| `beginfill`           | Start tracing a fill boundary. Moves between `beginfill` and `endfill` define the shape rather than sewing. A pen-up move starts a new ring — inner rings become holes (even-odd rule).                                                                                                                                                                                                                                            | core, embroidery, function, stitching                                           |
| `endfill`             | Close the fill boundary and sew a tatami fill of the enclosed area.                                                                                                                                                                                                                                                                                                                                                                | core, embroidery, function, stitching                                           |
| `fill`                | Arm a programmable fill for the next `beginfill…endfill`. `fill dir @field` drives row direction; `fill shape @texture` drives spacing/length/brick; `fill paths @generator` supplies ordered path geometry; `fill paths pathsExpr` freezes static paths. The engine retains clipping, pull compensation, underlay, subdivision, coverage, and budgets.                                                                            | core, embroidery, function, geometry, stitching                                 |
| `fillangle`           | Direction of the fill stitch rows, in degrees (default 0 = vertical).                                                                                                                                                                                                                                                                                                                                                              | core, embroidery, function, heading, stitching                                  |
| `fillspacing`         | Fill row spacing, 0.25–5 mm (default 0.4).                                                                                                                                                                                                                                                                                                                                                                                         | core, embroidery, function, millimetres, stitching                              |
| `fillinset`           | Reserve space inside a fill boundary for a later border. Range 0–10 mm (default 0). The complete compound even-odd region is inset in physical hoop space: outer boundaries shrink, holes expand, and concave regions may split. Topping and fill underlay use the inset region; disconnected pieces are crossed only by jumps. Collapsed or split geometry warns with a source line and preview location.                         | core, embroidery, function, geometry, millimetres, stitching                    |
| `filledgerun`         | Add a closed boundary pass after fill underlay and before topping, inset by the requested physical distance. Range 0–10 mm; 0 disables it (default). Compound even-odd geometry keeps outer and hole contours inside the construction region and jumps between disconnected contours. Acute-corner penetrations are bounded, and dense overlap near a later border warns.                                                          | core, embroidery, function, geometry, millimetres, stitching                    |
| `filledgeshort`       | Omit open topping row fragments shorter than this physical hoop-space length before connector routing. Range 0–10 mm; 0 disables it (default). Applies to fixed tatami, programmable streamlines, and open custom fill paths; underlay and closed decorative contours are unchanged.                                                                                                                                               | core, embroidery, function, geometry, millimetres, stitching                    |
| `fillstagger`         | Choose the topping-row phase policy. `'legacy'` preserves existing output; `'brick'` alternates 0 and `fillstaggeramount`; `'progressive'` repeats the wrapped four-row cycle `0, amount, 3×amount, 2×amount`; `'random'` hashes row geometry into a stable phase without drawing from the seeded RNG. A `fill shape @fn` reporter retains its cumulative phase as the base, then the policy offset is added and wrapped. Fill un… | core, embroidery, function, geometry, mode, stitching                           |
| `fillstaggeramount`   | Set the wrapped phase fraction used by non-legacy fill staggering. Range 0–1; default 0.65. With fixed fill length, the fraction is multiplied by that length. List/reporter forms use the first effective stitch length of each row. Policy-created edge fragments below 0.4 mm are merged with a spatial, source-attributed warning.                                                                                             | core, embroidery, function, millimetres, mode, stitching                        |
| `fillconnect`         | Choose how topping rows and custom fill-path fragments connect. `'legacy'` preserves existing short sewn connectors. `'inside'` sews only when the complete physical hoop-space segment stays inside the compound fill region with edge clearance. `'jump'` always uses jump travel. `'trim'` jumps and cuts first when the connector reaches the active `autotrim` threshold (or 7 mm while automatic trimming is off). Fill und… | core, embroidery, function, geometry, millimetres, stitching                    |
| `filllen`             | Fill stitch length. Defaults to `stitchlen`. `filllen 0` follows `stitchlen` again.                                                                                                                                                                                                                                                                                                                                                | core, embroidery, function, millimetres, stitching                              |
| `color`               | Switch to numeric thread n, or resolve a color string such as `color '#e94560'` or `color 'crimson'`.                                                                                                                                                                                                                                                                                                                              | core, embroidery, function, stitching                                           |
| `palette`             | Top-level, once-only palette metadata. Takes a list of 1–64 colors and must precede stitches, `color`, and `stop`.                                                                                                                                                                                                                                                                                                                 | core, embroidery, function, stateful, stitching, top-level                      |
| `background`          | Top-level fabric-color metadata. Must precede the first stitch and does not affect DST output.                                                                                                                                                                                                                                                                                                                                     | core, embroidery, function, stateful, stitching, top-level                      |
| `stop`                | Shorthand for "next colour" — equivalent to incrementing the thread number by 1.                                                                                                                                                                                                                                                                                                                                                   | core, embroidery, function, stitching                                           |
| `trim`                | Cut the thread here. Long travels also get one automatically (see `autotrim`).                                                                                                                                                                                                                                                                                                                                                     | core, embroidery, function, stitching                                           |
| `lock`                | Tie-in/tie-off: 4 micro back-stitches where thread starts/ends. Size 0.3–1.5 mm (default 0.7). `lock 0` off.                                                                                                                                                                                                                                                                                                                       | core, embroidery, function, millimetres, stitching                              |
| `compensation`        | Choose compensation semantics. `'legacy'` (default) preserves scalar `pullcomp` for satin and fill. `'directional'` applies the grain-aligned tensor across satin columns and along open fill-row endpoint tangents in final physical hoop space. Curved rows resolve each end independently; closed fill contours stay unchanged. Endpoint crossings of an authored outer boundary or hole warn spatially—use `fillinset` to res… | core, embroidery, function, geometry, mode, pure, stitching                     |
| `pullcomp`            | Pull compensation 0–1.5 mm: widens satin columns and extends open fill rows so shapes sew out at their digitized size. Under `compensation 'directional'`, it replaces the material tensor's mean pull magnitude while retaining declared stretch anisotropy; satin projects it across columns and fills project it along physical endpoint tangents. Reserve border overlap with `fillinset`.                                     | core, embroidery, function, geometry, millimetres, stateful, stitching          |
| `shortstitch`         | Curve physics (on by default): on tight satin curves, alternate inner stitches are shortened to 60% width to prevent thread breaks.                                                                                                                                                                                                                                                                                                | core, embroidery, function, stitching                                           |
| `autotrim`            | Auto trim before travels ≥ n mm (default 7, range 3–30). `autotrim 0` off.                                                                                                                                                                                                                                                                                                                                                         | core, function, millimetres, stitching                                          |
| `maxdensity`          | Thread-coverage warning threshold in layers (default 3.5). `maxdensity 0` silences warnings.                                                                                                                                                                                                                                                                                                                                       | core, embroidery, function, stitching                                           |
| `hoop`                | Configure the physical hoop for this design. The sewable field is the hoop inset by 3 mm on every side.                                                                                                                                                                                                                                                                                                                            | core, embroidery, function, millimetres, mode, stitching                        |
| `override`            | Raise (with a warning) or lower (with an info note) a run-envelope budget.                                                                                                                                                                                                                                                                                                                                                         | core, embroidery, function, geometry, stitching                                 |
| `plan`                | Top-level travel-planning directive. With no `routegroup`, `plan 'nearest'` greedily reorders whole thread runs within each color block after execution and before autotrim/locks. Once any route group executes, only grouped runs are eligible and ungrouped output remains authored; grouped intersections also receive bounded 2-opt improvement. `plan 'reversing-nearest'` may enter eligible stitch-only runs from their n… | block, core, embroidery, function, geometry, stitching, top-level               |
| `preflight`           | Select the post-run diagnostic policy. `preflight 'off'` (the default) keeps existing always-on warnings and their structured locations, but skips extended event-stream and construction recommendations. `preflight 'warn'` adds those extended checks without changing stitches or turning findings into legacy console warnings. `preflight 'strict'` runs the same checks and rejects the run only when a finding has severi… | core, embroidery, function, mode, stitching, top-level                          |
| `planbarrier`         | Start a new independent travel-planner segment at this point in the authored stitch stream. Planning may reorder runs on either side, but never moves a run across the barrier. `planbarrier` emits no stitch, jump, trim, color, or mark. During normal sewing execution it is completely inert when planning is absent or `plan 'off'`, including leaving buffered construction untouched. Consecutive barriers and barriers be… | core, embroidery, function, geometry, stitching                                 |
| `atomic`              | Treat every routable run emitted by the block as one indivisible, forward-only travel-planner item. Internal stitches, jumps, trims, marks, underlay, and topping retain their authored order while the complete item may move within its color and `planbarrier` segment. Nested `atomic` blocks belong to the outermost span. With planning absent or `plan 'off'`, the block is byte-identical to its body and does not flush…  | block, core, embroidery, function, stitching                                    |
| `routegroup`          | Make the block's independent thread runs eligible for deterministic nearest routing followed by a bounded 2-opt improvement pass. The group's position is fixed: only runs inside it reorder, and when any `routegroup` executes, output outside all groups stays in authored order. Color changes and `planbarrier` boundaries split planning into independent intersections. An `atomic` inside the group remains one forward-o… | block, core, embroidery, function, stitching                                    |
| `fabric`              | Apply a fabric preset. Sets pull compensation, density limit, and underlay defaults.                                                                                                                                                                                                                                                                                                                                               | core, function, millimetres, mode, stitching                                    |
| `fabricgrain`         | Record the fabric grain heading as turtle degrees: 0 points up and positive angles turn clockwise. Values wrap to 0–360. It feeds preview diagnostics and opt-in `compensation 'directional'` satin/fill geometry.                                                                                                                                                                                                                 | core, embroidery, function, geometry, heading, stitching                        |
| `fabricstretch`       | Record fractional stretch along and across the grain, each from 0 to 1. The values redistribute directional preview and opt-in satin/fill pull while preserving its mean magnitude. A later `fabric` command restores that profile's neutral stretch defaults.                                                                                                                                                                     | core, embroidery, function, stateful, stitching                                 |
| `threadprofile`       | Select generic `'rayon-40wt'`, `'rayon-60wt'`, `'polyester-40wt'`, or `'polyester-60wt'` metadata. 40 wt resolves to an approximate 0.4 mm width and 60 wt to 0.3 mm. A later `threadwidth` overrides that default. Width scales live coverage queries, the final heatmap, and density warnings without changing stitch geometry.                                                                                                  | core, embroidery, function, geometry, millimetres, stitching                    |
| `threadwidth`         | Override the active thread profile's approximate width with 0.1–1 mm. The width scales live coverage queries, final heatmap layers, and density warnings. It never changes stitch geometry or rescales the active `maxdensity` threshold.                                                                                                                                                                                          | core, embroidery, function, geometry, millimetres, stitching                    |
| `needle`              | Record an advisory NM needle size: 60, 65, 70, 75, 80, 90. Use `needle 0` to leave the size unspecified. Needle metadata does not alter stitch generation.                                                                                                                                                                                                                                                                         | core, embroidery, function, stitching                                           |
| `stabilizer`          | Record the generic stabilizer category: `'none'`, `'tearaway'`, `'cutaway'`, or `'washaway'`. This is portable intent metadata, not a brand or automatic construction recommendation.                                                                                                                                                                                                                                              | core, function, stitching                                                       |
| `topping`             | Record whether a topping is part of the material setup. Use `topping 1`/`true` when present and `topping 0`/`false` when absent. This advisory metadata does not alter construction.                                                                                                                                                                                                                                               | core, function, stitching                                                       |
| `underlay`            | Stabilising stitches under each satin column.                                                                                                                                                                                                                                                                                                                                                                                      | core, embroidery, function, millimetres, stitching                              |
| `underlaypasses`      | Set the exact ordered passes sewn beneath every satin column. Accepted pass names are `'center'`, `'edge'`, and `'zigzag'`; duplicates are allowed and an empty list disables underlay. Explicit pass order supersedes `fabric` doubling and `underlay 'auto'`. All underlay events retain the preview `u: 1` flag.                                                                                                                | core, embroidery, function, stitching                                           |
| `underlaylen`         | Set center/edge running-stitch length and zigzag return-run length, in physical hoop millimetres. Range 0.4–12 mm. It tunes the current legacy pass selection unless `underlaypasses` supplies an explicit order.                                                                                                                                                                                                                  | core, embroidery, function, millimetres, stitching                              |
| `underlayinset`       | Set edge-pass inset inward from each topping rail, in physical hoop millimetres (0–10 mm). This command is deliberately absolute-only; ratio-based legacy settings are not overloaded into the same syntax. On a column narrower than twice the inset, the edge walks meet at the center and a warning is emitted.                                                                                                                 | core, embroidery, function, millimetres, stitching                              |
| `underlayspacing`     | Set spacing along zigzag underlay passes in physical hoop millimetres. Range 0.25–5 mm. Zigzag width remains the unambiguous built-in 60% column-width ratio.                                                                                                                                                                                                                                                                      | core, embroidery, function, millimetres, stitching                              |
| `fillunderlay`        | Underlay beneath fills.                                                                                                                                                                                                                                                                                                                                                                                                            | core, embroidery, function, millimetres, stitching                              |
| `fillunderlaypasses`  | Set the exact ordered passes generated from each recorded fill region. Accepted pass names are `'edge'` and `'tatami'`; duplicates repeat and an empty list disables underlay. Explicit order supersedes `fillunderlay 'auto'` and fabric doubling. Custom path fills still generate these passes from the recorded compound region, not from returned decorative paths.                                                           | core, embroidery, function, geometry, stitching                                 |
| `fillunderlaylen`     | Set edge-walk and tatami-underlay stitch length in physical hoop millimetres. Range 1–7 mm. It tunes the selected legacy passes unless `fillunderlaypasses` supplies an explicit order.                                                                                                                                                                                                                                            | core, embroidery, function, millimetres, stitching                              |
| `fillunderlayinset`   | Set the inward physical inset for edge and tatami fill-underlay passes. Range 0–10 mm. Custom edge passes use a compound even-odd inset, preserving holes, concavities, and disconnected components.                                                                                                                                                                                                                               | core, embroidery, function, millimetres, stitching                              |
| `fillunderlayspacing` | Set tatami-underlay row spacing in physical hoop millimetres. Range 0.25–5 mm. Edge passes are unaffected.                                                                                                                                                                                                                                                                                                                         | core, embroidery, function, millimetres, stitching                              |
| `fillunderlayangle`   | Set the tatami-underlay angle relative to the topping direction. Plain fills use `fillangle + offset`; directional fills rotate the local direction field by the same offset before mapping it to hoop space. Any finite degree value is accepted.                                                                                                                                                                                 | core, embroidery, function, heading, stitching                                  |
| `seed`                | Reseed the random number generator (default 42). Same seed → same design.                                                                                                                                                                                                                                                                                                                                                          | core, function, seeded, stitching                                               |
| `print`               | Log a value to the console. `print "label expr` adds a label: `print "radius r` → `radius: 1.5`                                                                                                                                                                                                                                                                                                                                    | core, function, stitching                                                       |
| `printloc`            | Log the current needle position to the console as `loc: [x, y]`.                                                                                                                                                                                                                                                                                                                                                                   | core, embroidery, function, stitching                                           |
| `mark`                | Drop a numbered pin on the preview at the needle position. Optional string label shown instead of the pin number.                                                                                                                                                                                                                                                                                                                  | core, embroidery, function, stitching                                           |
| `chalk`               | Draw a point, path, or group of paths as a removable tailor's-chalk guide on the preview. It does not sew, move the needle, consume random draws, affect coverage, or enter machine exports.                                                                                                                                                                                                                                       | core, embroidery, function, geometry, stitching                                 |
| `assert`              | Stop with an error (and line number) if the condition is false.                                                                                                                                                                                                                                                                                                                                                                    | core, function, stitching                                                       |

### Core math

Core scalar math and turtle reporters.

| Feature    | Summary                                                                                                                                                                                                                                                                            | Tags                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `random`   | Seeded random number in 0…n. Reproducible — driven by `seed`.                                                                                                                                                                                                                      | call-syntax, function, library, math, seeded                        |
| `sin`      | Sine of an angle in degrees. Returns a value in −1…1 that rises to 1 at 90°, falls back to 0 at 180°, reaches −1 at 270°, and completes the cycle at 360°. Multiply by the amplitude you need.                                                                                     | call-syntax, embroidery, function, geometry, heading, library, math |
| `cos`      | Cosine of an angle in degrees. Identical to `sin` but shifted 90° — `cos(0)` is 1 (peak) while `sin(0)` is 0. Returns a value in −1…1.                                                                                                                                             | call-syntax, function, geometry, heading, library, math             |
| `sqrt`     | Square root — the inverse of squaring. The most common use in generative embroidery is computing Euclidean distance: `sqrt(dx*dx + dy*dy)` gives the length of a line segment. Negative input is a runtime error. For distances between stored points, `vdist` is usually simpler. | call-syntax, embroidery, function, geometry, library, math          |
| `abs`      | Strips the sign from a number — `abs(-3)` and `abs(3)` both return 3. Use it when you need a magnitude regardless of direction, such as mirroring a left/right offset or ensuring a width is never negative.                                                                       | call-syntax, embroidery, function, library, math                    |
| `round`    | Round to the nearest integer. `round(2.7)` → 3, `round(2.3)` → 2. Halfway values round away from zero: `round(2.5)` → 3.                                                                                                                                                           | call-syntax, function, library, math                                |
| `floor`    | Round down toward negative infinity — always the integer at or below the value. `floor(2.9)` → 2, `floor(-2.1)` → -3.                                                                                                                                                              | call-syntax, function, library, math                                |
| `ceil`     | Round up toward positive infinity — always the integer at or above the value. `ceil(2.1)` → 3, `ceil(-2.9)` → -2.                                                                                                                                                                  | call-syntax, embroidery, function, library, math                    |
| `mod`      | Floor modulo — result always has the sign of b. `mod(-7, 3)` is 2, not −1. The `%` operator is the same operation.                                                                                                                                                                 | call-syntax, function, library, math                                |
| `min`      | Minimum of a and b.                                                                                                                                                                                                                                                                | call-syntax, function, library, math                                |
| `max`      | Maximum of a and b.                                                                                                                                                                                                                                                                | call-syntax, function, library, math                                |
| `pow`      | base raised to the exp. Non-finite result is a runtime error.                                                                                                                                                                                                                      | call-syntax, function, library, math                                |
| `log`      | Natural logarithm (base e) — the inverse of exponential growth. `log(1)` is 0 and `log(pow(e, x))` is x, where `e` is approximately 2.71828. Input must be positive; zero or a negative number is a runtime error. For another base, use `log(x) / log(base)`.                     | call-syntax, function, library, math                                |
| `atan`     | Heading of the vector (x, y) in turtle degrees: 0 = north, clockwise. `atan(1, 0)` is 90.                                                                                                                                                                                          | call-syntax, function, heading, library, math                       |
| `noise`    | Smooth seeded value noise in 0…1. Sample slowly (divide coordinates by 10–20) for organic drift.                                                                                                                                                                                   | call-syntax, function, library, math, seeded                        |
| `noise2`   | 2D smooth seeded value noise in 0…1. Same seed → same field.                                                                                                                                                                                                                       | call-syntax, function, library, math, seeded                        |
| `distance` | Distance from the current needle position to the point (x, y).                                                                                                                                                                                                                     | call-syntax, embroidery, function, geometry, library, math          |
| `towards`  | Heading from the needle to the point (x, y). `seth towards(0, 0)` aims home.                                                                                                                                                                                                       | call-syntax, embroidery, function, geometry, heading, library, math |
| `not`      | Logical NOT. Also written `!`. Binds tightly — write `!(a = 1)` when negating a comparison.                                                                                                                                                                                        | call-syntax, function, library, math                                |

### Lists & sequences

List creation, queries, mutation, and sequences.

| Feature    | Summary                                                                                                                                                                                                                 | Tags                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `range`    | `range(n)` → [0…n-1] `range(a, b)` → [a…b-1] `range(a, b, step)` → stepped                                                                                                                                              | call-syntax, function, library, lists                                 |
| `filled`   | Create a new list containing `count` deep copies of `value`. Useful for initialising a collection of slots that you will fill in later with a loop.                                                                     | call-syntax, embroidery, function, library, lists, millimetres        |
| `len`      | Element count of a list, or character count of a string.                                                                                                                                                                | call-syntax, function, library, lists                                 |
| `islist`   | 1 if the value is a list, 0 otherwise.                                                                                                                                                                                  | call-syntax, function, library, lists                                 |
| `first`    | Returns the first element of a list (same as `xs[0]`).                                                                                                                                                                  | call-syntax, function, library, lists                                 |
| `last`     | Returns the last element of a list (same as `xs[-1]`).                                                                                                                                                                  | call-syntax, function, library, lists                                 |
| `concat`   | Join two lists end-to-end, returning a new combined list. The elements are shared references (shallow copy) — mutating a nested list in the result also mutates the original. Use `copy` if you need full independence. | call-syntax, embroidery, function, geometry, library, lists, stateful |
| `slice`    | `slice(xs, start)` or `slice(xs, start, end)` — new list, Python semantics including negative bounds, clamped.                                                                                                          | call-syntax, function, library, lists                                 |
| `reverse`  | Returns a new reversed list (pure — does not mutate the original).                                                                                                                                                      | call-syntax, function, library, lists, pure, stateful                 |
| `sort`     | Returns a new sorted list. Numbers only, ascending, stable. Pure — does not mutate.                                                                                                                                     | call-syntax, function, library, lists, pure, stateful                 |
| `copy`     | Deep copy — fully independent of the original.                                                                                                                                                                          | call-syntax, function, library, lists                                 |
| `indexof`  | First index of v (deep tolerant compare) or −1 if not found.                                                                                                                                                            | call-syntax, function, library, lists                                 |
| `contains` | 1 if the list contains v (deep tolerant compare), 0 otherwise.                                                                                                                                                          | call-syntax, function, library, lists                                 |
| `sum`      | Sum of all elements. `sum([])` is 0.                                                                                                                                                                                    | call-syntax, function, library, lists                                 |
| `mean`     | Arithmetic mean (average) of all elements in the list. Equivalent to `sum(xs) / len(xs)`. Errors on an empty list.                                                                                                      | call-syntax, embroidery, function, geometry, library, lists           |
| `minof`    | Smallest value in a list. Errors on an empty list. Often paired with `maxof` to find the full data range before remapping or normalising.                                                                               | call-syntax, function, library, lists                                 |
| `maxof`    | Largest value in a list. Errors on an empty list. Often paired with `minof` to find the full data range.                                                                                                                | call-syntax, function, library, lists, millimetres                    |
| `pick`     | Returns a random element — seeded, exactly one RNG draw.                                                                                                                                                                | call-syntax, function, library, lists, seeded                         |
| `shuffle`  | Returns a new shuffled list — seeded, forks a child RNG. Pure — does not mutate.                                                                                                                                        | call-syntax, function, library, lists, pure, seeded, stateful         |
| `pos`      | Needle position as `[xcor, ycor]`. Pair with `setpos(p)` to save and restore positions.                                                                                                                                 | call-syntax, embroidery, function, library, lists                     |
| `removeat` | Mutates: removes element at index i and returns the removed value.                                                                                                                                                      | call-syntax, function, library, lists, stateful                       |
| `append`   | Mutates: adds v at the end of the list.                                                                                                                                                                                 | call-syntax, function, library, lists, stateful                       |
| `prepend`  | Mutates: adds v at the front of the list.                                                                                                                                                                               | call-syntax, function, library, lists, stateful                       |
| `insertat` | Mutates: inserts v at index i (0 through len allowed).                                                                                                                                                                  | call-syntax, function, library, lists, stateful                       |
| `setpos`   | Command: move needle to the point p (like `setxy p[0] p[1]`). Pair with `pos()`.                                                                                                                                        | call-syntax, embroidery, function, geometry, library, lists           |

### Higher-order functions

Procedure references, mapping, filtering, composition, and binding.

| Feature   | Summary                                                                                                                              | Tags                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `steps`   | Generate a list of evenly spaced numbers from `start` to `end` (inclusive).                                                          | call-syntax, function, higher-order, library           |
| `map`     | Return a new list by applying `@fn` to each element of `list`.                                                                       | call-syntax, function, higher-order, library           |
| `filter`  | Return a new list keeping only elements for which `@fn` returns a truthy value.                                                      | call-syntax, function, higher-order, library           |
| `reduce`  | Fold `list` with `@fn(accumulator, element)` starting from `init`.                                                                   | call-syntax, function, geometry, higher-order, library |
| `compose` | Create a left-to-right pipeline from two or more `@references`.                                                                      | call-syntax, function, higher-order, library           |
| `bind`    | Return a configured reference with one or more leading arguments fixed. Values are evaluated once; lists retain reference semantics. | call-syntax, function, higher-order, library           |
| `isref`   | Return 1 when the value is a plain, bound, composed, or capturing reference; otherwise 0.                                            | call-syntax, function, higher-order, library           |

### Strings

String conversion, queries, and transformations.

| Feature     | Summary                                                                                               | Tags                                                |
| ----------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `str`       | Convert a number to its string representation (same as `print` shows). `str` of a string is identity. | call-syntax, function, library, strings             |
| `num`       | Parse a numeric string. Errors on non-numeric input unless a fallback is given.                       | call-syntax, function, library, strings             |
| `isstring`  | 1 if the value is a string, 0 otherwise. The sibling of `islist`.                                     | call-syntax, function, library, strings             |
| `chars`     | Split a string into a list of 1-character strings. Bridge to the whole list toolkit.                  | call-syntax, function, library, strings             |
| `split`     | Split `s` at every occurrence of `sep`. `sep` must be non-empty.                                      | call-syntax, function, library, strings             |
| `joinstr`   | Concatenate a list of strings with `sep` between each. All elements must be strings.                  | call-syntax, function, library, strings             |
| `upper`     | Return a copy of `s` with ASCII letters uppercased (A–Z only).                                        | call-syntax, function, library, strings             |
| `lower`     | Return a copy of `s` with ASCII letters lowercased (a–z only).                                        | call-syntax, function, library, strings             |
| `strip`     | Return `s` with leading and trailing whitespace (space, tab, newline) removed.                        | call-syntax, embroidery, function, library, strings |
| `repeatstr` | Return `s` repeated `n` times (n must be a non-negative integer).                                     | call-syntax, function, library, strings             |

### Colors

Color construction, interpolation, palette matching, and active color metadata.

| Feature           | Summary                                                                                                                                                                                     | Tags                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `rgb`             | Return a normalized hex color from red, green, and blue channels in 0…1. Values outside the range are clamped. Pure and drawless.                                                           | call-syntax, colors, embroidery, function, library, pure |
| `hsl`             | Return a normalized hex color from hue in degrees plus saturation and lightness in 0…1. Hue wraps; saturation and lightness clamp. Pure and drawless.                                       | call-syntax, colors, embroidery, function, library, pure |
| `hexparts`        | Parse a supported color string and return normalized `[r, g, b]` channels in 0…1. Pure and drawless.                                                                                        | call-syntax, colors, embroidery, function, library, pure |
| `lerpcolor`       | Interpolate colors at unclamped `t`. The default mode is perceptual OKLab; pass `'rgb'` as a fourth argument for raw sRGB interpolation. Returns a normalized hex color. Pure and drawless. | call-syntax, colors, embroidery, function, library, pure |
| `nearestcolor`    | Return the lowest-index color in a non-empty palette with the smallest perceptual OKLab distance from `color`. Pure and drawless.                                                           | call-syntax, colors, embroidery, function, library, pure |
| `colordist`       | Return the OKLab distance between two supported color strings. Smaller values are more visually similar. Pure and drawless.                                                                 | call-syntax, colors, embroidery, function, library, pure |
| `slotcolor`       | Return the normalized hex color for a 1-based palette slot, including the deterministic default color for an undeclared slot. Reads metadata, emits nothing, and draws nothing.             | call-syntax, colors, embroidery, function, library, pure |
| `colorindex`      | Return the active thread slot as a 1-based index. Reads machine state, emits nothing, and draws nothing.                                                                                    | call-syntax, colors, embroidery, function, library, pure |
| `colorhex`        | Return the normalized hex color of the active thread slot. Reads palette metadata, emits nothing, and draws nothing.                                                                        | call-syntax, colors, embroidery, function, library, pure |
| `backgroundcolor` | Return the normalized resolved background color. Reads design metadata, emits nothing, and draws nothing.                                                                                   | call-syntax, colors, embroidery, function, library, pure |

### Generative scalar math

Interpolation, seeded distributions, and noise fields.

| Feature      | Summary                                                                                                                                                                                                                                                             | Tags                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `lerp`       | Blend smoothly between two values. Returns `a` when `t = 0`, `b` when `t = 1`, and the midpoint when `t = 0.5`. `t` is unclamped — values outside 0…1 extrapolate.                                                                                                  | call-syntax, embroidery, function, generative-scalars, geometry, library, millimetres |
| `remap`      | Linearly rescale a value from one range to another — like converting between units. `remap(value, inMin, inMax, outMin, outMax)` maps `inMin → outMin` and `inMax → outMax`. Result is unclamped; use `clamp` around it if the input might exceed the source range. | call-syntax, embroidery, function, generative-scalars, library, millimetres           |
| `clamp`      | Constrain a value so it never falls below `min` or above `max`. Equivalent to `min(max(value, lo), hi)`. Use it when a calculation might produce negative lengths, out-of-range widths, or other implausible values.                                                | call-syntax, embroidery, function, generative-scalars, library                        |
| `smoothstep` | S-curve transition: returns 0 when `x ≤ edge0`, 1 when `x ≥ edge1`, and a smooth ease-in/ease-out curve in between. The curve accelerates from 0 then decelerates into 1, so transitions look far more natural than a straight `lerp`.                              | call-syntax, embroidery, function, generative-scalars, library                        |
| `gauss`      | Seeded normally-distributed random number centred on `mean` with spread `sigma`. Unlike `random` (uniform), most values land close to the mean — only occasionally straying far. The larger `sigma` is, the wider the spread.                                       | call-syntax, function, generative-scalars, library, seeded                            |
| `snoise2`    | Seeded simplex noise in −1…1 (industry convention). Slightly finer-grained than legacy `noise2` (0…1).                                                                                                                                                              | call-syntax, function, generative-scalars, library, seeded                            |
| `snoise3`    | Seeded 3D simplex noise in −1…1. Use z for variation: `snoise3(x/14, y/14, motif*50)` gives each motif its own noise field.                                                                                                                                         | call-syntax, function, generative-scalars, library, seeded                            |
| `fbm2`       | Fractal Brownian motion — layers multiple octaves of `snoise2` at increasing frequencies and decreasing amplitudes. Each octave adds finer detail on top of the large-scale shape, producing a rich, cloud-like texture. Returns approximately −1…1.                | call-syntax, embroidery, function, generative-scalars, library, seeded                |

### Vectors

Point and vector arithmetic.

| Feature        | Summary                                                                                                                                                                                                                                                | Tags                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `vadd`         | Add two 2D vectors (stored as `[x, y]` lists), returning a new point. Use it to offset a position by a direction or to accumulate steps.                                                                                                               | call-syntax, function, geometry, library, vectors                                         |
| `vsub`         | Subtract vector `b` from `a`, returning a new point `[a[0]-b[0], a[1]-b[1]]`. The result is also the displacement vector from `b` to `a` — useful for computing the direction between two stored positions before normalising with `vnorm`.            | call-syntax, function, geometry, heading, library, vectors                                |
| `vscale`       | Multiply both components of a vector by scalar `s`, returning a new point. Use it to extend or shorten a direction vector, or to resize an offset.                                                                                                     | call-syntax, function, geometry, library, millimetres, vectors                            |
| `vlerp`        | Interpolate between two 2D points — returns `a` at `t = 0`, `b` at `t = 1`. Works like `lerp` but for positions. Good for moving along a line segment, finding a midpoint, or distributing jump targets evenly between two anchor points.              | call-syntax, function, geometry, library, vectors                                         |
| `vdot`         | Dot product: `a[0]*b[0] + a[1]*b[1]`. Measures how much two vectors point in the same direction. Positive when they agree, 0 when perpendicular, negative when they oppose each other.                                                                 | call-syntax, embroidery, function, geometry, heading, library, vectors                    |
| `vlen`         | Length (magnitude) of a vector: `sqrt(v[0]² + v[1]²)`. Returns the distance from the origin to the point, or the "size" of a direction vector. To measure between two stored points, use `vdist`.                                                      | call-syntax, embroidery, function, geometry, library, vectors                             |
| `vdist`        | Euclidean distance between two `[x, y]` points. Equivalent to `vlen(vsub(b, a))` but more readable. Use whenever you need the gap between two stored positions (e.g. decide whether to trim, check spacing, scale a motif).                            | call-syntax, function, geometry, library, vectors                                         |
| `vnorm`        | Returns a unit vector (length exactly 1.0) pointing in the same direction. Use it when you need a pure direction without caring about magnitude — then multiply by the length you want with `vscale`. The zero vector is a runtime error.              | call-syntax, embroidery, function, geometry, heading, library, millimetres, pure, vectors |
| `vrot`         | Rotate a vector clockwise by `deg` degrees. The rotation matches NeedleScript's turtle convention (clockwise positive, 0 = north). Use it to create perpendicular offsets, fan spread patterns, or to generate N evenly-rotated copies of a direction. | call-syntax, embroidery, function, heading, library, millimetres, vectors                 |
| `vheading`     | Convert a 2D vector to a turtle heading in degrees (0 = north, clockwise positive). Equivalent to `atan(v[0], v[1])`. Use it with `seth` to aim the needle along a computed direction or path tangent.                                                 | call-syntax, embroidery, function, geometry, heading, library, vectors                    |
| `vfromheading` | Make a 2D vector of the given `length` pointing in turtle heading `deg`. The inverse of `vheading`. Use it to compute offsets in any direction relative to the needle's current path.                                                                  | call-syntax, embroidery, function, geometry, heading, library, millimetres, vectors       |

### Segments

Segment intersection and distance queries.

| Feature         | Summary                                                                                                                                                                                                                     | Tags                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `segisect`      | Intersection point [x, y] of segment a0→a1 and segment b0→b1, or [] if they don't cross. Segment test, not infinite-line — endpoints must actually meet. Collinear overlapping segments return the midpoint of the overlap. | call-syntax, function, geometry, library, segments |
| `segdist`       | Shortest distance from point p to the segment a→b. If the perpendicular foot falls outside the segment, returns the distance to the nearer endpoint. A zero-length segment behaves like vdist(p, a).                        | call-syntax, function, geometry, library, segments |
| `nearestonpath` | The closest point to p lying anywhere on path (vertices or along segments). Returns [x, y]. The path is treated as open (no implicit closing segment). O(len(path)) per call.                                               | call-syntax, function, geometry, library, segments |

### Paths & curves

Path measurement, editing, resampling, curves, and routing.

| Feature           | Summary                                                                                                                                                                                                                                                                                                        | Tags                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pathlen`         | Total length of a polyline path in mm — the sum of all segment lengths. Use it to normalise travel along a curve (compute `t = distanceSoFar / pathlen(path)`), decide how many stitches to place, or verify a path is the expected size.                                                                      | call-syntax, embroidery, function, geometry, library, millimetres, paths-curves |
| `resample`        | New path whose consecutive vertices are each exactly `spacing` mm apart (last segment may be shorter). The bridge between math curves and physical stitch spacing — generate an arbitrary shape with `trace`/`bezier`/`catmull`, then `resample` it to stitch pitch before `sewpath`.                          | call-syntax, embroidery, function, geometry, library, millimetres, paths-curves |
| `chaikin`         | Corner-cut smoothing: each pass replaces every sharp vertex with two new points placed 25% and 75% along the incoming and outgoing edges, rounding the bend into a smooth curve. Applying multiple iterations produces progressively rounder, more organic shapes.                                             | call-syntax, embroidery, function, geometry, library, paths-curves              |
| `catmull`         | Smooth curve that passes exactly through every control point. Unlike Bézier curves, you do not need to supply separate handles — the spline infers the curvature from neighbouring points automatically. Resampled to `spacing` mm for sewing.                                                                 | call-syntax, embroidery, function, geometry, library, millimetres, paths-curves |
| `bezier`          | Cubic Bézier from start `p0` to end `p1`, shaped by control handles `c0` (near the start) and `c1` (near the end). The curve is pulled toward the handles without passing through them — the further out you place a handle, the more the curve bends in that direction. Resampled to `spacing` mm for sewing. | call-syntax, embroidery, function, geometry, library, millimetres, paths-curves |
| `centroid`        | The geometric centre of a path — the average position of all its vertices. Use it to anchor rotation, find the middle of a region, or place a motif at the heart of a `voronoi` cell or scatter cluster.                                                                                                       | call-syntax, function, geometry, library, paths-curves                          |
| `bbox`            | Returns the smallest axis-aligned rectangle enclosing the path, as `[minx, miny, maxx, maxy]`. Use it to check a design's extents, frame a motif, compute a safe scatter region, or normalise coordinates to fit a specific area.                                                                              | call-syntax, function, geometry, library, millimetres, paths-curves             |
| `routesort`       | Returns a new greedily routed list. `routesort(items)` anchors the first item; `routesort(items, start)` starts nearest `[x,y]`. Mode `'both'` may return reversed copies of path elements so their nearer endpoint is entered first; `'chain'` is the default. Pure, deterministic, and drawless.             | call-syntax, function, geometry, library, mode, paths-curves, pure              |
| `sewpath`         | Exactly `for p in path [ setpos(p) ]`. Pen state, stitch mode, satin, and auto-split all apply as if hand-walked.                                                                                                                                                                                              | call-syntax, embroidery, function, geometry, library, mode, paths-curves        |
| `curveflat`       | Adaptively flatten editable cubic anchors into a path at `tolerance` millimetres. Relative handles and compact corner anchors are supported; optional mode `'closed'` closes the curve. Pure and drawless.                                                                                                     | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `curvepath`       | Flatten an editable cubic curve spec at 0.05 mm tolerance, then arc-length resample it with numeric, list, or reporter spacing. Optional phase and `'open'`/`'closed'` mode follow `resample` semantics.                                                                                                       | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `isclosed`        | Return `1` when a path explicitly repeats its first point at the end, otherwise `0`. Non-empty path validation still applies. Pure and drawless.                                                                                                                                                               | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `openpath`        | Return a new open path by removing a duplicate final point when the input is canonically closed. Other vertices are preserved. Pure and drawless.                                                                                                                                                              | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `pathorientation` | Return `1` for counter-clockwise, `-1` for clockwise, or `0` for a degenerate path, using the implicit closing segment. Pure and drawless.                                                                                                                                                                     | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `pointat`         | Return the point at normalized arc-length parameter `t` on an open path. Parameters are clamped to 0…1. Pure and drawless.                                                                                                                                                                                     | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `headingat`       | Return the turtle heading of an open path at normalized arc-length parameter `t`. Parameters are clamped to 0…1. Pure and drawless.                                                                                                                                                                            | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `normalat`        | Return the turtle heading of the normal pointing left of path travel at normalized arc-length parameter `t`. Pure and drawless.                                                                                                                                                                                | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `paramof`         | Project a point to the nearest location on an open path and return its normalized arc-length parameter in 0…1. Pure and drawless.                                                                                                                                                                              | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `paramtomm`       | Convert normalized arc-length parameter `t` to millimetres along a path. The parameter is clamped to 0…1. Pure and drawless.                                                                                                                                                                                   | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `mmtoparam`       | Convert a distance in millimetres along a path to normalized arc-length parameter 0…1. Distance is clamped to the path length. Pure and drawless.                                                                                                                                                              | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `subpath`         | Return the shape-preserving open subpath between normalized arc-length parameters `a` and `b`, including interpolated boundary points. Pure and drawless.                                                                                                                                                      | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `splitat`         | Return two shape-preserving subpaths split at normalized arc-length parameter `t`. The shared split point ends the first and starts the second. Pure and drawless.                                                                                                                                             | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `insertvertex`    | Return a path with a vertex inserted at normalized arc-length parameter `t` without changing the represented polyline shape. Pure and drawless.                                                                                                                                                                | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `dashes`          | Return open dash fragments using repeating on/off lengths in millimetres. An optional phase enters the cycle; lengths must be non-negative with a positive sum. Pure and drawless.                                                                                                                             | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `pathisectparams` | Return path intersections as `[point, ta, tb]`, where `ta` and `tb` are normalized arc-length parameters on the two input paths. Pure and drawless.                                                                                                                                                            | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `pathselfisects`  | Return non-adjacent self-intersections as `[point, ta, tb]` with normalized arc-length parameters on the input path. Pure and drawless.                                                                                                                                                                        | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `joinpaths`       | Deterministically weld fragment endpoints within `tolerance` millimetres. Closed chains become canonical rings; the result is a list of paths. Pure and drawless.                                                                                                                                              | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `ispoint`         | Return `1` only for a two-number finite point `[x, y]`; return `0` for every other value without throwing. Pure and drawless.                                                                                                                                                                                  | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `ispath`          | Return `1` only for a list of at least two finite points; return `0` for every other value without throwing. Pure and drawless.                                                                                                                                                                                | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `iscurvespec`     | Return `1` when a value is a valid editable cubic curve specification; return `0` instead of throwing on malformed input. Pure and drawless.                                                                                                                                                                   | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `strokepath`      | Return canonical outline regions for a path stroke of `width` millimetres. Optional caps are `'round'`, `'butt'`, or `'square'`; joins are `'round'`, `'miter'`, or `'bevel'`. Pure and drawless.                                                                                                              | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |
| `clipopen`        | Return open fragments of a path inside a compound even-odd region, or outside it when optional mode is `'outside'`. Pure and drawless.                                                                                                                                                                         | call-syntax, embroidery, function, geometry, library, paths-curves, pure        |

### Geometry generators & operations

Sampling, tessellation, regions, clipping, and fill paths.

| Feature        | Summary                                                                                                                                                                                                                                                                                 | Tags                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `scatter`      | Seeded Poisson-disc (Bridson) points.                                                                                                                                                                                                                                                   | call-syntax, function, geometry, library, millimetres, seeded |
| `voronoi`      | Divide the canvas into cells, one per input point. Each cell contains every location that is closer to its seed point than to any other seed. Returns a list of closed regions in input order, clipped to the sewable field (or a given region).                                        | call-syntax, embroidery, function, geometry, library          |
| `triangulate`  | Delaunay triangulation: connects a set of points into triangles such that the circumcircle of each triangle contains no other point. Returns a list of 3-point regions. The "dual" of Voronoi — the same seeds that define Voronoi cells also define the triangle mesh connecting them. | call-syntax, embroidery, function, geometry, library          |
| `hull`         | Convex hull: the smallest convex polygon that encloses all given points, returned as a counter-clockwise region. Think of it as wrapping a rubber band around all the points — only the outermost ones form the boundary.                                                               | call-syntax, embroidery, function, geometry, library          |
| `relax`        | n rounds of Lloyd's relaxation — moves each point to its Voronoi cell's centroid for even stippling.                                                                                                                                                                                    | call-syntax, function, geometry, library                      |
| `offsetpath`   | Inflate (+) or shrink (−) a region. Returns a list of regions. Shrinking may split or erase the shape entirely.                                                                                                                                                                         | call-syntax, function, geometry, library                      |
| `contourpaths` | Closed inset contours at half-gap then gap spacing, ordered outside-in.                                                                                                                                                                                                                 | call-syntax, embroidery, function, geometry, library          |
| `spiralpath`   | Contour rings spliced into one open inward path per disconnected fragment.                                                                                                                                                                                                              | call-syntax, function, geometry, library                      |
| `fillrows`     | Routed, unsplit tatami rows without pull compensation, ready for `fill paths`.                                                                                                                                                                                                          | call-syntax, embroidery, function, geometry, library          |
| `closepath`    | Return the ring with its first point repeated. Requires at least three points.                                                                                                                                                                                                          | call-syntax, function, geometry, library                      |
| `clippaths`    | Boolean operation on two regions. Backed by Clipper2 at μm precision. Returns a list of regions.                                                                                                                                                                                        | call-syntax, function, geometry, library                      |
| `inpath`       | 1 if the point is inside the region (even-odd rule, consistent with fills).                                                                                                                                                                                                             | call-syntax, embroidery, function, geometry, library          |

### Hoop field

Sewable-field queries.

| Feature       | Summary                                                                                                                                                                                                          | Tags                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `infield`     | `1` if the point is inside the current sewable field, `0` otherwise. The point is mapped through the current transform (local frame → hoop space), consistent with `coverat`. Zero RNG draws.                    | call-syntax, embroidery, field, function, geometry, library              |
| `fieldbounds` | Returns `[minX, minY, maxX, maxY]` — the bounding box of the sewable field in hoop space (mm). Same format as `bbox()`. Zero RNG draws.                                                                          | call-syntax, embroidery, field, function, library, millimetres           |
| `fieldpath`   | Returns the boundary of the sewable field as a counter-clockwise polygon, ready for use as a region in `scatter`, `clippaths`, `offsetpath`, etc. Round fields are polygonised at ≤ 2 mm chords. Zero RNG draws. | call-syntax, embroidery, field, function, geometry, library, millimetres |

### Pure path transforms

Functional transforms and path effects.

| Feature        | Summary                                                                                                                                                            | Tags                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `xlate`        | New path shifted by `(dx, dy)` mm. The functional companion to the `translate` block command — composes with `scatter`/`voronoi`/`offsetpath` data.                | block, call-syntax, function, geometry, library, millimetres, path-transforms, pure              |
| `xrotate`      | New path rotated `deg` clockwise. Optional pivot: `xrotate(path, deg, cx, cy)`.                                                                                    | call-syntax, function, geometry, heading, library, path-transforms, pure                         |
| `xscale`       | New path scaled by `sx` (and `sy`). `xscale(path, s)` is uniform; `xscale(path, sx, sy)` is per-axis.                                                              | call-syntax, function, geometry, library, path-transforms, pure                                  |
| `xmirror`      | New path reflected across a line through the origin at heading `deg`.                                                                                              | call-syntax, function, geometry, heading, library, path-transforms, pure                         |
| `warppath`     | New path with every point mapped through a `@name` reporter — the functional companion to the `warp` block. `warp @f [ sewpath(P) ]` ≡ `sewpath(warppath(P, @f))`. | block, call-syntax, embroidery, function, geometry, library, path-transforms, pure               |
| `humanizepath` | New path with seeded coherent jitter (`amount` mm) — the functional companion to `humanize`. Forks one draw from the seeded stream.                                | call-syntax, embroidery, function, geometry, library, millimetres, path-transforms, pure, seeded |
| `snappath`     | New path with every point snapped to the fixed lattice — the functional companion to `snaptogrid`, same arity overloads (cell \| cellx celly \| …ox oy \| …ang).   | call-syntax, function, geometry, library, millimetres, path-transforms, pure                     |
| `declumppath`  | Run the `declump` fold over an explicit point list, reading real committed coverage history but committing nothing — the pure data twin of `declump`. Drawless.    | block, call-syntax, embroidery, function, geometry, library, path-transforms, pure               |

### Satin helpers

Programmable satin and rail-pair tuple helpers.

| Feature     | Summary                                                                                                                                                                                      | Tags                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `satinpair` | Build the 5-slot satin reporter contract by intent.                                                                                                                                          | call-syntax, embroidery, function, library, satin-helpers                 |
| `satinrake` | Build the 5-slot satin reporter contract by intent.                                                                                                                                          | call-syntax, embroidery, function, library, millimetres, satin-helpers    |
| `satinasym` | Build the 5-slot satin reporter contract by intent.                                                                                                                                          | call-syntax, embroidery, function, library, satin-helpers                 |
| `railinset` | `railinset(advance, inset)` builds `[advance, inset, inset, 0, 0]` for a `satinbetween` shape reporter. Insets move inward from both authored rails. Pure, drawless, Library tier.           | call-syntax, embroidery, function, library, pure, satin-helpers           |
| `railrake`  | `railrake(advance, lag)` builds `[advance, 0, 0, -lag, lag]` for a full-width raked `satinbetween` stitch. Pure, drawless, Library tier.                                                     | call-syntax, embroidery, function, library, pure, satin-helpers           |
| `railspine` | Returns the same derived midpoint path used by `satinbetween`, including orientation and deterministic closed-rail seam handling. Useful for a centre vein or manual run. Pure and drawless. | call-syntax, embroidery, function, geometry, library, pure, satin-helpers |

### Fill helpers

Programmable fill tuple helpers.

| Feature     | Summary                                                  | Tags                                                     |
| ----------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `tatamirow` | Build the 3-slot fill shape reporter contract by intent. | call-syntax, embroidery, fill-helpers, function, library |

### Stitch history

Live coverage and prior-penetration queries.

| Feature          | Summary                                                                                                                                                                                                                                                | Tags                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `coverat`        | Coverage at a point, in layers (the heatmap / `maxdensity` unit; 1 ≈ one clean satin/tatami pass), read live and in sewing order over everything committed so far.                                                                                     | call-syntax, embroidery, function, geometry, history, library, millimetres, pure |
| `countat`        | The number of penetrations in the 1 mm cell containing `p`, read live. Pure: zero draws, draws nothing.                                                                                                                                                | call-syntax, function, geometry, history, library, millimetres, pure             |
| `nearestsewn`    | The closest already-sewn penetration to `p`, as `[x, y]` in hoop space, or `[]` if nothing is sewn yet. Backed by a spatial index, so it stays O(local) — no history scan. Pure: zero draws.                                                           | call-syntax, embroidery, function, geometry, history, library, pure              |
| `sewnwithin`     | A list of already-sewn penetrations within `r` mm of `p` (hoop space). Grid-bucketed, so proximity logic stays O(local) instead of scanning the whole history.                                                                                         | call-syntax, embroidery, function, geometry, history, library, millimetres, pure |
| `stitchedpoints` | A deep-copied list of every penetration committed so far, as a path of `[x, y]` points (hoop space), captured at call time. Explicit and opt-in: you pay the O(n) copy when you ask, and the result is just a list (safe to mutate). Pure: zero draws. | call-syntax, embroidery, function, geometry, history, library, pure, stateful    |

---

## 26. Standard library index

Imports use `import std.module.procedure as alias`. The dedicated [standard-library reference](./needlescript-standard-library-reference.md) contains extended examples and construction notes.

### `std.mathx`

Easing, angles, vectors, remapping, and deterministic random helpers. RNG: Only randbetween, randint, chance, weightedpick, and jitterpt draw (1, 1, 1, 1, and 2).

| Import path              | Signature                             | Summary                                                                                                                                                                                    |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `std.mathx.easein`       | `easein(t)`                           | Quadratic ease-in, `u²`, after clamping `t` to 0…1.                                                                                                                                        |
| `std.mathx.easeout`      | `easeout(t)`                          | Quadratic ease-out, `1 - (1-u)²`, with clamped input.                                                                                                                                      |
| `std.mathx.easeinout`    | `easeinout(t)`                        | Symmetric quadratic ease-in/out with clamped input; its midpoint is 0.5.                                                                                                                   |
| `std.mathx.easeback`     | `easeback(t)`                         | Back-ease curve using overshoot constant 1.70158. Input is clamped, but the curve itself dips below 0 near the start.                                                                      |
| `std.mathx.easepow`      | `easepow(power)`                      | Returns a configured one-argument reporter equivalent to `pow(clamp(t, 0, 1), power)`. Use directly as `easepow(3)(0.5)` or pass the returned reference to another reporter.               |
| `std.mathx.triwave`      | `triwave(t)`                          | Period-1 triangle wave: −1 at integer boundaries, 0 at quarter periods, and 1 at half periods. Negative `t` wraps with floor modulo.                                                       |
| `std.mathx.pulse`        | `pulse(t, duty)`                      | Period-1 pulse. Returns 1 while the wrapped phase is below `clamp(duty, 0, 1)`.                                                                                                            |
| `std.mathx.wrapdeg`      | `wrapdeg(d)`                          | Wraps an angle into 0…360, excluding 360.                                                                                                                                                  |
| `std.mathx.angdiff`      | `angdiff(a, b)`                       | Shortest signed rotation from `a` to `b`, in −180…180, excluding +180. Positive is clockwise.                                                                                              |
| `std.mathx.lerpheading`  | `lerpheading(a, b, t)`                | Interpolates along the shortest angular route and wraps the result. `t` is not clamped.                                                                                                    |
| `std.mathx.vperp`        | `vperp(v)`                            | Returns `[-v[1], v[0]]`, a 90° mathematical counter-clockwise perpendicular in Cartesian coordinates.                                                                                      |
| `std.mathx.vproj`        | `vproj(a, b)`                         | Projects vector `a` onto `b`. Returns `[0, 0]` when `b` has near-zero squared length.                                                                                                      |
| `std.mathx.vreflect`     | `vreflect(v, n)`                      | Reflects `v` across the line whose normal is `n`. `n` need not be normalized; a near-zero normal returns a copy of `v`.                                                                    |
| `std.mathx.remapc`       | `remapc(v, inlo, inhi, outlo, outhi)` | Clamped linear remap. Reversed input/output ranges work. A near-zero input span returns `outlo`.                                                                                           |
| `std.mathx.randbetween`  | `randbetween(a, b)`                   | Uniform value starting at `a` with span `b-a`; consumes **1 draw**. Reversed bounds therefore work.                                                                                        |
| `std.mathx.randint`      | `randint(a, b)`                       | Uniform inclusive integer between `ceil(min(a,b))` and `floor(max(a,b))`; normally consumes **1 draw**. If the bounds contain no integer, returns the rounded lower bound without drawing. |
| `std.mathx.chance`       | `chance(p)`                           | Bernoulli trial with `p` clamped to 0…1; consumes **1 draw** even at probabilities 0 and 1.                                                                                                |
| `std.mathx.weightedpick` | `weightedpick(xs, ws)`                | Selects from `xs` in order using cumulative weights; consumes **1 draw**. Supply a non-empty `xs`, an equally long `ws`, non-negative weights, and a positive total.                       |
| `std.mathx.jitterpt`     | `jitterpt(p, mm)`                     | Independently offsets both coordinates uniformly within `[-mm, mm)`; consumes **2 draws**. Use non-negative `mm`.                                                                          |

### `std.listx`

Sorting, selection, reshaping, and predicate-based list operations. RNG: Only when a supplied callback draws.

| Import path             | Signature             | Summary                                                                                                                                  |
| ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `std.listx.sortby`      | `sortby(xs, keyfn)`   | Returns a new list in ascending key order. Computes every key once and leaves `xs` unchanged. Equal-key items keep their original order. |
| `std.listx.argmin`      | `argmin(xs, keyfn)`   | Returns the first item with the smallest computed key. Keys are computed once. `xs` must be non-empty.                                   |
| `std.listx.argmax`      | `argmax(xs, keyfn)`   | Returns the first item with the largest computed key. Keys are computed once. `xs` must be non-empty.                                    |
| `std.listx.pairwise`    | `pairwise(xs)`        | Returns adjacent pairs: `[a,b,c]` becomes `[[a,b],[b,c]]`. Lists shorter than two produce `[]`.                                          |
| `std.listx.zip`         | `zip(a, b)`           | Pairs items at matching indices and stops at the shorter input.                                                                          |
| `std.listx.flatten`     | `flatten(xs)`         | Recursively removes all nested list structure while preserving left-to-right leaf order. Empty nested lists contribute nothing.          |
| `std.listx.unique`      | `unique(xs)`          | Removes later duplicates and preserves first occurrence order. Equality follows NeedleScript's deep, tolerant equality rules.            |
| `std.listx.chunk`       | `chunk(xs, n)`        | Splits `xs` into consecutive chunks. The width is `max(1, floor(n))`; the last chunk may be shorter.                                     |
| `std.listx.rotatedlist` | `rotatedlist(xs, n)`  | Returns a new list rotated left by `round(n)` places. Negative values rotate right. Empty input returns `[]`.                            |
| `std.listx.countif`     | `countif(xs, predfn)` | Counts items for which the predicate returns non-zero. It has the same predicate requirements as the core `filter`.                      |

### `std.shapes`

Centered closed and open path constructors. RNG: None.

| Import path                   | Signature                          | Summary                                                                                                                                           |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.shapes.polypath`         | `polypath(n, r)`                   | Regular polygon of radius `r`. Vertex count is `max(3, round(n))`; result length is vertices + 1.                                                 |
| `std.shapes.starpath`         | `starpath(n, rout, rin)`           | Alternating outer/inner radii with `max(2, round(n))` points of each kind.                                                                        |
| `std.shapes.rectpath`         | `rectpath(w, h)`                   | Axis-aligned rectangle of width `w` and height `h`, beginning at the top-edge midpoint.                                                           |
| `std.shapes.roundrect`        | `roundrect(w, h, r)`               | Rounded rectangle with nine samples per corner. Radius is `abs(r)` clamped to half the smaller absolute dimension.                                |
| `std.shapes.ellipsepath`      | `ellipsepath(rx, ry)`              | Ellipse with 64 perimeter samples; `rx` and `ry` are horizontal and vertical radii.                                                               |
| `std.shapes.arcpath`          | `arcpath(deg, r)`                  | Circular arc starting north, sampled at no more than 6° per segment. Positive `deg` progresses counter-clockwise; negative progresses clockwise.  |
| `std.shapes.coilpath`         | `coilpath(turns, r0, r1)`          | Spiral whose radius linearly changes from `r0` to `r1`, with 72 segments per absolute turn. Positive turns progress counter-clockwise.            |
| `std.shapes.heartpath`        | `heartpath(size)`                  | Parametric heart with 96 samples. Overall scale is controlled by `size`; the first point is on the north-west lobe.                               |
| `std.shapes.gearpath`         | `gearpath(teeth, r, depth)`        | Four vertices per tooth, alternating two outer points at `r` and two root points at `max(0, r-depth)`. Uses at least three teeth.                 |
| `std.shapes.superellipsepath` | `superellipsepath(w, h, e)`        | 96-sample superellipse within `w × h`. Exponent `e` is floored at 0.01 before deriving the signed-power curve.                                    |
| `std.shapes.wavepath`         | `wavepath(length, amp, cycles)`    | Horizontal sine wave from `-length/2` to `length/2`, with 24 segments per absolute cycle. Negative cycles reverse phase progression.              |
| `std.shapes.rosepath`         | `rosepath(k, r)`                   | Polar rose `radius = cos(k × angle) × r`, sampled with at least 72 points and 72 per absolute `k`. Integer `k` produces the expected closed rose. |
| `std.shapes.lissajouspath`    | `lissajouspath(a, b, phase, size)` | Lissajous curve with x phase in degrees, within a square of side `size`; sample count is at least 96 and scales with `max(abs(a), abs(b))`.       |

### `std.pathops`

Arc-length queries and polyline transformations. RNG: None.

| Import path                | Signature                   | Summary                                                                                                                                                                                          |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `std.pathops.pointat`      | `pointat(path, t)`          | Point at normalized arc length `t`. A one-point path returns that point; repeated zero-length segments are tolerated.                                                                            |
| `std.pathops.headingat`    | `headingat(path, t)`        | Heading of the non-zero segment containing `t`. At an exact vertex it selects the preceding segment. If no non-zero segment exists, returns 0.                                                   |
| `std.pathops.paramof`      | `paramof(p, path)`          | Normalized arc-length position of the closest point on the polyline. Ties keep the earlier segment; a zero-length path returns 0.                                                                |
| `std.pathops.subpath`      | `subpath(path, t0, t1)`     | Extracts a section, including interpolated endpoints and interior original vertices. If `t1 < t0`, returns the forward extraction reversed. Equal parameters return two equal endpoints.         |
| `std.pathops.dashes`       | `dashes(path, onmm, offmm)` | Splits an arc-length route into on-segments. `phasemm` enters that far into the repeating cycle and may begin in a dash or gap. Use non-negative lengths and a positive sum.                     |
| `std.pathops.simplifypath` | `simplifypath(path, tol)`   | Ramer–Douglas–Peucker simplification using perpendicular segment distance. Negative tolerance becomes 0; endpoints are preserved.                                                                |
| `std.pathops.smoothclosed` | `smoothclosed(ring, n)`     | Applies 0…6 rounded Chaikin corner-cutting passes. An existing duplicate closing point is removed first, then one closing point is appended. Each pass doubles the unique point count.           |
| `std.pathops.morphpaths`   | `morphpaths(a, b, t)`       | Arc-length-resamples both paths to the larger unique-point count and linearly interpolates corresponding points. `t` is not clamped. The result is closed only if both inputs are closed.        |
| `std.pathops.pathisects`   | `pathisects(a, b)`          | Returns unique segment intersections in nested segment order. Collinear overlap behavior follows core `segisect`.                                                                                |
| `std.pathops.offsetopen`   | `offsetopen(path, mm)`      | Approximate mitered offset of an open polyline. Positive `mm` offsets to the path's Cartesian left; negative offsets right. Near-180° joins use a bounded denominator to avoid division by zero. |

### `std.regions`

Region measurement, tiling, insets, and partitions. RNG: partitions draws exactly 1; all other exports draw none.

| Import path              | Signature                       | Summary                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `std.regions.regionarea` | `regionarea(region)`            | Absolute shoelace area in mm². Orientation does not affect the result.                                                                                                                                                                           |
| `std.regions.poleof`     | `poleof(region)`                | Deterministic approximation of the interior point farthest from the boundary. It tests the centroid, a 9×9 bounding-box grid, then seven local refinements. Useful for labels and seed points; it is not an exact polylabel solution.            |
| `std.regions.insetrings` | `insetrings(region, gap, n)`    | Repeatedly offsets inward by `abs(gap)`, returning every piece from levels 1 through `max(0, round(n))`. Splits and collapsed levels are handled by `offsetpath`; the original region is not included.                                           |
| `std.regions.tilecells`  | `tilecells(region, kind, cell)` | Covers and clips a global grid of cells to the region. `kind` must be `'square'`, `'hex'`, or `'tri'`; `cell` must be positive. Hex `cell` is circumradius; triangular cells are halves of square cells. Boundary cells may be partial or split. |
| `std.regions.gridpoints` | `gridpoints(region, cell)`      | Returns centers of globally aligned `cell × cell` boxes that lie inside the region. `cell` must be positive. Points on the upper/right incomplete fringe are not sampled.                                                                        |
| `std.regions.partitions` | `partitions(region, n)`         | Produces `max(1, round(n))` clipped Voronoi cells after two centroidal-relaxation passes. Initial seeds use `scatter`, with grid/pole fallbacks. Consumes exactly **1 main-stream RNG draw**, regardless of the number of generated seeds.       |

### `std.layout`

Point/heading layouts and uniform path fitting. RNG: None.

| Import path               | Signature                        | Summary                                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `std.layout.circlelayout` | `circlelayout(n, r)`             | Returns `max(0, round(n))` evenly spaced positions on radius `r`. The first is north. Each heading is tangent to the circle in counter-clockwise traversal; zero count returns `[]`.                                                                               |
| `std.layout.gridlayout`   | `gridlayout(cols, rows, dx, dy)` | Centered row-major grid with rounded non-negative dimensions. Starts at the top-left for positive spacing; every heading is 0. Negative spacing mirrors an axis.                                                                                                   |
| `std.layout.alongpath`    | `alongpath(path, n)`             | Returns rounded non-negative count at equal normalized arc-length parameters, including both ends. One placement uses the midpoint (`t = 0.5`). Headings follow `std.pathops.headingat`.                                                                           |
| `std.layout.fitpath`      | `fitpath(path, region, margin)`  | Uniformly scales `path` to fit the region's bounding box after a non-negative margin, then centers bounding boxes. Preserves aspect ratio and handles horizontal, vertical, and point-like source paths. It fits the bounding box, not the exact polygon interior. |

### `std.textures`

Direction/shape callbacks and clipped fill paths. RNG: None; seeded simplex fields do not advance the main stream.

| Import path                      | Signature                                     | Summary                                                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.textures.radialdir`         | `radialdir(p)`                                | Heading of the ray from origin to `p`; returns 0 within `0.000001` mm of the origin.                                                                                                                            |
| `std.textures.griddir`           | `griddir(deg)`                                | Returns a direction reporter that ignores its point and always returns `deg`. Example: `fill dir griddir(30)`.                                                                                                  |
| `std.textures.radialdirfrom`     | `radialdirfrom(cx, cy)`                       | Returns a reporter whose rays originate at `[cx, cy]`; returns 0 at that center.                                                                                                                                |
| `std.textures.curldir`           | `curldir(p)`                                  | Divergence-free direction derived from finite differences of simplex noise at a fixed 14 mm scale. Returns 0 for a near-zero gradient.                                                                          |
| `std.textures.curldirwith`       | `curldirwith(scaledown)`                      | Configurable form of `curldir`; `scaledown` is the spatial noise scale and must be positive. Larger values vary more slowly.                                                                                    |
| `std.textures.wovenshape`        | `wovenshape(p, row, v)`                       | Uses 0.8 mm row spacing, 3 mm stitches, and alternates phase 0/0.5 by row parity for a woven rhythm.                                                                                                            |
| `std.textures.gradientshape`     | `gradientshape(p, row, v)`                    | Ramps row spacing from 0.45 to 1.2 mm using clamped cross-field coordinate `v`; stitch length is 2.5 mm and phase 0.5.                                                                                          |
| `std.textures.gradientshapewith` | `gradientshapewith(lo, hi)`                   | Configurable gradient reporter interpolating spacing from `lo` to `hi`; it does not clamp the supplied spacing endpoints.                                                                                       |
| `std.textures.hilbertpaths`      | `hilbertpaths(region, cell)`                  | Builds the smallest power-of-two Hilbert grid whose scaled span covers the larger bounding-box dimension, then clips its continuous curve. `cell` controls target detail and must be positive.                  |
| `std.textures.truchetpaths`      | `truchetpaths(region, cell)`                  | Alternating checkerboard Truchet quarter-circles, sampled every 15°. `cell` is tile size and must be positive.                                                                                                  |
| `std.textures.hitomezashi`       | `hitomezashi(region, cell, rowbits, colbits)` | Alternating horizontal and vertical sashiko dashes. Rounded bit values modulo 2 set row and column phases cyclically, including at negative grid indices. `cell` must be positive and both bit lists non-empty. |
| `std.textures.seigaiha`          | `seigaiha(region, r)`                         | Staggered Japanese wave pattern with three concentric semicircles at each origin. `r` is the largest radius and must be positive.                                                                               |
| `std.textures.asanoha`           | `asanoha(region, cell)`                       | Hexagonally arranged hemp-leaf spokes and half-edges. `cell` must be positive.                                                                                                                                  |
| `std.textures.herringbonepaths`  | `herringbonepaths(region, w)`                 | Staggered zigzag herringbone units with horizontal/vertical scale `w`, which must be positive.                                                                                                                  |

### `std.stitchcraft`

Reusable embroidery construction and geometry rituals. RNG: stipple draws exactly 1; all other exports draw none unless a callback draws.

| Import path                          | Signature                                                                | Summary                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `std.stitchcraft.sewrun`             | `sewrun(path, mm)`                                                       | Resamples `path` at spacing `mm`, then sews it with the current stitch mode and thread. Equivalent to `sewpath(resample(path, mm))`.                                                                                                                                                                               |
| `std.stitchcraft.satinalong`         | `satinalong(path, w)`                                                    | Enables satin width `w`, sews `path`, then sets satin width to 0. The final satin state is always off, not restored to a prior width. Other satin settings still apply.                                                                                                                                            |
| `std.stitchcraft.beanoutline`        | `beanoutline(region, n)`                                                 | Enables bean repeat `n`, sews the logically closed region, then sets bean repeat to 1. The prior bean setting is not restored.                                                                                                                                                                                     |
| `std.stitchcraft.appliquesteps`      | `appliquesteps(region, w)`                                               | Performs a 2.5 mm running placement line, a narrow satin tack-down at `max(0.8, 0.35w)`, and a final satin cover at `w`. Inserts `stop` events between the three stages so fabric can be placed/trimmed. Each stage travels with needle up to the ring start. Ends at the closed ring's end with satin turned off. |
| `std.stitchcraft.appliquewith`       | `appliquewith(region, placementinset, tackdowninset, coverwidth, stops)` | Configurable three-stage appliqué construction. See below.                                                                                                                                                                                                                                                         |
| `std.stitchcraft.eyelet`             | `eyelet(r)`                                                              | Sews a resampled satin circle centered at the current needle position. Radius must be positive; satin width is `clamp(0.55r, 0.6, 1.5)`. A `push`/`pop` pair restores needle position, heading, and pen state after sewing; satin ends off.                                                                        |
| `std.stitchcraft.fillbordergeometry` | `fillbordergeometry(region, coverwidth, overlap)`                        | Pure fill-and-border construction geometry. See below.                                                                                                                                                                                                                                                             |
| `std.stitchcraft.fillandborder`      | `fillandborder(region, deg, spacing, coverwidth)`                        | Sews inset fill rows, inserts a `stop`, then sews the satin border. Uses the standard 0.4 mm overlap.                                                                                                                                                                                                              |
| `std.stitchcraft.fillandborderwith`  | `fillandborderwith(region, deg, spacing, coverwidth, overlap)`           | Explicit-overlap form of `fillandborder`.                                                                                                                                                                                                                                                                          |
| `std.stitchcraft.gradientbands`      | `gradientbands(region, deg, n)`                                          | Geometry-only helper: slices a region into `max(1, round(n))` parallel bands oriented at heading/angle `deg` and returns all clipped pieces in band order. Concavity can yield more pieces than requested bands.                                                                                                   |
| `std.stitchcraft.gradientrows`       | `gradientrows(region, deg, pitch, amount)`                               | Geometry-only, density-neutral two-color blend. See below.                                                                                                                                                                                                                                                         |
| `std.stitchcraft.gradientrowsn`      | `gradientrowsn(region, deg, pitch, weights)`                             | Geometry-only, density-neutral blend across 2–8 colors. See below.                                                                                                                                                                                                                                                 |
| `std.stitchcraft.serpentinerows`     | `serpentinerows(rows, reversed)`                                         | Greedily routes parallel row paths with endpoint reversal enabled, beginning from the first row when `reversed` is false or the last row when true. Returns `[]` for empty input and does not mutate `rows`.                                                                                                       |
| `std.stitchcraft.knockdown`          | `knockdown(region, deg, spacing)`                                        | Sparse running-stitch foundation for fleece, terry, and other high-pile fabrics. See below.                                                                                                                                                                                                                        |
| `std.stitchcraft.threadblend`        | `threadblend(region, deg)`                                               | Creates 1.2 mm fill rows at `deg`, sews even rows in the current color, advances once to the next color, then sews odd rows. Rows are resampled at 2.5 mm. Ends in the second color and does not restore needle position.                                                                                          |
| `std.stitchcraft.stipple`            | `stipple(region, mindist)`                                               | Scatters candidate points and sews a small circular mark only where coverage within `mindist/3` is below one layer. `mindist` must be positive. Each mark restores turtle state with `push`/`pop`. Consumes exactly **1 main-stream RNG draw** through `scatter`.                                                  |

### `std.debugx`

Chalk overlays and stitch-history diagnostics. RNG: None.

| Import path                 | Signature                    | Summary                                                                                                                                                                                                                                          |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `std.debugx.chalkgrid`      | `chalkgrid(cell)`            | Adds a `'grid'` line group spanning the configured field bounds, aligned to global multiples of `cell`. `cell` must be positive.                                                                                                                 |
| `std.debugx.chalkbbox`      | `chalkbbox(path)`            | Adds a closed, axis-aligned `'bbox'` line overlay around `path`. Expects non-empty geometry accepted by core `bbox`.                                                                                                                             |
| `std.debugx.chalkfield`     | `chalkfield()`               | Adds a `'field'` line overlay of the current sewable field path. Works for circular and rectangular hoop fields.                                                                                                                                 |
| `std.debugx.threadestimate` | `threadestimate()`           | Returns the polyline length through committed penetration points, in millimetres, or 0 with fewer than two points. It is an estimate: stitch history does not retain trims or color boundaries, and it does not model bobbin/thread consumption. |
| `std.debugx.coverprofile`   | `coverprofile(path, stride)` | Samples `coverat` along a resampled path and returns `[distanceMm, coverageLayers]` pairs. `stride` must be positive. Empty path returns `[]`; a one-point path returns one sample at distance 0.                                                |
