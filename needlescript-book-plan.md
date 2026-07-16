# NeedleScript — The Interactive Book

## Chapter plan for a multi-page MDX notebook tutorial

**Working title:** _NeedleScript: From First Stitch to Generative Fabric_
**Format:** Online-only interactive book. Every page is an MDX document mixing prose, runnable NeedleScript cells with live hoop previews, and purpose-built widgets. Target scope: **~55 chapters in 10 parts + 7 appendices, ≈ 550–650 book-pages equivalent**, designed to be read linearly but navigable by track.
**Source baseline:** the existing 29-section `needlescript-tutorial.md`. Everything in it is preserved; the plan below splits, reorders, and extends it (a §-to-chapter mapping is in Appendix H of this plan).

---

# 1 · The delivery system (what "interactive notebook" means here)

Before the chapters, the component vocabulary the chapters refer to. Each MDX page composes from this fixed inventory — authors never invent one-off widgets, so the book stays consistent and maintainable.

## 1.1 Core MDX components

| Component      | What it does                                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Run>`        | Editable code cell + live hoop preview (canvas). Cmd/Ctrl-Enter re-runs. "Reset" restores the authored code. Every page has at least one.                                                                                                                  |
| `<RunLocked>`  | Read-only cell with preview — for "look, don't touch yet" examples. One click forks it into an editable scratch cell.                                                                                                                                      |
| `<Scrub>`      | A `<Run>` with the playback scrubber docked: stitch-by-stitch stepping with **source-line highlight**. The book's single most important teaching device — used everywhere a temporal/order concept appears (buffered satin, fill row order, trims, locks). |
| `<Compare>`    | Two or three previews side by side, driven by the same code with one variable swapped (e.g. `stitchlen 1 / 2.5 / 5`), with an A/B slider.                                                                                                                  |
| `<Param>`      | A `<Run>` with the Parameters panel exposed: annotated `// [min:max]` variables become sliders. Teaches the customizer _and_ lets readers explore ranges without editing code.                                                                             |
| `<SeedGrid>`   | Renders one program at 6–12 seeds as a thumbnail grid; click a thumbnail to load that seed into the cell. The core "determinism + variation" widget.                                                                                                       |
| `<Heatmap>`    | Preview with the density heatmap toggled on and a layers legend.                                                                                                                                                                                           |
| `<Field>`      | Background visualization of a scalar/vector field (noise, direction field) _under_ the stitch preview — the bridge between math and thread.                                                                                                                |
| `<Quiz>`       | Predict-the-output / multiple-choice / "which line errors?" — instant feedback, no grading server needed.                                                                                                                                                  |
| `<Bug>`        | "Fix this program" cell: broken code + an automatic validator (see 1.2). The reader edits until the checkmark turns green.                                                                                                                                 |
| `<Challenge>`  | Open-ended task with machine-checkable constraints ("sew a hexagon border under 900 stitches, ≤ 2 trims") validated against `run()` stats. Optional hints, revealed progressively.                                                                         |
| `<Pitfall>`    | Styled callout for the recurring trap drills (see 1.4), each with its canonical error message screenshot and one-line fix.                                                                                                                                 |
| `<Ref>`        | Hover/popover reference card for any command or function — generated from the engine's command tables (`FUNC_ARITY`, `BUILTIN_ARITY`, …) so the book can never drift from the implementation.                                                              |
| `<Gallery>`    | Grid of finished pieces (bundled examples + capstones), each opening as a `<Scrub>`.                                                                                                                                                                       |
| `<Checkpoint>` | End-of-chapter block: 3–5 quiz items + 1 challenge; completing it marks the chapter done in the progress sidebar (localStorage).                                                                                                                           |

## 1.2 Validation engine (what makes challenges gradeable)

The engine is DOM-free and exposes `run()`, `designStats()`, warnings, and the density grid — so exercises are validated **on the reader's device** against real semantics, not string-matching:

- Stitch-count / trim-count / colour-count / jump-length budgets from `designStats`.
- Geometric predicates via the data world itself (`inpath`, `bbox`, `pathlen`, symmetry checks by re-running under `mirror`).
- "Must not warn" / "must warn" assertions (density, hoop overflow, tiny stitches).
- Determinism checks: same seed ⇒ identical event stream (drives the Part IV exercises).

## 1.3 Page anatomy (every chapter page)

1. **Hook** — one finished, scrubbable design that the page's concept makes possible (payoff first).
2. **Concept** — short prose, ≤ 3 paragraphs per idea, always followed by a `<Run>`.
3. **Explore** — a `<Param>`, `<Compare>`, or `<SeedGrid>` inviting play.
4. **Pitfall** — if the page owns one of the trap drills.
5. **Checkpoint** — quiz + challenge.
6. **Further** — collapsible "for the curious" depth (spec-level detail, edge cases) so the main column stays lean.

## 1.4 The six Pitfall Drills (spaced repetition backbone)

Six errors account for most beginner failure. Each gets a named drill introduced once, then deliberately _re-surfaced_ as a `<Bug>` in two later chapters (spaced repetition), and indexed in Appendix E:

| Drill                    | The trap                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1 Brackets**          | `{ }` never exists; every block is `[ ]`.                                                                                                        |
| **D2 Names**             | reserved words & built-ins can't be names — above all `step` (→ `stride`), plus `circle`, `pos`, `color`, `heading`, `random`, string built-ins. |
| **D3 Let-once**          | one `let` per name per procedure; blocks are not scopes; never `let` a parameter.                                                                |
| **D4 Negative literals** | `fd 10 -5` is two args; space rules; call parens as the escape hatch.                                                                            |
| **D5 Home & travel**     | `home` sews with pen down; use `moveto 0 0`/`gohome`; trim after repositioning.                                                                  |
| **D6 Sandbox borders**   | machine commands (esp. `trim`) inside `trace` are discarded; `beginfill`/`seed` forbidden in trace.                                              |

## 1.5 Learning-curve architecture

- **Two on-ramps, one spine.** The book serves (a) programmers who've never threaded a needle and (b) makers/embroiderers who've never programmed. Part 0 routes them: programmers may skim Part III at "fast-track" density (each chapter opens with a _For programmers_ summary box: "this is Logo-flavoured; here are the 5 deltas from what you expect"); makers may skim Part II's craft framing and slow down in Part III. Nobody skips Parts IV–VIII — that content exists nowhere else.
- **Payoff-first spiral.** A real, exportable design ships in Chapter 2. Concepts return at increasing depth: satin appears in Ch 6 (use it), Ch 35 (its physics), Ch 37 (reprogram it); fills in Ch 9 → Ch 32 (booleans) → Ch 38 (programmable) → Ch 39 (closed-loop).
- **One new idea per `<Run>`.** Cells differ from the previous cell by a single visible change wherever possible.
- **Interleaving.** Language chapters (Part III) each end with an _embroidery application_ section so syntax never floats free of thread.
- **Everything deterministic.** Seeded RNG means every screenshot, quiz answer, and challenge validation is exactly reproducible — lean on this constantly (`<SeedGrid>` everywhere).
- **Part capstones.** Every part ends in a project chapter that uses only material covered so far — readers always have a "complete piece" feeling at part boundaries.
- **Export early, export often.** `.DST` download is taught in Part 0 and re-prompted at each capstone: the book's promise is _physical_ output.

