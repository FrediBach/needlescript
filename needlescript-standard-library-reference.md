# NeedleScript Standard Library Reference

Companion to [NeedleScript Language Reference](./needlescript-language-reference.md). This
document covers every exported procedure in `src/lib/standard-library/`. It describes the
bundled library as implemented; the main language reference remains authoritative for syntax,
built-ins, the value model, geometry conventions, and machine behavior.

---

## 1. Importing library procedures

Standard-library procedures are not global. Import each procedure at the top level and give it a
local alias:

```text
import std.shapes.starpath as star
import std.stitchcraft.sewrun as sewrun

let outline = star(5, 18, 8)
sewrun(outline, 2)
```

The syntax is `import <module>.<export> as <alias>`. Imports are resolved at compile time, have no
runtime side effects, and consume no random numbers. The alias:

- is an ordinary procedure name and may be passed by reference (`@alias`);
- must not collide with a built-in, another import, or a locally defined procedure;
- may differ from the exported name, which is useful when a short or domain-specific name reads
  better.

Only the bundled `std.*` modules listed here can currently be imported. There are no wildcard or
whole-module imports.

### Shared conventions

- A **point** or vector is `[x, y]`; a **path** is a list of points.
- A **region** is a simple polygon represented by a list of boundary points. Unless noted, it may
  be open or explicitly closed; geometry built-ins close it logically when required.
- A **closed path** repeats its first point as its last point. Region-producing functions do not
  necessarily repeat it.
- Distances and sizes are millimetres. Angles and headings use NeedleScript's convention: degrees
  clockwise from north.
- Functions returning geometry do not move the needle or make stitches. Procedures in
  `std.stitchcraft` are the principal exception and are explicitly marked below.
- List arguments use normal NeedleScript reference semantics. The documented functions do not
  intentionally mutate caller-owned top-level lists, although nested point lists can remain shared
  where the core `copy` operation is shallow.
- Assertions mentioned below are runtime errors with a procedure-specific message.

---

## 2. `std.mathx` — extended mathematics

### Easing and waveforms

| Import path           | Signature and result                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.mathx.easein`    | `easein(t) -> number`. Quadratic ease-in, `u²`, after clamping `t` to 0…1.                                                                                                                                  |
| `std.mathx.easeout`   | `easeout(t) -> number`. Quadratic ease-out, `1 - (1-u)²`, with clamped input.                                                                                                                               |
| `std.mathx.easeinout` | `easeinout(t) -> number`. Symmetric quadratic ease-in/out with clamped input; its midpoint is 0.5.                                                                                                          |
| `std.mathx.easeback`  | `easeback(t) -> number`. Back-ease curve using overshoot constant 1.70158. Input is clamped, but the curve itself dips below 0 near the start.                                                              |
| `std.mathx.easepow`   | `easepow(power) -> reference`. Returns a configured one-argument reporter equivalent to `pow(clamp(t, 0, 1), power)`. Use directly as `easepow(3)(0.5)` or pass the returned reference to another reporter. |
| `std.mathx.triwave`   | `triwave(t) -> number`. Period-1 triangle wave: −1 at integer boundaries, 0 at quarter periods, and 1 at half periods. Negative `t` wraps with floor modulo.                                                |
| `std.mathx.pulse`     | `pulse(t, duty) -> 0 or 1`. Period-1 pulse. Returns 1 while the wrapped phase is below `clamp(duty, 0, 1)`.                                                                                                 |

`easepow` does not constrain `power`; choose a positive value for the usual monotonic easing curve.

### Angles, vectors, and remapping

| Import path             | Signature and result                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.mathx.wrapdeg`     | `wrapdeg(d) -> number`. Wraps an angle into 0…360, excluding 360.                                                                                  |
| `std.mathx.angdiff`     | `angdiff(a, b) -> number`. Shortest signed rotation from `a` to `b`, in −180…180, excluding +180. Positive is clockwise.                           |
| `std.mathx.lerpheading` | `lerpheading(a, b, t) -> number`. Interpolates along the shortest angular route and wraps the result. `t` is not clamped.                          |
| `std.mathx.vperp`       | `vperp(v) -> point`. Returns `[-v[1], v[0]]`, a 90° mathematical counter-clockwise perpendicular in Cartesian coordinates.                         |
| `std.mathx.vproj`       | `vproj(a, b) -> point`. Projects vector `a` onto `b`. Returns `[0, 0]` when `b` has near-zero squared length.                                      |
| `std.mathx.vreflect`    | `vreflect(v, n) -> point`. Reflects `v` across the line whose normal is `n`. `n` need not be normalized; a near-zero normal returns a copy of `v`. |
| `std.mathx.remapc`      | `remapc(v, inlo, inhi, outlo, outhi) -> number`. Clamped linear remap. Reversed input/output ranges work. A near-zero input span returns `outlo`.  |

