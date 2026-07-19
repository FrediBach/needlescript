# Embroidery Results: Multi-Session Implementation Plan

Status: proposed implementation roadmap  
Scope: NeedleScript language, stitch machine, standard library, diagnostics, documentation, and
playground integration  
Primary objective: improve physical sew-out quality while preserving NeedleScript's deterministic,
readable, generative programming model

## 1. Summary

NeedleScript already has a strong low-level foundation: stitch splitting in physical hoop space,
running/bean/E-stitch modes, buffered satin, rail-pair satin, tatami and programmable fills,
underlay presets, pull compensation, coverage history, transforms, effects, and deterministic travel
planning. The next improvements should target areas that ordinary geometry and reporter callbacks
cannot control cleanly:

1. material-, thread-, and direction-aware embroidery physics;
2. parameterized and composable underlay;
3. satin caps, corners, and safe handling of wide columns;
4. fill boundaries, staggering, connectors, and containment-aware crowd relief;
5. constrained sew-order planning;
6. density-neutral multicolor gradients;
7. production stitchcraft recipes for knockdown, bordered fills, and appliqué;
8. scoped stitch settings;
9. stronger preflight analysis and machine calibration.

The work is deliberately split into independently shippable sessions. Each phase must leave the
repository passing its full checks and must update the relevant architecture and language
documentation. New behavior is additive and opt-in unless it is proven to be byte-identical to the
current path.

### 1.1 Explicitly deferred: lettering

Stitch-aware lettering is not covered by this plan. It needs a separate design phase for:

- font repertoire and licensing;
- glyph construction rules and source format;
- single-line, satin-column, and filled glyph masters;
- kerning, joins, counters, minimum-size behavior, and test words;
- physical sew-out specimens at multiple sizes and fabrics.

Do not implement generic outline-to-fill text as a substitute. A future lettering plan should begin
only after suitable stitch-aware font masters have been designed.

## 2. Goals

- Produce visibly cleaner, more reliable embroidery on woven, knit, stretch, denim/canvas, fleece,
  and pile fabrics.
- Make common production-quality choices concise without hiding the generated stitch semantics.
- Preserve the ability to replace every high-level recipe with explicit NeedleScript.
- Keep all physical distances in millimetres and evaluate them in hoop space where appropriate.
- Preserve deterministic output for a fixed source, seed, hoop, and explicit run configuration.
- Keep `src/lib/` platform-neutral and tree-shakeable.
- Make every new warning spatial and source-attributed when the machine has enough information.
- Add features in small vertical slices that can be reviewed and shipped independently.
- Keep existing programs and default output byte-identical wherever the phase does not explicitly
  introduce a new opt-in command.

## 3. Non-goals

- Automatic full-design digitizing from arbitrary images or vectors.
- Hidden stitch optimization that silently changes authored overlap or sew order.
- A proprietary embroidery-object document model.
- Individual penetration editing in the core language.
- Automatic satin skeletonization or branch inference.
- Machine-vendor-specific commands in the core event stream before a portable semantics exists.
- Claiming physically exact fabric simulation. The material model is a practical compensation and
  diagnostic model, not finite-element analysis.
- Lettering, font loading, glyph outlining, or font design in this roadmap.

## 4. Product and engineering principles

### 4.1 Existing output is the compatibility baseline

For every feature, add characterization fixtures before changing an existing generator. With none
of the new commands active:

- existing `.ns` programs must produce the same stitch/jump/color/trim sequence;
- existing RNG draw counts must stay unchanged;
- current warnings should not change unless a test explicitly adopts a corrected diagnostic;
- DST/PES/EXP exports must remain unchanged;
- existing `fabric` presets retain their current numerical behavior.

When exact compatibility cannot reasonably be preserved, require an explicit new mode rather than
changing the legacy mode in place.

### 4.2 Prefer transparent controls over opaque automation

Automatic behavior must have a named policy, conservative limits, preview-visible output, and a way
to turn it off. Warnings should recommend explicit commands. Preflight may diagnose and suggest but
must not rewrite stitches behind the user's back.

### 4.3 Transform geometry, then apply physical stitch rules

Continue the machine invariant that geometry is mapped to hoop space before physical distances are
measured. Material compensation that changes geometry must declare whether it belongs:

- in local design space;
- in hoop space before splitting;
- at the penetration level after splitting; or
- only in diagnostics.

The default rule in this plan is:

- authored shape transforms happen first;
- construction geometry is generated next;
- directional pull/push compensation is applied in hoop space;
- stitch subdivision and machine ceilings operate on the compensated result;
- coverage and preflight observe the final penetrations.

### 4.4 Preserve determinism locally

New randomized-looking policies such as fill staggering should prefer coordinate/index hashing or a
forked deterministic stream. Editing one region should not reshuffle unrelated later regions. Every
new stochastic operation must document its main-stream RNG draw count.

### 4.5 Separate portable design intent from local machine correction

Fabric, thread width, needle size, stabilizer, and topping are portable design intent and may appear
in source. Calibration measured on a particular machine belongs in `RunOptions` and playground user
settings by default. This prevents a shared design from silently baking in one machine's scale or
skew correction.

### 4.6 Standard library before core when possible

If a feature can be expressed safely using existing primitives, implement it first in
`std.stitchcraft`. Promote behavior into the stitch machine only when it needs private generator
state, containment information, planner metadata, physical compensation, or substantially better
performance.

## 5. Current architecture and likely touch points

| Area                    | Existing owner                                            | Expected additions                                 |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Command registry        | `src/lib/commands.ts`                                     | new commands, modes, profile registries            |
| Parsing                 | `src/lib/parser/statements.ts`, `src/lib/parser/index.ts` | block commands and mode/value validation           |
| Runtime dispatch        | `src/lib/interpreter/exec-cmd.ts`, `exec-stmt.ts`         | state updates, scoped unwinding, directives        |
| Runtime context         | `src/lib/interpreter/context.ts`, `index.ts`              | planner constraints and run configuration          |
| Core machine state      | `src/lib/machine/machine-core.ts`                         | style snapshots, material state, event tags        |
| Satin generation        | `src/lib/machine/machine-satin.ts`, `rail-pair.ts`        | cap/join strategies, splitting, underlay profile   |
| Fill generation         | `src/lib/machine/machine-fill.ts`, `machine/fill.ts`      | inset, staggering, connectors, edge policies       |
| Post-processing         | `src/lib/postprocess.ts`, `travel-planner.ts`             | thread-aware coverage, preflight, constraints      |
| Shared types            | `src/lib/types.ts`                                        | profiles, diagnostics, optional internal metadata  |
| Standard library        | `src/lib/standard-library/stitchcraft.ns.ts`              | gradient and production recipes                    |
| Public API              | `src/lib/engine.ts`                                       | registries, run options, diagnostic types          |
| Editor language service | `src/lib/needlescript-monaco/`                            | completions, hovers, signatures, highlighting      |
| Documentation           | root language/architecture/reference files                | semantics, examples, data flow, rationale          |
| SVG staging             | `src/lib/svg/`                                            | expose only stable recipe settings after core work |

Avoid growing `exec-cmd.ts` and `machine-core.ts` into unstructured registries. Early in the roadmap,
introduce focused configuration types in a new module such as `src/lib/embroidery-profile.ts` if
material and underlay state would otherwise be duplicated across command, machine, preflight, and
UI code.

## 6. Proposed language surface

The names below are the working API for planning and tests. Each implementation session should
validate spelling and composition against the parser before treating it as final.

### 6.1 Scoped settings

```needlescript
stitchscope [
  density 0.45
  underlay 'edge'
  satin 4
  sewpath(border)
]
```

`stitchscope` snapshots and restores stitch construction configuration. It does not restore turtle
position, heading, pen state, color, RNG, transforms, coverage, output, palette, hoop, seed,
overrides, or plan mode.

### 6.2 Underlay profiles

```needlescript
underlaypasses ['center', 'edge']
underlaylen 2.8
underlayinset 0.6
underlayspacing 1.8

fillunderlaypasses ['edge', 'tatami']
fillunderlaylen 3
fillunderlayinset 0.8
fillunderlayspacing 2.2
fillunderlayangle 90
```

Existing `underlay 'mode'` and `fillunderlay 'mode'` remain supported and reset the relevant custom
profile to the legacy preset values. The new `*passes` commands opt into ordered, composable passes.

### 6.3 Fill construction policies

```needlescript
fillinset 0.3
fillstagger 'progressive'   // legacy, brick, progressive, random
fillstaggeramount 0.65
fillconnect 'inside'       // legacy, inside, jump, trim
filledgerun 1
filledgeshort 0.7
```

