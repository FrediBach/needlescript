# Extended SVG Import: Implementation Specification

Status: proposed implementation guide  
Scope: playground SVG import, staging model, NeedleScript code generation, and tests  
Primary objective: turn authored SVG structure into readable, editable, generative NeedleScript

## 1. Summary

The SVG importer should become a vector-to-code recipe builder, not an embroidery digitizer.

The importer reads vector geometry and paint metadata, presents conservative high-level construction
choices, compiles those choices through the real NeedleScript engine, and emits code that a user can
understand and continue editing. It must not infer individual penetrations, hidden centerlines, satin
branching, or other opaque stitch-level decisions.

The implementation has two major parts:

1. Correct and simplify the importer architecture by separating source geometry, SVG paint
   operations, and NeedleScript construction recipes.
2. Use recent NeedleScript features—editable paths and curves, standard-library procedures,
   `fill paths`, closures, native colors, `satinbetween`, `chalk`, and travel planning—to produce
   substantially more useful code.

The first implementation milestone is architectural and corrective. Richer recipes must not be
added on top of the current one-element/one-strategy model because that model already loses SVG
information in common cases.

## 2. Product principles

### 2.1 Code is the product

The committed result is ordinary NeedleScript, not a private importer format. Closing the dialog
must leave the user with named geometry, comprehensible construction calls, and useful parameters.
The staged document is temporary and does not need to be serializable as a project format.

### 2.2 Preserve intent before optimizing stitches

Prefer preserving:

- source object and group names;
- distinct fill and stroke layers;
- primitive or curve structure;
- SVG layer relationships and compound regions;
- source colors and deliberate user remapping;
- explicit authored paths that can serve as guides or satin rails.

Do not silently replace those concepts with anonymous point clouds or finalized stitch coordinates.

### 2.3 Conservative defaults, explicit advanced choices

Defaults should compile successfully and be physically plausible, but they should not pretend to
understand design intent that the SVG does not express. In particular:

- a filled thin shape is not automatically a well-formed satin column;
- two nearby paths are not automatically satin rails;
- only a supported opaque linear gradient maps to the explicit density-neutral row recipe; other
  gradient types are not automatically tonal embroidery;
- text is not automatically outlined through a platform font;
- masks and filters are not automatically flattened into stitch regions.

Offer explicit recipes where the user supplies the missing intent.

### 2.4 What is previewed is what is emitted

Every staging change must preview by emitting code and compiling that code through the normal worker
pipeline. There must be no separate preview-only stitch implementation.

### 2.5 Quick import remains quick

The one-click Quick import remains available. It applies a fixed default recipe policy to the same
canonical model and emitter used by Import with options. There must not be two independent SVG
conversion implementations after the migration.

## 3. Explicit non-goals

The extended importer will not provide:

- individual stitch or penetration editing;
- automatic satin-column skeletonization, branching, or centerline extraction;
- automatic conversion of photos, radial gradients, filters, or opacity into tonal stitch fields;
- automatic font loading or text outlining;
- automatic node cleanup presented as an opaque “optimize design” operation;
- a persisted proprietary embroidery-object format;
- a second embroidery compiler inside the UI;
- exact visual reproduction of every SVG rendering feature.

Geometry preprocessing that faithfully resolves existing vector semantics—transforms, compound
paths, common presentation attributes, and later `<use>` references—is in scope. Inventing
embroidery semantics that are absent from the SVG is not.

## 4. Current implementation and known problems

### 4.1 Current flow

Quick import:

```text
SVG text
  -> src/lib/svg-importer.ts DOM walk
  -> flattened shapes
  -> fill/stroke jobs
  -> NeedleScript text
```

Import with options:

```text
SVG text
  -> src/lib/svg/parse.ts DOM walk
  -> StagedDocument / ElementModel
  -> strategy selection in src/lib/svg/strategies.ts
  -> src/lib/svg/emit.ts
  -> compiler worker preview
  -> replace or append source
```

The shared low-level SVG path and transform helpers live in `src/lib/svg/svg-path.ts`.

### 4.2 Correctness and architecture issues to address first

#### Fill and stroke are conflated

`parseSvgToModel` creates one `ElementModel` for a source SVG shape. It records both source paints,
but selects one thread from `fill ?? stroke` and one strategy. A shape with both fill and stroke
therefore loses its separate outline in Import with options. The legacy quick importer already
creates separate fill and stroke jobs.

Required result: one source geometry may produce multiple independently selectable operations that
share the same geometry.

#### Hole/Solid metadata does not change emitted fill topology

The staging model exposes a per-ring Hole/Solid choice, but the emitter writes every nested ring
into one `beginfill ... endfill`. NeedleScript then applies its even-odd compound-region rule. A ring
marked Solid in the UI is still a hole when it is nested at odd depth.

Required result: source fill rules and manual ring decisions must be lowered into geometry that has
the requested even-odd meaning. Solid nested islands may require separate fill operations or a
boolean-normalized compound region.

#### SVG `fill-rule` is stored but not honored

The parser records `nonzero` or `evenodd`, while `computeHoleMap` derives holes only from containment
depth. Nested rings with the same winding under `nonzero` are not equivalent to even-odd nesting.

Required result: resolve source fill semantics before recipe emission and test same-winding and
opposite-winding nested rings.

#### Group preservation is not implemented

`keepGroups` is editable, but `autoOrder` ignores it. The model also retains only one synthetic
`groupId`, not a stable nested hierarchy.

Required result: retain a group path and make group contiguity an actual ordering constraint.

#### Some controls have no emitted effect