### Deterministic randomness

These helpers draw from the program's seeded main RNG. Their draw counts are part of the
determinism contract.

| Import path              | Signature, result, and RNG draws                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.mathx.randbetween`  | `randbetween(a, b) -> number`. Uniform value starting at `a` with span `b-a`; consumes **1 draw**. Reversed bounds therefore work.                                                                                     |
| `std.mathx.randint`      | `randint(a, b) -> integer`. Uniform inclusive integer between `ceil(min(a,b))` and `floor(max(a,b))`; normally consumes **1 draw**. If the bounds contain no integer, returns the rounded lower bound without drawing. |
| `std.mathx.chance`       | `chance(p) -> 0 or 1`. Bernoulli trial with `p` clamped to 0…1; consumes **1 draw** even at probabilities 0 and 1.                                                                                                     |
| `std.mathx.weightedpick` | `weightedpick(xs, ws) -> value`. Selects from `xs` in order using cumulative weights; consumes **1 draw**. Supply a non-empty `xs`, an equally long `ws`, non-negative weights, and a positive total.                  |
| `std.mathx.jitterpt`     | `jitterpt(p, mm) -> point`. Independently offsets both coordinates uniformly within `[-mm, mm)`; consumes **2 draws**. Use non-negative `mm`.                                                                          |

```text
import std.mathx.chance as chance
import std.mathx.jitterpt as jitter

seed 42
if chance(0.3) [ setpos jitter(pos(), 0.5) ]
```

---

## 3. `std.listx` — higher-level list operations

Callback parameters expect reporter references, such as `@abs`, `@predicate`, or an anonymous
`def(...) [ ... ]` closure.

| Import path             | Signature and result                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.listx.sortby`      | `sortby(xs, keyfn) -> list`. Returns a new list in ascending key order. Computes every key once and leaves `xs` unchanged. Equal-key items keep their original order. |
| `std.listx.argmin`      | `argmin(xs, keyfn) -> value`. Returns the first item with the smallest computed key. Keys are computed once. `xs` must be non-empty.                                  |
| `std.listx.argmax`      | `argmax(xs, keyfn) -> value`. Returns the first item with the largest computed key. Keys are computed once. `xs` must be non-empty.                                   |
| `std.listx.pairwise`    | `pairwise(xs) -> list`. Returns adjacent pairs: `[a,b,c]` becomes `[[a,b],[b,c]]`. Lists shorter than two produce `[]`.                                               |
| `std.listx.zip`         | `zip(a, b) -> list`. Pairs items at matching indices and stops at the shorter input.                                                                                  |
| `std.listx.flatten`     | `flatten(xs) -> list`. Recursively removes all nested list structure while preserving left-to-right leaf order. Empty nested lists contribute nothing.                |
| `std.listx.unique`      | `unique(xs) -> list`. Removes later duplicates and preserves first occurrence order. Equality follows NeedleScript's deep, tolerant equality rules.                   |
| `std.listx.chunk`       | `chunk(xs, n) -> list`. Splits `xs` into consecutive chunks. The width is `max(1, floor(n))`; the last chunk may be shorter.                                          |
| `std.listx.rotatedlist` | `rotatedlist(xs, n) -> list`. Returns a new list rotated left by `round(n)` places. Negative values rotate right. Empty input returns `[]`.                           |
| `std.listx.countif`     | `countif(xs, predfn) -> number`. Counts items for which the predicate returns non-zero. It has the same predicate requirements as the core `filter`.                  |

```text
import std.listx.sortby as sortby
import std.listx.chunk as chunk

let ranked = sortby([[3, 'c'], [1, 'a'], [2, 'b']], def(item) [ return item[0] ])
print chunk(ranked, 2)
```

---

## 4. `std.shapes` — centered path constructors

All constructors return geometry centered around the origin and are drawless. Unless explicitly
called open, outlines repeat the first point at the end. Positive polygon progression starts at
north and proceeds counter-clockwise in the Cartesian plane.