The exact accepted ranges must be centralized and documented. `legacy` must select the existing
byte-identical generator path.

### 6.4 Satin construction policies

```needlescript
satincap 'taper'       // legacy, butt, taper, point, round
satincaplen 2
satinjoin 'fan'        // legacy, continuous, fan, miter, split
satincorner 35
satinwide 'split'      // warn, split
satinmaxwidth 7.5
satinsplitoverlap 0.5
```

### 6.5 Planner constraints

```needlescript
plan 'reversing-nearest'

routegroup [
  // planner may reorder complete runs in this block
]

atomic [
  // output remains contiguous and internally ordered
]

planbarrier
```

`atomic` is useful without `plan`: it is inert in stitch generation but records intent for later
planning and diagnostics. `planbarrier` prevents reordering across its event boundary.

### 6.6 Portable material intent

```needlescript
fabric 'knit'
fabricgrain 90
fabricstretch 0.15 0.5
threadprofile 'poly-40'
threadwidth 0.4
needle 75
stabilizer 'cutaway-medium'
topping 1
```

The explicit scalar commands override profile defaults. `threadwidth` is the physical width used by
coverage; it does not change palette color. Needle, stabilizer, and topping initially affect
recommendations and warnings, then may feed conservative automatic profiles after sew-out
validation.

### 6.7 Preflight

```needlescript
preflight 'warn'    // off, warn, strict
```

`warn` appends diagnostics without changing events. `strict` should initially fail only on existing
hard physical/format violations, not subjective recommendations. Expanding strict failures requires
a separately reviewed policy change.

### 6.8 Standard-library recipes

Working exports:

```needlescript
import std.stitchcraft.gradientrows as gradientrows
import std.stitchcraft.knockdown as knockdown
import std.stitchcraft.fillandborder as fillandborder
import std.stitchcraft.appliquewith as appliquewith
```

The final APIs should favor explicit arguments and pure returned geometry when the caller needs
color control. Existing `appliquesteps`, `gradientbands`, and `threadblend` remain unchanged.

## 7. Cross-cutting data model

### 7.1 Construction configuration

Create one typed configuration object owned by the machine rather than adding unrelated loose
fields indefinitely. A possible structure is:

```ts
interface StitchConstructionConfig {
  running: RunningConfig;
  satin: SatinConfig;
  fill: FillConfig;
  underlay: SatinUnderlayProfile;
  fillUnderlay: FillUnderlayProfile;
  physics: PhysicsConfig;
  material: MaterialIntent;
}
```

Migration may be incremental. Do not mechanically relocate all current fields in one large change.
First add snapshot/restore helpers around the existing state; introduce nested types as the related
feature phase needs them.

### 7.2 Planner metadata

Planner constraints need sidecar information that exporters never interpret. Prefer optional
internal tags on events during execution:

```ts
interface PlanTags {
  segment: number;
  group?: number;
  atomic?: number;
}
```

Possible storage choices:

1. optional fields on `StitchEvent`, stripped before returning/exporting;
2. a parallel event-index sidecar on `RunContext`;
3. internal-only event wrappers lowered to public `StitchEvent[]` at finalization.

Use an implementation spike to choose. The preferred outcome is an internal wrapper because it
prevents planning concerns from leaking into the publishable event contract, but optional fields
may be the lowest-risk first implementation. Do not encode constraints as user-visible `mark`
events or labels.

### 7.3 Construction metadata for diagnostics

Preflight becomes more useful if generated penetrations know their construction kind. Add minimal
internal metadata at `_push` time:

- construction: running, satin topping, satin underlay, fill topping, fill underlay, E-stitch, lock;
- construction instance ID;
- source line;
- optional region/column identifier.

Keep this sidecar internal unless a concrete public consumer needs it. Exported stitch formats must
remain based only on public event semantics.

### 7.4 Material intent and resolved physics

Represent source intent separately from derived settings:

```ts
interface MaterialIntent {
  fabricPreset: string;
  grainHeading: number;
  stretchAlong: number;
  stretchAcross: number;
  threadProfile: string;
  threadWidthMM: number;
  needleSize?: number;
  stabilizer?: string;
  topping: boolean;
}

interface ResolvedPhysics {
  pullAlongMM: number;
  pullAcrossMM: number;
  pushAlongMM: number;
  pushAcrossMM: number;
  maxCoverage: number;
  satinDensityFloor: number;
  recommendedUnderlay: SatinUnderlayProfile;
  recommendedFillUnderlay: FillUnderlayProfile;
}
```

The initial material phase may resolve to current scalar behavior. Directional compensation is a
later subphase gated by fixtures and sew-out evidence.

## 8. Phase 0: baseline and feature scaffolding

### Session 0.1 — Characterization fixtures

Purpose: lock down current output before changing generators.

Tasks:

- Add compact fixtures for running stitches, straight/curved/open/closed satin, rail-pair satin,
  simple/concave/holed fills, programmable fill, custom path fill, every underlay mode, and travel
  planning.
- Record event arrays or stable snapshots, warning arrays, density summaries, and RNG draw behavior.
- Add explicit tests that current `fabric` presets produce their documented settings.
- Add exporter checks for representative fixtures.
- Add a test helper that compares positional events with a useful first-difference message.

Primary files:

- `src/lib/__tests__/pro.test.ts`
- `src/lib/__tests__/satin-shape.test.ts`
- `src/lib/__tests__/satinbetween.test.ts`
- `src/lib/__tests__/fill-shape.test.ts`
- `src/lib/__tests__/fill-paths.test.ts`
- `src/lib/__tests__/travel-planning.test.ts`
- new `src/lib/__tests__/embroidery-baseline.test.ts` if grouping is clearer

Acceptance criteria:

- Tests pin all existing default construction paths.
- No production behavior changes.
- Full test, format, lint, app build, and library validation pass.

### Session 0.2 — Shared registries and documentation hooks

Purpose: avoid duplicating mode lists and bounds across parser, runtime, Monaco, and docs.

Tasks:

- Decide whether new construction modes live beside `QWORD_BUILTINS` or in focused registries.
- Add typed helpers for case-insensitive mode validation and did-you-mean messages.
- Add catalog test helpers that ensure every new core command has completion, hover, and signature
  coverage.
- Establish a documentation checklist in tests or contributor notes.

Acceptance criteria:

- One source of truth exists for every new mode registry introduced later.
- The session does not add user-visible commands unless they are fully documented.

## 9. Phase 1: standard-library quick wins

This phase deliberately uses existing language features. It should produce useful results early
without changing machine semantics.

### Session 1.1 — Density-neutral two-color gradient rows

Purpose: turn the technique in `examples/advanced/gradientfill.ns` into a reusable primitive.

Design requirements:

- Candidate rows have one constant aggregate pitch.
- Each candidate is assigned to exactly one color group.
- Assignment uses deterministic error diffusion rather than independent random decisions.
- The gradient curve is supplied as a reporter or an explicitly documented built-in ramp.
- Geometry is returned by color group so callers control color order, trims, and palette.
- Concave regions and holes are clipped using existing fill-row/clip machinery.
- Empty groups are valid.
- The helper consumes zero RNG draws.

Proposed initial signature:

```needlescript
gradientrows(region, angle, pitch, @amount)
```

Return value: `[rowsA, rowsB]`, where `amount(v)` returns color B's proportion from 0 to 1 and `v`
is normalized across the row-seeding axis.

Tasks:

- Implement in `src/lib/standard-library/stitchcraft.ns.ts`.
- Decide how compound regions are represented; use a separate export if the current standard-library
  region convention only accepts a simple ring.
- Add standard-library reference documentation and a concise example.
- Replace or supplement the advanced example with a version that demonstrates the helper while
  retaining a manual example if it teaches the algorithm.
- Pin aggregate row count, per-color distribution, deterministic assignment, and no doubled density.

Acceptance criteria:

- A 50/50 blend interleaves colors without coincident candidate rows.
- Endpoints approach 100/0 and 0/100 without changing combined line count.
- Same source and seed produce identical geometry; seed changes do not affect this drawless helper.
- Existing `gradientbands` and `threadblend` behavior is unchanged.

### Session 1.2 — N-color gradients and routing

Purpose: generalize only after the two-color contract is stable.

Design requirements:

- A reporter returns a non-negative weight list whose length is fixed for one call.
- Weights are normalized; all-zero weights are a clear runtime error.
- Multichannel error is diffused deterministically while assigning each candidate exactly once.
- Each color group's rows can be routed serpentine and optionally reversed by the caller.

Proposed export:

```needlescript
gradientrowsn(region, angle, pitch, @weights)
```

Do not overload `gradientrows` until error messages and arity remain clear.

