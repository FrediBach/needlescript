// ---------- Affine transforms: the shared CTM math ----------
//
// One source of truth for transforms, used by both the block commands
// (translate/rotate/scale/… — see the interpreter's CTM stack) and the
// pure path functions (xlate/xrotate/xscale/xmirror — see genFunc). Because
// the two forms call the *same* matrices, a transform block and the matching
// x* function produce identical geometry — a property the test suite pins.
//
// Convention matches the rest of the language: a point is [x, y] in mm, and
// everything heading-like uses turtle degrees (0 = north/up, clockwise
// positive) — exactly like seth, vrot, atan and towards.

import type { Pt } from './genmath.ts';

/**
 * A 2×3 affine matrix [a, b, c, d, e, f] mapping
 *   (x, y) → (a·x + c·y + e,  b·x + d·y + f)
 * The linear part is [a, b, c, d]; the translation is (e, f).
 */
export type Mat = [number, number, number, number, number, number];

const DEG = Math.PI / 180;

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function isIdentity(m: Mat): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

/** Map a point through the full affine (linear part + translation). */
export function apply(m: Mat, x: number, y: number): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Map a *direction* through the linear part only (no translation). */
export function linApply(m: Mat, x: number, y: number): Pt {
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
}

/**
 * Invert an affine matrix, or return null if it is degenerate (|det| ≈ 0,
 * e.g. a scale-to-zero). Used by the programmable fill to map an
 * engine-chosen hoop sample point back to local space before handing it to
 * a field/shape reporter, so reporters always see local coordinates (§6)
 * while placement runs in physical hoop space.
 */
export function invert(m: Mat): Mat | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!(Math.abs(det) > 1e-12)) return null;
  const id = 1 / det;
  const a = m[3] * id;
  const b = -m[1] * id;
  const c = -m[2] * id;
  const d = m[0] * id;
  // translation: -(A^{-1}) · t
  const e = -(a * m[4] + c * m[5]);
  const f = -(b * m[4] + d * m[5]);
  return [a, b, c, d, e, f];
}

/**
 * Compose so the result maps p → outer(inner(p)). Nesting transform blocks
 * composes this way: `translate … [ rotate … [ … ] ]` builds
 * compose(translate, rotate), i.e. the inner (rotate) is applied first —
 * OpenSCAD's inside-out reading.
 */
export function compose(o: Mat, i: Mat): Mat {
  return [
    o[0] * i[0] + o[2] * i[1],
    o[1] * i[0] + o[3] * i[1],
    o[0] * i[2] + o[2] * i[3],
    o[1] * i[2] + o[3] * i[3],
    o[0] * i[4] + o[2] * i[5] + o[4],
    o[1] * i[4] + o[3] * i[5] + o[5],
  ];
}

// ---------- Constructors (turtle conventions) ----------

export const mTranslate = (dx: number, dy: number): Mat => [1, 0, 0, 1, dx, dy];

export const mScaleXY = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];

export const mScale = (s: number): Mat => mScaleXY(s, s);

/**
 * Rotate clockwise for positive deg (matches rt / vrot): the per-point result
 * is bit-identical to vrot, so xrotate ≡ vrot on every vertex.
 */
export function mRotate(deg: number): Mat {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  // x' = x·cos + y·sin ; y' = −x·sin + y·cos  (clockwise)
  return [c, -s, s, c, 0, 0];
}

/** Rotate clockwise about an explicit pivot (cx, cy). */
export function mRotateAbout(deg: number, cx: number, cy: number): Mat {
  return compose(mTranslate(cx, cy), compose(mRotate(deg), mTranslate(-cx, -cy)));
}

/**
 * Reflect across a line through the origin at turtle heading `deg`.
 * mirror 0 flips left/right (x → −x); mirror 90 flips top/bottom (y → −y).
 */
export function mMirror(deg: number): Mat {
  // Unit direction of the mirror line, in turtle space.
  const ux = Math.sin(deg * DEG), uy = Math.cos(deg * DEG);
  return [2 * ux * ux - 1, 2 * ux * uy, 2 * ux * uy, 2 * uy * uy - 1, 0, 0];
}

/**
 * Shear by ax / ay degrees: x' = x + tan(ax)·y ; y' = tan(ay)·x + y.
 * The origin is fixed.
 */
export function mSkew(ax: number, ay: number): Mat {
  return [1, Math.tan(ay * DEG), Math.tan(ax * DEG), 1, 0, 0];
}

/** Raw 2×3 affine escape hatch for the power user. */
export const mRaw = (a: number, b: number, c: number, d: number, e: number, f: number): Mat =>
  [a, b, c, d, e, f];

/** Map every point of a path through the matrix, returning a new array. */
export const applyPath = (m: Mat, pts: Pt[]): Pt[] => pts.map(p => apply(m, p[0], p[1]));
