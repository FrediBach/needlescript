// ---------- Command tables ----------

export const ALIASES: Record<string, string> = {
  forward: 'fd',
  back: 'bk',
  backward: 'bk',
  right: 'rt',
  left: 'lt',
  penup: 'up',
  pendown: 'down',
  pu: 'up',
  pd: 'down',
  setheading: 'seth',
  clearscreen: 'cs',
  clear: 'cs',
  stitchlength: 'stitchlen',
};

export const BUILTIN_ARITY: Record<string, number> = {
  fd: 1,
  bk: 1,
  rt: 1,
  lt: 1,
  up: 0,
  down: 0,
  home: 0,
  cs: 0,
  setxy: 2,
  setx: 1,
  sety: 1,
  seth: 1,
  arc: 2,
  push: 0,
  pop: 0,
  stitchlen: 1,
  satin: 1,
  density: 1,
  bean: 1,
  estitch: 1,
  beginfill: 0,
  endfill: 0,
  fillangle: 1,
  fillspacing: 1,
  filllen: 1,
  lock: 1,
  pullcomp: 1,
  shortstitch: 1,
  autotrim: 1,
  maxdensity: 1,
  color: 1,
  stop: 0,
  trim: 0,
  seed: 1,
  print: 1,
  mark: 0,
  assert: 1,
};

/**
 * Transform block commands (CTM stack). Each takes a fixed number of scalar
 * arguments *then a block* — the same shape as `repeat n [ … ]` and
 * `if cond [ … ]`. They are Core builtins (in RESERVED, can't be shadowed).
 * The pure path-function counterparts (xlate/xrotate/xscale/xmirror) live in
 * GEN_FUNCS below.
 */
export const TRANSFORM_ARITY: Record<string, number> = {
  translate: 2,
  rotate: 1,
  rotateabout: 3,
  scale: 1,
  scalexy: 2,
  mirror: 1,
  skew: 2,
  transform: 6,
};

/**
 * Effect block commands (effects §). Like transforms they take arguments then
 * a block and live on the same block-scoped stack, but they admit nonlinear /
 * stochastic and after-split maps. Ranged arity (snaptogrid overloads the way
 * scatter/range do); `warp`'s single argument is a procedure reference (@name).
 * The pure path-function counterparts (warppath/humanizepath/snappath) live in
 * GEN_FUNCS below. Core builtins (in RESERVED, can't be shadowed).
 */
export const EFFECT_ARITY: Record<string, { min: number; max: number }> = {
  warp: { min: 1, max: 1 }, // a reporter reference: warp @fn [ … ]
  humanize: { min: 1, max: 1 }, // jitter amount in mm (angle knob deferred)
  snaptogrid: { min: 1, max: 5 }, // cell | cellx celly | …ox oy | …ang
};

/** Builtins that take a single quoted-word argument, with their allowed words. */
export const QWORD_BUILTINS: Record<string, readonly string[]> = {
  fabric: ['woven', 'knit', 'stretch', 'denim', 'canvas', 'fleece'],
  underlay: ['auto', 'center', 'edge', 'zigzag', 'off'],
  fillunderlay: ['auto', 'tatami', 'edge', 'off'],
};

/** Fabric presets: how much the fabric distorts and how much stitching it tolerates. */
export const FABRICS: Record<
  string,
  {
    pull: number; // pull compensation in mm
    maxDensity: number; // thread coverage warning threshold, in layers
    densityFloor?: number; // minimum satin penetration spacing in mm
    doubleUnderlay?: boolean;
    note?: string;
  }
> = {
  woven: { pull: 0.2, maxDensity: 3.5 },
  knit: { pull: 0.5, maxDensity: 3.0, densityFloor: 0.45 },
  stretch: { pull: 0.6, maxDensity: 2.8, densityFloor: 0.5 },
  denim: { pull: 0.15, maxDensity: 4.0 },
  canvas: { pull: 0.15, maxDensity: 4.0 },
  fleece: {
    pull: 0.3,
    maxDensity: 2.6,
    doubleUnderlay: true,
    note: 'fleece: consider a water-soluble topping so stitches don\u2019t sink into the pile',
  },
};

