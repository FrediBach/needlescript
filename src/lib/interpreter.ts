// ---------- Interpreter ----------

import type { ASTNode, ExprNode, RunResult, RunOptions, WarningLocation } from './types.ts';
import { NeedlescriptError } from './errors.ts';
import { makeRNG, makeNoise, fork, gauss } from './prng.ts';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { FABRICS, GEN_FUNCS, QUERY_FUNCS } from './commands.ts';
import { Machine, LIMITS } from './machine.ts';
import { tokenize } from './tokenizer.ts';
import { parse } from './parser.ts';
import { applyAutoTrim, applyLocks } from './postprocess.ts';
import { didYouMean } from './suggestions.ts';
import {
  NsList,
  FuncRef,
  isList,
  isFuncRef,
  num,
  deepEqual,
  deepCopy,
  valDepth,
  describeVal,
  formatNum,
  formatVal,
} from './list.ts';
import type { Val } from './list.ts';
import * as gm from './genmath.ts';
import type { Pt } from './genmath.ts';
import { offsetRegion, clipRegions } from './geometry.ts';
import { scatter, voronoiCells, triangulate, hull, relax } from './generators.ts';
import type { Domain } from './generators.ts';
import {
  applyPath,
  apply,
  mTranslate,
  mRotate,
  mRotateAbout,
  mScale,
  mScaleXY,
  mMirror,
  mSkew,
  mRaw,
} from './affine.ts';
import type { Mat } from './affine.ts';
import { humanizeMap, snapMapFromSpec } from './effects.ts';

/** Thrown by `output` / `exit` to unwind to the enclosing procedure call. */
class ReturnSignal {
  readonly value: Val | undefined;
  constructor(value: Val | undefined) {
    this.value = value;
  }
}

/**
 * Thrown by `break` / `continue` to unwind to the innermost enclosing loop
 * (RFC-4). Parse-time validation guarantees a loop catches it before any
 * procedure boundary; the catches in callProc and at the top level are
 * defensive only.
 */
class LoopSignal {
  readonly kind: 'break' | 'continue';
  readonly line?: number;
  constructor(kind: 'break' | 'continue', line?: number) {
    this.kind = kind;
    this.line = line;
  }
}