| Import path                   | Signature and result                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.shapes.polypath`         | `polypath(n, r) -> closed path`. Regular polygon of radius `r`. Vertex count is `max(3, round(n))`; result length is vertices + 1.                                                             |
| `std.shapes.starpath`         | `starpath(n, rout, rin) -> closed path`. Alternating outer/inner radii with `max(2, round(n))` points of each kind.                                                                            |
| `std.shapes.rectpath`         | `rectpath(w, h) -> closed path`. Axis-aligned rectangle of width `w` and height `h`, beginning at the top-edge midpoint.                                                                       |
| `std.shapes.roundrect`        | `roundrect(w, h, r) -> closed path`. Rounded rectangle with nine samples per corner. Radius is `abs(r)` clamped to half the smaller absolute dimension.                                        |
| `std.shapes.ellipsepath`      | `ellipsepath(rx, ry) -> closed path`. Ellipse with 64 perimeter samples; `rx` and `ry` are horizontal and vertical radii.                                                                      |
| `std.shapes.arcpath`          | `arcpath(deg, r) -> open path`. Circular arc starting north, sampled at no more than 6° per segment. Positive `deg` progresses counter-clockwise; negative progresses clockwise.               |
| `std.shapes.coilpath`         | `coilpath(turns, r0, r1) -> open path`. Spiral whose radius linearly changes from `r0` to `r1`, with 72 segments per absolute turn. Positive turns progress counter-clockwise.                 |
| `std.shapes.heartpath`        | `heartpath(size) -> closed path`. Parametric heart with 96 samples. Overall scale is controlled by `size`; the first point is on the north-west lobe.                                          |
| `std.shapes.gearpath`         | `gearpath(teeth, r, depth) -> closed path`. Four vertices per tooth, alternating two outer points at `r` and two root points at `max(0, r-depth)`. Uses at least three teeth.                  |
| `std.shapes.superellipsepath` | `superellipsepath(w, h, e) -> closed path`. 96-sample superellipse within `w × h`. Exponent `e` is floored at 0.01 before deriving the signed-power curve.                                     |
| `std.shapes.wavepath`         | `wavepath(length, amp, cycles) -> open path`. Horizontal sine wave from `-length/2` to `length/2`, with 24 segments per absolute cycle. Negative cycles reverse phase progression.             |
| `std.shapes.rosepath`         | `rosepath(k, r) -> closed path`. Polar rose `radius = cos(k × angle) × r`, sampled with at least 72 points and 72 per absolute `k`. Integer `k` produces the expected closed rose.             |
| `std.shapes.lissajouspath`    | `lissajouspath(a, b, phase, size) -> closed path`. Lissajous curve with x phase in degrees, within a square of side `size`; sample count is at least 96 and scales with `max(abs(a), abs(b))`. |

To place or transform a returned path, use geometry built-ins such as `xlate`, `xrotate`, and
`xscale`. To sew it, use `sewpath` or a `std.stitchcraft` helper.

---

## 5. `std.pathops` — polyline queries and operations

`pointat`, `headingat`, `paramof`, `subpath`, and `dashes` are also Library-tier built-ins. These exports
remain as compatibility wrappers, so existing imports keep their pinned behavior.

Normalized parameters are based on total arc length rather than vertex index. Unless noted, `t`
values are clamped to 0…1. Query functions expect at least one point; segment-based functions are
most meaningful with at least two.

| Import path                | Signature and result                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.pathops.pointat`      | `pointat(path, t) -> point`. Point at normalized arc length `t`. A one-point path returns that point; repeated zero-length segments are tolerated.                                                                                    |
| `std.pathops.headingat`    | `headingat(path, t) -> heading`. Heading of the non-zero segment containing `t`. At an exact vertex it selects the preceding segment. If no non-zero segment exists, returns 0.                                                       |
| `std.pathops.paramof`      | `paramof(p, path) -> number`. Normalized arc-length position of the closest point on the polyline. Ties keep the earlier segment; a zero-length path returns 0.                                                                       |
| `std.pathops.subpath`      | `subpath(path, t0, t1) -> path`. Extracts a section, including interpolated endpoints and interior original vertices. If `t1 < t0`, returns the forward extraction reversed. Equal parameters return two equal endpoints.             |
| `std.pathops.dashes`       | `dashes(path, onmm, offmm[, phasemm]) -> list of paths`. Splits an arc-length route into on-segments. `phasemm` enters that far into the repeating cycle and may begin in a dash or gap. Use non-negative lengths and a positive sum. |
| `std.pathops.simplifypath` | `simplifypath(path, tol) -> path`. Ramer–Douglas–Peucker simplification using perpendicular segment distance. Negative tolerance becomes 0; endpoints are preserved.                                                                  |
| `std.pathops.smoothclosed` | `smoothclosed(ring, n) -> closed path`. Applies 0…6 rounded Chaikin corner-cutting passes. An existing duplicate closing point is removed first, then one closing point is appended. Each pass doubles the unique point count.        |
| `std.pathops.morphpaths`   | `morphpaths(a, b, t) -> path`. Arc-length-resamples both paths to the larger unique-point count and linearly interpolates corresponding points. `t` is not clamped. The result is closed only if both inputs are closed.              |
| `std.pathops.pathisects`   | `pathisects(a, b) -> list of points`. Returns unique segment intersections in nested segment order. Collinear overlap behavior follows core `segisect`.                                                                               |
| `std.pathops.offsetopen`   | `offsetopen(path, mm) -> path`. Approximate mitered offset of an open polyline. Positive `mm` offsets to the path's Cartesian left; negative offsets right. Near-180° joins use a bounded denominator to avoid division by zero.      |

