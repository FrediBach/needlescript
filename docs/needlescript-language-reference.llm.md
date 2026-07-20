# NeedleScript Language Reference — Compact LLM Edition

> Generated from `needlescript-language-reference.json`. Prefer the JSON source for programmatic filtering and the human edition for extended rationale and examples.

## Grammar and semantic constraints

### 1. Mental model

- Units: millimetres. Headings: degrees clockwise from north. Words are case-insensitive; string contents are case-sensitive.
- Values are numbers, immutable single-quoted strings, and nested lists. Only numbers have truthiness (`0` false).
- Same source, seed, hoop, and explicit run configuration must produce the same stitches.

### 2. Critical generation rules

- Blocks always use `[ ... ]`; braces are invalid.
- Core names cannot be redefined. Library reporters are soft-reserved at call sites; generated code should avoid every builtin name.
- Blocks do not create variable scopes. Declare a local once with `let`, then assign without `let`. Never redeclare parameters or shadow outer/Core names.

### 3. Two dialects and call syntax

- Modern and classic Logo syntax may mix. A parenthesis glued to a name is a call; a spaced parenthesis groups an expression. Prefer glued calls for nested expressions.
- `[` starts a block after a statement header, a list in expression position, or an index when glued to a value. Always put a space before a block bracket.

### 4. Expressions

- Precedence, low to high: `or`; `and`; comparisons; `+ -`; `* / %`; unary/prefix functions; primary expressions. `and`/`or` short-circuit.
- `%` is floor modulo. Equality is deep for lists with 1e-9 numeric tolerance. List arithmetic does not broadcast.

### 5. Variables

- `let` declares once in the current procedure/global scope. Bare assignment updates a local if present, otherwise a global. Lists use reference semantics; destructuring is fixed-arity and flat.

### 6. Control flow

- Loops: `repeat`, `while`, inclusive counted `for`, and `for ... in`. Loop variables do not leak.
- `break` and `continue` are lexical and cannot cross a procedure boundary. `stitchscope`, `atomic`, and `routegroup` are block forms.

### 7. Procedures

- Procedures use `def name(args) [ ... ]` or classic `to ... end`; forward calls and recursion are supported. Reporters must return on every path.
- `@name` creates a procedure reference. Anonymous `def(args) [ ... ]` creates a closure that snapshots referenced locals; globals remain live. Imports are top-level, compile-time, and limited to bundled `std.*` modules.

### 8. Movement

- Movement follows Logo turtle semantics. Prefer `moveto` for non-sewing travel; `home` sews when the pen is down. `push`/`pop` save and restore turtle state without sewing.

### 9. Thread & stitch quality

- Stitch modes are sticky. Running, satin, bean, blanket, color, locks, density, and construction policies affect subsequent output until changed. Satin is buffered and flushes at construction boundaries.

### 10. Fills

- `beginfill ... endfill` records compound boundaries and sews a fill. Pen-up runs create holes by even-odd rules. Fill angle, spacing, inset, edge runs, staggering, connectors, length, and programmable channels are sticky construction settings.

### 11. Strings

- Strings are immutable, single-quoted, and single-line. Only `\'`, `\\`, `\n`, and `\t` escapes exist. Mode strings are matched case-insensitively by their consumers.

### 12. Lists

- Lists are nested mutable references; `copy` deep-copies. Indices are zero-based and may be negative. List/string sequence reporters use glued-call syntax. Random list operations follow documented seeded draw counts.

### 13. Generative math

- Points are `[x, y]`; paths are lists of points; regions are closed paths. Generative geometry reporters use glued-call syntax and compose as data transformations before sewing.

### 14. Transforms (block-scoped, Core)

- Transform blocks compose a CTM while the turtle remains in local coordinates. Path geometry is transformed before physical stitch splitting and construction; stitch lengths and compensation stay physical.

### 15. Effects (block-scoped, Core)

- Effects share the block stack with transforms. `warp` runs before stitch splitting; `humanize`, `snaptogrid`, and `declump` run after splitting and skip satin. Their frame and RNG behavior are feature-specific.

### 16. Programmable stitching

- Programmable satin, rail-pair satin, fill fields/shapers/path generators, and reporter/list stitch splitting use strict tuple/signature contracts. Reporter coordinates and physical construction stages are documented per feature.

### 17. Randomness & determinism

- Default seed is 42. Stream draws are explicit: `random`/`pick` 1, `gauss` 2; scatter/shuffle/humanize fork after 1 main draw; noise fields and deterministic geometry usually draw 0.

### 18. Hoop, field, and budget overrides

- `hoop`, `preflight`, `plan`, and `override` are top-level directives with placement constraints. Machine calibration is `RunOptions` data, not portable language syntax.

### 19. Trace — capturing paths as data

- `trace [ ... ]` returns one captured pen-down path; `tracerings` returns all runs. The sandbox emits no stitches and restores turtle/construction state, but ordinary variable effects and RNG consumption escape.

### 20. Professional layer & fabric physics

- Fabric, thread, needle, stabilizer, topping, compensation, underlay, density, and history features form the opt-in professional layer. Physical units are resolved in hoop space and defaults preserve legacy output.

### 21. Debugging commands

- `print`, `printloc`, `mark`, `chalk`, and `assert` provide diagnostics. Chalk/marks are preview-only. Structured preflight issues never rewrite stitches.

### 22. Customizer annotations (comment-level, invisible to the interpreter)

- Comment annotations expose sliders, switches, text, colors, points, paths, curves, sections, and presets to the playground without changing interpreter semantics.

### 23. Generation best practices

- Keep designs inside the field; use jump travel between motifs; keep satin/fill density machine-safe; seed randomness; cap history-driven loops; and prefer glued calls for nested expressions.

### 24. Pre-flight checklist — verify every program before returning it

- Before returning code, verify brackets, names, one-time declarations, lexical placement, negative-literal spacing, string/list types, field bounds, trims, satin widths, and stitch budget.

## Feature catalog

Each entry is `signature [category, tags] — summary`. Signatures use call notation compactly even when classic prefix syntax is also accepted.

### Syntax & control flow

Grammar, declarations, procedures, and control flow.

- `repeat` [syntax-control, block, keyword, library] — Loop n times. `repcount` is the 1-based counter of the innermost repeat.
- `while` [syntax-control, block, keyword, library] — Loop while the condition is true (non-zero). `while true [ … break ]` is the idiomatic search loop.
- `for` [syntax-control, block, keyword, library] — Counted loop: `for i = 0 to n [ … ]` — inclusive of _to_, step defaults to 1.
- `if` [syntax-control, block, keyword, library] — Conditional block. Chains with `else if` and `else`.
- `else` [syntax-control, block, keyword, library] — Follows an `if` block. Can chain: `if … else if … else …`.
- `break` [syntax-control, keyword, library] — Exits the innermost `repeat`, `while`, or `for` loop immediately.
- `continue` [syntax-control, keyword, library] — Skips to the next iteration of the innermost loop.
- `stitchscope()` [syntax-control, block, core, embroidery, heading, keyword, mode] — Run a block with temporary stitch-construction settings, then restore the outer configuration even after `return`, `break`, `continue`, or an error. It scopes running/satin/E-stitch/bean modes, satin cap/join/wide policies, fill settings and an armed fill, plus lock, compensation, underlay, auto-trim, and density policies. Turtle position, heading, pen, color, RNG, transforms/effects, output/history, hoop, budgets… Example: `stitchscope [ density 0.5 underlay 'edge' satin 4 fd 20 ]`.
- `import` [syntax-control, embroidery, keyword, library, top-level] — Imports one exported procedure from a bundled standard-library module under a local name. Imports are compile-time only and must be top-level.
- `export` [syntax-control, block, call-syntax, heading, keyword, library, top-level] — Marks a top-level procedure as part of a source module's public surface. The keyword directly prefixes `def` or classic `to`.
- `def` [syntax-control, block, call-syntax, keyword, library] — Define a procedure. Parameters are local and can recurse (depth limit 200). Anonymous `def(params) [ … ]` expressions capture enclosing locals by snapshot and return a configured reference.
- `to` [syntax-control, keyword, library, mode] — Classic Logo procedure definition. Modern equivalent: `def name(a, b) [ … ]`.
- `end` [syntax-control, keyword, library] — Closes a `to … end` procedure definition.
- `return` [syntax-control, keyword, library] — Return a value from a procedure. Without argument, exits early. Classic aliases: `output`, `op`.
- `output` [syntax-control, keyword, library] — Classic Logo alias for `return`. Only valid inside a procedure.
- `exit` [syntax-control, keyword, library] — Classic Logo alias for `return` with no value.
- `let` [syntax-control, keyword, library, stateful] — Declare a variable — global at top level, local inside a procedure. Redeclaring the same name in the same scope is a parse error.
- `make` [syntax-control, keyword, library, stateful] — Classic Logo assignment: `make "x expr`. Same rules as `x = expr`.
- `local` [syntax-control, keyword, library] — Classic Logo local variable declaration inside a procedure. Illegal at top level.
- `and` [syntax-control, keyword, library] — Logical AND, short-circuits. `i > 0 and 10/i > 2` is safe.
- `or` [syntax-control, keyword, library] — Logical OR, short-circuits.
- `true` [syntax-control, constant, library] — Literal for 1. Truthiness: anything non-zero is true.
- `false` [syntax-control, constant, library] — Literal for 0. Truthiness: 0 is false.
- `in` [syntax-control, keyword, library] — Used in `for x in xs [ … ]` to iterate list elements.
- `step` [syntax-control, keyword, library] — Optional step in a `for` loop: `for i = 10 to 1 step -2 [ … ]`.

### Movement & turtle state

Turtle movement, heading, pen state, and state stack.