For example, satin `shortstitch` is present in the strategy parameters and UI but is not emitted.
All controls must either affect emitted code or be removed. Add emitter assertions or tests for every
strategy parameter.

#### Geometry resolution and stitch spacing are conflated

`resampleMM` is applied while declaring all paths, including fill boundaries. It acts as curve
flattening/detail, editable geometry sampling, and physical running-stitch spacing at once.

Required result: use separate concepts:

- geometry tolerance/detail for representing a boundary;
- construction spacing for running stitches, satin density, or fill rows.

For editable curves, use `curveflat` to derive logical geometry. Apply `resample` only in recipes
that need physical samples.

#### Stroke width is not consistently converted to hoop millimetres

The element transform contributes to parsed `strokeWidth`, but the later global fit-to-hoop scale is
not applied before it seeds a satin width.

Required result: store physical hoop-space millimetres after every source and import transform.

#### Hoop validation assumes the default round field

The staging model uses a hard-coded 47 mm disc even when the selected playground hoop is oval or
rectangular.

Required result: parsing and validation receive the active hoop/field description. Fit, outside-field
flags, hit-testing assumptions, and source overlays must use that field.

#### Append is concatenation, not a program merge

Append currently concatenates a complete emitted program, including `seed` and `fabric`, and does
not resolve symbol, import, palette, or once-only directive conflicts. `EmitOptions.mode` does not
change output.

Required result: replace and append have explicit emission contracts described in section 11.

#### Existing-program reporters and preview mode are inconsistent

The directional-fill selector can name a reporter from the current editor program, but staged
preview compiles only emitted import code. Replace mode would also delete that reporter.

Required result: append preview compiles base source plus the fragment. Replace mode may use only
self-contained generated code, standard-library references, or a generated active scaffold.

#### Preview errors are not surfaced clearly

`useStagedDesign` stores a compile error, but `StagingDialog` does not display it. A failed preview
must disable commit or require an explicit override only if a safe override is defined. The initial
implementation should disable commit.

#### Duplicate importer pipelines will continue to drift

`src/lib/svg-importer.ts` and `src/lib/svg/parse.ts` independently walk the DOM, resolve paint, and
apply conversion policy.

Required result: one parser and one model. Quick import is a preset consumer of that model.

## 5. Target user experience

### 5.1 Dialog structure

Keep the existing three-pane staging dialog:

- left: source objects and derived operations;
- center: compiled stitches with optional source/guide overlays;
- right: recipe and parameter inspector.

The left pane should make the geometry/operation relationship visible without becoming a full SVG
layer editor. Recommended row hierarchy:

```text
logo-mark                         source object / geometry
  fill · #315c45                 Tatami fill
  stroke · #f4d35e · 1.8 mm      Satin along path
letter-a                          source object / geometry
  fill · #315c45                 Guide only
```

Collapsing the source row hides its operations. Selecting a source row selects all child operations.
Bulk recipe assignment operates on compatible selected operations.

If implementing hierarchy immediately would materially delay the model migration, use a flat list
with linked labels such as `logo-mark · fill` and `logo-mark · stroke` for the first milestone. The
data model must still support shared geometry.

### 5.2 Global controls

Retain or add:

- fabric;
- order: Depth, Color, SVG order, Manual;
- keep SVG groups together;
- geometry output default: Semantic, Editable curves, Editable paths, Compact;
- geometry tolerance, distinct from construction spacing;
- import scale;
- seed;
- color policy: Preserve source colors or Map to threads;
- thread mapping;
- travel plan: Off, Nearest, Reversing nearest;
- Replace / Append mode.

Travel planning defaults to Off. Authored order must remain available because same-color reordering
can change overlap order.

In Append mode, disable or inherit top-level settings that cannot legally be appended, including a
new travel plan when the base program has already stitched.

### 5.3 Geometry output per source object

Each source geometry gets an output mode:

- **Semantic**: standard-library primitive plus functional transforms when confidently representable.
- **Editable curve**: cubic anchor spec annotated with `[curve]` and flattened with `curveflat`.
- **Editable path**: point list annotated with `[path]` or `[path: closed]`.
- **Compact**: a non-customizer path literal with geometry-appropriate simplification.

The global control supplies defaults. Per-object overrides remain possible.

Semantic output is allowed only when it is faithful and simpler than the alternatives. Examples:

- circle -> `std.shapes.ellipsepath` or a circle-equivalent path expression;
- ellipse -> `std.shapes.ellipsepath` plus translation/rotation;
- rectangle -> `std.shapes.rectpath`;
- rounded rectangle -> `std.shapes.roundrect`;
- regular polygon only when the source is actually regular within a documented tolerance;
- arbitrary path -> editable curve/path or compact geometry, never guessed as a named shape.

Arbitrary affine skew may force curve or compact output. Do not emit a misleading semantic primitive.

### 5.4 Initial construction recipes

Recipes are grouped by compatible operation type.

#### All geometry

- Skip: omit operation and geometry unless another operation needs it.
- Guide only: retain geometry and emit `chalk`; no stitches.

#### Open or closed stroke/path operations

- Running line.
- Bean line.
- E-stitch line.
- Satin along path.
- Dashed running line when source dash metadata exists or the user enables it.

The first implementation may expose Bean and E-stitch as modes of Running line rather than separate
recipe union members. The UI must prevent incompatible simultaneous sticky modes.

#### Closed fill operations

- Tatami fill.
- Directional fill.
- Contour fill.
- Spiral fill.
- Pattern fill.

Pattern fill initially supports standard-library generators with compact parameter sets:

- Hilbert;
- Truchet;
- hitomezashi;
- seigaiha;
- asanoha;
- herringbone.