```text
import std.pathops.subpath as subpath
import std.pathops.offsetopen as offsetopen

let route = [[0, 0], [20, 0], [20, 10]]
let middle = subpath(route, 0.25, 0.75)
sewpath(offsetopen(middle, 1.5))
```

---

## 6. `std.regions` — region analysis and subdivision

These functions expect simple polygonal regions. Outputs from clipping, offsetting, and Voronoi
operations are region lists and need not repeat their first point.

| Import path              | Signature and result                                                                                                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.regions.regionarea` | `regionarea(region) -> number`. Absolute shoelace area in mm². Orientation does not affect the result.                                                                                                                                                                                               |
| `std.regions.poleof`     | `poleof(region) -> point`. Deterministic approximation of the interior point farthest from the boundary. It tests the centroid, a 9×9 bounding-box grid, then seven local refinements. Useful for labels and seed points; it is not an exact polylabel solution.                                     |
| `std.regions.insetrings` | `insetrings(region, gap, n) -> list of regions`. Repeatedly offsets inward by `abs(gap)`, returning every piece from levels 1 through `max(0, round(n))`. Splits and collapsed levels are handled by `offsetpath`; the original region is not included.                                              |
| `std.regions.tilecells`  | `tilecells(region, kind, cell) -> list of regions`. Covers and clips a global grid of cells to the region. `kind` must be `'square'`, `'hex'`, or `'tri'`; `cell` must be positive. Hex `cell` is circumradius; triangular cells are halves of square cells. Boundary cells may be partial or split. |
| `std.regions.gridpoints` | `gridpoints(region, cell) -> list of points`. Returns centers of globally aligned `cell × cell` boxes that lie inside the region. `cell` must be positive. Points on the upper/right incomplete fringe are not sampled.                                                                              |
| `std.regions.partitions` | `partitions(region, n) -> list of regions`. Produces `max(1, round(n))` clipped Voronoi cells after two centroidal-relaxation passes. Initial seeds use `scatter`, with grid/pole fallbacks. Consumes exactly **1 main-stream RNG draw**, regardless of the number of generated seeds.               |

`partitions` is deterministic for a fixed source seed and region. The geometric scatter work uses a
forked generator; only creation of that fork advances the main stream.

---

## 7. `std.layout` — motif placements and fitting

A placement has the form `[[x, y], heading]`. Layout functions return placements or transformed
geometry; they do not move the turtle.

| Import path               | Signature and result                                                                                                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.layout.circlelayout` | `circlelayout(n, r) -> placements`. Returns `max(0, round(n))` evenly spaced positions on radius `r`. The first is north. Each heading is tangent to the circle in counter-clockwise traversal; zero count returns `[]`.                                                                                    |
| `std.layout.gridlayout`   | `gridlayout(cols, rows, dx, dy) -> placements`. Centered row-major grid with rounded non-negative dimensions. Starts at the top-left for positive spacing; every heading is 0. Negative spacing mirrors an axis.                                                                                            |
| `std.layout.alongpath`    | `alongpath(path, n) -> placements`. Returns rounded non-negative count at equal normalized arc-length parameters, including both ends. One placement uses the midpoint (`t = 0.5`). Headings follow `std.pathops.headingat`.                                                                                |
| `std.layout.fitpath`      | `fitpath(path, region, margin) -> path`. Uniformly scales `path` to fit the region's bounding box after a non-negative margin, then centers bounding boxes. Preserves aspect ratio and handles horizontal, vertical, and point-like source paths. It fits the bounding box, not the exact polygon interior. |

```text
import std.layout.circlelayout as circlelayout
import std.shapes.heartpath as heartpath

let motif = heartpath(6)
for placement in circlelayout(8, 25) [
  sewpath(xlate(xrotate(motif, placement[1]), placement[0][0], placement[0][1]))
]
```

---

## 8. `std.textures` — fill callbacks and clipped texture paths

### Direction reporters

