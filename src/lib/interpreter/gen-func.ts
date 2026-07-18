import { NeedlescriptError } from '../errors.ts';
import { isList, isFuncRef, formatNum, num, describeVal } from '../list.ts';
import type { Val } from '../list.ts';
import * as gm from '../genmath.ts';
import type { Pt } from '../genmath.ts';
import { gauss, fork } from '../prng.ts';
import { offsetRegion, clipRegions, clipOpenPath, strokePath } from '../geometry.ts';
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
import { prepareRailPair } from '../rail-pair.ts';
import {
  colorDist,
  defaultSlotColor,
  hexParts,
  hsl,
  lerpColor,
  parseColor,
  rgb,
} from '../colormath.ts';

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
      case 'rgb':
        return ctx.allocString(rgb(sc(0), sc(1), sc(2)), line);
      case 'hsl':
        return ctx.allocString(hsl(sc(0), sc(1), sc(2)), line);
      case 'hexparts': {
        if (typeof args[0] !== 'string')
          throw new NeedlescriptError(
            `hexparts expects a color string, got ${describeVal(args[0])}`,
            line,
          );
        return ctx.allocList(hexParts(args[0], line), line);
      }
      case 'lerpcolor': {
        if (typeof args[0] !== 'string' || typeof args[1] !== 'string')
          throw new NeedlescriptError('lerpcolor expects two color strings', line);
        const mode = args[3] === undefined ? 'oklab' : args[3];
        if (typeof mode !== 'string')
          throw new NeedlescriptError('lerpcolor mode must be a string', line);
        return ctx.allocString(lerpColor(args[0], args[1], sc(2), mode.toLowerCase(), line), line);
      }
      case 'colordist': {
        if (typeof args[0] !== 'string' || typeof args[1] !== 'string')
          throw new NeedlescriptError('colordist expects two color strings', line);
        return colorDist(args[0], args[1], line);
      }
      case 'nearestcolor': {
        if (typeof args[0] !== 'string' || !isList(args[1]) || args[1].items.length === 0)
          throw new NeedlescriptError(
            'nearestcolor expects a color and a non-empty list of colors',
            line,
          );
        let best = '';
        let bestDistance = Infinity;
        args[1].items.forEach((entry, index) => {
          if (typeof entry !== 'string')
            throw new NeedlescriptError(
              `nearestcolor list entry ${index + 1} must be a color string`,
              line,
            );
          const distance = colorDist(args[0] as string, entry, line);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = parseColor(entry, line);
          }
        });
        return ctx.allocString(best, line);
      }
      case 'colorindex':
        return ctx.m.colorIdx + 1;
      case 'colorhex':
        return ctx.allocString(
          ctx.palette[ctx.m.colorIdx]?.hex ?? defaultSlotColor(ctx.m.colorIdx),
          line,
        );
      case 'slotcolor': {
        const slot = sc(0);
        if (!Number.isInteger(slot) || slot < 1)
          throw new NeedlescriptError('slotcolor expects a positive integer slot', line);
        return ctx.allocString(ctx.palette[slot - 1]?.hex ?? defaultSlotColor(slot - 1), line);
      }
      case 'backgroundcolor':
        return ctx.allocString(ctx.background, line);
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
      case 'ispoint':
        return isList(args[0]) &&
          args[0].items.length === 2 &&
          args[0].items.every((v) => typeof v === 'number' && Number.isFinite(v))
          ? 1
          : 0;
      case 'ispath': {
        if (!isList(args[0]) || args[0].items.length < 2) return 0;
        return args[0].items.every(
          (v) =>
            isList(v) &&
            v.items.length === 2 &&
            v.items.every((n) => typeof n === 'number' && Number.isFinite(n)),
        )
          ? 1
          : 0;
      }
      case 'iscurvespec':
        try {
          gm.toCurveSpec(args[0], name, line);
          return 1;
        } catch {
          return 0;
        }
      case 'isclosed':
        return gm.isClosedPath(pathArg(0, 1)) ? 1 : 0;
      case 'openpath':
        return path(gm.openPath(pathArg(0, 1)));
      case 'pathorientation':
        return gm.pathOrientation(pathArg(0, 3));
      case 'pointat':
        return point(gm.pointAt(pathArg(0, 1), sc(1)));
      case 'headingat':
        return gm.headingAt(pathArg(0, 1), sc(1));
      case 'normalat':
        return (((gm.headingAt(pathArg(0, 1), sc(1)) - 90) % 360) + 360) % 360;
      case 'paramof':
        return gm.paramOf(pointArg(0), pathArg(1, 1));
      case 'paramtomm': {
        const p = pathArg(0, 1);
        return gm.clamp(sc(1), 0, 1) * gm.pathlen(p);
      }
      case 'mmtoparam': {
        const p = pathArg(0, 1),
          total = gm.pathlen(p);
        return total <= 1e-12 ? 0 : gm.clamp(sc(1), 0, total) / total;
      }
      case 'subpath':
        return path(gm.subPath(pathArg(0, 1), sc(1), sc(2)));
      case 'splitat': {
        const p = pathArg(0, 1),
          t = sc(1);
        return regions([gm.subPath(p, 0, t), gm.subPath(p, t, 1)]);
      }
      case 'insertvertex':
        return path(gm.insertVertex(pathArg(0, 1), sc(1)));
      case 'dashes': {
        const input = pathArg(0, 1);
        const total = gm.pathlen(input);
        const on = sc(1);
        const off = sc(2);
        if (on < 0 || off < 0 || on + off <= 0)
          throw new NeedlescriptError(
            'dashes: onmm and offmm must be non-negative with a positive sum',
            line,
          );
        if (total <= 1e-12 || on <= 1e-12) return regions([]);
        const period = on + off;
        const rawPhase = args[3] === undefined ? 0 : sc(3);
        const phase = ((rawPhase % period) + period) % period;
        const pieces: gm.Pt[][] = [];
        for (let cursor = -phase; cursor < total; cursor += period) {
          const start = Math.max(0, cursor);
          const end = Math.min(total, cursor + on);
          if (end > start + 1e-12) pieces.push(gm.subPath(input, start / total, end / total));
        }
        return regions(pieces);
      }
      case 'curveflat': {
        const mode = args[2] === undefined ? 'open' : args[2];
        if (typeof mode !== 'string' || !['open', 'closed'].includes(mode.toLowerCase()))
          throw new NeedlescriptError("curveflat: mode must be 'open' or 'closed'", line);
        const flat = gm.curveFlat(
          gm.toCurveSpec(args[0], name, line),
          sc(1),
          mode.toLowerCase() === 'closed',
        );
        if (flat.length > ctx.m.effectiveLimits.maxListLen)
          throw new NeedlescriptError('List too long (curveflat output exceeds listlen)', line);
        return path(flat);
      }
      case 'curvepath': {
        let mode = 'open';
        if (typeof args[args.length - 1] === 'string')
          mode = (args[args.length - 1] as string).toLowerCase();
        if (!['open', 'closed'].includes(mode))
          throw new NeedlescriptError("curvepath: mode must be 'open' or 'closed'", line);
        const flat = gm.curveFlat(gm.toCurveSpec(args[0], name, line), 0.05, mode === 'closed');
        const spacing = args[1];
        if (isFuncRef(spacing)) {
          ctx.applyStitchLenReporterArity(spacing, line);
          return path(
            gm.resampleReporter(
              flat,
              (t, s, i, p) => ctx.applyStitchLenReporter(spacing, t, s, i, p, line),
              ctx.m.effectiveLimits.maxListLen,
              line,
            ),
          );
        }
        if (isList(spacing)) {
          const pattern = spacing.items.map((v, i) => {
            if (typeof v !== 'number')
              throw new NeedlescriptError(`curvepath: pattern element ${i} must be a number`, line);
            return v;
          });
          const phase = typeof args[2] === 'number' ? Math.round(args[2]) : 0;
          return path(
            gm.resampleList(flat, pattern, phase, ctx.m.effectiveLimits.maxListLen, line),
          );
        }
        return path(
          mode === 'closed'
            ? gm.resampleClosed(flat, sc(1), ctx.m.effectiveLimits.maxListLen, line)
            : gm.resample(flat, sc(1), ctx.m.effectiveLimits.maxListLen, line),
        );
      }
      case 'resample': {
        const pts = pathArg(0);
        const spec = args[1];
        const mode =
          typeof args[args.length - 1] === 'string'
            ? (args[args.length - 1] as string).toLowerCase()
            : 'open';
        if (!['open', 'closed'].includes(mode))
          throw new NeedlescriptError("resample: mode must be 'open' or 'closed'", line);
        if (isFuncRef(spec)) {
          // Reporter form: resample(path, @fn)  [phase ignored]
          const ref = spec;
          // Arity check: the reporter must take 4 params (t, s, i, p)
          ctx.applyStitchLenReporterArity(ref, line);
          ctx.tickN(pts.length * 4, line);
          return path(
            gm.resampleReporter(
              mode === 'closed' ? gm.closePathCanonical(pts) : pts,
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
          const phase = typeof args[2] === 'number' ? Math.round(sc(2)) : 0;
          ctx.tickN(pts.length * 4, line);
          const input = mode === 'closed' ? gm.closePathCanonical(pts) : pts;
          return path(
            gm.resampleList(input, patRaw, phase, ctx.m.effectiveLimits.maxListLen, line),
          );
        }
        // Numeric form (unchanged)
        return path(
          mode === 'closed'
            ? gm.resampleClosed(pts, sc(1), ctx.m.effectiveLimits.maxListLen, line)
            : gm.resample(pts, sc(1), ctx.m.effectiveLimits.maxListLen, line),
        );
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
      case 'strokepath': {
        const capValue = args[2] ?? 'round',
          joinValue = args[3] ?? 'round';
        if (
          typeof capValue !== 'string' ||
          !['round', 'butt', 'square'].includes(capValue.toLowerCase())
        )
          throw new NeedlescriptError("strokepath: cap must be 'round', 'butt', or 'square'", line);
        if (
          typeof joinValue !== 'string' ||
          !['round', 'miter', 'bevel'].includes(joinValue.toLowerCase())
        )
          throw new NeedlescriptError(
            "strokepath: join must be 'round', 'miter', or 'bevel'",
            line,
          );
        return regions(
          strokePath(
            pathArg(0),
            sc(1),
            capValue.toLowerCase() as 'round' | 'butt' | 'square',
            joinValue.toLowerCase() as 'round' | 'miter' | 'bevel',
            line,
            ctx.m.effectiveLimits.maxClipVerts,
          ),
        );
      }
      case 'clipopen': {
        const modeValue = args[2] ?? 'inside';
        if (
          typeof modeValue !== 'string' ||
          !['inside', 'outside'].includes(modeValue.toLowerCase())
        )
          throw new NeedlescriptError("clipopen: mode must be 'inside' or 'outside'", line);
        return regions(
          clipOpenPath(
            pathArg(0),
            compoundRegionArg(1),
            modeValue.toLowerCase() as 'inside' | 'outside',
            line,
            ctx.m.effectiveLimits.maxClipVerts,
          ),
        );
      }
      case 'joinpaths': {
        if (!isList(args[0]))
          throw new NeedlescriptError('joinpaths: expected a list of paths', line);
        const fragments = args[0].items.map((v) => gm.toPath(v, name, line, 1));
        const count = fragments.reduce((n, fragment) => n + fragment.length, 0);
        if (count > ctx.m.effectiveLimits.maxDelaunayPoints)
          throw new NeedlescriptError(
            `joinpaths: too many input vertices (${count.toLocaleString('en-US')})`,
            line,
          );
        return regions(gm.joinPaths(fragments, sc(1)));
      }
      case 'pathisectparams':
      case 'pathselfisects': {
        const hits =
          name === 'pathisectparams'
            ? gm.pathIntersectionParams(pathArg(0, 1), pathArg(1, 1))
            : gm.pathSelfIntersections(pathArg(0, 1));
        return ctx.allocList(
          hits.map((hit) => ctx.allocList([point(hit.point), hit.ta, hit.tb], line)),
          line,
        );
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
      case 'railinset': {
        const advance = sc(0),
          inset = sc(1);
        return ctx.allocList([advance, inset, inset, 0, 0], line);
      }
      case 'railrake': {
        const advance = sc(0),
          lag = sc(1);
        return ctx.allocList([advance, 0, 0, -lag, lag], line);
      }
      case 'railspine': {
        const railA = pathArg(0);
        const railB = pathArg(1);
        const inputCount = railA.length + railB.length;
        if (inputCount > ctx.m.effectiveLimits.maxDelaunayPoints)
          throw new NeedlescriptError(
            `railspine: too many input vertices (${inputCount.toLocaleString('en-US')}, limit ${ctx.m.effectiveLimits.maxDelaunayPoints.toLocaleString('en-US')})`,
            line,
          );
        ctx.tickN(inputCount, line);
        const geometry = prepareRailPair(
          railA,
          railB,
          [],
          line,
          (n) => ctx.tickN(n, line),
          'railspine',
        );
        return path(geometry.samples.map((sample) => sample.mid));
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