Directional fill initially supports:

- fixed angle/grid;
- radial from an editable center;
- curl noise with editable scale;
- reporter from the existing program in Append mode;
- generated reporter scaffold.

Use standard-library configured closures such as `griddir`, `radialdirfrom`, and `curldirwith`
instead of generating bespoke procedure definitions when possible.

### 5.5 Deferred explicit recipes

Implement after the initial recipe set:

- rail-pair satin;
- motif along path;
- appliqué steps;
- thread blend;
- stipple;
- gradient bands.

Rail-pair satin is created by selecting exactly two compatible open paths and choosing “Pair as
satin rails.” It produces one relation operation referencing both geometries. Do not auto-pair paths
by proximity. Optional checkpoints are a later enhancement and should use authored/editable points.

Motif along path should emit a standard-library layout and a reusable motif procedure/path. It must
not expand every placement into anonymous generated coordinates.

## 6. Target architecture

### 6.1 Module boundary

Keep platform-neutral geometry, model, recipe, routing, and emission logic under `src/lib/`.
Move DOM-dependent SVG parsing out of the publishable core.

Recommended target layout:

```text
src/svg-import/
  parse-svg-dom.ts              DOMParser adapter and SVG tree walk
  import-policy.ts              quick-import defaults

src/lib/svg/
  svg-path.ts                   existing pure path/transform helpers
  geometry.ts                   compound regions and metrics
  model.ts                      source geometry, operations, document model
  recipes.ts                    recipe catalogue and schemas
  emit.ts                       dependency-aware NeedleScript emitter
  thread-map.ts                 color parsing and thread mapping
  ordering.ts                   source/depth/color/group order

src/components/svg-staging/
  ...                           staging UI and immutable actions
```

Names may be adjusted to minimize churn, but `DOMParser` must not remain in a platform-neutral
library module. The legacy `src/lib/svg-importer.ts` should be removed after Quick import is switched
to the canonical pipeline.

### 6.2 Source model

The following types are illustrative contracts, not copy-paste requirements. Preserve the concepts
even if exact names change.

```ts
type SourceGeometryKind = 'path' | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon';

type GeometryOutputMode = 'semantic' | 'curve' | 'path' | 'compact';

interface SourceGeometry {
  id: string;
  sourceObjectId: string;
  name: string;
  kind: SourceGeometryKind;
  groupPath: string[];
  paths: Point[][]; // hoop-space logical geometry
  curveSpecs?: SvgCurveSpec[]; // when faithfully available
  primitive?: PrimitiveDescriptor; // original semantic parameters when available
  closed: boolean[]; // per path, never inferred from only the first path
  bbox: BBox;
  outputMode: GeometryOutputMode;
  flags: GeometryFlags;
}
```

Important rules:

- mixed open and closed SVG subpaths must not share a single `geomType` classification;
- a geometry may be referenced by multiple operations;
- all stored coordinates and physical widths are hoop-space millimetres;
- retain source semantic descriptors before flattening;
- geometry simplification must preserve explicit closure and curve availability.

### 6.3 Paint and source-object model

```ts
interface SourcePaint {
  fill: string | null;
  fillGradient: SvgLinearGradient | null;
  stroke: string | null;
  strokeWidthMM: number | null;
  fillRule: 'nonzero' | 'evenodd';
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  dashArrayMM: number[] | null;
  dashOffsetMM: number;
  visible: boolean;
}

interface SourceObject {
  id: string;
  name: string;
  geometryId: string | null;
  groupPath: string[];
  sourceIndex: number;
  paint: SourcePaint;
  unsupportedReason?: string;
}
```

Common presentation attributes should be resolved through inheritance. Complex stylesheet
selectors may remain unsupported initially, but must generate a visible import finding rather than
silently defaulting to black.

### 6.4 Operation model

```ts
type OperationRole = 'fill' | 'stroke' | 'guide' | 'relation';

interface ImportOperation {
  id: string;
  sourceObjectId: string;
  geometryIds: string[];
  name: string;
  role: OperationRole;
  recipe: Recipe;
  thread: ThreadSelection | null;
  order: number;
  include: boolean;
  findings: OperationFinding[];
}
```

Derivation rules:

- a visible fill creates a fill operation when closed fillable geometry exists;
- a visible stroke creates a stroke operation;
- fill and stroke operations reference the same geometry and initially preserve source adjacency;
- a line never creates a fill operation;
- unsupported source objects remain visible as findings; they do not fabricate empty stitch
  operations;
- Guide only is a recipe/role transition that retains geometry;
- relation operations reference two or more geometries and own their recipe parameters.

### 6.5 Recipe union

Use a discriminated union. Avoid an open `Record<string, unknown>` as the source of truth.

```ts
type Recipe =
  | { kind: 'skip' }
  | { kind: 'guide'; params: GuideParams }
  | { kind: 'running'; params: RunningParams }
  | { kind: 'satinAlong'; params: SatinAlongParams }
  | { kind: 'tatami'; params: TatamiParams }
  | { kind: 'gradient'; params: GradientParams }
  | { kind: 'directional'; params: DirectionalParams }
  | { kind: 'contour'; params: ContourParams }
  | { kind: 'spiral'; params: SpiralParams }
  | { kind: 'pattern'; params: PatternParams }
  | { kind: 'railPair'; params: RailPairParams }; // deferred UI
```

Recipe definitions provide:

```ts
interface RecipeDefinition<K extends Recipe['kind']> {
  kind: K;
  label: string;
  eligible(operation: ImportOperation, model: StagedDocument): boolean;
  controls: ParamControl[];
  validate(operation: ImportOperation, model: StagedDocument): OperationFinding[];
  emit(operation: ImportOperation, context: RecipeEmitContext): CodeFragment;
}
```

