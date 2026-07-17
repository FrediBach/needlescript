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
  // DX improvements
  jump: 'moveto', // embroiderer term for a non-sewing travel
};

/**
 * Commands that accept one required argument plus one optional trailing argument.
 * The value is the count of optional extras (currently always 1).
 * Both prefix form `cmd arg [opt]` and glued-call form `cmd(arg[, opt])` are
 * handled. The optional arg is consumed only when the next token is an
 * unambiguous expression start (number, variable, list, paren, @-ref, string).
 */
export const BUILTIN_ARITY_OPT: Record<string, number> = {
  stitchlen: 1, // optional phase offset for the list form: stitchlen [4, 1.5] 1
  filllen: 1, // optional phase offset for the list form: filllen [3, 1.5] 1
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
  // DX: moveto x y — reposition without sewing, pen state restored afterward.
  // gohome — pen-safe return to origin (≡ moveto 0 0).
  // circle r — full circle (≡ arc 360 r).
  moveto: 2,
  gohome: 0,
  circle: 1,
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
  palette: 1,
  background: 1,
  stop: 0,
  trim: 0,
  seed: 1,
  print: 1,
  printloc: 0,
  // mark, assert handled specially in the parser (optional/variadic args)
  // chalk is also special-cased (one required + two optional arguments)
  // fabric, underlay, fillunderlay handled specially (string mode args)
  fabric: 1,
  underlay: 1,
  fillunderlay: 1,
  // Hoop and override directives (§hoop, §override). Both are Core words and
  // accept mixed argument types (string / number / list for hoop; string +
  // number for override), so they are handled before the bulk num() conversion
  // in interpreter.ts — but still registered here for arity and RESERVED.
  hoop: 1,
  override: 2,
  plan: 1,
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
  declump: { min: 1, max: 2 }, // limit [maxshift] — default maxshift 1.5 mm
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
  // Higher-order list functions
  steps: { min: 2, max: 3 }, // steps(start, end) or steps(start, end, step)
  map: { min: 2, max: 2 }, // map(list, @fn)
  filter: { min: 2, max: 2 }, // filter(list, @fn)
  reduce: { min: 3, max: 3 }, // reduce(list, @fn, initial)
  compose: { min: 2, max: 16 }, // compose(@fn1, @fn2, …) — left-to-right pipeline
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
  rgb: { min: 3, max: 3 },
  hsl: { min: 3, max: 3 },
  hexparts: { min: 1, max: 1 },
  lerpcolor: { min: 3, max: 4 },
  nearestcolor: { min: 2, max: 2 },
  colordist: { min: 2, max: 2 },
  slotcolor: { min: 1, max: 1 },
  colorindex: { min: 0, max: 0 },
  colorhex: { min: 0, max: 0 },
  backgroundcolor: { min: 0, max: 0 },
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
  // §4.3b segments
  segisect: { min: 4, max: 4 },
  segdist: { min: 3, max: 3 },
  nearestonpath: { min: 2, max: 2 },
  // §4.4 paths & curves
  pathlen: { min: 1, max: 1 },
  resample: { min: 2, max: 3 }, // resample(path, mm) | resample(path, [pat]) | resample(path, [pat], phase) | resample(path, @fn)
  chaikin: { min: 2, max: 2 },
  catmull: { min: 2, max: 2 },
  bezier: { min: 5, max: 5 },
  centroid: { min: 1, max: 1 },
  bbox: { min: 1, max: 1 },
  routesort: { min: 1, max: 3 },
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
  // §hoop: field reporters (Library tier, same soft-reservation as inpath/bbox).
  infield: { min: 1, max: 1 }, // infield(p) → 0|1 — is p inside the sewable field?
  fieldbounds: { min: 0, max: 0 }, // fieldbounds() → [minX, minY, maxX, maxY]
  fieldpath: { min: 0, max: 0 }, // fieldpath() → boundary polygon (CCW region)
  // §4.7 pure path transforms (companions to the transform block commands)
  xlate: { min: 3, max: 3 },
  xrotate: { min: 2, max: 4 },
  xscale: { min: 2, max: 3 },
  xmirror: { min: 2, max: 2 },
  // effects: pure path companions to the effect block commands
  warppath: { min: 2, max: 2 }, // warppath(path, @fn)
  humanizepath: { min: 2, max: 2 }, // humanizepath(path, amount)
  snappath: { min: 2, max: 6 }, // snappath(path, cell | …grid spec)
  declumppath: { min: 2, max: 3 }, // declumppath(path, limit) | declumppath(path, limit, maxshift)
  // DX: satin-tuple helpers — build the 5-number contract list by intent
  satinpair: { min: 2, max: 2 }, // (advance, width)  ≡ [advance, width, width, 0, 0]
  satinrake: { min: 3, max: 3 }, // (advance, width, lag) ≡ [advance, width, width, -lag, lag]
  satinasym: { min: 3, max: 3 }, // (advance, leftw, rightw) ≡ [advance, leftw, rightw, 0, 0]
  // DX: fill-shaper helper — build the 3-number contract list for a standard tatami row
  tatamirow: { min: 2, max: 3 }, // (spacing, len) or (spacing, len, phase) ≡ [spacing, len, phase]
  contourpaths: { min: 2, max: 2 },
  spiralpath: { min: 2, max: 2 },
  fillrows: { min: 3, max: 3 },
  closepath: { min: 1, max: 1 },
  railinset: { min: 2, max: 2 },
  railrake: { min: 2, max: 2 },
  railspine: { min: 2, max: 2 },
};

