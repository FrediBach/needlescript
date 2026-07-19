# NeedleScript Machine Architecture

NeedleScript is a Logo-inspired language for generative embroidery. This document
describes the **stitch machine** — the component that turns turtle movements and
embroidery directives into a concrete stream of stitch events. It is the side-effect
target the interpreter drives (see `needlescript-interpreter-architecture.md`) and the
source of the `StitchEvent[]` that the file exporters (`svg.ts`, `dst.ts`, `pes.ts`,
`exp.ts`) consume.

Like the rest of `src/lib/`, the machine is platform-neutral: no DOM APIs, no UI. It is
part of the publishable core.

Units are millimetres throughout. Headings are turtle degrees: `0` = up/north,
clockwise positive — the same convention as `seth`, `atan`, `towards`, and the affine
constructors.

---

## 1. Where the machine sits

```
interpreter (exec-cmd.ts, exec-stmt.ts, reporters.ts)
        │  method calls: forward / arc / setXY / beginFill / pushTransform / flushSatin …
        ▼
   ┌──────────┐   StitchEvent[]        ┌──────────────┐
   │  Machine │──────────────────────► │  postprocess │──► RunResult.events
   └──────────┘   + warnings, density  └──────────────┘   (plan, autotrim, density, locks)
```

The interpreter never emits stitches directly. It computes values and control flow,
then calls methods on its `ctx.m` (a `Machine` instance). The machine owns turtle
state, the transform/effect stacks, satin/fill buffering and generation, the coverage
grid, the run budgets, and the accumulating `events` array. This separation keeps the
layers clean: the interpreter is _language semantics_, the machine is _embroidery
physics and event accumulation_.

---

## 2. Module layout (`machine/`)

```
machine/
├── index.ts    barrel: re-exports LIMITS, STOCK_LIMITS, OVERRIDE_*, BudgetKey, Machine
├── limits.ts   engine limits + overridable per-run budgets
├── machine.ts  public Machine facade: color/trim commands over the subsystem hierarchy
├── machine-core.ts  turtle state, stacks, trace sandbox, emission, and travel()
├── machine-satin.ts satin columns and buffered running-stitch generation
├── machine-fill.ts  fill recording and built-in / programmable fill generation
└── fill.ts     the standalone tatami scanline fill generator
```

`machine.ts` (the file at `src/lib/machine.ts`) is a thin shim re-exporting from
`machine/index.ts`, kept so existing import paths work unchanged
(`machine.ts:1-10`).

Tightly-coupled collaborators live one level up:

- `affine.ts` — the 2×3 matrix math shared by the transform stack.
- `underlay-profile.ts` — ordered satin/fill underlay pass types, centralized numeric ranges, pure
  validation, and context-aware lowering of legacy modes and `fabric` presets.
- `embroidery-registry.ts` — compatible legacy fabric construction settings plus typed fabric,
  thread, needle, stabilizer, and topping profiles/defaults.
- `directional-compensation.ts` — pure grain-aligned compensation tensors, heading projections,
  open-path endpoint extension, material resolution, and preview diagnostics shared by opt-in
  satin/fill construction.
- `fill-profile.ts` — fill inset/edge/stagger ranges, connector/stagger mode registries, internal
  connector classification types, and pure drawless row-phase calculation including geometry
  hashing.
- `satin-profile.ts` — cap/join/wide modes, physical ranges, cap helpers, and pure split-count/seam
  helpers.
- `column-analysis.ts` — pure hoop-space spine/rail analysis for satin tips, tangents, curvature,
  realized widths, corners, tapers, unsafe width/radius ratios, and emission-free segmentation.
- `rail-pair.ts` — pure rail orientation, seam/checkpoint projection, arc-length pairing, and derived-spine interpolation shared by `satinbetween` and `railspine`.
- `postprocess.ts` — `DensityGrid` (the live coverage index the machine feeds), plus
  the post-run `applyLocks`, `applyAutoTrim`, and `designStats` passes.
- `routing.ts` / `travel-planner.ts` — shared route algorithms and the optional
  event-level planner. They consume completed events and never mutate machine state.
- `effects.ts`, `declump.ts`, `genmath.ts`, `hoop-presets.ts` — effect maps, declump
  state, geometry helpers, and hoop field definitions.

---

## 3. Output model: `StitchEvent`

The machine's product is `events: StitchEvent[]` (`types.ts:20-28`):

```ts
interface StitchEvent {
  t: 'stitch' | 'jump' | 'color' | 'trim' | 'mark';
  x: number;
  y: number; // hoop-space coordinates (mm)
  c: number; // color index
  line?: number; // source line that produced it (debugging/preview)
  u?: 1; // underlay stitch (drawn lighter in previews)
  label?: string; // mark events only
}
```