---

# 2 · The chapters

Page counts are book-page equivalents (≈ 350 words or one interactive per "page") to signal relative depth, not layout.

---

## Part 0 — Start Here (≈ 18 pages)

_Goal: reader runs code in the first 60 seconds, understands what the book is, picks a track._

### Ch 0.1 — What you'll make (4 p)

- 0.1.1 A gallery of finished pieces (`<Gallery>` of bloom, meadow, shatter, patch, fern…), each scrubbable
- 0.1.2 What "generative embroidery" means — designs that can't be drawn in traditional software (noise, recursion, seeds)
- 0.1.3 The promise: what you preview is exactly what the machine sews (determinism, `.DST` export)
- **Interactive:** the meadow example as a `<SeedGrid>` — "same program, twelve pieces."

### Ch 0.2 — How this book works (4 p)

- 0.2.1 Running, editing, and resetting cells; keyboard shortcuts
- 0.2.2 The preview: hoop, stitches, dashed jumps, penetration dots when zoomed
- 0.2.3 The scrubber and source-line highlight ("which line made this stitch?")
- 0.2.4 Checkpoints, challenges, and the progress sidebar; saving your scratch work
- **Interactive:** a sandbox `<Run>` pre-loaded with a 5-line design and an invitation to break it.

### Ch 0.3 — Choose your on-ramp (3 p)

- 0.3.1 Track quiz (5 questions) → recommended path
- 0.3.2 **Programmer track:** what to skim, what not to (the "5 deltas" preview: brackets, let-once, no shadowing, negative literals, two dialects)
- 0.3.3 **Maker track:** you already know the hard part (thread behaviour); the code is 20 words
- 0.3.4 **Generative-artist track:** p5/Processing → NeedleScript translation table (draw loop vs. one-shot, mm vs px, seeded-only randomness)

### Ch 0.4 — Thread, needle, fabric: a five-minute physics primer (4 p)

- 0.4.1 A machine doesn't draw — it punches penetrations; what you see is thread pulled taut between them
- 0.4.2 The three quantities that matter: where thread goes, how densely it piles, how it's secured
- 0.4.3 Why direction is visible (gloss) — the fact that makes embroidery unlike plotting
- 0.4.4 Vocabulary you'll meet: running/satin/tatami, underlay, pull, trim, lock (definitions only — each gets its own chapter)
- **Interactive:** macro-photo pairs next to their preview renders; a `<Compare>` of the same square at 3 fill angles.

### Ch 0.5 — Hello, hoop (3 p)

- 0.5.1 Your literal first program: `repeat 6 [ fd 20 rt 60 ]`
- 0.5.2 Download it as `.DST` right now (yes, already)
- 0.5.3 What the rest of the book adds to these 6 words
- **Checkpoint:** run, edit one number, re-run, export.

---

## Part I — First Stitches: the Turtle (≈ 42 pages)

_Goal: full command of movement, turning, repetition, and travel. Existing §§1–4, deepened._

### Ch 1 — The mental model (7 p)

- 1.1 Millimetres and the 47 mm sewable disc; origin at centre; overflow warnings
- 1.2 Heading: degrees **clockwise from north** — the Logo convention used by every later vector/noise function (drill it now)
- 1.3 From path to penetrations: how `fd 20` becomes eight stitches (the splitter, default 2.5 mm)
- 1.4 Reading NeedleScript: case-insensitive words, no separators, three comment styles, `//` vs lone `/`
- 1.5 The three value types at a glance (numbers do triple duty: mm, degrees, truth)
- **Interactive:** heading-dial widget (drag a dial, watch `seth`); a stitch-splitting slider (`<Compare>` on stitchlen).
- **Checkpoint:** predict-the-endpoint quizzes (position + heading after a short program).

### Ch 2 — Moving and sewing (8 p)

- 2.1 `fd` / `bk`; overlap is legal and sometimes useful
- 2.2 Absolute moves: `setxy`, `setx`, `sety` — and that they _sew_ from wherever you were
- 2.3 **Pitfall D4:** negative literals (`setxy -6 -21` vs `fd 10 - 5` vs the `fd 10 -5` error); call parens as the universal fix
- 2.4 First real design: sew your initials from straight segments
- **Interactive:** `<Bug>` cell for D4; an initials `<Challenge>` (≤ 300 stitches).

### Ch 3 — Turning and looping (10 p)

- 3.1 `rt` / `lt`; the square by hand
- 3.2 `repeat n [ … ]` — the single most important pattern: small move + small turn, repeated, becomes a shape
- 3.3 `repcount` and spirals (1-based; grows-per-iteration idiom)
- 3.4 Polygons → circles: the n-gon morph (interactive slider from 3 to 90 sides)
- 3.5 `arc deg r` — signed curvature (positive right); half-circles, S-curves
- 3.6 `circle r` as `arc 360 r`
- 3.7 Classic turtle études: star polygons, gears, rosettes, rose curves via repeat+arc
- **Interactive:** n-gon morph `<Param>`; étude `<Gallery>`; **Pitfall D1** (brackets) drill lives here.
- **Checkpoint:** `<Challenge>` — a 5-pointed star with exact rotational symmetry (validated by re-running under `rotate 72` and diffing event streams).

### Ch 4 — Pen, jumps, and travel (10 p)

- 4.1 `up`/`down` (`pu`/`pd`): jumps as dashed lines, not stitches
- 4.2 `moveto x y` (alias `jump`): pen-state-preserving repositioning — the default travel verb
- 4.3 `gohome` vs **`home` (Pitfall D5):** `home` sews with the pen down and resets heading; the safe idioms
- 4.4 `trim`: the dangling-connector problem, cut where you sew
- 4.5 `push`/`pop`: the turtle stack (500 deep); branch-and-return; why this beats up/down bookkeeping
- 4.6 Building tree-like things: spokes, asterisks, a first snowflake
- **Interactive:** `<Scrub>` showing an untrimmed connector being sewn (visceral); a trim-toggle `<Compare>`; push/pop visualized as a breadcrumb stack.
- **Checkpoint:** quiz on pen-state after mixed sequences.

### Ch 5 — Part I capstone: Constellation (7 p)

- 5.1 Plan: scattered "stars" (tiny circles), connecting branch structures, trims between
- 5.2 Build it in four passes, each a `<Run>` diff
- 5.3 Export and (optionally) sew it — first sew-out sidebar (pointer to Ch 47 for the full physical workflow)
- **Checkpoint:** personalize (own layout), validator checks trim discipline + hoop fit.

---

## Part II — The Thread Vocabulary (≈ 55 pages)