- `fd(mm)` [movement, core, embroidery, function, millimetres] — Sew forward n mm. Long moves auto-split at `stitchlen`. aliases: forward.
- `forward(mm)` [movement, embroidery, function, library, millimetres] — Alias for `fd`. Sew forward n mm. alias of: fd.
- `bk(mm)` [movement, core, embroidery, function, millimetres] — Sew backward n mm. aliases: back, backward.
- `back(mm)` [movement, embroidery, function, library, millimetres] — Alias for `bk`. Sew backward n mm. alias of: bk.
- `rt(degrees)` [movement, core, function, heading] — Turn right by deg degrees. aliases: right.
- `right(degrees)` [movement, function, heading, library] — Alias for `rt`. Turn right by deg degrees. alias of: rt.
- `lt(degrees)` [movement, core, function, heading] — Turn left by deg degrees. aliases: left.
- `left(degrees)` [movement, function, heading, library] — Alias for `lt`. Turn left by deg degrees. alias of: lt.
- `up()` [movement, core, embroidery, function, mode] — Needle up — subsequent moves are jump travels, not stitches. aliases: penup, pu.
- `down()` [movement, core, embroidery, function, mode] — Needle down — subsequent moves sew stitches. aliases: pendown, pd.
- `penup` [movement, embroidery, function, library, mode] — Alias for `up`. Needle up — jump travel mode. alias of: up.
- `pendown` [movement, embroidery, function, library, mode] — Alias for `down`. Needle down — sewing mode. alias of: down.
- `arc(degrees, radius)` [movement, core, embroidery, function, heading, millimetres, mode] — Sew along a circle of radius mm, turning deg in total. Positive degrees curves right, negative left. Works in every stitch mode — including satin!
- `circle(radius)` [movement, core, embroidery, function, mode] — Sew a full closed circle of radius r — exactly `arc 360 r`. Works in every stitch mode (satin ring, bean loop, etc.).
- `setxy(x, y)` [movement, core, embroidery, function] — Move (sew or jump depending on pen state) to the absolute position (x, y).
- `setx(x)` [movement, core, function] — Set the x coordinate absolutely; y stays the same.
- `sety(y)` [movement, core, function] — Set the y coordinate absolutely; x stays the same.
- `seth(degrees)` [movement, core, function, heading] — Set the heading absolutely. 0 = up/north, clockwise positive. aliases: setheading.
- `setheading(degrees)` [movement, function, heading, library] — Alias for `seth`. Set heading in degrees (0 = north, clockwise). alias of: seth.
- `home()` [movement, core, embroidery, function, heading] — Return to origin (0, 0) with heading 0 (north). Sews/jumps depending on pen state.
- `moveto(x, y)` [movement, core, embroidery, function] — Reposition the needle to `(x, y)` as a jump, without sewing. Pen state is preserved: if the pen was down it ends down and the next move sews normally; if up it stays up. aliases: jump.
- `jump(x, y)` [movement, embroidery, function, library] — Alias for `moveto`. The embroidery industry term for a non-sewing travel. Pen state preserved. alias of: moveto.
- `gohome()` [movement, core, embroidery, function, heading] — Jump to `(0, 0)` without sewing — pen state preserved. Does not reset heading; add `seth 0` for a full neutral reset.
- `push()` [movement, core, embroidery, function, heading] — Save needle state (position, heading, pen up/down) onto a stack. Max 500 saved states.
- `pop()` [movement, core, embroidery, function] — Restore the last saved needle state from the stack. Pop on an empty stack warns and is ignored.
- `cs()` [movement, core, embroidery, function] — Accepted for Logo familiarity; does nothing in NeedleScript. aliases: clearscreen, clear.
- `xcor()` [movement, embroidery, library, millimetres, variable] — Reports the current needle x position in mm.
- `ycor()` [movement, embroidery, library, millimetres, variable] — Reports the current needle y position in mm.
- `heading()` [movement, heading, library, variable] — Reports the current heading in degrees (0 = north, clockwise positive).
- `repcount()` [movement, library, variable] — Reports the 1-based counter of the innermost `repeat` loop.
- `backward(mm)` [movement, embroidery, function, library, millimetres] — Alias for `bk`. Sew backward n mm. alias of: bk.
- `pu()` [movement, embroidery, function, library, mode] — Alias for `up`. Needle up — subsequent moves are jump travels, not stitches. alias of: up.
- `pd()` [movement, embroidery, function, library, mode] — Alias for `down`. Needle down — subsequent moves sew stitches. alias of: down.
- `clearscreen()` [movement, embroidery, function, library] — Alias for `cs`. Accepted for Logo familiarity; does nothing in NeedleScript. alias of: cs.
- `clear()` [movement, embroidery, function, library] — Alias for `cs`. Accepted for Logo familiarity; does nothing in NeedleScript. alias of: cs.

### Transforms

Block-scoped affine transforms.

- `translate(dx, dy)` [transforms, block, core, geometry, keyword, millimetres] — Shift everything the block draws by `(dx, dy)` mm. The turtle stays in local space — only emitted geometry moves.
- `rotate(degrees)` [transforms, block, core, heading, keyword] — Rotate the block `deg` degrees clockwise about the current origin (0 = north, matching `seth`/`rt`).
- `rotateabout(degrees, cx, cy)` [transforms, block, core, heading, keyword] — Rotate the block `deg` clockwise about the pivot `(cx, cy)`.
- `scale(s)` [transforms, block, core, embroidery, keyword] — Uniformly scale the block by `s`. Stitch length, satin width and the physics layer are re-evaluated after scaling, so a scaled motif still sews like real embroidery — not stretched stitches.
- `scalexy(sx, sy)` [transforms, block, core, embroidery, keyword] — Scale the block by `sx` on x and `sy` on y. Non-uniform scale makes satin width direction-dependent (a column running across the stretched axis widens).
- `mirror(degrees)` [transforms, block, core, heading, keyword] — Reflect the block across a line through the origin at heading `deg`. `mirror 0` flips left/right; `mirror 90` flips top/bottom.
- `skew(ax, ay)` [transforms, block, core, heading, keyword] — Shear the block: `x += tan(ax)·y`, `y += tan(ay)·x`.
- `transform(a, b, c, d, e, f)` [transforms, block, core, keyword] — Apply the raw affine `(x, y) → (a·x + c·y + e, b·x + d·y + f)` to the block — the power-user escape hatch behind the named transforms.

### Effects

Block-scoped nonlinear and stitch effects.

- `warp(reporter)` [effects, block, core, embroidery, geometry, keyword] — Map every emitted point through a `@name` reporter (a procedure that takes a point `[x, y]` and returns a point), before stitch splitting — a geometric deformation, exactly like a transform but nonlinear. This is the shader: fisheye, ripple, twist, domain-warp are all just reporters.
- `humanize(amount)` [effects, block, core, embroidery, keyword, millimetres, seeded] — Perturb each stitch penetration by coherent, seeded simplex noise (the hand drifts, so consecutive stitches err together — not white-noise damage). Runs after stitch splitting, on the final penetrations. `amount` is the jitter in mm (clamped 0–2). Draws exactly one value from the seeded stream (forks), so dropping a `humanize` block shifts downstream randomness by one draw, not by however many stitches were inside.
- `snaptogrid(cell)` [effects, block, core, keyword, millimetres, pure] — Snap each penetration to a fixed hoop-space lattice, evaluated outside any enclosing transform — so the same grid config always yields the same lattice regardless of `translate`/`rotate`/`scale`. Pure and drawless. Overloads by arity:
- `declump(limit) | declump(limit, maxshift)` [effects, block, core, embroidery, geometry, keyword, millimetres, pure] — Ease crowded needle penetrations along the thread's own line of travel — never sideways, so stitch angles stay intact. Each penetration that exceeds `limit` layers of coverage is slid backward or forward along its axis until it finds clear fabric, within `maxshift` mm (default 1.5, clamped 0–5). Runs after stitch splitting, like `humanize`. Drawless (zero RNG draws) — adding or removing the block never reshuffles…

### Trace

Capturing turtle geometry as path data.

- `` [trace, block, embroidery, geometry, keyword, library] — Run a block in a sandbox — full language semantics, but the stitch machine is disconnected. Nothing is sewn, and on exit the turtle and all stitch state are restored. Returns the single pen-down path (a list of `[x, y]` points) at move-command resolution, unaffected by `stitchlen`. Errors if the block draws more than one pen-down run (use `tracerings` for that).
- `` [trace, block, embroidery, geometry, keyword, library] — Like `trace`, but captures every pen-down run as a separate path. Returns a list of paths (list of lists of `[x, y]` points), in drawing order. Each pen-up/pen-down boundary starts a new ring.

### Stitching & machine control

Thread, fill, satin, planning, material, and machine commands.

