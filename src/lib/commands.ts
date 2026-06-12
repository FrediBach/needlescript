// ---------- Command tables ----------

export const ALIASES: Record<string, string> = {
  forward: 'fd', back: 'bk', backward: 'bk', right: 'rt', left: 'lt',
  penup: 'up', pendown: 'down', pu: 'up', pd: 'down',
  setheading: 'seth', clearscreen: 'cs', clear: 'cs', stitchlength: 'stitchlen',
};

export const BUILTIN_ARITY: Record<string, number> = {
  fd: 1, bk: 1, rt: 1, lt: 1,
  up: 0, down: 0, home: 0, cs: 0,
  setxy: 2, setx: 1, sety: 1, seth: 1,
  arc: 2, push: 0, pop: 0,
  stitchlen: 1, satin: 1, density: 1,
  bean: 1, estitch: 1,
  beginfill: 0, endfill: 0, fillangle: 1, fillspacing: 1, filllen: 1,
  lock: 1,
  pullcomp: 1, shortstitch: 1, autotrim: 1, maxdensity: 1,
  color: 1, stop: 0, trim: 0,
  seed: 1, print: 1, mark: 0, assert: 1,
};

/** Builtins that take a single quoted-word argument, with their allowed words. */
export const QWORD_BUILTINS: Record<string, readonly string[]> = {
  fabric: ['woven', 'knit', 'stretch', 'denim', 'canvas', 'fleece'],
  underlay: ['auto', 'center', 'edge', 'zigzag', 'off'],
  fillunderlay: ['auto', 'tatami', 'edge', 'off'],
};

/** Fabric presets: how much the fabric distorts and how much stitching it tolerates. */
export const FABRICS: Record<string, {
  pull: number;          // pull compensation in mm
  maxDensity: number;    // thread coverage warning threshold, in layers
  densityFloor?: number; // minimum satin penetration spacing in mm
  doubleUnderlay?: boolean;
  note?: string;
}> = {
  woven:   { pull: 0.2,  maxDensity: 3.5 },
  knit:    { pull: 0.5,  maxDensity: 3.0, densityFloor: 0.45 },
  stretch: { pull: 0.6,  maxDensity: 2.8, densityFloor: 0.5 },
  denim:   { pull: 0.15, maxDensity: 4.0 },
  canvas:  { pull: 0.15, maxDensity: 4.0 },
  fleece:  {
    pull: 0.3, maxDensity: 2.6, doubleUnderlay: true,
    note: 'fleece: consider a water-soluble topping so stitches don\u2019t sink into the pile',
  },
};

export const FUNC_ARITY: Record<string, number> = {
  random: 1, sin: 1, cos: 1, sqrt: 1, abs: 1, round: 1, mod: 2,
  floor: 1, ceil: 1, min: 2, max: 2, pow: 2, atan: 2,
  noise: 1, noise2: 2, distance: 2, towards: 2,
  not: 1,
};

export const ZERO_FUNCS = new Set(['repcount', 'xcor', 'ycor', 'heading']);

/** Words with special meaning that user procedures must not shadow. */
export const RESERVED = new Set<string>([
  'to', 'end', 'repeat', 'if', 'else', 'make', 'local',
  'while', 'for', 'output', 'op', 'exit', 'and', 'or',
  // Modern syntax (RFC-1). 'in' is reserved for future use; 'true'/'false'
  // lex as the numbers 1/0 but are reserved so definitions error loudly.
  'let', 'def', 'return', 'step', 'true', 'false', 'in',
  ...Object.keys(ALIASES),
  ...Object.keys(BUILTIN_ARITY),
  ...Object.keys(QWORD_BUILTINS),
  ...Object.keys(FUNC_ARITY),
  ...ZERO_FUNCS,
]);