Direction reporters return NeedleScript headings and are suitable for `fill dir`. They are drawless;
simplex noise is seeded but does not advance the main RNG.

| Import path                  | Signature and result                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.textures.radialdir`     | `radialdir(p) -> heading`. Heading of the ray from origin to `p`; returns 0 within `0.000001` mm of the origin.                                                     |
| `std.textures.griddir`       | `griddir(deg) -> reference`. Returns a direction reporter that ignores its point and always returns `deg`. Example: `fill dir griddir(30)`.                         |
| `std.textures.radialdirfrom` | `radialdirfrom(cx, cy) -> reference`. Returns a reporter whose rays originate at `[cx, cy]`; returns 0 at that center.                                              |
| `std.textures.curldir`       | `curldir(p) -> heading`. Divergence-free direction derived from finite differences of simplex noise at a fixed 14 mm scale. Returns 0 for a near-zero gradient.     |
| `std.textures.curldirwith`   | `curldirwith(scaledown) -> reference`. Configurable form of `curldir`; `scaledown` is the spatial noise scale and must be positive. Larger values vary more slowly. |

### Fill-shape reporters

These return `[rowSpacing, stitchLength, phase]` descriptors from the core `tatamirow` reporter and
are suitable for `fill shape`. Parameters `p` and, where unused, `row`/`v` remain present to match
the fill callback contract.

| Import path                      | Signature and result                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.textures.wovenshape`        | `wovenshape(p, row, v) -> descriptor`. Uses 0.8 mm row spacing, 3 mm stitches, and alternates phase 0/0.5 by row parity for a woven rhythm.                         |
| `std.textures.gradientshape`     | `gradientshape(p, row, v) -> descriptor`. Ramps row spacing from 0.45 to 1.2 mm using clamped cross-field coordinate `v`; stitch length is 2.5 mm and phase 0.5.    |
| `std.textures.gradientshapewith` | `gradientshapewith(lo, hi) -> reference`. Configurable gradient reporter interpolating spacing from `lo` to `hi`; it does not clamp the supplied spacing endpoints. |

### Geometric texture paths

Each generator creates a global, origin-aligned pattern and clips it to a simple region. Results are
lists of open path fragments, commonly two-point fragments, designed for `fill paths`. They are
drawless and do not add connector paths across concavities.

| Import path                     | Signature and result                                                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.textures.hilbertpaths`     | `hilbertpaths(region, cell) -> paths`. Builds the smallest power-of-two Hilbert grid whose scaled span covers the larger bounding-box dimension, then clips its continuous curve. `cell` controls target detail and must be positive.                                   |
| `std.textures.truchetpaths`     | `truchetpaths(region, cell) -> paths`. Alternating checkerboard Truchet quarter-circles, sampled every 15°. `cell` is tile size and must be positive.                                                                                                                   |
| `std.textures.hitomezashi`      | `hitomezashi(region, cell, rowbits, colbits) -> paths`. Alternating horizontal and vertical sashiko dashes. Rounded bit values modulo 2 set row and column phases cyclically, including at negative grid indices. `cell` must be positive and both bit lists non-empty. |
| `std.textures.seigaiha`         | `seigaiha(region, r) -> paths`. Staggered Japanese wave pattern with three concentric semicircles at each origin. `r` is the largest radius and must be positive.                                                                                                       |
| `std.textures.asanoha`          | `asanoha(region, cell) -> paths`. Hexagonally arranged hemp-leaf spokes and half-edges. `cell` must be positive.                                                                                                                                                        |
| `std.textures.herringbonepaths` | `herringbonepaths(region, w) -> paths`. Staggered zigzag herringbone units with horizontal/vertical scale `w`, which must be positive.                                                                                                                                  |

```text
import std.textures.curldirwith as curl
import std.textures.hilbertpaths as hilbert

fill dir curl(18)
fill paths hilbert([[-20, -20], [20, -20], [20, 20], [-20, 20]], 4)
beginfill
  repeat 4 [ fd 40 rt 90 ]