- `stitchlen(mm) | stitchlen([a, b, …]) | stitchlen([a, b, …] phase) | stitchlen(@fn)` [stitching, core, embroidery, function, millimetres] — Running-stitch length, clamped 0.4–12 mm (default 2.5). Alias: `stitchlength` aliases: stitchlength.
- `stitchlength(mm)` [stitching, embroidery, function, library, millimetres] — Alias for `stitchlen`. Running-stitch length 0.4–12 mm. alias of: stitchlen.
- `satin(width)` [stitching, core, embroidery, function, geometry, heading, millimetres] — Zigzag satin column of this width; penetration spacing set by `density`. `satin 0` returns to running stitch. Width > ~8 mm risks snagging.
- `satinbetween(railA, railB) | satinbetween(railA, railB, checkpoints) | satinbetween(railA, railB, @shape) | satinbetween(railA, railB, checkpoints, @shape)` [stitching, call-syntax, core, embroidery, function, geometry, millimetres, pure] — Sews an immediate satin column between two independently authored path rails. Rails are mapped through the active transform/warp before arc-length pairing, so `density`, underlay, pull compensation, short-stitch relief, coverage, and ceiling checks use physical millimetres. Both rails must both be open or both be explicitly closed.
- `satincap(mode)` [stitching, core, embroidery, function, geometry, mode, pure] — Choose the construction at both ends of an open spine or rail-pair satin column. `'legacy'` preserves existing output; `'butt'` finishes at full width; `'taper'` narrows over `satincaplen` while retaining a safe terminal bite; `'point'` converges both rails with coincident tip penetrations merged; `'round'` fans through a semicircular profile when the column is long enough. Closed columns have no caps and retain t… Example: `satincap 'taper'`.
- `satincaplen(mm)` [stitching, core, embroidery, function, geometry, millimetres] — Set the physical transition length used by taper, point, and round caps. Range 0.4–20 mm; default 2. On a short column each end is bounded to half the available spine length. Round caps fall back to point when a true semicircle cannot fit. Example: `satincaplen 2`.
- `satinjoin(mode)` [stitching, core, embroidery, function, geometry, millimetres, mode, pure] — Choose how sharp corners at or above `satincorner` are constructed. `'legacy'` preserves the previous event stream; `'continuous'` keeps one continuous zigzag with short-stitch relief; `'fan'` distributes at most eight outer-rail penetrations around the turn and keeps at most two shortened inner bites; `'miter'` overlaps straight legs at their bounded rail intersections; `'split'` ends and restarts the topping leg… Example: `satinjoin 'fan'`.
- `satincorner(degrees)` [stitching, core, embroidery, function, heading] — Set the minimum absolute change in travel direction that selects a non-legacy satin join. Range 5–175 degrees; default 60. Lower values classify gentler bends as corners. Measured after the authored output transform in physical hoop space. Example: `satincorner 35`.
- `satinwide(mode)` [stitching, core, embroidery, function, geometry, pure] — Choose how columns wider than `satinmaxwidth` are handled. `'warn'` is the byte-identical legacy path. `'split'` partitions a safe open, smooth column into adjacent hoop-space subcolumns. Shared seams alternate ownership of the `satinsplitoverlap` band so the topping interlocks without a fixed double-density strip. Each subcolumn sews its underlay before topping, and nearest-end routing limits jumps. Closed column… Example: `satinwide 'split'`.
- `satinmaxwidth(mm)` [stitching, core, embroidery, function, millimetres] — Set the physical hoop-space width ceiling that activates and sizes `satinwide 'split'`. Range 2–12 mm; default 7.5. It does not replace the legacy snag warning while `satinwide 'warn'` is active. Example: `satinmaxwidth 7.5`.
- `satinsplitoverlap(mm)` [stitching, core, embroidery, function, millimetres] — Set the physical width alternately assigned across neighboring split-column seams. Range 0–1 mm; default 0.5. The shared seam moves by half this amount to avoid both gaps and a stationary double-density band. Example: `satinsplitoverlap 0.5`.
- `density(spacing)` [stitching, core, embroidery, function, millimetres] — Satin penetration spacing, 0.25–5 mm (default 0.4).
- `bean(count)` [stitching, core, embroidery, function] — Bold line: each stitch sewn n times (forced odd, max 9). `bean 1` off.
- `estitch(mm)` [stitching, core, embroidery, function, millimetres] — Blanket stitch: prongs of this length on the left of travel direction, spaced by `stitchlen`. `estitch 0` off.
- `beginfill()` [stitching, core, embroidery, function] — Start tracing a fill boundary. Moves between `beginfill` and `endfill` define the shape rather than sewing. A pen-up move starts a new ring — inner rings become holes (even-odd rule).
- `endfill()` [stitching, core, embroidery, function] — Close the fill boundary and sew a tatami fill of the enclosed area.
- `fill(field)` [stitching, core, embroidery, function, geometry] — Arm a programmable fill for the next `beginfill…endfill`. `fill dir @field` drives row direction; `fill shape @texture` drives spacing/length/brick; `fill paths @generator` supplies ordered path geometry; `fill paths pathsExpr` freezes static paths. The engine retains clipping, pull compensation, underlay, subdivision, coverage, and budgets.
- `fillangle(degrees)` [stitching, core, embroidery, function, heading] — Direction of the fill stitch rows, in degrees (default 0 = vertical).
- `fillspacing(mm)` [stitching, core, embroidery, function, millimetres] — Fill row spacing, 0.25–5 mm (default 0.4).
- `fillinset(mm)` [stitching, core, embroidery, function, geometry, millimetres] — Reserve space inside a fill boundary for a later border. Range 0–10 mm (default 0). The complete compound even-odd region is inset in physical hoop space: outer boundaries shrink, holes expand, and concave regions may split. Topping and fill underlay use the inset region; disconnected pieces are crossed only by jumps. Collapsed or split geometry warns with a source line and preview location. Example: `fillinset 0.4`.
- `filledgerun(mm)` [stitching, core, embroidery, function, geometry, millimetres] — Add a closed boundary pass after fill underlay and before topping, inset by the requested physical distance. Range 0–10 mm; 0 disables it (default). Compound even-odd geometry keeps outer and hole contours inside the construction region and jumps between disconnected contours. Acute-corner penetrations are bounded, and dense overlap near a later border warns. Example: `filledgerun 0.5`.
- `filledgeshort(mm)` [stitching, core, embroidery, function, geometry, millimetres] — Omit open topping row fragments shorter than this physical hoop-space length before connector routing. Range 0–10 mm; 0 disables it (default). Applies to fixed tatami, programmable streamlines, and open custom fill paths; underlay and closed decorative contours are unchanged. Example: `filledgeshort 0.7`.
- `fillstagger(mode)` [stitching, core, embroidery, function, geometry, mode] — Choose the topping-row phase policy. `'legacy'` preserves existing output; `'brick'` alternates 0 and `fillstaggeramount`; `'progressive'` repeats the wrapped four-row cycle `0, amount, 3×amount, 2×amount`; `'random'` hashes row geometry into a stable phase without drawing from the seeded RNG. A `fill shape @fn` reporter retains its cumulative phase as the base, then the policy offset is added and wrapped. Fill un… Example: `fillstagger 'progressive'`.
- `fillstaggeramount(fraction)` [stitching, core, embroidery, function, millimetres, mode] — Set the wrapped phase fraction used by non-legacy fill staggering. Range 0–1; default 0.65. With fixed fill length, the fraction is multiplied by that length. List/reporter forms use the first effective stitch length of each row. Policy-created edge fragments below 0.4 mm are merged with a spatial, source-attributed warning. Example: `fillstaggeramount 0.65`.
- `fillconnect(mode)` [stitching, core, embroidery, function, geometry, millimetres] — Choose how topping rows and custom fill-path fragments connect. `'legacy'` preserves existing short sewn connectors. `'inside'` sews only when the complete physical hoop-space segment stays inside the compound fill region with edge clearance. `'jump'` always uses jump travel. `'trim'` jumps and cuts first when the connector reaches the active `autotrim` threshold (or 7 mm while automatic trimming is off). Fill und… Example: `fillconnect 'inside'`.
- `filllen(mm) | filllen([a, b, …]) | filllen(@fn)` [stitching, core, embroidery, function, millimetres] — Fill stitch length. Defaults to `stitchlen`. `filllen 0` follows `stitchlen` again.
- `color(n)` [stitching, core, embroidery, function] — Switch to numeric thread n, or resolve a color string such as `color '#e94560'` or `color 'crimson'`.
- `palette(colors)` [stitching, core, embroidery, function, stateful, top-level] — Top-level, once-only palette metadata. Takes a list of 1–64 colors and must precede stitches, `color`, and `stop`.
- `background(color)` [stitching, core, embroidery, function, stateful, top-level] — Top-level fabric-color metadata. Must precede the first stitch and does not affect DST output.
- `stop()` [stitching, core, embroidery, function] — Shorthand for "next colour" — equivalent to incrementing the thread number by 1.
- `trim()` [stitching, core, embroidery, function] — Cut the thread here. Long travels also get one automatically (see `autotrim`).
- `lock(size)` [stitching, core, embroidery, function, millimetres] — Tie-in/tie-off: 4 micro back-stitches where thread starts/ends. Size 0.3–1.5 mm (default 0.7). `lock 0` off.
- `compensation(mode)` [stitching, core, embroidery, function, geometry, mode, pure] — Choose compensation semantics. `'legacy'` (default) preserves scalar `pullcomp` for satin and fill. `'directional'` applies the grain-aligned tensor across satin columns and along open fill-row endpoint tangents in final physical hoop space. Curved rows resolve each end independently; closed fill contours stay unchanged. Endpoint crossings of an authored outer boundary or hole warn spatially—use `fillinset` to res… Example: `compensation 'directional'`.
- `pullcomp(mm)` [stitching, core, embroidery, function, geometry, millimetres, stateful] — Pull compensation 0–1.5 mm: widens satin columns and extends open fill rows so shapes sew out at their digitized size. Under `compensation 'directional'`, it replaces the material tensor's mean pull magnitude while retaining declared stretch anisotropy; satin projects it across columns and fills project it along physical endpoint tangents. Reserve border overlap with `fillinset`.
- `shortstitch(on)` [stitching, core, embroidery, function] — Curve physics (on by default): on tight satin curves, alternate inner stitches are shortened to 60% width to prevent thread breaks.
- `autotrim(mm)` [stitching, core, function, millimetres] — Auto trim before travels ≥ n mm (default 7, range 3–30). `autotrim 0` off.
- `maxdensity(layers)` [stitching, core, embroidery, function] — Thread-coverage warning threshold in layers (default 3.5). `maxdensity 0` silences warnings.
- `hoop(preset) | hoop(diameter) | hoop(dimensions) | hoop(shapedDimensions)` [stitching, core, embroidery, function, millimetres, mode] — Configure the physical hoop for this design. The sewable field is the hoop inset by 3 mm on every side.
- `override(key, value)` [stitching, core, embroidery, function, geometry] — Raise (with a warning) or lower (with an info note) a run-envelope budget.
- `plan(mode)` [stitching, block, core, embroidery, function, geometry, top-level] — Top-level travel-planning directive. With no `routegroup`, `plan 'nearest'` greedily reorders whole thread runs within each color block after execution and before autotrim/locks. Once any route group executes, only grouped runs are eligible and ungrouped output remains authored; grouped intersections also receive bounded 2-opt improvement. `plan 'reversing-nearest'` may enter eligible stitch-only runs from their n… Example: `plan 'reversing-nearest'`.
- `preflight(mode)` [stitching, core, embroidery, function, mode, top-level] — Select the post-run diagnostic policy. `preflight 'off'` (the default) keeps existing always-on warnings and their structured locations, but skips extended event-stream and construction recommendations. `preflight 'warn'` adds those extended checks without changing stitches or turning findings into legacy console warnings. `preflight 'strict'` runs the same checks and rejects the run only when a finding has severi… Example: `preflight 'warn'`.
- `planbarrier()` [stitching, core, embroidery, function, geometry] — Start a new independent travel-planner segment at this point in the authored stitch stream. Planning may reorder runs on either side, but never moves a run across the barrier. `planbarrier` emits no stitch, jump, trim, color, or mark. During normal sewing execution it is completely inert when planning is absent or `plan 'off'`, including leaving buffered construction untouched. Consecutive barriers and barriers be… Example: `fd 5 planbarrier rt 90 fd 5`.
- `atomic()` [stitching, block, core, embroidery, function] — Treat every routable run emitted by the block as one indivisible, forward-only travel-planner item. Internal stitches, jumps, trims, marks, underlay, and topping retain their authored order while the complete item may move within its color and `planbarrier` segment. Nested `atomic` blocks belong to the outermost span. With planning absent or `plan 'off'`, the block is byte-identical to its body and does not flush… Example: `atomic [ underlay 'edge' satin 4 fd 20 ]`.
- `routegroup()` [stitching, block, core, embroidery, function] — Make the block's independent thread runs eligible for deterministic nearest routing followed by a bounded 2-opt improvement pass. The group's position is fixed: only runs inside it reorder, and when any `routegroup` executes, output outside all groups stays in authored order. Color changes and `planbarrier` boundaries split planning into independent intersections. An `atomic` inside the group remains one forward-o… Example: `routegroup [ moveto -20 0 down fd 5 up trim moveto 5 0 down fd 5 up trim moveto 12 0 down fd 5 ]`.
- `fabric(preset)` [stitching, core, function, millimetres, mode] — Apply a fabric preset. Sets pull compensation, density limit, and underlay defaults. Example: `fabric 'knit'`.
- `fabricgrain(degrees)` [stitching, core, embroidery, function, geometry, heading] — Record the fabric grain heading as turtle degrees: 0 points up and positive angles turn clockwise. Values wrap to 0–360. It feeds preview diagnostics and opt-in `compensation 'directional'` satin/fill geometry. Example: `fabricgrain 90`.
- `fabricstretch(along, across)` [stitching, core, embroidery, function, stateful] — Record fractional stretch along and across the grain, each from 0 to 1. The values redistribute directional preview and opt-in satin/fill pull while preserving its mean magnitude. A later `fabric` command restores that profile's neutral stretch defaults. Example: `fabricstretch 0.15 0.5`.
- `threadprofile(profile)` [stitching, core, embroidery, function, geometry, millimetres] — Select generic `'rayon-40wt'`, `'rayon-60wt'`, `'polyester-40wt'`, or `'polyester-60wt'` metadata. 40 wt resolves to an approximate 0.4 mm width and 60 wt to 0.3 mm. A later `threadwidth` overrides that default. Width scales live coverage queries, the final heatmap, and density warnings without changing stitch geometry. Example: `threadprofile 'polyester-40wt'`.
- `threadwidth(mm)` [stitching, core, embroidery, function, geometry, millimetres] — Override the active thread profile's approximate width with 0.1–1 mm. The width scales live coverage queries, final heatmap layers, and density warnings. It never changes stitch geometry or rescales the active `maxdensity` threshold. Example: `threadwidth 0.4`.
- `needle(sizeNM)` [stitching, core, embroidery, function] — Record an advisory NM needle size: 60, 65, 70, 75, 80, 90. Use `needle 0` to leave the size unspecified. Needle metadata does not alter stitch generation. Example: `needle 75`.
- `stabilizer(category)` [stitching, core, function] — Record the generic stabilizer category: `'none'`, `'tearaway'`, `'cutaway'`, or `'washaway'`. This is portable intent metadata, not a brand or automatic construction recommendation. Example: `stabilizer 'cutaway'`.
- `topping(enabled)` [stitching, core, function] — Record whether a topping is part of the material setup. Use `topping 1`/`true` when present and `topping 0`/`false` when absent. This advisory metadata does not alter construction. Example: `topping true`.
- `underlay(mode)` [stitching, core, embroidery, function, millimetres] — Stabilising stitches under each satin column. Example: `underlay 'auto'`.
- `underlaypasses(passes)` [stitching, core, embroidery, function] — Set the exact ordered passes sewn beneath every satin column. Accepted pass names are `'center'`, `'edge'`, and `'zigzag'`; duplicates are allowed and an empty list disables underlay. Explicit pass order supersedes `fabric` doubling and `underlay 'auto'`. All underlay events retain the preview `u: 1` flag. Example: `underlaypasses ['center', 'edge']`.
- `underlaylen(mm)` [stitching, core, embroidery, function, millimetres] — Set center/edge running-stitch length and zigzag return-run length, in physical hoop millimetres. Range 0.4–12 mm. It tunes the current legacy pass selection unless `underlaypasses` supplies an explicit order. Example: `underlaylen 2.8`.
- `underlayinset(mm)` [stitching, core, embroidery, function, millimetres] — Set edge-pass inset inward from each topping rail, in physical hoop millimetres (0–10 mm). This command is deliberately absolute-only; ratio-based legacy settings are not overloaded into the same syntax. On a column narrower than twice the inset, the edge walks meet at the center and a warning is emitted. Example: `underlayinset 0.6`.
- `underlayspacing(mm)` [stitching, core, embroidery, function, millimetres] — Set spacing along zigzag underlay passes in physical hoop millimetres. Range 0.25–5 mm. Zigzag width remains the unambiguous built-in 60% column-width ratio. Example: `underlayspacing 1.8`.
- `fillunderlay(mode)` [stitching, core, embroidery, function, millimetres] — Underlay beneath fills. Example: `fillunderlay 'auto'`.
- `fillunderlaypasses(passes)` [stitching, core, embroidery, function, geometry] — Set the exact ordered passes generated from each recorded fill region. Accepted pass names are `'edge'` and `'tatami'`; duplicates repeat and an empty list disables underlay. Explicit order supersedes `fillunderlay 'auto'` and fabric doubling. Custom path fills still generate these passes from the recorded compound region, not from returned decorative paths. Example: `fillunderlaypasses ['edge', 'tatami']`.
- `fillunderlaylen(mm)` [stitching, core, embroidery, function, millimetres] — Set edge-walk and tatami-underlay stitch length in physical hoop millimetres. Range 1–7 mm. It tunes the selected legacy passes unless `fillunderlaypasses` supplies an explicit order. Example: `fillunderlaylen 3`.
- `fillunderlayinset(mm)` [stitching, core, embroidery, function, millimetres] — Set the inward physical inset for edge and tatami fill-underlay passes. Range 0–10 mm. Custom edge passes use a compound even-odd inset, preserving holes, concavities, and disconnected components. Example: `fillunderlayinset 0.8`.
- `fillunderlayspacing(mm)` [stitching, core, embroidery, function, millimetres] — Set tatami-underlay row spacing in physical hoop millimetres. Range 0.25–5 mm. Edge passes are unaffected. Example: `fillunderlayspacing 2.2`.
- `fillunderlayangle(degrees)` [stitching, core, embroidery, function, heading] — Set the tatami-underlay angle relative to the topping direction. Plain fills use `fillangle + offset`; directional fills rotate the local direction field by the same offset before mapping it to hoop space. Any finite degree value is accepted. Example: `fillunderlayangle 90`.
- `seed(n)` [stitching, core, function, seeded] — Reseed the random number generator (default 42). Same seed → same design.
- `print(value)` [stitching, core, function] — Log a value to the console. `print "label expr` adds a label: `print "radius r` → `radius: 1.5`
- `printloc()` [stitching, core, embroidery, function] — Log the current needle position to the console as `loc: [x, y]`.
- `mark() | mark(label)` [stitching, core, embroidery, function] — Drop a numbered pin on the preview at the needle position. Optional string label shown instead of the pin number.
- `chalk(value, label, style)` [stitching, core, embroidery, function, geometry] — Draw a point, path, or group of paths as a removable tailor's-chalk guide on the preview. It does not sew, move the needle, consume random draws, affect coverage, or enter machine exports.
- `assert(condition)` [stitching, core, function] — Stop with an error (and line number) if the condition is false.