_Goal: every stitch mode, colour, securing, and fills — the embroidery-specific layer. Existing §§5–6, greatly expanded._

### Ch 6 — Running stitch and stitch length (6 p)

- 6.1 `stitchlen` (0.4–12 mm, default 2.5); clamping behaviour
- 6.2 How length changes character: delicate dashes vs long floats; curve fidelity vs snag risk
- 6.3 Sub-0.4 mm merges: the tiny-stitch warning and where it _really_ comes from (dense resampling, later)
- **Interactive:** `<Compare>` of one curve at 1 / 2.5 / 5 mm; zoomed penetration view.

### Ch 7 — Satin (10 p)

- 7.1 What a satin column is: your path becomes the **spine** of a zigzag column
- 7.2 `satin w`; width limits and the 2–8 mm guidance; snag warnings above ~8
- 7.3 `density`: penetration spacing along the column (0.25–5 mm)
- 7.4 Curved columns: satin follows `arc` — the thing traditional software makes painful
- 7.5 **Buffering:** a column sews when it _ends_ (pen up, mode/colour change, trim, program end) — first encounter with sewing order vs code order (`<Scrub>` this!)
- 7.6 Satin lettering & borders — a small practical study
- **Interactive:** width/density `<Param>`; buffered-flush `<Scrub>`; foreshadow box: "in Ch 37 you'll replace this generator entirely."
- **Checkpoint:** `<Challenge>` — a curved satin border around a circle, no warnings.

### Ch 8 — Bean, blanket, and line character (5 p)

- 8.1 `bean n`: bold hand-drawn lines (forced odd, max 9)
- 8.2 `estitch n`: blanket prongs, left of travel — so _direction of travel is a design decision_
- 8.3 Choosing a line: a decision table (thin detail → running; emphasis → bean; edge → estitch/satin)
- **Interactive:** four-way `<Compare>` of the same spiral in each mode.

### Ch 9 — Colour, stops, and locks (6 p)

- 9.1 The thread palette; `color n` emits a machine stop; `stop` as "next colour"
- 9.2 `lock`: automatic tie-in/tie-off at starts, ends, colour changes, trims, long jumps (0.3–1.5 mm; on by default)
- 9.3 Colour economics: every change stops a physical machine — batch by colour, not by motif (first taste of travel planning, Ch 45)
- **Interactive:** `<Scrub>` pausing at a colour stop; lock stitches under the zoom loupe.

### Ch 10 — Fills (12 p)

- 10.1 The mental shift: between `beginfill`/`endfill` your moves trace a **boundary**, they don't sew
- 10.2 `endfill` lays a tatami: rows of running stitch, brick-offset penetrations
- 10.3 `fillangle`, `fillspacing` (0.25–5), `filllen` (and `filllen 0` = follow stitchlen)
- 10.4 **Holes and the even-odd rule:** a pen-up move inside a fill starts an inner ring → hole; the donut
- 10.5 Multi-ring shapes: badges, letters with counters, border bands — one shape, one fill
- 10.6 **Park before you fill** (pre-echo of Pitfall discipline): position the needle at the boundary start with `moveto` first
- **Interactive:** parity explorer (click to add rings, watch even-odd flip regions); fill-angle dial `<Param>`.
- **Checkpoint:** `<Bug>` — a fill with an accidental double ring (solid where a hole was meant).

### Ch 11 — Light and direction (6 p)

- 11.1 Thread gloss: stitch angle _is_ a colour channel
- 11.2 Two-tone effects with one thread: adjacent regions at 0°/90°
- 11.3 Design study: the same leaf shaded three ways by `fillangle` alone
- **Interactive:** a simulated-sheen `<Compare>` (angle-dependent shading toggle in the preview).

### Ch 12 — Part II capstone: The Badge (10 p)

- 12.1 Spec: filled disc, hole/knockout motif, satin ring border, two colours, clean trims
- 12.2 Build passes: fill → knockout → border → colour order → stat review
- 12.3 Reading the stats row like a digitizer (counts, extents, max stitch)
- **Checkpoint:** validator — ≤ 2 colours, ≤ 3 trims, no warnings, fits a 30 mm disc.

---

## Part III — The Language (≈ 95 pages)

_Goal: complete programming competence in NeedleScript. Existing §§7–10, 12, 13, 23 — restructured for the two audiences; every chapter ends with an embroidery application so syntax never floats free. Fast-track boxes open every chapter for programmers._

### Ch 13 — Values and expressions (7 p)

- 13.1 Numbers everywhere: mm, degrees, counts, truth (0 false, else true)
- 13.2 Operators and precedence (`or < and < compare < +− < */% < unary`); `%` is floor mod
- 13.3 Comparisons; `=` vs `==` (same); deep list equality preview
- 13.4 **Pitfall D4 revisited** as expression parsing; parenthesize when in doubt
- 13.5 _Embroidery application:_ computed geometry — a polygon whose side count drives its turn angle
- **Checkpoint:** precedence prediction `<Quiz>`.

### Ch 14 — Variables and scope: the no-surprises chapter (10 p)

- 14.1 `let` declares **once**; bare assignment (and `+=` family) thereafter
- 14.2 One scope per procedure; **blocks are not scopes** — "this is not JavaScript" (the spiral-radius example, wrong → right)
- 14.3 No shadowing, ever: not of outer names, not of built-ins, not of procedures
- 14.4 Parameters are already local — never `let` a parameter
- 14.5 Globals vs locals: bare `x =` semantics; why helpers should `let` first
- 14.6 Declare-then-branch: initialize accumulators before conditional paths (unassigned-read runtime error)
- 14.7 **Pitfall D2 (Names) & D3 (Let-once) home chapter:** the reserved list, the built-in collision table, the `step` → `stride` rule
- **Interactive:** scope visualizer (variables panel updates as `<Scrub>` steps); `<Bug>` drills for D2, D3.
- **Checkpoint:** "which line is the parse error?" quiz battery.

### Ch 15 — Control flow in depth (8 p)

