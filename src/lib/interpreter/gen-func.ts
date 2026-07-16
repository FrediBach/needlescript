import { NeedlescriptError } from '../errors.ts';
import { isList, isFuncRef, formatNum, num, describeVal } from '../list.ts';
import type { Val } from '../list.ts';
import * as gm from '../genmath.ts';
import type { Pt } from '../genmath.ts';
import { gauss, fork } from '../prng.ts';
import { offsetRegion, clipRegions } from '../geometry.ts';
import { scatter, voronoiCells, triangulate, hull, relax } from '../generators.ts';
import type { Domain } from '../generators.ts';
import {
  applyPath,
  apply,
  mTranslate,
  mRotate,
  mRotateAbout,
  mScale,
  mScaleXY,
  mMirror,
} from '../affine.ts';
import { humanizeMap, snapMapFromSpec } from '../effects.ts';
import { makeDeclumpState, declumpFoldPoint } from '../declump.ts';
import { hoopFieldDomain, hoopFieldPolygon } from '../hoop-presets.ts';
import { GEN_QWORD_ARG } from '../commands.ts';
import { didYouMean } from '../suggestions.ts';
import { closePath, contourPaths, fillRows, spiralPaths } from '../fill-paths.ts';
import type { RunContext } from './context.ts';
import { routeItems, ROUTESORT_MODES } from '../routing.ts';
import type { RoutePoint } from '../routing.ts';

