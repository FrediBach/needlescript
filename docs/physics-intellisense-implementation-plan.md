# PhysicsIntellisense Implementation Plan

Status: **PI-4 complete** (2026-07-21) — editor analysis now has revision-aware
current/stale/checking/blocked lifecycle state, 500 ms background checks, a coalescing priority
queue, and drag suspension with one commit-time run. Preview-overlay legibility remains an explicit
PI-7 implementation risk.

Last updated: 2026-07-21

| Session | Status      | Exit gate                                                               |
| ------- | ----------- | ----------------------------------------------------------------------- |
| PI-0    | Complete    | Product owner approved the contract and prototype concept on 2026-07-21 |
| PI-1    | Complete    | Unified catalog/types shipped without freezing overlay presentation     |
| PI-2    | Complete    | Editor analysis is independent from source-selected preflight policy    |
| PI-3    | Complete    | Rich source, geometry, construction, and playback attribution shipped   |
| PI-4    | Complete    | Revision lifecycle, background analysis, and priority queue shipped     |
| PI-5–11 | Not started | Follow the dependency and acceptance gates documented below             |

PhysicsIntellisense is a unified, always-available analysis layer across the editor, stage, and
playback—not a renamed or enlarged preflight panel.

The existing `preflight 'off'|'warn'|'strict'` command should remain the program’s portable export policy. PhysicsIntellisense should run independently in the playground, without requiring users to modify their program.

## What already exists

The engine is much closer to this feature than the current UX suggests:

- Structured diagnostics already have severity, stable codes, points, source lines, construction IDs, and suggestions in [types.ts](/Users/fredibach/Projects/needlescript/src/lib/core/types.ts:38).
- Event-stream checks already detect short-stitch clusters, reversals, near-hole penetrations, long sewn floats, long jump chains, continuous runs, and sharp-turn clusters.
- Construction metadata already identifies fill/satin regions, layers, connectors, and split lanes.
- Density analysis provides coverage cells, peaks, and hotspots.
- Monaco has compiler-error markers and line-to-stitch mapping.
- The stage can display warning markers and line bounds.
- Playback can highlight source-line intervals.
- A preflight panel already groups issues by severity and code in [PreflightPanel.tsx](/Users/fredibach/Projects/needlescript/src/components/PreflightPanel.tsx:12).

The primary shortcomings are fragmentation and information loss:

- Legacy physical warnings appear both in the console and preflight panel.
- Extended diagnostics only run when source selects `preflight 'warn'` or `'strict'`.
- Some spatial warnings remain plain strings because `fill` locations are not converted into structured issues.
- The app adds a second, weak average-density heuristic based on stitches divided by bounding-box area in [App.tsx](/Users/fredibach/Projects/needlescript/src/App.tsx:506).
- Structured issues lose their category when the app converts them all to `WarningLocation.kind = 'fill'`.
- Monaco only shows compile errors, not physics findings.
- Canvas markers are points only; they cannot show affected segments, regions, density cells, or construction envelopes.
- Playback highlights every event attributed to a source line rather than the actual problematic event interval.
- There is no measured value/threshold model, evidence quality, stable occurrence identity, documentation link, or structured fix.

## Product principles

1. **Explain, locate, and guide.** Every finding should answer: what happened, where, why it matters, and what the user can try.

2. **Do not claim simulation.** This is conservative diagnostic analysis, not finite-element fabric simulation. The clean state should say “No modeled risks found,” not “Safe to sew.”

3. **Separate severity from evidence.** A serious heuristic and a hard machine-limit violation are different things. Show both severity and basis.

4. **Never hide uncertainty.** Material-neutral thresholds should be labeled as generic. Sew-out-backed rules should name the applicable profile.

5. **Keep analysis stitch-inert.** PhysicsIntellisense may inspect events and metadata but never modify the stitch stream.

6. **Do not recommend silencing first.** Suggestions should address construction. Raising `maxdensity`, disabling checks, or removing material intent must not be the default remedy.

7. **Avoid unsafe auto-fixes.** Quick fixes should be offered only when a deterministic source edit is narrow, previewable, and reversible.

## Product contract

### Vocabulary

The following terms are user-facing and normative. Engine and UI work in later sessions should not
invent synonyms without updating this contract.

| Term               | Meaning                                                                                                                                               | UI rule                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Finding**        | Neutral umbrella term for one modeled observation.                                                                                                    | Use for counts and generic navigation.                                                            |
| **Blocker**        | A finding with `error` severity: the selected machine cannot perform the result, the geometry is physically unreachable, or an enforced policy fails. | Red, first in navigation. It may block strict export, but never edits stitches automatically.     |
| **Risk**           | A finding with `warning` severity: the design is likely to sew poorly or deserves review.                                                             | Amber. Do not describe it as a guaranteed failure.                                                |
| **Note**           | A finding with `info` severity: context, operator action, or a non-failing recommendation.                                                            | Muted and filterable. Never promote it merely because strict preflight is active.                 |
| **Evidence**       | Why a check is credible: hard limit, machine profile, engine-derived measurement, generic heuristic, or experimental model.                           | Show a short label by default; keep methodology and threshold provenance in expanded details.     |
| **Assumption**     | Material or machine context substituted because the program or caller did not specify it.                                                             | Show once in the report context row, not as repeated findings.                                    |
| **Acknowledgment** | A user's recorded decision that an understood non-blocking finding is intentional.                                                                    | Remains visible and countable through a filter; it is not the same as fixing or deleting a check. |
| **Remedy**         | A construction-oriented action that may reduce a finding.                                                                                             | Lead with safe construction changes, not threshold suppression.                                   |