- 15.1 `repeat` + `repcount` (recap, formalized)
- 15.2 `for i = a to b [step s]` — inclusive; **`step` is a keyword here and nowhere a name**
- 15.3 `for elem in list` (loop var auto-local, don't `let` it)
- 15.4 `while` and the 2 M-op guard; 200 k iteration cap
- 15.5 `break`/`continue` are **lexical** — same-procedure loop bodies only; `exit`
- 15.6 _Embroidery application:_ a density-graded spiral (`for r = 4 to 40 step 3`)
- **Checkpoint:** `<Bug>` — a `break` smuggled into a helper called from a loop.

### Ch 16 — Procedures and reporters (10 p)

- 16.1 `def name(p, q) [ … ]`; call as `name(args)` or `name args`; forward calls
- 16.2 Commands vs **reporters**: `return expr` / `output expr`; reporters usable in expressions
- 16.3 Every path must return: the **parse-time reporter check** (celebrate it — no unlucky-seed debugging)
- 16.4 Recursion, depth 200: trees and ferns (build the classic fern here)
- 16.5 Designing a motif API: parameters that compose (`petal(len, w, curve)`)
- **Interactive:** recursive-tree `<Param>` (depth/angle/shrink sliders).
- **Checkpoint:** `<Challenge>` — write `polygon(n, side)` and `star(points, r1, r2)` reporters/commands passing a test battery.

### Ch 17 — Two dialects and call syntax (7 p)

- 17.1 Classic prefix Logo vs modern parenthesized calls — both always work
- 17.2 The two classic parsing rules (multi-arg absorbs trailing operator; single-arg binds tight) and why they bite (`random 64 - 32` vs `distance 0 0 < 47`)
- 17.3 House style: modern for anything nested; classic for terse turtle lines (`fd 10 rt 90`)
- 17.4 Quoted words (`"knit`) as classic strings; binding positions (`make "x`, `print "label`) unchanged
- 17.5 Reading other people's classic code (the bundled examples use both)
- **Checkpoint:** translate 5 classic snippets to modern and back (`<Quiz>` with diff-check).

### Ch 18 — Lists (12 p)

- 18.1 Literals, nesting, trailing commas; 0-based indexing, negatives; index assignment (+ compound ops)
- 18.2 Destructuring: `let [x, y] = pos()`
- 18.3 **Reference semantics** and `copy` (deep); the alias demo
- 18.4 **The `[` rule:** block vs literal vs index by position; the `repeat n[ … ]` sharp edge
- 18.5 Loud-over-convenient: the error catalog (list in condition/arithmetic/scalar command); deep equality as the one exception
- 18.6 The toolkit tour: mutators vs pure functions (append/insertat vs reverse/sort/slice/concat)
- 18.7 `range` (end-exclusive) vs `steps` (end-inclusive) — when each
- 18.8 Conventions: point = `[x,y]`, path = list of points, palette = list of thread numbers
- 18.9 _Embroidery application:_ palette cycling; a path recorded point-by-point and replayed with `setpos`
- **Interactive:** reference-semantics visualizer; `<Quiz>` on the `[` rule.

### Ch 19 — Strings (8 p)

- 19.1 Literals, the four escapes, unterminated/unknown-escape hard errors
- 19.2 Immutability; the case-sensitivity island (words case-insensitive, string _contents_ not)
- 19.3 Sequence overloads shared with lists (len/slice/reverse/…); `concat` needs both strings
- 19.4 The function set: `str`/`num(+fallback)`/`chars`/`split`/`joinstr`/`upper`/`lower`/`strip`/`repeatstr` — and **`strip` ≠ `trim`** (trim cuts thread, forever)
- 19.5 Why strings exist: computed print messages; **mode words as values** (`clippaths(a, b, pick(ops))`, `fabric f`)
- 19.6 No truthiness, no `+`: `len(s) > 0`, `concat(a, b)`
- 19.7 _Embroidery application:_ a string-seeded design — `chars(name)` mapped to angles (initials → unique mandala)
- **Checkpoint:** `<Bug>` featuring `trim(s)` and `if s`.

### Ch 20 — Higher-order programming (8 p)

- 20.1 `@name` references: user procs and value-returning built-ins; statement commands rejected
- 20.2 `map` / `filter` / `reduce`; `compose` pipelines (left-to-right)
- 20.3 The signature pipeline idiom: `steps` → `map(@shape)` → curve → `sewpath` (the petal-ring example, dissected)
- 20.4 When a loop is clearer — honest guidance
- 20.5 _Embroidery application:_ refactor Ch 16's motif API into pipelines
- **Checkpoint:** rewrite three loops as pipelines (validated by identical event streams).

### Ch 21 — Debugging like a digitizer (10 p)

- 21.1 `print` (all three forms), `printloc` (local-frame caveat under transforms)
- 21.2 `mark` and labeled preview pins (never exported, never counted)
- 21.3 `assert` + lazy message: geometric invariants as executable comments
- 21.4 **Scrubber-driven debugging:** source-line highlight as the primary tool; a worked mystery ("which line made this stray stitch?")
- 21.5 The warning taxonomy: clamps, merges, unclosed fills, overflow, density — each with a mini reproduction
- 21.6 Did-you-mean across namespaces; reading line-numbered errors
- 21.7 A debugging decision tree (console first, heatmap second, scrubber third)
- **Interactive:** three staged mysteries as `<Scrub>` cells with hidden solutions.

### Ch 22 — Part III capstone: The Parametric Mandala Kit (8 p)

- 22.1 Spec: a library of 3–4 motif procedures + a composition program, fully slider-driven
- 22.2 Annotate for the Parameters panel (`// [min:max]`), presets, lock & randomize
- 22.3 Ship it: a `<Param>` the reader publishes to the book's community gallery (stretch feature)
- **Checkpoint:** validator — ≥ 3 procedures, ≥ 4 annotated parameters, symmetry check, no warnings.

---

## Part IV — Randomness and Generative Math (≈ 72 pages)

_Goal: the "generative" in generative embroidery — seeded randomness, noise, the scalar shaping toolkit, vectors, segments. Existing §§11, 14, deepened into five chapters. This is where the book stops resembling any embroidery manual._

### Ch 23 — Seeded randomness and the determinism contract (10 p)

- 23.1 The tension: art wants surprise, machines want reproducibility — `seed` resolves it (default 42)
- 23.2 `random(n)`, `gauss(mu, sigma)`, `pick`, `shuffle` — distribution intuition with live histograms
- 23.3 **The fork convention:** fixed-cost draws vs forking generators (`scatter`/`shuffle` cost exactly 1); _why your edits stay local_ — insert a generator, downstream shifts by one draw, not thousands
- 23.4 Draw costs as API contract (pinned by the test suite)
- 23.5 Seed as a design dimension: curating seeds, not fighting them
- **Interactive:** `<SeedGrid>` as the chapter's spine; a fork-convention demo (toggle a `scatter` line on/off, watch a downstream `mark` move by exactly one draw's worth).
- **Checkpoint:** `<Quiz>` on draw-cost accounting.

### Ch 24 — Noise fields (16 p)

- 24.1 Why noise beats `random` for organic work: continuity — neighbours agree
- 24.2 `snoise2(x, y)` in −1..1; **sampling scale** (divide coordinates by 10–20) as the one knob that matters
- 24.3 `snoise3` and the variation axis (z = motif index × 50 — independent-but-coherent motifs)
- 24.4 `fbm2` and octaves: adding detail without losing structure
- 24.5 The three canonical mappings: noise → **heading** (flow fields), noise → **radius/width** (organic outlines, wobbling rings), noise → **density/spacing** (textured fills)
- 24.6 Flow-field walkers: the `stem`/`strand` pattern dissected line by line (seth from sampled noise, small `fd`, hoop-escape `return`)
- 24.7 Composing fields: bias + noise; masking fields by distance from a focus
- **Interactive:** `<Field>` showing the noise scalar field under the stitches, with a sampling-scale slider — the book's flagship widget; octave slider for fbm.
- **Checkpoint:** `<Challenge>` — a flow-field piece where all walkers stay in-hoop and coherent (validator checks overflow + a smoothness statistic).