Acceptance criteria:

- Aggregate density is invariant across 2–8 colors.
- Quantization error remains bounded over the row sequence.
- Malformed weights name the reporter and row.

### Session 1.3 — Knockdown and fill-with-border recipes

Purpose: cover common production constructions using readable library code.

Tasks:

- Add `knockdown(region, angle, spacing)` as a sparse, low-density foundation suitable for fleece
  and terry.
- Add a pure helper that calculates fill inset and border centerline geometry.
- Add `fillandborder` or separate explicit procedures for fill and border stages.
- Ensure border overlap is an argument and the default avoids a visible fabric gap without creating
  excessive coverage.
- Extend appliqué with an additive `appliquewith` export supporting placement, tackdown inset,
  cover width, and explicit stops.
- Preserve existing `appliquesteps` byte-for-byte.

Acceptance criteria:

- Recipes are ordinary imported NeedleScript and introduce no core commands.
- Fleece examples use knockdown without crossing the configured coverage threshold.
- Bordered fills overlap predictably on convex, concave, and holed regions.
- Every stage remains visible in the emitted event sequence.

## 10. Phase 2: scoped stitch configuration

### Session 2.1 — State inventory and machine snapshot

Purpose: define exactly what a stitch configuration scope owns.

Snapshot these categories:

- running stitch length numeric/list/reporter state and phase;
- bean and E-stitch modes;
- satin width/reporter, density, side policy if appropriate, and new satin policies;
- fill angle, spacing, length forms, and new fill policies;
- lock, pull compensation, underlay, short-stitch, auto-trim, and max-density settings;
- material intent commands that behave like construction settings.

Do not snapshot:

- turtle position, heading, pen state, or push/pop stack;
- events, started state, last emitted point, warnings, density history, or budgets;
- current color or palette;
- seed/RNG/noise state;
- transforms, warps, penetration effects, or declump state;
- hoop, override, plan, or preflight directives.

Tasks:

- Add `snapshotConstructionConfig()` and `restoreConstructionConfig()` methods.
- Flush buffered running/satin construction before snapshot boundaries when required.
- Reject scope entry during an active fill recording.
- Define whether unused armed `fill` configuration may cross a scope boundary; recommended behavior is
  snapshot/restore it with a note only if replacing an unused outer arm.
- Unit-test reporter and list snapshot identity/copy semantics.

Acceptance criteria:

- Snapshot/restore alone does not emit events except necessary buffer flushes.
- Mutable lists used by stitch/fill length modes cannot mutate a saved snapshot accidentally.
- Existing machine state tests remain unchanged.

### Session 2.2 — `stitchscope` parser and runtime

Tasks:

- Add a dedicated block AST node or a generalized machine-state block category.
- Execute the body under `try/finally` semantics so `return`, `break`, `continue`, and runtime errors
  restore configuration.
- Define trace behavior: settings inside trace remain inert as today, but scope restoration still
  occurs.
- Add syntax highlighting, completion, hover, and folding support.
- Document interaction with procedures, transforms, effects, satin flushing, and fill arms.

Acceptance criteria:

- Nested scopes restore in LIFO order.
- Early return and thrown runtime errors restore the outer state.
- Color changes remain changed after the scope.
- Turtle state remains where the body leaves it.
- A program rewritten from manual reset commands to `stitchscope` produces identical stitches.

## 11. Phase 3: parameterized underlay

### Session 3.1 — Typed profiles and legacy lowering

Status: complete (2026-07-19)

Purpose: make current underlay modes explicit data without changing output.

Tasks:

- Define ordered satin and fill underlay pass types.
- Express every current mode and every `fabric` preset as a resolved profile.
- Lower legacy `underlay 'auto'|'center'|'edge'|'zigzag'|'off'` and fill equivalents to profiles.
- Keep a fast legacy branch or exact constants so default event bytes remain identical.
- Centralize validation ranges.

Satin profile fields should cover:

- ordered pass kinds;
- running stitch length;
- edge inset as absolute millimetres or column-width ratio;
- zigzag width ratio;
- zigzag spacing;
- return-run policy;
- doubled-pass behavior.

Fill profile fields should cover:

- ordered edge/tatami passes;
- inset;
- stitch length;
- row spacing;
- angle relative to topping or absolute heading;
- minimum region area;
- behavior under direction fields.

Acceptance criteria:

- Resolving every legacy mode reproduces current events exactly.
- Profile validation is pure and testable without running a program.

Implementation note: `src/lib/underlay-profile.ts` owns the ordered satin/fill pass types,
shared validation ranges, pure validators, and legacy/fabric lowering. Generator variants are
explicit inputs because the historical doubled-center and directional-fill paths are not identical.
Satin and fill emission consume the lowered pass order while retaining the legacy constants and
arithmetic; the characterization and exporter baselines remain unchanged.

### Session 3.2 — User commands for satin underlay

Status: complete (2026-07-19)

Tasks:

- Implement `underlaypasses`, `underlaylen`, `underlayinset`, and `underlayspacing`.
- Decide how ratio-based settings are exposed; do not overload one command with ambiguous absolute
  and relative units.
- Apply the same profile to buffered spine satin and `satinbetween` where geometrically meaningful.
- Preserve the `u: 1` event flag for all underlay penetrations.
- Warn when a requested edge inset collapses or crosses a narrow column.

Acceptance criteria:

- Ordered multi-pass underlay is visibly ordered before topping.
- Profile works under affine transforms and rail-pair satin in physical hoop millimetres.
- Invalid combinations fail before partial column emission.

Implementation note: `underlaypasses` installs an explicit ordered list of up to 16
`center`/`edge`/`zigzag` passes; duplicates are meaningful and an empty list disables underlay.
`underlaylen`, `underlayinset`, and `underlayspacing` are independent sticky overrides. Insets are
absolute physical millimetres only; the legacy ratio remains internal rather than sharing ambiguous
syntax. Explicit pass order supersedes preset doubling, applies to buffered/programmable satin and
`satinbetween`, and is included in construction snapshots. Narrow edge passes clamp at the center
with a warning. Invalid lists and values fail before a buffered column is flushed.

### Session 3.3 — User commands for fill underlay

Status: complete (2026-07-19)

Tasks:

- Implement `fillunderlaypasses`, `fillunderlaylen`, `fillunderlayinset`,
  `fillunderlayspacing`, and `fillunderlayangle`.
- Apply to plain tatami, programmable direction/shape fills, and custom path fills.
- Define custom path fill behavior explicitly: region underlay is generated from the recorded region,
  not from returned decorative paths.
- Ensure holes and disconnected components remain respected.

Acceptance criteria:

- Cross-grain underlay follows `fillangle + relativeAngle` for plain fills.
- Directional fills rotate the local field consistently.
- Edge underlay never crosses holes or escapes a concave boundary.

Implementation note: `fillunderlaypasses` installs an exact ordered list of up to 16 `edge` and
`tatami` passes; duplicates repeat and an empty list disables underlay. The four numeric commands
are independent sticky overrides for physical stitch length, inset, row spacing, and angle relative
to the topping direction. Without an explicit list they tune the selected legacy mode; with one,
legacy `auto` area gates and fabric doubling are superseded. Plain, directional/shape, and custom
path fills resolve the same profile, with custom paths deriving underlay from the recorded compound
region. Custom edge passes use a Clipper-backed even-odd inset and jump between separate contours;
direction fields rotate locally before affine mapping. `fillunderlay` and `fabric` clear the custom
profile, and construction snapshots copy and restore it.

### Session 3.4 — Optional programmable underlay spike

Status: complete (2026-07-19, design spike only)

Investigate, but do not commit automatically, a future form such as:

```needlescript
underlay paths @generator
fillunderlay paths @generator
```

Answer:

- reporter signatures and coordinate frames;
- whether generators receive spine/rails/region plus resolved width;
- clipping and validation ownership;
- whether machine commands inside reporters are sandboxed;
- how to retain `u: 1` metadata.

End the session with either a small implementation specification or a documented rejection. This
spike is not a dependency for later phases.

#### Spike decision: defer the public commands

Do not add `underlay paths` or `fillunderlay paths` in Phase 3. The fill form is technically
straightforward, but the satin form does not yet have a single safe geometry contract shared by
buffered fixed-width satin, `satin @fn`, and `satinbetween`. Shipping only the fill half would imply
parity that the language cannot currently honor. This is a scoped deferral, not a rejection of
programmable underlay as a concept, and it does not block Phase 4.