The word **safe** is forbidden in clean-state and summary copy unless it refers to a literal,
documented machine limit. The approved clean-state sentence is:

> Physics checks complete — no modeled risks found for the selected material and machine
> assumptions. A physical test sew-out is still recommended.

### Analysis and policy boundary

- PhysicsIntellisense is a caller-selected editor analysis service and is available without source
  changes.
- `preflight 'off'|'warn'|'strict'` remains portable source policy for reporting and export gates.
- A diagnostic can appear in the editor even when source preflight is `off`; this never makes it a
  strict failure.
- Analysis is stitch-inert. Selecting, filtering, acknowledging, or inspecting a finding cannot
  change events, warnings, exports, or RNG state.
- A blocked analysis caused by invalid source is not a clean report. The UI says “Waiting for a
  valid design” and gives compiler diagnostics priority.

### Interaction contract

- One `selectedDiagnosticId` and one `hoveredDiagnosticId` coordinate the panel, Monaco, stage, and
  playback.
- Ordinary selection reveals source and geometry but never moves playback. “Inspect sew order” is
  the explicit action that moves the scrubber.
- Contextual overlays are temporary. Inspecting density cannot change the user's persistent heatmap
  preference.
- Source edits make the report stale immediately. A stale report is labeled and can be inspected,
  but it cannot display a clean/current status.
- Findings are grouped by user concept. Stable diagnostic codes are available in details and copied
  reports, not used as primary titles.
- Severity is never communicated by color alone; icon/shape and text accompany every severity.

### PI-0 decisions

These decisions were approved through product-owner prototype validation and are **locked for PI-1
implementation**. Reopen one only when integrated usability evidence shows a concrete failure.

1. **Desktop uses a Console/Physics bottom-panel tab.** A permanent side inspector would reduce the
   editor or stage width and duplicate the existing debugging surface.
2. **Only a newly introduced blocker may auto-open Physics.** Risks and notes update the badge
   without stealing focus. Once the user manually closes the blocker, recompiles with the same
   fingerprint do not reopen it.
3. **Mobile uses a three-state bottom sheet: collapsed summary, half-height list, full-height
   detail.** An inline accordion would push either the editor or stage out of context. The sheet is
   never expanded automatically for risks or notes.
4. **Evidence is progressively disclosed.** The evidence label and measured value/threshold are
   visible on each card; calculation method, provenance, and limitations live in expanded details.
5. **Clean results retain a sew-out caveat.** The product never equates an empty modeled report with
   a guarantee of physical success.

The prototype's overlay appearance is deliberately **not** a locked decision. Product-owner review
found the preview overlays difficult to judge in mock form. Their usefulness depends on real stitch
geometry, thread colors, zoom, heatmap state, and selection context that the isolated prototype
cannot reproduce faithfully. PI-1 must model semantic diagnostic data, not visual styling. PI-3
must preserve enough geometry for alternative renderings, and PI-7 owns iterative visual design and
validation on the production canvas.

### Open UX risks carried forward

| ID        | Risk                                                                  | Status   | Required resolution                                                               |
| --------- | --------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| PI-UX-001 | Preview overlays may be hard to distinguish from real stitch geometry | Open     | PI-3 supplies semantic geometry; PI-7 iterates and validates production rendering |
| PI-UX-002 | Broader clean-state and cross-surface comprehension is not yet tested | Deferred | Run the five-participant protocol as a PI-7 exit gate before default-on rollout   |

## Proposed core model

Add a new report rather than continually expanding `PreflightIssue`:

```ts
type DiagnosticGeometryRole =
  | 'hotspot'
  | 'boundary'
  | 'overlap'
  | 'travel'
  | 'envelope'
  | 'penetration-cluster'
  | 'unreachable-extent';

interface DiagnosticGeometryBase {
  role: DiagnosticGeometryRole;
  anchor?: { x: number; y: number };
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

type DiagnosticGeometry =
  | (DiagnosticGeometryBase & {
      kind: 'points';
      points: Array<{ x: number; y: number }>;
    })
  | (DiagnosticGeometryBase & {
      kind: 'polyline';
      points: Array<{ x: number; y: number }>;
      closed?: boolean;
    })
  | (DiagnosticGeometryBase & {
      kind: 'cell';
      x: number;
      y: number;
      width: number;
      height: number;
    })
  | (DiagnosticGeometryBase & {
      kind: 'region';
      rings: Array<Array<{ x: number; y: number }>>;
    });

interface PhysicsRemedy {
  id: string;
  title: string;
  description: string;
  kind: 'guidance' | 'source-edit' | 'context';
  documentationId?: string;
}

interface PhysicsAssumption {
  key: string;
  label: string;
  value: string;
  source: 'default' | 'program' | 'run-options';
  effect: string;
}

interface PhysicsDiagnostic {
  id: string;
  fingerprint: string;
  code: string;
  category:
    | 'coverage'
    | 'penetration'
    | 'stitch'
    | 'path'
    | 'travel'
    | 'satin'
    | 'fill'
    | 'underlay'
    | 'hoop'
    | 'machine'
    | 'material';

  severity: 'info' | 'warning' | 'error';
  evidence: 'hard-limit' | 'machine-profile' | 'engine-derived' | 'heuristic' | 'experimental';

  title: string;
  explanation: string;

  measurements?: Array<{
    label: string;
    value: number;
    unit: 'mm' | 'layers' | 'penetrations' | 'stitches' | 'degrees';
    threshold?: number;
    comparison?: 'above' | 'below' | 'outside';
  }>;

  sourceLocations: Array<{
    line: number;
    startColumn?: number;
    endColumn?: number;
    role: 'primary' | 'contributor' | 'related';
  }>;

  geometry: DiagnosticGeometry[];
  playbackRanges: Array<{ start: number; end: number }>;
  constructionIds?: number[];
  remedies: PhysicsRemedy[];
  documentationId?: string;
}

interface PhysicsReport {
  version: number;
  diagnostics: PhysicsDiagnostic[];
  assumptions: PhysicsAssumption[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
  profile: ResolvedMachineProfile;
  material: MaterialIntent;
  policy: PreflightMode;
}

// Playground-only lifecycle state, introduced in PI-4 rather than src/lib/.
interface PhysicsReportState {
  sourceRevision: number;
  reportRevision: number;
  status: 'checking' | 'current' | 'stale' | 'blocked';
}
```

`DiagnosticGeometry` should support points, segments/polylines, density cells, and regions. That unlocks much better stage feedback than the current crosshair/dot renderer.

The geometry contract describes hoop-space meaning, not appearance. Render colors, opacity, stroke
width, label placement, base-stitch dimming, and zoom behavior remain playground concerns. Likewise,
source revision and current/stale/checking state are caller lifecycle data and must not leak into the
platform-neutral `RunResult.physics` value.

The `fingerprint` should combine code, contributing lines/construction IDs, and quantized geometry. It gives the UI stable selection and acknowledgment across recompiles without treating array order as identity.

### Compatibility boundary

For the first release:

- Keep `RunResult.warnings`, `warningLocations`, and `preflight`.
- Add `RunResult.physics?: PhysicsReport` as an optional public property for minor-version and
  serialized-result compatibility, while `run()` populates it on every successful in-process run.
  Consumers must treat absence as “producer does not support PhysicsIntellisense,” not as a clean
  report.
- Build legacy warning and preflight shapes from the unified diagnostic observations where practical.
- Do not remove or reorder existing warning strings in a minor release.
- Mark the duplicate playground rendering path as deprecated internally.
- Consider public deprecation only in a future major library release.

## Precise UX proposal

### Physics panel

Replace the current embedded preflight list with a tabbed lower surface:

`Console | Physics 2 · 5`

The Physics tab should contain:

- A compact status header: “2 blockers, 5 risks, 3 notes.”
- Filters for severity, category, and “current selection.”
- A context/assumptions row, for example: “Generic thread width 0.4 mm · default machine profile · fabric unspecified.”
- Grouping by user concept, not diagnostic code.
- Cards showing:

  - Plain-language title.
  - Measurement: “4.8 layers; configured limit 3.5.”
  - Short risk explanation.
  - Source attribution.
  - Evidence label such as “Engine-derived” or “Generic heuristic.”
  - One or two prioritized remedies.
  - Secondary actions: Locate, Inspect sew order, Learn more.

Stable codes remain visible in details or copyable debug output, but should not be the card title.

Do not auto-open the panel on every warning. Auto-open only for a new blocker on the first affected run. Otherwise update the tab badge without stealing focus.

The clean state should read:

> Physics checks complete — no modeled risks found for the selected material and machine assumptions.

### Cross-surface selection

Use one `selectedDiagnosticId` and one `hoveredDiagnosticId` in application state. Every surface derives its visuals from those IDs.

Selecting a finding should:

1. Reveal and select its primary source line.
2. Emphasize related lines without creating multiple full-line text selections.
3. Zoom or pan only when the affected geometry is offscreen.
4. Temporarily enable the relevant overlay—for example density—without changing the user’s persistent heatmap setting.
5. Highlight the exact problematic event ranges in playback.
6. Move the scrubber to the first affected event only when the user chooses “Inspect sew order,” not on ordinary selection.