Every control key must correspond to a typed recipe parameter and be observed by `emit` or
`validate`. Tests must exercise every control at a non-default value.

### 6.6 Parameter exposure

Recipe parameters need a distinction between staged value and emitted customizer parameter:

```ts
interface EmittableParam<T> {
  value: T;
  expose: boolean;
  emittedName?: string;
}
```

The initial UI can show an “Expose in Customizer” toggle beside high-value controls. When exposed,
emit a named top-level `let` with the appropriate annotation and use the name in recipe code.

Recommended default exposure:

- Replace mode: palette, plus at most a few document-wide or shared recipe parameters;
- Append mode: off unless explicitly selected, to minimize namespace pollution;
- bulk-edited operations may share one emitted parameter when their staged values are linked;
- per-operation parameters remain literals unless exposed.

Do not automatically expose every fill spacing, angle, and stitch length in a large SVG.

## 7. Parsing and normalization

### 7.1 Parse stages

Use explicit stages:

```text
SVG DOM
  -> normalized source objects with inherited presentation
  -> transformed hoop-space geometry and physical widths
  -> compound-region normalization
  -> source geometry + paint operations
  -> default recipe policy
  -> StagedDocument
```

Do not choose embroidery construction while walking the DOM.

### 7.2 SVG feature support for the first milestone

Required:

- path commands M/L/H/V/C/S/Q/T/A/Z, absolute and relative;
- rect including `rx`/`ry`;
- circle, ellipse, line, polyline, polygon;
- nested groups and transforms;
- inline `style` and presentation attributes for fill, stroke, stroke-width, fill-rule;
- `display`, `visibility`, and zero opacity sufficient to skip invisible geometry;
- stroke line cap, line join, dash array, and dash offset metadata;
- source object IDs/classes for naming;
- same SVG paint defaults as the specification: black fill, no stroke.
- opaque `<linearGradient>` fills with 2–8 stops, local `href` inheritance,
  `objectBoundingBox`/`userSpaceOnUse`, `gradientTransform`, and the default `pad` spread method.

Deferred with explicit findings:

- stylesheet selector evaluation beyond simple inline/presentation inheritance;
- `<use>` and `<symbol>` expansion;
- clip paths and masks;
- radial gradients, gradient strokes, repeating/reflecting gradients, transparent gradient stops,
  and patterns beyond an explicit representative-color fallback chosen by the user;
- markers;
- text and tspans;
- embedded images;
- filters and foreign objects.

Never silently convert an unknown paint to black. An unknown paint must create a finding and require
mapping or skipping.

### 7.3 Compound regions

Normalize fill semantics into one or more NeedleScript-compatible even-odd compound regions.

Requirements:

- even-odd source fills follow nesting parity;
- nonzero source fills account for winding accumulation;
- disjoint outer rings remain supported;
- nested solid islands remain solid by being represented in a compatible compound structure or a
  separate operation;
- manual Hole/Solid edits update normalized geometry, preview, area, and emission;
- self-intersections generate a finding and use a documented fallback; do not claim exact nonzero
  behavior for an ambiguous self-intersecting path without normalization support.

Prefer using existing platform-stable region boolean operations where practical. Keep normalization
pure and covered by topology tests.

### 7.4 Default recipe policy

Use conservative defaults:

- closed visible solid fill -> Tatami fill;
- closed visible supported linear gradient -> SVG gradient fill;
- open stroke with unknown or very narrow physical width -> Running line;
- stroke with known width in a safe satin range -> Satin along path;
- stroke wider than the safe satin range -> Running line plus a warning/suggestion, not unsafe satin;
- open path -> Running line;
- degenerate or too-short geometry -> Skip with finding;
- unsupported source object -> finding only;
- filled thin region -> Tatami plus a “consider contour or explicit rail satin” suggestion, not
  automatic rail extraction.

Preserve current defaults where they do not conflict with these rules, but remove the heuristic that
treats an arbitrary thin filled outline as a reliable satin spine.

Quick import uses this policy and commits immediately. Import with options lets the user change it.

## 8. Geometry emission

### 8.1 Shared bindings

Emit each included geometry at most once even when fill, stroke, and guide operations share it.
Names are derived from source names, sanitized against all NeedleScript reserved and existing names,
and made deterministic with numeric suffixes.

Example:

```needlescript
let badge_spec = [...] // [curve: closed]
let badge = curveflat(badge_spec, 0.1, 'closed')
```

Both a fill block and an outline block may reference `badge`.

### 8.2 Curves

Editable curves represent logical geometry:

```needlescript
let leaf_spec = [...] // [curve: closed]
let leaf = curveflat(leaf_spec, 0.1, 'closed')
```

Do not use global `curvepath(..., resampleMM)` as the only representation. A running recipe may sew
`resample(leaf, stitch_mm, 0, 'closed')`; a fill recipe should consume `leaf` as a boundary.

### 8.3 Paths

Editable path mode emits the source/simplified logical vertices and an annotation:

```needlescript
let route = [...] // [path]
let region = [...] // [path: closed]
```

Compact mode omits the annotation and may use stronger simplification, while preserving topology
and a per-document error tolerance.

### 8.4 Semantic primitives

Deduplicate imports and use short stable aliases:

```needlescript
import std.shapes.roundrect as roundrect

let panel = xlate(roundrect(36, 20, 3), 5, -2)
```