export const FUNC_ARITY: Record<string, number> = {
  random: 1,
  sin: 1,
  cos: 1,
  sqrt: 1,
  abs: 1,
  round: 1,
  mod: 2,
  floor: 1,
  ceil: 1,
  min: 2,
  max: 2,
  pow: 2,
  atan: 2,
  noise: 1,
  noise2: 2,
  distance: 2,
  towards: 2,
  not: 1,
};

export const ZERO_FUNCS = new Set(['repcount', 'xcor', 'ycor', 'heading']);

// ---------- List builtins (RFC-2) ----------
//
// All list builtins are glued-call only: `len(xs)`, never `len xs`. Legacy
// prefix parsing is arity-driven and can never host variadic functions —
// call-paren-only builtins can take optional arguments (range, slice)
// without touching the legacy grammar.
//
// Soft reservation: these names are NOT in RESERVED. They resolve only at
// glued-call position; variables and parameters may freely share the names
// (builtins are call-only, variables are never callable), and user
// procedures with the same name shadow the builtin at call sites. This
// keeps every pre-RFC-2 program running unchanged.

/** List functions usable in expressions, with min/max argument counts. */
export const LIST_FUNCS: Record<string, { min: number; max: number }> = {
  range: { min: 1, max: 3 },
  filled: { min: 2, max: 2 },
  len: { min: 1, max: 1 },
  islist: { min: 1, max: 1 },
  first: { min: 1, max: 1 },
  last: { min: 1, max: 1 },
  concat: { min: 2, max: 2 },
  slice: { min: 2, max: 3 },
  reverse: { min: 1, max: 1 },
  sort: { min: 1, max: 1 },
  copy: { min: 1, max: 1 },
  indexof: { min: 2, max: 2 },
  contains: { min: 2, max: 2 },
  sum: { min: 1, max: 1 },
  mean: { min: 1, max: 1 },
  minof: { min: 1, max: 1 },
  maxof: { min: 1, max: 1 },
  pick: { min: 1, max: 1 },
  shuffle: { min: 1, max: 1 },
  pos: { min: 0, max: 0 },
  removeat: { min: 2, max: 2 },
};

/** List commands usable as statements (mutators + setpos). */
export const LIST_CMDS: Record<string, { min: number; max: number }> = {
  append: { min: 2, max: 2 },
  prepend: { min: 2, max: 2 },
  insertat: { min: 3, max: 3 },
  removeat: { min: 2, max: 2 }, // returns the removed value; discarded here
  setpos: { min: 1, max: 1 },
};

// ---------- Generative math builtins (RFC-3) ----------
//
// Same soft reservation as LIST_FUNCS: glued-call only, resolved after user
// procedures, never in RESERVED. A point is [x, y], a path is a list of
// points, a region is a closed path (closure implicit).

/** Generative-math functions usable in expressions (RFC-3 §4). */
export const GEN_FUNCS: Record<string, { min: number; max: number }> = {
  // §4.1 scalars
  lerp: { min: 3, max: 3 },
  remap: { min: 5, max: 5 },
  clamp: { min: 3, max: 3 },
  smoothstep: { min: 3, max: 3 },
  gauss: { min: 2, max: 2 },
  // §4.2 noise
  snoise2: { min: 2, max: 2 },
  snoise3: { min: 3, max: 3 },
  fbm2: { min: 3, max: 3 },
  // §4.3 vectors
  vadd: { min: 2, max: 2 },
  vsub: { min: 2, max: 2 },
  vscale: { min: 2, max: 2 },
  vlerp: { min: 3, max: 3 },
  vdot: { min: 2, max: 2 },
  vlen: { min: 1, max: 1 },
  vdist: { min: 2, max: 2 },
  vnorm: { min: 1, max: 1 },
  vrot: { min: 2, max: 2 },
  vheading: { min: 1, max: 1 },
  vfromheading: { min: 2, max: 2 },
  // §4.4 paths & curves
  pathlen: { min: 1, max: 1 },
  resample: { min: 2, max: 2 },
  chaikin: { min: 2, max: 2 },
  catmull: { min: 2, max: 2 },
  bezier: { min: 5, max: 5 },
  centroid: { min: 1, max: 1 },
  bbox: { min: 1, max: 1 },
  // §4.5 generators
  scatter: { min: 1, max: 2 },
  voronoi: { min: 1, max: 2 },
  triangulate: { min: 1, max: 1 },
  hull: { min: 1, max: 1 },
  relax: { min: 2, max: 2 },
  // §4.6 geometry ops
  offsetpath: { min: 2, max: 2 },
  clippaths: { min: 3, max: 3 },
  inpath: { min: 2, max: 2 },
  // §4.7 pure path transforms (companions to the transform block commands)
  xlate: { min: 3, max: 3 },
  xrotate: { min: 2, max: 4 },
  xscale: { min: 2, max: 3 },
  xmirror: { min: 2, max: 2 },
  // effects: pure path companions to the effect block commands
  warppath: { min: 2, max: 2 }, // warppath(path, @fn)
  humanizepath: { min: 2, max: 2 }, // humanizepath(path, amount)
  snappath: { min: 2, max: 6 }, // snappath(path, cell | …grid spec)
};