endfill
```

---

## 9. `std.stitchcraft` — sewing procedures

Unlike geometry helpers, these procedures can emit stitches and change machine modes. Their path
arguments contain point coordinates rather than turtle-relative distances because they ultimately
call `sewpath`/`setpos`.

| Import path                          | Signature and effect                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std.stitchcraft.sewrun`             | `sewrun(path, mm)`. Resamples `path` at spacing `mm`, then sews it with the current stitch mode and thread. Equivalent to `sewpath(resample(path, mm))`.                                                                                                                                                                                       |
| `std.stitchcraft.satinalong`         | `satinalong(path, w)`. Enables satin width `w`, sews `path`, then sets satin width to 0. The final satin state is always off, not restored to a prior width. Other satin settings still apply.                                                                                                                                                 |
| `std.stitchcraft.beanoutline`        | `beanoutline(region, n)`. Enables bean repeat `n`, sews the logically closed region, then sets bean repeat to 1. The prior bean setting is not restored.                                                                                                                                                                                       |
| `std.stitchcraft.appliquesteps`      | `appliquesteps(region, w)`. Performs a 2.5 mm running placement line, a narrow satin tack-down at `max(0.8, 0.35w)`, and a final satin cover at `w`. Inserts `stop` events between the three stages so fabric can be placed/trimmed. Each stage travels with needle up to the ring start. Ends at the closed ring's end with satin turned off. |
| `std.stitchcraft.appliquewith`       | `appliquewith(region, placementInset, tackdownInset, coverWidth, stops)`. Configurable three-stage appliqué construction. See below.                                                                                                                                                                                                           |
| `std.stitchcraft.eyelet`             | `eyelet(r)`. Sews a resampled satin circle centered at the current needle position. Radius must be positive; satin width is `clamp(0.55r, 0.6, 1.5)`. A `push`/`pop` pair restores needle position, heading, and pen state after sewing; satin ends off.                                                                                       |
| `std.stitchcraft.fillbordergeometry` | `fillbordergeometry(region, coverWidth, overlap) -> [fillRings, borderPaths, inset]`. Pure fill-and-border construction geometry. See below.                                                                                                                                                                                                   |
| `std.stitchcraft.fillandborder`      | `fillandborder(region, deg, spacing, coverWidth)`. Sews inset fill rows, inserts a `stop`, then sews the satin border. Uses the standard 0.4 mm overlap.                                                                                                                                                                                       |
| `std.stitchcraft.fillandborderwith`  | `fillandborderwith(region, deg, spacing, coverWidth, overlap)`. Explicit-overlap form of `fillandborder`.                                                                                                                                                                                                                                      |
| `std.stitchcraft.gradientbands`      | `gradientbands(region, deg, n) -> list of regions`. Geometry-only helper: slices a region into `max(1, round(n))` parallel bands oriented at heading/angle `deg` and returns all clipped pieces in band order. Concavity can yield more pieces than requested bands.                                                                           |
| `std.stitchcraft.gradientrows`       | `gradientrows(region, deg, pitch, amount) -> [rowsA, rowsB]`. Geometry-only, density-neutral two-color blend. See below.                                                                                                                                                                                                                       |
| `std.stitchcraft.gradientrowsn`      | `gradientrowsn(region, deg, pitch, weights) -> list of row groups`. Geometry-only, density-neutral blend across 2–8 colors. See below.                                                                                                                                                                                                         |
| `std.stitchcraft.serpentinerows`     | `serpentinerows(rows, reversed) -> routed rows`. Greedily routes parallel row paths with endpoint reversal enabled, beginning from the first row when `reversed` is false or the last row when true. Returns `[]` for empty input and does not mutate `rows`.                                                                                  |
| `std.stitchcraft.knockdown`          | `knockdown(region, deg, spacing)`. Sparse running-stitch foundation for fleece, terry, and other high-pile fabrics. See below.                                                                                                                                                                                                                 |
| `std.stitchcraft.threadblend`        | `threadblend(region, deg)`. Creates 1.2 mm fill rows at `deg`, sews even rows in the current color, advances once to the next color, then sews odd rows. Rows are resampled at 2.5 mm. Ends in the second color and does not restore needle position.                                                                                          |
| `std.stitchcraft.stipple`            | `stipple(region, mindist)`. Scatters candidate points and sews a small circular mark only where coverage within `mindist/3` is below one layer. `mindist` must be positive. Each mark restores turtle state with `push`/`pop`. Consumes exactly **1 main-stream RNG draw** through `scatter`.                                                  |

`threadblend` assumes a second usable thread slot. Numeric `color` selection and `colorindex()` differ
by one internally; the helper accounts for that when it advances to the next slot.

### Density-neutral gradient rows

`gradientrows` accepts either one ring or a compound list of rings. Compound geometry uses the
even-odd rule, so inner rings form holes and concave scanlines can produce multiple path fragments.
`pitch` must be 0.25–5 mm, matching the safe range of `fillrows`. The returned paths are unsplit and
have no pull compensation; callers choose stitch length, color order, routing, trims, and palette.

The one-argument reporter `amount(v)` returns color B's proportion from 0 to 1. `v` is normalized
from 0 at the first candidate scanline to 1 at the last along the row-seeding axis; a region with
only one candidate passes 0.5. The reporter is called once per candidate scanline, not once per
fragment. Out-of-range results are errors.