export function run(source: string, opts: RunOptions = {}): RunResult {
  const tokens = tokenize(source);
  const parseNotes: string[] = [];
  const program = parse(tokens, parseNotes);
  const m = new Machine();
  m.warnings.push(...parseNotes);
  const globals: Record<string, Val> = Object.create(null);
  const procs: Record<string, ASTNode & { k: 'to' }> = Object.create(null);
  const seed0 = opts.seed !== undefined ? opts.seed : 42;
  let rng = makeRNG(seed0);
  let noise = makeNoise(seed0);
  // Seeded simplex noise (RFC-3 §4.2): permutation tables built from the
  // seed at seed time, on a stream of their own — same seed, same field,
  // forever, and zero draws from the main stream.
  let snoise2 = createNoise2D(makeRNG(seed0));
  let snoise3 = createNoise3D(makeRNG(seed0 ^ 0x9e3779b9));
  let ops = 0;
  /** Live list cells (slots). Decremented by removeat; lists that simply go
   *  out of reach stay counted — the counter is a tab-protecting ceiling,
   *  not a garbage collector. */
  let cells = 0;
  const printed: string[] = [];

  function tick(line?: number) {
    if (++ops > LIMITS.maxOps) throw new NeedlescriptError(overlongMsg(), line);
  }

  /** Charge n element reads/writes against the op budget. */
  function tickN(n: number, line?: number) {
    ops += n;
    if (ops > LIMITS.maxOps) throw new NeedlescriptError(overlongMsg(), line);
  }

  /** The op-limit message, made loop-aware once a history query has run. */
  function overlongMsg(): string {
    return (
      'Program ran too long (possible infinite loop) — stopped' +
      (m.usedQuery
        ? ' — a feedback loop may not be terminating; is your coverage target reachable? Cap it with  repeat N [ … if done [ break ] ].'
        : '')
    );
  }

  /** Charge n freshly allocated list cells (and the op budget). */
  function charge(n: number, line?: number) {
    cells += n;
    if (cells > LIMITS.maxListCells)
      throw new NeedlescriptError(
        `Too many list cells (over ${LIMITS.maxListCells.toLocaleString('en-US')}) — stopped`,
        line,
      );
    tickN(n, line);
  }

  /** Allocate a new list, enforcing the length limit and charging cells. */
  function allocList(items: Val[], line?: number): NsList {
    if (items.length > LIMITS.maxListLen)
      throw new NeedlescriptError(
        `List too long (${items.length.toLocaleString('en-US')} elements, limit ${LIMITS.maxListLen.toLocaleString('en-US')})`,
        line,
      );
    charge(items.length, line);
    return new NsList(items);
  }

  /** A condition must be a number; a list is a loud error (RFC-2 §2). */
  function truthy(v: Val, what: string, line?: number): number {
    if (isList(v))
      throw new NeedlescriptError(
        `"${what}" got ${describeVal(v)} — a list isn't true or false, use len(xs) > 0`,
        line,
      );
    if (typeof v !== 'number')
      throw new NeedlescriptError(
        `"${what}" got ${describeVal(v)} — that isn't true or false`,
        line,
      );
    return v;
  }

  /**
   * Normalize an index into a list of length `len`: must be a number,
   * integral within 1e-9, negatives count from the end, out of range
   * (either direction) is an error.
   */
  function toIndex(v: Val, len: number, what: string, line?: number): number {
    const n = num(v, what, line);
    const r = Math.round(n);
    if (Math.abs(n - r) > 1e-9)
      throw new NeedlescriptError(
        `${what}: index ${formatNum(n)} isn't a whole number — use floor() deliberately`,
        line,
      );
    const i = r < 0 ? r + len : r;
    if (i < 0 || i >= len)
      throw new NeedlescriptError(
        `${what}: index ${r} is out of range (the list has ${len} element${len === 1 ? '' : 's'})`,
        line,
      );
    return i;
  }

  /** The value must be a list. */
  function list(v: Val, what: string, line?: number): NsList {
    if (!isList(v)) throw new NeedlescriptError(`"${what}" expected a list, got a number`, line);
    return v;
  }

  /** Check that nesting an element one level deeper stays within the cap. */
  function checkDepth(v: Val, line?: number) {
    if (isList(v) && valDepth(v) + 1 > LIMITS.maxListDepth)
      throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`, line);
  }

  function listFunc(name: string, args: Val[], line: number | undefined): Val {
    switch (name) {
      case 'range': {
        const a = args.length === 1 ? 0 : num(args[0], 'range', line);
        const b = args.length === 1 ? num(args[0], 'range', line) : num(args[1], 'range', line);
        const s = args.length === 3 ? num(args[2], 'range', line) : 1;
        if (s === 0) throw new NeedlescriptError("range step can't be 0", line);
        const count = Math.max(0, Math.ceil((b - a) / s - 1e-9));
        if (count > LIMITS.maxListLen)
          throw new NeedlescriptError(
            `List too long (${count.toLocaleString('en-US')} elements, limit ${LIMITS.maxListLen.toLocaleString('en-US')})`,
            line,
          );
        const out: Val[] = [];
        for (let k = 0; k < count; k++) out.push(a + k * s);
        return allocList(out, line);
      }
      case 'filled': {
        const n = num(args[0], 'filled', line);
        const r = Math.round(n);
        if (Math.abs(n - r) > 1e-9 || r < 0)
          throw new NeedlescriptError(
            `filled expected a whole number of elements, got ${formatNum(n)}`,
            line,
          );
        if (r > LIMITS.maxListLen)
          throw new NeedlescriptError(
            `List too long (${r.toLocaleString('en-US')} elements, limit ${LIMITS.maxListLen.toLocaleString('en-US')})`,
            line,
          );
        const out: Val[] = [];
        for (let k = 0; k < r; k++) out.push(deepCopy(args[1], () => charge(1, line)));
        return allocList(out, line);
      }
      case 'len':
        return list(args[0], 'len', line).items.length;
      case 'islist':
        return isList(args[0]) ? 1 : 0;
      case 'first': {
        const xs = list(args[0], 'first', line);
        if (xs.items.length === 0) throw new NeedlescriptError('first of an empty list', line);
        return xs.items[0];
      }
      case 'last': {
        const xs = list(args[0], 'last', line);
        if (xs.items.length === 0) throw new NeedlescriptError('last of an empty list', line);
        return xs.items[xs.items.length - 1];
      }
      case 'concat': {
        const a = list(args[0], 'concat', line);
        const b = list(args[1], 'concat', line);
        // shallow: elements are shared references
        return allocList([...a.items, ...b.items], line);
      }
      case 'slice': {
        const xs = list(args[0], 'slice', line);
        const len = xs.items.length;
        // Python window semantics: negatives from the end, then clamped —
        // slice is the one place clamping is fine (a window, not an address).
        const norm = (v: Val | undefined, dflt: number) => {
          if (v === undefined) return dflt;
          const n = Math.trunc(num(v, 'slice', line));
          return Math.min(len, Math.max(0, n < 0 ? n + len : n));
        };
        const a = norm(args[1], 0);
        const b = norm(args[2], len);
        return allocList(xs.items.slice(a, b), line);
      }
      case 'reverse': {
        const xs = list(args[0], 'reverse', line);
        return allocList([...xs.items].reverse(), line);
      }
      case 'sort': {
        const xs = list(args[0], 'sort', line);
        xs.items.forEach((v, i) => {
          if (isList(v))
            throw new NeedlescriptError(
              `sort can only sort numbers — element ${i} is a list`,
              line,
            );
        });
        return allocList(
          [...(xs.items as number[])].sort((a, b) => a - b),
          line,
        );
      }
      case 'copy':
        return deepCopy(args[0], () => charge(1, line));
      case 'indexof': {
        const xs = list(args[0], 'indexof', line);
        for (let i = 0; i < xs.items.length; i++) {
          tick(line);
          if (deepEqual(xs.items[i], args[1])) return i;
        }
        return -1;
      }
      case 'contains': {
        const xs = list(args[0], 'contains', line);
        for (const x of xs.items) {
          tick(line);
          if (deepEqual(x, args[1])) return 1;
        }
        return 0;
      }
      case 'sum':
      case 'mean':
      case 'minof':
      case 'maxof': {
        const xs = list(args[0], name, line);
        if (xs.items.length === 0) {
          if (name === 'sum') return 0;
          throw new NeedlescriptError(`${name} of an empty list`, line);
        }
        tickN(xs.items.length, line);
        let acc = num(xs.items[0], name, line);
        for (let i = 1; i < xs.items.length; i++) {
          const v = num(xs.items[i], name, line);
          if (name === 'minof') acc = Math.min(acc, v);
          else if (name === 'maxof') acc = Math.max(acc, v);
          else acc += v;
        }
        return name === 'mean' ? acc / xs.items.length : acc;
      }
      case 'pick': {
        const xs = list(args[0], 'pick', line);
        if (xs.items.length === 0) throw new NeedlescriptError('pick of an empty list', line);
        return xs.items[Math.floor(rng() * xs.items.length)]; // one RNG draw
      }
      case 'shuffle': {
        const xs = list(args[0], 'shuffle', line);
        const out = [...xs.items];
        // Fork convention (RFC-3 §7, amending RFC-2): exactly one draw from
        // the main stream seeds a child RNG; Fisher–Yates runs on the child,
        // high index down to 1. Inserting a shuffle shifts downstream
        // randomness by exactly one draw, regardless of list length.
        const child = fork(rng);
        for (let i = out.length - 1; i >= 1; i--) {
          const j = Math.floor(child() * (i + 1));
          const t = out[i];
          out[i] = out[j];
          out[j] = t;
        }
        return allocList(out, line);
      }
      case 'pos':
        return allocList([m.x, m.y], line);
      case 'removeat': {
        const xs = list(args[0], 'removeat', line);
        const i = toIndex(args[1], xs.items.length, 'removeat', line);
        const removed = xs.items.splice(i, 1)[0];
        cells -= 1;
        tick(line);
        return removed;
      }
    }
    throw new NeedlescriptError(`Unknown function ${name}`, line);
  }

  // ---------- Generative math dispatcher (RFC-3) ----------
  //
  // Converts list values to plain points/paths (loud shape errors naming
  // the function), calls the pure modules, charges the op/cell budgets on
  // the way back. Draw accounting (§7): gauss = 2 direct draws; scatter and
  // shuffle draw exactly 1 and fork; voronoi/relax/… draw 0.

  function genFunc(name: string, args: Val[], line: number | undefined, word?: string): Val {
    const sc = (i: number) => num(args[i], name, line);
    const pointArg = (i: number) => gm.toPoint(args[i], name, line);
    const pathArg = (i: number, min = 2) => gm.toPath(args[i], name, line, min);
    const regionArg = (i: number) => gm.toRegion(args[i], name, line);
    const point = (p: Pt) => allocList([p[0], p[1]], line);
    const path = (pts: Pt[]) => gm.fromPoints(pts, (items) => allocList(items, line));
    const regions = (rs: Pt[][]) =>
      allocList(
        rs.map((r) => path(r) as Val),
        line,
      );
    const domainArg = (i: number): Domain =>
      args.length > i
        ? { kind: 'poly', pts: regionArg(i) }
        : { kind: 'disc', r: LIMITS.sewableRadius };
    const delaunayInput = (i: number, min: number) => {
      const pts = pathArg(i, min);
      if (pts.length > LIMITS.maxDelaunayPoints)
        throw new NeedlescriptError(
          `${name}: too many points (${pts.length.toLocaleString('en-US')}, limit ${LIMITS.maxDelaunayPoints.toLocaleString('en-US')})`,
          line,
        );
      tickN(pts.length, line);
      return pts;
    };

    switch (name) {
      // ----- §4.1 scalars -----
      case 'lerp':
        return gm.lerp(sc(0), sc(1), sc(2));
      case 'remap':
        return gm.remap(sc(0), sc(1), sc(2), sc(3), sc(4));
      case 'clamp':
        return gm.clamp(sc(0), sc(1), sc(2));
      case 'smoothstep':
        return gm.smoothstep(sc(0), sc(1), sc(2));
      case 'gauss':
        return gauss(rng, sc(0), sc(1)); // exactly 2 main-stream draws

      // ----- §4.2 noise (range −1…1; legacy noise/noise2 keep 0…1) -----
      case 'snoise2':
        return snoise2(sc(0), sc(1));
      case 'snoise3':
        return snoise3(sc(0), sc(1), sc(2));
      case 'fbm2': {
        const x = sc(0),
          y = sc(1);
        const want = Math.round(sc(2));
        const oct = gm.clamp(want, 1, 8);
        if (oct !== want)
          m.warnings.push(`fbm2 octaves ${formatNum(sc(2))} clamped to ${oct} (range 1–8)`);
        let sum = 0,
          ampSum = 0,
          amp = 1,
          freq = 1;
        for (let o = 0; o < oct; o++) {
          sum += snoise2(x * freq, y * freq) * amp;
          ampSum += amp;
          amp *= 0.5;
          freq *= 2; // lacunarity 2.0, gain 0.5 (§4.2)
        }
        return sum / ampSum;
      }

      // ----- §4.3 vectors -----
      case 'vadd':
        return point(gm.vadd(pointArg(0), pointArg(1)));
      case 'vsub':
        return point(gm.vsub(pointArg(0), pointArg(1)));
      case 'vscale':
        return point(gm.vscale(pointArg(0), sc(1)));
      case 'vlerp':
        return point(gm.vlerp(pointArg(0), pointArg(1), sc(2)));
      case 'vdot':
        return gm.vdot(pointArg(0), pointArg(1));
      case 'vlen':
        return gm.vlen(pointArg(0));
      case 'vdist':
        return gm.vdist(pointArg(0), pointArg(1));
      case 'vnorm':
        return point(gm.vnorm(pointArg(0), line));
      case 'vrot':
        return point(gm.vrot(pointArg(0), sc(1)));
      case 'vheading':
        return gm.vheading(pointArg(0));
      case 'vfromheading':
        return point(gm.vfromheading(sc(0), sc(1)));

      // ----- §4.3b segments -----
      case 'segisect': {
        const r = gm.segisect(pointArg(0), pointArg(1), pointArg(2), pointArg(3));
        return r ? point(r) : allocList([], line);
      }
      case 'segdist':
        return gm.segdist(pointArg(0), pointArg(1), pointArg(2));
      case 'nearestonpath': {
        const p = pointArg(0);
        const pts = gm.toPath(args[1], name, line, 1);
        tickN(pts.length, line);
        return point(gm.nearestOnPath(p, pts, line));
      }

      // ----- §4.4 paths & curves -----
      case 'pathlen': {
        const p = pathArg(0);
        tickN(p.length, line);
        return gm.pathlen(p);
      }
      case 'resample':
        return path(gm.resample(pathArg(0), sc(1), LIMITS.maxListLen, line));
      case 'chaikin': {
        const p = pathArg(0);
        const want = Math.round(sc(1));
        const n = gm.clamp(want, 1, 6);
        if (n !== want)
          m.warnings.push(`chaikin iterations ${formatNum(sc(1))} clamped to ${n} (range 1–6)`);
        if (p.length * Math.pow(2, n) > LIMITS.maxListLen)
          throw new NeedlescriptError(
            `List too long (chaikin would produce over ${LIMITS.maxListLen.toLocaleString('en-US')} points)`,
            line,
          );
        return path(gm.chaikin(p, n));
      }
      case 'catmull':
        return path(gm.catmull(pathArg(0), sc(1), LIMITS.maxListLen, line));
      case 'bezier':
        return path(
          gm.bezier(
            pointArg(0),
            pointArg(1),
            pointArg(2),
            pointArg(3),
            sc(4),
            LIMITS.maxListLen,
            line,
          ),
        );
      case 'centroid':
        return point(gm.centroid(pathArg(0)));
      case 'bbox': {
        const [minx, miny, maxx, maxy] = gm.bbox(pathArg(0));
        return allocList([minx, miny, maxx, maxy], line);
      }

      // ----- §4.5 generators -----
      case 'scatter': {
        // fork convention (§7): exactly one main-stream draw
        const pts = scatter(sc(0), domainArg(1), fork(rng), LIMITS.maxScatterPoints, line);
        tickN(pts.length * 4, line);
        return path(pts.length ? pts : []);
      }
      case 'voronoi': {
        const pts = delaunayInput(0, 1);
        const cells = voronoiCells(pts, domainArg(1), line);
        tickN(pts.length * 8, line);
        return allocList(
          cells.map((c) => (c.length ? path(c) : allocList([], line)) as Val),
          line,
        );
      }
      case 'triangulate': {
        const pts = delaunayInput(0, 3);
        const tris = triangulate(pts, line);
        return allocList(
          tris.map(([a, b, c]) => path([pts[a], pts[b], pts[c]]) as Val),
          line,
        );
      }
      case 'hull':
        return path(hull(delaunayInput(0, 3), line));
      case 'relax': {
        const pts = delaunayInput(0, 1);
        const want = Math.round(sc(1));
        const n = gm.clamp(want, 0, 50);
        if (n !== want)
          m.warnings.push(`relax iterations ${formatNum(sc(1))} clamped to ${n} (range 0–50)`);
        tickN(pts.length * 8 * Math.max(1, n), line);
        return path(relax(pts, n, { kind: 'disc', r: LIMITS.sewableRadius }, line));
      }

      // ----- §4.6 geometry ops -----
      case 'offsetpath': {
        const r = regionArg(0);
        tickN(r.length * 4, line);
        return regions(offsetRegion(r, sc(1), line));
      }
      case 'clippaths': {
        const a = regionArg(0),
          b = regionArg(1);
        tickN((a.length + b.length) * 4, line);
        return regions(clipRegions(a, b, word as string, line));
      }
      case 'inpath':
        return gm.pointInRegion(pointArg(0), regionArg(1)) ? 1 : 0;

      // ----- §4.7 pure path transforms (companions to the block commands) -----
      case 'xlate':
        return path(applyPath(mTranslate(sc(1), sc(2)), pathArg(0)));
      case 'xrotate': {
        if (args.length === 3)
          throw new NeedlescriptError(
            'xrotate takes a pivot as two numbers: xrotate(path, deg, cx, cy)',
            line,
          );
        const m = args.length >= 4 ? mRotateAbout(sc(1), sc(2), sc(3)) : mRotate(sc(1));
        return path(applyPath(m, pathArg(0)));
      }
      case 'xscale': {
        const m = args.length >= 3 ? mScaleXY(sc(1), sc(2)) : mScale(sc(1));
        return path(applyPath(m, pathArg(0)));
      }
      case 'xmirror':
        return path(applyPath(mMirror(sc(1)), pathArg(0)));

      // ----- effects: pure path companions to the effect block commands -----
      // The block forms are sugar over these same maps (effects §): a block
      // applies the map to emitted penetrations, the function maps an explicit
      // point list — pinned identical on pre-resampled paths.
      case 'warppath': {
        const p = pathArg(0);
        if (!isFuncRef(args[1]))
          throw new NeedlescriptError(
            'warppath needs a procedure reference as its second argument, e.g.  warppath(path, @push_out)',
            line,
          );
        const ref = args[1];
        tickN(p.length, line);
        return path(p.map((pt) => applyReporter(ref, pt[0], pt[1], line)));
      }
      case 'humanizepath': {
        const p = pathArg(0);
        const amount = clampHumanize(sc(1));
        // One main-stream draw seeds the coherent field (fork convention §7).
        const childSeed = Math.floor(rng() * 4294967296);
        const fn = humanizeMap(amount, childSeed, snoise2);
        tickN(p.length, line);
        return path(p.map((pt) => fn(pt[0], pt[1])));
      }
      case 'snappath': {
        const p = pathArg(0);
        const nums = args.slice(1).map((_, i) => sc(i + 1));
        const fn = snapMapFromSpec(nums, (msg) => new NeedlescriptError(`snappath ${msg}`, line));
        tickN(p.length, line);
        return path(p.map((pt) => fn(pt[0], pt[1])));
      }

      // ---- DX: satin-tuple helpers ----
      // Build the 5-slot contract list by intent rather than memorising slot order.
      case 'satinpair': {
        // satinpair(advance, width) ≡ [advance, width, width, 0, 0]
        const advance = sc(0),
          width = sc(1);
        return allocList([advance, width, width, 0, 0], line);
      }
      case 'satinrake': {
        // satinrake(advance, width, lag) ≡ [advance, width, width, -lag, lag]
        const advance = sc(0),
          width = sc(1),
          lag = sc(2);
        return allocList([advance, width, width, -lag, lag], line);
      }
      case 'satinasym': {
        // satinasym(advance, leftw, rightw) ≡ [advance, leftw, rightw, 0, 0]
        const advance = sc(0),
          leftw = sc(1),
          rightw = sc(2);
        return allocList([advance, leftw, rightw, 0, 0], line);
      }

      // ---- DX: fill-shaper helper ----
      case 'tatamirow': {
        // tatamirow(spacing, len) ≡ [spacing, len, 0.5]  (standard brick offset)
        // tatamirow(spacing, len, phase) ≡ [spacing, len, phase]
        const spacing = sc(0),
          len = sc(1);
        const phase = args.length >= 3 ? sc(2) : 0.5;
        return allocList([spacing, len, phase], line);
      }
    }
    throw new NeedlescriptError(`Unknown function ${name}`, line);
  }

  // ---------- Stitch-history queries (closed-loop generation) ----------
  //
  // Pure, zero-draw, sewing-order reporters over the engine's live coverage
  // grid (m.density), fed in _push. They read accumulated state and let the
  // program branch on it, but consume no RNG and emit nothing, so the stitch
  // stream stays a deterministic function of (seed, source): same seed → same
  // queries → same branches → same design. Point arguments are in the local
  // (turtle) frame like pos()/distance and are mapped through the affine CTM to
  // the hoop grid; returned points are hoop-space fabric facts. Queries see
  // committed (flushed) penetrations only — a buffered satin column isn't
  // visible until it ends (pen-up / trim / mode change), and tie-off locks are
  // excluded (added after analysis), so the numbers match the heatmap exactly.

  function queryFunc(name: string, args: Val[], line: number | undefined): Val {
    m.usedQuery = true;
    // Local → hoop through the affine transform stack (warp is not inverted).
    const hoop = (i: number): [number, number] => {
      const p = gm.toPoint(args[i], name, line);
      return apply(m.ctm, p[0], p[1]);
    };
    const point = (p: [number, number]) => allocList([p[0], p[1]], line);

    switch (name) {
      case 'coverat': {
        const [hx, hy] = hoop(0);
        if (args.length >= 2) {
          const r = num(args[1], 'coverat', line);
          if (!(r >= 0)) throw new NeedlescriptError('coverat radius must be 0 or more', line);
          tickN(Math.max(1, Math.ceil(Math.PI * r * r)), line);
          return m.density.coverAvg(hx, hy, r);
        }
        tick(line);
        return m.density.coverAt(hx, hy);
      }
      case 'countat': {
        const [hx, hy] = hoop(0);
        tick(line);
        return m.density.countAt(hx, hy);
      }
      case 'nearestsewn': {
        const [hx, hy] = hoop(0);
        tickN(8, line);
        const p = m.density.nearestSewn(hx, hy);
        return p ? point(p) : allocList([], line);
      }
      case 'sewnwithin': {
        const [hx, hy] = hoop(0);
        const r = num(args[1], 'sewnwithin', line);
        if (!(r >= 0)) throw new NeedlescriptError('sewnwithin radius must be 0 or more', line);
        const found = m.density.sewnWithin(hx, hy, r);
        tickN(found.length + 4, line);
        return allocList(
          found.map((p) => point(p) as Val),
          line,
        );
      }
      case 'stitchedpoints': {
        const pts = m.density.snapshot();
        if (pts.length > LIMITS.maxListLen)
          throw new NeedlescriptError(
            `stitchedpoints: ${pts.length.toLocaleString('en-US')} penetrations exceeds the list limit ${LIMITS.maxListLen.toLocaleString('en-US')}`,
            line,
          );
        tickN(pts.length, line);
        return allocList(
          pts.map((p) => point(p) as Val),
          line,
        );
      }
    }
    throw new NeedlescriptError(`Unknown query ${name}`, line);
  }

  function evalExpr(
    node: ExprNode,
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
  ): Val {
    tick((node as { line?: number }).line);
    switch (node.k) {
      case 'num':
        return node.v;
      case 'var': {
        if (env && node.name in env) return env[node.name];
        if (node.name in globals) return globals[node.name];
        // Bare reads only parse when the pre-scan saw the name being assigned
        // somewhere — so a miss here means it was never assigned on the path
        // that actually ran (e.g.  if 0 [ x = 5 ] print x ).
        if (node.bare)
          throw new NeedlescriptError(
            `Variable "${node.name}" was never assigned on this path`,
            node.line,
          );
        throw new NeedlescriptError(
          `Unknown variable :${node.name}${didYouMean(node.name, [
            ...(env ? Object.keys(env) : []),
            ...Object.keys(globals),
          ])}`,
          node.line,
        );
      }
      case 'neg':
        return -num(evalExpr(node.val, env, repcount, depth), '-', node.line);
      case 'list': {
        const items: Val[] = [];
        for (const it of node.items) items.push(evalExpr(it, env, repcount, depth));
        const out = allocList(items, node.line);
        if (valDepth(out) > LIMITS.maxListDepth)
          throw new NeedlescriptError(`list nesting deeper than ${LIMITS.maxListDepth}`, node.line);
        return out;
      }
      case 'index': {
        const obj = evalExpr(node.obj, env, repcount, depth);
        if (!isList(obj))
          throw new NeedlescriptError(
            `only lists can be indexed with [ ] — this is a number`,
            node.line,
          );
        const i = toIndex(
          evalExpr(node.idx, env, repcount, depth),
          obj.items.length,
          'indexing',
          node.line,
        );
        return obj.items[i];
      }
      case 'callval': {
        evalExpr(node.obj, env, repcount, depth);
        throw new NeedlescriptError("a list value can't be called like a procedure", node.line);
      }
      case 'listfunc': {
        const args = node.args.map((a) => evalExpr(a, env, repcount, depth));
        if (GEN_FUNCS[node.name] !== undefined)
          return genFunc(node.name, args, node.line, node.word);
        if (QUERY_FUNCS[node.name] !== undefined) return queryFunc(node.name, args, node.line);
        return listFunc(node.name, args, node.line);
      }
      case 'bin': {
        // and / or short-circuit so guards like  :i > 0 and 10 / :i > 2  are safe
        if (node.op === 'and')
          return truthy(evalExpr(node.left, env, repcount, depth), 'and', undefined) !== 0 &&
            truthy(evalExpr(node.right, env, repcount, depth), 'and', undefined) !== 0
            ? 1
            : 0;
        if (node.op === 'or')
          return truthy(evalExpr(node.left, env, repcount, depth), 'or', undefined) !== 0 ||
            truthy(evalExpr(node.right, env, repcount, depth), 'or', undefined) !== 0
            ? 1
            : 0;
        const av = evalExpr(node.left, env, repcount, depth);
        const bv = evalExpr(node.right, env, repcount, depth);
        // Equality on lists is deep; mixed number/list compares unequal
        // (equality is a question, not a type assertion).
        if (node.op === '=' || node.op === '!=') {
          if (isList(av) || isList(bv)) {
            const eq = deepEqual(av, bv);
            return node.op === '=' ? (eq ? 1 : 0) : eq ? 0 : 1;
          }
        }
        // Arithmetic on lists stays a loud error (RFC-3 §2) — with hints
        // pointing at the named vector functions. No broadcasting: in
        // Python  [1,2] + [3,4]  is concatenation, and silently giving it
        // NumPy semantics is the kind of bug that sews before it's noticed.
        if ((isList(av) || isList(bv)) && '+-*/'.includes(node.op)) {
          const hint =
            node.op === '+'
              ? ' — use vadd(a, b) for element-wise, concat(a, b) to join'
              : node.op === '-'
                ? ' — use vsub(a, b) for element-wise'
                : ' — use vscale(a, s) to scale a point';
          throw new NeedlescriptError(
            `"${node.op}" on lists${hint}`,
            (node.left as { line?: number }).line ?? (node.right as { line?: number }).line,
          );
        }
        const a = num(av, node.op, undefined, 'on the left');
        const b = num(bv, node.op, undefined, 'on the right');
        switch (node.op) {
          case '+':
            return a + b;
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            if (b === 0) throw new NeedlescriptError('Division by zero');
            return a / b;
          case '<':
            return a < b ? 1 : 0;
          case '>':
            return a > b ? 1 : 0;
          case '<=':
            return a <= b ? 1 : 0;
          case '>=':
            return a >= b ? 1 : 0;
          case '=':
            return Math.abs(a - b) < 1e-9 ? 1 : 0;
          case '!=':
            return Math.abs(a - b) < 1e-9 ? 0 : 1;
        }
        throw new NeedlescriptError('Unknown operator');
      }
      case 'func': {
        if (node.name === 'not')
          return truthy(evalExpr(node.args[0], env, repcount, depth), 'not', node.line) === 0
            ? 1
            : 0;
        // Every legacy function is scalar — a list operand is a type error
        // naming the function (RFC-2 §2).
        const args = node.args.map((a) =>
          num(evalExpr(a, env, repcount, depth), node.name, node.line),
        );
        switch (node.name) {
          case 'random':
            return rng() * args[0];
          case 'sin':
            return Math.sin((args[0] * Math.PI) / 180);
          case 'cos':
            return Math.cos((args[0] * Math.PI) / 180);
          case 'sqrt':
            if (args[0] < 0) throw new NeedlescriptError('sqrt of a negative number', node.line);
            return Math.sqrt(args[0]);
          case 'abs':
            return Math.abs(args[0]);
          case 'round':
            return Math.round(args[0]);
          case 'floor':
            return Math.floor(args[0]);
          case 'ceil':
            return Math.ceil(args[0]);
          case 'min':
            return Math.min(args[0], args[1]);
          case 'max':
            return Math.max(args[0], args[1]);
          case 'pow': {
            const v = Math.pow(args[0], args[1]);
            if (!isFinite(v))
              throw new NeedlescriptError(
                `pow ${formatNum(args[0])} ${formatNum(args[1])} is not a finite number`,
                node.line,
              );
            return v;
          }
          case 'mod':
            return ((args[0] % args[1]) + args[1]) % args[1];
          // heading-convention angle of the vector (x, y): 0 = up/north, clockwise
          case 'atan':
            return ((Math.atan2(args[0], args[1]) * 180) / Math.PI + 360) % 360;
          case 'noise':
            return noise(args[0]);
          case 'noise2':
            return noise(args[0], args[1]);
          case 'distance':
            return Math.hypot(args[0] - m.x, args[1] - m.y);
          case 'towards':
            return ((Math.atan2(args[0] - m.x, args[1] - m.y) * 180) / Math.PI + 360) % 360;
          case 'repcount':
            return repcount;
          case 'xcor':
            return m.x;
          case 'ycor':
            return m.y;
          case 'heading':
            return m.heading;
        }
        throw new NeedlescriptError(`Unknown function ${node.name}`, node.line);
      }
      case 'callexpr': {
        const v = callProc(node.name, node.args, env, repcount, depth, node.line);
        if (v === undefined)
          throw new NeedlescriptError(
            `"${node.name}" was used as a value but it never reached "output"`,
            node.line,
          );
        return v;
      }
      case 'procref':
        return new FuncRef(node.name);
    }
  }

  function callProc(
    name: string,
    argNodes: ExprNode[],
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
    line?: number,
  ): Val | undefined {
    const proc = procs[name];
    if (!proc)
      throw new NeedlescriptError(`Procedure "${name}" is used before it is defined`, line);
    if (depth >= LIMITS.maxCallDepth)
      throw new NeedlescriptError(`Too much recursion in "${name}"`, line);
    const newEnv: Record<string, Val> = Object.create(null);
    proc.params.forEach((p, i) => {
      newEnv[p] = evalExpr(argNodes[i], env, repcount, depth);
    });
    try {
      // Pass the call-site line as contextLine so that machine commands
      // inside the procedure stamp the caller's source line onto stitches
      // rather than their own internal line number within the proc body.
      execBlock(proc.body, newEnv, repcount, depth + 1, line);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof LoopSignal)
        throw new NeedlescriptError(`"${e.kind}" can only be used inside a loop`, e.line);
      throw e;
    }
    return undefined;
  }

  /**
   * Call a procedure with already-evaluated argument values (rather than AST
   * nodes). Used by `warp`/`warppath` to invoke a reporter once per point.
   */
  function callProcVals(
    name: string,
    argVals: Val[],
    depth: number,
    line?: number,
  ): Val | undefined {
    const proc = procs[name];
    if (!proc)
      throw new NeedlescriptError(`Procedure "${name}" is used before it is defined`, line);
    if (depth >= LIMITS.maxCallDepth)
      throw new NeedlescriptError(`Too much recursion in "${name}"`, line);
    const newEnv: Record<string, Val> = Object.create(null);
    proc.params.forEach((p, i) => {
      newEnv[p] = argVals[i];
    });
    try {
      execBlock(proc.body, newEnv, 0, depth + 1, line);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof LoopSignal)
        throw new NeedlescriptError(`"${e.kind}" can only be used inside a loop`, e.line);
      throw e;
    }
    return undefined;
  }

  /**
   * Invoke a `@name` reporter on a point, returning the mapped point. This is
   * the one piece of effect machinery that runs user code per emitted vertex:
   * it enforces the reporter contract (exactly one argument, returns a point)
   * with errors that name exactly what went wrong.
   */
  function applyReporter(ref: FuncRef, x: number, y: number, line?: number): Pt {
    const proc = procs[ref.name];
    if (!proc) throw new NeedlescriptError(`the warp reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 1)
      throw new NeedlescriptError(
        `the warp reporter @${ref.name} must take exactly one argument (the point [x, y]), but takes ${proc.params.length}`,
        line,
      );
    const out = callProcVals(ref.name, [allocList([x, y], line)], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the warp reporter @${ref.name} never reached output/return — it must return a point [x, y]`,
        line,
      );
    return gm.toPoint(out, `the warp reporter @${ref.name}`, line);
  }

  /**
   * Invoke a `@name` shape reporter for one satin pair, returning the validated
   * 5-number contract `[advance, leftw, rightw, leftlag, rightlag]`. Mirrors
   * `applyReporter`'s posture: every contract violation (wrong arity, no
   * return, non-list, wrong length, non-number slot) is a loud, line-numbered
   * error that names exactly what is wrong. Inputs are spine-local (§3.2).
   */
  /**
   * Eager half of the shape-reporter contract: the reporter exists and takes
   * exactly 4 parameters. Run at the `satin @fn` engage site so a malformed
   * signature is reported there; the return-value half is checked per call.
   */
  function applyShapeReporterArity(ref: FuncRef, line?: number) {
    const proc = procs[ref.name];
    if (!proc) throw new NeedlescriptError(`the satin reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must take exactly 4 parameters (t, s, i, u), but takes ${proc.params.length}`,
        line,
      );
  }

  function applyShapeReporter(
    ref: FuncRef,
    t: number,
    s: number,
    i: number,
    u: number,
    line?: number,
  ): [number, number, number, number, number] {
    const proc = procs[ref.name];
    if (!proc) throw new NeedlescriptError(`the satin reporter @${ref.name} is not defined`, line);
    if (proc.params.length !== 4)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must take exactly 4 parameters (t, s, i, u), but takes ${proc.params.length}`,
        line,
      );
    const out = callProcVals(ref.name, [t, s, i, u], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} never reached output/return — it must return [advance, leftw, rightw, leftlag, rightlag]`,
        line,
      );
    if (!isList(out))
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must return a list of 5 numbers [advance, leftw, rightw, leftlag, rightlag], got ${describeVal(out)}`,
        line,
      );
    if (out.items.length !== 5)
      throw new NeedlescriptError(
        `the satin reporter @${ref.name} must return exactly 5 numbers [advance, leftw, rightw, leftlag, rightlag], got a list of ${out.items.length}`,
        line,
      );
    const slot = ['advance', 'leftw', 'rightw', 'leftlag', 'rightlag'];
    const r = out.items.map((v, k) => {
      if (typeof v !== 'number')
        throw new NeedlescriptError(
          `the satin reporter @${ref.name} returned ${describeVal(v)} for ${slot[k]} (slot ${k + 1} of 5) — it must be a number`,
          line,
        );
      return v;
    });
    return [r[0], r[1], r[2], r[3], r[4]];
  }

  // ---- Programmable fill reporters (`fill dir @d shape @s`, §3) ----------
  // Same two-phase posture as satin: an eager arity check at the arming site,
  // then a per-sample return-value check. Every violation is a loud,
  // line-numbered error naming the offending channel. Inputs are LOCAL-space.

  function applyFillDirArity(name: string, line?: number) {
    const proc = procs[name];
    if (!proc) throw new NeedlescriptError(`the fill dir reporter @${name} is not defined`, line);
    if (proc.params.length !== 1)
      throw new NeedlescriptError(
        `the fill dir reporter @${name} must take exactly 1 parameter (the point [x, y]), but takes ${proc.params.length}`,
        line,
      );
  }

  /** Invoke a dir reporter; returns a turtle heading. Non-finite ⇒ NaN (a field
   * singularity the generator handles per §5.2), not an error. */
  function applyFillDir(name: string, px: number, py: number, line?: number): number {
    const out = callProcVals(name, [allocList([px, py], line)], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the fill dir reporter @${name} never reached output/return — it must return a heading (a number)`,
        line,
      );
    if (typeof out !== 'number')
      throw new NeedlescriptError(
        `the fill dir reporter @${name} must return a heading (a number), got ${describeVal(out)}`,
        line,
      );
    return out;
  }

  function applyFillShapeArity(name: string, line?: number) {
    const proc = procs[name];
    if (!proc) throw new NeedlescriptError(`the fill shape reporter @${name} is not defined`, line);
    if (proc.params.length !== 3)
      throw new NeedlescriptError(
        `the fill shape reporter @${name} must take exactly 3 parameters (p, row, v), but takes ${proc.params.length}`,
        line,
      );
  }

  /** Invoke a shape reporter; returns the validated [spacing, len, phase]. */
  function applyFillShape(
    name: string,
    px: number,
    py: number,
    row: number,
    v: number,
    line?: number,
  ): [number, number, number] {
    const out = callProcVals(name, [allocList([px, py], line), row, v], 0, line);
    if (out === undefined)
      throw new NeedlescriptError(
        `the fill shape reporter @${name} never reached output/return — it must return [spacing, len, phase]`,
        line,
      );
    if (!isList(out))
      throw new NeedlescriptError(
        `the fill shape reporter @${name} must return a list of 3 numbers [spacing, len, phase], got ${describeVal(out)}`,
        line,
      );
    if (out.items.length !== 3)
      throw new NeedlescriptError(
        `the fill shape reporter @${name} must return exactly 3 numbers [spacing, len, phase], got a list of ${out.items.length}`,
        line,
      );
    const slot = ['spacing', 'len', 'phase'];
    const r = out.items.map((val, k) => {
      if (typeof val !== 'number')
        throw new NeedlescriptError(
          `the fill shape reporter @${name} returned ${describeVal(val)} for ${slot[k]} (slot ${k + 1} of 3) — it must be a number`,
          line,
        );
      return val;
    });
    return [r[0], r[1], r[2]];
  }

  /** Clamp humanize jitter to a sane embroidery range (0–2 mm), warning if out. */
  function clampHumanize(amount: number): number {
    const v = Math.min(Math.max(amount, 0), 2);
    if (v !== amount)
      m.warnings.push(`humanize ${formatNum(amount)} clamped to ${formatNum(v)} mm (range 0–2)`);
    return v;
  }

  function execBlock(
    stmts: ASTNode[],
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
    contextLine?: number,
  ) {
    for (const st of stmts) execStmt(st, env, repcount, depth, contextLine);
  }

  /**
   * Run one loop iteration, absorbing loop-control signals (RFC-4).
   * Returns false if the loop should stop (`break`), true otherwise
   * (`continue` simply ends the iteration early).
   */
  function runLoopBody(
    body: ASTNode[],
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
    contextLine?: number,
  ): boolean {
    try {
      execBlock(body, env, repcount, depth, contextLine);
    } catch (e) {
      if (e instanceof LoopSignal) return e.kind !== 'break';
      throw e;
    }
    return true;
  }

  function execStmt(
    st: ASTNode,
    env: Record<string, Val> | null,
    repcount: number,
    depth: number,
    contextLine?: number,
  ) {
    tick(st.line);
    switch (st.k) {
      case 'to':
        procs[st.name] = st;
        return;
      case 'make': {
        const v = evalExpr(st.value, env, repcount, depth);
        // Prefer an existing local (procedure parameter or "local") over a global.
        if (env && st.name in env) env[st.name] = v;
        else globals[st.name] = v;
        return;
      }
      case 'local': {
        if (!env)
          throw new NeedlescriptError(
            'local can only be used inside a procedure — use make at the top level',
            st.line,
          );
        env[st.name] = evalExpr(st.value, env, repcount, depth);
        return;
      }
      case 'letlist': {
        // let [x, y] = p — fixed-arity destructuring, flat only (RFC-2 §3.3)
        const v = evalExpr(st.value, env, repcount, depth);
        if (!isList(v))
          throw new NeedlescriptError(
            `let [${st.names.join(', ')}] expected a list, got a number`,
            st.line,
          );
        if (v.items.length !== st.names.length)
          throw new NeedlescriptError(
            `let [${st.names.join(', ')}] expected a list of ${st.names.length}, got ${v.items.length}`,
            st.line,
          );
        const scope = st.isLocal && env ? env : globals;
        st.names.forEach((n, i) => {
          scope[n] = v.items[i];
        });
        return;
      }
      case 'setindex': {
        // xs[i] = v   |   grid[i][j] += v — lvalue chains (RFC-2 §3.3)
        let target: Val;
        if (env && st.name in env) target = env[st.name];
        else if (st.name in globals) target = globals[st.name];
        else
          throw new NeedlescriptError(
            `Variable "${st.name}" was never assigned on this path`,
            st.line,
          );
        for (let k = 0; ; k++) {
          if (!isList(target))
            throw new NeedlescriptError(
              `only lists can be indexed with [ ] — "${st.name}" leads to a number here`,
              st.line,
            );
          const i = toIndex(
            evalExpr(st.indices[k], env, repcount, depth),
            target.items.length,
            'indexing',
            st.line,
          );
          tick(st.line);
          if (k === st.indices.length - 1) {
            let v = evalExpr(st.value, env, repcount, depth);
            if (st.op !== '=') {
              const op = st.op[0];
              const old = num(target.items[i], op, st.line, 'on the left');
              const rhs = num(v, op, st.line, 'on the right');
              if (op === '+') v = old + rhs;
              else if (op === '-') v = old - rhs;
              else if (op === '*') v = old * rhs;
              else {
                if (rhs === 0) throw new NeedlescriptError('Division by zero', st.line);
                v = old / rhs;
              }
            }
            checkDepth(v, st.line);
            target.items[i] = v;
            return;
          }
          target = target.items[i];
        }
      }
      case 'repeat': {
        const n = Math.floor(num(evalExpr(st.count, env, repcount, depth), 'repeat', st.line));
        if (n > 200000) throw new NeedlescriptError(`repeat count too large (${n})`, st.line);
        for (let i = 1; i <= n; i++) if (!runLoopBody(st.body, env, i, depth, contextLine)) break;
        return;
      }
      case 'while': {
        while (truthy(evalExpr(st.cond, env, repcount, depth), 'while', st.line) !== 0) {
          tick(st.line); // ops budget catches endless loops
          if (!runLoopBody(st.body, env, repcount, depth, contextLine)) break;
        }
        return;
      }
      case 'for': {
        const from = num(evalExpr(st.from, env, repcount, depth), 'for', st.line);
        const to = num(evalExpr(st.to, env, repcount, depth), 'for', st.line);
        const step = num(evalExpr(st.step, env, repcount, depth), 'for', st.line);
        if (step === 0) throw new NeedlescriptError('for step can\u2019t be 0', st.line);
        if ((to - from) / step > 200000)
          throw new NeedlescriptError('for runs too many times (over 200,000)', st.line);
        const scope = env ?? globals;
        const had = st.varName in scope;
        const prev = scope[st.varName];
        for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) {
          tick(st.line);
          scope[st.varName] = v;
          if (!runLoopBody(st.body, env, repcount, depth, contextLine)) break;
        }
        if (had) scope[st.varName] = prev;
        else delete scope[st.varName];
        return;
      }
      case 'forin': {
        // for x in xs — length captured at loop entry, elements read live
        // (reference semantics, documented), loop variable doesn't leak.
        const v = evalExpr(st.list, env, repcount, depth);
        if (!isList(v))
          throw new NeedlescriptError(
            `for ${st.varName} in … expected a list, got a number`,
            st.line,
          );
        const n = v.items.length;
        const scope = env ?? globals;
        const had = st.varName in scope;
        const prev = scope[st.varName];
        for (let i = 0; i < n; i++) {
          tick(st.line);
          scope[st.varName] = v.items[i];
          if (!runLoopBody(st.body, env, repcount, depth, contextLine)) break;
        }
        if (had) scope[st.varName] = prev;
        else delete scope[st.varName];
        return;
      }
      case 'if': {
        if (truthy(evalExpr(st.cond, env, repcount, depth), 'if', st.line) !== 0)
          execBlock(st.body, env, repcount, depth, contextLine);
        else if (st.elseBody) execBlock(st.elseBody, env, repcount, depth, contextLine);
        return;
      }
      case 'transform': {
        // Build the delta matrix from the args, compose it onto the CTM for
        // the duration of the block, then restore. flushSatin on both edges
        // guarantees a satin column is sewn entirely under one matrix. The
        // turtle (x/y/heading) is untouched — only emitted geometry is mapped.
        const a = st.args.map((x) => num(evalExpr(x, env, repcount, depth), st.name, st.line));
        let delta: Mat;
        switch (st.name) {
          case 'translate':
            delta = mTranslate(a[0], a[1]);
            break;
          case 'rotate':
            delta = mRotate(a[0]);
            break;
          case 'rotateabout':
            delta = mRotateAbout(a[0], a[1], a[2]);
            break;
          case 'scale':
            delta = mScale(a[0]);
            break;
          case 'scalexy':
            delta = mScaleXY(a[0], a[1]);
            break;
          case 'mirror':
            delta = mMirror(a[0]);
            break;
          case 'skew':
            delta = mSkew(a[0], a[1]);
            break;
          case 'transform':
            delta = mRaw(a[0], a[1], a[2], a[3], a[4], a[5]);
            break;
          default:
            throw new NeedlescriptError(`Unhandled transform ${st.name}`, st.line);
        }
        m.currentLine = contextLine ?? st.line;
        m.flushSatin();
        m.pushTransform(delta);
        try {
          execBlock(st.body, env, repcount, depth, contextLine);
        } finally {
          m.flushSatin();
          m.popOut();
        }
        return;
      }
      case 'effect': {
        // Effects share the transform discipline: flush satin on both edges so
        // a column lives under one map, push the map for the block, restore on
        // exit. `warp` is a pre-split, post-CTM point map (it deforms the
        // emitted path like a transform); `humanize`/`snaptogrid` are
        // after-split penetration maps (effects §).
        m.currentLine = contextLine ?? st.line;
        m.flushSatin();
        if (st.name === 'warp') {
          const refVal = evalExpr(st.args[0], env, repcount, depth);
          if (!isFuncRef(refVal))
            throw new NeedlescriptError(
              'warp needs a procedure reference, e.g.  warp @push_out [ … ]',
              st.line,
            );
          const ref = refVal;
          m.pushWarp((x, y) => applyReporter(ref, x, y, st.line));
          try {
            execBlock(st.body, env, repcount, depth, contextLine);
          } finally {
            m.flushSatin();
            m.popOut();
          }
          return;
        }
        const a = st.args.map((x) => num(evalExpr(x, env, repcount, depth), st.name, st.line));
        let fn: (x: number, y: number) => [number, number];
        if (st.name === 'humanize') {
          const amount = clampHumanize(a[0]);
          // One main-stream draw seeds the coherent field (fork convention §7):
          // dropping a humanize block shifts downstream randomness by exactly
          // one draw, never by however many stitches were inside.
          const childSeed = Math.floor(rng() * 4294967296);
          fn = humanizeMap(amount, childSeed, snoise2);
        } else {
          // snaptogrid — pure, drawless, fixed hoop-space lattice
          fn = snapMapFromSpec(a, (msg) => new NeedlescriptError(`snaptogrid ${msg}`, st.line));
        }
        m.pushPen(fn);
        try {
          execBlock(st.body, env, repcount, depth, contextLine);
        } finally {
          m.flushSatin();
          m.popPen();
        }
        return;
      }
      case 'output': {
        if (depth === 0)
          throw new NeedlescriptError(
            `"${st.value ? 'output' : 'exit'}" can only be used inside a procedure`,
            st.line,
          );
        throw new ReturnSignal(st.value ? evalExpr(st.value, env, repcount, depth) : undefined);
      }
      // Loop control (RFC-4): unwinds to the innermost enclosing loop.
      // The parser guarantees one exists in the same procedure body.
      case 'break':
        throw new LoopSignal('break', st.line);
      case 'continue':
        throw new LoopSignal('continue', st.line);
      case 'call': {
        callProc(st.name, st.args, env, repcount, depth, contextLine ?? st.line);
        return;
      }
      case 'fillarm': {
        m.currentLine = contextLine ?? st.line;
        // Arm programmable fill for the next beginfill…endfill (§2). Validate
        // each channel's reporter arity eagerly so a malformed signature is
        // caught here, at the arming site, not deep in the generator.
        if (m.recording)
          throw new NeedlescriptError(
            'fill armed while a beginfill is open — close it with endfill before arming a new fill',
            st.line,
          );
        if (st.dirRef) {
          applyFillDirArity(st.dirRef, st.line);
          const ref = st.dirRef;
          m.fillDirReporter = (px, py) => applyFillDir(ref, px, py, st.line);
        } else {
          m.fillDirReporter = null;
        }
        if (st.shapeRef) {
          applyFillShapeArity(st.shapeRef, st.line);
          const ref = st.shapeRef;
          m.fillShapeReporter = (px, py, row, v) => applyFillShape(ref, px, py, row, v, st.line);
        } else {
          m.fillShapeReporter = null;
        }
        m.fillArmed = true;
        // One-time note when a channel supersedes a non-default numeric setting (§2).
        if (m.fillDirReporter && m.fillAngle !== 0)
          m.warnings.push(
            `fillangle is ignored while fill dir @${st.dirRef} is engaged — the direction field supersedes it`,
          );
        if (m.fillShapeReporter && (m.fillSpacing !== 0.4 || m.fillLen !== null))
          m.warnings.push(
            `fillspacing/filllen are ignored while fill shape @${st.shapeRef} is engaged — the shape reporter supersedes them`,
          );
        return;
      }
      case 'listcmd': {
        m.currentLine = contextLine ?? st.line;
        const a = st.args.map((x) => evalExpr(x, env, repcount, depth));
        switch (st.name) {
          case 'append':
          case 'prepend': {
            const xs = list(a[0], st.name, st.line);
            if (xs.items.length + 1 > LIMITS.maxListLen)
              throw new NeedlescriptError(
                `List too long (limit ${LIMITS.maxListLen.toLocaleString('en-US')} elements)`,
                st.line,
              );
            checkDepth(a[1], st.line);
            charge(1, st.line);
            if (st.name === 'append') xs.items.push(a[1]);
            else xs.items.unshift(a[1]);
            return;
          }
          case 'insertat': {
            const xs = list(a[0], 'insertat', st.line);
            if (xs.items.length + 1 > LIMITS.maxListLen)
              throw new NeedlescriptError(
                `List too long (limit ${LIMITS.maxListLen.toLocaleString('en-US')} elements)`,
                st.line,
              );
            // 0…len allowed: inserting at len appends.
            const n = num(a[1], 'insertat', st.line);
            const r = Math.round(n);
            if (Math.abs(n - r) > 1e-9)
              throw new NeedlescriptError(
                `insertat: index ${formatNum(n)} isn't a whole number — use floor() deliberately`,
                st.line,
              );
            const i = r < 0 ? r + xs.items.length : r;
            if (i < 0 || i > xs.items.length)
              throw new NeedlescriptError(
                `insertat: index ${r} is out of range (0…${xs.items.length} allowed)`,
                st.line,
              );
            checkDepth(a[2], st.line);
            charge(1, st.line);
            xs.items.splice(i, 0, a[2]);
            return;
          }
          case 'removeat': {
            listFunc('removeat', a, st.line); // return value discarded
            return;
          }
          case 'setpos': {
            const p = list(a[0], 'setpos', st.line);
            if (p.items.length < 2)
              throw new NeedlescriptError(
                `setpos expected [x, y], got a list of ${p.items.length}`,
                st.line,
              );
            const x = num(p.items[0], 'setpos', st.line);
            const y = num(p.items[1], 'setpos', st.line);
            m.setXY(x, y);
            return;
          }
          case 'sewpath': {
            // ≡ for p in path [ setpos(p) ] — pen state, stitch mode, satin
            // and auto-split all apply exactly as if hand-walked (§4.4).
            const pts = gm.toPath(a[0], 'sewpath', st.line);
            tickN(pts.length, st.line);
            for (const [x, y] of pts) m.setXY(x, y);
            return;
          }
        }
        throw new NeedlescriptError(`Unhandled command ${st.name}`, st.line);
      }
      case 'cmd': {
        m.currentLine = contextLine ?? st.line;
        const vals = st.args.map((x) => evalExpr(x, env, repcount, depth));
        if (st.name === 'print') {
          printed.push((st.label ? st.label + ': ' : '') + formatVal(vals[0]));
          return;
        }
        if (st.name === 'printloc') {
          // DX: printloc — logs local-frame needle position, like pos() formatted.
          // Reports m.x / m.y (local turtle coordinates, same as pos()).
          printed.push((st.label ?? 'loc') + ': [' + formatNum(m.x) + ', ' + formatNum(m.y) + ']');
          return;
        }
        if (st.name === 'assert') {
          if (truthy(vals[0], 'assert', st.line) === 0)
            throw new NeedlescriptError('assert failed — the condition is 0 (false)', st.line);
          return;
        }
        // `satin @fn` — engage programmable satin: a user shape reporter
        // supersedes the built-in generator (§2/§3). Same mode switch as the
        // numeric form; it begins buffering a column and flushes on the usual
        // triggers. The reporter is queried once per stitch pair at flush time.
        if (st.name === 'satin' && isFuncRef(vals[0])) {
          const ref = vals[0];
          // Validate the contract eagerly so a malformed reporter is caught at
          // the engage site, even before the column has any geometry.
          applyShapeReporterArity(ref, st.line);
          m.flushSatin();
          m.satinReporter = (t, s, i, u) => applyShapeReporter(ref, t, s, i, u, st.line);
          m.mode = 'satin';
          // The numeric `density` command is ignored while a reporter is
          // engaged (advance supersedes it) — note it once if one was set.
          if (m.satinSpacing !== 0.4 && !m.satinDensityNoted) {
            m.warnings.push(
              `density is ignored while satin @${ref.name} is engaged — the reporter's advance return controls penetration spacing`,
            );
            m.satinDensityNoted = true;
          }
          return;
        }
        // Every other command is scalar — a list argument is a type error
        // naming the command (RFC-2 §2).
        const a = vals.map((v) => num(v, st.name, st.line));
        switch (st.name) {
          case 'fd':
            m.forward(a[0]);
            return;
          case 'bk':
            m.forward(-a[0]);
            return;
          case 'rt':
            m.heading = (m.heading + a[0]) % 360;
            return;
          case 'lt':
            m.heading = (m.heading - a[0]) % 360;
            return;
          case 'up':
            m.flushSatin();
            m.penDown = false;
            return;
          case 'down':
            m.penDown = true;
            return;
          case 'home':
            m.setXY(0, 0);
            m.heading = 0;
            return;
          case 'cs':
            return;
          case 'setxy':
            m.setXY(a[0], a[1]);
            return;
          case 'setx':
            m.setXY(a[0], m.y);
            return;
          case 'sety':
            m.setXY(m.x, a[0]);
            return;
          case 'seth':
            m.heading = a[0] % 360;
            return;
          case 'arc':
            m.arc(a[0], a[1]);
            return;
          // DX: moveto — reposition without sewing, pen state preserved.
          // Equivalent to: save pen → up → setxy → restore pen.
          case 'moveto': {
            const wasDown = m.penDown;
            m.flushSatin();
            m.penDown = false;
            m.setXY(a[0], a[1]);
            m.penDown = wasDown;
            return;
          }
          // DX: gohome — pen-safe return to origin (≡ moveto 0 0).
          // Does NOT reset heading; use seth 0 separately if needed.
          case 'gohome': {
            const wasDown = m.penDown;
            m.flushSatin();
            m.penDown = false;
            m.setXY(0, 0);
            m.penDown = wasDown;
            return;
          }
          // DX: circle r — full closed circle (≡ arc 360 r).
          case 'circle':
            m.arc(360, a[0]);
            return;
          case 'push':
            m.pushState();
            return;
          case 'pop':
            m.popState();
            return;
          case 'stitchlen': {
            const v = a[0];
            if (v < LIMITS.minStitch || v > LIMITS.maxStitch)
              m.warnings.push(
                `stitchlen ${v} clamped to ${Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch)} mm (machine-safe range is ${LIMITS.minStitch}–${LIMITS.maxStitch})`,
              );
            m.stitchLen = Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch);
            return;
          }
          case 'satin': {
            m.flushSatin();
            m.satinReporter = null; // numeric form returns to the built-in generator
            const v = Math.max(0, a[0]);
            if (v > 10)
              m.warnings.push(
                `satin ${v} mm is very wide — columns over ~8 mm tend to snag; consider splitting`,
              );
            m.satinWidth = v;
            m.mode = v > 0.05 ? 'satin' : 'run';
            return;
          }
          case 'estitch': {
            m.flushSatin();
            m.satinReporter = null; // leaving satin mode disengages the reporter
            const v = Math.max(0, a[0]);
            if (v > 10)
              m.warnings.push(`estitch ${v} mm is very wide — prongs over ~8 mm tend to snag`);
            m.eWidth = v;
            m.mode = v > 0.05 ? 'estitch' : 'run';
            return;
          }
          case 'bean': {
            let n = Math.round(a[0]);
            if (n <= 1) {
              m.beanRepeats = 1;
              return;
            }
            if (n % 2 === 0) {
              n += 1;
              m.warnings.push(`bean must be odd to keep advancing — using ${n}`);
            }
            if (n > 9) {
              n = 9;
              m.warnings.push('bean clamped to 9 passes');
            }
            m.beanRepeats = n;
            return;
          }
          case 'lock': {
            if (a[0] <= 0) {
              m.lockLen = 0;
              return;
            }
            const v = Math.min(Math.max(a[0], 0.3), 1.5);
            if (v !== a[0]) m.warnings.push(`lock ${a[0]} clamped to ${v} mm (safe range 0.3–1.5)`);
            m.lockLen = v;
            return;
          }
          case 'beginfill':
            m.beginFill();
            return;
          case 'endfill':
            m.endFill();
            return;
          case 'fillangle':
            m.fillAngle = a[0];
            return;
          case 'fillspacing': {
            const v = Math.min(Math.max(a[0], 0.25), 5);
            if (v !== a[0])
              m.warnings.push(`fillspacing ${a[0]} clamped to ${v} mm (safe range 0.25–5)`);
            m.fillSpacing = v;
            return;
          }
          case 'filllen': {
            if (a[0] <= 0) {
              m.fillLen = null;
              return;
            }
            const v = Math.min(Math.max(a[0], 1), 7);
            if (v !== a[0]) m.warnings.push(`filllen ${a[0]} clamped to ${v} mm (safe range 1–7)`);
            m.fillLen = v;
            return;
          }
          case 'density':
            m.flushSatin();
            m.satinSpacing = Math.min(Math.max(a[0], 0.25), 5);
            return;
          case 'pullcomp': {
            const v = Math.min(Math.max(a[0], 0), 1.5);
            if (v !== a[0])
              m.warnings.push(`pullcomp ${a[0]} clamped to ${v} mm (safe range 0–1.5)`);
            m.pullComp = v;
            return;
          }
          case 'shortstitch':
            m.shortStitch = a[0] !== 0;
            return;
          case 'autotrim': {
            if (a[0] <= 0) {
              m.autoTrim = 0;
              return;
            }
            const v = Math.min(Math.max(a[0], 3), 30);
            if (v !== a[0])
              m.warnings.push(`autotrim ${a[0]} clamped to ${v} mm (safe range 3–30, 0 = off)`);
            m.autoTrim = v;
            return;
          }
          case 'maxdensity': {
            if (a[0] <= 0) {
              m.maxDensity = 0;
              return;
            }
            m.maxDensity = Math.min(Math.max(a[0], 1), 8);
            return;
          }
          case 'underlay':
            m.underlayMode = st.word as typeof m.underlayMode;
            return;
          case 'fillunderlay':
            m.fillUnderlayMode = st.word as typeof m.fillUnderlayMode;
            return;
          case 'fabric': {
            const f = FABRICS[st.word as string];
            m.pullComp = f.pull;
            m.underlayMode = 'auto';
            m.fillUnderlayMode = 'auto';
            m.maxDensity = f.maxDensity;
            m.doubleUnderlay = !!f.doubleUnderlay;
            if (f.densityFloor && m.satinSpacing < f.densityFloor) m.satinSpacing = f.densityFloor;
            if (f.note && !m.warnings.includes(f.note)) m.warnings.push(f.note);
            return;
          }
          case 'color':
            m.colorChange(a[0]);
            return;
          case 'stop':
            m.colorChange(m.colorIdx + 1);
            return;
          case 'trim':
            m.trimThread();
            return;
          case 'seed': {
            const s = Math.floor(a[0]);
            rng = makeRNG(s);
            noise = makeNoise(s);
            snoise2 = createNoise2D(makeRNG(s));
            snoise3 = createNoise3D(makeRNG(s ^ 0x9e3779b9));
            return;
          }
          case 'mark':
            m.markHere();
            return;
        }
        throw new NeedlescriptError(`Unhandled command ${st.name}`, st.line);
      }
    }
  }

  try {
    execBlock(program, null, 0, 0);
  } catch (e) {
    // Defensive: parse-time validation makes an escaping loop signal unreachable.
    if (e instanceof LoopSignal)
      throw new NeedlescriptError(`"${e.kind}" can only be used inside a loop`, e.line);
    throw e;
  }

  m.flushSatin();
  const warningLocations: WarningLocation[] = [];
  if (m.recording) {
    m.warnings.push('beginfill was never closed — endfill added at the end of the program');
    m.endFill();
  }
  if (m.tinyDropped > 0) {
    const spots = m.tinyDroppedSpots;
    if (spots.length) {
      const lines = [
        ...new Set(spots.map((s) => s.line).filter((l): l is number => l !== undefined)),
      ];
      warningLocations.push({
        index: m.warnings.length,
        points: spots.map((s) => ({ x: s.x, y: s.y })),
        lines,
        kind: 'tiny',
      });
    }
    m.warnings.push(
      `${m.tinyDropped} sub-${LIMITS.minStitch} mm moves merged into neighbours (too short to sew safely)`,
    );
  }

  if (m.autoTrim > 0) {
    const at = applyAutoTrim(m.events, m.autoTrim);
    m.events = at.events;
  }

  // Analyse coverage before the lock pass: tie-offs are deliberate micro
  // stitches and would otherwise read as false hotspots at every thread end.
  // The machine already accumulated this grid live (in sewing order) so the
  // history queries and this heatmap are one and the same — finalize it.
  const density = m.density.finalize(m.maxDensity);
  if (m.maxDensity > 0) {
    const dens = density.hotspots.filter((h) => h.kind === 'density').slice(0, 3);
    for (const h of dens) {
      warningLocations.push({
        index: m.warnings.length,
        points: [{ x: h.x, y: h.y }],
        lines: h.lines,
        kind: 'density',
      });
      m.warnings.push(
        `${h.value.toFixed(1)} layers of thread (limit ${m.maxDensity}) near (${h.x.toFixed(0)}, ${h.y.toFixed(0)})` +
          (h.lines.length
            ? ` — mostly line${h.lines.length > 1 ? 's' : ''} ${h.lines.join(', ')}`
            : '') +
          ' — may pucker or break needles',
      );
    }
    const stacks = density.hotspots.filter((h) => h.kind === 'stack').slice(0, 2);
    for (const h of stacks) {
      warningLocations.push({
        index: m.warnings.length,
        points: [{ x: h.x, y: h.y }],
        lines: h.lines,
        kind: 'stack',
      });
      m.warnings.push(
        `${h.value} needle penetrations in the same hole near (${h.x.toFixed(0)}, ${h.y.toFixed(0)})` +
          (h.lines.length ? ` — line ${h.lines[0]}` : '') +
          ' — this can cut the fabric',
      );
    }
  }

  let locks = 0;
  if (m.lockLen > 0) {
    const secured = applyLocks(m.events, m.lockLen);
    m.events = secured.events;
    locks = secured.locks;
  }

  return { events: m.events, warnings: m.warnings, warningLocations, printed, locks, density };
}