### Ch 25 — The shaping toolkit (10 p)

- 25.1 `lerp`, `remap`, `clamp`, `smoothstep` — the four verbs of parameter design
- 25.2 remap as the universal adapter: noise (−1..1) → any design range
- 25.3 smoothstep for soft edges: fading density near the hoop rim
- 25.4 Degree-based trig (`sin`/`cos`/`atan`) and the classic modulation motifs (breathing radii, petal counts)
- 25.5 Building "safe" parameters: clamp at physical limits (satin 2–8, spacing ≥ 0.25) so exploration can't produce unsewable output
- **Interactive:** curve explorer (plot the shaping function next to its effect on a live design).
- **Checkpoint:** `<Bug>` — a design whose noise mapping exceeds physical ranges; fix with remap+clamp.

### Ch 26 — Vectors (12 p)

- 26.1 Points as `[x, y]`; no operator broadcasting — `vadd`/`vsub`/`vscale`, always
- 26.2 `vlen`, `vdist`, `vnorm`, `vlerp`, `vdot` — with geometric pictures, not formulas
- 26.3 The heading bridge: `vfromheading(deg, len)` and `vheading(v)` — clockwise-from-north everywhere (recall Ch 1.2)
- 26.4 `vrot`; building polar geometry without the turtle
- 26.5 Turtle vs vector style: when to walk, when to compute — and mixing them (`setpos(vadd(...))`)
- 26.6 Mini-lab: steering behaviours (seek, flee, orbit) as 10-line reporters
- **Checkpoint:** `<Challenge>` — a phyllotaxis (sunflower) spiral via `vfromheading`, validated by point-count and golden-angle spacing.

### Ch 27 — Segments and proximity (8 p)

- 27.1 `segisect`: intersection or `[]` — branching on emptiness
- 27.2 `segdist`: point-to-segment distance; corridor tests
- 27.3 `nearestonpath` (O(n) — budget awareness): snapping, attraction, edge-following
- 27.4 Application: self-avoiding walkers (test the next segment against recent history)
- 27.5 Application: connect-to-nearest networks (constellation lines done properly)
- **Checkpoint:** `<Challenge>` — walkers that provably never cross (validator runs pairwise segisect on the event stream).

### Ch 28 — Part IV capstone: The Wander Study (6 p)

- 28.1 Rebuild the bundled **wander/flow** examples from a blank cell, decision by decision
- 28.2 Seed curation session: generate 24 seeds, pick 3, articulate _why_ (an editorial eye is a skill)
- 28.3 Sew-out notes: what flow fields look like in thread vs pixels
- **Checkpoint:** personal variation submitted to gallery; determinism validator.

---

## Part V — Paths, Curves, and the Data Bridge (≈ 68 pages)

_Goal: fluency in the data world and its two-way border with sewing. Existing §§15, 18, 19, 20 — reordered so `trace` arrives right after paths (it makes everything else easier)._

### Ch 29 — Paths as data (8 p)

- 29.1 A path is just a list of points — everything from Part III applies
- 29.2 `pathlen`, `centroid`, `bbox` — measuring before sewing
- 29.3 **`resample(path, mm)`:** the bridge between math space and stitch space; why generated paths need it
- 29.4 `sewpath(path)` and `setpos(p)`: the only data→stitch commands; pen/mode/transform machinery applies
- 29.5 Park before you sew: `up setpos(first(ring)) down` — the idiom, drilled
- **Checkpoint:** `<Quiz>` — which of five paths need resampling and why.

### Ch 30 — Trace: drawing becomes data (12 p)

- 30.1 The gap: `sewpath` goes data→stitches, nothing went the other way; `trace [ … ]` closes the loop
- 30.2 Sandbox semantics: nothing sews, turtle restored, pen starts down; what escapes (the path, RNG consumption, variables/prints)
- 30.3 `trace` (exactly one run) vs `tracerings` (list of runs, drawing order) — donuts and knockouts as data
- 30.4 Expression-position only; binds like a primary (`trace [ … ][0]`)
- 30.5 What's captured: the **pre-split spine** (stitchlen irrelevant; `fd 30` = two vertices) → resample on the way out
- 30.6 Coordinate frames: inside-the-block transforms apply, enclosing ones don't; the **round-trip identity** `sewpath(trace [ B ]) ≡ B`
- 30.7 **Pitfall D6 home chapter:** machine commands discarded in the sandbox (the lost `trim`); `beginfill`/`seed` hard errors
- 30.8 The region-constructor idiom: `circleat(cx, cy, r)` and friends — your geometry library begins here
- **Interactive:** frame demo `<Scrub>` (the translate/rotate example, stepped); `<Bug>` for D6.
- **Checkpoint:** write `ngon(cx, cy, r, n)` returning a region via trace; validator round-trips it.

### Ch 31 — Curves and smoothing (12 p)

- 31.1 `chaikin(path, n)`: corner-cutting; passes 1–6 visualized
- 31.2 `catmull(points, mm)`: through-points splines — control points you can scatter
- 31.3 `bezier(p0, c0, c1, p1, mm)`: designed curves; handles intuition
- 31.4 Choosing: chaikin to soften generated polylines, catmull to connect landmarks, bézier to art-direct
- 31.5 Resampling discipline: curve functions return dense paths — the mm parameter is your stitch budget
- 31.6 Application: hand-drawn-feel lettering path; a ribbon from a catmull through noise-jittered anchors
- **Interactive:** spline playground (drag control points, stitches update live).
- **Checkpoint:** `<Challenge>` — smooth a jagged 12-point ring three ways, pick and justify (guided reflection prompt).

### Ch 32 — Transforms (10 p)

- 32.1 Block transforms: `translate`, `rotate`, `rotateabout`, `scale`, `scalexy`, `mirror`, `skew` — nesting applies inside-out
- 32.2 Stamping: one motif procedure, placed n times (the wreath pattern)
- 32.3 Symmetry systems: `mirror` axes, `rotateabout` for k-fold; combining for dihedral symmetry
- 32.4 Data twins: `xlate`/`xrotate`/`xscale`/`xmirror` — transform paths without drawing; when to use which world
- 32.5 Transforms vs the physical layer preview: scaled satin sews physical spacing, not stretched stitches (full story in Ch 37)
- **Interactive:** symmetry-group explorer (pick k-fold + mirror, stamp a doodle).
- **Checkpoint:** `<Challenge>` — a 6-fold wreath from a single motif procedure, ≤ 1 motif definition (validated structurally).

### Ch 33 — Effects: warp, humanize, snaptogrid (14 p)