Clicking a visible hotspot on the stage should select the corresponding diagnostic. When diagnostics overlap, show a compact chooser.

### Monaco

Physics diagnostics need a separate marker owner from syntax/runtime errors:

- Red squiggles for blockers.
- Amber squiggles for risks.
- Muted dotted underline for informational findings.
- Whole-line markers initially; exact columns only after AST/source spans exist.
- Hover content with title, measurement, explanation, and remedies.
- Lightbulb actions only for safe source edits.
- `F8`/`Shift+F8` for next/previous physics finding.
- `Escape` clears the persistent visual selection.

Do not enable a noisy glyph margin globally until the visual prototype demonstrates that it helps.

### Stage

Add category-specific overlays:

- Density: outlined heatmap cell plus local layer value.
- Repeated penetration: concentric needle-hole marker.
- Long stitch/jump: highlighted segment with measured length.
- Fill/border overlap: tinted overlap band.
- Underlay protrusion: topping envelope plus protruding underlay.
- Hoop overflow: unreachable point connected to the nearest hoop boundary.
- Direction/reversal cluster: affected polyline rather than isolated dots.

Markers must differ by shape as well as color.

These overlay descriptions communicate semantic intent, not approved rendering. PI-7 may replace
their exact marks, labels, emphasis, and interaction after testing them against real stitch output.

### Stale and error behavior

As soon as source changes, mark the existing report stale. Do not leave a green “clean” result looking current.

After an idle delay, run an analysis compile:

- While checking: retain the last preview but label findings “from previous run.”
- On a syntax/runtime failure: compiler errors take priority and Physics says “Waiting for a valid design.”
- On success: atomically replace the design and report.
- Manual Run should receive priority over background analysis.

## Multi-session roadmap

### PI-0 — Product contract and UX prototype

Status: **complete** (2026-07-21)

Implementation progress:

- [x] Added the normative product vocabulary, analysis/policy boundary, interaction contract, and
      provisional decisions to this document.
- [x] Added a self-contained coded prototype covering desktop and mobile layouts, Monaco hover,
      stage overlays, playback highlighting, current/stale/blocked/clean states, and the three
      required diagnostic workflows:
      [`prototypes/physics-intellisense.html`](./prototypes/physics-intellisense.html).
- [x] Added a moderator-ready five-participant protocol, task success criteria, comprehension check,
      and result ledger:
      [`physics-intellisense-usability-protocol.md`](./physics-intellisense-usability-protocol.md).
- [x] Validated the prototype's script, required scenario/state coverage, artifact links, and
      formatting; ran the full repository test, lint, app-build, library-build, and package-check
      suites.
- [x] Product owner completed rendered prototype validation on 2026-07-21 and approved the overall
      product and interaction concept.
- [x] Recorded the main validation concern: preview overlays were difficult to judge and must be
      iterated with real geometry during PI-7 rather than copied directly from the prototype.
- [x] Confirmed the five layout/disclosure decisions as the PI-1 starting contract.
- Deferred the broader five-participant protocol to the integrated PI-7 exit gate. Testing the
  linked editor/panel/stage workflow against real diagnostics will produce stronger evidence than
  repeating it against mocked overlays.

The prototype is intentionally isolated from `src/`: it tests product language and interaction
hierarchy without creating a temporary public API or coupling production UI to mock diagnostics.
It uses no network resources and can be opened directly in a browser.

Validation record (2026-07-21):

- `npx prettier --check` passed for the plan, protocol, and prototype.
- The prototype JavaScript parsed successfully and a structural check confirmed all seven
  workflows/states, desktop/mobile viewports, three mobile sheet states, cautious clean copy, and
  invalid-source copy.
- `npm test`: 76 files and 2,059 tests passed; generated references are current.
- `npm run lint` and `npm run build` passed. The build retained its pre-existing large-chunk
  advisory.
- `npm run build:lib` and `npm run check:lib` passed; publint and the package type check found no
  problems.
- React Doctor was not run because PI-0 adds no React or production application code.
- Product-owner visual validation approved the concept and identified overlay legibility as the
  unresolved implementation risk. No prototype overlay styling is normative.

Deliverables:

- Write `docs/physics-intellisense-implementation-plan.md`.
- Define vocabulary: blocker, risk, note, evidence, assumption, acknowledgment, remedy.
- Produce static desktop and mobile prototypes for panel, Monaco hover, stage overlay, stale state, and clean state.
- Usability-test three workflows:

  1. Find and fix a density hotspot.
  2. Understand an underlay/fill-border construction problem.
  3. Determine whether a long jump matters for the selected machine.

Decisions to lock:

- Bottom-panel tab versus separate inspector.
- Whether blocker-only auto-open is acceptable.
- Mobile bottom sheet versus inline accordion.
- How much evidence information is visible by default.

Completion decision:

- Product-owner validation is sufficient to begin the engine-facing PI-1 through PI-3 work because
  those sessions define semantic diagnostics and attribution, not final presentation styling.
- The original five-participant acceptance study remains required, but moves to PI-7 when the
  complete linked workflow exists on the production canvas.