### Core math

Core scalar math and turtle reporters.

- `random(max)` [math, call-syntax, function, library, seeded] — Seeded random number in 0…n. Reproducible — driven by `seed`.
- `sin(degrees)` [math, call-syntax, embroidery, function, geometry, heading, library] — Sine of an angle in degrees. Returns a value in −1…1 that rises to 1 at 90°, falls back to 0 at 180°, reaches −1 at 270°, and completes the cycle at 360°. Multiply by the amplitude you need.
- `cos(degrees)` [math, call-syntax, function, geometry, heading, library] — Cosine of an angle in degrees. Identical to `sin` but shifted 90° — `cos(0)` is 1 (peak) while `sin(0)` is 0. Returns a value in −1…1.
- `sqrt(n)` [math, call-syntax, embroidery, function, geometry, library] — Square root — the inverse of squaring. The most common use in generative embroidery is computing Euclidean distance: `sqrt(dx*dx + dy*dy)` gives the length of a line segment. Negative input is a runtime error. For distances between stored points, `vdist` is usually simpler.
- `abs(n)` [math, call-syntax, embroidery, function, library] — Strips the sign from a number — `abs(-3)` and `abs(3)` both return 3. Use it when you need a magnitude regardless of direction, such as mirroring a left/right offset or ensuring a width is never negative.
- `round(n)` [math, call-syntax, function, library] — Round to the nearest integer. `round(2.7)` → 3, `round(2.3)` → 2. Halfway values round away from zero: `round(2.5)` → 3.
- `floor(n)` [math, call-syntax, function, library] — Round down toward negative infinity — always the integer at or below the value. `floor(2.9)` → 2, `floor(-2.1)` → -3.
- `ceil(n)` [math, call-syntax, embroidery, function, library] — Round up toward positive infinity — always the integer at or above the value. `ceil(2.1)` → 3, `ceil(-2.9)` → -2.
- `mod(a, b)` [math, call-syntax, function, library] — Floor modulo — result always has the sign of b. `mod(-7, 3)` is 2, not −1. The `%` operator is the same operation.
- `min(a, b)` [math, call-syntax, function, library] — Minimum of a and b.
- `max(a, b)` [math, call-syntax, function, library] — Maximum of a and b.
- `pow(base, exp)` [math, call-syntax, function, library] — base raised to the exp. Non-finite result is a runtime error.
- `log(n)` [math, call-syntax, function, library] — Natural logarithm (base e) — the inverse of exponential growth. `log(1)` is 0 and `log(pow(e, x))` is x, where `e` is approximately 2.71828. Input must be positive; zero or a negative number is a runtime error. For another base, use `log(x) / log(base)`.
- `atan(x, y)` [math, call-syntax, function, heading, library] — Heading of the vector (x, y) in turtle degrees: 0 = north, clockwise. `atan(1, 0)` is 90.
- `noise(x)` [math, call-syntax, function, library, seeded] — Smooth seeded value noise in 0…1. Sample slowly (divide coordinates by 10–20) for organic drift.
- `noise2(x, y)` [math, call-syntax, function, library, seeded] — 2D smooth seeded value noise in 0…1. Same seed → same field.
- `distance(x, y)` [math, call-syntax, embroidery, function, geometry, library] — Distance from the current needle position to the point (x, y).
- `towards(x, y)` [math, call-syntax, embroidery, function, geometry, heading, library] — Heading from the needle to the point (x, y). `seth towards(0, 0)` aims home.
- `not(value)` [math, call-syntax, function, library] — Logical NOT. Also written `!`. Binds tightly — write `!(a = 1)` when negating a comparison.

### Lists & sequences

List creation, queries, mutation, and sequences.

- `range(n) | range(start, end) | range(start, end, step)` [lists, call-syntax, function, library] — `range(n)` → [0…n-1] `range(a, b)` → [a…b-1] `range(a, b, step)` → stepped
- `filled(count, value)` [lists, call-syntax, embroidery, function, library, millimetres] — Create a new list containing `count` deep copies of `value`. Useful for initialising a collection of slots that you will fill in later with a loop.
- `len(xs)` [lists, call-syntax, function, library] — Element count of a list, or character count of a string.
- `islist(value)` [lists, call-syntax, function, library] — 1 if the value is a list, 0 otherwise.
- `first(list)` [lists, call-syntax, function, library] — Returns the first element of a list (same as `xs[0]`).
- `last(list)` [lists, call-syntax, function, library] — Returns the last element of a list (same as `xs[-1]`).
- `concat(a, b)` [lists, call-syntax, embroidery, function, geometry, library, stateful] — Join two lists end-to-end, returning a new combined list. The elements are shared references (shallow copy) — mutating a nested list in the result also mutates the original. Use `copy` if you need full independence.
- `slice(list, start) | slice(list, start, end)` [lists, call-syntax, function, library] — `slice(xs, start)` or `slice(xs, start, end)` — new list, Python semantics including negative bounds, clamped.
- `reverse(list)` [lists, call-syntax, function, library, pure, stateful] — Returns a new reversed list (pure — does not mutate the original).
- `sort(list)` [lists, call-syntax, function, library, pure, stateful] — Returns a new sorted list. Numbers only, ascending, stable. Pure — does not mutate.
- `copy(list)` [lists, call-syntax, function, library] — Deep copy — fully independent of the original.
- `indexof(list, value)` [lists, call-syntax, function, library] — First index of v (deep tolerant compare) or −1 if not found.
- `contains(list, value)` [lists, call-syntax, function, library] — 1 if the list contains v (deep tolerant compare), 0 otherwise.
- `sum(list)` [lists, call-syntax, function, library] — Sum of all elements. `sum([])` is 0.
- `mean(list)` [lists, call-syntax, embroidery, function, geometry, library] — Arithmetic mean (average) of all elements in the list. Equivalent to `sum(xs) / len(xs)`. Errors on an empty list.
- `minof(list)` [lists, call-syntax, function, library] — Smallest value in a list. Errors on an empty list. Often paired with `maxof` to find the full data range before remapping or normalising.
- `maxof(list)` [lists, call-syntax, function, library, millimetres] — Largest value in a list. Errors on an empty list. Often paired with `minof` to find the full data range.
- `pick(list)` [lists, call-syntax, function, library, seeded] — Returns a random element — seeded, exactly one RNG draw.
- `shuffle(list)` [lists, call-syntax, function, library, pure, seeded, stateful] — Returns a new shuffled list — seeded, forks a child RNG. Pure — does not mutate.
- `pos()` [lists, call-syntax, embroidery, function, library] — Needle position as `[xcor, ycor]`. Pair with `setpos(p)` to save and restore positions.
- `removeat(list, index)` [lists, call-syntax, function, library, stateful] — Mutates: removes element at index i and returns the removed value.
- `append(list, value)` [lists, call-syntax, function, library, stateful] — Mutates: adds v at the end of the list.
- `prepend(list, value)` [lists, call-syntax, function, library, stateful] — Mutates: adds v at the front of the list.
- `insertat(list, index, value)` [lists, call-syntax, function, library, stateful] — Mutates: inserts v at index i (0 through len allowed).
- `setpos(point)` [lists, call-syntax, embroidery, function, geometry, library] — Command: move needle to the point p (like `setxy p[0] p[1]`). Pair with `pos()`.

### Higher-order functions

Procedure references, mapping, filtering, composition, and binding.

- `steps(start, end) | steps(start, end, step)` [higher-order, call-syntax, function, library] — Generate a list of evenly spaced numbers from `start` to `end` (inclusive).
- `map(list, @fn)` [higher-order, call-syntax, function, library] — Return a new list by applying `@fn` to each element of `list`.
- `filter(list, @fn)` [higher-order, call-syntax, function, library] — Return a new list keeping only elements for which `@fn` returns a truthy value.
- `reduce(list, @fn, init)` [higher-order, call-syntax, function, geometry, library] — Fold `list` with `@fn(accumulator, element)` starting from `init`.
- `compose(@fn1, @fn2, ...)` [higher-order, call-syntax, function, library] — Create a left-to-right pipeline from two or more `@references`.
- `bind(@fn, value, ...)` [higher-order, call-syntax, function, library] — Return a configured reference with one or more leading arguments fixed. Values are evaluated once; lists retain reference semantics.
- `isref(value)` [higher-order, call-syntax, function, library] — Return 1 when the value is a plain, bound, composed, or capturing reference; otherwise 0.

### Strings

String conversion, queries, and transformations.

- `str(n)` [strings, call-syntax, function, library] — Convert a number to its string representation (same as `print` shows). `str` of a string is identity.
- `num(s) | num(s, fallback)` [strings, call-syntax, function, library] — Parse a numeric string. Errors on non-numeric input unless a fallback is given.
- `isstring(value)` [strings, call-syntax, function, library] — 1 if the value is a string, 0 otherwise. The sibling of `islist`.
- `chars(s)` [strings, call-syntax, function, library] — Split a string into a list of 1-character strings. Bridge to the whole list toolkit.
- `split(s, sep)` [strings, call-syntax, function, library] — Split `s` at every occurrence of `sep`. `sep` must be non-empty.
- `joinstr(xs, sep)` [strings, call-syntax, function, library] — Concatenate a list of strings with `sep` between each. All elements must be strings.
- `upper(s)` [strings, call-syntax, function, library] — Return a copy of `s` with ASCII letters uppercased (A–Z only).
- `lower(s)` [strings, call-syntax, function, library] — Return a copy of `s` with ASCII letters lowercased (a–z only).
- `strip(s)` [strings, call-syntax, embroidery, function, library] — Return `s` with leading and trailing whitespace (space, tab, newline) removed.
- `repeatstr(s, n)` [strings, call-syntax, function, library] — Return `s` repeated `n` times (n must be a non-negative integer).