- 33.1 Where effects sit in the pipeline (warp pre-split on the spine; humanize/snaptogrid post-split on penetrations) — and why that's the only ordering that works
- 33.2 **`warp @fn` — your first shader:** reporter `[x,y] → [x,y]`; fisheye, twist, ripple, noise-push worked examples
- 33.3 Safety story: hoop/density/long-stitch checks run on the _warped_ result
- 33.4 **`humanize amount`:** coherent (not per-stitch) jitter; forks — costs one draw; same seed, same imperfections
- 33.5 **`snaptogrid cell …`:** frame-invariance (the lattice belongs to the fabric); rectangular/offset/rotated arities; cross-stitch aesthetics; merge warnings on coarse grids
- 33.6 Satin exemptions: humanize/snaptogrid skip satin columns (and warn once) — don't chase a nonexistent bug
- 33.7 Path twins: `warppath`/`humanizepath`/`snappath` — effects as pure functions in pipelines
- **Interactive:** shader gallery `<Param>` (pick a warp, tune its coefficients); cross-stitch converter cell.
- **Checkpoint:** write a custom warp reporter passing a "stays in hoop" assertion battery.

### Ch 34 — Part V capstone: The Cross-Stitch Portrait (12 p)

- 34.1 Pipeline: trace a silhouette → resample → snaptogrid → palette by region (`inpath` preview of Ch 36)
- 34.2 Frame-invariance in anger: motifs stamped across the grid all register
- 34.3 Humanize the border for a hand-finished look
- **Checkpoint:** validator — all penetrations on-lattice, ≤ 3 colours, no merge warnings.

---

## Part VI — Computational Geometry (≈ 58 pages)

_Goal: the generator/geometry toolkit and the design patterns it unlocks. Existing §§16–17, expanded with pattern chapters._

### Ch 35 — Point generators (10 p)

- 35.1 `scatter(mindist)` — Poisson-disc: even-but-organic; vs pure random (side-by-side)
- 35.2 Region-bounded `scatter(mindist, region)` — regions from `trace` (Ch 30 pays off)
- 35.3 `relax(points, n)` — Lloyd's relaxation; when even-ness matters (stippling, cell seeds)
- 35.4 Budgets: 20 k scatter cap, 10 k generator inputs — designing under limits
- 35.5 Patterns: stippled shading (density from an image-like field via `smoothstep`), confetti fields, seed points for Part VI's tessellations
- **Interactive:** mindist slider with live point count + stitch estimate.
- **Checkpoint:** `<Challenge>` — stippled gradient disc, darker toward one focus.

### Ch 36 — Tessellations: Voronoi, Delaunay, hull (12 p)

- 36.1 `voronoi(points[, region])`: cells as regions; clipping to a traced boundary
- 36.2 `triangulate(points)`: Delaunay triangles; when triangles beat cells
- 36.3 `hull(points)`: convex boundary (CCW) — quick regions from clouds
- 36.4 Styling cells: outline vs fill per cell; per-cell parameters (fillangle from centroid heading; palette by area)
- 36.5 `inpath(p, region)`: point-in-region tests — masking, region-based palette maps
- 36.6 Travel across many cells: sort by proximity, trim policy (pre-echo of Ch 45)
- **Interactive:** click-to-place seeds → live Voronoi; relax button.
- **Checkpoint:** `<Challenge>` — stained-glass piece: voronoi cells, each inset-outlined, palette from a 3-list.

### Ch 37 — Offsets and booleans (12 p)

- 37.1 `offsetpath(region, mm)`: inflate/shrink; returns a **list** of regions; shrinking may return empty — always check
- 37.2 Concentric insets: the `while len(rings) > 0` inset loop (topographic fills)
- 37.3 `clippaths(a, b, op)`: union/intersect/difference/xor — each visualized on the same two shapes
- 37.4 **Booleans before the fill, parity inside it:** overlapping rings in one fill = xor; use union when you mean union (the classic confusion, resolved forever)
- 37.5 Pattern library: borders as offset bands, knockout text, moon-bite difference, clipped texture (scatter ∩ region)
- 37.6 Vertex budgets (50 k per call) and cleaning with resample
- **Interactive:** boolean-op picker on two draggable shapes; inset-loop `<Param>`.
- **Checkpoint:** `<Bug>` — a "union" done by overlapping fill rings (xor holes appear); fix with clippaths.

### Ch 38 — Part VI capstone: Shatter, rebuilt (10 p)

- 38.1 The full generative-geometry pipeline from scratch: trace a boundary → scatter → relax → voronoi(clipped) → per-cell offset insets → fills with per-cell angles → ordered travel
- 38.2 Compare with the bundled **shatter** example: read it as a peer, not an oracle
- 38.3 Parameterize and seed-curate
- **Checkpoint:** validator — every cell inside the boundary, no density warnings, ≤ N trims.

### Ch 39 — Interlude: performance and budgets (6 p)

- 39.1 The op counter (2 M), stitch cap (60 k), list-cell and string budgets — what actually costs what
- 39.2 `nearestonpath` and O(n) honesty; pre-computing vs re-computing in loops
- 39.3 Reading the stats row as a profiler; a worked optimization (same design, ⅓ the stitches)
- **Checkpoint:** optimize a given over-budget design under the caps.

---

## Part VII — Fabric Physics and the Professional Layer (≈ 72 pages)

_Goal: from "renders right" to "sews right", then reprogram the stitch generators themselves. Existing §§21–22 — the book's expert tier, split into six chapters._

### Ch 40 — Why geometry isn't enough (8 p)

- 40.1 Four physical realities: pull (tension shrinks along stitch axis), sink (stitches settle into fabric), crowding on curves, coverage limits
- 40.2 **Coverage in layers:** mm of thread per mm²; 1 layer = clean satin/tatami; fabric stops being fabric past ~2.5–3.5
- 40.3 Tour of the instruments: the 1 mm coverage grid, heatmap toggle (orange ~1.2, red ~3), hotspot warnings with coordinates _and source lines_
- 40.4 The philosophy: everything here is **opt-in** — nothing rewrites your design behind your back
- **Interactive:** `<Heatmap>` on a deliberately hot design; click a hotspot → offending line highlights.

### Ch 41 — Fabric presets (6 p)

- 41.1 `fabric 'woven' | 'knit' | 'stretch' | 'denim'/'canvas' | 'fleece'` — the table, explained row by row
- 41.2 What a preset sets (pullcomp, underlay, satin density floors, coverage limit); explicit commands override piecewise
- 41.3 Choosing by garment: tee vs cap vs patch vs towel
- **Checkpoint:** match designs to fabrics `<Quiz>` (with failure photos).

### Ch 42 — Pull compensation and underlay (12 p)