export function initGenFunc(ctx: RunContext): void {
  ctx.genFunc = (name: string, args: Val[], line: number | undefined): Val => {
    const sc = (i: number) => num(args[i], name, line);
    const pointArg = (i: number) => gm.toPoint(args[i], name, line);
    const pathArg = (i: number, min = 2) => gm.toPath(args[i], name, line, min);
    const regionArg = (i: number) => gm.toRegion(args[i], name, line);
    const compoundRegionArg = (i: number): Pt[][] => {
      const value = args[i];
      if (!isList(value) || value.items.length === 0)
        throw new NeedlescriptError(`${name}: expected a region (a ring or a list of rings)`, line);
      const first = value.items[0];
      if (
        isList(first) &&
        first.items.length === 2 &&
        first.items.every((v) => typeof v === 'number')
      )
        return [gm.toRegion(value, name, line)];
      return value.items.map((ring) => gm.toRegion(ring, name, line));
    };
    const point = (p: Pt) => ctx.allocList([p[0], p[1]], line);
    const path = (pts: Pt[]) => gm.fromPoints(pts, (items) => ctx.allocList(items, line));
    const regions = (rs: Pt[][]) =>
      ctx.allocList(
        rs.map((r) => path(r) as Val),
        line,
      );
    const domainArg = (i: number): Domain => {
      if (args.length > i) return { kind: 'poly', pts: regionArg(i) };
      // No explicit region: use the configured field and lock it so a subsequent
      // `hoop` call produces a clear error instead of silently using the wrong field.
      ctx.m.fieldLocked = true;
      return hoopFieldDomain(ctx.m.hoopInfo);
    };
    const delaunayInput = (i: number, min: number) => {
      const pts = pathArg(i, min);
      if (pts.length > ctx.m.effectiveLimits.maxDelaunayPoints)
        throw new NeedlescriptError(
          `${name}: too many points (${pts.length.toLocaleString('en-US')}, limit ${ctx.m.effectiveLimits.maxDelaunayPoints.toLocaleString('en-US')})`,
          line,
        );
      ctx.tickN(pts.length, line);
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
        return gauss(ctx.rng, sc(0), sc(1)); // exactly 2 main-stream draws

      // ----- §4.2 noise (range −1…1; legacy noise/noise2 keep 0…1) -----
      case 'snoise2':
        return ctx.snoise2(sc(0), sc(1));
      case 'snoise3':
        return ctx.snoise3(sc(0), sc(1), sc(2));
      case 'fbm2': {
        const x = sc(0),
          y = sc(1);
        const want = Math.round(sc(2));
        const oct = gm.clamp(want, 1, 8);
        if (oct !== want)
          ctx.m.warnings.push(`fbm2 octaves ${formatNum(sc(2))} clamped to ${oct} (range 1–8)`);
        let sum = 0,
          ampSum = 0,
          amp = 1,
          freq = 1;
        for (let o = 0; o < oct; o++) {
          sum += ctx.snoise2(x * freq, y * freq) * amp;
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
        return r ? point(r) : ctx.allocList([], line);
      }
      case 'segdist':
        return gm.segdist(pointArg(0), pointArg(1), pointArg(2));
      case 'nearestonpath': {
        const p = pointArg(0);
        const pts = gm.toPath(args[1], name, line, 1);
        ctx.tickN(pts.length, line);
        return point(gm.nearestOnPath(p, pts, line));
      }

      // ----- §4.4 paths & curves -----
      case 'pathlen': {
        const p = pathArg(0);
        ctx.tickN(p.length, line);
        return gm.pathlen(p);
      }
      case 'resample': {
        const pts = pathArg(0);
        const spec = args[1];
        if (isFuncRef(spec)) {
          // Reporter form: resample(path, @fn)  [phase ignored]
          const ref = spec;
          // Arity check: the reporter must take 4 params (t, s, i, p)
          ctx.applyStitchLenReporterArity(ref, line);
          ctx.tickN(pts.length * 4, line);
          return path(
            gm.resampleReporter(
              pts,
              (t, s, i, p) => ctx.applyStitchLenReporter(ref, t, s, i, p, line),
              ctx.m.effectiveLimits.maxListLen,
              line,
            ),
          );
        }
        if (isList(spec)) {
          // List form: resample(path, [pat])  or  resample(path, [pat], phase)
          if (spec.items.length === 0)
            throw new NeedlescriptError('resample: pattern list must not be empty', line);
          const patRaw: number[] = spec.items.map((el, idx) => {
            if (typeof el !== 'number' || isList(el))
              throw new NeedlescriptError(
                `resample: pattern element ${idx} must be a number, got ${describeVal(el)}`,
                line,
              );
            return el as number;
          });
          const phase = args.length > 2 ? Math.round(sc(2)) : 0;
          ctx.tickN(pts.length * 4, line);
          return path(gm.resampleList(pts, patRaw, phase, ctx.m.effectiveLimits.maxListLen, line));
        }
        // Numeric form (unchanged)
        return path(gm.resample(pts, sc(1), ctx.m.effectiveLimits.maxListLen, line));
      }
      case 'chaikin': {
        const p = pathArg(0);
        const want = Math.round(sc(1));
        const n = gm.clamp(want, 1, 6);
        if (n !== want)
          ctx.m.warnings.push(`chaikin iterations ${formatNum(sc(1))} clamped to ${n} (range 1–6)`);
        if (p.length * Math.pow(2, n) > ctx.m.effectiveLimits.maxListLen)
          throw new NeedlescriptError(
            `List too long (chaikin would produce over ${ctx.m.effectiveLimits.maxListLen.toLocaleString('en-US')} points)`,
            line,
          );
        return path(gm.chaikin(p, n));
      }
      case 'catmull':
        return path(gm.catmull(pathArg(0), sc(1), ctx.m.effectiveLimits.maxListLen, line));
      case 'bezier':
        return path(
          gm.bezier(
            pointArg(0),
            pointArg(1),
            pointArg(2),
            pointArg(3),
            sc(4),
            ctx.m.effectiveLimits.maxListLen,
            line,
          ),
        );
      case 'centroid':
        return point(gm.centroid(pathArg(0)));
      case 'bbox': {
        const [minx, miny, maxx, maxy] = gm.bbox(pathArg(0));
        return ctx.allocList([minx, miny, maxx, maxy], line);
      }
      case 'routesort': {
        const source = args[0];
        if (!isList(source))
          throw new NeedlescriptError(
            `routesort: expected a list of points or paths, got ${describeVal(source)}`,
            line,
          );
        if (source.items.length > ctx.m.effectiveLimits.maxDelaunayPoints)
          throw new NeedlescriptError(
            `routesort: too many items (${source.items.length.toLocaleString('en-US')}, limit ${ctx.m.effectiveLimits.maxDelaunayPoints.toLocaleString('en-US')})`,
            line,
          );

        let start: RoutePoint | undefined;
        let modeName = 'chain';
        const readMode = (value: Val) => {
          if (typeof value !== 'string')
            throw new NeedlescriptError(
              `routesort: mode must be a string, got ${describeVal(value)} — expected 'chain' or 'both'`,
              line,
            );
          modeName = value.toLowerCase();
        };
        if (args.length >= 2) {
          if (typeof args[1] === 'string') readMode(args[1]);
          else start = gm.toPoint(args[1], 'routesort start', line);
        }
        if (args.length >= 3) {
          if (start === undefined)
            throw new NeedlescriptError(
              'routesort: the three-argument form is routesort(items, start, mode)',
              line,
            );
          readMode(args[2]);
        }
        const mode = ROUTESORT_MODES[modeName];
        if (!mode)
          throw new NeedlescriptError(
            `routesort doesn't know '${modeName}'${didYouMean(modeName, Object.keys(ROUTESORT_MODES))} — choices: ${Object.keys(ROUTESORT_MODES).join(', ')}`,
            line,
          );

        const routeValues = source.items.map((value, index) => {
          if (!isList(value) || value.items.length === 0)
            throw new NeedlescriptError(
              `routesort: element ${index} must be a point [x, y] or a non-empty path — got ${describeVal(value)}`,
              line,
            );
          const isPoint =
            value.items.length === 2 && value.items.every((item) => typeof item === 'number');
          if (isPoint) {
            const x = value.items[0] as number;
            const y = value.items[1] as number;
            return { value, index, entry: [x, y] as RoutePoint, exit: [x, y] as RoutePoint };
          }
          const points = value.items.map((vertex, vertexIndex) => {
            if (
              !isList(vertex) ||
              vertex.items.length !== 2 ||
              !vertex.items.every((coordinate) => typeof coordinate === 'number')
            )
              throw new NeedlescriptError(
                `routesort: element ${index}, vertex ${vertexIndex} isn't a point [x, y] — got ${describeVal(vertex)}`,
                line,
              );
            return [vertex.items[0] as number, vertex.items[1] as number] as RoutePoint;
          });
          return {
            value,
            index,
            entry: points[0],
            exit: points[points.length - 1],
            reverseEntry: points[points.length - 1],
            reverseExit: points[0],
          };
        });
        ctx.tickN(routeValues.length, line);
        const routed = routeItems(mode.algorithm, routeValues, {
          start,
          anchorFirst: start === undefined,
          allowReverse: mode.reversePaths,
          examine: (count) => ctx.tickN(count, line),
        });
        return ctx.allocList(
          routed.map(({ item, reversed }) =>
            reversed && isList(item.value)
              ? ctx.allocList([...item.value.items].reverse(), line)
              : item.value,
          ),
          line,
        );
      }

      // ----- §4.5 generators -----
      case 'scatter': {
        // fork convention (§7): exactly one main-stream draw
        const pts = scatter(
          sc(0),
          domainArg(1),
          fork(ctx.rng),
          ctx.m.effectiveLimits.maxScatterPoints,
          line,
        );
        ctx.tickN(pts.length * 4, line);
        return path(pts.length ? pts : []);
      }
      case 'voronoi': {
        const pts = delaunayInput(0, 1);
        const cells = voronoiCells(pts, domainArg(1), line);
        ctx.tickN(pts.length * 8, line);
        return ctx.allocList(
          cells.map((c) => (c.length ? path(c) : ctx.allocList([], line)) as Val),
          line,
        );
      }
      case 'triangulate': {
        const pts = delaunayInput(0, 3);
        const tris = triangulate(pts, line);
        return ctx.allocList(
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
          ctx.m.warnings.push(`relax iterations ${formatNum(sc(1))} clamped to ${n} (range 0–50)`);
        ctx.tickN(pts.length * 8 * Math.max(1, n), line);
        // Use the configured field (and lock it so a subsequent hoop call errors).
        ctx.m.fieldLocked = true;
        return path(relax(pts, n, hoopFieldDomain(ctx.m.hoopInfo), line));
      }

      // ----- §4.6 geometry ops -----
      case 'offsetpath': {
        const r = regionArg(0);
        ctx.tickN(r.length * 4, line);
        return regions(offsetRegion(r, sc(1), line, ctx.m.effectiveLimits.maxClipVerts));
      }
      case 'clippaths': {
        const a = regionArg(0),
          b = regionArg(1);
        // Third arg is now a string expression (not a parse-time qword).
        const opVal = args[2];
        if (typeof opVal !== 'string')
          throw new NeedlescriptError(
            `clippaths: operation must be a string, got ${describeVal(opVal)} — e.g. clippaths(a, b, 'difference')`,
            line,
          );
        const op = opVal.toLowerCase();
        const allowed = GEN_QWORD_ARG['clippaths'].allowed;
        if (!allowed.includes(op))
          throw new NeedlescriptError(
            `clippaths doesn't know '${op}'${didYouMean(op, allowed)} — choices: ${allowed.join(', ')}`,
            line,
          );
        ctx.tickN((a.length + b.length) * 4, line);
        return regions(clipRegions(a, b, op, line, ctx.m.effectiveLimits.maxClipVerts));
      }
      case 'inpath':
        return gm.pointInRegion(pointArg(0), regionArg(1)) ? 1 : 0;
      case 'closepath':
        return path(closePath(pathArg(0, 3), line));
      case 'contourpaths':
        return regions(
          contourPaths(compoundRegionArg(0), sc(1), ctx.m.effectiveLimits.maxClipVerts, line),
        );
      case 'spiralpath':
        return regions(
          spiralPaths(compoundRegionArg(0), sc(1), ctx.m.effectiveLimits.maxClipVerts, line),
        );
      case 'fillrows':
        return regions(fillRows(compoundRegionArg(0), sc(1), sc(2)));

      // ----- §hoop: field reporters -----
      case 'infield': {
        // Map point through the CTM (local → hoop space) then test against field.
        const p = gm.toPoint(args[0], 'infield', line);
        const [hx, hy] = apply(ctx.m.ctm, p[0], p[1]);
        return ctx.m.hoopInfo.shape === 'circle'
          ? hx * hx + hy * hy <= (ctx.m.hoopInfo.fieldWidthMM / 2) ** 2
            ? 1
            : 0
          : Math.abs(hx) <= ctx.m.hoopInfo.fieldWidthMM / 2 &&
              Math.abs(hy) <= ctx.m.hoopInfo.fieldHeightMM / 2
            ? 1
            : 0;
      }
      case 'fieldbounds': {
        // Bounding box of the sewable field: [minX, minY, maxX, maxY] (hoop space).
        const hw = ctx.m.hoopInfo.fieldWidthMM / 2;
        const hh = ctx.m.hoopInfo.fieldHeightMM / 2;
        return ctx.allocList([-hw, -hh, hw, hh], line);
      }
      case 'fieldpath': {
        // Sewable field boundary as a CCW polygon (hoop space). Zero RNG draws.
        const pts = hoopFieldPolygon(ctx.m.hoopInfo, 2);
        return path(pts);
      }

      // ----- §4.7 pure path transforms (companions to the block commands) -----
      case 'xlate':
        return path(applyPath(mTranslate(sc(1), sc(2)), pathArg(0)));
      case 'xrotate': {
        if (args.length === 3)
          throw new NeedlescriptError(
            'xrotate takes a pivot as two numbers: xrotate(path, deg, cx, cy)',
            line,
          );
        const mat = args.length >= 4 ? mRotateAbout(sc(1), sc(2), sc(3)) : mRotate(sc(1));
        return path(applyPath(mat, pathArg(0)));
      }
      case 'xscale': {
        const mat = args.length >= 3 ? mScaleXY(sc(1), sc(2)) : mScale(sc(1));
        return path(applyPath(mat, pathArg(0)));
      }
      case 'xmirror':
        return path(applyPath(mMirror(sc(1)), pathArg(0)));

      // ----- effects: pure path companions to the effect block commands -----
      case 'warppath': {
        const p = pathArg(0);
        if (!isFuncRef(args[1]))
          throw new NeedlescriptError(
            'warppath needs a procedure reference as its second argument, e.g.  warppath(path, @push_out)',
            line,
          );
        const ref = args[1];
        ctx.tickN(p.length, line);
        return path(p.map((pt) => ctx.applyReporter(ref, pt[0], pt[1], line)));
      }
      case 'humanizepath': {
        const p = pathArg(0);
        const amount = ctx.clampHumanize(sc(1));
        // One main-stream draw seeds the coherent field (fork convention §7).
        const childSeed = Math.floor(ctx.rng() * 4294967296);
        const fn = humanizeMap(amount, childSeed, ctx.snoise2);
        ctx.tickN(p.length, line);
        return path(p.map((pt) => fn(pt[0], pt[1])));
      }
      case 'snappath': {
        const p = pathArg(0);
        const nums = args.slice(1).map((_, i) => sc(i + 1));
        const fn = snapMapFromSpec(nums, (msg) => new NeedlescriptError(`snappath ${msg}`, line));
        ctx.tickN(p.length, line);
        return path(p.map((pt) => fn(pt[0], pt[1])));
      }
      case 'declumppath': {
        // Pure data twin of `declump`: runs the identical greedy fold over an
        // explicit point list, reading real committed history but committing
        // nothing. Drawless — the fold is deterministic given the density grid.
        // Resample to stitch pitch first: sewpath(declumppath(resample(spine, 2.5), 2, 1.5))
        const p = pathArg(0);
        const limit = Math.max(0, sc(1));
        const maxshift = args.length >= 3 ? ctx.clampMaxshift(sc(2)) : 1.5;
        ctx.tickN(p.length, line);
        const state = makeDeclumpState(limit, maxshift);
        const result: [number, number][] = p.map((pt, i) => {
          const nextPt = i + 1 < p.length ? ([p[i + 1][0], p[i + 1][1]] as [number, number]) : null;
          // density reads only — no _push, nothing committed
          return declumpFoldPoint(state, [pt[0], pt[1]] as [number, number], nextPt, ctx.m.density);
        });
        return path(result);
      }

      // ---- DX: satin-tuple helpers ----
      // Build the 5-slot contract list by intent rather than memorising slot order.
      case 'satinpair': {
        // satinpair(advance, width) ≡ [advance, width, width, 0, 0]
        const advance = sc(0),
          width = sc(1);
        return ctx.allocList([advance, width, width, 0, 0], line);
      }
      case 'satinrake': {
        // satinrake(advance, width, lag) ≡ [advance, width, width, -lag, lag]
        const advance = sc(0),
          width = sc(1),
          lag = sc(2);
        return ctx.allocList([advance, width, width, -lag, lag], line);
      }
      case 'satinasym': {
        // satinasym(advance, leftw, rightw) ≡ [advance, leftw, rightw, 0, 0]
        const advance = sc(0),
          leftw = sc(1),
          rightw = sc(2);
        return ctx.allocList([advance, leftw, rightw, 0, 0], line);
      }

      // ---- DX: fill-shaper helper ----
      case 'tatamirow': {
        // tatamirow(spacing, len) ≡ [spacing, len, 0.5]  (standard brick offset)
        // tatamirow(spacing, len, phase) ≡ [spacing, len, phase]
        const spacing = sc(0),
          len = sc(1);
        const phase = args.length >= 3 ? sc(2) : 0.5;
        return ctx.allocList([spacing, len, phase], line);
      }
    }
    throw new NeedlescriptError(`Unknown function ${name}`, line);
  };
}
