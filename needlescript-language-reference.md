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
- **Determinism contract:** same source + same seed + same hoop → same stitches (§17).

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

**Contract: same source + same seed + same hoop → same stitches.** `scatter`/`voronoi`/`relax` are functions of the field, so changing `hoop` changes the design.

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
```

Presets (case-insensitive): `'round100'` (default), `'4x4'` 100×100, `'5x7'` 130×180, `'6x10'` 160×260, `'8x8'` 200×200, `'8x12'` 200×300 mm. Rectangular presets are portrait; use the list form for landscape.

### Field reporters (Library tier, call-syntax, zero draws)

| Call            | Returns                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `infield(p)`    | `1`/`0` — p inside the sewable field (maps through the current transform). Idiom: `if infield(pos()) [ … ]`                    |
| `fieldbounds()` | `[minX, minY, maxX, maxY]`                                                                                                     |
| `fieldpath()`   | field boundary as a closed CCW region (round fields polygonised at ≤ 2 mm chords) — feed to `clippaths`/`offsetpath`/`scatter` |

Hoop-agnostic margin idiom: `let margin = first(offsetpath(fieldpath(), -6))`.

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

Parse-time checks and diagnostics: reporter-path check (a `@name` / expression-position procedure that may miss `return` is rejected at parse time, naming the procedure), did-you-mean suggestions across all namespaces, glued-bracket hints, kind-aware rejections. Non-fatal issues (clamps, merged tiny stitches, unclosed fills, hoop overflow, density) surface as warnings. `RunResult.preflight` additionally exposes structured, deterministic issues for density hotspots, same-hole stacks, tiny merged movements, field/hoop overflow, satin snag risk, short-stitch clusters, repeated local reversals, moving-window near-hole penetrations, long sewn floats, long untrimmed jump chains, continuous stitch runs, and dense sharp direction changes. Each issue has a stable code, severity, message, hoop-space points, source lines, and optional suggestion. Stream checks observe planned/autotrimmed events before generated locks, produce no additional warning strings, and never alter stitches or exports. Their conservative thresholds are exported as `EVENT_STREAM_PREFLIGHT_THRESHOLDS`; no fabric/thread-specific modifier is applied pending physical sew-out evidence.

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

---

## 24. Pre-flight checklist — verify every program before returning it

1. **Brackets:** every block opens `[` and closes `]`; the characters `{` and `}` appear nowhere.
2. **Names:** no variable, parameter, or procedure named `to`, `end`, `in`, or any reserved keyword; nothing reuses a Core builtin (`circle`, `pos`, `color`, `heading`, `random`, `scale`, `trace`, …); avoid Library names (`str`, `num`, `upper`, `lower`, `strip`, `chars`, `split`, `len`, `clamp`, …) too. (`step`, `dir`, `shape`, and `paths` are contextual keywords — safe to use as ordinary names outside their one special position.)
3. **Declarations:** each variable has exactly one `let`, placed before any loop/branch that updates it; all later writes are bare assignments; no `let` on parameters; no shadowing; conditionally-assigned variables have a default.
4. **Placement:** `return`/`output`/`exit` only inside `def`/`to` bodies; `break`/`continue` only inside loop bodies of the same procedure; every reporter returns on every path (add `else`); `hoop`/`override`/`plan`/`seed` at the top; `trace` only in expression position, never containing `beginfill`, `plan`, or `seed`.
5. **Negative literals:** ` -5` (space before, glued after) is a negative argument; `10 - 5` is subtraction — check argument counts around minus signs, or use glued-paren calls.
6. **Strings & types:** `concat(a, b)` not `a + b`; `strip(s)` not `trim(s)` for whitespace; conditions are numbers, never strings or lists (`len(x) > 0`); `vadd` for point math, never `+` on lists.
7. **Embroidery sanity:** trims between motifs, satin widths 2–8 mm, stitch count well under budget, everything inside the field.