- 42.1 `pullcomp mm` (0–1.5): widening satin, extending fill rows; why borders meet fills only with it
- 42.2 Underlay = the difference between hobby and professional: anchors fabric, lifts top stitching
- 42.3 `underlay` modes for satin: center / edge / zigzag / auto (picks by width) / off — each visualized under the loupe
- 42.4 `fillunderlay`: tatami cross-grain / edge run / auto (+ edge over 100 mm²)
- 42.5 Machine order: underlay sews first; the buffered-column lifecycle completed (Ch 7.5 fully resolved) — `<Scrub>` the flush
- **Interactive:** underlay-mode `<Compare>` with thin/light rendering; pullcomp before/after overlay.
- **Checkpoint:** `<Challenge>` — a satin-bordered fill where border and fill provably meet (bbox check).

### Ch 43 — Curves, density, and trims at machine level (10 p)

- 43.1 `shortstitch`: alternate inner-edge stitches pulled to 60 % on tight curves; the "column wider than curve radius" impossibility warning
- 43.2 `maxdensity n` and the coverage grid revisited: raising the limit **knowingly** (the patch example: satin-over-fill ≈ 4 layers is legitimate)
- 43.3 Tie-off micro-stitches excluded from the grid (no false hotspots)
- 43.4 `autotrim mm` (default 7, range 3–30): connector policy as configuration; never trims virgin thread
- 43.5 Repeated-penetration flags; needle-hole hygiene
- **Interactive:** curvature stress-test `<Param>` (radius slider on a satin arc, watch shortstitch engage).

### Ch 44 — Programmable satin (14 p)

- 44.1 The contract: reporter `(t, s, i, u) → [advance, leftw, rightw, leftlag, rightlag]`; advance must be positive (the termination guarantee)
- 44.2 The four inputs: arc-length mm (`t`, scale-stable patterns), normalized `s` (tapers — possible because the column buffers), pair index `i`, local heading `u`
- 44.3 The tuple helpers: `satinpair`, `satinasym`, `satinrake` — intent over slot-memorization; `satinpair(0.4, 2) ≡ satin 4`
- 44.4 Worked columns: the tapered leaf; asymmetric rails; the rake; **woven crosshatch** (flip rake sign by `i` parity — diagonals cross, cursor still monotone) with `maxdensity` raised knowingly
- 44.5 Why it composes: the generator sits **upstream of the physics** — spine-local space, so transforms/warp/pullcomp/underlay/heatmap all still apply
- 44.6 Guarantees: parse-time return-completeness, arity/shape errors with line numbers; no hidden randomness
- **Interactive:** satin-shaper lab (edit the reporter, see the column and its penetration pattern side by side).
- **Checkpoint:** `<Challenge>` — a leaf that tapers at both tips _and_ rakes toward the tip (validator inspects rail geometry).

### Ch 45 — Programmable fills (12 p)

- 45.1 `fill dir @f` / `fill shape @s`: arming the next beginfill/endfill; the engine keeps rows evenly spaced, clips holes, runs physics
- 45.2 Direction fields: rows that **curve to follow the work** — radial, orbital, noise-guided fills
- 45.3 Stitch shapers and `tatamirow`: texture inside the fill (length/offset modulation)
- 45.4 Field design reuses Ch 24–26 wholesale: your noise and vector fields, now driving rows
- 45.5 Debugging fills: visualize the field first (`<Field>`), then fill
- **Interactive:** direction-field lab (same boundary, four fields).
- **Checkpoint:** `<Challenge>` — a leaf filled with veins following a midrib field.

### Ch 46 — Closed-loop generation (10 p)

- 46.1 Reading the fabric back: `coverat(p[, r])`, `countat`, `nearestsewn(p)`, `sewnwithin(p, r)`, `stitchedpoints` — pure reads of _committed_ penetrations
- 46.2 The flush gotcha: a buffered satin column isn't committed until it ends — `satin 0` before you read
- 46.3 Patterns: density-aware placement (add motifs only where `coverat < x`), avoid-what-exists walkers, grow-until-covered loops with a hard iteration ceiling
- 46.4 Feedback stability: why closed loops need caps and hysteresis (a diverging example, then fixed)
- **Checkpoint:** `<Challenge>` — self-limiting stipple: keeps adding dots until mean coverage crosses a target, provably terminates.

### Ch 47 — Part VII capstone: The Patch (— production-grade) (8 p)

- 47.1 A merrowed-look badge: fill base, knockout, satin border over fill edge (raise maxdensity knowingly), correct underlay everywhere, fabric preset, colour-batched order
- 47.2 The professional review pass: heatmap calm, stats sane, warnings zero-or-justified
- **Checkpoint:** validator mirrors a commercial digitizing checklist.

---

## Part VIII — Craft, Projects, and the Real Machine (≈ 55 pages)

_Goal: judgment — the two-worlds model, gotchas, travel planning, and the physical workflow. Existing §§24–28._

### Ch 48 — The two worlds (8 p)

- 48.1 The taxonomy: sewing world (emits stitches / mutates machine state) vs data world (values in, values out) — the full command census
- 48.2 The bridges: `sewpath`/`setpos` inward; `trace`/`tracerings` outward; read-only turtle & fabric sensors
- 48.3 Neutral scaffolding: control flow belongs to neither
- 48.4 The asymmetry worth engraving: _data closes itself and lives nowhere; thread is always somewhere and never closes on its own_
- **Interactive:** sortable command-census table (generated from engine tables); "which world?" `<Quiz>`.

### Ch 49 — Sewing gotchas (10 p)

- 49.1 Open vs closed: regions close implicitly in data; sewn loops need the final `setpos(first(ring))`
- 49.2 Parking: before every `sewpath` and _especially_ every `beginfill`
- 49.3 Parity vs booleans recap (the Ch 37 rule, now as a debugging lens: the heatmap is your parity debugger)
- 49.4 Physical-stitch gotchas: too short (merge chains from resample/snap/humanize), too much (layers), out of order (buffered satin)
- 49.5 **The pre-flight checklist** — rendered as an interactive linter panel the reader can run against any cell in the book
- **Interactive:** the checklist widget; a `<Bug>` gauntlet of five classic artefacts.

### Ch 50 — Travel planning and design hygiene (8 p)

- 50.1 Sewing order as a first-class design output: scattered order = jumps+trims+time; swept order = clean fabric
- 50.2 Sorting strategies: nearest-neighbour tours over motif lists; row sweeps; colour batching (one stop per thread)
- 50.3 Jump/trim budgets in `designStats`; autotrim interplay
- 50.4 A worked reorder: same design, 40 % fewer trims
- **Checkpoint:** `<Challenge>` — reorder a 30-motif scatter under a trim budget.

### Ch 51 — From preview to fabric (12 p)