Every event is in **hoop space** — the machine maps local turtle coordinates through
the transform/warp stack _before_ pushing. `line` carries the source line (or the
caller's line, when inside a procedure) so previews can highlight the responsible code.

Planner constraints do not extend this public shape. During finalization the travel planner wraps
each authored event in a private `{ event, tags }` record, performs routing on those records, and
unwraps them before auto-trim, locks, `RunResult`, or an exporter can observe the stream. `planbarrier`
records sparse authored event-boundary offsets, while `atomic` and `routegroup` record sparse
outermost event spans while the machine stream is append-only; finalization compiles those into
wrapper segment/atomic/group tags at that one lowering boundary. See the Session 6.1 decision record in
`embroidery-results-implementation-plan.md`.

---

## 4. Machine state

The public `Machine` class is a small facade over `FillMachine`, `SatinMachine`, and
`MachineCore`. Together they form one mutable machine object; its state groups into:

| Group           | Fields                                                                                                                                                                                         | Notes                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Turtle          | `x`, `y`, `heading`, `penDown`                                                                                                                                                                 | always in **local** space                                              |
| Stitch config   | `stitchLen`, `stitchLenList`/`Reporter`, `mode`, `beanRepeats`                                                                                                                                 | one of numeric / list / reporter stitch-length forms active at a time  |
| Satin           | `satinWidth`, `satinSpacing`, `satinSide`, cap/join settings, `satinWide`/`MaxWidth`/`SplitOverlap`, `eWidth`, `satinReporter`, `satinPath`                                                    | buffered column                                                        |
| Fill            | `fillAngle`, `fillSpacing`, `fillInset`, `fillEdgeRun`, `fillEdgeShort`, `fillStagger`/`Amount`, `fillConnect`, `fillLen`(+list/reporter), `fillArmed`, `fillDirReporter`, `fillShapeReporter` | tatami + programmable                                                  |
| Physics         | `lockLen`, `pullComp`/provenance, `compensationMode`, `underlayMode`, `fillUnderlayMode`, `doubleUnderlay`, `shortStitch`, `autoTrim`, `maxDensity`                                            | selectors lower to typed profiles at generation time                   |
| Material        | `materialIntent`                                                                                                                                                                               | thread width feeds coverage; legacy `fabric` also affects construction |
| Output          | `events`, `warnings`, `colorIdx`, `lastEmit`, `started`                                                                                                                                        | accumulation                                                           |
| Transform stack | `ctm`, `outLayers`, `hasWarp`, `penLayers`, `declumpStack`                                                                                                                                     | see §6                                                                 |
| Hoop            | `hoopInfo`, `hoopSet`, `fieldLocked`, `fieldOverflows`                                                                                                                                         | see §9                                                                 |
| Budgets         | `effectiveLimits`, `activeOverrides`                                                                                                                                                           | see §10                                                                |
| Coverage        | `density` (a `DensityGrid`), `usedQuery`                                                                                                                                                       | see §8                                                                 |
| Trace           | `traceRecording`, `traceRuns`, `noEmit`                                                                                                                                                        | see §11                                                                |

`effectiveLimits` starts as a mutable copy of `STOCK_LIMITS`
(`machine/machine-core.ts`) so `override` can raise/lower budgets per run without
touching the shared constants.

### 4.1 Construction configuration snapshots

`Machine.snapshotConstructionConfig()` captures the settings that determine how future movement is
constructed, and `restoreConstructionConfig(snapshot)` restores only those settings. The typed
`ConstructionConfigSnapshot` includes running-stitch numeric/list/reporter forms and list progress;
bean and E-stitch modes; satin width/reporter, spacing, alternating side, independent cap modes,
cap transition length, corner policy/threshold, wide-column policy/ceiling/interlock, and optional custom
underlay pass/length/inset/spacing overrides; fill angle, spacing, construction inset, edge-run
inset, minimum useful row-fragment length, stagger mode and amount, connector policy,
fill-underlay pass/length/inset/spacing/relative-angle overrides,
length forms, and an unused one-shot fill arm; the lock, pull-compensation value/provenance/mode, underlay,
short-stitch, auto-trim, and density settings; and a copied resolved material-intent record. Current
`fabric` presets resolve into these same physics fields, so their construction effects and material
metadata are scoped without treating warning notes as state.

Snapshots deliberately exclude turtle and push/pop state, output and coverage history, warning
history, color, transforms/effects, hoop and field state, budgets/overrides, and trace state. Reporter
functions retain reference identity. Mutable stitch/fill length patterns and static armed-fill paths
are copied when taking and restoring a snapshot, so later mutation of live configuration cannot
alter the saved value.

Material intent stays separate from generated geometry. `materialIntent`
records the fabric preset, grain and stretch axes, generic thread profile/width, optional needle,
stabilizer category, and topping boolean. Only `fabric` continues to update the legacy scalar
construction physics above. `threadprofile` and `threadwidth` also synchronize the live coverage
grid's width; grain and stretch additionally feed the pure directional preview model. None of them
changes events. Trace and construction snapshots copy the record and restore the grid width, and
finalization exposes a fresh material copy as `RunResult.material`.

An active `beginfill` recording cannot cross either boundary. A pending satin column or
reporter-driven running stretch is flushed before the snapshot or restore; otherwise the methods are
event-free and leave list-cycle progress untouched. An unused fill arm may cross the boundary and is
restored with the other construction settings. Replacing such an outer arm still uses the existing
single note emitted by `fillarm`; merely crossing the boundary adds no warning.

The interpreter's `stitchscope [ … ]` node pairs these methods in `try/finally` order.
Nested scopes therefore restore LIFO through procedure returns, loop-control signals,
and runtime errors. Restoration itself reinstates the snapshot in a `finally`, so an
error raised while flushing an inner buffered reporter cannot strand its configuration.

### 4.2 Directional compensation preview

`directional-compensation.ts` models compensation as a signed symmetric tensor in physical hoop
space. For grain heading `g`, its principal axes are the turtle-heading unit vectors at `g` and
`g + 90°`. If their signed recommendations are `a` and `c`, the tensor is
`T = R(g) diag(a, c) R(g)ᵀ`. `compensationForHeading` projects `T` onto any construction heading and
its clockwise perpendicular using quadratic forms. Rotating grain and construction together leaves
both projections unchanged; rotating grain by 90° while swapping `a`/`c` leaves the hoop tensor
unchanged.

Resolution is intentionally conservative. The selected fabric preset supplies its established
legacy pull magnitude `p`. Declared stretch weights `1 + stretchAlong` and `1 + stretchAcross`
redistribute `p` between the axes, normalized so the two recommendations still average to `p`.
Neutral stretch therefore reproduces the scalar recommendation, while unequal stretch makes it
anisotropic without inventing an unmeasured total increase. An unspecified fabric has no calibrated
magnitude and resolves to zero. Thread, needle, stabilizer, and topping metadata do not modify the
recommendation. Push tensors use negative values for shortening and currently resolve to zero until
physical sew-out measurements exist.

Finalization calls `directionalCompensationPreview` once and exposes the result as
`RunResult.compensation`: the current scalar, its source, the resolved signed tensors, and
projections at the grain and cross-grain headings. With the default `compensationMode = 'legacy'`,
this remains comparison-only. The opt-in `'directional'` mode uses the same pure resolver for satin
and open fill-row geometry. The existing satin-oriented `appliedMode` value remains stable for API
compatibility; additive `fillEndpointMode` reports the fill policy. Borders and running stitches do
not read the tensor.

Directional satin replaces the preset tensor's mean magnitude when `pullCompExplicit` is true; it
does not replace the stretch-derived axis ratio. `fabric` restores its profile scalar and clears the
flag, so later source wins in both directions. Push stays zero and is not applied. This is a
construction-specific rail widening, never a generic affine scale.

---

## 5. The stitching pipeline: `travel()`

Almost all sewing funnels through `travel(nx, ny)` (`machine/machine-core.ts`), reached
via `setXY` (`643`), `forward` (`655`), and `arc` (`667`). `arc` decomposes a curve into
half-turn / chord / half-turn steps so every stitch mode works on curves. `travel`
dispatches, in order:

1. **Trace recording** (`730`) — if inside `trace`, record the pre-split turtle spine
   as path data and return without emitting (see §11).
2. **Fill recording** (`760`) — if between `beginfill`/`endfill`, record the boundary
   ring (hoop space, plus local space for armed fills) and return.
3. **Pen up** (`792`) — flush any satin, emit a `jump` to the destination, reset active
   declump runs, and return.
4. **Satin mode** (`806`) — buffer the column centerline in local space (snapshotting
   the output stack); the column is generated when it ends (`flushSatin`).
5. **E-stitch mode** (`836`) — emit the zig-out/back E-shape per step.
6. **Running stitch** — the default, split into three forms:
   - **Reporter buffered** (`874`) — defer splitting; buffer the spine until the stretch
     ends, then split via `flushRunningStitch`/`_splitBufferedStretch` calling the
     user's `stitchlen @fn`.
   - **List cycling** (`888`) — split using a cycling length pattern (`stitchlen [a,b,…]`).
   - **Uniform numeric** (`957`) — split into equal `ceil(hlen / stitchLen)` steps.

A crucial invariant, repeated in the comments: **transform the path, then stitch it.**
Both endpoints are mapped to hoop space _first_ (`mapOut`), and splitting is done on the
_hoop-space_ length, so physical stitch length stays correct under scaling. With no warp
active, `mapOut` is exactly `apply(ctm, …)` — the byte-identical fast path that keeps
non-transformed output unchanged.

### 5.1 Emission and the tiny-stitch merge

Points are emitted through a short chain:

- **`_emitPen(x, y, u)`** (`543`) — applies the after-split `penLayers`
  (humanize/snaptogrid) then the tiny-stitch check.
- **`_emitRaw(x, y, u)`** (`587`) — for the declump path, where layers are pre-applied; the optional
  underlay flag lets generated fill underlay retain its preview classification.
- **`_dropTiny`** (`599`) — sub-half-minimum moves are merged into neighbours and
  recorded (capped at 200) so a "N sub-0.4 mm moves merged" warning can point at them.
- **`_push(t, x, y, u)`** (`605`) — the single choke point that appends a `StitchEvent`.
  It enforces `maxStitches`, feeds the `DensityGrid`, updates `lastEmit`, and records
  the first 50 stitches that fall outside the sewable field / hoop (§9). When `noEmit`
  is set (trace sandbox) it is a no-op.

`_ensureStart` (`635`) lays the implicit first stitch at the origin the first time
anything sews.

---

## 6. Transforms, warps, and effects (the layer stacks)

The machine maintains three separate stacks, all block-scoped by the interpreter's
`transform`/`effect` statements:

- **Pre-split output stack** (`outLayers`, `ctm`, `hasWarp`) — the `translate`/`rotate`/
  `scale`/…​ CTM and nonlinear `warp` reporters. Pushed via `pushTransform`/`pushWarp`,
  popped via `popOut` (`255-279`). Applied to geometry _before_ stitch splitting.
  `ctm` is the collapsed affine of all transform layers (warps ignored); `mapOut`
  (`510`) applies the full stack inside-out when a warp is present.
- **After-split penetration stack** (`penLayers`) — `humanize`/`snaptogrid` maps applied
  to each _final_ penetration point (`pushPen`/`popPen`, `282-287`).
- **Declump stack** (`declumpStack`) — stateful along-axis crowd-relief folds that need
  lookahead over the full split sequence, so they run on a pre-computed point list
  (`pushDeclump`/`popDeclump`, `290-295`). Fill generation uses the same fold at commit time with
  additional compound-region and monotonic-order candidate guards.

The affine math lives in `affine.ts`: `Mat` is a 2×3 matrix `[a,b,c,d,e,f]`; `compose`
composes inside-out (OpenSCAD reading); `apply`/`linApply` map points/directions; and
constructors (`mTranslate`, `mRotate`, `mScale`, `mMirror`, `mSkew`, `mRaw`) use turtle
conventions. Because the transform _block commands_ and the pure _path functions_
(`xlate`/`xrotate`/…) call the same matrices, a transform block and its `x*` companion
produce bit-identical geometry — a property the test suite pins (`affine.ts:1-12`).

The satin buffer and fill also snapshot the stack at the moment they begin
(`satinCTM`/`satinLayers`, `fillCTM`/`fillLayers`) so a buffered column or region is
always mapped under one consistent transform, even if the block ends before the flush.

---

## 7. Satin columns and fills

### 7.1 Satin (`flushSatin`, `machine/machine-satin.ts`)

A satin column is buffered as a local-space centerline while in satin mode, then sewn
when the column ends (a pen move up, mode change, transform boundary, color change, or
explicit flush). `flushSatin` first flushes any running-stitch buffer, then dispatches:

- `_flushSatinProgrammable` — a `satin @fn` shape reporter drives width/advance per pair;
- `_flushSatinPlain` — the exact, byte-identical path when no transform/warp is active;
- `_flushSatinTransformed` — maps the centerline to hoop space (warp deforms the spine;
  width stays affine).

Before emission, the legacy mode, realized physical width, running-stitch length, generator variant,
and doubled flag lower to an ordered `SatinUnderlayPass[]`. Pass data carries kind, running length,
edge inset intent, zigzag width/spacing, and return-run policy. The explicit variant preserves the
historical buffered-spine, rail-pair, and programmable doubled-center differences. The passes are
laid first, then the topping zigzag (`_zigzagAlong`, `1054`). The topping
applies the **short-stitch** curve fix: on tight curves the inner-edge penetrations
bunch up (breaking thread and damaging fabric), so alternate inner stitches are pulled
in to 60% width, and an over-wide-for-the-curve column raises a warning.

The parameter commands layer a `SatinUnderlayCustomization` over that legacy resolution. Without an
explicit pass list, numeric overrides retain the selected legacy/automatic pass order. With one,
the authored order is resolved directly and preset doubling is omitted. Custom edge inset is always
absolute hoop-space millimetres; ratio insets exist only in lowered legacy profiles. Buffered spine,
programmable satin, and rail-pair satin consume the same pass objects. A requested absolute inset
that reaches the center of a narrow column is clamped there and warns once per column. Every pass
emits through the existing underlay paths with `u: 1`.

`compensation 'directional'` resolves a pull tensor once per satin construction and projects it
across each physical column heading. Numeric and programmable spine columns map their centerline to
hoop space before measuring the heading; the resulting amount is then added in physical millimetres
along the realized rail direction, after authored width scaling. `satinbetween` maps and pairs both
rails first, then widens each physical rung by the same projection. Rotation therefore changes the
result only relative to fixed fabric grain, while rotating grain and design together preserves the
column modulo rotation. Non-uniform transforms scale authored width but never scale compensation.

The resolved per-rung widths are shared by caps, underlay selection/insets, curve analysis, wide-
column splitting, short-stitch relief, rail-pair snag checks, and ceiling subdivision. Legacy mode
does not enter this branch and retains its exact scalar paths. Directional mode is drawless; changing
the mode, fabric, grain, stretch, or explicit pull while a directional spine is buffered flushes the
old construction first.

For an open column with a non-legacy `satincap`, the shared analyzed physical length and realized
endpoint widths resolve independent start/end cap constructions before topping emission. `butt`
retains full width; `taper` uses a smooth ramp to a safe terminal bite; `point` converges to the
spine tip; and `round` applies the circle equation to half-width over a radius equal to half the
realized endpoint width. A round end that cannot fit within `satincaplen` or half the column warns
and resolves to point. Width factors are applied to buffered plain/transformed, programmable, and
rail-pair topping in hoop space. Point/round endpoints are pinned at the analyzed tip. Exact
coincidences merge silently, while nonzero sub-half-minimum moves use the existing recorded tiny
merge. Narrowing modes trim each underlay path by its resolved physical cap span before pass
construction, keeping the underlay inside the final topping envelope. Closed columns resolve both
ends to `legacy` and retain their seam. The default `legacy` branch avoids cap interpolation
entirely, preserving exact events.

For a non-legacy `satinjoin`, topping candidates retain their hoop-space center, side, cumulative
arc, and realized width. The shared column analysis selects samples whose absolute turn meets
`satinCornerAngle` (5–175°, default 60°), after which `machine-satin.ts` applies one bounded local
construction:

- `continuous` keeps the existing walk and applies alternating 60%-width inner relief when
  `shortStitch` is enabled;
- `fan` interpolates outer normals around the vertex, caps the corner window at eight outer
  penetrations, and keeps no more than two shortened inner bites;
- `miter` intersects the two offset rail lines, rejects intersections beyond the 2.5× realized-
  width miter limit, and overlaps the incoming/outgoing straight legs by at most 0.5 mm;
- `split` extends and restarts those legs by the same bounded physical overlap without a miter.

All underlay passes remain continuous over the original spine/rail correspondence. Miter and split
replace topping points only and connect with ordinary stitches, so no join introduces a jump,
trim, color change, or lock. Insufficient support, near-reversals, excessive miters, and unsupported
closed joins warn with the source line and fall back locally to `continuous`. The default `legacy`
branch does not buffer or rewrite topping points and therefore preserves exact prior events.
Programmable candidates use their realized reporter widths; rail-pair candidates continue to use
the checkpoint-anchored `RailPairGeometry`, so join processing cannot discard authored
correspondence. All policy decisions are deterministic and drawless.

With `satinWide = 'split'`, a numeric open spine or non-reporter rail-pair column whose maximum
realized width exceeds `satinMaxWidth` enters a shared wide-column branch before legacy underlay or
topping emits. The branch builds oriented physical rungs after transform, warp, pull compensation,
and cap factors. `satinSplitCount` sizes a constant lane count against the widest rung while
reserving the configured seam interlock. At every topping row, adjacent lanes share one boundary;
`satinSplitSeamFraction` shifts that boundary by alternating half-overlap ownership instead of
overdrawing two complete columns. Aggregate topping coverage therefore stays near one layer without
a fixed dense seam.

Each lane resolves its own satin underlay profile and emits that underlay before its topping. A
deterministic nearest-end selection reverses lanes when useful, producing a serpentine route with a
short jump between constructions. The splitter preserves taper and cap widths by interpolating the
physical rung field. It rejects closed seams, sharp/cusp/U-turn analysis, width beyond local curve
radius, rung-orientation reversal, and rail crossing before any split event is emitted. Reporter
spine satin and reporter rail-pair inset/rake warn and retain the existing generator because their
per-penetration topology cannot be partitioned safely. `warn` bypasses every new calculation and is
the exact legacy path. The settings are construction snapshots, are inert inside trace, and consume
no RNG draws.

After-split effects (humanize/snaptogrid/declump) deliberately **skip** satin rails —
perturbing a precise rail wrecks the column — with a one-time warning.

`sewSatinBetween` is the immediate rail-pair sibling. It flushes a buffered spine column without changing the sticky mode, maps both rails and checkpoints through the active output stack first, then pairs them in physical hoop space. Its realized endpoints reuse satin underlay, pull compensation, short-stitch relief, tip merging, snag/ceiling checks, density accounting, and effect-skip conventions; history is committed before the call returns. Orientation, closed seams, checkpoints, and crossing diagnostics are deterministic and drawless.

Before cap/join/wide policies select a construction, `column-analysis.ts` can lower either an
already mapped spine plus realized widths or the oriented samples from `prepareRailPair` into the
same `AnalyzedColumn`. Cumulative arc length and all radii/widths are physical hoop millimetres.
Samples retain incoming/outgoing and bisector tangents, signed curvature and turn, corner angle,
width slope, taper/tip state, continuous-versus-sharp classification, and width-to-limiting-radius
ratio. Rail inputs additionally retain each rail's curvature. Declared indices or detected turns
split the model into corner-sharing open segments; a closed column without corners remains one
closed segment. This pass copies input geometry, emits no events, and reads no RNG. The
plain/transformed buffered satin and rail-pair curvature guards consume its compatibility metrics.
Cap policies consume physical length, endpoint/tip classification, and realized widths; corner
policies consume sharp samples, tangents, arc positions, and realized widths; wide-column splitting
uses the closed/sharp/cusp/unsafe classifications plus the same hoop-space rungs.

### 7.2 Fills (`beginFill`/`endFill`, `machine/machine-fill.ts`)

`beginFill` enters recording mode; `travel` then records the boundary rings.
`endFill` closes the rings and generates stitches. Two engines exist:

- **Built-in tatami** — `generateFill` in `fill.ts` (a standalone, pure function):
  rotates the region to the fill angle, scans horizontal rows at `spacing`, computes
  span crossings with even-odd inside testing, applies scalar or pre-resolved directional pull
  compensation (`comp`),
  orders rows/segments greedily by nearest endpoint, subdivides to stitch length with a
  per-row phase offset (`row % 3`) to avoid tramline artifacts, and unrotates. The default
  `fillStagger = 'legacy'` takes this exact path. Opt-in brick/progressive/random policies replace
  only the topping grid phase; random hashes the spatial row key at micrometre precision and never
  reads the seeded RNG. Policy-created edge fragments below the minimum stitch length are omitted
  with one spatial/source warning. `endFill`
  wraps it with profile-driven underlay and the topping pass. Legacy lowering resolves mode, area,
  topping spacing, doubling, and generator variant into ordered edge/tatami passes carrying inset,
  stitch length, row spacing, angle intent, minimum area, and direction-field behavior. Existing
  `auto` gates and fleece ordering remain exact.
  Before either engine runs, a positive `fillInset` offsets the recorded compound even-odd region
  inward in physical hoop space through the shared Clipper geometry. Outer boundaries shrink,
  hole boundaries expand into the filled material, and concave regions may split. The resulting
  region drives both underlay and topping; disconnected pieces retain jump-only crossings. Empty,
  collapsed, and split topology emits source-attributed spatial warnings. The zero default bypasses
  Clipper entirely and preserves the historical byte-identical path.
  Parameter commands layer a `FillUnderlayCustomization` over this lowering. Numeric-only
  customization retains the legacy pass selection; an explicit pass list supplies the exact order
  and removes legacy area/doubling gates. Plain scanline, direction/shape, and custom path fills all
  resolve through the same profile. Custom scanline edge passes use the Clipper-backed compound
  even-odd inset, and separate resulting contours are joined only by jumps. Tatami parameters are
  physical millimetres; its angle remains relative to the topping or local direction field.
- **Programmable fill** — `_generateProgrammableFill` (`2165`), armed by
  `fill dir @d shape @s` via the `fillarm` statement. A direction reporter returns a
  per-point heading (a flow field) and a shape reporter returns `[spacing, len, phase]`.
  The generator walks streamlines through the field. It detects the constant-field /
  constant-shape case and short-circuits to the identical tatami path so simple
  programmable fills stay byte-identical to the built-in. Reporters always see **local**
  coordinates (engine-chosen hoop sample points are mapped back through
  `invert(fillCTM)`), while placement runs in physical hoop space.
  Legacy mode retains the existing cumulative reporter phase. For non-legacy stagger policies that
  cumulative value is the base, a pure per-row policy offset is added and wrapped, and the resulting
  fraction is converted through the row's first effective numeric/list/reporter stitch length.
  Topping row entry uses the same resolved connector policy as the fixed generator.
- **Custom path fill** — `fill paths @gen|expr` supplies ordered path geometry. At
  `endFill`, the machine maps the recorded compound region into the fill frame,
  invokes or reads the frozen generator, clips open/closed paths by even-odd parity,
  extends open ends for pull compensation, lays normal region underlay, subdivides
  through the active fill-length form, and applies the connector policy without sorting or reversing
  returned paths.
  Region underlay is deliberately independent of those returned paths: it is generated from the
  recorded compound region before decorative path emission, preserving holes and disconnected
  components.

`compensation 'directional'` changes only open topping-row endpoints. Fixed tatami projects the
resolved pull tensor along its physical scan-row heading. General direction-field streamlines and
custom paths map their geometry to final hoop space first, then independently extend the start and
end along their local endpoint tangents with `compensateOpenPathEnds`; curved paths therefore need
not receive the same amount at both ends. Closed custom contours are explicit and remain unchanged.
Push is not applied because the material registry still resolves it to zero pending sew-out data.
Underlay retains its established construction.

Before `fillInset` is applied, `endFill` retains a copy of the authored compound even-odd region.
Each directional endpoint extension is checked as a segment against that envelope. Crossing an
outer boundary or entering a hole emits one source-attributed spatial warning per fill; sufficient
physical inset keeps the endpoint inside and suppresses it. The warning recommends reserving border
overlap with `fillinset`, reducing `pullcomp`, or returning to legacy mode. Compensation is not
silently clipped, and no automatic border width is inferred. Existing `filledgerun` samples still
perform the final density-aware check against later satin border coverage.

`fillConnect` defaults to `legacy`, which preserves the historical fixed, programmable, and custom
path event streams. Opt-in `inside` uses `segmentInsideCompoundRegion`: in final hoop space it
allows boundary row endpoints, probes the open segment under even-odd parity, rejects every
non-endpoint boundary intersection (including holes and concavities), and enforces 0.1 mm clearance
away from endpoint ramps. `jump` always emits a jump at the next row entry. `trim` does the same,
plus an explicit trim when physical connector length reaches active `autoTrim`, or 7 mm if general
auto-trimming is disabled. Fill underlay deliberately retains legacy routing.

Each considered topping connector appends an internal `FillConnectorRecord` sidecar with fill ID,
policy, action, containment result, physical endpoints/distance, margin, and source line. It is not
added to public `StitchEvent` or exported formats; construction-aware preflight consumes it
directly. Only a connector emitted as `stitch` feeds `DensityGrid`, so jump/trim policies never
become topping coverage or history. Since their run boundaries are ordinary jump/trim events, the
existing planner, auto-trim, and lock passes require no special cases.

`fillEdgeRun` defaults to zero. A positive physical inset runs the Clipper-backed compound-region
offset after normal underlay has completed and before any topping rows or custom paths. The pass
subdivides closed contours with the active effective fill length, emits explicit jumps between
separate contours, and is topping (`u` is unset). A spatial corner guard caps visits within a
0.15 mm needle-hole radius at two when skipping the extra point leaves a segment contained in the
construction region; this permits one seam return while preventing collapsed or acute offset
corners from stacking penetrations. Edge-run samples remain internal until execution finishes, when
the live `DensityGrid` checks them against final border coverage. This catches redundant overlap
even when a satin border is authored after the fill. Zero bypasses offsetting, sampling, warnings,
and event changes.

`fillEdgeShort` also defaults to zero and has settled semantics as a minimum useful **open topping
row-fragment length**, measured in final physical hoop space after pull compensation. Fixed tatami
filters scan spans before routing; programmable streamlines and open custom paths filter their
physical polylines before splitting and connector classification. Omitted fragments produce one
spatial/source warning per fill. Underlay and closed custom contours bypass the policy. Because the
filter runs before connector routing, sidecar records and coverage never contain phantom travel to
an omitted fragment.

When `endFill` runs inside `declump`, every generated penetration—including underlay, edge run,
topping, and an actually sewn topping connector—is folded immediately before commit. Stateless
penetration effects are applied first, matching ordinary running-stitch effect order. Candidate
shifts must retain 0.1 mm clearance from every outer or hole boundary of the resolved compound
construction region, and the relief segment itself must remain contained. Predecessor/successor
projection guards preserve local row direction and prevent penetrations from swapping order; the
0.6 mm declump stitch floor also guards the first point after a fill jump. Unsafe or non-improving
candidates fall back to the planned point and contribute to the normal saturation note. Underlay,
edge run, and topping intentionally share the block's active limit and greedy history in their sew
order; jumps and trims reset each declump run. The policy is drawless and bypassed entirely when no
declump block is active, preserving legacy fill output.

Extended `filllen`/`stitchlen` list and reporter forms also route a plain fill through
the programmable generator so the per-row length function is honored (`2448`).

---

## 8. Coverage tracking (`DensityGrid`)

The machine feeds every committed penetration to a live `DensityGrid`
(`postprocess.ts`) in sewing order, via `_push`. The grid maintains:

- a 1 mm **cell grid** accumulating penetration counts and thread _length_ per cell
  (coverage in "layers" = length × thread width / cell area), with per-cell source-line
  attribution for hotspot warnings;
- a **micro map** (0.15 mm) counting needle stacks in the same hole;
- a **spatial index** (4 mm buckets) so the stitch-history query reporters stay
  `O(local)`.

This one grid backs both the closed-loop query reporters and the final heatmap, so a
query always reports the same number the heatmap shows. It exposes `coverAt`,
`coverAvg`, `countAt`, `nearestSewn`, `sewnWithin`, and `snapshot` — the read side of
`coverat`/`countat`/`nearestsewn`/`sewnwithin`/`stitchedpoints`. Buffered satin/fills
are **not** counted until flushed (committed-only), and locks are added afterward and
never fed, so tie-offs don't read as false crowding.

The grid stores raw path length and a resolved `threadWidthMM`, defaulting to 0.4 mm. Coverage reads
and `finalize` multiply by that same active width; `DensityResult.threadWidthMM` records it. The
`threadprofile`/`threadwidth` commands update the width without rebuilding geometry, so a later
change consistently reinterprets committed and future path length. Construction-scope and trace
restoration resynchronize the width from restored material intent. Penetration counts and micro-stack
diagnostics are width-independent.

`maxDensity` remains an absolute layer threshold. Profiles change the calculated layers, not the
threshold. The standalone `densityMap(events, cellMM, threshold, threadWidthMM)` helper accepts the
same optional width as the `DensityGrid` constructor; omitting it preserves every legacy 0.4 mm
cell value and hotspot decision.

---

## 9. Hoop field and overflow

The `hoop` directive sets `hoopInfo` (from `hoop-presets.ts`) defining the physical hoop
and the inset **sewable field**. During emission, `_push` checks each stitch against the
field (`inHoopField`) and the physical hoop (`inHoopOuter`), collecting the first 50
`fieldOverflows` classified `'field'` (outside sewable inset) or `'hoop'` (physically
unreachable). The interpreter turns these into overflow warnings with spatial
`WarningLocation` data at the end of the run.

`fieldLocked` is set when a generator (`scatter`/`voronoi`/`relax`) consumes the implicit
field domain, so a later `hoop` call errors clearly instead of silently using the wrong
field.

---

## 10. Budgets and limits (`limits.ts`)

Two tables (`machine/limits.ts`):

- **`LIMITS`** — physics/format constants: `minStitch` (0.4 mm), `maxStitch` (12 mm),
  `maxListDepth`, `maxTraceVertices`, the sewable radius, etc. These are not overridable
  (they protect the machine and fabric).
- **`STOCK_LIMITS`** — the per-run _computational_ budgets: `maxStitches`, `maxOps`,
  `maxCallDepth`, `maxLoopIters`, `maxListLen`/`maxListCells`, string budgets, and
  generator input caps, plus `maxChalks`/`maxChalkVerts` for the interpreter-owned
  preview side channel. `BudgetKey` is the union of these keys.

The `override` directive can move any budget within `OVERRIDE_FLOORS[key]` …
`OVERRIDE_CEILINGS[key]`, mutating the machine's `effectiveLimits`. Stitch-count
enforcement lives in `_push` (`607`), which tailors its "design exceeds N stitches"
message to note whether the limit was raised by override and whether a stitch-history
feedback loop may be non-terminating (`usedQuery`).

---

## 11. The trace sandbox

`trace [ … ]` / `tracerings [ … ]` capture turtle motion as path data instead of
sewing. The machine cooperates via:

- **`snapshotForTrace`** (`306`) — captures every piece of sandboxed state (turtle,
  stitch config, satin/fill buffers, stacks, color, event length…). Warnings are
  deliberately _not_ snapshotted, so one-time notes escape the sandbox.
- **`setupTraceSandbox`** (`392`) — enters recording mode with a clean coordinate frame;
  `noEmit` makes `_push` a no-op.
- **`travel`** (`730`) records the pre-split spine into `traceRuns` (capped at
  `maxTraceVertices`) rather than stitching.
- **`endTrace`** (`415`) returns the captured runs; **`restoreFromTrace`** (`422`) winds
  every sandboxed field back.

The interpreter (`eval-expr.ts`) coordinates these calls and converts a `trace` into a
list of `[x, y]` points (or a list of paths for `tracerings`).

---

## 12. Other commands

- **`push`/`pop`** (`690`/`696`) — save/restore turtle state (position, heading, pen) on
  a stack capped at 500; `pop` travels back as a jump, never sewing.
- **`markHere`** (`709`) — emit a `mark` event at the current mapped position with an
  optional label (used for preview pins; no thread).
- **`colorChange`** (`2668`) — flush satin and emit a `color` event when the color index
  changes.
- **`trimThread`** (`2679`) — flush satin and emit a `trim` event.

---

## 13. Post-run passes (`postprocess.ts`)

After execution the interpreter runs the machine's `events` through pure passes in
`postprocess.ts`:

- **`applyTravelPlan`** (`travel-planner.ts`) — partition color blocks into thread
  runs, split them into independent `planbarrier` segments, merge every tagged `atomic` span into one
  forward-only route item, and reorder private planner event
  wrappers through the generic strategy registry. The
  `reversing-nearest` strategy also considers both endpoints of eligible stitch-only
  runs. Connector jumps are rebuilt for the chosen entry direction so the later lock
  pass retains its tie-in direction; stitch geometry and explicit trims are retained. Internal
  atomic jumps/trims/marks remain in authored order. Cross-color atomics are rejected because colors
  are independently routed. When route groups exist, ungrouped wrappers pass through in authored
  order; each grouped color/segment intersection uses nearest ordering plus bounded 2-opt and reports
  per-group travel/eligibility statistics. The wrappers are lowered back to plain `StitchEvent[]`
  before this pass returns.
- **`applyLocks`** (`17`) — insert tie-in/tie-off "lock" stitches at the start/end of
  each stitch run that borders a cut (color/trim) or a jump gap ≥ 4 mm, securing the
  thread. Returns the augmented events and a lock count.
- **`applyAutoTrim`** (`113`) — insert a `trim` before any travel of `autoTrim` mm or
  more of consecutive jumps, so long connector threads don't dangle.
- **`DensityGrid.finalize`** (`357`) — collapse the live grid into the `DensityResult`
  heatmap with de-duplicated hotspots.
- **`designStats`** (`416`) — summary metrics (stitch/jump/trim counts, bounds, yarn
  length, max stitch length…).

The interpreter orders these deliberately: planning runs before autotrim, density is
analysed _before_ locks (so tie-offs don't read as hotspots), then locks are applied. The results populate the final
`RunResult` (`types.ts:76-89`), which the exporters consume.

After physical diagnostics are complete, `preflight.ts` purely adapts their internal
`WarningLocation` sidecars into `RunResult.preflight`. Stable codes currently cover density,
same-hole penetration stacks, merged tiny movements, sewable-field and physical-hoop overflow, and
satin snag risk. Realized rail-pair and programmable-satin snag sidecars retain the measured chord
endpoints; width-only satin/E-stitch advisories have source attribution but no invented coordinate.
Issues follow legacy warning-index order, so ordering and copied hoop-space coordinates are
deterministic. Exporters still consume only `events`, and preflight never rewrites them. With no
directive or `preflight 'off'`, these compatibility diagnostics are the complete structured result.

`preflight 'warn'` and `'strict'` additionally run `preflight-event-stream.ts` over the final
planned/autotrimmed stream captured immediately before locks. Its bounded, fixed-order checks cover
short-stitch runs, local reversals, moving-window
near-hole penetrations, long sewn spans, untrimmed jump chains, profile-limited continuous stitch
runs, and tight sharp-turn clusters. The default metrics are: eight consecutive segments shorter
than 1.5 × the 0.4 mm reliable movement; four reversals of at least 150° within 1 mm; eight
penetrations within 0.3 mm among the latest twenty; sewn spans above 8 mm; jump chains above 12 mm;
20,000 stitches without trim/color; and six 75°–150° turns on at-most-1 mm segments within 2 mm.
Each check yields at most three issues with at most sixteen points. These are conservative
engineering defaults and deliberately have no fabric/thread multiplier pending physical sew-out
evidence; resolved thread width already influences the separate coverage metric.

`construction-metadata.ts` is the internal identity layer for construction-aware analysis. Every
generated fill and satin receives one globally unique ID plus its resolved hoop-space compound
region or paired-rail topping envelope. Event object identities are tagged as underlay, edge run,
topping, or travel; split satin also tags its lane, and fills retain their connector sidecars. These
objects remain private machine state and are never copied into `StitchEvent` or exports. The travel
planner reorders the same event objects, so finalization can compare planned positions with authored
layer identities without guessing from stitch shape.

`preflight-construction.ts` consumes only those explicit records. In fixed order it checks underlay
containment; 0.4–1.25 mm fill/border overlap; edge-run/satin stacking; cross-lane split hotspots of
four penetrations within 0.3 mm; sewn connector containment; and underlay-before-topping order after
planning. A satin border is associated only when its center samples lie within 0.75 mm of the
authored fill boundary. Each check emits at most three structured issues with at most sixteen points.
Fill/border analysis is bounded to 4,096 construction pairs and 2,048 satin samples per construction;
split hotspots use a 0.3 mm spatial grid. The thresholds live in exported
`CONSTRUCTION_PREFLIGHT_THRESHOLDS`; no arbitrary running stitch is classified as fill, border,
underlay, or split satin. The `warn` and `strict` modes produce the same issue list. After the pure
analyzers return, strict finalization fails only when an issue is already classified as severity
`error`; warning/info recommendations never become fatal merely because strict mode was requested.
No preflight mode rewrites, reorders, inserts, or removes an event.

---

## 14. Design themes

- **Transform the path, then stitch it** — geometry is mapped to hoop space before
  splitting, keeping physical stitch length correct under any transform while leaving the
  no-transform path byte-identical.
- **Buffer-then-generate** — satin columns and fills are buffered and generated at their
  natural boundary (`flushSatin`, `endFill`), always under one snapshotted transform.
- **One grid, one truth** — the same `DensityGrid` feeds both live queries and the final
  heatmap; only committed penetrations count.
- **Loud over convenient** — over-budget designs, unreachable stitches, and out-of-range
  parameters throw or warn with actionable messages rather than silently producing bad
  stitch-outs.
- **Determinism** — the machine draws no randomness of its own; all stochastic behavior
  comes from seeded reporters/effects supplied by the interpreter, so the same seed
  yields the same design.

---

## 15. File reference

| File                        | Responsibility                                                         |
| --------------------------- | ---------------------------------------------------------------------- |
| `machine.ts`                | re-export shim → `machine/index.ts`                                    |
| `machine/index.ts`          | barrel: `LIMITS`, `STOCK_LIMITS`, `OVERRIDE_*`, `BudgetKey`, `Machine` |
| `machine/limits.ts`         | physics constants + overridable per-run budgets                        |
| `machine/machine.ts`        | public `Machine` facade and color/trim commands                        |
| `machine/machine-core.ts`   | shared state, turtle motion, stacks, emission, trace, and `travel`     |
| `machine/machine-satin.ts`  | satin columns and buffered running stitches                            |
| `machine/machine-fill.ts`   | fill recording plus built-in and programmable fill generation          |
| `machine/fill.ts`           | standalone tatami scanline fill generator                              |
| `affine.ts`                 | 2×3 affine matrix math shared by the transform stack                   |
| `satin-profile.ts`          | satin cap mode registry, ranges, and pure profile helpers              |
| `rail-pair.ts`              | shared rail orientation, checkpoints, pairing, and derived spine       |
| `postprocess.ts`            | `DensityGrid` + `applyLocks` / `applyAutoTrim` / `designStats`         |
| `preflight.ts`              | pure structured-issue adapter and resolved diagnostic profile          |
| `preflight-event-stream.ts` | bounded pure checks over completed pre-lock events                     |
| `construction-metadata.ts`  | internal fill/satin IDs, boundaries, layers, lanes, and connectors     |
| `preflight-construction.ts` | pure checks over explicit construction records and final event order   |
| `routing.ts`                | generic deterministic route algorithms and endpoint model              |
| `travel-planner.ts`         | thread-run partitioning, plan modes, and connector reconstruction      |
| `effects.ts`, `declump.ts`  | after-split effect maps and declump fold state                         |
| `hoop-presets.ts`           | hoop presets and sewable-field geometry                                |
| `embroidery-registry.ts`    | material profiles plus the compatible `FABRICS` construction view      |
| `types.ts`                  | `StitchEvent`, `HoopInfo`, `RunResult`, `DesignStats`, density types   |

Machine behavior is exercised by tests in `src/lib/__tests__/` — notably
`engine.test.ts`, `satin-shape.test.ts`, `fill-shape.test.ts`, `transforms.test.ts`,
`effects.test.ts`, `declump.test.ts`, `locks.test.ts`, `hoop.test.ts`,
`stitchlen-modes.test.ts`, and `trace.test.ts`.