- PI-0 does not claim that overlay legibility or clean-state comprehension has been validated across
  representative users.

### PI-1 — Unified diagnostic catalog and types

Status: **complete** (2026-07-21)

Entry conditions satisfied:

- PI-0 product vocabulary and the analysis/preflight boundary are approved.
- `RunResult.warnings`, `warningLocations`, and `preflight` remain compatibility surfaces.
- The public model owns semantic hoop-space data only; preview-overlay presentation is deferred.

Implementation scope:

- Add public contracts in `src/lib/core/types.ts` and exports in `src/lib/engine.ts`.
- Add a focused `src/lib/embroidery/physics-diagnostics/` module containing the catalog, stable
  fingerprint helpers, and compatibility adapter.
- Define the complete renderer-independent geometry union now. PI-1 may initially adapt existing
  locations to point geometry; PI-3 populates cells, paths, regions, anchors, bounds, and playback
  ranges from richer sidecars.
- Add `RunResult.physics` additively and build it from the diagnostics already selected by current
  preflight behavior. PI-2 changes which checks the playground requests; PI-1 does not.
- Add catalog coverage, contract, determinism, and compatibility tests in
  `src/lib/__tests__/physics-diagnostics.test.ts` plus focused updates to preflight tests.

Identity and versioning rules:

- Start `PhysicsReport.version` at `1` and change it only when serialized report semantics become
  incompatible, not for copy or catalog-description edits.
- Build `fingerprint` from a version prefix, stable code, sorted construction IDs, canonical source
  locations, and canonical semantic geometry quantized to 0.01 mm. Exclude severity, message copy,
  explanation, and remedies so content improvements do not invalidate later acknowledgments.
- Build `id` from the fingerprint plus a deterministic occurrence suffix when otherwise identical
  findings coexist. Neither value may depend on array insertion timing, locale, object identity, or
  randomized hashing.
- Catalog validation must reject duplicate codes/remedy IDs, missing documentation IDs, empty
  guidance, and presentation-specific metadata.

Non-goals:

- No new detector, threshold, severity, warning string, source command, or strict failure.
- No `RunOptions.physicsAnalysis`; that belongs to PI-2.
- No background compilation, React UI, Monaco marker, canvas overlay, or playback change.
- No source-edit remedies. PI-1 catalog remedies are guidance/context metadata; PI-8 enables edits.

Deliverables:

- Add the `PhysicsDiagnostic` and `PhysicsReport` contracts.
- Add renderer-independent `DiagnosticGeometry`, `PhysicsRemedy`, and `PhysicsAssumption` contracts.
- Introduce a central diagnostic catalog containing category, default severity, title, explanation, evidence class, remedies, and documentation ID.
- Move code metadata out of switch statements and components.
- Assign stable IDs/fingerprints.
- Export catalog validation utilities through the library barrel where appropriate.

Migrate existing codes first:

- Density and same-hole hotspots.
- Tiny movements.
- Field/hoop overflow.
- Satin snag risk.
- Current event-stream checks.
- Current construction-aware checks.
- Machine capability findings.

Acceptance:

- Every emitted code exists in the catalog.
- Catalog entries have unique codes, category, evidence, explanation, and at least one remedy.
- Ordering, coordinates, and fingerprints are deterministic.
- Existing warning/preflight tests remain unchanged.
- Default, `preflight 'off'`, `warn`, and `strict` behavior retains current event arrays, warning
  strings, strict failures, and issue ordering.
- `src/lib/` remains platform-neutral and no public type contains canvas/UI styling or editor
  lifecycle state.

Implementation progress:

- [x] Added the complete renderer-independent geometry, remedy, assumption, diagnostic, and report
      contracts to `core/types.ts`; exported them through `engine.ts` and added optional
      `RunResult.physics`.
- [x] Added the 24-entry central catalog for every currently emitted diagnostic code. Static
      severities and compatibility suggestions now come from the catalog rather than detector
      switches or construction/event analyzers.
- [x] Added catalog validation for duplicate codes/remedy IDs, missing documentation/copy,
      missing remedies, and fields outside the semantic schema.
- [x] Added version-1 fingerprints from code, canonical source locations, sorted construction IDs,
      and semantic geometry quantized to 0.01 mm, plus deterministic occurrence IDs.
- [x] Added the compatibility adapter and populated `RunResult.physics` on every successful run from
      the exact issue list selected by existing preflight behavior. Legacy warnings, warning
      locations, issue ordering, strict failures, and stitch events are unchanged.
- [x] Added focused catalog, contract, identity, determinism, unknown-code, and compatibility tests
      in `physics-diagnostics.test.ts`; kept existing preflight tests unchanged.
- [x] Updated the interpreter and machine architecture documents with catalog ownership, report
      versioning, identity rules, and the PI-1 compatibility boundary.

Validation record (2026-07-21):

- `npm test`: 77 files and 2,066 tests passed; generated references are current.
- `npm run lint` and `npm run build` passed. The build retained its pre-existing large-chunk
  advisory.