Use functional `xlate`, `xrotate`, `xscale`, and `xmirror` expressions where they remain readable.
Fall back to curves or paths for arbitrary affine transforms that cannot be represented faithfully.

### 8.5 Guides

Guide-only operations emit chalk after geometry declarations:

```needlescript
chalk construction_axis 'construction axis' 'line'
```

Guides must remain visible in the normal playground after commit, remain absent from machine export,
and not affect stitch statistics.

## 9. Recipe emission

### 9.1 Running line

Emit explicit state setup and restore state that would otherwise leak unexpectedly:

```needlescript
stitchlen 2.5
up setpos(first(route)) down
sewpath(route)
trim
```

Bean and E-stitch variants arm and disarm their sticky modes. Dashed running lines use `dashes` and
route the resulting path fragments without baking dash coordinates into the source.

Source `stroke-dasharray` and dash offset seed the controls after conversion to hoop millimetres.

### 9.2 Satin along path

Use the source path as the spine and source physical stroke width as the initial width. Emit density,
underlay, short-stitch, and other supported settings exactly once around the operation. Warn outside
the recommended 2–8 mm range and never silently clamp a very wide source stroke into a different
visual intent.

### 9.3 Tatami fill

Emit the normalized compound region. Keep fill spacing, angle, stitch length, and underlay distinct
from geometry tolerance. Ensure multiple disjoint outers and holes compile correctly.

### 9.4 Directional fill

Represent the field source as a discriminated parameter:

```ts
type DirectionField =
  | { kind: 'grid'; angle: EmittableParam<number> }
  | { kind: 'radial'; center: EmittableParam<Point> }
  | { kind: 'curl'; scale: EmittableParam<number> }
  | { kind: 'existingReporter'; name: string }
  | { kind: 'scaffold'; name: string };
```

Standard presets emit imports and configured closures. A scaffold must be active runnable code, not
three commented lines that result in an empty operation. Existing reporters are available only when
the preview/commit mode includes the base program.

### 9.5 Contour and spiral fills

Use core helpers directly:

```needlescript
fill paths contourpaths(region, contour_gap)
beginfill
  sewpath(region)
endfill
```

```needlescript
fill paths spiralpath(region, spiral_gap)
beginfill
  sewpath(region)
endfill
```

The UI exposes gap and applicable underlay/pull-compensation controls, not the resulting individual
paths.

### 9.6 Pattern fills

Use standard-library generators and deduplicate imports. One Pattern fill recipe owns a typed
variant union so each pattern exposes only relevant controls. For example, seigaiha exposes radius;
hitomezashi exposes cell size and row/column bit lists.

Returned paths remain generated at runtime from the editable region. Do not emit their clipped point
fragments as literals.

### 9.6.1 SVG linear gradient fill

Preserve an authored opaque `<linearGradient>` as a density-neutral 2–8 thread recipe. Store its
resolved hoop-space start/end vector and ordered stop colors on the source paint and fill operation.
The default strategy emits `std.stitchcraft.gradientrowsn` plus `serpentinerows`; adjacent SVG stops
become piecewise-linear channel weights, while every candidate row belongs to exactly one channel.

The aggregate row pitch and within-row stitch length are independent staged controls. SVG stop
offsets and the resolved vector remain authored geometry, including local `href` inheritance,
`objectBoundingBox`/`userSpaceOnUse`, element transforms, and `gradientTransform`. Replace mode maps
each stop through the document thread map. Append mode emits stop color literals and reuses compatible
existing imports.

Do not lower radial gradients, gradient strokes, transparent stops, or `repeat`/`reflect` spread to
linear rows. Retain them as explicit `unsupported-paint` findings until matching density-neutral
construction recipes exist.

### 9.7 Rail-pair satin

Emit `satinbetween(railA, railB, ...)` from an explicit relation operation. Preserve source rail
directions and let NeedleScript's rail pairing perform its documented deterministic orientation and
seam handling. Do not precompute the resulting zigzag stitches.

Implemented interaction: select exactly two included, single-path source operations and choose
**Create relationship → Pair as satin rails**. Both paths must be open. Creating the relation disables
the standalone source operations but does not delete them, and the new operation owns density,
underlay, and short-stitch controls. No proximity search runs during parsing or staging.

### 9.8 Motif along path

Select the route first and the reusable motif second, then choose **Create relationship → Repeat
second as motif along first**. Emission imports `std.layout.alongpath`, centers the authored motif,
and retains a readable placement procedure composed from `xscale`, `xrotate`, `xlate`, `resample`,
and `sewpath`. Count, scale, stitch spacing, and path-heading alignment remain recipe parameters;
placement coordinates are never expanded into literals.

### 9.9 Stable embroidery construction integration

Implemented in embroidery-results Session 9.2. The staging model exposes only settings backed by
the shared runtime registries and physical bounds:

- Tatami fills expose a 0–10 mm `fillinset` control labeled as the explicit overlap reservation for
  a later satin border. The importer never derives it from neighboring paint or stroke width.
- Satin borders and rail-pair satin expose the registered underlay, cap, and join policies. Tatami
  and directional fills expose the registered fill-underlay policies. Each construction body is
  emitted inside `stitchscope`, so an operation's sticky settings do not leak into its siblings.
- Operations whose recipe emits no helper declarations or color changes may opt into `atomic`.
  Helper-declaring and multi-color recipes keep the control disabled because they cannot satisfy the
  current atomic contract safely. Any operation may request a `planbarrier` immediately before it.
- Replace-mode group preservation emits one `routegroup` per top-level SVG group/source fallback and
  a `planbarrier` between groups. Append mode emits the barriers but not new route groups, avoiding a
  change that would make an existing base program's previously ungrouped runs ineligible.
