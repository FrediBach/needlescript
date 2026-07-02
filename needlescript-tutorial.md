# NeedleScript: A Complete Tutorial

_From your first stitch to seeded generative fields_

NeedleScript is a Logo-inspired programming language for **generative embroidery**. You write turtle-graphics code — moving a virtual needle around a hoop — and NeedleScript turns your path into machine-ready stitches, previews them, and exports a Tajima `.DST` file you can sew on a real machine.

This tutorial walks you from the absolute basics up to seeded noise fields, Voronoi tessellation, and polygon geometry. Work through it in order; each section builds on the last. Type the examples into the playground (`npm run dev`, then open `http://localhost:5173`) and run them with `⌘`/`Ctrl`+`Enter`.

---

## Table of contents

1. [The mental model](#1-the-mental-model)
2. [Your first stitches](#2-your-first-stitches)
3. [Turning and looping](#3-turning-and-looping)
4. [Pen up, pen down, and jumps](#4-pen-up-pen-down-and-jumps)
5. [Stitch types: the thread vocabulary](#5-stitch-types-the-thread-vocabulary)
6. [Fills](#6-fills)
7. [Variables and expressions](#7-variables-and-expressions)
8. [Control flow in depth](#8-control-flow-in-depth)
9. [Procedures and reporters](#9-procedures-and-reporters)
10. [The two dialects, and call syntax](#10-the-two-dialects-and-call-syntax)
11. [Randomness and determinism](#11-randomness-and-determinism)
12. [Lists](#12-lists)
13. [Generative math: scalars, noise, vectors](#13-generative-math-scalars-noise-vectors)
14. [Paths and curves](#14-paths-and-curves)
15. [Generators: scatter, Voronoi, hull](#15-generators-scatter-voronoi-hull)
16. [Geometry: offsets and booleans](#16-geometry-offsets-and-booleans)
17. [Transforms: stamping motifs](#17-transforms-stamping-motifs)
18. [Effects: warp, humanize, snaptogrid](#18-effects-warp-humanize-snaptogrid)
19. [Professional embroidery and fabric physics](#19-professional-embroidery-and-fabric-physics)
20. [Programmable satin, fills, and closed-loop generation](#20-programmable-satin-fills-and-closed-loop-generation)
21. [Debugging](#21-debugging)
22. [Safety limits](#22-safety-limits)
23. [Exporting and reusing your work](#23-exporting-and-reusing-your-work)
24. [A capstone project](#24-a-capstone-project)
25. [AI generation assistant](#25-ai-generation-assistant)

---

## 1. The mental model

NeedleScript gives you a **turtle**: an imaginary needle that carries thread. You don't draw shapes directly — you tell the turtle to move, and a line of stitches follows it. Turn the turtle and move again, and you've sewn a corner.

A few facts to anchor everything else:

- **Units are millimetres.** The virtual hoop is 100 mm across. The _sewable_ field is a disc of 47 mm radius around the origin `(0, 0)`, which sits at the centre. Stray outside it and you'll get a hoop-overflow warning.
- **Heading is in degrees, measured clockwise from north.** `0` faces up, `90` faces right (east), `180` is down, `270` is left. This is the Logo convention and it's used _everywhere_ — including the vector and noise functions later on.
- **Words are case-insensitive.** `FD 10` and `fd 10` are the same.
- **There are no statement separators.** Whitespace and newlines are interchangeable. You can put a whole program on one line or spread one command across several.
- **The only everyday value is the number.** Millimetres, degrees, counts, and truth values are all just numbers. (`0` is false, anything else is true. Comparisons return `1` or `0`, and `true`/`false` are literally `1` and `0`.) Lists arrive later as a second value type, but they never reach the stitch stream — they live in your program.

Comments start with `//`, `#`, or `;` and run to the end of the line. A lone `/` is still division — only _two adjacent_ slashes start a comment.

One frame before the commands, especially if your background is software rather than the sewing room. An embroidery machine doesn't _draw_ — it punches a needle through fabric at a sequence of points, and what you see is **thread pulled taut between them**. Everything you write here ultimately becomes a list of needle penetrations, and the craft comes down to three things: where the thread goes, how densely it piles up, and how it's secured so it can't unravel. The vocabulary in the next few sections — running stitch, satin, fills — is just different ways of turning your turtle path into those penetrations. You won't need any of the professional commands ([§19](#19-professional-embroidery-and-fabric-physics)) to start: `fd`, `rt`, and `repeat` already sew.

---

## 2. Your first stitches

The most basic command is `fd` (forward). It sews a line of stitches in the direction the turtle currently faces:

```text
fd 20
```

That sews a 20 mm line heading north from the centre. Notice you didn't have to place individual stitches — NeedleScript automatically splits a long move into stitches of the current stitch length (default 2.5 mm). One `fd 20` becomes a tidy row of eight stitches.

To sew backward without turning, use `bk`:

```text
fd 20
bk 10
```

The turtle moves forward 20 mm, then retraces 10 mm. The thread overlaps; that's fine and sometimes useful.

You can also jump straight to an absolute coordinate:

```text
setxy 10 -15
```

This moves the needle to the point `(10, -15)`. Used on its own it sews a line _from wherever the turtle was_ to that point. (`setx` and `sety` move one axis at a time, and `home` returns to `(0, 0)` facing north.)

### A note on negative numbers

Following Logo, a minus sign with a **space before it and none after** is a negative literal, not subtraction:

```text
setxy -6 -21       ; the point (-6, -21) — two arguments
fd 10 - 5          ; fd 5 — this is subtraction
fd 10 -5           ; ERROR — "-5" looks like a second argument, but fd takes one
```

If this ever trips you up, reach for call parentheses, where the ambiguity vanishes entirely: `setxy(-6, -21)` and `fd(10 - 5)` mean exactly what they say with any spacing. More on that syntax in [section 10](#10-the-two-dialects-and-call-syntax).

---

## 3. Turning and looping

Movement alone draws straight lines. To make shapes, turn between moves with `rt` (right) and `lt` (left):

```text
fd 20
rt 90
fd 20
rt 90
fd 20
rt 90
fd 20
```

That's a square — four sides with a 90° right turn between each. But typing the same two commands four times is tedious, and embroidery is full of repetition. Use `repeat`:

```text
repeat 4 [ fd 20 rt 90 ]
```

The block in brackets runs four times. This is the single most important pattern in turtle graphics: **a small move plus a small turn, repeated, becomes a shape.** Repeat the same pair many times with a tiny turn and you approximate a circle:

```text
repeat 90 [ fd 1 rt 4 ]
```

Ninety segments of 1 mm each, turning 4° each time (90 × 4 = 360°, one full revolution).

There's a cleaner way to sew arcs and circles, though — `arc`:

```text
arc 360 15
```

This sews a full circle of radius 15 mm. The first number is how many degrees of turn to make in total; the second is the radius. **Positive curves right, negative curves left.** A half-circle is `arc 180 15`. Arcs work with every stitch mode, so you can sew curved satin columns, which traditional software makes painful.

For a complete circle you can also write:

```text
circle 15
```

`circle r` is exactly `arc 360 r` — a single-argument shorthand that names the shape directly.

Inside a `repeat`, the word `repcount` gives you the current iteration as a 1-based counter — useful when each repetition should differ slightly:

```text
repeat 12 [
  fd repcount * 2
  rt 30
]
```

Each side is longer than the last, spiralling outward.

---

## 4. Pen up, pen down, and jumps

So far every move has sewn thread. Often you want to _reposition_ the needle without sewing — to start a new motif elsewhere. The cleanest way is `moveto`:

```text
arc 360 10        // first circle, sewn

moveto 30 0       // jump to (30, 0) without sewing — pen state preserved

arc 360 10        // second circle, 30 mm to the right
```

`moveto x y` (alias: `jump`) repositions the needle as a jump and faithfully restores the pen state it found: if the pen was down it ends down, if it was up it ends up. The classic idiom `up setxy 30 0 down` does the same thing but requires the error-prone bookkeeping of matching every `up` with a `down`.

**`gohome`** is a pen-safe return to the origin — exactly `moveto 0 0`. It jumps without sewing and does _not_ reset the heading (add `seth 0` if you want a full neutral reset):

```text
fd 40                // sew outward
gohome               // jump back to (0, 0), pen restored, heading unchanged
seth 0               // optional: face north again
```

**A note on `home`:** the classic `home` command returns to `(0, 0)` _and resets the heading to 0_, but if the pen is **down** it **sews a line** back to the origin first. That's usually not what you want when repositioning. For a non-sewing return, use `moveto 0 0` or `gohome`.

The raw `up`/`down` commands are still there for cases where you deliberately want the pen up:

```text
up                // needle up — travel without sewing
setxy 30 0
down              // needle down — sewing resumes
arc 360 10
```

While the pen is up, moves become **jumps** — shown as dashed lines in the preview and not sewn as stitches. `up` and `down` have classic aliases (`penup`/`pu`, `pendown`/`pd`) if you prefer them.

There's a problem hiding here: that jump between circles leaves a thread strung across your fabric. Two tools manage this.

**`trim`** cuts the thread at the current point:

```text
arc 360 10
moveto 30 0
trim                  // cut the connector thread
arc 360 10
```

**`push` and `pop`** save and restore the turtle's entire state (position, heading, pen) on a stack. This is the elegant way to build branching structures — sew a branch, then jump back to where it forked without retracing:

```text
repeat 5 [
  push              // remember this spot
  fd 15             // sew a spoke outward
  pop               // jump back to the centre, no sewing
  rt 72             // turn for the next spoke
]
```

`push`/`pop` is perfect for anything tree-like: stars, asterisks, snowflakes, actual trees. The stack holds up to 500 states; popping an empty stack just warns and does nothing.

---

## 5. Stitch types: the thread vocabulary

Real embroidery isn't one kind of stitch. NeedleScript gives you several, and you switch between them with mode commands. Whatever mode is active applies to subsequent moves. Pick by the shape you're sewing: thin lines and fine detail want running stitch, narrow strips and borders want satin, broad areas want a fill ([§6](#6-fills)). And because thread is glossy, the _direction_ your stitches run is itself visible — the same shape can read as two different shades depending on the stitch angle.

**Running stitch** is the default — a simple dashed line. Control its stitch length:

```text
stitchlen 2        // 2 mm stitches (clamped to 0.4–12 mm; default 2.5)
fd 40
```

**Satin** is the glossy, solid zigzag used for borders, lettering, and leaves. You set a _width_, and the turtle's path becomes the centre-line (spine) of a filled column:

```text
satin 3            // 3 mm-wide satin column
fd 30
arc 90 12          // satin follows the arc — a curved column
satin 0            // back to running stitch
```

The penetration spacing along a satin column is set by `density` (0.25–5 mm, default 0.4 — smaller is denser). Columns wider than about 8 mm tend to snag, and you'll get a warning. For columns the built-in zigzag can't make — tapers, woven cross-hatches, asymmetric rails — you can hand `satin` a procedure that draws the column itself (`satin @fn`); that's covered in §20.

**Bean stitch** sews each stitch multiple times for a bold, hand-drawn line:

```text
bean 3             // each stitch sewn 3 times (forced odd, max 9)
fd 30
bean 1             // off
```

**Blanket stitch** (`estitch`) adds perpendicular prongs on the left of travel — the classic edging look:

```text
estitch 3          // 3 mm prongs, spaced by stitchlen
arc 360 20
estitch 0          // off
```

### Colour and securing

Switch threads with `color n`, where _n_ indexes the thread palette. This emits a colour-change stop in the export:

```text
color 1
arc 360 15
color 2            // next motif sews in thread 2
moveto 0 -30
arc 360 15
```

`stop` is shorthand for "advance to the next colour." And `lock` adds tiny tie-in/tie-off back-stitches automatically wherever thread starts or ends (design start/end, colour changes, trims, long jumps) so your stitching can't unravel:

```text
lock 0.7           // 0.7 mm locks (range 0.3–1.5; lock 0 disables)
```

Locks are on by default at a sensible size — you rarely need to set this, but now you know what those small stitches at the ends are.

---

## 6. Fills

A line is one thing; a _filled area_ is another. To fill a shape, trace its boundary between `beginfill` and `endfill`. The moves in between define the outline rather than sewing directly, and `endfill` lays down a **tatami fill** (rows of running stitch) covering the enclosed area:

```text
fillangle 30                  // fill rows run at 30°
moveto -26 -15
beginfill
  repeat 6 [ fd 30 rt 60 ]    // trace a hexagon
endfill
```

A few controls shape the fill:

- **`fillangle deg`** sets the direction of the rows (default 0).
- **`fillspacing mm`** sets row spacing (0.25–5 mm, default 0.4).
- **`filllen mm`** sets the stitch length _within_ the fill (1–7 mm). By default the fill follows `stitchlen`; set `filllen` to override it, or `filllen 0` to follow again. Rows are automatically brick-offset so penetrations don't line up into weak lines.

### Holes

Here's the powerful part. A pen-up move _inside_ a fill starts a new ring, and inner rings become **holes** by the even-odd rule. So a donut is just two concentric circles:

```text
beginfill
  circle 25             // outer ring
  moveto 8 0            // reposition to start the inner ring (pen below stays down)
  circle 12             // inner ring — becomes a hole
endfill
```

The fill covers the area between the two circles, leaving the centre empty.

For fills whose rows _follow a curve_ — contour lines, a flow field, a grain that bends with the shape — you can hand `fill` a procedure that drives the row direction (and another for the texture), exactly the way `satin @fn` drives a column. That's `fill @fn`, covered in §20.

---

## 7. Variables and expressions

To make designs parametric, store values in variables. Declare one with `let`:

```text
let r = 15
arc 360 r
```

At the top level, `let` makes a **global**. Inside a procedure (next section) it makes a **local**. To change a variable afterward, assign without `let`:

```text
let r = 15
r = r + 5          // now 20
arc 360 r
```

Compound assignment is shorter: `r += 5`, `r -= 2`, `r *= 1.5`, `r /= 3` all work. (`x = 1` without a prior `let` is also allowed — friendly for quick one-liners.)

### Expressions and precedence

Numbers combine with the usual arithmetic. Precedence runs from loosest to tightest:

1. `or`
2. `and`
3. comparisons `< > = == <= >= !=` (these return `1` or `0`; `=` and `==` are the same operator, comparing with a 1e-9 tolerance)
4. `+ -`
5. `* / %`
6. unary `-` and prefix functions (`not`/`!`, `sin`, `sqrt`, …)
7. numbers, `true`/`false`, variables, `( … )`, and calls

Two gotchas worth internalising early:

- **`and`/`or` short-circuit**, so a guard like `i > 0 and 10 / i > 2` is safe — the division never runs when `i` is 0.
- **`%` is floor modulo**, taking the sign of the divisor. `-7 % 3` is `2` here, not `-1` as in C or JavaScript. (`mod a b` is the same operation in prefix form.)

### The function toolkit

NeedleScript ships a full set of math functions. The ones you'll reach for constantly:

| Function                                          | What it gives you                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `sin deg`, `cos deg`                              | trigonometry, in **degrees**                                             |
| `sqrt n`, `abs n`, `round n`, `floor n`, `ceil n` | the usual suspects                                                       |
| `min a b`, `max a b`, `pow a b`                   | minimum, maximum, power                                                  |
| `atan x y`                                        | the **heading** of vector (x, y): 0 = north, clockwise. `atan 1 0` is 90 |
| `towards x y`                                     | heading from the needle toward a point. `seth towards 0 0` aims home     |
| `distance x y`                                    | distance from the needle to a point                                      |

And three **reporters** that take no arguments and report the turtle's state: `xcor` and `ycor` (position), `heading` (current heading in degrees). For example, to spiral inward until you're close to the centre:

```text
seth 0
repeat 200 [
  fd 1.5
  rt 10
  if distance(0, 0) < 2 [ stop ]
]
```

> **A classic-syntax trap.** Multi-argument prefix calls parse each argument as a _full expression_, so a trailing operator gets absorbed into the last argument: `distance 0 0 < 47` actually means `distance 0 (0 < 47)`. Parenthesise when you mean the comparison — `(distance 0 0) < 47` — or use call parens, where it can't happen: `distance(0, 0) < 47`. When in doubt, use the parentheses.

---

## 8. Control flow in depth

You've met `repeat`. Here's the full set.

**`while`** loops as long as a condition is true:

```text
let r = 2
while r < 40 [
  arc 360 r
  r += 4
]
```

**`for`** is a counted loop, inclusive of the upper bound:

```text
for i = 1 to 6 [
  arc 360 i * 4
]
```

The step defaults to 1; add `step` for anything else, including negatives:

```text
for i = 10 to 1 step -2 [ fd i rt 36 ]
```

Note that `to` and `step` naturally end the preceding expression, so `for i = 1 to n * 2 [ … ]` needs no parentheses. (`step` is a reserved word — don't name a variable `step`.)

**`for … in`** iterates the elements of a list (covered in [section 12](#12-lists)):

```text
for p in path [ setpos(p) ]
```

The loop variable doesn't leak after any `for` loop ends.

### Conditionals

`if` runs a block when its condition is non-zero. Chain alternatives with `else if` and `else`:

```text
for i = 1 to 12 [
  if i % 3 == 0 [
    color 2
  ] else if i % 2 == 0 [
    color 3
  ] else [
    color 1
  ]
  fd 8 rt 30
]
```

### Leaving loops early

Four control-transfer words, from the smallest jump to the largest:

| Word                    | Leaves                                | Notes                                                |
| ----------------------- | ------------------------------------- | ---------------------------------------------------- |
| `continue`              | the current iteration                 | innermost loop only; the loop then advances normally |
| `break`                 | the innermost loop                    | outer loops keep running                             |
| `exit` / bare `return`  | the current procedure                 | unwinds any loops inside it                          |
| `output e` / `return e` | the current procedure, _with a value_ | for reporters                                        |

`break` and `continue` work in every loop form and through any nesting of `if`/`else`. With `true` as a literal, the idiomatic search loop is `while true [ … if found [ break ] ]`. A common embroidery pattern — walk until you leave a region:

```text
repeat 30 [
  seth(snoise2(xcor / 11, ycor / 11) * 360)
  fd 1.5
  if !inpath(pos(), cell) [ break ]
]
```

One important rule: `break` and `continue` are **lexical**, checked when your program is parsed. They must sit physically inside a loop body in the _same_ procedure. A `break` inside a helper procedure can't end a loop in the procedure that called it — for that, use `return`/`exit` to leave the helper.

---

## 9. Procedures and reporters

When a chunk of drawing logic recurs, name it. A procedure is defined with `def`:

```text
def leaf(size) [
  repeat 2 [
    repeat 30 [ fd size rt 3 ]
    rt 90
  ]
]

repeat 8 [ leaf(1.2) rt 45 ]
```

`leaf` traces a lens shape (two arcs meeting at points); the program sews eight of them in a rosette. Parameters like `size` are local to the procedure and read as plain names.

Useful facts about procedures:

- You can **call them before they're defined** in the source — signatures are pre-scanned.
- **Recursion works**, with a depth limit of 200 calls.
- `return` (classic: `exit`) leaves immediately.
- Names can't collide: you can't shadow a built-in word, a procedure and a variable can't share a name, and parameters can't reuse a procedure or built-in name. The errors are loud and early.

### Reporters: procedures that return a value

Add `return expr` (classic: `output expr`, alias `op`) and your procedure becomes a **reporter** — usable anywhere an expression is expected:

```text
def spiral_r(i) [
  return 2 * pow(1.1, i)
]

for i = 1 to 40 [ fd spiral_r(i) rt 25 ]
```

Reporters can recurse, which lets you write genuinely mathematical helpers:

```text
def fact(n) [
  if n < 2 [ return 1 ]
  return n * fact(n - 1)
]
```

A procedure used as a value _must_ actually reach a `return`/`output`, or you get a friendly error. And `return`/`output`/`exit` are only valid inside a procedure.

### Local scope in practice

Inside a procedure, `let` (or classic `local`) declares a local; bare assignment updates an existing local if one is in scope, otherwise it writes a global. This keeps helpers from stomping on your globals:

```text
def wobble(len) [
  let pace = len / 10
  pace *= 2              // updates the local, not any global
  repeat 10 [ fd pace rt random(10) - 5 ]
]
```

---

## 10. The two dialects, and call syntax

NeedleScript has two dialects that **mix freely in the same program** and compile to identical stitches:

- **Modern syntax** — `let x = 5`, `setxy(a, b)`, `def leaf(size) [ … ]`, `return`, `for i = 1 to 10`, `else if`, `%`, `!`, `==`, `true`/`false`, `//` comments.
- **Classic Logo syntax** — `make "x 5`, `setxy :a :b`, `to leaf :size … end`, `output`, `for "i 1 10 1`, `;` comments. This remains valid forever.

You don't have to choose. The intended idiom is a _mix_: classic prefix words where they read well (`fd 10 rt 90`, `up … down`), and call parentheses wherever expressions nest.

### The one rule of call syntax

Any function, command, or procedure can be called with parentheses and commas — **when the `(` is glued directly to the name, with no space:**

```text
fd(10)                          // call: fd with one argument
fd (10)                         // classic: fd, with grouped expression (10) — same result here
setxy(random(20), random 20)    // styles mix freely in argument slots
xcor()                          // zero-argument call
min(3, 4)   ·   min 3 4         // identical
```

That single space is the _entire_ rule: glued `(` means argument list, spaced `(` means Logo grouping. Because of it, every classic program keeps its original meaning.

### Why parentheses pay off

Classic prefix calls have two parsing rules you must hold in your head: multi-argument words absorb a trailing operator into the last argument, while single-argument functions bind tightly. So `random 64 - 32` is `(random 64) - 32`, but `distance 0 0 < 47` is `distance 0 (0 < 47)`. Call parens give every callable _one_ rule:

```text
bloom clamp 2.5 + random 3 2.5 5 :kind          ; classic — correct, but you must count arities to read it
bloom(clamp(2.5 + random(3), 2.5, 5), kind)     // modern — the parens are the structure
```

For anything beyond a simple `fd 10 rt 90`, the parenthesised form is far easier to read and to get right.

---

## 11. Randomness and determinism

Generative work needs randomness, but embroidery needs _reproducibility_ — what you previewed must be exactly what the machine sews. NeedleScript resolves this: **every run is deterministic.** `random`, `gauss`, `noise`, `snoise2/3`, `pick`, `shuffle`, and `scatter` are all driven by a seed (default 42). Reseed at the top of your program:

```text
seed 7
```

The same seed always reproduces the same design; change the seed, change the piece.

The simplest source of variation is `random n`, returning a reproducible number in `0…n`:

```text
seed 3
repeat 20 [
  moveto random(60) - 30, random(60) - 30
  circle random(4) + 1
  trim
]
```

That scatters twenty small circles of random size and position — but the _same_ twenty every time you run it.

### The fork convention (why your edits stay local)

There's a subtle property that matters when you tweak a design. Random draws follow a **fork convention** so that editing one part doesn't reshuffle everything downstream:

- **Fixed-cost functions draw from the main stream:** `random` costs 1 draw, `pick` 1, `gauss` 2.
- **Variable-cost generators fork:** `scatter` and `shuffle` draw exactly **one** value from the main stream and use it to seed a private child RNG for all their internal work. (`voronoi` and `relax` draw nothing.)

The practical result: inserting a `scatter(6)` shifts a later `random(10)` by exactly one draw — the same as inserting a single `random`. You can add a generator near the top of a program without scrambling the random choices further down. Draw costs are part of each function's contract and are pinned by the test suite, as are the exact output values per seed.

---

## 12. Lists

Numbers describe single quantities; **lists** describe collections. A list is an ordered, nestable, ragged sequence of numbers (and other lists). By convention a point is `[x, y]`, a path is a list of points, and a palette is a list of thread numbers. Lists live entirely in your program — they never reach the stitch stream.

```text
let palette = [2, 3, 5, 7]      // a literal; nesting and trailing commas are fine
let path = []                   // empty list

print palette[0]                // 2  — indexing is 0-based
print palette[-1]               // 7  — negatives count from the end
palette[1] = 4                  // index assignment (+= -= *= /= work here too)
let [x, y] = pos()              // destructuring (fixed arity, flat)

for p in path [                 // iterate elements
  setpos(p)
]
```

### Reference semantics

Lists behave like Python's or JavaScript's: assignment **shares** the list, so mutating through one alias is visible through all of them. Use `copy` for an independent deep copy:

```text
let a = [1, 2, 3]
let b = a            // same list
b[0] = 9
print a              // [9, 2, 3]  — a sees the change
let c = copy(a)      // deep copy — c is independent
```

### The `[` rule

Brackets serve double duty (blocks _and_ list literals), so position decides the meaning:

- After a header followed by a space (`repeat 4 [ … ]`), or glued to a number or `:var` (`repeat 4[…]`), a `[` is a **block**. Classic programs are untouched.
- At the start of an expression, `[` is a **list literal**.
- Glued to a bare name, `)`, or `]`, it's an **index**: `xs[0]`, `pos()[1]`, `grid[i][j]`.

The one sharp edge: `repeat n[ fd 10 ]` with a modern bare name reads as _indexing_ `n`. The error message will tell you to add the space.

### Loud over convenient

Mistakes that other languages quietly tolerate are errors here, because a wrong index in embroidery is a wrong stitch: a non-integer or out-of-range index, a list used in a condition (`if xs [ … ]` → "use `len(xs) > 0`"), a list in arithmetic (`[1, 2] + 1`), or a list handed to a scalar command (`fd [1, 2]`). Each error names the operation and the line. The one exception is equality: `=`/`==` compare lists _deeply_ (with the usual tolerance), and a number never equals a list — that's simply `0`, not an error.

### List functions

All list functions are **call-syntax only** — `len(xs)`, never `len xs`. The full toolkit:

| Function                                           | Returns / effect                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `range(n)` · `range(a, b)` · `range(a, b, s)`      | `[0…n-1]` / `[a…b-1]` / stepped — 0-based, end-exclusive                                |
| `filled(n, v)`                                     | a list of _n_ deep copies of _v_                                                        |
| `len(xs)` · `islist(v)`                            | element count · `1`/`0`                                                                 |
| `first(xs)` · `last(xs)`                           | `xs[0]` · `xs[-1]`                                                                      |
| `append(xs, v)` · `prepend(xs, v)`                 | **mutate**: add at end / front                                                          |
| `insertat(xs, i, v)` · `removeat(xs, i)`           | **mutate**: insert at _i_ / remove _i_ (and return it)                                  |
| `concat(a, b)`                                     | new list (shallow — elements shared)                                                    |
| `slice(xs, a)` · `slice(xs, a, b)`                 | new list, Python semantics, negatives allowed                                           |
| `reverse(xs)` · `sort(xs)`                         | **new** lists (pure, so they compose); `sort` is numbers-only, ascending, stable        |
| `copy(xs)`                                         | deep copy                                                                               |
| `indexof(xs, v)` · `contains(xs, v)`               | first index (deep compare) or −1 · `1`/`0`                                              |
| `sum(xs)` · `mean(xs)` · `minof(xs)` · `maxof(xs)` | aggregates; `sum([])` is 0, the others error on empty                                   |
| `pick(xs)`                                         | random element — seeded, 1 draw                                                         |
| `shuffle(xs)`                                      | new shuffled list — seeded, forks (see above)                                           |
| `pos()` · `setpos(p)`                              | the needle's position as `[x, y]` · move there (`setpos` makes record/replay symmetric) |

> **`push`/`pop` are taken** — they save and restore the _turtle state_ (section 4), not lists. To grow a list, use `append(xs, v)`.

Here's a list-driven palette cycle:

```text
let palette = [1, 2, 3, 4]
for i = 0 to 11 [
  color palette[i % len(palette)]
  fd 8 rt 30
]
```

---

## 13. Generative math: scalars, noise, vectors

Lists make data representable; the generative-math builtins make it _generatable_. Three conventions, stated once and used everywhere: **a point is `[x, y]`, a path is a list of points, a region is a closed path** (the closing segment is implicit). Every function speaks that vocabulary, so the output of one feeds the input of the next. These are all **call-syntax only.**

### Scalar shaping

| Function                             | Returns                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| `lerp(a, b, t)`                      | `a + (b − a)·t`, with _t_ unclamped                      |
| `remap(v, inlo, inhi, outlo, outhi)` | linear remap, unclamped                                  |
| `clamp(v, lo, hi)`                   | `min(hi, max(lo, v))`                                    |
| `smoothstep(e0, e1, x)`              | a Hermite ease from 0 to 1                               |
| `gauss(mu, sigma)`                   | seeded normal distribution (Box-Muller, exactly 2 draws) |

### Noise — the heart of organic design

Noise gives you smooth, continuous randomness — perfect for natural-looking drift, where nearby points have similar values.

| Function                             | Returns                                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snoise2(x, y)` · `snoise3(x, y, z)` | seeded simplex noise in **−1…1**. (Legacy `noise`/`noise2` return 0…1.) The _z_ axis is for **variation, not space** — `snoise3(x/14, y/14, motif * 50)` gives each motif its own field |
| `fbm2(x, y, octaves)`                | fractal sum of `snoise2` — lacunarity 2.0, gain 0.5, octaves 1–8, normalised to ≈ −1…1                                                                                                  |

The key technique is to **sample noise slowly**: divide your coordinates by 10–20 before feeding them in, so the field changes gradually as the turtle moves. The README's opening example does exactly this — strands drift through a noise field, each step turning to face a heading read from the noise at its current position:

```text
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

Fourteen strands start at random points and flow along the same underlying noise field, producing the coherent, wind-blown look you can't easily draw by hand.

### Vectors (points)

One angle rule governs everything here: **headings use turtle degrees** (0 = north, clockwise positive), matching `seth`, `atan`, and `towards`.

| Function                                 | Returns                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `vadd(a, b)` · `vsub(a, b)`              | a new point                                                               |
| `vscale(a, s)` · `vlerp(a, b, t)`        | a new point                                                               |
| `vdot(a, b)` · `vlen(a)` · `vdist(a, b)` | a number                                                                  |
| `vnorm(a)`                               | the unit vector (the zero vector is an **error**, never a silent `[0,0]`) |
| `vrot(a, deg)`                           | rotated **clockwise** for positive deg (matches `rt`)                     |
| `vheading(a)`                            | the turtle heading of a vector (≡ `atan a[0] a[1]`)                       |
| `vfromheading(deg, len)`                 | the inverse — `vfromheading(heading, 1)` is the needle's direction        |

> **There is no operator broadcasting.** `[1, 2] + [3, 4]` is a loud error (with a hint to use `vadd` for element-wise, or `concat` to join). This is deliberate and audience-specific: in Python that expression means _concatenation_, and silently giving it vector semantics would be a bug that sews before anyone notices.

### Segments

You already know how to measure point-to-point distance (`vdist`) and test whether a point is inside a region (`inpath`). Three more functions fill the remaining gap: measuring a point against a **segment**, finding where two **segments** cross, and finding the nearest point on a **path**.

| Function                   | Returns                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segisect(a0, a1, b0, b1)` | the intersection point `[x, y]` of segment `a0→a1` and `b0→b1`, or `[]` if they don't cross. This is a **segment** test, not an infinite-line test — the rails must actually touch each other |
| `segdist(p, a, b)`         | shortest distance from point `p` to segment `a→b`. If the perpendicular foot falls outside the segment, you get the distance to the nearer endpoint                                           |
| `nearestonpath(p, path)`   | the closest point to `p` lying anywhere on `path` (vertices _or_ along its segments), as `[x, y]`. The path is open — no implicit closing segment. O(len(path)) per call                      |

`segisect` returns `[]` (not an error) when segments don't meet — because _not intersecting_ is a perfectly ordinary outcome for two arbitrary segments, not a malformed input. `nearestonpath` always returns a point for a non-empty path; an empty path is a loud error (a program bug, not a normal "no result").

Here's a practical use: snapping a free point onto the nearest spot on a guide path, then stitching a line from the point to that snap target:

```text
let guide = [[-30, -20], [0, 30], [30, -20]]   // a V-shaped guide
let p = [20, 10]                                 // some free point

let snap = nearestonpath(p, guide)               // closest point on the guide
let d = segdist(p, guide[0], guide[1])           // distance to first segment

up  setpos(p)  down  setpos(snap)                // stitch from point to snap
```

The first call finds where on the polyline `p` is closest; the second measures the gap to a specific segment. They compose naturally with the rest of the vector vocabulary — `segdist` returns a number you can feed to `clamp`, comparisons, or `coverat`-style thresholds.

---

## 14. Paths and curves

Once you can build lists of points, you can treat them as paths and curves, then convert them into evenly-spaced stitches.

| Function                        | Returns                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pathlen(path)`                 | total polyline length                                                                                                                                                       |
| `resample(path, mm)`            | a new path whose segments are each exactly _mm_ long (last may be shorter; first and last preserved) — **the bridge between math-space curves and physical stitch spacing** |
| `chaikin(path, n)`              | corner-cutting smoothing, _n_ iterations (1–6)                                                                                                                              |
| `catmull(points, mm)`           | a Catmull-Rom spline through the control points, resampled                                                                                                                  |
| `bezier(p0, c0, c1, p1, mm)`    | a cubic Bézier, resampled                                                                                                                                                   |
| `centroid(path)` · `bbox(path)` | the centroid point · `[minx, miny, maxx, maxy]`                                                                                                                             |
| `sewpath(path)`                 | **command**: exactly `for p in path [ setpos(p) ]` — pen state, stitch mode, satin, and auto-split all apply as if you'd walked it by hand                                  |

The pattern is: _build a smooth curve in math space, resample it to your stitch length, then sew it._ For example, a smooth wave through five control points:

```text
let pts = [[-40, 0], [-20, 18], [0, -18], [20, 18], [40, 0]]
let curve = catmull(pts, 2)     // spline, resampled to 2 mm segments
down
sewpath(curve)
```

Because `sewpath` honours the current stitch mode, switching `satin 3` on beforehand turns that same wave into a flowing satin ribbon.

---

## 15. Generators: scatter, Voronoi, hull

These functions _generate_ point sets and regions — the raw material of generative tessellation and stippling. All are seeded (see [section 11](#11-randomness-and-determinism)).

| Function                                        | Returns                                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `scatter(mindist)` · `scatter(mindist, region)` | Poisson-disc (Bridson) points — no two closer than _mindist_ — over the sewable field, or inside a region. Capped at 20,000 points |
| `voronoi(points)` · `voronoi(points, region)`   | one Voronoi cell (a region) per input point, **in input order**, clipped to the sewable disc or a given region                     |
| `triangulate(points)`                           | Delaunay triangles, as a list of 3-point regions                                                                                   |
| `hull(points)`                                  | the convex hull as a region, counter-clockwise                                                                                     |
| `relax(points, n)`                              | _n_ rounds of Lloyd's relaxation — each point moves to its Voronoi cell's centroid, evening out spacing for stippling              |

The canonical pipeline is `scatter → voronoi → offsetpath → resample → sewpath`. Here's a cracked-tile / stained-glass effect:

```text
seed 4
let tiles = voronoi(scatter(9))          // Poisson-disc points → Voronoi cells
for cell in tiles [
  for ring in offsetpath(cell, -0.9) [   // inset each cell (it may vanish — the loop just skips)
    sewpath(resample(ring, 2.2))         // even 2.2 mm stitches around the ring
  ]
  trim
]
```

`scatter(9)` lays down well-spaced seed points; `voronoi` turns them into interlocking cells; insetting each cell by 0.9 mm leaves a gap between tiles; resampling makes the stitches uniform. (The bundled **shatter** example extends this with flow-field hatching inside each tile.)

For organic stippling, run `relax` on your scattered points first — a few rounds of Lloyd's relaxation removes clumps and gives the even, hand-stippled look.

---

## 16. Geometry: offsets and booleans

For precise shape manipulation, NeedleScript wraps the Clipper2 library on integer micro-coordinates, so results are exact and platform-stable.

| Function                 | Returns                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offsetpath(region, mm)` | a **list** of regions — positive inflates, negative shrinks. Shrinking may split a shape into several, or into **none** (an empty list, not an error — loops over it simply do nothing). Round joins |
| `clippaths(a, b, "op)`   | a boolean of two regions; _op_ ∈ `"union` `"intersect` `"difference` `"xor`; returns a **list** of regions                                                                                           |
| `inpath(p, region)`      | `1`/`0` by the even-odd rule (consistent with fills)                                                                                                                                                 |

Two things to internalise. First, `offsetpath` and `clippaths` always return _lists_ of regions, because these operations can produce multiple pieces (or zero) — so you iterate the result:

```text
let shrunk = offsetpath(myShape, -2)
for ring in shrunk [
  beginfill
    sewpath(ring)
  endfill
]
```

Second, `inpath` is your tool for "is this point inside?" tests — exactly what the noise-walk example in [section 8](#8-control-flow-in-depth) used to stop a strand at the edge of a Voronoi cell (`if !inpath(pos(), cell) [ break ]`).

Combine these with the generators and you can do things like: scatter points, build a hull, inset it for a border, and subtract an inner shape — all parametrically.

---

## 17. Transforms: stamping motifs

You often want the _same_ motif in many places — rotated, scaled, mirrored — without rewriting it each time. That is exactly what transforms give you: a command takes its arguments **then a block**, applies a coordinate transform to whatever that block draws, and restores the previous frame afterwards. It is the same stack discipline you already know from `push`/`pop`, but operating on a 2-D coordinate frame instead of the turtle pose.

Draw a motif once, in its own local frame:

```text
def leaf() [
  satin 1.6
  repeat 2 [ repeat 18 [ fd 0.9 rt 5 ] rt 90 ]
  satin 0
]
```

Then stamp it. Transforms nest inside-out, just like in OpenSCAD — read the innermost first:

```text
repeat 4 [
  rotate repcount * 90 [        // aim this copy
    translate 20 0 [            // push it out
      scale 0.8 [ leaf() ]      // shrink it
    ]
  ]
]
```

The full vocabulary: `translate dx dy`, `rotate deg`, `rotateabout deg cx cy`, `scale s`, `scalexy sx sy`, `mirror deg`, `skew ax ay`, and the raw escape hatch `transform a b c d e f`. Both spellings work — `translate 20 0 [ … ]` and `translate(20, 0) [ … ]` are the same command.

### The turtle doesn't know it's been transformed

This is the rule that keeps transforms predictable. **Inside a transform block the turtle still lives in plain local coordinates** — `xcor`, `ycor`, `distance`, `pos()` all report pre-transform values, and only the _emitted stitches_ are mapped to the hoop. So a guard like `if distance(0, 0) > 44 [ return ]` behaves the same whether or not a transform wraps it, and a motif that uses `random` draws the _same_ numbers no matter where you stamp it. Wrapping a motif in a transform never reshuffles anything downstream — the determinism promise holds. The history queries (`coverat` and friends) follow the same rule: you pass local points and the engine maps them through the transform, so `coverat(pos())` reads the right patch of fabric in any frame.

### Transforms sew like real embroidery, not stretched geometry

A transform maps the turtle's _path_; stitch-length splitting, satin width and the physics layer are all applied **afterwards, in hoop space**. So `scale 3 [ fd 30 ]` sews nine tidy 2.5 mm stitches across 90 mm — not three 7.5 mm stitches stretched thin. Satin width follows the transform perpendicular to travel (under `scalexy 2 1`, a north-running column widens and an east-running one doesn't), and `pullcomp` — a real-millimetre fabric constant — is never scaled.

### Transforming data, not just drawing

Because NeedleScript has first-class point lists, every block transform has a pure-function twin that returns a new path: `xlate`, `xrotate`, `xscale`, `xmirror`. They compose with the generative-math layer, so you can transform `scatter`/`voronoi` output directly:

```text
seed 4
let cell  = first(voronoi(scatter(9)))
let motif = resample(cell, 2.2)
repeat 6 [
  sewpath(xrotate(motif, repcount * 60))   // six rotated copies of one cell
  trim
]
```

`translate dx dy [ block ]` is just sugar for "run `block`, but pass every emitted point through `xlate`" — the two forms share one matrix library, so they produce identical stitches. (See the bundled **transforms** example for all of this in one piece.)

One caution: `scale`, `rotate`, `translate`, `mirror`, `skew`, `transform` (and friends) are **core** words now — you can't use them as variable names, and the editor will tell you loudly if you try.

---

## 18. Effects: warp, humanize, snaptogrid

Transforms are the _linear_ case of a bigger idea. A transform maps every emitted point through a fixed matrix; an **effect** maps it through an arbitrary function. Effects sit on the same block-scoped stack and nest freely with transforms — same discipline, but nonlinear and, in two cases, stochastic. They all read as "run this block, but pass the emitted points through _this_ map."

```text
scale 1.5 [
  warp @ripple [
    humanize 0.25 [
      leaf()
    ]
  ]
]
```

Inside-out: draw the leaf, humanize its penetrations, ripple the result, scale that. The one thing to internalise is **where in the pipeline each effect runs**, because it changes what they do:

| Effect            | What it is                       | Runs…                                                                                    |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `warp @fn`        | a geometric deformation (shader) | **before** stitch splitting — it bends the path, which is then split into clean stitches |
| `humanize amount` | hand-stitched jitter             | **after** splitting — it nudges the final needle points                                  |
| `snaptogrid …`    | grid quantizing                  | **after** splitting — it snaps the final needle points to a lattice                      |

`warp` bends the _curve_ and lets the splitter make tidy physical stitches along it; `humanize`/`snaptogrid` perturb _individual penetrations_ (jittering or snapping the path before splitting would resample the irregularity away, or interpolate stitches back off the grid).

### `warp @fn` — the shader, and the `@name` reference

`warp` takes a **procedure reference** — a procedure you write that takes a point `[x, y]` and returns a new point — and runs it on every emitted point:

```text
def push_out(p) [
  let d = vlen(p)
  return vscale(vnorm(p), d + 2 * snoise2(p[0] / 14, p[1] / 14))
]

warp @push_out [
  repeat 6 [ fd 30 rt 60 ]
]
```

The `@name` syntax is new: it's a reference to a reporter, the one new kind of value effects add. You feed it to `warp` (or to `warppath`), to `satin` for a programmable column, or to `fill` for a directional/textured fill (both §20); using it anywhere else is a loud error, and so is a reporter that takes the wrong number of arguments or forgets to `return`. A fisheye, a twist, a ripple, a domain-warp are all just reporters — this is your shader.

`warp` hands control to your code, which can push points off the hoop or stretch segments into long loose stitches — so the hoop, density and long-stitch checks all run on the **warped** result, surfacing trouble as warnings rather than a ruined garment. `warp` itself draws no randomness; it's seeded only if your reporter calls `random`/`snoise2`.

### `humanize amount` — making it look hand-made

```text
humanize 0.3 [ repeat 4 [ fd 20 rt 90 ] ]
```

`humanize` offsets each penetration by a small amount (in mm, 0–2). The craft is in _how_: it uses **coherent** seeded noise (slow `snoise2` at each point), so neighbouring stitches drift together like a real hand — not independent per-stitch jitter, which reads as damage. And it **forks**, drawing exactly one value from the seeded stream (§11), so dropping a `humanize` block shifts everything downstream by one draw, never by however many stitches were inside. Re-running with the same seed reproduces the same imperfections.

### `snaptogrid …` — the cross-stitch grid

```text
snaptogrid 2 [ repeat 4 [ fd 20 rt 90 ] ]
```

`snaptogrid` snaps each penetration to a lattice. Its special trick is **frame-invariance**: a grid belongs to the fabric, not the motif, so the lattice is fixed in hoop space **outside** any enclosing transform. Stamp the same motif at four places with `translate` and all four snap to the _same_ lattice — they register across the whole piece. `scale 2 [ snaptogrid 1 [ … ] ]` does **not** make a 2 mm grid; the lattice stays 1 mm and the scaled motif simply lands on different nodes. It overloads by arity for rectangular, offset and rotated grids (`snaptogrid cellx celly ox oy ang [ … ]`), is pure and drawless (its result doesn't even depend on the seed), and merges any penetrations a coarse grid collapses onto one node (with the usual tiny-stitch warning). Like `humanize`, it leaves satin columns alone — quantizing a satin rail wrecks the column — and warns once if it finds one.

### Effects on data, not just drawing

Each effect has a pure-function twin, exactly like the transforms: `warppath(path, @fn)`, `humanizepath(path, amount)`, `snappath(path, cell …)`. The block form is sugar for "run the block, mapping emitted points through the same function," so the two are interchangeable on path data:

```text
let coast = humanizepath(resample(cell, 2.0), 0.3)   // a hand-drawn coastline
sewpath(coast)

let pixels = snappath(scatter(8), 2)                 // Poisson dots on a 2 mm grid
```

`warp`, `humanize`, `snaptogrid` (and `@name`) are **core** words — they can't be redefined. (See the bundled **warp**, **humanize** and **snaptogrid** examples.)

---

## 19. Professional embroidery and fabric physics

Geometry that looks right on screen doesn't automatically _sew_ right. Thread tension pulls fabric inward, stitches sink into the material, tight curves crowd the needle, and layered stitching becomes a stiff, puckered patch. The following commands compensate for the physics. They are **opt-in** — without them, your program sews exactly as written.

### The fast path: fabric presets

The quickest route is to declare your fabric, which sets sensible defaults for everything below:

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

Any explicit command after `fabric` overrides that part of the preset.

### Pull compensation — `pullcomp mm`

Thread tension shrinks stitching along the stitch axis — a 4 mm satin column actually sews about 3.6 mm wide. `pullcomp` (0–1.5 mm) widens satin columns and extends every fill row at both ends, so shapes finish at their digitized size and borders actually meet their fills.

### Underlay — `underlay`, `fillunderlay`

Underlay is stabilising stitching sewn automatically _underneath_ the visible layer — the single biggest difference between hobby and professional digitizing. It anchors the fabric to the backing, stops it shifting, and lifts the top stitching out of the material. It's sewn in correct machine order (before the top layer), shown thinner and lighter in the preview, and identical to normal stitches in exports.

| Command              | Modes                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `underlay "auto`     | for satin: `"center` (a spine, out and back), `"edge` (runs offset to ±30% width), `"zigzag` (open zigzag at 60% width plus a return run), `"off`. `"auto` picks by width — under 1.5 mm none, under 4 mm center, wider gets zigzag |
| `fillunderlay "auto` | for fills: `"tatami` (sparse cross-grain pass), `"edge` (a run tracing the boundary), `"off`. `"auto` = tatami, plus the edge run on areas over 100 mm²                                                                             |

A satin column is buffered while you draw it and sewn — underlay first, then the zigzag — when it ends (a pen up, mode change, colour change, trim, fill, or end of program). The turtle's position and heading are unaffected.

### Short stitches on curves — `shortstitch 0/1`

On a tight satin curve the inner edge gets the same number of penetrations as the outer edge in a fraction of the space — they bunch up, break thread, and chew the fabric. NeedleScript detects local curvature and pulls **alternate inner-edge stitches in to 60% width**. It's on by default; `shortstitch 0` disables it. If a column is wider than the curve's radius you'll get a warning — that geometry can't sew cleanly at any setting.

### Local density — `maxdensity n` plus the heatmap

The physical quantity that matters most is **thread coverage**: millimetres of thread per mm² of fabric, expressed in _layers_ (one layer is a clean satin column or tatami fill). Past about 2.5–3.5 layers, depending on fabric, embroidery stops behaving like fabric — needles deflect, thread breaks, the patch puckers. Every run computes a 1 mm coverage grid (deliberate tie-off micro-stitches are excluded so thread ends don't read as false hotspots). Hotspots above the limit produce warnings **with coordinates and the source lines that caused them**, and repeated penetrations in the same hole are flagged separately.

The stage has a heatmap toggle (orange from about 1.2 layers, red from 3), and the stats row shows the peak. `maxdensity n` tunes the threshold (default 3.5); `maxdensity 0` silences it. Some constructions legitimately run hot — a satin border over a fill edge measures about 4 layers — and the right move is to raise the limit _knowingly_, as the bundled **patch** example does.

### Automatic trims — `autotrim mm`

Travels of 7 mm or more (configurable 3–30; `autotrim 0` off) automatically get a `trim` before the jump, so connector threads don't dangle and snag on the garment. A trim is never inserted when nothing has been sewn since the last cut.

---

## 20. Programmable satin, fills, and closed-loop generation

The professional layer in §19 _shapes_ the built-in stitches. The three features here go further: they let you replace the stitch generators themselves with your own reporters, and even read the fabric back as you sew. This is the most advanced corner of NeedleScript — and it reuses machinery you already know: the `@name` procedure references from [§18](#18-effects-warp-humanize-snaptogrid), and the coverage grid from [§19](#19-professional-embroidery-and-fabric-physics).

### Programmable satin — `satin @fn`

The built-in `satin` gives you one column shape: a centred zigzag of a fixed width. Sometimes you want a _different_ column entirely — a leaf that tapers to nothing at both tips, a woven cross-hatch, a column that's fatter on one side. Hand `satin` a **procedure reference** (the same `@name` value `warp` takes, from §18) instead of a width, and your reporter draws the column:

```text
def leaf(t, s, i, u) [
  let w = sin(s * 180) * 2.2          // 0 at both tips, 2.2 mm in the middle
  return [0.45, w, w, 0, 0]
]
satin @leaf
fd 40
satin 0                               // a number (or 0) disengages, flushing the column
```

The reporter is asked, once per stitch pair as the engine walks the spine, for five numbers: `[advance, leftw, rightw, leftlag, rightlag]`, all in mm. `advance` is how far to step the cursor forward before the next pair — dynamic density, and the one value that **must be positive** (it's the guarantee the walk ends). `leftw`/`rightw` are the two rails' half-widths (so `leftw ≠ rightw` gives an asymmetric column for free). `leftlag`/`rightlag` slide each rail endpoint forward (+) or back (−) along the spine before the width is applied.

Three **satin-tuple helpers** (library tier, call-syntax only) build that list by intent rather than by memorising the five slots:

| Helper                              | Expands to                                                      |
| ----------------------------------- | --------------------------------------------------------------- |
| `satinpair(advance, width)`         | `[advance, width, width, 0, 0]` — the common perpendicular bite |
| `satinasym(advance, leftw, rightw)` | `[advance, leftw, rightw, 0, 0]` — asymmetric column            |
| `satinrake(advance, width, lag)`    | `[advance, width, width, -lag, lag]` — diagonal rake            |

So the leaf above can be written as:

```text
def leaf(t, s, i, u) [
  return satinpair(0.45, sin(s * 180) * 2.2)
]
```

It's told where it is: `t` is the cursor's arc-length in real mm (so spatial patterns don't rescale with column length), `s` the same position normalized 0..1 (handy for tapers and tips, because the whole column is buffered before it sews), `i` the 0-based pair index, and `u` the local heading. Returning the constant `satinpair(0.4, 2)` is _exactly_ `satin 4`. The interesting part is the two lags: give them opposite signs and the stitch rakes into a diagonal; flip that rake every other pair with `i`, and successive diagonals **cross each other** — woven satin — yet the cursor still only ever moves forward:

```text
def crosshatch(t, s, i, u) [
  if mod(i, 2) == 0 [ return satinrake(0.4, 2,  0.8) ]   // "/"
  return satinrake(0.4, 2, -0.8)                          // "\", so they cross
]
maxdensity 5                          // crossings stack thread — allow it knowingly
satin @crosshatch
fd 40
satin 0
```

Because `satin @fn` **is** the generator — not an after-split effect — it sits upstream of the whole physics layer. The reporter works in spine-local space and the engine maps its output to the hoop afterward, so a custom column composes with transforms and `warp` exactly like the built-in one (`scale 1.5` sews 1.5× the extent at physical spacing, not stretched stitches), and `pullcomp`, `underlay`, the snag check and the density heatmap all still apply. Like `warp`, the generator draws no randomness of its own — it's reproducible unless your reporter calls `random`/`snoise2`. A reporter that may finish without returning a value on some control-flow path is caught at **parse time**, not at runtime — you'll see the error immediately and can add the missing `else` branch before waiting for an unlucky seed. A reporter with the wrong number of parameters, or one that doesn't return five numbers, is a separate, line-numbered error. (See the bundled **custom satin** example.)

### Programmable fills — `fill @fn`

`satin @fn` lets you draw a column; `fill @fn` lets you drive a _fill_. It arms the **next** `beginfill … endfill` with up to two reporters — a **direction field** and a **stitch shaper** — and the engine does the hard part: placing rows that follow your field while keeping them an even distance apart, clipping to holes, and running the whole physics pipeline. The marquee result is the **directional fill**, where the rows curve to follow the work instead of running in straight parallel lines:

```text
def contour(p) [
  return vheading(vrot(p, 90))   // a heading that circles the origin
]
fill dir @contour                // arm the next region
beginfill
  arc 360 30
endfill                          // the generator runs at endfill
```

A direction reporter takes the local point `p = [x, y]` and returns a single turtle heading (0 = north, clockwise). The engine threads **streamlines** through that field and lays one fill row along each. You can instead (or also) supply a _shape_ reporter for the texture:

```text
def texture(p, row, v) [
  return tatamirow(0.4, 2.5)          // exactly the built-in tatami row
]
fill shape @texture
```

**`tatamirow(spacing, len)`** (or `tatamirow(spacing, len, phase)` for an explicit brick phase) is a library helper that builds the three-slot contract list `[spacing, len, phase]`, defaulting the phase to the standard 0.5 brick offset. It's a call-syntax-only expression — just like `satinpair` for satin — so you compose by intent rather than by remembering slot order.

The shaper is told the penetration position `p`, the 0-based `row` index, and `v` (0..1 across the field), and returns three numbers: the **spacing** to the next row (mm, must be positive — it's sampled once per row, since it's the gap _between_ rows), the stitch **length** along the row (mm, 1–7), and the brick **phase** (0..1; 0.5 is standard tatami offset). Vary spacing with `v` and the rows fan apart — a graded-density fill; read `coverat(p)` and you can thin the fill where it's already covered. `fill @name` with no keyword is shorthand for the direction channel, the usual case.

The same **parse-time reporter-path check** that applies to satin reporters applies here: a fill reporter that may reach the end of its body without a `return` is rejected at compile time with a message naming the procedure and suggesting an `else` branch — so you see the bug immediately rather than waiting for a specific seed.

The engine guarantees the two things a hand-rolled fill gets wrong. **Coverage:** rows stay evenly spaced no matter how the field curves (a constant field reduces _exactly_ to built-in tatami — that's the correctness pin). **Termination:** two finite budgets — a per-streamline length cap and a finite seed budget — mean a vortex, a singularity, or a chaotic field yields a finite fill _with warnings_, never a hang. A field that converges to a point legitimately piles thread there; that's surfaced honestly on the density heatmap rather than hidden, and you re-seed or raise `maxdensity` knowingly.

Like `satin @fn`, this **is** the generator, so it composes the same way: reporters see local space and the engine maps through the transform afterward (a directional fill under `scale 1.5` covers 1.5× the area at physical spacing; the field rotates with the work under `rotate`), `pullcomp`/`fillunderlay`/`humanize`/the density grid all still apply, and the generator draws no randomness of its own — so a `snoise2` flow-field fill is fully reproducible. `fill`, `dir` and `shape` are Core words (though `dir`/`shape` are only special right after `fill`, so variables by those names still work), and a malformed reporter is a loud, line-numbered error. (See the bundled **custom fill** example.)

### Reading coverage back — stitch-history queries

Everything above _writes_ coverage. You can also _read_ it mid-program and branch on it — the step from open-loop to closed-loop generation. Five **pure reporters** expose the very grid the heatmap draws:

| Call               | Returns                                                         |
| ------------------ | --------------------------------------------------------------- |
| `coverat(p)`       | coverage at `p` in **layers** (the heatmap / `maxdensity` unit) |
| `coverat(p, r)`    | coverage averaged over radius `r` mm — for asking about an area |
| `countat(p)`       | penetration count in the 1 mm cell at `p`                       |
| `nearestsewn(p)`   | the closest prior penetration as `[x, y]`, or `[]` if none yet  |
| `sewnwithin(p, r)` | a list of prior penetrations within `r` mm of `p`               |
| `stitchedpoints()` | a deep-copied snapshot of every penetration so far, as a path   |

The headline is `coverat`: "how full is the fabric here?", in the unit you already know. A stipple that fills toward an even target instead of clumping:

```text
seed 7
repeat 4000 [
  let p = [random(80) - 40, random(80) - 40]
  if vlen(p) < 46 and coverat(p) < 1.5 [   // only sew where it isn't full yet
    up setpos(p) down
    arc 360 0.5
    trim
  ]
]
```

Three rules keep this honest:

- **Pure and deterministic.** The queries draw _nothing_ from the random stream and emit _nothing_ — they are reads. Branching on them is still a function of `(seed, source)`, so "same seed → same design" holds. Only your own `random`/`gauss` calls ever touch the seed.
- **Committed, in sewing order.** A query sees every penetration committed _so far_ and nothing sewn later. The one catch is buffered satin: a column isn't in the grid until it flushes (pen-up, `trim`, a mode change), so check coverage _after_ the stroke, not mid-column. Tie-off locks are excluded, exactly as they are from the heatmap — so a query reports the same number the heatmap shows.
- **O(local), not O(history).** `coverat`/`countat` are single grid-cell lookups; `nearestsewn`/`sewnwithin` are backed by the same bucketing, so "what's near here" never walks all 60,000 stitches. Reach for them before scanning `stitchedpoints()`.

Coverage is a property of the **fabric**, so the grid lives in hoop space — but query points follow the usual turtle rule: you pass them in local coordinates and the engine maps them through the current transform, so `coverat(pos())` reads the right spot whether or not a transform wraps it. (Points returned by `nearestsewn`/`sewnwithin`/`stitchedpoints` come back in hoop space — they're facts about the fabric, not the motif.)

One hazard worth naming: a loop that runs _until a condition over history_ is met can run forever if the target is unreachable, and the op/stitch limits will stop it (the error now hints that a feedback loop may not be terminating). Give such a loop a hard ceiling — `repeat 5000 [ … if done [ break ] ]`, never `while not done [ … ]`. The bundled **stipple** example models this.

Because they're reporters, they compose with effects: a `warp` whose displacement reads `coverat` becomes _reactive_ — wobble more where the fabric is sparse, hold steady where it's dense:

```text
def adaptive(p) [
  let wob = clamp(2 - coverat(p), 0, 2)         // calmer where it's already dense
  return vadd(p, [snoise2(p[1] * 9, 0) * wob, snoise2(p[0] * 9, 0) * wob])
]
// warp @adaptive [ … ]
```

---

## 21. Debugging

Generative designs surprise you. These tools tell you what actually happened.

| Tool                | What it does                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `print expr`        | log a value to the console                                                                                                                                                                       |
| `print "label expr` | the same, with a label — `print "radius r` prints `radius: 1.5`                                                                                                                                  |
| `printloc`          | log the needle's current local-frame position: `loc: [12.5, -3.0]`. Under a transform the coordinates reflect the turtle's own frame — which is usually what you want when debugging motif logic |
| `printloc "label`   | the same, with a custom label — `printloc "here` prints `here: [x, y]`                                                                                                                           |
| `mark`              | drop a numbered pin on the preview at the needle's position. Pins appear as playback reaches them and are **never exported** to the machine or counted in stats                                  |
| `assert cond`       | stop with an error (and line number) if the condition is false — ideal for geometric invariants: `assert (distance 0 0) < 47`                                                                    |

Beyond commands, the playground itself is a debugger:

- The **playback scrubber** steps through the design stitch by stitch, and the **source line being sewn is highlighted in the editor** — the fastest way to answer "which line made this stitch?"
- **Did-you-mean** suggestions catch typos across every namespace: `Unknown command "stichlen" — did you mean the command "stitchlen"?`
- **Warnings** surface non-fatal issues as chips and console lines: clamped values, merged tiny stitches, unclosed fills, hoop overflow, excessive density.
- **Parse-time reporter-path check** — a reporter that might finish without reaching `return` on some control-flow path (for example, an `if` with no matching `else`) is rejected at compile time with an error that names the procedure and suggests the fix. You see the bug immediately rather than waiting for a seed that happens to hit the missing branch.

A typical use of `assert` to guard a generative loop:

```text
seed 5
repeat 50 [
  moveto random(80) - 40, random(80) - 40
  assert (distance 0 0) < 47        // catch any point that escaped the field
  circle 1.5
  trim
]
```

---

## 22. Safety limits

NeedleScript guards both your browser and your machine. Hit one of these and you'll get a clear error rather than a hang or a damaged garment:

| Limit                                                  | Value                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| Max stitches per design                                | 60,000                                                           |
| Max interpreter operations                             | 2,000,000 (catches infinite loops and runaway recursion)         |
| Max call depth                                         | 200                                                              |
| Max `repeat` / `for` iterations                        | 200,000                                                          |
| Max list length                                        | 100,000 elements                                                 |
| Max total live list cells                              | 1,000,000                                                        |
| Max list nesting depth                                 | 16                                                               |
| Max `scatter` output                                   | 20,000 points                                                    |
| Max `voronoi` / `triangulate` / `hull` / `relax` input | 10,000 points                                                    |
| Max `offsetpath` / `clippaths` input                   | 50,000 vertices per call                                         |
| Stitch length                                          | clamped to 0.4–12 mm                                             |
| Sub-0.4 mm moves                                       | merged into neighbours (too short to sew safely), with a warning |

---

## 23. Exporting and reusing your work

When a design is ready, **Download .DST** produces a standard Tajima file: 3-byte ternary delta records, moves longer than 12.1 mm split automatically, colour changes as stop records, trims as triple jumps, and a correct 512-byte header. Load it onto any machine, or into commercial software for a final check.

You can also bring artwork _in_: **Import SVG** (a button, or drag and drop) converts an SVG into _editable_ NeedleScript code. Filled shapes become `beginfill` blocks (subpaths become holes), strokes become outlines, and colours map to the nearest thread. It supports `<path>` (M L H V C S Q T A Z), rect/circle/ellipse/line/polyline/polygon, plus groups and transforms — a great way to start from a logo and then make it generative.

---

## 24. A capstone project

Let's combine what you've learned into one piece that exercises the whole pipeline: a generative seeded "meadow" of stems that grow along a noise field, each topped with a small satin leaf, all sitting on stable fabric.

```text
// --- a single leaf: a small two-arc lens in satin ---
def leaf(size) [
  satin 1.6
  repeat 2 [
    repeat 18 [ fd size rt 5 ]
    rt 90
  ]
  satin 0
]

// --- a stem that drifts upward through a noise field, then sprouts a leaf ---
def stem(steps) [
  repeat steps [
    // heading drifts gently; biased upward by starting near north
    seth (snoise2(xcor / 18, ycor / 18)) * 60
    fd 1.6
    if distance(0, 0) > 44 [ return ]   // stay inside the hoop
  ]
  leaf(0.9)
]

// --- the scene ---
fabric "woven        // sensible underlay + pull compensation
seed 11
stitchlen 2

color 1
repeat 18 [
  // start each stem somewhere along the bottom half of the field
  moveto random(70) - 35, random(30) - 38
  stem(round(random(14)) + 14)
  trim
]
```

Read it top to bottom:

- `leaf` switches to a narrow satin, traces a lens shape with two arcs, and switches satin off (which flushes the buffered column with its underlay).
- `stem` walks step by step, reading a heading from `snoise2` sampled slowly (coordinates over 18) so neighbouring stems flow coherently, and bails out with `return` if it reaches the hoop edge.
- The scene sets a fabric (so underlay and pull compensation come along for free), seeds the RNG for reproducibility, and sews eighteen stems from random low starting points, trimming the connector thread after each.

Change `seed 11` to any other number and you get a completely different — but equally coherent, and equally reproducible — meadow. That is the whole promise of NeedleScript: designs that genuinely _generate_, while sewing out exactly as previewed.

### Where to go next

- Open the bundled examples in the header dropdown — **bloom, wreath, wander, star, badge, sampler, waves, tree, fern, flow, shell, patch, meadow, echo, shatter** — and read them with the playback scrubber to see each line sew.
- The **meadow** example is the reference for idiomatic mixed-dialect style; **shatter** is the reference for the full generative-geometry pipeline; **patch** shows when to raise the density limit knowingly.
- Use the REPL below the console to nudge a running design one command at a time.

Happy stitching.

---

## 25. AI generation assistant

The REPL doubles as an AI interface. Any line starting with `/ai` is intercepted and dispatched to a language model of your choice via [OpenRouter](https://openrouter.ai), rather than being appended to the editor. The model receives the full NeedleScript language reference as its system prompt, along with your current code and any compile errors, and its output lands directly in the editor and runs.

### First-time setup

An API key from [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) is required. Free-tier credits are available. The key is stored in your browser's `localStorage` and sent directly from your browser to OpenRouter — it never passes through any server.

```text
/ai apikey sk-or-v1-…
```

Pick a model. Typing `/ai model ` shows a live-filtered list of all models on your account; use `↑`/`↓` to navigate and `Tab` to complete:

```text
/ai model claude sonnet 4.5
/ai model gemini flash
/ai model gpt-4o
```

Any model available on OpenRouter works. The chosen model and key persist across reloads.

To remove both:

```text
/ai reset
```

### Generating designs

**`/ai create <description>`** — generates a fresh design, replacing whatever is in the editor:

```text
/ai create a geometric ornament with a circular satin border and a tatami fill
/ai create a noise-field stipple that avoids the centre of the hoop
/ai create concentric hexagons with alternating fill angles
```

The generated code is compiled silently. If it fails, the AI is asked to fix the error automatically (one retry). The final result — passing or not — is placed in the editor and run so you can see it and its warnings immediately.

**`/ai improve <instruction>`** — rewrites the current code according to your instruction:

```text
/ai improve make the fills denser and add a satin border
/ai improve replace the square with a 12-pointed star
/ai improve add randomised petal sizes using seed 7
```

The current source is included in the prompt, so the model sees exactly what you see.

**`/ai fix <instruction>`** — like `improve`, but the most recent compile error is automatically included in the prompt:

```text
/ai fix                             (no instruction: just fix whatever broke)
/ai fix the satin column is too wide
/ai fix make it less dense so the warning goes away
```

Use this whenever a run produces a red error in the console.

**`/ai explain <question>`** — answers a question about the current code and prints the response to the console without changing the editor:

```text
/ai explain what does line 8 do?
/ai explain why is the density warning appearing?
/ai explain how does the fill angle interact with the satin border?
```

**Default (no subcommand)** — if the input starts with `/ai` and isn't one of the above keywords, it's treated as a description. With code in the editor it behaves like `improve`; with an empty editor it behaves like `create`:

```text
/ai add a soft humanize effect to everything
/ai make it more complex
```

### Prompting tips

The model knows the full NeedleScript language, the embroidery physics, and the safety limits — you don't need to explain them. Short, concrete descriptions work best:

- **Be specific about shape.** "A circle" → "concentric circles, radii 10 to 40 mm, step 5".
- **Mention the stitch type.** "A star" is vague; "a six-pointed star with satin spokes and a tatami centre" is actionable.
- **Name numerical targets.** "Make it less dense" is helpful; "reduce fillspacing from 0.35 to 0.55" is better.
- **Reference existing structure.** With code in the editor, `improve` already sees it — say "add a second colour for the outer ring" without re-explaining what the outer ring is.

If the first result isn't right, iterate: `/ai improve add more variation` or `/ai fix the jumps are too long`. Each command starts fresh with the current source, not a conversation history, so each attempt is independent.

### The workflow loop

The natural rhythm for new designs:

1. `/ai create a …` — get a baseline
2. Inspect the canvas and console; tweak values with the Parameters panel or the normal REPL
3. `/ai improve <what you want to change>` — push it further
4. If an error appears: `/ai fix` or `/ai fix <short description>`
5. Repeat until the design fits the hoop and the density heatmap is calm

The playback scrubber and source-line highlight still work on AI-generated code — step through it stitch by stitch to see exactly what each line produces.