- `npm run build:lib` and `npm run check:lib` passed; publint and the package type check found no
  problems.
- Targeted Prettier validation passed for every changed source, test, and documentation file.
- React Doctor was not run because PI-1 changes no React component or application UI.

### PI-2 — Decouple analysis from source preflight policy

Status: **complete** (2026-07-21)

Deliverables:

- Split “what to analyze” from “what blocks export.”
- Add a caller-controlled analysis level to `RunOptions` or an internal equivalent.
- Playground compilation requests full PhysicsIntellisense analysis by default.
- Library default behavior remains compatible.
- `preflight 'strict'` continues to reject only error-severity policy findings.
- Add `analysisMs` and diagnostic counts to worker timing instrumentation.

Recommended rule:

- `preflight` controls policy.
- `RunOptions.physicsAnalysis = 'full'` controls editor analysis.
- Neither setting changes events.

Acceptance:

- The playground receives all extended diagnostics without inserting `preflight 'warn'` into source.
- `off`, `warn`, and `strict` still produce identical stitch events.
- Export gating remains deterministic and source-controlled.
- Large designs stay within the current compile timeout.

Implementation progress:

- [x] Added public `PhysicsAnalysisMode = 'preflight' | 'full'` and
      `RunOptions.physicsAnalysis`. Omission retains the PI-1/library behavior; invalid runtime
      values fail explicitly.
- [x] Kept `RunResult.preflight` source-policy-selected while allowing `RunResult.physics` to use
      full event-stream and construction analysis independently. The report's `policy` still records
      the source mode.
- [x] Kept strict failure bound exclusively to the source-policy preflight result. Caller-requested
      blocker diagnostics cannot turn an `off` or `warn` program into a strict failure.
- [x] Threaded analysis breadth through the shared compiler queue and worker. The main playground
      requests `'full'` and retains the resulting physics report in `DesignState`; other worker and
      direct-library consumers retain the compatibility default.
- [x] Added `analysisMs` and info/warning/error/total diagnostic counts to `RunTimings`, which the
      worker carries into `CompileResponse.timings` alongside existing statistics and total timings.
- [x] Added compatibility, source-policy, event-inertness, strict-gating, invalid-option, timing, and
      25,000-event bounded-analysis coverage.
- [x] Updated the interpreter and machine architecture documents with the analysis/policy boundary,
      playground opt-in, timing contract, and reuse behavior.

Validation record (2026-07-21):

- `npm test`: 77 files and 2,072 tests passed; generated references are current.
- `npm run lint` and `npm run build` passed. The build retained its pre-existing large-chunk
  advisory.
- `npm run build:lib` and `npm run check:lib` passed; publint and the package type check found no
  problems.
- React Doctor's changed-file scan scored 88/100. Its seven findings are in pre-existing unrelated
  App/runtime code; the new compiler option and physics-state wiring introduced no reported issue.
- Targeted Prettier validation passed for every changed source, test, and documentation file.

### PI-3 — Rich attribution

Status: **complete** (2026-07-21)

Deliverables:

- Add diagnostic geometry unions.
- Keep diagnostic geometry semantic and renderer-independent. Include the affected shape plus its
  role (hotspot, boundary, overlap, travel, envelope, or unreachable extent); do not encode mockup
  colors, stroke widths, label positions, or canvas-specific styling in the public report.
- Retain representative anchors and bounds where they can support label placement, hit-testing,
  zoom-to-fit, and multiple overlay treatments without rerunning analysis.
- Preserve event identity through final locks and build exact playback ranges.
- Add primary/contributing/related source roles.
- Convert currently unstructured spatial fill/satin warnings.
- Remove the app-level average-density warning or replace it with a core, locatable metric.
- Add source columns incrementally where AST nodes already have offsets; retain whole-line fallback elsewhere.

Acceptance:

- Every actionable finding has a source line or explicit “generated/no source” reason.
- Spatial findings render the affected construct, not merely one representative point.
- Playback ranges cover the problematic events rather than all events from the same line.
- No plain-string physical warning is silently excluded from the audit.

Implementation progress:

- [x] Event-stream checks retain the exact analyzed event indices and emit affected path, travel,
      or penetration geometry instead of reducing evidence to source-line intervals.
- [x] Construction checks retain fill regions, satin envelopes, overlap spans, connector paths,
      and primary/contributor/related source roles.
- [x] The report adapter derives reusable anchors and bounds for every non-empty geometry and maps
      preserved pre-lock event identities through final lock insertion into inclusive stitch/jump
      playback ranges.
- [x] Diagnostics without an attributable source expose an explicit generated-source explanation;
      whole-line attribution remains the fallback because current statement AST nodes do not retain
      token columns.
- [x] Every locatable fill/satin warning has a catalog code and structured counterpart. Analysis now
      fails explicitly if a future spatial fill/satin warning omits its code.
- [x] Removed the playground's stitches-per-bounding-box-area warning; the locatable core coverage
      grid remains the single density diagnostic.