### Colors

Color construction, interpolation, palette matching, and active color metadata.

- `rgb(r, g, b)` [colors, call-syntax, embroidery, function, library, pure] — Return a normalized hex color from red, green, and blue channels in 0…1. Values outside the range are clamped. Pure and drawless.
- `hsl(h, s, l)` [colors, call-syntax, embroidery, function, library, pure] — Return a normalized hex color from hue in degrees plus saturation and lightness in 0…1. Hue wraps; saturation and lightness clamp. Pure and drawless.
- `hexparts(color)` [colors, call-syntax, embroidery, function, library, pure] — Parse a supported color string and return normalized `[r, g, b]` channels in 0…1. Pure and drawless.
- `lerpcolor(a, b, t) | lerpcolor(a, b, t, mode)` [colors, call-syntax, embroidery, function, library, pure] — Interpolate colors at unclamped `t`. The default mode is perceptual OKLab; pass `'rgb'` as a fourth argument for raw sRGB interpolation. Returns a normalized hex color. Pure and drawless.
- `nearestcolor(color, colors)` [colors, call-syntax, embroidery, function, library, pure] — Return the lowest-index color in a non-empty palette with the smallest perceptual OKLab distance from `color`. Pure and drawless.
- `colordist(a, b)` [colors, call-syntax, embroidery, function, library, pure] — Return the OKLab distance between two supported color strings. Smaller values are more visually similar. Pure and drawless.
- `slotcolor(slot)` [colors, call-syntax, embroidery, function, library, pure] — Return the normalized hex color for a 1-based palette slot, including the deterministic default color for an undeclared slot. Reads metadata, emits nothing, and draws nothing.
- `colorindex()` [colors, call-syntax, embroidery, function, library, pure] — Return the active thread slot as a 1-based index. Reads machine state, emits nothing, and draws nothing.
- `colorhex()` [colors, call-syntax, embroidery, function, library, pure] — Return the normalized hex color of the active thread slot. Reads palette metadata, emits nothing, and draws nothing.
- `backgroundcolor()` [colors, call-syntax, embroidery, function, library, pure] — Return the normalized resolved background color. Reads design metadata, emits nothing, and draws nothing.

### Generative scalar math

Interpolation, seeded distributions, and noise fields.

- `lerp(a, b, t)` [generative-scalars, call-syntax, embroidery, function, geometry, library, millimetres] — Blend smoothly between two values. Returns `a` when `t = 0`, `b` when `t = 1`, and the midpoint when `t = 0.5`. `t` is unclamped — values outside 0…1 extrapolate.
- `remap(value, inMin, inMax, outMin, outMax)` [generative-scalars, call-syntax, embroidery, function, library, millimetres] — Linearly rescale a value from one range to another — like converting between units. `remap(value, inMin, inMax, outMin, outMax)` maps `inMin → outMin` and `inMax → outMax`. Result is unclamped; use `clamp` around it if the input might exceed the source range.
- `clamp(value, min, max)` [generative-scalars, call-syntax, embroidery, function, library] — Constrain a value so it never falls below `min` or above `max`. Equivalent to `min(max(value, lo), hi)`. Use it when a calculation might produce negative lengths, out-of-range widths, or other implausible values.
- `smoothstep(edge0, edge1, x)` [generative-scalars, call-syntax, embroidery, function, library] — S-curve transition: returns 0 when `x ≤ edge0`, 1 when `x ≥ edge1`, and a smooth ease-in/ease-out curve in between. The curve accelerates from 0 then decelerates into 1, so transitions look far more natural than a straight `lerp`.
- `gauss(mean, sigma)` [generative-scalars, call-syntax, function, library, seeded] — Seeded normally-distributed random number centred on `mean` with spread `sigma`. Unlike `random` (uniform), most values land close to the mean — only occasionally straying far. The larger `sigma` is, the wider the spread.
- `snoise2(x, y)` [generative-scalars, call-syntax, function, library, seeded] — Seeded simplex noise in −1…1 (industry convention). Slightly finer-grained than legacy `noise2` (0…1).
- `snoise3(x, y, z)` [generative-scalars, call-syntax, function, library, seeded] — Seeded 3D simplex noise in −1…1. Use z for variation: `snoise3(x/14, y/14, motif*50)` gives each motif its own noise field.
- `fbm2(x, y, octaves)` [generative-scalars, call-syntax, embroidery, function, library, seeded] — Fractal Brownian motion — layers multiple octaves of `snoise2` at increasing frequencies and decreasing amplitudes. Each octave adds finer detail on top of the large-scale shape, producing a rich, cloud-like texture. Returns approximately −1…1.

### Vectors

Point and vector arithmetic.

- `vadd(a, b)` [vectors, call-syntax, function, geometry, library] — Add two 2D vectors (stored as `[x, y]` lists), returning a new point. Use it to offset a position by a direction or to accumulate steps.
- `vsub(a, b)` [vectors, call-syntax, function, geometry, heading, library] — Subtract vector `b` from `a`, returning a new point `[a[0]-b[0], a[1]-b[1]]`. The result is also the displacement vector from `b` to `a` — useful for computing the direction between two stored positions before normalising with `vnorm`.
- `vscale(vector, scale)` [vectors, call-syntax, function, geometry, library, millimetres] — Multiply both components of a vector by scalar `s`, returning a new point. Use it to extend or shorten a direction vector, or to resize an offset.
- `vlerp(a, b, t)` [vectors, call-syntax, function, geometry, library] — Interpolate between two 2D points — returns `a` at `t = 0`, `b` at `t = 1`. Works like `lerp` but for positions. Good for moving along a line segment, finding a midpoint, or distributing jump targets evenly between two anchor points.
- `vdot(a, b)` [vectors, call-syntax, embroidery, function, geometry, heading, library] — Dot product: `a[0]*b[0] + a[1]*b[1]`. Measures how much two vectors point in the same direction. Positive when they agree, 0 when perpendicular, negative when they oppose each other.
- `vlen(vector)` [vectors, call-syntax, embroidery, function, geometry, library] — Length (magnitude) of a vector: `sqrt(v[0]² + v[1]²)`. Returns the distance from the origin to the point, or the "size" of a direction vector. To measure between two stored points, use `vdist`.
- `vdist(a, b)` [vectors, call-syntax, function, geometry, library] — Euclidean distance between two `[x, y]` points. Equivalent to `vlen(vsub(b, a))` but more readable. Use whenever you need the gap between two stored positions (e.g. decide whether to trim, check spacing, scale a motif).
- `vnorm(vector)` [vectors, call-syntax, embroidery, function, geometry, heading, library, millimetres, pure] — Returns a unit vector (length exactly 1.0) pointing in the same direction. Use it when you need a pure direction without caring about magnitude — then multiply by the length you want with `vscale`. The zero vector is a runtime error.
- `vrot(vector, degrees)` [vectors, call-syntax, embroidery, function, heading, library, millimetres] — Rotate a vector clockwise by `deg` degrees. The rotation matches NeedleScript's turtle convention (clockwise positive, 0 = north). Use it to create perpendicular offsets, fan spread patterns, or to generate N evenly-rotated copies of a direction.
- `vheading(vector)` [vectors, call-syntax, embroidery, function, geometry, heading, library] — Convert a 2D vector to a turtle heading in degrees (0 = north, clockwise positive). Equivalent to `atan(v[0], v[1])`. Use it with `seth` to aim the needle along a computed direction or path tangent.
- `vfromheading(degrees, length)` [vectors, call-syntax, embroidery, function, geometry, heading, library, millimetres] — Make a 2D vector of the given `length` pointing in turtle heading `deg`. The inverse of `vheading`. Use it to compute offsets in any direction relative to the needle's current path.

### Segments

Segment intersection and distance queries.

- `segisect(a0, a1, b0, b1)` [segments, call-syntax, function, geometry, library] — Intersection point [x, y] of segment a0→a1 and segment b0→b1, or [] if they don't cross. Segment test, not infinite-line — endpoints must actually meet. Collinear overlapping segments return the midpoint of the overlap.
- `segdist(p, a, b)` [segments, call-syntax, function, geometry, library] — Shortest distance from point p to the segment a→b. If the perpendicular foot falls outside the segment, returns the distance to the nearer endpoint. A zero-length segment behaves like vdist(p, a).
- `nearestonpath(p, path)` [segments, call-syntax, function, geometry, library] — The closest point to p lying anywhere on path (vertices or along segments). Returns [x, y]. The path is treated as open (no implicit closing segment). O(len(path)) per call.

### Paths & curves

Path measurement, editing, resampling, curves, and routing.