The missing prerequisite is an internal realized-column abstraction containing a physical spine,
paired physical rails, a closed clip envelope, representative/max width, and open/closed seam
metadata after transforms, warp, reporter shaping, and pull compensation. Today each satin
generator owns a different subset of that data. Without the abstraction, the engine would either
expose inconsistent inputs or accept paths that can escape/cross a column without a reliable clip.

#### Candidate contract after the prerequisite exists

- `underlay paths @generator` would be sticky like other satin-underlay settings. The reporter
  signature would be `generator(spine, rails, width) -> paths`: `spine` is one path, `rails` is
  `[leftRail, rightRail]`, and `width` is the maximum realized full width in physical millimetres.
  Inputs and returned paths would all be final hoop-space coordinates because the geometry has
  already passed through affine transforms, nonlinear warp, shaping, and pull compensation.
- `fillunderlay paths @generator` would be sticky like `fillunderlay`. Its reporter signature would
  be `generator(region) -> paths`, using the same fill-local compound even-odd region and returned
  local-path frame as existing `fill paths`. The machine would map only after validation and
  clipping, preserving the established fill reporter model under transforms.
- Both forms would replace the ordered built-in pass list rather than become another pass kind.
  `underlaylen`/`fillunderlaylen` would remain the physical subdivision length. Inset, spacing, and
  angle settings have no generic meaning for arbitrary returned paths and would be ignored with a
  one-time note while the path generator is active. `underlay 'mode'`, `fillunderlay 'mode'`, their
  `*passes` commands, and `fabric` would disengage the relevant generator. `stitchscope` would retain
  reporter identity in its construction snapshot.

#### Validation, clipping, sandbox, and metadata ownership

- The interpreter would own engage-site arity checking, reporter invocation, finite nested
  path-list validation, value/allocation budgets, and source-attributed contract errors.
- The machine would own geometry-input/clip budgets, clipping, physical subdivision, connector
  classification, stitch ceilings, density/history accounting, and final event order. Returned
  paths would never be trusted as already safe. Fill paths would clip to the recorded even-odd
  region. Satin paths would clip to the future realized column envelope. Separate paths and clipped
  fragments would connect by jumps unless a later containment-aware connector policy proves the
  whole segment safe.
- Reporter execution would reuse the current custom-fill-generator sandbox: snapshot and restore
  all machine state, set `noEmit`, discard machine commands with one note, ignore `seed`, allow
  deliberate draws from the existing RNG stream, and restore even when validation or user code
  throws. This avoids a second, subtly different reporter-side-effect model.
- Reporters would return coordinates only—never event objects or metadata. The machine would emit
  every resulting penetration through the underlay path with `u: 1`, including any generated
  subdivision, while keeping connector jumps classified as underlay travel. User code could not
  clear or forge the flag.

Revisit the commands only after the realized satin-column geometry is shared by all three satin
engines and characterized with affine/warp, crossing-rail, open/closed, clipping, sandbox, RNG, and
`u: 1` tests. No parser, runtime, registry, Monaco, or public-API changes are made by this spike.

## 12. Phase 4: fill boundary and connector quality

### Session 4.1 — Fill inset

Status: complete (2026-07-19)

Purpose: reserve controlled overlap for later borders and reduce edge collisions.

Tasks:

- Implement `fillinset mm`, default 0.
- Apply inset to compound even-odd regions with correct hole behavior: outer rings shrink while hole
  boundaries expand into the filled material.
- Reuse Clipper-backed geometry and honor clip vertex budgets.
- Handle split, collapsed, and empty inset results with spatial/source warnings.
- Decide whether fill underlay uses the original or inset region. Recommended default: edge underlay
  follows the inset construction region; a later profile option may choose original boundary.

Acceptance criteria:

- `fillinset 0` is byte-identical.
- Positive inset consistently creates space for a satin border.
- Concave regions may split without generating connectors across fabric gaps.
- Holes grow rather than shrink the exclusion area.

Implementation note: `fillinset` is a sticky 0–10 mm construction setting included in
`stitchscope`. Positive values offset the complete recorded even-odd region through the shared
Clipper geometry in physical hoop space; zero bypasses the operation for byte-identical legacy
output. The inset region drives both underlay and topping, including programmable and custom-path
fills. Outer boundaries shrink, holes expand, and containment-aware routing forces jumps between
split components. Split, partial-collapse, and empty results carry the `endfill` source line and a
hoop-space warning location. The command is deterministic and honors the active `clipverts` budget.

### Session 4.2 — Stagger policies

Status: complete (2026-07-19)

Purpose: prevent repeated row-aligned penetration patterns and visible tramlines.

Policies:

- `legacy`: existing cumulative/row phase behavior;
- `brick`: fixed alternating offset;
- `progressive`: a short deterministic cycle that avoids vertical alignment;
- `random`: stable hashed phase per row, not a main-stream RNG draw.

Tasks:

- Implement `fillstagger` and `fillstaggeramount`.
- Define interaction with `fill shape @fn` phase. Recommended rule: reporter phase supplies the base;
  policy offset is added and wrapped.
- Define interaction with `filllen [list]` and reporter modes.
- Attribute warnings when short edge fragments result from a phase choice.

Acceptance criteria:

- `legacy` reproduces current events.
- Hashed random phase is stable when unrelated earlier fills are edited.
- No policy creates sub-minimum stitches without a merge/warning.

Implementation note: `fillstagger` selects the centralized `legacy`/`brick`/`progressive`/`random`
registry and `fillstaggeramount` supplies a sticky 0–1 phase fraction (default 0.65); both are
included in `stitchscope`. Legacy preserves the fixed generator's three-row cycle and the
programmable generator's cumulative reporter phase exactly. Non-legacy policies add a wrapped
offset to that reporter base. Fixed lengths multiply the fraction directly; list/reporter forms use
the first effective row length before continuing their authored sequence. Progressive repeats
`0, amount, 3×amount, 2×amount`; random hashes row geometry quantized to micrometres and consumes no
main-stream draws. Open custom fill paths participate, closed seams and fill underlay do not.
Policy-created sub-0.4 mm edge fragments merge into a neighbour and produce one spatial,
source-attributed warning.

### Session 4.3 — Connector policies

Status: complete (2026-07-19)

Purpose: make between-row travel explicit and safe.

Policies:

- `legacy`: current routing and short safe connectors;
- `inside`: sew only when the entire connector lies inside the fill region with an edge margin;
- `jump`: always jump between rows/fragments;
- `trim`: trim before connectors exceeding an explicit or existing auto-trim threshold.

Tasks:

- Implement robust segment-in-compound-region tests, including holes and concavity.
- Apply physical hoop-space distances after transforms.
- Record connector classification for preflight.
- Preserve custom path order; policy controls only the connector between returned paths.
- Do not let a connector become topping coverage in history unless it is actually sewn.

Acceptance criteria:

- `inside` never sews across a hole or outside a concave boundary.
- `jump` does not alter row penetrations.
- Planner and auto-trim still see accurate run boundaries.

Implementation note: `fillconnect` is a sticky, `stitchscope`-aware topping policy backed by the
central `legacy`/`inside`/`jump`/`trim` registry. `legacy` retains byte-identical fixed,
programmable, and custom-path routing. `inside` classifies the complete straight connector in final
hoop space against compound even-odd geometry, rejecting holes, concave exits, boundary touches,
and segments without 0.1 mm edge clearance outside their endpoint ramps. `jump` always emits a
non-sewing connector; `trim` also emits a cut when the physical distance reaches active `autotrim`,
or the existing 7 mm default while general auto-trimming is disabled. Custom paths keep their
returned/clipped order. An internal per-fill sidecar records policy, action, containment, endpoints,
distance, margin, and line for future preflight without changing the public event schema. Underlay
keeps legacy routing, and only actually sewn connectors feed density/history.

### Session 4.4 — Edge run and edge-shortening policies

Status: complete (2026-07-19)

Tasks:

- Implement `filledgerun` as an opt-in inset boundary pass after underlay and before or after topping;
  choose and document one default order.
- Implement `filledgeshort` as a minimum useful row-fragment length or an edge stitch-shortening
  control; settle the semantics before naming the command permanently.
- Detect excessive repeated penetrations near acute corners.
- Add coverage-aware warnings for edge-run plus satin-border combinations.

Acceptance criteria:

- Edge runs remain inside the construction region.
- Acute corners do not accumulate unbounded coincident penetrations.
- The option is disabled by default.