- Replace mode emits the selected `fabric`, generic `threadprofile`, and optional travel `plan` once
  in the preamble. Append mode disables those controls and inherits the base program's setup.

The parser seeds neutral defaults (`polyester-40wt`, plan off, no atomic or manual barriers). It does
not infer fabric grain/stretch, stabilizer, topping, wide-column splitting, directional
compensation, satin branching, or machine calibration. The staged preview continues to compile the
exact replacement or merged append source through the normal compiler worker before commit.

## 10. Color behavior

### 10.1 Staging color policies

Support two policies:

- **Preserve source colors**: use normalized SVG colors as the initial program palette.
- **Map to threads**: map source colors to user-selected thread colors; preserve the source-to-thread
  mapping in the staged document.

Use native NeedleScript color parsing and OKLab color helpers where available rather than the current
squared-RGB match. If a deliberate thread chart/palette has its own matching contract, make that
policy explicit.

### 10.2 Replace-mode output

Replace mode may emit an editable palette:

```needlescript
let imported_inks = ['#315c45', '#f4d35e'] // [palette]
palette imported_inks
```

Operations should select colors through readable bindings or palette entries, not unexplained slot
numbers where practical.

### 10.3 Append-mode output

Append mode must not add a late `palette` directive after existing stitches. Prefer color literals
for imported operations:

```needlescript
color '#315c45'
```

This lets the runtime resolve or append a thread slot without invalidating top-level directive order.
If the base program already exposes a palette and a selected imported color maps to it, using the
existing palette binding is an optional later enhancement.

Gradients and patterns require an explicit representative color choice or Skip/Guide. A gray fallback
must be labeled as a fallback and never happen silently.

## 11. Replace, append, and preview contracts

### 11.1 Replace mode

Replace emission produces a self-contained program:

- imports;
- provenance header;
- optional seed, hoop/field-compatible setup, fabric, palette, background, and travel plan;
- exposed parameters;
- shared geometry declarations;
- guide statements;
- sew operations.

The staged preview compiles exactly this program.

### 11.2 Append mode

Append emission produces a mergeable fragment:

- imports required by the fragment;
- collision-free declarations;
- guide statements;
- sew operations;
- no new `seed`, `fabric`, `palette`, `background`, `hoop`, or `plan` directive by default.

The staging hook receives the current base source and compiles the merged program. Existing reporters
are therefore available.

Define a small merge result instead of returning only a string:

```ts
interface EmitResult {
  imports: ImportRequirement[];
  preamble: string[];
  body: string[];
  sewSpans: Record<string, LineSpan>;
}
```

`renderReplace(result)` produces the self-contained source. `mergeAppend(baseSource, result)`:

1. inventories existing top-level imports and declared names using the NeedleScript tokenizer/parser
   or existing analysis utilities, not a procedure-only regex;
2. reuses compatible existing imports or selects unique aliases;
3. inserts new imports at a legal top-level location;
4. generates unique declaration names;
5. appends the body with a provenance divider;
6. returns final source and adjusted line spans.

If reliable source merging proves too large for the first migration commit, the acceptable temporary
append implementation is: omit all once-only setup, generate collision-resistant prefixed names,
prepend imports, compile the full merged source, and clearly report unsupported conflicts. Raw
concatenation of a replacement program is not acceptable.

### 11.3 Travel planning

Replace mode may emit `plan 'nearest'` or `plan 'reversing-nearest'` before stitches. Append mode:

- inherits an existing plan directive;
- may not append a new plan directive after stitches;
- disables a conflicting selection unless the merge layer can safely modify the existing preamble.

Explicit trims may remain between imported motifs. Planning can still reorder eligible atomic runs,
subject to NeedleScript's documented color and run constraints.

### 11.4 Commit gating

Disable Insert as code when:

- compilation failed;
- a required recipe dependency is unresolved;
- a selected existing reporter is unavailable in the chosen mode;
- region topology cannot be lowered safely;
- no included stitch or guide operation remains.

Show the compile/import error in the dialog with a link to the responsible operation when known.

## 12. Ordering and groups

Store both source order and sew order.

Ordering modes:

- **SVG order**: preserve painter order; a source object's fill precedes its stroke.
- **Depth**: larger fill areas before smaller details, with deterministic source-order ties.
- **Color**: group operations by mapped thread, with deterministic source/depth ties.
- **Manual**: user-controlled order.

When Keep groups is active:

- treat a chosen group boundary as an indivisible ordering unit;
- preserve operation order within each group unless the user manually edits it;
- use full `groupPath`, not only the innermost group;
- keep fill/stroke siblings adjacent by default.

Specify whether the grouping boundary is top-level SVG group or nearest named group. Recommended first
implementation: top-level group below `<svg>`, falling back to the source object when ungrouped.

Travel planning is independent from staging order. The UI must explain that planning can reorder
eligible same-color runs after authored execution.

## 13. Validation and findings

Replace loose boolean flags with typed findings where practical:

```ts
interface OperationFinding {
  code: FindingCode;
  severity: 'info' | 'warning' | 'error';
  message: string;
  sourceObjectId?: string;
  operationId?: string;
  suggestedRecipe?: Recipe['kind'];
}
```

Required findings include:

- outside active field;
- zero-size or too-short geometry;
- open geometry assigned a fill recipe;
- self-intersection or ambiguous fill topology;
- unsupported element or paint;
- unsafe satin width;
- excessive stitch count or operation density;
- unknown or approximated color;
- missing reporter/dependency;
- source curve unavailable for editable-curve mode;
- import simplification budget exceeded;
- append conflict.