/** GEN_FUNCS whose given argument is a quoted word, with the allowed words. */
export const GEN_QWORD_ARG: Record<string, { index: number; allowed: readonly string[] }> = {
  clippaths: { index: 2, allowed: ['union', 'intersect', 'difference', 'xor'] },
};

/** Generative-math commands usable as statements (RFC-3 §4.4). */
export const GEN_CMDS: Record<string, { min: number; max: number }> = {
  sewpath: { min: 1, max: 1 },
};

// ---------- Stitch-history queries (closed-loop generation) ----------
//
// Same soft reservation as LIST_FUNCS / GEN_FUNCS: glued-call only, resolved
// after user procedures, never in RESERVED. These are pure, zero-draw,
// sewing-order *reporters* over the coverage grid the engine already maintains
// — they read accumulated state and branch on it, but consume no RNG and emit
// nothing, so "same seed → same design" holds. Point arguments are in the
// local (turtle) frame like pos()/distance and are mapped through the CTM;
// returned points are hoop-space fabric facts. Queries see committed
// (flushed) penetrations — a buffered satin column isn't visible until it ends.
export const QUERY_FUNCS: Record<string, { min: number; max: number }> = {
  coverat: { min: 1, max: 2 }, // coverat(p) | coverat(p, r) — coverage in layers
  countat: { min: 1, max: 1 }, // penetration count at p
  nearestsewn: { min: 1, max: 1 }, // closest prior penetration, or []
  sewnwithin: { min: 2, max: 2 }, // prior penetrations within r mm of p
  stitchedpoints: { min: 0, max: 0 }, // snapshot: a deep copy of all penetrations
};

/**
 * The Library tier (RFC-3 §3): built-in names a user definition may shadow,
 * with a one-time note instead of a hard error. Everything in RESERVED is
 * the Core tier (hard error, unchanged).
 */
export const LIBRARY_FUNCS = new Set<string>([
  ...Object.keys(LIST_FUNCS),
  ...Object.keys(LIST_CMDS),
  ...Object.keys(GEN_FUNCS),
  ...Object.keys(GEN_CMDS),
  ...Object.keys(QUERY_FUNCS),
]);

/** Words with special meaning that user procedures must not shadow. */
export const RESERVED = new Set<string>([
  'to',
  'end',
  'repeat',
  'if',
  'else',
  'make',
  'local',
  'while',
  'for',
  'output',
  'op',
  'exit',
  'and',
  'or',
  // Modern syntax (RFC-1). 'in' is reserved for future use; 'true'/'false'
  // lex as the numbers 1/0 but are reserved so definitions error loudly.
  'let',
  'def',
  'return',
  'step',
  'true',
  'false',
  'in',
  // Loop control (RFC-4).
  'break',
  'continue',
  // Programmable fills: `fill dir @d shape @s` arms the next beginfill…endfill.
  // `dir`/`shape` are only positional keywords after `fill`, so they are NOT
  // reserved globally — existing variables named dir/shape keep working.
  'fill',
  ...Object.keys(ALIASES),
  ...Object.keys(BUILTIN_ARITY),
  ...Object.keys(TRANSFORM_ARITY),
  ...Object.keys(EFFECT_ARITY),
  ...Object.keys(QWORD_BUILTINS),
  ...Object.keys(FUNC_ARITY),
  ...ZERO_FUNCS,
]);