Each candidate scanline is assigned wholly to exactly one output group with deterministic error
diffusion. Therefore `len(rowsA) + len(rowsB)` equals the `fillrows` fragment count and the two
groups never contain coincident candidate rows. The helper itself consumes no RNG draws; an
`amount` reporter that deliberately calls random helpers still consumes its own documented draws.

```text
import std.stitchcraft.gradientrows as gradientrows

def fade(v) [ return pow(v, 1.6) ]
let region = [[-20, -12], [20, -12], [20, 12], [-20, 12]]
let groups = gradientrows(region, 90, 0.5, @fade)

color '#1b6ca8'
for row in groups[0] [ up setpos(first(row)) down sewpath(resample(row, 2.5)) ]
trim
color '#e94560'
for row in reverse(groups[1]) [ up setpos(first(row)) down sewpath(resample(row, 2.5)) ]
```

`gradientrowsn` generalizes the same candidate set to 2–8 color channels. Its one-argument
`weights(v)` reporter returns a fixed-length list of non-negative numeric weights. The helper
normalizes the list at every candidate scanline, so `[1, 2, 1]` and `[0.25, 0.5, 0.25]` are
equivalent. At least one weight must be positive on every row. The result contains one row group per
weight, in weight-list order; empty groups are valid. If the region produces no candidate scanlines,
the helper returns `[]` without invoking the reporter because no weight-list length is available.

Normalized weights accumulate as channel deficits. Each scanline goes wholly to the channel with
the largest deficit, then one is subtracted from that channel. Stable ties choose the lower channel
index. This deterministic multichannel error diffusion keeps aggregate pitch unchanged and keeps
prefix quantization error bounded instead of accumulating independent rounding error. Compound
scanline fragments remain together. The reporter runs once per candidate scanline.

Malformed results identify `gradientrowsn @weights` and the zero-based candidate row. Errors cover
non-list results, list-length changes, lengths outside 2–8, non-numeric or negative entries, and
all-zero weights. The helper consumes no RNG draws beyond any draws deliberately made by the
reporter.

Partitioning can interrupt the alternating direction inherited from `fillrows`. Pass each group to
`serpentinerows(group, false)` to route from the low end of the seeding axis, or use `true` to enter
from the opposite end. The helper uses `routesort(..., 'both')`, so paths may be reversed to reach
the nearer endpoint. Callers still own color order, trims, stitch subdivision, and palette.

```text
import std.stitchcraft.gradientrowsn as gradientrowsn
import std.stitchcraft.serpentinerows as serpentinerows

def sunset(v) [ return [pow(1 - v, 1.5), 4 * v * (1 - v), pow(v, 1.5)] ]
let groups = gradientrowsn([[-20, -12], [20, -12], [20, 12], [-20, 12]], 90, 0.5, @sunset)
let inks = ['#1464a0', '#d63f78', '#f2b134']

for channel = 0 to 2 [
  color inks[channel]
  for row in serpentinerows(groups[channel], mod(channel, 2)) [
    up setpos(first(row)) down sewpath(resample(row, 2.5))
  ]
  trim
]
```

### Production construction recipes

`knockdown(region, deg, spacing)` lays one clipped pass of sparse running-stitch rows beneath later
embroidery. `region` accepts a simple ring or compound even-odd rings. Spacing is restricted to
1–5 mm so the helper remains a foundation rather than a topping fill; 2.5–4 mm is typical for
fleece or terry. Rows are routed serpentine and resampled at 3.5 mm. No fill or satin underlay is
added, and the helper consumes no RNG draws. It turns satin and E-stitch off, resets bean to one,
and ends in running-stitch mode.

```text
import std.stitchcraft.knockdown as knockdown

fabric 'fleece'
color '#d8c8b8'
knockdown([[-24, -16], [24, -16], [24, 16], [-24, 16]], 30, 3)
```

`fillbordergeometry(region, coverWidth, overlap)` is the pure planning layer for bordered fills.
The border centerline follows each original boundary. The fill inset is
`coverWidth / 2 - overlap`: a 2 mm border and 0.4 mm overlap therefore inset the fill by 0.6 mm.
`coverWidth` must be 0.8–8 mm and overlap must be from zero through half the cover width. Outer
boundaries shrink while hole boundaries grow, preserving the compound even-odd exclusion. Insets
may split concave regions or collapse narrow ones. Border paths explicitly repeat their first point.

