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
   └──────────┘   + warnings, density  └──────────────┘   (locks, autotrim, density)
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
- `postprocess.ts` — `DensityGrid` (the live coverage index the machine feeds), plus
  the post-run `applyLocks`, `applyAutoTrim`, and `designStats` passes.
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

---

## 4. Machine state

The public `Machine` class is a small facade over `FillMachine`, `SatinMachine`, and
`MachineCore`. Together they form one mutable machine object; its state groups into:

| Group           | Fields                                                                                                               | Notes                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Turtle          | `x`, `y`, `heading`, `penDown`                                                                                       | always in **local** space                                             |
| Stitch config   | `stitchLen`, `stitchLenList`/`Reporter`, `mode`, `beanRepeats`                                                       | one of numeric / list / reporter stitch-length forms active at a time |
| Satin           | `satinWidth`, `satinSpacing`, `satinSide`, `eWidth`, `satinReporter`, `satinPath`                                    | buffered column                                                       |
| Fill            | `fillAngle`, `fillSpacing`, `fillLen`(+list/reporter), `fillArmed`, `fillDirReporter`, `fillShapeReporter`           | tatami + programmable                                                 |
| Physics         | `lockLen`, `pullComp`, `underlayMode`, `fillUnderlayMode`, `doubleUnderlay`, `shortStitch`, `autoTrim`, `maxDensity` | fabric-tunable                                                        |
| Output          | `events`, `warnings`, `colorIdx`, `lastEmit`, `started`                                                              | accumulation                                                          |
| Transform stack | `ctm`, `outLayers`, `hasWarp`, `penLayers`, `declumpStack`                                                           | see §6                                                                |
| Hoop            | `hoopInfo`, `hoopSet`, `fieldLocked`, `fieldOverflows`                                                               | see §9                                                                |
| Budgets         | `effectiveLimits`, `activeOverrides`                                                                                 | see §10                                                               |
| Coverage        | `density` (a `DensityGrid`), `usedQuery`                                                                             | see §8                                                                |
| Trace           | `traceRecording`, `traceRuns`, `noEmit`                                                                              | see §11                                                               |

`effectiveLimits` starts as a mutable copy of `STOCK_LIMITS`
(`machine/machine-core.ts`) so `override` can raise/lower budgets per run without
touching the shared constants.

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
- **`_emitRaw(x, y)`** (`587`) — for the declump path, where layers are pre-applied.
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
  (`pushDeclump`/`popDeclump`, `290-295`).

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

Underlay passes are laid first, then the zigzag (`_zigzagAlong`, `1054`). The zigzag
applies the **short-stitch** curve fix: on tight curves the inner-edge penetrations
bunch up (breaking thread and damaging fabric), so alternate inner stitches are pulled
in to 60% width, and an over-wide-for-the-curve column raises a warning.

After-split effects (humanize/snaptogrid/declump) deliberately **skip** satin rails —
perturbing a precise rail wrecks the column — with a one-time warning.

### 7.2 Fills (`beginFill`/`endFill`, `machine/machine-fill.ts`)

`beginFill` enters recording mode; `travel` then records the boundary rings.
`endFill` closes the rings and generates stitches. Two engines exist:

- **Built-in tatami** — `generateFill` in `fill.ts` (a standalone, pure function):
  rotates the region to the fill angle, scans horizontal rows at `spacing`, computes
  span crossings with even-odd inside testing, applies pull compensation (`comp`),
  orders rows/segments greedily by nearest endpoint, subdivides to stitch length with a
  per-row phase offset (`row % 3`) to avoid tramline artifacts, and unrotates. `endFill`
  wraps it with underlay logic (`edge`/`tatami`/`both`, area-gated; `doubleUnderlay` for
  fleece) and the topping pass.
- **Programmable fill** — `_generateProgrammableFill` (`2165`), armed by
  `fill dir @d shape @s` via the `fillarm` statement. A direction reporter returns a
  per-point heading (a flow field) and a shape reporter returns `[spacing, len, phase]`.
  The generator walks streamlines through the field. It detects the constant-field /
  constant-shape case and short-circuits to the identical tatami path so simple
  programmable fills stay byte-identical to the built-in. Reporters always see **local**
  coordinates (engine-chosen hoop sample points are mapped back through
  `invert(fillCTM)`), while placement runs in physical hoop space.

Extended `filllen`/`stitchlen` list and reporter forms also route a plain fill through
the programmable generator so the per-row length function is honored (`2448`).

---

## 8. Coverage tracking (`DensityGrid`)

The machine feeds every committed penetration to a live `DensityGrid`
(`postprocess.ts:192`) in sewing order, via `_push`. The grid maintains:

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
  generator input caps. `BudgetKey` is the union of these keys.

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

- **`applyLocks`** (`17`) — insert tie-in/tie-off "lock" stitches at the start/end of
  each stitch run that borders a cut (color/trim) or a jump gap ≥ 4 mm, securing the
  thread. Returns the augmented events and a lock count.
- **`applyAutoTrim`** (`113`) — insert a `trim` before any travel of `autoTrim` mm or
  more of consecutive jumps, so long connector threads don't dangle.
- **`DensityGrid.finalize`** (`357`) — collapse the live grid into the `DensityResult`
  heatmap with de-duplicated hotspots.
- **`designStats`** (`416`) — summary metrics (stitch/jump/trim counts, bounds, yarn
  length, max stitch length…).

The interpreter orders these deliberately: density is analysed _before_ locks (so
tie-offs don't read as hotspots), then locks are applied. The results populate the final
`RunResult` (`types.ts:76-89`), which the exporters consume.

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

| File                       | Responsibility                                                         |
| -------------------------- | ---------------------------------------------------------------------- |
| `machine.ts`               | re-export shim → `machine/index.ts`                                    |
| `machine/index.ts`         | barrel: `LIMITS`, `STOCK_LIMITS`, `OVERRIDE_*`, `BudgetKey`, `Machine` |
| `machine/limits.ts`        | physics constants + overridable per-run budgets                        |
| `machine/machine.ts`       | public `Machine` facade and color/trim commands                        |
| `machine/machine-core.ts`  | shared state, turtle motion, stacks, emission, trace, and `travel`     |
| `machine/machine-satin.ts` | satin columns and buffered running stitches                            |
| `machine/machine-fill.ts`  | fill recording plus built-in and programmable fill generation          |
| `machine/fill.ts`          | standalone tatami scanline fill generator                              |
| `affine.ts`                | 2×3 affine matrix math shared by the transform stack                   |
| `postprocess.ts`           | `DensityGrid` + `applyLocks` / `applyAutoTrim` / `designStats`         |
| `effects.ts`, `declump.ts` | after-split effect maps and declump fold state                         |
| `hoop-presets.ts`          | hoop presets and sewable-field geometry                                |
| `types.ts`                 | `StitchEvent`, `HoopInfo`, `RunResult`, `DesignStats`, density types   |

Machine behavior is exercised by tests in `src/lib/__tests__/` — notably
`engine.test.ts`, `satin-shape.test.ts`, `fill-shape.test.ts`, `transforms.test.ts`,
`effects.test.ts`, `declump.test.ts`, `locks.test.ts`, `hoop.test.ts`,
`stitchlen-modes.test.ts`, and `trace.test.ts`.