Implementation note: `filledgerun mm` is a sticky, `stitchscope`-aware 0–10 mm inset boundary
pass, disabled at zero. Its fixed order is fill underlay, edge run, then topping. It offsets the
resolved compound construction region in physical hoop space, uses the effective fill stitch
length, and jumps between disconnected contours. A containment-checked corner guard retains at
most two visits within a 0.15 mm needle-hole radius, allowing the closed seam without unbounded
acute-corner stacking. Final live coverage is sampled at edge-run points so dense overlap with a
later satin border raises a spatial warning. `filledgeshort mm` is permanently defined as the
minimum useful open topping row-fragment length in final physical hoop space; fixed rows,
programmable streamlines, and open custom fill paths are filtered before subdivision and connector
routing, while underlay and closed contours are unchanged. Both controls default to zero, consume
no RNG draws, and preserve the legacy event stream when disabled.

### Session 4.5 — Containment-aware fill declump

Status: complete (2026-07-19)

Purpose: remove the current limitation where `declump` skips fill blocks.

Tasks:

- Run declump over generated fill penetrations before commit.
- Constrain every shifted point to remain inside the compound fill region with a safety margin.
- Preserve row direction and monotonic progress; prevent points swapping order.
- Fall back to the unshifted point if no safe relief exists.
- Ensure underlay and topping can use separate limits or retain current effect ordering.

Acceptance criteria:

- No shifted point crosses an outer boundary or hole.
- Coverage is reduced in convergence fixtures without new tiny stitches.
- Existing `declump` behavior outside fills is unchanged.

Implementation note: generated fill penetrations now pass through the active `declump` stack at
commit time, after stateless penetration effects and before density history is fed. The same active
limit and greedy state are retained in normal sew order across fill underlay, edge run, topping, and
sewn topping connectors; fill jumps and trims reset the run state. Every proposed 0.25 mm relief
candidate must remain in the resolved compound construction region with 0.1 mm boundary/hole
clearance, and the complete segment from the planned point to the candidate must remain contained.
Local predecessor/successor projections prevent point order reversal, while the existing 0.6 mm
stitch floor also applies to the first penetration after a fill jump. If no contained,
order-preserving candidate improves coverage, the authored point is emitted unchanged and counts
toward the existing saturation note. The path remains drawless; fills outside `declump` and all
existing non-fill declump paths retain their prior event streams.

## 13. Phase 5: satin caps, joins, and wide columns

### Session 5.1 — Column analysis model

Status: complete (2026-07-19)

Purpose: identify tips, sharp corners, continuous curvature, and unsafe widths before emission.

Tasks:

- Build a pure analyzed-column representation from a spine or rail pair.
- Calculate hoop-space arc length, tangent, curvature estimate, realized width, corner angle, and
  local width-to-radius ratio.
- Segment the column at declared or detected sharp corners without emitting stitches.
- Share analysis between buffered satin and rail-pair satin where possible.
- Preserve the legacy generator path when all new policies are `legacy`/`warn`.

Acceptance criteria:

- Analysis is deterministic and drawless.
- Straight, smooth curve, cusp, U-turn, taper, and closed-column fixtures classify predictably.
- Existing warnings can be reproduced from the new analysis without changing their defaults.

Implementation note: `column-analysis.ts` now builds one pure, hoop-space `AnalyzedColumn` model
from either a realized spine or an oriented rail correspondence. Each sample records cumulative arc
length, incoming/outgoing and bisector tangents, signed turn and corner angles, signed curvature,
radius, realized width, width slope/taper direction, width-to-limiting-radius ratio, endpoint/tip,
continuous-curve, cusp, U-turn, sharp-corner, and unsafe-width classifications. Rail-pair samples
also retain per-rail curvature, and compatibility radius estimates reproduce the historical
buffered-satin and `satinbetween` width-warning predicates. Declared sample indices and the default
60-degree detected-turn threshold split open or closed columns into geometry-only segments that
share the boundary corner and emit no events. The buffered plain/transformed and rail-pair warning
paths consume the shared analyzer, while underlay and topping still run through the unchanged
legacy generators. Analysis copies its inputs, consumes no RNG draws, and is exported as a
platform-neutral library utility for the cap, corner, and wide-column sessions.

### Session 5.2 — Cap strategies

Status: complete (2026-07-19)

Implement opt-in cap policies:

- `butt`: finish at full width with no taper;
- `taper`: reduce width over `satincaplen` while maintaining safe advances;
- `point`: converge rails with controlled tip merging;
- `round`: fan through a semicircular end where width permits.

Tasks:

- Define open-column start and end behavior independently internally, even if the first public
  command sets both.
- Reuse tip merging and tiny-stitch checks.
- Ensure underlay stops short enough not to protrude from a taper.
- Keep locks outside decorative cap generation.

Acceptance criteria:

- Caps work for spine and rail-pair satin.
- No cap emits repeated zero-length stitches.
- Underlay remains hidden beneath topping.

Implementation note: `satincap 'legacy'|'butt'|'taper'|'point'|'round'` is a sticky,
`stitchscope`-aware policy for open buffered-spine, programmable-spine, and rail-pair satin;
`satincaplen` is a physical 0.4–20 mm transition length with a 2 mm default. The public selector
sets both ends, while `Machine` retains independent start/end modes for a future asymmetric surface.
Butt caps keep full realized width. Tapers use a smooth width ramp with a machine-safe terminal
bite. Point caps converge to the analyzed spine tip, and round caps use a circular half-width
profile whose longitudinal radius is half the realized endpoint width; when that semicircle exceeds
the configured length or half the column, it warns and falls back to point. Closed columns retain
their existing seam and ignore caps without changing events.

Cap distances and realized widths are evaluated in hoop space after the authored output map.
Narrowing caps reserve their physical transition span from every underlay pass; connector motion to
the shortened pass remains within the topping envelope. Exact coincident tips merge silently;
nonzero sub-half-minimum decorative penetrations use the existing tiny-stitch merge path. The
post-run lock pass remains unchanged and outside the cap generator. The policy is drawless.
`legacy` bypasses all cap geometry and preserves the prior event stream exactly.

### Session 5.3 — Corner strategies

Status: complete (2026-07-19)

Implement:

- `continuous`: current behavior plus short-stitch relief;
- `fan`: distribute outer-rail penetrations around a turn while skipping selected inner bites;
- `miter`: split and overlap two straight column legs at a computed bisector;
- `split`: end one column and begin the next with controlled overlap.

Tasks:

- Use `satincorner` as the sharp-corner threshold.
- Bound repeated outer penetrations and inner-hole stacks.
- Define underlay continuity at each join.
- Emit a warning and fall back when geometry cannot support the chosen policy.
- Preserve authored checkpoints in rail-pair satin.

Acceptance criteria:

- Acute, right-angle, and obtuse fixtures each have stable expected event patterns.
- Corner coverage stays below configured limits under recommended defaults.
- No automatic split changes color or inserts a trim unless explicitly specified by policy.

Implementation note: `satinjoin 'legacy'|'continuous'|'fan'|'miter'|'split'` is a sticky,
`stitchscope`-aware policy selected at physical hoop-space turns meeting `satincorner` (5–175
degrees, default 60). The default `legacy` branch retains the previous direct-emission path exactly.
Continuous retains the existing zigzag and adds alternating 60%-width inner relief when
`shortstitch` is enabled. Fan interpolates the outer normal around the turn, keeps at most eight
outer penetrations and two shortened inner bites per corner window, and therefore bounds both
outer repeats and inner stacks. Miter computes bounded offset-rail intersections for two straight
legs; split extends/restarts the legs across the vertex. Both use a maximum 0.5 mm physical overlap.

Underlay remains a single continuous construction over the authored spine or checkpoint-anchored
rail correspondence for every policy. Miter and split replace topping points and connect them with
ordinary stitches, so they add no jump, trim, color, or lock boundary. Insufficient leg support,
near-reversals, excessive miters, and unsupported closed joins emit a source warning and fall back
locally to continuous. Plain, transformed, programmable, and rail-pair satin share the same
analysis and policy pass; all decisions are deterministic and consume no RNG draws. Acute,
right-angle, obtuse, density-limit, fallback, underlay-continuity, checkpoint, and no-boundary event
fixtures live in `satin-corners.test.ts`.

### Session 5.4 — Wide-column splitting

Status: complete (2026-07-19)

Purpose: replace a warning-only failure mode with an explicit, opt-in construction.

Tasks:

- Implement `satinwide 'warn'|'split'`, `satinmaxwidth`, and split overlap.
- Partition a wide column into adjacent narrower columns in hoop space.
- Keep aggregate coverage near one topping layer; overlap only enough to avoid fabric gaps.
- Choose an alternating or nearest route that minimizes jumps while preserving underlay-before-
  topping for each split construction.
- Handle varying width, tapers, corners, and closed columns conservatively.
- Refuse rather than improvise when rails cross or topology is ambiguous.

Acceptance criteria:

- `warn` is the current path.
- Straight and gently curved columns wider than the threshold split into safe realized chords.
- Split overlap does not produce systematic density hotspots.
- Highly pathological columns give a precise warning and remain unsplit.

Implementation note: `satinwide 'warn'|'split'`, `satinmaxwidth` (2–12 mm, default 7.5), and
`satinsplitoverlap` (0–1 mm, default 0.5) are sticky, `stitchscope`-aware construction settings.
`warn` remains the byte-identical legacy route. The opt-in branch analyzes completed numeric spine
and non-reporter rail-pair columns in hoop space after transforms, pull compensation, and cap
factors. It chooses a constant lane count from the widest rung, partitions every topping row with
one shared moving boundary per seam, and alternates ownership of the overlap band. This interlock
avoids both fabric gaps and a stationary doubled topping strip. Each lane resolves and sews its own
underlay before topping; a deterministic nearest-end route reverses lanes to minimize inter-lane
jumps.

Open straight, gently curved, transformed, varying-width, tapered, and capped columns use the
splitter. Closed columns, sharp corners, cusps/U-turns, locally radius-unsafe widths, reversed or
crossed rails, programmable satin, and reporter-driven rail inset/rake warn precisely and remain
unsplit. Those cases are intentionally deferred until a topology-preserving partition can be
proven rather than inferred. The construction is deterministic and consumes no RNG draws.

## 14. Phase 6: constrained travel planning

### Session 6.1 — Planner metadata spike

Status: complete (2026-07-19)

Purpose: choose the least invasive representation for barriers and groups.

Tasks:

- Prototype internal wrapper, sidecar, and optional-event-tag approaches.
- Exercise finalization ordering: authored events, planning, auto-trim, density finalization, locks.
- Confirm source lines and underlay flags survive reordering.
- Confirm exporters never receive internal planner-only records.
- Document how history queries relate to planned order. The initial contract may retain current
  program-order history, but diagnostics must state the mismatch when it matters.

Deliverable: a short decision record in this document or the travel-planner architecture section.

Decision record: the planner's authoritative working representation is an internal event wrapper,
`{ event: StitchEvent, tags: PlanTags }`. `travel-planner.ts` now lowers the authored public stream
to wrappers before partitioning/routing and unwraps it before returning. `PlanTags` begins with a
segment ID and reserves optional group and atomic IDs. Planner-created connector jumps inherit the
destination record's tags. The wrapper and its tags are private to the module: `StitchEvent`,
`RunResult.events`, all later post-process passes, and all four exporters continue to receive only
the public event shape.

The alternatives were exercised against the existing reorder/reversal and finalization paths:

- Optional fields directly on `StitchEvent` were rejected. Object spreads in reversal and later
  post-process passes preserve unknown fields, so safe use would depend on remembering to strip
  metadata at every exit and would make exporter isolation conventional rather than structural.
- A dense event-index sidecar was rejected as the planner's working form. Its indices have to be
  remapped whenever planning drops connector jumps, inserts new ones, or reverses runs. A **sparse
  authored-boundary sidecar** remains the intended low-impact recording mechanism for the future
  zero-emission `planbarrier`, `routegroup`, and `atomic` syntax: the machine can record boundary/span
  offsets while the authored stream is append-only, and finalization can compile those offsets into
  wrapper tags once, before any reorder.
- Internal wrappers were selected because metadata moves with an event through reorder/reversal,
  planner-created events receive tags deliberately, and unwrapping creates one auditable boundary.
  The wrapper refactor also leaves planning-off output untouched.

The fixed finalization contract is `authored events/history → planner wrappers → plan → unwrap →
autotrim → density finalize → locks → RunResult/exporters`. Source `line` and underlay `u` remain
properties of the wrapped event and survive reordering; reversal remains forbidden for mixed
underlay/topping runs. Density and stitch-history reporters retain the committed **authored/program
order** grid: coverage totals are order-independent, and rebuilding it would retroactively change
values on which the program may already have branched. When a run both uses a history reporter and
is materially reordered, the plan diagnostic now states that the query observed authored order
before the final sew-order plan. Locks deliberately remain outside planner records and are derived
only after final route and auto-trim boundaries are known.

### Session 6.2 — `planbarrier`

Status: complete (2026-07-19)

Tasks:

- Add a zero-emission command that increments the active planner segment.
- Split planning independently at barriers, color changes, and existing hard boundaries.
- Make the command inert when planning is off except for optional diagnostic metadata.
- Reject or ignore barriers in trace with a clear documented rule.

Acceptance criteria:

- Runs never cross a barrier.
- Barriers do not alter unplanned event output.
- Consecutive/empty barriers are harmless.

Implementation note: `planbarrier` is a zero-arity Core command and emits no public event. When an
active plan mode is selected, it first flushes pending satin or reporter-driven running construction
so the authored boundary is exact, then appends the current event offset to the sparse planner
sidecar chosen in Session 6.1. Finalization compiles those offsets into monotonically increasing
wrapper segment tags. Each color block is planned as one or more independent segments; explicit
trim/autotrim run boundaries continue to be resolved inside each segment. Segment-local planning
retains deterministic anchoring and routing, and plan statistics still count color blocks rather
than multiplying colors by their barrier segments.

With no `plan` directive or with `plan 'off'`, `planbarrier` returns before any flush or metadata
write during normal sewing execution, making both events and buffered construction byte-identical to
a program without the command. Barriers may execute through ordinary branches, loops, and
procedures. They are always rejected inside `trace`, where sandboxed geometry has no place in the
final authored stream. With planning active they are also rejected inside an open
`beginfill…endfill`, whose boundary geometry is buffered and emitted as one construction only at
`endfill`. Consecutive offsets, a barrier before the first event, and a barrier after the last event
produce empty segments and have no effect. The command is drawless.

### Session 6.3 — `atomic` blocks

Status: complete (2026-07-19)

Tasks:

- Add parser/runtime block support with exception-safe nesting.
- Treat the complete atomic span as one indivisible route item.
- Preserve internal order and prohibit reversal unless a future explicit reversible form is added.
- Define nested atomics: recommended behavior is that the outermost atomic block owns the span.
- Reject atomics that cross color boundaries only if the planner representation cannot preserve
  them; otherwise keep the color boundary internal and make the whole object immovable.

Acceptance criteria:

- Underlay/topping constructions remain contiguous.
- Atomic blocks can move as a unit within one allowed planner segment.
- With plan off, stitches are byte-identical.

Implementation note: `atomic` is a dedicated Core block AST node. During active planning, only the
outermost executing atomic flushes pending satin/reporter-running construction at entry and exit and
records one sparse `[start,end)` authored event span; nested atomics share that owner. Both nesting
and `structuralDepth` unwind in `finally`, including through `return`, `break`, `continue`, and errors.
With planning absent or `off`, the wrapper executes its body without flushing or recording, retaining
byte-identical buffered construction.

Finalization lowers spans to private wrapper `atomic` IDs. Explicit trims and autotrim-sized jumps
inside one ID no longer split it into separate route items, all internal events retain authored
order, and no reverse endpoints are offered even under `reversing-nearest`. Leading atomic jumps
travel with the item instead of being discarded as rebuildable connectors. Atomics stay inside one
planner segment: an active `planbarrier` inside the block is rejected. Trace and partial-fill
boundaries are likewise rejected; a complete `atomic [ beginfill … endfill ]` is valid.

The current planner independently routes color blocks and therefore cannot move a multi-color item
without weakening either the atomic or color-order contract. Active atomics containing a color event
are rejected with the atomic source line and a suggestion to use one atomic per color. Planning-off
execution remains unaffected, including internal color changes.

### Session 6.4 — `routegroup` and improved algorithms

Status: complete (2026-07-19)

Tasks:

- Define route groups as explicit collections within which runs may reorder.
- Preserve authored order outside a route group.
- Add a bounded improvement pass such as 2-opt only after nearest-neighbor behavior is stable.
- Charge planning work to an appropriate budget and retain deterministic tie-breaking.
- Report before/after travel per group.

Acceptance criteria:

- Group planning never crosses colors, barriers, or atomic boundaries.
- Large groups remain bounded and responsive in the worker.
- Planner statistics explain what was eligible and what moved.

Implementation note: `routegroup` is a dedicated Core block AST node using the same sparse authored
span representation as `atomic`. Only the outermost nested group records a span; nesting and
`structuralDepth` unwind through all control transfers. Active boundaries flush pending
satin/reporter-running construction, while absent/`off` planning executes a byte-identical wrapper.
Trace and partial-fill boundaries are rejected. Atomics may be placed inside a group, but a group
cannot begin inside an atomic because that would split the indivisible owner.