- [x] Added focused catalog, semantic-geometry, source-role/reason, playback identity, and
      compatibility coverage; updated the machine and interpreter architecture documents.

Validation record (2026-07-21):

- `npm test`: 77 files and 2,076 tests passed; generated references are current.
- `npm run lint`, `npm run build`, `npm run build:lib`, and `npm run check:lib` passed. The app
  build retained its pre-existing large-chunk advisory; publint and the package type check found no
  problems.
- React Doctor's final changed-file scan scored 85/100. Its remaining 12 findings are pre-existing
  App/runtime/machine issues; PI-3's new attribution code introduced no reported finding.
- Targeted Prettier validation passed for every changed source, test, and documentation file.

### PI-4 — Analysis state and background checking

Status: **complete** (2026-07-21)

Deliverables:

- Add `sourceRevision`, `reportRevision`, and current/stale/checking/blocked state.
- Debounce background checks around 400–600 ms.
- Coalesce queued work and prioritize manual runs.
- Suspend background analysis while parameter/path handles are being actively dragged; run once at drag end.
- Persist only display preferences, never stale diagnostics.

Acceptance:

- Old results are visibly stale immediately after an edit.
- Fast typing does not create an unbounded worker queue.
- Manual Run is not delayed behind obsolete analysis jobs.
- Parameter dragging stays responsive.

Implementation progress:

- [x] Added playground-only `PhysicsReportState` transitions with monotonic `sourceRevision`, the
      last successful `reportRevision`, and explicit `current`, `stale`, `checking`, and `blocked`
      states. Engine `RunResult.physics` remains free of editor lifecycle data.
- [x] Wrapped every playground source mutation so an edit marks the existing report stale
      synchronously. The console displays stale/checking/blocked context while retaining the last
      design, and successful results replace the design and report in one reducer update.
- [x] Added a 500 ms idle background check that requests full physics analysis without appending
      console output. Invalid source preserves the previous preview, prioritizes compiler markers,
      and moves Physics to “Waiting for a valid design.”
- [x] Replaced the shared FIFO compiler list with foreground/background scheduling. Queued and
      active background work is coalesced per consumer, manual runs skip queued analysis, and an
      active obsolete background worker is cancelled before foreground work starts.
- [x] Separated foreground and background staleness generations so a background request cannot
      supersede a manual run. Source-revision guards also prevent an in-flight result from applying
      after a newer edit but before its debounce fires.
- [x] Suspended compilation during stage point/path dragging and parameter-slider dragging. Source
      and stale state still update live; pointer commit resumes analysis exactly once.
- [x] Added no Physics persistence: diagnostics, reports, and revision state are never written to
      local storage. Only future Physics display preferences are eligible for persistence.
- [x] Added focused lifecycle and queue coverage for immediate stale state, obsolete-result
      rejection, blocked/recovery transitions, foreground priority, queued coalescing, and active
      background cancellation/replacement.

Validation record (2026-07-21):

- `npm test`: 79 files and 2,083 tests passed; generated references are current.
- `npm run lint` and `npm run build` passed. The app build retained its pre-existing large-chunk
  advisory.
- `npm run build:lib` and `npm run check:lib` passed; publint and the package type check found no
  problems.
- React Doctor's changed-file scan scored 80/100. Its 22 findings are in pre-existing App,
  EditorPane, and ParametersPanel code surfaced because those files changed; the PI-4 lifecycle,
  status, interaction, and queue additions introduced no reported finding.
- Targeted Prettier validation passed for every changed source, test, and documentation file.

### PI-5 — Physics panel MVP

Deliverables:

- Add Console/Physics tabs.
- Implement status summary, assumptions, filtering, grouping, expandable cards, selection, and empty/error/stale states.
- Deduplicate physical console warnings when an equivalent structured diagnostic is shown; preserve non-physics notes, prints, and compatibility data.
- Keep a “Copy diagnostic report” action for bug reports.
- Add local show/hide info preference.

Acceptance:

- One occurrence appears once in the primary UX.
- All functionality is keyboard accessible.
- Filters never trigger compilation.
- The panel works at the existing minimum editor width and on mobile.

### PI-6 — Monaco integration

Deliverables:

- Separate physics and compiler marker owners.
- Add severity markers and rich hover text.
- Implement next/previous navigation.
- Add a selected-line decoration distinct from playback.
- Add safe code-action plumbing without enabling edits yet.

Acceptance:

- Syntax errors and physics diagnostics coexist.
- Marker updates never erase compiler errors.
- Multi-line contributors are visually distinct from the primary cause.
- Monaco hover, panel selection, and stage selection stay synchronized.

### PI-7 — Stage and playback integration

Deliverables:

- Extend the canvas renderer for point, segment, cell, polyline, and region diagnostics.
- Add stage hit-testing.
- Add temporary contextual overlays.
- Treat overlay styling as an implementation-time design track. Compare halo, dimmed-base,
  outline/pattern, local magnification, and callout treatments on real dense and sparse designs
  instead of adopting the PI-0 mock styling.
