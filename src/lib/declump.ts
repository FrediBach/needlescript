// ---------- declump: along-thread crowd relief ----------
//
// `declump limit [maxshift] [ … ]` is a block-scoped after-split effect that
// eases crowded needle penetrations along the thread's own line of travel,
// never sideways. Lateral nudges change a stitch's *angle* (immediately
// visible); along-axis nudges change only its *length* (barely perceptible),
// so the visual integrity of the design is preserved while perforation density
// is relieved.
//
// The fold is greedy and stateful: earlier stitches in the block win the space;
// later ones absorb the displacement. Sew the geometry whose fidelity matters
// most first.
//
// `declumppath(path, limit [, maxshift])` is the pure data twin: runs the
// identical fold over a point list, reading real committed history but
// committing nothing.
//
// Determinism: the fold is drawless (consumes zero values from the seeded
// stream) and is a pure function of (parameters, stitch stream so far) — so
// "same seed → same design" holds even when a declump block is added or moved.

import type { DensityGrid } from './postprocess.ts';

/** mm-floor below which a stitch must not collapse (comfortably above the 0.4 mm tiny-stitch threshold). */
const STITCH_FLOOR = 0.6;

/** Line-search step size in mm. */
const SEARCH_STEP = 0.25;

/** Maximum allowed maxshift in mm (clamped on input). */
export const MAXSHIFT_MAX = 5;

/**
 * Mutable fold state for one `declump` block (or `declumppath` call).
 * A fresh state is created for each block; nested blocks each own one.
 */
export interface DeclumpState {
  /** Coverage ceiling in layers. */
  limit: number;
  /** Maximum displacement per penetration, in mm. */
  maxshift: number;
  /** Previous *emitted* (eased) hoop-space point, or null at run start. */
  prev: [number, number] | null;
  /** Last valid travel axis unit-vector, used when the incoming segment is degenerate. */
  lastAxis: [number, number];
  /** Count of penetrations that stayed put because no along-axis relief was found. */
  saturationCount: number;
}

/** Create a fresh fold state with clamped parameters. */
export function makeDeclumpState(limit: number, maxshift: number): DeclumpState {
  return {
    limit: Math.max(0, limit),
    maxshift: Math.min(MAXSHIFT_MAX, Math.max(0, maxshift)),
    prev: null,
    lastAxis: [0, 1], // hoop north
    saturationCount: 0,
  };
}

/**
 * Reset the run-boundary state: call whenever the pen goes up (jump/trim)
 * so the next pen-down sequence starts fresh.
 */
export function declumpResetRun(state: DeclumpState): void {
  state.prev = null;
}

/**
 * Apply the greedy along-axis fold to one penetration point (§4 of the spec).
 *
 * @param state   - mutable fold state (updated in place)
 * @param pt      - planned penetration in hoop space, after inner penLayers (humanize / snaptogrid)
 * @param nextPt  - next planned penetration (pre-fold), or null if unavailable (last of segment)
 * @param density - live coverage grid (reads only; commits happen in _push after emission)
 * @returns the (possibly eased) hoop-space penetration position
 */
export function declumpFoldPoint(
  state: DeclumpState,
  pt: [number, number],
  nextPt: [number, number] | null,
  density: DensityGrid,
): [number, number] {
  const { limit, maxshift } = state;
  const [px, py] = pt;

  // ── 1. Pass-through ──────────────────────────────────────────────────────
  const covAtPt = density.coverAvg(px, py, 1);
  if (covAtPt <= limit) {
    state.prev = pt;
    return pt;
  }

  // ── 2. Travel axis ───────────────────────────────────────────────────────
  // Default to the last valid axis; update it if we can derive a fresh direction.
  let [ux, uy] = state.lastAxis;

  if (state.prev !== null) {
    // Incoming direction: from last emitted (eased) point to current planned point
    const dx = px - state.prev[0];
    const dy = py - state.prev[1];
    const len = Math.hypot(dx, dy);
    if (len >= 0.01) {
      ux = dx / len;
      uy = dy / len;
      state.lastAxis = [ux, uy];
    }
  } else if (nextPt !== null) {
    // First point of a run — use outgoing direction toward p₁
    const dx = nextPt[0] - px;
    const dy = nextPt[1] - py;
    const len = Math.hypot(dx, dy);
    if (len >= 0.01) {
      ux = dx / len;
      uy = dy / len;
      state.lastAxis = [ux, uy];
    }
  }
  // else: degenerate and start of run — use lastAxis as is (hoop north by default)

  // ── 3. Caps ───────────────────────────────────────────────────────────────
  // Backward cap: how far we can slide toward state.prev before collapsing that stitch.
  let bckCap = maxshift;
  if (state.prev !== null) {
    bckCap = Math.max(
      0,
      Math.min(maxshift, Math.hypot(px - state.prev[0], py - state.prev[1]) - STITCH_FLOOR),
    );
  }

  // Forward cap: how far we can slide toward nextPt before collapsing the outgoing stitch.
  let fwdCap = maxshift;
  if (nextPt !== null) {
    fwdCap = Math.max(
      0,
      Math.min(maxshift, Math.hypot(px - nextPt[0], py - nextPt[1]) - STITCH_FLOOR),
    );
  }

  // ── 4. Line search ────────────────────────────────────────────────────────
  const bckSteps = Math.floor(bckCap / SEARCH_STEP);
  const fwdSteps = Math.floor(fwdCap / SEARCH_STEP);

  // For nearest-clear tracking: first j (distance) where coverage clears in each direction.
  let bckClearDist = Infinity;
  let bckClearPt: [number, number] | null = null;
  let fwdClearDist = Infinity;
  let fwdClearPt: [number, number] | null = null;

  // For minimum-coverage fallback: best candidate from both directions.
  let minCov = covAtPt;
  let minCovPt: [number, number] = pt;

  // Scan backward
  for (let j = 1; j <= bckSteps; j++) {
    const d = j * SEARCH_STEP;
    const cx = px - d * ux;
    const cy = py - d * uy;
    const cov = density.coverAvg(cx, cy, 1);
    if (cov < minCov) {
      minCov = cov;
      minCovPt = [cx, cy];
    }
    if (cov <= limit && bckClearPt === null) {
      bckClearDist = d;
      bckClearPt = [cx, cy];
      // Don't break: continue scanning for min-cov fallback.
    }
  }

  // Scan forward
  for (let j = 1; j <= fwdSteps; j++) {
    const d = j * SEARCH_STEP;
    const cx = px + d * ux;
    const cy = py + d * uy;
    const cov = density.coverAvg(cx, cy, 1);
    if (cov < minCov) {
      minCov = cov;
      minCovPt = [cx, cy];
    }
    if (cov <= limit && fwdClearPt === null) {
      fwdClearDist = d;
      fwdClearPt = [cx, cy];
    }
  }

  // ── 5. Decision ───────────────────────────────────────────────────────────
  let result: [number, number];

  if (bckClearPt !== null || fwdClearPt !== null) {
    // Take the nearest candidate that clears limit; tie → backward (shorter thread).
    if (bckClearPt !== null && (fwdClearPt === null || bckClearDist <= fwdClearDist)) {
      result = bckClearPt;
    } else {
      result = fwdClearPt!;
    }
  } else if (minCov < covAtPt) {
    // No candidate clears: take minimum-coverage only if it improves on staying.
    result = minCovPt;
  } else {
    // Stay put — crowd lies exactly along the travel axis; no better option.
    state.saturationCount++;
    result = pt;
  }

  // ── 6. Commit state ───────────────────────────────────────────────────────
  state.prev = result;
  return result;
}