Compatibility is explicit: when no group executes, the existing whole-design nearest behavior is
unchanged. Once any group executes, only group-tagged runs are eligible and all ungrouped records pass
through in authored order. A group may contain color changes and `planbarrier`; finalization routes
each color/segment intersection independently and aggregates its statistics. Atomic IDs inside those
intersections still merge all internal trims/jumps into one forward-only route item.

`routing.ts` now registers `nearest-2opt`. It starts from the stable spatial-bucket nearest result,
keeps every chosen item direction, anchors the first item, and reverses only bounded order
subsequences. The deterministic first strict improvement wins; equal-cost candidates retain original
tie order. Each intersection searches a 32-item window, examines at most 4,096 exchanges, and accepts
at most eight passes. Every distance comparison calls the existing planner budget hook. The ordinary
`routesort` modes and ungrouped planner compatibility path continue to use plain `nearest`.

`RunResult.plan.groups` and console diagnostics report each execution-order group ID and source line,
eligible and moved runs, accepted 2-opt swaps, and travel before/after. Empty groups remain visible
with zero counts, so statistics explain both movement and non-eligibility.

## 15. Phase 7: material, thread, and directional physics

This phase needs physical sew-out validation. Land the data model and diagnostics before enabling
automatic geometry correction.

### Session 7.1 — Material intent and profile registry

Tasks:

- Introduce typed fabric, thread, stabilizer, and topping registries.
- Keep existing `FABRICS` export compatible or provide a deprecated adapter.
- Add commands for `fabricgrain`, `fabricstretch`, `threadprofile`, `threadwidth`, `needle`,
  `stabilizer`, and `topping`.
- Explicit values override profile defaults in source order.
- Expose resolved intent in `RunResult` for the playground and exporters that support metadata.
- Do not change stitches yet except where an existing `fabric` command already does.

Initial profile scope:

- existing fabric presets;
- generic rayon/polyester 40 wt and 60 wt thread-width approximations;
- common needle sizes as advisory metadata;
- none/tearaway/cutaway/washaway stabilizer categories;
- topping boolean.

Avoid brand-specific claims until data and maintenance ownership exist.

Acceptance criteria:

- Existing `fabric` programs resolve to current scalar physics.
- Explicit `threadwidth` changes only coverage calculations in the next session, not stitch geometry.
- Unknown profiles have did-you-mean diagnostics.

### Session 7.2 — Thread-aware coverage

Tasks:

- Replace the fixed `THREAD_W` constant with resolved thread width supplied to `DensityGrid`.
- Preserve 0.4 mm as the default.
- Include thread width in density result metadata.
- Revisit coverage thresholds only through profiles; do not silently rescale existing
  `maxdensity` values.
- Add tests showing that the same stitch geometry has different coverage for 40 wt and 60 wt.

Acceptance criteria:

- Default density maps are byte/value-identical.
- History queries and final heatmap use the same configured width.
- Locks remain excluded as currently documented.

### Session 7.3 — Directional compensation model

Purpose: calculate practical anisotropic compensation without applying it yet.

Tasks:

- Define a 2D compensation tensor aligned to `fabricgrain`.
- Resolve along/across pull and push recommendations from material intent.
- Given a stitch/row/column heading, calculate across-stitch and along-stitch components.
- Produce preview diagnostics comparing current scalar compensation with the resolved directional
  recommendation.
- Build synthetic tests for rotation invariance and grain-axis swapping.

Required design decision:

- Pull compensation usually expands across stitch direction; push compensation usually adjusts
  along stitch direction. Confirm signs and magnitudes separately for satin, tatami rows, borders,
  and running stitches rather than applying one generic affine scale.

Acceptance criteria:

- The model is pure, deterministic, and documented.
- No event geometry changes in this session.

### Session 7.4 — Opt-in directional satin compensation

Tasks:

- Add an explicit mode such as `compensation 'directional'`; retain legacy scalar behavior by
  default.
- Apply directional widening at realized satin rail endpoints in hoop space.
- Support spine and rail-pair satin.
- Combine explicit `pullcomp` with material recommendations using a documented override rule.
- Validate under rotations and non-uniform transforms.

Acceptance criteria:

- Rotating the design relative to grain changes compensation predictably.
- Rotating both design and grain together preserves geometry modulo rotation.
- Width ceilings and snag warnings observe compensated chords.

### Session 7.5 — Opt-in directional fill and border compensation

Tasks:

- Extend open fill row ends according to row direction and material tensor.
- Add push compensation along row direction only if sew-out evidence supports it.
- Define behavior for curved programmable streamlines using local tangent at each end.
- Keep closed contour paths explicit: do not claim that row-end compensation widens a closed ring.
- Integrate fill inset/border overlap recommendations.

Acceptance criteria:

- Compensation does not cross holes or field boundaries without warnings.
- Directional fills use endpoint tangents consistently.
- Legacy `pullcomp` behavior remains available.

### Session 7.6 — Physical sew-out validation

Create a versioned test sheet covering:

- horizontal/vertical/diagonal satin at several widths;
- straight and cornered columns;
- fill blocks at 0/45/90/135 degrees;
- fill-plus-border registration targets;
- woven, knit/stretch, denim/canvas, and fleece/pile where available;
- thread profiles and at least two needle sizes.

Record intended dimensions, measured dimensions after hoop release, fabric, stabilizer, thread,
needle, machine, speed, and observations. Store measurements in a human-readable root or test-data
document, not as undocumented constants in code.

Only promote profile recommendations to `auto` after this evidence exists.

## 16. Phase 8: preflight and machine calibration

### Session 8.1 — Structured preflight result

Purpose: make diagnostics useful beyond warning strings.

Proposed types:

```ts
interface PreflightIssue {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  points: Array<{ x: number; y: number }>;
  lines: number[];
  constructionIds?: number[];
  suggestion?: string;
}

interface PreflightResult {
  issues: PreflightIssue[];
  profile: ResolvedMachineProfile;
  summary: Record<string, number>;
}
```

Tasks:

- Add optional `preflight` to `RunResult`.
- Adapt existing density, stack, overflow, tiny-stitch, and satin snag diagnostics into structured
  issues without removing current warning strings.
- Assign stable codes suitable for UI filters and tests.
- Keep analysis pure over completed events plus internal construction metadata.

Acceptance criteria:

- Existing warning consumers continue to work.
- Every structured issue has stable ordering and deterministic coordinates.

### Session 8.2 — New event-stream checks

Add checks that do not require original construction regions:

- clusters of short stitches, not only individual tiny stitches;
- repeated reversals in a small radius;
- excessive same-hole or near-hole penetrations over a moving window;
- long sewn floats and long untrimmed jump chains;
- realized satin chords beyond thread/profile recommendations;
- excessive consecutive stitches without a trim/color boundary where relevant;
- dense direction-change clusters likely to perforate fabric.

Each check needs:

- documented metric and threshold source;
- fabric/thread/profile sensitivity where justified;
- spatial and line attribution;
- a fixture that triggers it and a neighboring safe fixture that does not.

### Session 8.3 — Construction-aware checks

Using internal construction metadata, add:

- underlay protrusion beyond topping envelopes;
- fill-to-border overlap too small or excessively dense;
- edge-run plus border stacking;
- split-satin overlap hotspots;
- fill connectors sewn outside a construction region;
- underlay/topping order violations after planning.

Do not infer these relationships from arbitrary running stitches. Run a check only when the machine
has explicit construction IDs and boundaries.

### Session 8.4 — `preflight` command and playground presentation

Tasks:

- Implement top-level `preflight 'off'|'warn'|'strict'` before committed stitches.
- Choose a conservative default: keep current always-on warnings, with extended checks opt-in as
  `warn` until false-positive rates are known.
- Add grouped UI presentation by severity/code with stage highlighting.
- Allow hiding info-level issues without changing compilation.
- Document strict behavior precisely.

Acceptance criteria:

- Preflight never changes events.
- UI navigation selects the relevant source lines and design points.
- Strict mode cannot fail on a recommendation-only issue.

### Session 8.5 — Local machine profile and calibration

Purpose: support actual machine constraints without polluting portable source.

Run configuration may include:

- profile name;
- maximum preferred stitch and jump lengths;
- trim/color-change capabilities;
- minimum reliable movement;
- measured X/Y scale;
- measured XY skew or a bounded affine correction;
- speed class for advisory diagnostics.

Tasks:

- Extend `RunOptions` with a serializable machine profile.
- Define whether calibration is applied before or after hoop overflow checks. Recommended: apply it
  before final field validation because corrected coordinates are what the machine will attempt.
- Keep source determinism phrasing accurate: result depends on explicit run configuration.
- Add a playground calibration profile editor/import/export flow later; core types and tests come
  first.