`fillandborder(region, deg, spacing, coverWidth)` sews that geometry with the recommended 0.4 mm
overlap. `fillandborderwith(..., overlap)` exposes the overlap explicitly. The fill stage uses
clipped, serpentine rows resampled at 2.5 mm without fill underlay or pull compensation. A `stop`
then advances to the border color, and the original centerlines are sewn as satin using the current
satin density, underlay, and pull-compensation settings. Both forms end with satin off in the border
color. They error if the inset eliminates the fill stage.

```text
import std.stitchcraft.fillandborder as fillandborder

palette ['#2f7d8c', '#f4d35e']
underlay 'off'
fillandborder([[-20, -12], [20, -12], [20, 12], [-20, 12]], 25, 0.8, 2.4)
```

`appliquewith(region, placementInset, tackdownInset, coverWidth, stops)` adds configurable placement,
tack-down, and satin-cover stages without changing legacy `appliquesteps`. Insets are non-negative;
the cover width is 0.8–8 mm. `stops` is `[afterPlacement, afterTackdown]`, so `[1, 1]` exposes both
fabric-handling pauses while `[0, 1]` only pauses before the cover. The placement is a 2.5 mm running
outline; tack-down width is `max(0.8, coverWidth * 0.35)`; the cover follows the original boundary.
Compound rings and holes use the same parity-aware inset behavior. The procedure ends with satin
off, in the color reached by its enabled stops. Collapsed placement or tack-down geometry is an
error.

```text
import std.stitchcraft.appliquewith as appliquewith

appliquewith([[-18, -12], [18, -12], [18, 12], [-18, 12]], 0.3, 0.8, 2.5, [1, 1])
```

All three sewing recipes force plain running mode for their running stages by turning satin and
E-stitch off and resetting bean to one. They do not restore prior construction settings; callers
should set any desired follow-on modes explicitly.

---

## 10. `std.debugx` — preview and stitch diagnostics

All debug helpers are drawless. Chalk procedures add preview metadata but never add machine events,
so chalk does not affect stitch count, bounds, export, or coverage.

| Import path                 | Signature and result                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `std.debugx.chalkgrid`      | `chalkgrid(cell)`. Adds a `'grid'` line group spanning the configured field bounds, aligned to global multiples of `cell`. `cell` must be positive.                                                                                                                            |
| `std.debugx.chalkbbox`      | `chalkbbox(path)`. Adds a closed, axis-aligned `'bbox'` line overlay around `path`. Expects non-empty geometry accepted by core `bbox`.                                                                                                                                        |
| `std.debugx.chalkfield`     | `chalkfield()`. Adds a `'field'` line overlay of the current sewable field path. Works for circular and rectangular hoop fields.                                                                                                                                               |
| `std.debugx.threadestimate` | `threadestimate() -> number`. Returns the polyline length through committed penetration points, in millimetres, or 0 with fewer than two points. It is an estimate: stitch history does not retain trims or color boundaries, and it does not model bobbin/thread consumption. |
| `std.debugx.coverprofile`   | `coverprofile(path, stride) -> list`. Samples `coverat` along a resampled path and returns `[distanceMm, coverageLayers]` pairs. `stride` must be positive. Empty path returns `[]`; a one-point path returns one sample at distance 0.                                        |

Diagnostics observe history at the moment they are called. Later stitches do not retroactively change a
previously returned `threadestimate` number or `coverprofile` list.

---

## 11. Quick module index

| Module            | Purpose                                            | Emits stitches? | Main RNG draws?                                       |
| ----------------- | -------------------------------------------------- | --------------- | ----------------------------------------------------- |
| `std.mathx`       | Easing, angles, vectors, remapping, random helpers | No              | Only the five random helpers: 1, 1, 1, 1, and 2 draws |
| `std.listx`       | Sorting, selection, reshaping, predicates          | No              | Only if the supplied callback draws                   |
| `std.shapes`      | Centered closed/open path constructors             | No              | No                                                    |
| `std.pathops`     | Arc-length queries and polyline transformations    | No              | No                                                    |
| `std.regions`     | Region measurement, tiling, insets, partitions     | No              | `partitions`: exactly 1; otherwise no                 |
| `std.layout`      | Point/heading layouts and uniform fitting          | No              | No                                                    |
| `std.textures`    | Direction/shape callbacks and clipped fill paths   | No              | No                                                    |
| `std.stitchcraft` | Reusable embroidery construction rituals           | Usually         | `stipple`: exactly 1; otherwise no                    |
| `std.debugx`      | Chalk overlays and stitch-history diagnostics      | No              | No                                                    |

When exact output stability matters, remember that a callback supplied to a library helper can add its
own side effects or RNG consumption even when the helper itself is drawless.
