// ---------- Effects: nonlinear / stochastic point→point maps ----------
//
// Effects generalize transforms (see affine.ts): a transform is a fixed
// affine matrix mapping points on the way out; an effect is an arbitrary
// per-point function. Like transforms, they share one implementation between
// the block commands (warp / humanize / snaptogrid — see the interpreter's
// effect handler) and the pure path functions (warppath / humanizepath /
// snappath — see genFunc), so a block and the matching *path function produce
// the same map — a property the test suite pins.
//
// Two pipeline stages (the crux of the design):
//   • warp        — pre-split, post-CTM, *local* frame: it maps the emitted
//                   path vertices before stitch-length splitting, exactly like
//                   transforms, so `warp @f [ sewpath(P) ]` ≡ sewpath(warppath(P, @f)).
//   • humanize    — after split, hoop frame: perturbs individual penetrations.
//   • snaptogrid  — after split, *fixed* hoop lattice (evaluated outside any
//                   enclosing transform): quantizes penetrations to a shared grid.
//
// `warp`'s reporter is user code, so its map lives in the interpreter (it has
// to call procedures). The two built-in, parameterised maps live here.

import type { Pt } from './genmath.ts';
import { makeRNG } from './prng.ts';

export type PointMap = (x: number, y: number) => Pt;

const DEG = Math.PI / 180;

/**
 * `humanize`: coherent (not white) simplex jitter. A human's error is
 * correlated — the hand drifts — so each point is offset by simplex noise
 * sampled slowly (÷14) at the point's own coordinates, giving smooth wander
 * rather than per-stitch static. `amount` is the maximum offset in mm.
 *
 * `childSeed` is the seed of a forked child stream (the block draws exactly
 * one value from the main stream — RFC-3 §7's fork convention). It selects a
 * slice of the seeded noise field, so the same seed reproduces the same
 * "imperfections" while sibling humanize blocks each get their own wander.
 */
export function humanizeMap(
  amount: number,
  childSeed: number,
  snoise2: (x: number, y: number) => number,
): PointMap {
  // Two large, decorrelated offsets into noise space — one per output axis.
  const r = makeRNG(childSeed);
  const ox1 = r() * 1000, oy1 = r() * 1000;
  const ox2 = r() * 1000 + 2000, oy2 = r() * 1000 + 2000;
  const k = 1 / 14; // the slow-wander frequency
  return (x: number, y: number): Pt => [
    x + amount * snoise2(x * k + ox1, y * k + oy1),
    y + amount * snoise2(x * k + ox2, y * k + oy2),
  ];
}

/**
 * `snaptogrid`: quantize a point to a fixed lattice. The lattice is defined in
 * hoop space (origin + rotation are hoop-space values, never passed through a
 * CTM), so the same config yields the same snap targets regardless of any
 * enclosing translate/rotate/scale — pure, seed-independent, zero draws.
 *
 * The rotation uses the turtle convention (clockwise positive), matching
 * mRotate; for a symmetric grid the handedness is immaterial as long as the
 * forward and inverse rotations agree.
 */
export function snapMap(
  cellX: number,
  cellY: number,
  ox: number,
  oy: number,
  angDeg: number,
): PointMap {
  const ang = angDeg * DEG;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return (x: number, y: number): Pt => {
    // Into the grid frame (translate to origin, then rotate).
    const tx = x - ox, ty = y - oy;
    const gx = tx * ca - ty * sa;
    const gy = tx * sa + ty * ca;
    // Snap to the nearest lattice node.
    const sx = Math.round(gx / cellX) * cellX;
    const sy = Math.round(gy / cellY) * cellY;
    // Back to hoop space (inverse rotate, then translate back).
    return [sx * ca + sy * sa + ox, -sx * sa + sy * ca + oy];
  };
}

/**
 * Resolve the variable-arity grid spec shared by `snaptogrid` and `snappath`:
 *   [cell]                       square lattice at the origin
 *   [cellx, celly]               rectangular lattice
 *   [cellx, celly, ox, oy]       …with an origin offset
 *   [cellx, celly, ox, oy, ang]  …rotated (turtle degrees)
 * `fail` builds the (language-specific) error so this module stays DOM/engine
 * free. Returns the resolved PointMap.
 */
export function snapMapFromSpec(nums: number[], fail: (msg: string) => Error): PointMap {
  let cx: number, cy: number, ox = 0, oy = 0, ang = 0;
  switch (nums.length) {
    case 1: cx = cy = nums[0]; break;
    case 2: cx = nums[0]; cy = nums[1]; break;
    case 4: cx = nums[0]; cy = nums[1]; ox = nums[2]; oy = nums[3]; break;
    case 5: cx = nums[0]; cy = nums[1]; ox = nums[2]; oy = nums[3]; ang = nums[4]; break;
    default:
      throw fail(
        'takes a cell size as 1, 2, 4 or 5 numbers ' +
        '(cell | cellx celly | cellx celly ox oy | cellx celly ox oy ang), got ' + nums.length,
      );
  }
  if (!(cx > 0) || !(cy > 0)) throw fail('cell size must be a positive number');
  return snapMap(cx, cy, ox, oy, ang);
}