- `pathlen(path)` [paths-curves, call-syntax, embroidery, function, geometry, library, millimetres] — Total length of a polyline path in mm — the sum of all segment lengths. Use it to normalise travel along a curve (compute `t = distanceSoFar / pathlen(path)`), decide how many stitches to place, or verify a path is the expected size.
- `resample(path, spacing)` [paths-curves, call-syntax, embroidery, function, geometry, library, millimetres] — New path whose consecutive vertices are each exactly `spacing` mm apart (last segment may be shorter). The bridge between math curves and physical stitch spacing — generate an arbitrary shape with `trace`/`bezier`/`catmull`, then `resample` it to stitch pitch before `sewpath`.
- `chaikin(path, iterations)` [paths-curves, call-syntax, embroidery, function, geometry, library] — Corner-cut smoothing: each pass replaces every sharp vertex with two new points placed 25% and 75% along the incoming and outgoing edges, rounding the bend into a smooth curve. Applying multiple iterations produces progressively rounder, more organic shapes.
- `catmull(points, spacing)` [paths-curves, call-syntax, embroidery, function, geometry, library, millimetres] — Smooth curve that passes exactly through every control point. Unlike Bézier curves, you do not need to supply separate handles — the spline infers the curvature from neighbouring points automatically. Resampled to `spacing` mm for sewing.
- `bezier(p0, c0, c1, p1, spacing)` [paths-curves, call-syntax, embroidery, function, geometry, library, millimetres] — Cubic Bézier from start `p0` to end `p1`, shaped by control handles `c0` (near the start) and `c1` (near the end). The curve is pulled toward the handles without passing through them — the further out you place a handle, the more the curve bends in that direction. Resampled to `spacing` mm for sewing.
- `centroid(path)` [paths-curves, call-syntax, function, geometry, library] — The geometric centre of a path — the average position of all its vertices. Use it to anchor rotation, find the middle of a region, or place a motif at the heart of a `voronoi` cell or scatter cluster.
- `bbox(path)` [paths-curves, call-syntax, function, geometry, library, millimetres] — Returns the smallest axis-aligned rectangle enclosing the path, as `[minx, miny, maxx, maxy]`. Use it to check a design's extents, frame a motif, compute a safe scatter region, or normalise coordinates to fit a specific area.
- `routesort(items) | routesort(items, start) | routesort(items, mode) | routesort(items, start, mode)` [paths-curves, call-syntax, function, geometry, library, mode, pure] — Returns a new greedily routed list. `routesort(items)` anchors the first item; `routesort(items, start)` starts nearest `[x,y]`. Mode `'both'` may return reversed copies of path elements so their nearer endpoint is entered first; `'chain'` is the default. Pure, deterministic, and drawless.
- `sewpath(path)` [paths-curves, call-syntax, embroidery, function, geometry, library, mode] — Exactly `for p in path [ setpos(p) ]`. Pen state, stitch mode, satin, and auto-split all apply as if hand-walked.
- `curveflat(spec, tolerance) | curveflat(spec, tolerance, mode)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Adaptively flatten editable cubic anchors into a path at `tolerance` millimetres. Relative handles and compact corner anchors are supported; optional mode `'closed'` closes the curve. Pure and drawless.
- `curvepath(spec, spacing) | curvepath(spec, spacing, phase) | curvepath(spec, spacing, phase, mode)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Flatten an editable cubic curve spec at 0.05 mm tolerance, then arc-length resample it with numeric, list, or reporter spacing. Optional phase and `'open'`/`'closed'` mode follow `resample` semantics.
- `isclosed(path)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return `1` when a path explicitly repeats its first point at the end, otherwise `0`. Non-empty path validation still applies. Pure and drawless.
- `openpath(path)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return a new open path by removing a duplicate final point when the input is canonically closed. Other vertices are preserved. Pure and drawless.
- `pathorientation(path)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return `1` for counter-clockwise, `-1` for clockwise, or `0` for a degenerate path, using the implicit closing segment. Pure and drawless.
- `pointat(path, t)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return the point at normalized arc-length parameter `t` on an open path. Parameters are clamped to 0…1. Pure and drawless.
- `headingat(path, t)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return the turtle heading of an open path at normalized arc-length parameter `t`. Parameters are clamped to 0…1. Pure and drawless.
- `normalat(path, t)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return the turtle heading of the normal pointing left of path travel at normalized arc-length parameter `t`. Pure and drawless.
- `paramof(point, path)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Project a point to the nearest location on an open path and return its normalized arc-length parameter in 0…1. Pure and drawless.
- `paramtomm(path, t)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Convert normalized arc-length parameter `t` to millimetres along a path. The parameter is clamped to 0…1. Pure and drawless.
- `mmtoparam(path, mm)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Convert a distance in millimetres along a path to normalized arc-length parameter 0…1. Distance is clamped to the path length. Pure and drawless.
- `subpath(path, a, b)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return the shape-preserving open subpath between normalized arc-length parameters `a` and `b`, including interpolated boundary points. Pure and drawless.
- `splitat(path, t)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return two shape-preserving subpaths split at normalized arc-length parameter `t`. The shared split point ends the first and starts the second. Pure and drawless.
- `insertvertex(path, t)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return a path with a vertex inserted at normalized arc-length parameter `t` without changing the represented polyline shape. Pure and drawless.
- `dashes(path, onmm, offmm) | dashes(path, onmm, offmm, phasemm)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return open dash fragments using repeating on/off lengths in millimetres. An optional phase enters the cycle; lengths must be non-negative with a positive sum. Pure and drawless.
- `pathisectparams(a, b)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return path intersections as `[point, ta, tb]`, where `ta` and `tb` are normalized arc-length parameters on the two input paths. Pure and drawless.
- `pathselfisects(path)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return non-adjacent self-intersections as `[point, ta, tb]` with normalized arc-length parameters on the input path. Pure and drawless.
- `joinpaths(fragments, tolerance)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Deterministically weld fragment endpoints within `tolerance` millimetres. Closed chains become canonical rings; the result is a list of paths. Pure and drawless.
- `ispoint(value)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return `1` only for a two-number finite point `[x, y]`; return `0` for every other value without throwing. Pure and drawless.
- `ispath(value)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return `1` only for a list of at least two finite points; return `0` for every other value without throwing. Pure and drawless.
- `iscurvespec(value)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return `1` when a value is a valid editable cubic curve specification; return `0` instead of throwing on malformed input. Pure and drawless.
- `strokepath(path, width) | strokepath(path, width, cap) | strokepath(path, width, cap, join)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return canonical outline regions for a path stroke of `width` millimetres. Optional caps are `'round'`, `'butt'`, or `'square'`; joins are `'round'`, `'miter'`, or `'bevel'`. Pure and drawless.
- `clipopen(path, region) | clipopen(path, region, mode)` [paths-curves, call-syntax, embroidery, function, geometry, library, pure] — Return open fragments of a path inside a compound even-odd region, or outside it when optional mode is `'outside'`. Pure and drawless.

### Geometry generators & operations

Sampling, tessellation, regions, clipping, and fill paths.

- `scatter(minDist) | scatter(minDist, region)` [geometry, call-syntax, function, library, millimetres, seeded] — Seeded Poisson-disc (Bridson) points.
- `voronoi(points) | voronoi(points, region)` [geometry, call-syntax, embroidery, function, library] — Divide the canvas into cells, one per input point. Each cell contains every location that is closer to its seed point than to any other seed. Returns a list of closed regions in input order, clipped to the sewable field (or a given region).
- `triangulate(points)` [geometry, call-syntax, embroidery, function, library] — Delaunay triangulation: connects a set of points into triangles such that the circumcircle of each triangle contains no other point. Returns a list of 3-point regions. The "dual" of Voronoi — the same seeds that define Voronoi cells also define the triangle mesh connecting them.
- `hull(points)` [geometry, call-syntax, embroidery, function, library] — Convex hull: the smallest convex polygon that encloses all given points, returned as a counter-clockwise region. Think of it as wrapping a rubber band around all the points — only the outermost ones form the boundary.
- `relax(points, iterations)` [geometry, call-syntax, function, library] — n rounds of Lloyd's relaxation — moves each point to its Voronoi cell's centroid for even stippling.
- `offsetpath(region, offset)` [geometry, call-syntax, function, library] — Inflate (+) or shrink (−) a region. Returns a list of regions. Shrinking may split or erase the shape entirely.
- `contourpaths(region, gap)` [geometry, call-syntax, embroidery, function, library] — Closed inset contours at half-gap then gap spacing, ordered outside-in.
- `spiralpath(region, gap)` [geometry, call-syntax, function, library] — Contour rings spliced into one open inward path per disconnected fragment.
- `fillrows(region, spacing, angle)` [geometry, call-syntax, embroidery, function, library] — Routed, unsplit tatami rows without pull compensation, ready for `fill paths`.
- `closepath(ring)` [geometry, call-syntax, function, library] — Return the ring with its first point repeated. Requires at least three points.
- `clippaths(a, b, 'op')` [geometry, call-syntax, function, library] — Boolean operation on two regions. Backed by Clipper2 at μm precision. Returns a list of regions.
- `inpath(point, region)` [geometry, call-syntax, embroidery, function, library] — 1 if the point is inside the region (even-odd rule, consistent with fills).

### Hoop field

Sewable-field queries.

- `infield(point)` [field, call-syntax, embroidery, function, geometry, library] — `1` if the point is inside the current sewable field, `0` otherwise. The point is mapped through the current transform (local frame → hoop space), consistent with `coverat`. Zero RNG draws.
- `` [field, call-syntax, embroidery, function, library, millimetres] — Returns `[minX, minY, maxX, maxY]` — the bounding box of the sewable field in hoop space (mm). Same format as `bbox()`. Zero RNG draws.
- `` [field, call-syntax, embroidery, function, geometry, library, millimetres] — Returns the boundary of the sewable field as a counter-clockwise polygon, ready for use as a region in `scatter`, `clippaths`, `offsetpath`, etc. Round fields are polygonised at ≤ 2 mm chords. Zero RNG draws.

### Pure path transforms

Functional transforms and path effects.

- `xlate(path, dx, dy)` [path-transforms, block, call-syntax, function, geometry, library, millimetres, pure] — New path shifted by `(dx, dy)` mm. The functional companion to the `translate` block command — composes with `scatter`/`voronoi`/`offsetpath` data.
- `xrotate(path, degrees) | xrotate(path, degrees, cx, cy)` [path-transforms, call-syntax, function, geometry, heading, library, pure] — New path rotated `deg` clockwise. Optional pivot: `xrotate(path, deg, cx, cy)`.
- `xscale(path, s) | xscale(path, sx, sy)` [path-transforms, call-syntax, function, geometry, library, pure] — New path scaled by `sx` (and `sy`). `xscale(path, s)` is uniform; `xscale(path, sx, sy)` is per-axis.
- `xmirror(path, degrees)` [path-transforms, call-syntax, function, geometry, heading, library, pure] — New path reflected across a line through the origin at heading `deg`.
- `warppath(path, reporter)` [path-transforms, block, call-syntax, embroidery, function, geometry, library, pure] — New path with every point mapped through a `@name` reporter — the functional companion to the `warp` block. `warp @f [ sewpath(P) ]` ≡ `sewpath(warppath(P, @f))`.
- `humanizepath(path, amount)` [path-transforms, call-syntax, embroidery, function, geometry, library, millimetres, pure, seeded] — New path with seeded coherent jitter (`amount` mm) — the functional companion to `humanize`. Forks one draw from the seeded stream.
- `snappath(path, cell)` [path-transforms, call-syntax, function, geometry, library, millimetres, pure] — New path with every point snapped to the fixed lattice — the functional companion to `snaptogrid`, same arity overloads (cell | cellx celly | …ox oy | …ang).
- `declumppath(path, limit) | declumppath(path, limit, maxshift)` [path-transforms, block, call-syntax, embroidery, function, geometry, library, pure] — Run the `declump` fold over an explicit point list, reading real committed coverage history but committing nothing — the pure data twin of `declump`. Drawless.

### Satin helpers

Programmable satin and rail-pair tuple helpers.

- `satinpair(advance, width)` [satin-helpers, call-syntax, embroidery, function, library] — Build the 5-slot satin reporter contract by intent.
- `satinrake(advance, width, lag)` [satin-helpers, call-syntax, embroidery, function, library, millimetres] — Build the 5-slot satin reporter contract by intent.
- `satinasym(advance, leftw, rightw)` [satin-helpers, call-syntax, embroidery, function, library] — Build the 5-slot satin reporter contract by intent.
- `railinset(advance, inset)` [satin-helpers, call-syntax, embroidery, function, library, pure] — `railinset(advance, inset)` builds `[advance, inset, inset, 0, 0]` for a `satinbetween` shape reporter. Insets move inward from both authored rails. Pure, drawless, Library tier.
- `railrake(advance, lag)` [satin-helpers, call-syntax, embroidery, function, library, pure] — `railrake(advance, lag)` builds `[advance, 0, 0, -lag, lag]` for a full-width raked `satinbetween` stitch. Pure, drawless, Library tier.
- `railspine(railA, railB)` [satin-helpers, call-syntax, embroidery, function, geometry, library, pure] — Returns the same derived midpoint path used by `satinbetween`, including orientation and deterministic closed-rail seam handling. Useful for a centre vein or manual run. Pure and drawless.

### Fill helpers

Programmable fill tuple helpers.

- `tatamirow(spacing, len) | tatamirow(spacing, len, phase)` [fill-helpers, call-syntax, embroidery, function, library] — Build the 3-slot fill shape reporter contract by intent.

### Stitch history

Live coverage and prior-penetration queries.

- `coverat(p) | coverat(p, r)` [history, call-syntax, embroidery, function, geometry, library, millimetres, pure] — Coverage at a point, in layers (the heatmap / `maxdensity` unit; 1 ≈ one clean satin/tatami pass), read live and in sewing order over everything committed so far.
- `countat(p)` [history, call-syntax, function, geometry, library, millimetres, pure] — The number of penetrations in the 1 mm cell containing `p`, read live. Pure: zero draws, draws nothing.
- `nearestsewn(p)` [history, call-syntax, embroidery, function, geometry, library, pure] — The closest already-sewn penetration to `p`, as `[x, y]` in hoop space, or `[]` if nothing is sewn yet. Backed by a spatial index, so it stays O(local) — no history scan. Pure: zero draws.
- `sewnwithin(p, r)` [history, call-syntax, embroidery, function, geometry, library, millimetres, pure] — A list of already-sewn penetrations within `r` mm of `p` (hoop space). Grid-bucketed, so proximity logic stays O(local) instead of scanning the whole history.
- `stitchedpoints()` [history, call-syntax, embroidery, function, geometry, library, pure, stateful] — A deep-copied list of every penetration committed so far, as a path of `[x, y]` points (hoop space), captured at call time. Explicit and opt-in: you pay the O(n) copy when you ask, and the result is just a list (safe to mutate). Pure: zero draws.