- Do not add speed/tension events until exporter support and portable semantics are researched.

Acceptance criteria:

- No profile means identity correction and current constraints.
- Calibration is bounded; absurd scale/skew values are rejected.
- Applied profile appears in `RunResult` and export metadata where possible.
- Sharing source alone does not silently embed a user's local machine correction.

## 17. Phase 9: integration, importer exposure, and examples

### Session 9.1 — Monaco, AI prompt, and catalog audit

Tasks:

- Ensure all new commands and modes have completions, hover text, signatures, examples, and syntax
  categories.
- Update `ai-system-prompt.md` and generated/in-code prompt sources together.
- Add generation guidance for fill inset, underlay profiles, satin corners, planner barriers, and
  material intent.
- Add negative guidance: do not enable automatic split/compensation without explicit intent.

### Session 9.2 — SVG staging integration

Expose only stable, high-level settings:

- fill inset/overlap for tatami plus satin border operations;
- underlay profiles;
- satin cap/join policy for explicit satin operations;
- atomic grouping for multi-stage operations;
- planner barriers/group preservation;
- fabric/thread intent inherited from staging globals.

Do not make the importer infer grain, stabilizer, satin branching, or calibration. Preview must still
compile emitted NeedleScript through the normal worker.

### Session 9.3 — Examples and sew-out suite

Add focused advanced examples rather than one kitchen-sink design:

- density-neutral two- and multi-color gradient;
- fleece knockdown and topping-aware patch;
- fill with inset satin border;
- satin cap/corner sampler;
- wide-column split sampler;
- constrained travel-plan sampler;
- anisotropic material compensation sampler;
- preflight issue sampler that is intentionally not export-ready.

Each production example should state recommended fabric/stabilizer/thread assumptions and remain
within a common hoop preset.

## 18. Testing strategy

### 18.1 Unit tests

- Mode parsing, arity, ranges, did-you-mean, and contextual errors.
- Profile resolution and explicit override precedence.
- Geometry analysis for fill boundaries and satin columns.
- Deterministic hashing and RNG draw counts.
- Configuration snapshot/restore under all control-flow signals.
- Planner constraint lowering and route eligibility.
- Structured preflight ordering and stable codes.

### 18.2 Golden event tests

Use exact event arrays for small fixtures. Pin:

- legacy no-op paths;
- underlay pass order and `u` flags;
- cap/join penetrations;
- fill row endpoints and connectors;
- split-column construction order;
- planner results and rebuilt jumps;
- calibration output.

Keep fixtures small enough that intentional diffs are reviewable.

### 18.3 Property tests

Where practical, cover:

- no generated penetration is non-finite;
- stitch ceilings hold after compensation;
- fill connectors marked `inside` remain inside compound regions;
- positive fill inset never increases filled area;
- cap/join generation terminates under degenerate inputs;
- planner barriers are never crossed;
- aggregate gradient assignment count equals candidate count;
- default/legacy policies equal the baseline generator.

### 18.4 Integration tests

- Full parser-to-`RunResult` tests for every new command.
- SVG staging emission and append/replace validation for exposed features.
- Monaco catalog coverage.
- DST/PES/EXP exporter stability and calibrated-coordinate behavior.
- Worker timing/budget behavior for large fills and planner groups.

### 18.5 Physical sew-out tests

Software tests cannot validate all material recommendations. Maintain versioned sew-out sheets and
measurements. A profile constant should identify the sample or rationale that supports it. When no
physical evidence exists, label the value advisory/experimental and keep it out of automatic modes.

## 19. Documentation requirements per phase

Every user-visible phase must update:

- `needlescript-language-reference.md`;
- `needlescript-machine-architecture.md` for machine/generator/post-process changes;
- `needlescript-interpreter-architecture.md` for AST/runtime/finalization changes;
- `needlescript-parser-architecture.md` for new statement/block forms;
- `needlescript-standard-library-reference.md` for new exports;
- Monaco catalog and tokenizer;
- `ai-system-prompt.md` and any source that generates the in-app prompt;
- at least one example or concise reference snippet.

Document for every command:

- units and coordinate frame;
- sticky, scoped, one-shot, or top-level behavior;
- default and legacy behavior;
- accepted range and clamp/error policy;
- reporter contract if any;
- RNG draw count;
- transform/warp interaction;
- trace/fill/satin-buffer restrictions;
- whether it affects events, warnings, metadata, or only preview/preflight.

## 20. Session completion checklist

Each implementation session should finish with:

1. focused tests for the new slice;
2. full `npm test`;
3. `npm run format` followed by `npx prettier --check .`;
4. `npm run lint`;
5. `npm run build`;
6. `npm run build:lib`;
7. `npm run check:lib`;
8. `npm run doctor` when React/UI code changed;
9. relevant architecture and language documentation updated;
10. a short note identifying intentionally deferred edge cases.

Use `nvm use` before running the suite. Never use `Math.random` in `src/lib/`; use the seeded PRNG,
a forked stream, or a documented deterministic hash.

## 21. Dependency order

```text
baseline fixtures
  ├── standard-library quick wins
  ├── stitchscope ───────────────┐
  ├── underlay profiles ────────┤
  ├── fill policies ────────────┼── construction-aware preflight
  ├── satin policies ───────────┤
  └── planner metadata ─────────┘

material intent
  ├── thread-aware coverage ─────── preflight thresholds
  ├── directional model ─────────── satin/fill compensation
  └── sew-out validation ────────── auto profile promotion

all stable language slices
  ├── Monaco and AI prompt
  ├── SVG staging exposure
  └── production examples
```

Standard-library gradients and knockdown can ship immediately after baseline fixtures. Scoped
settings can proceed independently. Underlay should land before final satin corner/split work so
new constructions do not need to retrofit foundation behavior. Fill and satin construction metadata
should land before construction-aware preflight. Material intent may be developed in parallel, but
directional auto compensation waits for sew-out validation.

## 22. Recommended release slices

### Release A — Safer authoring and reusable recipes

- baseline fixtures;
- two-color gradient rows;
- knockdown/fill-and-border/appliqué helpers;
- `stitchscope`.

### Release B — Foundation and fill quality

- parameterized underlay;
- fill inset;
- fill stagger and connector policies;
- containment-aware fill declump.

### Release C — Satin quality and constrained routing

- cap and corner strategies;
- opt-in wide-column split;
- planner barriers, atomic blocks, and route groups.

### Release D — Physical profiles and diagnostics

- material/thread intent;
- thread-aware coverage;
- structured preflight;
- local machine profiles and calibration;
- experimental directional compensation.

### Release E — Validated automatic physics

- sew-out-backed material recommendations;
- promoted directional compensation modes;
- finalized SVG staging controls and production examples.

## 23. Open decisions to resolve before implementation

1. Should construction and planner metadata live on events, in sidecars, or in an internal event
   wrapper?
2. Should `underlaypasses` accept a list, or should a block/profile form provide better future
   extensibility?
3. Should fill edge-run order be underlay → edge → topping or underlay → topping → edge?
4. How should reporter-supplied fill phase combine with named stagger policies?
5. Should satin start/end caps be independently configurable in the first public API?
6. Resolved in Session 5.4: use a constant-count hoop-space rung partition with alternating shared
   seam ownership; refuse closed, sharp, crossed, radius-unsafe, and reporter-defined topology.
7. Does `atomic` permit internal color changes, or should that require a separate multi-color group?
8. Which preflight checks are objective enough for `strict` mode?
9. Which thread widths and material coefficients have sufficient evidence to ship as recommendations?
10. Should calibrated hoop overflow be checked only after correction or both before and after?
11. Should material intent be included in exported sidecar metadata even when the stitch format cannot
    encode it?
12. What naming best distinguishes source-portable `fabric` intent from local machine profiles?

Resolve these in the first session that depends on them. Record the result in the relevant
architecture document and update this plan rather than leaving decisions only in issue or chat
history.

## 24. Overall definition of done

This roadmap is complete when:

- all listed features except lettering have stable, documented language or standard-library APIs;
- legacy/default programs retain pinned output;
- underlay, fill, and satin construction have explicit quality controls;
- travel planning can honor authored barriers and atomic relationships;
- multicolor gradients maintain constant aggregate density;
- material/thread intent feeds coverage and validated compensation;
- preflight produces structured, spatial, source-attributed issues without rewriting stitches;
- local machine calibration is explicit and reproducible;
- Monaco, AI generation guidance, SVG staging, examples, and public library exports agree;
- automated checks pass and physical sew-out evidence supports every promoted automatic profile;
- lettering remains clearly deferred to its own font-design and digitizing roadmap.