/** GEN_FUNCS whose given argument is a quoted word, with the allowed words. */
export const GEN_QWORD_ARG: Record<string, { index: number; allowed: readonly string[] }> = {
  clippaths: { index: 2, allowed: ['union', 'intersect', 'difference', 'xor'] },
};

/** Generative-math commands usable as statements (RFC-3 §4.4). */
export const GEN_CMDS: Record<string, { min: number; max: number }> = {
  sewpath: { min: 1, max: 1 },
  satinbetween: { min: 2, max: 4 },
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

// ---------- String builtins ----------
//
// Same soft reservation as LIST_FUNCS: glued-call only, Library tier (user
// procedures can shadow them with a one-time note). No new reserved words.
// Determinism: all are pure / zero-draw like snaptogrid's scalar companions —
// no rows added to the fork-convention table.

/** String functions usable in expressions, with min/max argument counts. */
export const STRING_FUNCS: Record<string, { min: number; max: number }> = {
  str: { min: 1, max: 1 }, // str(v) → string rendering of a number; identity on string
  num: { min: 1, max: 2 }, // num(s) or num(s, fallback)
  isstring: { min: 1, max: 1 }, // 1/0 predicate
  chars: { min: 1, max: 1 }, // string → list of 1-char strings
  split: { min: 2, max: 2 }, // split(s, sep) → list of strings
  joinstr: { min: 2, max: 2 }, // joinstr(xs, sep) → string
  upper: { min: 1, max: 1 }, // ASCII uppercase
  lower: { min: 1, max: 1 }, // ASCII lowercase
  strip: { min: 1, max: 1 }, // trim leading/trailing whitespace
  repeatstr: { min: 2, max: 2 }, // repeatstr(s, n)
};

/**
 * The Library tier (RFC-3 §3): built-in names a user definition may shadow,
 * with a one-time note instead of a hard error. Everything in RESERVED is
 * the Core tier (hard error, unchanged).
 */
export const LIBRARY_FUNCS = new Set<string>([
  ...ZERO_FUNCS,
  ...Object.keys(LIST_FUNCS),
  ...Object.keys(LIST_CMDS),
  ...Object.keys(GEN_FUNCS),
  ...Object.keys(GEN_CMDS).filter((name) => name !== 'satinbetween'),
  ...Object.keys(QUERY_FUNCS),
  ...Object.keys(STRING_FUNCS),
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
  // Source modules. `as` is reserved so import aliases stay unambiguous.
  'import',
  'export',
  'as',
  // 'step' is intentionally NOT reserved. It is a positional keyword recognised
  // only inside a modern `for` header (after the `to <expr>` position), exactly
  // like `dir`/`shape` after `fill`.  Everywhere else — variable names,
  // parameters, procedure definitions — `step` is an ordinary identifier.
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
  // Trace (RFC-trace): block expressions that capture turtle paths as data.
  'trace',
  'tracerings',
  'satinbetween',
  ...Object.keys(ALIASES),
  ...Object.keys(BUILTIN_ARITY),
  ...Object.keys(TRANSFORM_ARITY),
  ...Object.keys(EFFECT_ARITY),
  ...Object.keys(QWORD_BUILTINS),
  ...Object.keys(FUNC_ARITY),
  // Special-cased commands (not in BUILTIN_ARITY but still Core):
  'mark',
  'chalk',
  'assert',
]);