## Standard library

Standard-library procedures require an explicit top-level import. Entries use the complete import path and source-derived parameter list.

### std.mathx

Easing, angles, vectors, remapping, and deterministic random helpers. Emits stitches: never. RNG: Only randbetween, randint, chance, weightedpick, and jitterpt draw (1, 1, 1, 1, and 2).

- `std.mathx.easein(t)` [easing-and-waveforms, mathx, standard-library] — Quadratic ease-in, `u²`, after clamping `t` to 0…1.
- `std.mathx.easeout(t)` [easing-and-waveforms, mathx, standard-library] — Quadratic ease-out, `1 - (1-u)²`, with clamped input.
- `std.mathx.easeinout(t)` [easing-and-waveforms, geometry, mathx, standard-library] — Symmetric quadratic ease-in/out with clamped input; its midpoint is 0.5.
- `std.mathx.easeback(t)` [easing-and-waveforms, mathx, standard-library] — Back-ease curve using overshoot constant 1.70158. Input is clamped, but the curve itself dips below 0 near the start.
- `std.mathx.easepow(power)` [easing-and-waveforms, higher-order, mathx, standard-library] — Returns a configured one-argument reporter equivalent to `pow(clamp(t, 0, 1), power)`. Use directly as `easepow(3)(0.5)` or pass the returned reference to another reporter.
- `std.mathx.triwave(t)` [easing-and-waveforms, mathx, standard-library] — Period-1 triangle wave: −1 at integer boundaries, 0 at quarter periods, and 1 at half periods. Negative `t` wraps with floor modulo.
- `std.mathx.pulse(t, duty)` [easing-and-waveforms, mathx, standard-library] — Period-1 pulse. Returns 1 while the wrapped phase is below `clamp(duty, 0, 1)`.
- `std.mathx.wrapdeg(d)` [angles-vectors-and-remapping, mathx, standard-library] — Wraps an angle into 0…360, excluding 360.
- `std.mathx.angdiff(a, b)` [angles-vectors-and-remapping, mathx, standard-library] — Shortest signed rotation from `a` to `b`, in −180…180, excluding +180. Positive is clockwise.
- `std.mathx.lerpheading(a, b, t)` [angles-vectors-and-remapping, mathx, standard-library] — Interpolates along the shortest angular route and wraps the result. `t` is not clamped.
- `std.mathx.vperp(v)` [angles-vectors-and-remapping, geometry, mathx, standard-library] — Returns `[-v[1], v[0]]`, a 90° mathematical counter-clockwise perpendicular in Cartesian coordinates.
- `std.mathx.vproj(a, b)` [angles-vectors-and-remapping, geometry, mathx, standard-library] — Projects vector `a` onto `b`. Returns `[0, 0]` when `b` has near-zero squared length.
- `std.mathx.vreflect(v, n)` [angles-vectors-and-remapping, geometry, mathx, standard-library] — Reflects `v` across the line whose normal is `n`. `n` need not be normalized; a near-zero normal returns a copy of `v`.
- `std.mathx.remapc(v, inlo, inhi, outlo, outhi)` [angles-vectors-and-remapping, mathx, standard-library] — Clamped linear remap. Reversed input/output ranges work. A near-zero input span returns `outlo`.
- `std.mathx.randbetween(a, b)` [deterministic-randomness, mathx, rng, standard-library] — Uniform value starting at `a` with span `b-a`; consumes **1 draw**. Reversed bounds therefore work.
- `std.mathx.randint(a, b)` [deterministic-randomness, mathx, rng, standard-library] — Uniform inclusive integer between `ceil(min(a,b))` and `floor(max(a,b))`; normally consumes **1 draw**. If the bounds contain no integer, returns the rounded lower bound without drawing.
- `std.mathx.chance(p)` [deterministic-randomness, mathx, rng, standard-library] — Bernoulli trial with `p` clamped to 0…1; consumes **1 draw** even at probabilities 0 and 1.
- `std.mathx.weightedpick(xs, ws)` [deterministic-randomness, mathx, rng, standard-library] — Selects from `xs` in order using cumulative weights; consumes **1 draw**. Supply a non-empty `xs`, an equally long `ws`, non-negative weights, and a positive total.
- `std.mathx.jitterpt(p, mm)` [deterministic-randomness, geometry, mathx, rng, standard-library] — Independently offsets both coordinates uniformly within `[-mm, mm)`; consumes **2 draws**. Use non-negative `mm`.

### std.listx

Sorting, selection, reshaping, and predicate-based list operations. Emits stitches: never. RNG: Only when a supplied callback draws.

- `std.listx.sortby(xs, keyfn)` [listx, procedures, standard-library] — Returns a new list in ascending key order. Computes every key once and leaves `xs` unchanged. Equal-key items keep their original order.
- `std.listx.argmin(xs, keyfn)` [listx, procedures, standard-library] — Returns the first item with the smallest computed key. Keys are computed once. `xs` must be non-empty.
- `std.listx.argmax(xs, keyfn)` [listx, procedures, standard-library] — Returns the first item with the largest computed key. Keys are computed once. `xs` must be non-empty.
- `std.listx.pairwise(xs)` [listx, procedures, standard-library] — Returns adjacent pairs: `[a,b,c]` becomes `[[a,b],[b,c]]`. Lists shorter than two produce `[]`.
- `std.listx.zip(a, b)` [listx, procedures, standard-library] — Pairs items at matching indices and stops at the shorter input.
- `std.listx.flatten(xs)` [listx, procedures, standard-library] — Recursively removes all nested list structure while preserving left-to-right leaf order. Empty nested lists contribute nothing.
- `std.listx.unique(xs)` [listx, procedures, standard-library] — Removes later duplicates and preserves first occurrence order. Equality follows NeedleScript's deep, tolerant equality rules.
- `std.listx.chunk(xs, n)` [listx, procedures, standard-library] — Splits `xs` into consecutive chunks. The width is `max(1, floor(n))`; the last chunk may be shorter.
- `std.listx.rotatedlist(xs, n)` [listx, procedures, standard-library] — Returns a new list rotated left by `round(n)` places. Negative values rotate right. Empty input returns `[]`.
- `std.listx.countif(xs, predfn)` [listx, procedures, standard-library] — Counts items for which the predicate returns non-zero. It has the same predicate requirements as the core `filter`.

### std.shapes

Centered closed and open path constructors. Emits stitches: never. RNG: None.

- `std.shapes.polypath(n, r)` [geometry, procedures, shapes, standard-library] — Regular polygon of radius `r`. Vertex count is `max(3, round(n))`; result length is vertices + 1.
- `std.shapes.starpath(n, rout, rin)` [geometry, procedures, shapes, standard-library] — Alternating outer/inner radii with `max(2, round(n))` points of each kind.
- `std.shapes.rectpath(w, h)` [geometry, procedures, shapes, standard-library] — Axis-aligned rectangle of width `w` and height `h`, beginning at the top-edge midpoint.
- `std.shapes.roundrect(w, h, r)` [geometry, procedures, shapes, standard-library] — Rounded rectangle with nine samples per corner. Radius is `abs(r)` clamped to half the smaller absolute dimension.
- `std.shapes.ellipsepath(rx, ry)` [geometry, procedures, shapes, standard-library] — Ellipse with 64 perimeter samples; `rx` and `ry` are horizontal and vertical radii.
- `std.shapes.arcpath(deg, r)` [geometry, procedures, shapes, standard-library] — Circular arc starting north, sampled at no more than 6° per segment. Positive `deg` progresses counter-clockwise; negative progresses clockwise.
- `std.shapes.coilpath(turns, r0, r1)` [geometry, procedures, shapes, standard-library] — Spiral whose radius linearly changes from `r0` to `r1`, with 72 segments per absolute turn. Positive turns progress counter-clockwise.
- `std.shapes.heartpath(size)` [geometry, procedures, shapes, standard-library] — Parametric heart with 96 samples. Overall scale is controlled by `size`; the first point is on the north-west lobe.
- `std.shapes.gearpath(teeth, r, depth)` [geometry, procedures, shapes, standard-library] — Four vertices per tooth, alternating two outer points at `r` and two root points at `max(0, r-depth)`. Uses at least three teeth.
- `std.shapes.superellipsepath(w, h, e)` [geometry, procedures, shapes, standard-library] — 96-sample superellipse within `w × h`. Exponent `e` is floored at 0.01 before deriving the signed-power curve.
- `std.shapes.wavepath(length, amp, cycles)` [geometry, procedures, shapes, standard-library] — Horizontal sine wave from `-length/2` to `length/2`, with 24 segments per absolute cycle. Negative cycles reverse phase progression.
- `std.shapes.rosepath(k, r)` [geometry, procedures, shapes, standard-library] — Polar rose `radius = cos(k × angle) × r`, sampled with at least 72 points and 72 per absolute `k`. Integer `k` produces the expected closed rose.
- `std.shapes.lissajouspath(a, b, phase, size)` [geometry, procedures, shapes, standard-library] — Lissajous curve with x phase in degrees, within a square of side `size`; sample count is at least 96 and scales with `max(abs(a), abs(b))`.

### std.pathops

Arc-length queries and polyline transformations. Emits stitches: never. RNG: None.

- `std.pathops.pointat(path, t)` [geometry, pathops, procedures, standard-library] — Point at normalized arc length `t`. A one-point path returns that point; repeated zero-length segments are tolerated.
- `std.pathops.headingat(path, t)` [geometry, pathops, procedures, standard-library] — Heading of the non-zero segment containing `t`. At an exact vertex it selects the preceding segment. If no non-zero segment exists, returns 0.
- `std.pathops.paramof(p, path)` [geometry, pathops, procedures, standard-library] — Normalized arc-length position of the closest point on the polyline. Ties keep the earlier segment; a zero-length path returns 0.
- `std.pathops.subpath(path, t0, t1)` [geometry, pathops, procedures, standard-library] — Extracts a section, including interpolated endpoints and interior original vertices. If `t1 < t0`, returns the forward extraction reversed. Equal parameters return two equal endpoints.
- `std.pathops.dashes(path, onmm, offmm)` [geometry, pathops, procedures, standard-library] — Splits an arc-length route into on-segments. `phasemm` enters that far into the repeating cycle and may begin in a dash or gap. Use non-negative lengths and a positive sum.
- `std.pathops.simplifypath(path, tol)` [geometry, pathops, procedures, standard-library] — Ramer–Douglas–Peucker simplification using perpendicular segment distance. Negative tolerance becomes 0; endpoints are preserved.
- `std.pathops.smoothclosed(ring, n)` [geometry, pathops, procedures, standard-library] — Applies 0…6 rounded Chaikin corner-cutting passes. An existing duplicate closing point is removed first, then one closing point is appended. Each pass doubles the unique point count.
- `std.pathops.morphpaths(a, b, t)` [geometry, pathops, procedures, standard-library] — Arc-length-resamples both paths to the larger unique-point count and linearly interpolates corresponding points. `t` is not clamped. The result is closed only if both inputs are closed.
- `std.pathops.pathisects(a, b)` [geometry, pathops, procedures, standard-library] — Returns unique segment intersections in nested segment order. Collinear overlap behavior follows core `segisect`.
- `std.pathops.offsetopen(path, mm)` [geometry, pathops, procedures, standard-library] — Approximate mitered offset of an open polyline. Positive `mm` offsets to the path's Cartesian left; negative offsets right. Near-180° joins use a bounded denominator to avoid division by zero.