- 51.1 `.DST` export: what's in the file (ternary deltas, split long moves, stops, trim jumps, header); PES/EXP/SVG exports
- 51.2 The physical stack: hoops & hooping tension, stabilizers by fabric, thread weights, needle sizes — a pragmatic primer (with the honest note: your machine's manual wins)
- 51.3 First sew-out protocol: test fabric, watch the first colour, compare against the preview
- 51.4 Iterating on physical results: reading puckers/gaps/looping back into pullcomp/density/underlay changes
- 51.5 A troubleshooting table: symptom on fabric → suspect command → chapter
- **Interactive:** annotated sew-out photo pairs (preview vs fabric) per failure mode.

### Ch 52 — Capstone studio (12 p) — graded projects, each a guided-then-open build

- 52.1 **The Meadow** (flow fields + satin leaves + fabric preset) — the tutorial classic, now with full physics
- 52.2 **The Sampler** (every stitch mode + snaptogrid band) — a reference object worth sewing and keeping
- 52.3 **Stained Glass** (geometry pipeline + travel planning)
- 52.4 **The Monogram Patch** (strings → parametric lettering → production checklist)
- 52.5 **Free study** — reader's own piece; the validator only checks production-readiness
- 52.6 Community gallery + "design notes" template (seed, fabric, stats, what you'd change)

### Ch 53 — Reading the masters (5 p)

- 53.1 Guided readings of the bundled examples not yet dissected (bloom, echo, shell, tree…) — each as a `<Scrub>` with margin commentary
- 53.2 Style notes: idiomatic mixed-dialect NeedleScript (meadow as reference)

---

## Part IX — Tooling and Ecosystem (≈ 38 pages)

_Goal: power use and going beyond the book. Existing §§25, 29 + README material._

### Ch 54 — Playground power use (8 p)

- 54.1 The REPL: nudging a live design; history
- 54.2 The Parameters panel / customizer in depth: `// [min:max]` annotations, toggles, locks, randomize-unlocked, named presets — no-code exploration for collaborators
- 54.3 Editor ergonomics; examples dropdown; drag & drop
- **Checkpoint:** annotate a given design for a "client" who will only touch sliders.

### Ch 55 — SVG import (6 p)

- 55.1 What maps to what: fills → beginfill blocks (subpaths → holes), strokes → outlines, colours → nearest thread; supported elements/transforms
- 55.2 The import is a _starting point_: cleaning generated code, re-parameterizing, adding physics
- 55.3 Round-trip workflows with vector tools
- **Checkpoint:** import a provided logo, take it to production quality.

### Ch 56 — The AI assistant (6 p)

- 56.1 `/ai` setup (OpenRouter key, model picker) and the four verbs: create / improve / fix / explain
- 56.2 Prompting that works: concrete shapes, stitch types, numerical targets (the tutorial's tips, expanded with before/after prompt pairs)
- 56.3 Review discipline: AI output goes through _your_ pre-flight checklist (Ch 49); the scrubber as code review
- 56.4 Where AI helps most (boilerplate, exploration) vs least (physics judgment, travel planning)

### Ch 57 — The engine as a library (8 p)

- 57.1 `npm install needlescript`: `run` → events/warnings/density; `designStats`; `toDST`/`toPES`/`toEXP`/`toSVG`
- 57.2 Building your own tools: batch seed rendering, a Twitter-bot, a plotter bridge, custom validators (how this book's `<Challenge>` grader works — eat your own dog food)
- 57.3 The exported tables and `LIMITS`; tests as the behavioural spec
- 57.4 Determinism guarantees at the library level (pinned deps, no `Math.random`)

### Ch 58 — Where to go from here (4 p)

- 58.1 The community gallery; sharing programs (seed + source = the whole piece)
- 58.2 Contributing examples and chapters; the book is a repo
- 58.3 A reading list: turtle geometry, generative art, digitizing craft

---

# 3 · Appendices (interactive reference, ≈ 45 pages)

- **A. Language reference** — every command/function as a `<Ref>` card, generated from the engine's tables; searchable; each card links to its teaching chapter and embeds a one-line `<Run>`.
- **B. The two-worlds census** — the full sortable taxonomy table (from §28).
- **C. Limits & clamps** — the safety-limit table with "what hitting it looks like" console screenshots.
- **D. Warning & error catalog** — every warning/error message verbatim → cause → fix → chapter link. (Errors are the UI most readers meet first; make the catalog linkable so console messages can deep-link into the book.)
- **E. Pitfall drills index** — D1–D6 with all their `<Bug>` cells collected for exam-style review.
- **F. Glossary** — dual-audience: embroidery terms for programmers, programming terms for makers.
- **G. Cheat sheets** — printable one-pagers: turtle & travel; stitch modes & fills; generative math; the pre-flight checklist.
- **H. Migration map** — old tutorial § → new chapter(s) (below), so existing readers and inbound links land correctly.

## Appendix H — mapping from the existing tutorial

| Existing §                              | New home            |
| --------------------------------------- | ------------------- |
| 1 Mental model                          | Ch 0.4, Ch 1        |
| 2 First stitches                        | Ch 2                |
| 3 Turning & looping                     | Ch 3                |
| 4 Pen/jumps                             | Ch 4                |
| 5 Stitch types                          | Ch 6–9              |
| 6 Fills                                 | Ch 10–11            |
| 7 Variables & expressions               | Ch 13–14            |
| 8 Control flow                          | Ch 15               |
| 9 Procedures                            | Ch 16               |
| 10 Two dialects                         | Ch 17               |
| 11 Randomness                           | Ch 23               |
| 12 Lists                                | Ch 18, 20           |
| 13 Strings                              | Ch 19               |
| 14 Generative math                      | Ch 24–27            |
| 15 Paths & curves                       | Ch 29, 31           |
| 16 Generators                           | Ch 35–36            |
| 17 Geometry                             | Ch 37               |
| 18 Transforms                           | Ch 32               |
| 19 Effects                              | Ch 33               |
| 20 Trace                                | Ch 30               |
| 21 Professional layer                   | Ch 40–43            |
| 22 Programmable satin/fills/closed-loop | Ch 44–46            |
| 23 Debugging                            | Ch 21               |
| 24 Safety limits                        | Ch 39, App C        |
| 25 Export & reuse                       | Ch 51, 57           |
| 26 Sewing gotchas                       | Ch 49 (+37.4, 30.7) |
| 27 Capstone                             | Ch 52               |
| 28 Two worlds                           | Ch 48               |
| 29 AI assistant                         | Ch 56               |

---

# 4 · Build order (suggested milestones)

1. **M1 — Spine (MVP):** component inventory 1.1 (Run, Scrub, Compare, Quiz, Checkpoint) + Parts 0–II. A complete beginner course; already shippable.
2. **M2 — Language + Generative:** Parts III–IV + `<SeedGrid>`, `<Field>`, `<Bug>`, `<Challenge>` validation engine, Appendices A/D.
3. **M3 — Data & Geometry:** Parts V–VI + spline/voronoi/boolean labs.
4. **M4 — Professional:** Part VII + `<Heatmap>` deep integration, sew-out photography for Ch 51.
5. **M5 — Craft & Ecosystem:** Parts VIII–IX, remaining appendices, gallery, progress tracking polish.

Sizing sanity check: Parts 0–IX ≈ 478 pages + appendices ≈ 45 ⇒ **≈ 520–560 pages** of authored content — solidly book-size, with the heaviest interactivity concentrated where prose alone fails (noise fields, physics, parity, buffered order).
