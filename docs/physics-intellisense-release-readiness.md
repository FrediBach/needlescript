# PhysicsIntellisense release readiness

Status: **opt-in beta; default-on gate closed** (2026-07-21).

The playground runs full caller-selected analysis, but Console remains the initial bottom-panel tab.
Risks and notes never open Physics automatically; the previously approved newly introduced blocker
exception remains. Copied diagnostic reports are local files and no telemetry is sent.

## Evidence and rate record

`PhysicsReport` version 2 records diagnostic catalog version 1, threshold bundle
`physics-thresholds-v1`, and versioned evidence references. A pending physical protocol is labelled
pending in the report and UI; it is not treated as validated evidence.

The expected/absent ledger is
[`physics-diagnostic-validation-corpus-v1.json`](./physics-diagnostic-validation-corpus-v1.json).
Run `npm run physics:rates -- --check` to compile every fixture and report false-positive and
false-negative rates by evaluated code. The current software-expectation ledger has zero observed
false positives or false negatives. A `null` rate means that the ledger does not yet contain the
corresponding positive or negative observation for that code.

These are software conformance rates, not physical prediction rates. Physical rates remain
unavailable while the sew-out records are pending. Do not promote heuristic or experimental
evidence on the strength of this fixture result.

## Performance record

Run `npm run physics:benchmark` for isolated diagnostic-analysis timings. A 2026-07-21 darwin-arm64,
Node 24.13.0 run with three measured iterations produced:

| Scenario    | Events | Median analysis | Observed range   |
| ----------- | -----: | --------------: | ---------------- |
| Small       |    201 |         0.77 ms | 0.53–0.78 ms     |
| Typical     | 10,001 |        10.84 ms | 10.72–12.08 ms   |
| Limit-sized | 90,001 |       114.21 ms | 111.34–114.40 ms |

The synthetic path deliberately repeats a small square to exercise dense local findings while
holding construction constant. Results are evidence for comparative regression work on the named
machine only, not universal UI latency budgets.

## Accessibility record

Automated component coverage verifies named native controls, keyboard focus order, expanded-region
relationships, textual severity labels, hidden decorative symbols, report provenance labels,
reduced-motion CSS, and WCAG AA contrast for every Physics text/status token against the panel
surface. Severity remains shape-and-text encoded; color is supplementary.

Automated checks do not replace PI-7's integrated screen-reader, overlay, or participant review.

## Rollout gates

1. **Developer comparison — complete.** Legacy warnings remain in `RunResult`; copied structured
   reports, compatibility tests, and console occurrence deduplication make differences auditable.
2. **Opt-in beta — current.** Console is initially selected, Physics is user-selectable, reports are
   copied locally, and no automatic edit is applied.
3. **Default-on Physics tab — blocked.** Requires representative overlay iteration, product-owner
   approval, and the completed five-participant PI-7 protocol. Any remaining finding must be
   explicitly accepted in the implementation plan before changing the initial tab.
4. **Reviewed quick fixes — individually enabled.** Only literal edits accepted by the narrow
   allowlist in `physics-remedies-model.ts` are previewed; each creates one undo step, recompiles,
   and reports introduced equal-or-higher-severity findings.
5. **API deprecations — deferred.** Compatibility warning and preflight surfaces remain supported;
   removal requires a major version.

The default-on gate is deliberately not satisfied by tests, builds, benchmark numbers, or this
document.