Map compiler warnings back to operation line spans after each preview compile. Where warning locations
identify an operation, show the finding on that row. The existing global density badge remains useful,
but `densityHot` must either be populated from actual results or removed.

The summary should show at least:

- operation count by recipe;
- colors/color changes;
- estimated stitches;
- stops and trims;
- travel before/after when planning is active;
- peak density;
- warnings and errors.

## 14. Performance and budgets

The staging dialog continues to debounce full emit-and-compile previews. Preserve correctness first,
then optimize if profiling shows a need.

Requirements:

- DOM parsing happens once per imported file;
- immutable staged updates must share unchanged geometry rather than deep-copying all points;
- scaling should be represented as a document/import transform where possible rather than repeatedly
  mutating every stored source coordinate;
- source and normalized geometry may be memoized by geometry ID and relevant tolerance;
- emitted code is deterministic for fixed SVG, settings, seed, and injected date;
- no `Math.random` in `src/lib/`; use the project seeded RNG for any future stochastic policy;
- respect interpreter geometry, list, operation, and stitch budgets;
- warn before committing code likely to exceed stock budgets.

The current 1,400-segment adaptive simplification cap may remain as an initial safety budget, but the
UI and model should distinguish source simplification from stitch count. Editable curves should not
be degraded merely to satisfy a flattened preview point budget when the runtime can flatten them.

## 15. Migration plan

Avoid a big-bang rewrite. Introduce the new model behind the existing dialog and switch consumers in
controlled steps.

### Milestone 0 — Baseline and fixtures

1. Add representative SVG fixtures before refactoring.
2. Snapshot current quick and staged results where behavior is intentionally retained.
3. Add failing/targeted tests for known correctness gaps.
4. Record current compile results and stitch-event characteristics for simple line, primitive, path,
   fill, fill+stroke, holes, transforms, and multicolor cases.

Deliverable: tests describe the migration contract and known intended behavior changes.

### Milestone 1 — Canonical source and operation model

1. Move the DOM-dependent adapter outside `src/lib/`.
2. Parse `SourceObject`, `SourceGeometry`, physical paint metadata, and nested group paths.
3. Derive distinct fill and stroke operations.
4. Normalize compound fill topology and manual ring decisions.
5. Pass active hoop/field information into fit and validation.
6. Adapt the existing six strategy behaviors to the new recipe union without adding new recipes.
7. Update staging actions and list selection for operation IDs and shared geometry.

Deliverable: current UX on the canonical model, with fill+stroke and compound regions correct.

### Milestone 2 — Dependency-aware emitter and safe modes

1. Add structured `CodeFragment`/`EmitResult` emission.
2. Deduplicate geometry and imports.
3. Separate geometry tolerance from recipe spacing.
4. Implement self-contained Replace emission.
5. Implement merge-aware Append emission and full-program append preview.
6. Surface compile errors and gate commit.
7. Switch Quick import to the canonical default policy.
8. Remove `src/lib/svg-importer.ts` after parity/intentional-change tests pass.

Deliverable: one parser/model/emitter pipeline for both import paths.

### Milestone 3 — Editable and semantic geometry

1. Add per-geometry output modes.
2. Emit editable curves with `curveflat`.
3. Emit editable `[path]` controls.
4. Emit semantic rectangles, rounded rectangles, circles, and ellipses when faithful.
5. Add color-policy and editable palette output.
6. Add parameter exposure controls.

Deliverable: generated code preserves recognizable SVG geometry and useful customizer controls.

### Milestone 4 — High-value generative recipes

1. Add Guide only.
2. Add Contour fill and Spiral fill.
3. Add Pattern fill with standard-library texture generators.
4. Replace the current directional-fill scaffold with built-in closure presets and working scaffolds.
5. Add SVG dash metadata to Running line.
6. Add travel-plan control with append restrictions.

Deliverable: the importer materially uses recent NeedleScript features without digitizer behavior.

### Milestone 5 — Explicit relationships and semantic embroidery recipes

1. Add explicit rail-pair operations and `satinbetween` emission.
2. Add motif-along-path.
3. Add explicit appliqué, stipple, thread-blend, and radial-gradient recipes based on validated
   demand. Linear SVG gradients already use the density-neutral gradient-row recipe.
4. Add optional shared procedure extraction for source groups.

Deliverable: advanced generative constructions based on authored relationships.

### Milestone 6 — SVG interoperability and polish

1. Add `<use>`/`symbol` expansion.
2. Add common clip-path support if it can be normalized faithfully.
3. Improve stylesheet handling.
4. Map density and compiler findings to operations.
5. Add accessible keyboard flows for source/operation hierarchy and relation creation.
6. Update README, tutorial, book chapter, and relevant architecture documentation.

## 16. Test plan

### 16.1 Pure geometry and parsing tests

Cover:

- every supported basic shape;
- rounded rectangles;
- every SVG path command, including multiple subpaths;
- relative commands and repeated command arguments;
- nested transforms including nonuniform scale and rotation;
- physical stroke-width conversion after transform and import fit;
- inherited fill, stroke, fill-rule, and visibility;
- fill+stroke operation derivation;
- nested group paths;
- mixed open/closed subpaths;
- even-odd and nonzero rings with same/opposite winding;
- disjoint regions, nested islands, and manual hole overrides;
- self-intersection findings;
- dash arrays and offsets;
- unsupported element and paint findings;
- active round, oval, and rectangular fields.

### 16.2 Recipe tests

For every recipe:

- eligibility accepts and rejects the correct operation shapes;
- defaults are physically plausible;
- every control changes emitted code or validation;
- sticky modes are restored/disabled correctly;
- imports are declared exactly once;
- shared geometry is declared exactly once;
- emitted code runs through the real interpreter;
- output is deterministic;
- expected warnings are mapped to the operation.

Specific integrations:

- fill plus outline both appear and preserve order;
- guide emits chalk and zero stitches;
- contour/spiral/pattern fills remain runtime-generative;
- directional standard-library closures compile in Replace mode;
- existing reporter compiles only in Append mode with the base source;
- rail-pair satin references the two authored rails and emits no baked zigzag points.

### 16.3 Emitter and merge tests

Cover:

- reserved and duplicate SVG IDs;
- duplicate geometry names across groups;
- alias conflicts with existing imports;
- variable/procedure conflicts in Append mode;
- existing seed/fabric/palette/plan directives;
- append into an empty program and a stitched program;
- exact mode-dependent preamble behavior;
- stable line-span mapping after import insertion;
- color literals in Append mode;
- palette customizer output in Replace mode;
- deterministic output with injected date.

### 16.4 UI tests

Cover:

- fill and stroke child-operation selection;
- bulk recipe assignment with mixed eligibility;
- group-preserving order;
- geometry output override;
- thread remapping across operations;
- Replace/Append preview changes;
- commit disabled on compilation error;
- finding selection focuses the responsible row;
- keyboard recipe shortcuts after the recipe set grows;
- selecting exactly two paths enables rail pairing when implemented.

### 16.5 Golden fixtures

Add small hand-authored fixtures under a dedicated test fixture directory. Include at least:

- `fill-and-stroke.svg`;
- `compound-evenodd.svg`;
- `compound-nonzero.svg`;
- `nested-groups.svg`;
- `curves-and-arcs.svg`;
- `rounded-primitives.svg`;
- `dashed-strokes.svg`;
- `mixed-subpaths.svg`;
- `unsupported-paints.svg`;
- `linear-gradient.svg`;
- `rail-pair.svg` for the deferred milestone.

Prefer small readable fixtures over exported application SVGs containing unrelated metadata.

## 17. Acceptance criteria by release slice

### Foundation slice

- Quick and options import use one canonical parser/model/emitter.
- A source object with fill and stroke produces two visible, emitted operations.
- `evenodd` and `nonzero` fixture topology matches expected filled regions.
- manual Hole/Solid changes alter compiled geometry, not only labels.
- Keep groups affects automatic ordering.
- active non-round hoop fields validate correctly.
- no visible control is a no-op.
- Replace and Append previews compile the exact source that will be committed.
- Append does not duplicate illegal once-only directives or collide with known names.
- all full project tests, lint, formatting, app build, and library checks pass.

### Generative recipe slice

- Guide, contour, spiral, pattern, and directional presets emit readable high-level code.
- editable curve output uses `[curve]` plus `curveflat` for logical geometry.
- editable path output uses `[path]` annotations.
- pattern recipes call standard-library generators rather than baking generated fragments.
- colors are readable/customizable in Replace mode and safe in Append mode.
- travel planning is available only where it can be emitted legally.
- emitted programs remain understandable without knowledge of the staging model.

### Relationship slice

- the user explicitly creates a rail-pair operation from two paths;
- generated code uses `satinbetween` and retains both rail bindings;
- no automatic path-proximity pairing or stitch-level satin generation occurs;
- motif-along-path remains expressed as path/layout/procedure composition.

## 18. Documentation updates required during implementation

Update documentation in the same milestone that changes behavior:

- `README.md`: supported SVG features, Quick/options behavior, and generated-code examples;
- `needlescript-tutorial.md`: SVG import workflow and generative handoff;
- `src/book/content/part-10/ch-60.mdx`: replace placeholder import content when the feature stabilizes;
- `needlescript-standard-library-reference.md` only if library APIs change;
- language/interpreter/machine architecture documents only when their covered modules change;
- this document when implementation decisions differ materially from the proposed contracts.

Do not describe unsupported SVG features as supported merely because they are skipped without error.

## 19. Verification commands

Use the repository-managed Node version before implementation work:

```sh
nvm use
```

During focused work:

```sh
npm test -- src/lib/__tests__/svg-staging.test.ts
npm run lint
```

Before completing each milestone:

```sh
npm test
npm run lint
npm run build
npm run build:lib
npm run check:lib
npx prettier --check .
npm run doctor
```

Run React Doctor after staging component changes and address regressions in edited code.

## 20. Recommended first implementation session

The first session should implement only the foundation needed to remove architectural ambiguity:

1. Add fill+stroke, fill-rule, group, append, and hoop fixtures/tests.
2. Introduce `SourceObject`, shared `SourceGeometry`, and separate `ImportOperation` concepts.
3. Move DOM parsing to the app-side import boundary.
4. Derive fill and stroke operations while adapting existing recipes without adding new ones.
5. Correct compound-region lowering.
6. Make Replace preview and commit pass on the new emitter.
7. Keep Append temporarily disabled in the new path until it compiles the full merged source safely.

Do not begin with texture presets or rail pairing. Once the foundation tests pass, the high-level
recipes become small, reviewable additions instead of special cases inside an overloaded element
model.

## 21. Final design test

For every proposed importer feature, ask:

> Does this preserve or expose a useful vector/construction idea in the generated NeedleScript, or
> does it merely hide a digitizing decision behind the dialog?

If the result is a named path, parameter, standard-library call, reusable procedure, explicit
relationship, or clear construction recipe, it belongs. If the result is an opaque list of finalized
penetrations or an inferred embroidery structure the user did not author or choose, it does not.
