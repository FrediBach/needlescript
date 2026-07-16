// ---------- Engine limits ----------

export const LIMITS = {
  maxStitches: 100000,
  maxOps: 10000000,
  maxCallDepth: 200,
  minStitch: 0.4,
  maxStitch: 12.0,
  // Lists (RFC-2) — these protect the browser tab, like the op cap.
  maxListLen: 100000,
  maxListCells: 1000000,
  maxListDepth: 16,
  // Strings — same browser-protection philosophy as list limits.
  maxStringLength: 10000, // characters in a single string
  maxStringChars: 1000000, // monotonic allocation budget across all string ops
  // Generative math (RFC-3 §8)
  sewableRadius: 47, // the default sewable field radius (round100 hoop), in mm
  maxScatterPoints: 20000,
  maxDelaunayPoints: 10000, // voronoi / triangulate / hull / relax input
  maxTraceVertices: 50000, // trace/tracerings vertex cap
  fillConnectMax: 2.0,
};

// ---------- Overridable budget limits ----------
//
// These match LIMITS exactly but are separated so the `override` command can
// mutate per-run copies without touching the physics/format constants above.

/** Stock values for run-envelope budgets.  Changed only when adding new limits. */
export const STOCK_LIMITS = {
  maxStitches: LIMITS.maxStitches,
  maxOps: LIMITS.maxOps,
  maxCallDepth: LIMITS.maxCallDepth,
  maxLoopIters: 200000,
  maxListLen: LIMITS.maxListLen,
  maxListCells: LIMITS.maxListCells,
  maxStringLength: LIMITS.maxStringLength,
  maxStringChars: LIMITS.maxStringChars,
  maxScatterPoints: LIMITS.maxScatterPoints,
  maxDelaunayPoints: LIMITS.maxDelaunayPoints,
  maxClipVerts: 50000, // offsetpath / clippaths (separate from maxTraceVertices)
} as const;

export type BudgetKey = keyof typeof STOCK_LIMITS;

/** Maximum each budget limit may be raised to via `override`. */
export const OVERRIDE_CEILINGS: Record<BudgetKey, number> = {
  maxStitches: 250000,
  maxOps: 50000000,
  maxCallDepth: 2000,
  maxLoopIters: 5000000,
  maxListLen: 1000000,
  maxListCells: 8000000,
  maxStringLength: 1000000,
  maxStringChars: 20000000,
  maxScatterPoints: 100000,
  maxDelaunayPoints: 50000,
  maxClipVerts: 250000,
};

/** Minimum each budget limit may be lowered to via `override`. */
export const OVERRIDE_FLOORS: Record<BudgetKey, number> = {
  maxStitches: 100,
  maxOps: 10000,
  maxCallDepth: 10,
  maxLoopIters: 100,
  maxListLen: 1000,
  maxListCells: 10000,
  maxStringLength: 100,
  maxStringChars: 10000,
  maxScatterPoints: 100,
  maxDelaunayPoints: 100,
  maxClipVerts: 1000,
};