- Test overlays across light/dark thread colors, density heatmap on/off, overlapping findings,
  typical zoom, fit-to-hoop, and high zoom. Labels must avoid hiding the geometry they explain.
- Provide a quick way to hide/reveal the selected overlay and, when necessary, temporarily dim base
  stitches. Neither control may change the persistent heatmap or jump-visibility preferences.
- Render exact playback ranges with severity/category styling.
- Add “Inspect sew order” and “Return to full design.”

Acceptance:

- Every migrated geometry type has a deterministic visual fixture.
- Selection remains usable with overlapping findings.
- The selected issue is distinguishable without relying on color alone and remains legible against
  dense stitches at fit-to-hoop, normal, and high zoom.
- Overlay labels and regions do not obscure the stitch geometry needed to judge the finding.
- Heatmap preference is unchanged after temporary diagnostic inspection.
- Playback highlights survive planning, autotrim, and generated locks correctly.
- Product owner approves the implemented overlays after iteration on the representative sampler.
- Run the five-participant protocol against the integrated editor/panel/stage experience. All five
  participants must reach responsible code and stage geometry without moderator instruction, and
  none may interpret “no modeled risks” as a sew-out guarantee.

### PI-8 — Guided remedies and safe quick fixes

Begin with explanation-only remedy recipes. Then add source edits for narrow cases:

- Insert or adjust `autotrim` for a long jump.
- Adjust a literal `fillinset`.
- Adjust a literal `underlayinset`.
- Adjust a literal density or spacing command.
- Enable an appropriate existing split-satin policy when topology is known to support it.

Rules:

- Show a source diff before applying.
- Recompile immediately and compare before/after findings.
- Never offer “Fix all” initially.
- Never automatically change fabric, thread, needle, hoop, machine profile, or suppression thresholds.
- Do not edit reporter-driven values that cannot be traced safely to a literal.

Acceptance:

- Applying a fix is one undoable editor transaction.
- Unsafe or ambiguous findings show guidance only.
- A fix that introduces new equal-or-higher-severity findings is called out explicitly.

### PI-9 — Physics coverage expansion

Only after the unified UX is working, expand detectors:

- Missing or unsuitable underlay for explicit wide satin/fill constructions.
- Construction-level coverage gaps, not just hotspots.
- Excessive short-stitch ratios per construction.
- Thread-path and jump problems per color/run.
- Material-context insights based on declared fabric, thread width, needle, stabilizer, and topping.
- Directional compensation mismatch as informational/experimental feedback.
- Machine-profile-specific recommendations.

Each detector requires:

- Trigger fixture.
- Adjacent safe fixture.
- Spatial and source attribution.
- Measurement and threshold.
- Evidence classification.
- False-positive notes.
- Performance cap.
- At least one remediation recipe.

Do not add fabric/needle-specific warnings until physical evidence supports them.

### PI-10 — Acknowledgments and intentional exceptions

Add only after the false-positive profile is understood.

Recommended model:

- “Acknowledge for this project,” requiring a reason.
- Match acknowledgments by diagnostic fingerprint.
- Acknowledged findings remain countable and visible through a filter.
- Error/hard-limit findings cannot be hidden from strict export policy.
- Local acknowledgments should not silently alter shared source.

A future comment annotation such as `@physics-ignore` can be considered separately, but should not be introduced in the first release.

### PI-11 — Evidence, accessibility, performance, and rollout

Deliverables:

- Version diagnostic thresholds and evidence references.
- Extend the physical sew-out corpus with expected/absent finding ledgers.
- Measure false-positive and false-negative rates by diagnostic code.
- Add component tests, keyboard tests, reduced-motion checks, contrast checks, and screen-reader labels.
- Run React Doctor on all new UI.
- Add analysis benchmarks for small, typical, and limit-sized designs.
- Confirm that PI-7's five-participant findings are resolved or explicitly accepted before the
  Physics tab becomes default-on.
- Update language reference, machine/interpreter architecture, README, book debugging chapters, examples, and AI guidance.

Rollout:

1. Hidden developer flag; compare legacy warnings and the new report.
2. Opt-in beta; collect local diagnostic report files and sew-out feedback.
3. Default-on Physics tab; no automatic source edits.
4. Enable reviewed quick fixes individually.
5. Consider API deprecations only in a major version.

## Priority order

The minimum valuable release is PI-0 through PI-7. That gives users one coherent diagnostic system with synchronized code, stage, and playback navigation.

PI-8 onward should be treated as enhancement work. Adding many new physics rules before attribution and UX are solid would produce a larger warning list without materially improving debugging.

The strongest first demonstration should be a deliberately problematic sampler containing:

- A density hotspot.
- A same-hole penetration cluster.
- A long untrimmed jump.
- A fill/border overlap problem.
- Underlay outside topping.
- A physically unreachable stitch.

A successful MVP lets the user navigate, understand, and inspect all six from one Physics panel without reading raw diagnostic codes or hunting through the console.