### std.regions

Region measurement, tiling, insets, and partitions. Emits stitches: never. RNG: partitions draws exactly 1; all other exports draw none.

- `std.regions.regionarea(region)` [geometry, procedures, regions, standard-library] — Absolute shoelace area in mm². Orientation does not affect the result.
- `std.regions.poleof(region)` [geometry, procedures, regions, standard-library] — Deterministic approximation of the interior point farthest from the boundary. It tests the centroid, a 9×9 bounding-box grid, then seven local refinements. Useful for labels and seed points; it is not an exact polylabel solution.
- `std.regions.insetrings(region, gap, n)` [geometry, procedures, regions, standard-library] — Repeatedly offsets inward by `abs(gap)`, returning every piece from levels 1 through `max(0, round(n))`. Splits and collapsed levels are handled by `offsetpath`; the original region is not included.
- `std.regions.tilecells(region, kind, cell)` [geometry, procedures, regions, standard-library] — Covers and clips a global grid of cells to the region. `kind` must be `'square'`, `'hex'`, or `'tri'`; `cell` must be positive. Hex `cell` is circumradius; triangular cells are halves of square cells. Boundary cells may be partial or split.
- `std.regions.gridpoints(region, cell)` [geometry, procedures, regions, standard-library] — Returns centers of globally aligned `cell × cell` boxes that lie inside the region. `cell` must be positive. Points on the upper/right incomplete fringe are not sampled.
- `std.regions.partitions(region, n)` [geometry, procedures, regions, rng, standard-library] — Produces `max(1, round(n))` clipped Voronoi cells after two centroidal-relaxation passes. Initial seeds use `scatter`, with grid/pole fallbacks. Consumes exactly **1 main-stream RNG draw**, regardless of the number of generated seeds.

### std.layout

Point/heading layouts and uniform path fitting. Emits stitches: never. RNG: None.

- `std.layout.circlelayout(n, r)` [geometry, layout, procedures, standard-library] — Returns `max(0, round(n))` evenly spaced positions on radius `r`. The first is north. Each heading is tangent to the circle in counter-clockwise traversal; zero count returns `[]`.
- `std.layout.gridlayout(cols, rows, dx, dy)` [geometry, layout, procedures, standard-library] — Centered row-major grid with rounded non-negative dimensions. Starts at the top-left for positive spacing; every heading is 0. Negative spacing mirrors an axis.
- `std.layout.alongpath(path, n)` [geometry, layout, procedures, standard-library] — Returns rounded non-negative count at equal normalized arc-length parameters, including both ends. One placement uses the midpoint (`t = 0.5`). Headings follow `std.pathops.headingat`.
- `std.layout.fitpath(path, region, margin)` [geometry, layout, procedures, standard-library] — Uniformly scales `path` to fit the region's bounding box after a non-negative margin, then centers bounding boxes. Preserves aspect ratio and handles horizontal, vertical, and point-like source paths. It fits the bounding box, not the exact polygon interior.

### std.textures

Direction/shape callbacks and clipped fill paths. Emits stitches: never. RNG: None; seeded simplex fields do not advance the main stream.

- `std.textures.radialdir(p)` [direction-reporters, standard-library, textures] — Heading of the ray from origin to `p`; returns 0 within `0.000001` mm of the origin.
- `std.textures.griddir(deg)` [direction-reporters, embroidery, geometry, higher-order, standard-library, textures] — Returns a direction reporter that ignores its point and always returns `deg`. Example: `fill dir griddir(30)`.
- `std.textures.radialdirfrom(cx, cy)` [direction-reporters, higher-order, standard-library, textures] — Returns a reporter whose rays originate at `[cx, cy]`; returns 0 at that center.
- `std.textures.curldir(p)` [direction-reporters, standard-library, textures] — Divergence-free direction derived from finite differences of simplex noise at a fixed 14 mm scale. Returns 0 for a near-zero gradient.
- `std.textures.curldirwith(scaledown)` [direction-reporters, higher-order, standard-library, textures] — Configurable form of `curldir`; `scaledown` is the spatial noise scale and must be positive. Larger values vary more slowly.
- `std.textures.wovenshape(p, row, v)` [embroidery, fill-shape-reporters, standard-library, textures] — Uses 0.8 mm row spacing, 3 mm stitches, and alternates phase 0/0.5 by row parity for a woven rhythm.
- `std.textures.gradientshape(p, row, v)` [embroidery, fill-shape-reporters, standard-library, textures] — Ramps row spacing from 0.45 to 1.2 mm using clamped cross-field coordinate `v`; stitch length is 2.5 mm and phase 0.5.
- `std.textures.gradientshapewith(lo, hi)` [fill-shape-reporters, geometry, higher-order, standard-library, textures] — Configurable gradient reporter interpolating spacing from `lo` to `hi`; it does not clamp the supplied spacing endpoints.
- `std.textures.hilbertpaths(region, cell)` [geometric-texture-paths, geometry, standard-library, textures] — Builds the smallest power-of-two Hilbert grid whose scaled span covers the larger bounding-box dimension, then clips its continuous curve. `cell` controls target detail and must be positive.
- `std.textures.truchetpaths(region, cell)` [geometric-texture-paths, geometry, standard-library, textures] — Alternating checkerboard Truchet quarter-circles, sampled every 15°. `cell` is tile size and must be positive.
- `std.textures.hitomezashi(region, cell, rowbits, colbits)` [geometric-texture-paths, geometry, standard-library, textures] — Alternating horizontal and vertical sashiko dashes. Rounded bit values modulo 2 set row and column phases cyclically, including at negative grid indices. `cell` must be positive and both bit lists non-empty.
- `std.textures.seigaiha(region, r)` [geometric-texture-paths, geometry, standard-library, textures] — Staggered Japanese wave pattern with three concentric semicircles at each origin. `r` is the largest radius and must be positive.
- `std.textures.asanoha(region, cell)` [geometric-texture-paths, geometry, standard-library, textures] — Hexagonally arranged hemp-leaf spokes and half-edges. `cell` must be positive.
- `std.textures.herringbonepaths(region, w)` [geometric-texture-paths, geometry, standard-library, textures] — Staggered zigzag herringbone units with horizontal/vertical scale `w`, which must be positive.

### std.stitchcraft

Reusable embroidery construction and geometry rituals. Emits stitches: usually. RNG: stipple draws exactly 1; all other exports draw none unless a callback draws.

- `std.stitchcraft.sewrun(path, mm)` [embroidery, geometry, procedures, standard-library, stitchcraft] — Resamples `path` at spacing `mm`, then sews it with the current stitch mode and thread. Equivalent to `sewpath(resample(path, mm))`.
- `std.stitchcraft.satinalong(path, w)` [embroidery, geometry, procedures, standard-library, stitchcraft] — Enables satin width `w`, sews `path`, then sets satin width to 0. The final satin state is always off, not restored to a prior width. Other satin settings still apply.
- `std.stitchcraft.beanoutline(region, n)` [embroidery, geometry, procedures, standard-library, stitchcraft] — Enables bean repeat `n`, sews the logically closed region, then sets bean repeat to 1. The prior bean setting is not restored.
- `std.stitchcraft.appliquesteps(region, w)` [embroidery, geometry, procedures, standard-library, stitchcraft] — Performs a 2.5 mm running placement line, a narrow satin tack-down at `max(0.8, 0.35w)`, and a final satin cover at `w`. Inserts `stop` events between the three stages so fabric can be placed/trimmed. Each stage travels with needle up to the ring start. Ends at the closed ring's end with satin turned off.
- `std.stitchcraft.appliquewith(region, placementinset, tackdowninset, coverwidth, stops)` [geometry, procedures, standard-library, stitchcraft] — Configurable three-stage appliqué construction. See below.
- `std.stitchcraft.eyelet(r)` [embroidery, procedures, standard-library, stitchcraft] — Sews a resampled satin circle centered at the current needle position. Radius must be positive; satin width is `clamp(0.55r, 0.6, 1.5)`. A `push`/`pop` pair restores needle position, heading, and pen state after sewing; satin ends off.
- `std.stitchcraft.fillbordergeometry(region, coverwidth, overlap)` [embroidery, geometry, procedures, pure, standard-library, stitchcraft] — Pure fill-and-border construction geometry. See below.
- `std.stitchcraft.fillandborder(region, deg, spacing, coverwidth)` [embroidery, geometry, procedures, standard-library, stitchcraft] — Sews inset fill rows, inserts a `stop`, then sews the satin border. Uses the standard 0.4 mm overlap.
- `std.stitchcraft.fillandborderwith(region, deg, spacing, coverwidth, overlap)` [embroidery, geometry, procedures, standard-library, stitchcraft] — Explicit-overlap form of `fillandborder`.
- `std.stitchcraft.gradientbands(region, deg, n)` [geometry, procedures, pure, standard-library, stitchcraft] — Geometry-only helper: slices a region into `max(1, round(n))` parallel bands oriented at heading/angle `deg` and returns all clipped pieces in band order. Concavity can yield more pieces than requested bands.
- `std.stitchcraft.gradientrows(region, deg, pitch, amount)` [geometry, procedures, pure, standard-library, stitchcraft] — Geometry-only, density-neutral two-color blend. See below.
- `std.stitchcraft.gradientrowsn(region, deg, pitch, weights)` [geometry, procedures, pure, standard-library, stitchcraft] — Geometry-only, density-neutral blend across 2–8 colors. See below.
- `std.stitchcraft.serpentinerows(rows, reversed)` [geometry, procedures, standard-library, stitchcraft] — Greedily routes parallel row paths with endpoint reversal enabled, beginning from the first row when `reversed` is false or the last row when true. Returns `[]` for empty input and does not mutate `rows`.
- `std.stitchcraft.knockdown(region, deg, spacing)` [embroidery, geometry, procedures, standard-library, stitchcraft] — Sparse running-stitch foundation for fleece, terry, and other high-pile fabrics. See below.
- `std.stitchcraft.threadblend(region, deg)` [embroidery, geometry, procedures, standard-library, stitchcraft] — Creates 1.2 mm fill rows at `deg`, sews even rows in the current color, advances once to the next color, then sews odd rows. Rows are resampled at 2.5 mm. Ends in the second color and does not restore needle position.
- `std.stitchcraft.stipple(region, mindist)` [embroidery, geometry, procedures, rng, standard-library, stitchcraft] — Scatters candidate points and sews a small circular mark only where coverage within `mindist/3` is below one layer. `mindist` must be positive. Each mark restores turtle state with `push`/`pop`. Consumes exactly **1 main-stream RNG draw** through `scatter`.

### std.debugx

Chalk overlays and stitch-history diagnostics. Emits stitches: never. RNG: None.

- `std.debugx.chalkgrid(cell)` [debugx, embroidery, procedures, standard-library] — Adds a `'grid'` line group spanning the configured field bounds, aligned to global multiples of `cell`. `cell` must be positive.
- `std.debugx.chalkbbox(path)` [debugx, embroidery, geometry, procedures, standard-library] — Adds a closed, axis-aligned `'bbox'` line overlay around `path`. Expects non-empty geometry accepted by core `bbox`.
- `std.debugx.chalkfield()` [debugx, embroidery, geometry, procedures, standard-library] — Adds a `'field'` line overlay of the current sewable field path. Works for circular and rectangular hoop fields.
- `std.debugx.threadestimate()` [debugx, embroidery, geometry, procedures, standard-library] — Returns the polyline length through committed penetration points, in millimetres, or 0 with fewer than two points. It is an estimate: stitch history does not retain trims or color boundaries, and it does not model bobbin/thread consumption.
- `std.debugx.coverprofile(path, stride)` [debugx, embroidery, geometry, procedures, standard-library] — Samples `coverat` along a resampled path and returns `[distanceMm, coverageLayers]` pairs. `stride` must be positive. Empty path returns `[]`; a one-point path returns one sample at distance 0.
