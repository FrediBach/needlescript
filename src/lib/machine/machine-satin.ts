// ---------- Satin and buffered running-stitch generation ----------

import { LIMITS } from './limits.ts';
import { NeedlescriptError } from '../errors.ts';
import { IDENTITY, apply, isIdentity, linApply } from '../affine.ts';
import type { Mat } from '../affine.ts';
import { MachineCore } from './machine-core.ts';
import type { Pt } from '../genmath.ts';
import { prepareRailPair } from '../rail-pair.ts';
import type { RailCheckpoint, RailPairGeometry, RailPairSample } from '../rail-pair.ts';

export class SatinMachine extends MachineCore {
  // ---- Satin column: underlay + zigzag, sewn when the column ends ----

  /** Sew running stitches along a polyline (used for underlay passes). */
  _runAlong(pts: { x: number; y: number }[], slen: number, u: boolean) {
    if (!pts.length) return;
    let cx = this.lastEmit ? this.lastEmit.x : pts[0].x;
    let cy = this.lastEmit ? this.lastEmit.y : pts[0].y;
    for (const p of pts) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < 0.1) continue;
      const steps = Math.max(1, Math.ceil(d / slen));
      for (let s = 1; s <= steps; s++) {
        this._push('stitch', cx + ((p.x - cx) * s) / steps, cy + ((p.y - cy) * s) / steps, u);
      }
      cx = p.x;
      cy = p.y;
    }
  }

  /** Offset a polyline sideways by `dist` along per-vertex left normals. */
  _offsetPath(pts: { x: number; y: number }[], dist: number): { x: number; y: number }[] {
    const n = pts.length;
    if (n < 2) return pts.slice();
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)],
        b = pts[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      out.push({ x: pts[i].x - (dy / len) * dist, y: pts[i].y + (dx / len) * dist });
    }
    return out;
  }

  /**
   * Zigzag along a polyline. `shortStitch` applies the curve-physics fix:
   * on tight curves the inner-edge penetrations bunch up (thread breaks,
   * fabric damage), so alternate inner stitches are pulled in to 60% width.
   */
  _zigzagAlong(
    path: { x: number; y: number }[],
    width: number,
    spacing: number,
    u: boolean,
    shortStitch: boolean,
  ) {
    const half = width / 2;
    let prevUx: number | null = null,
      prevUy = 0;
    let innerCounter = 0;
    let warnedTight = false;
    for (let i = 1; i < path.length; i++) {
      const ox = path[i - 1].x,
        oy = path[i - 1].y;
      const dxT = path[i].x - ox,
        dyT = path[i].y - oy;
      const len = Math.hypot(dxT, dyT);
      if (len < 1e-9) continue;
      const ux = dxT / len,
        uy = dyT / len;
      const px = -uy,
        py = ux; // left normal
      let innerSide = 0;
      let crowded = false;
      if (prevUx !== null) {
        const cross = prevUx * uy - prevUy * ux; // > 0 = turning left
        const dot = Math.max(-1, Math.min(1, prevUx * ux + prevUy * uy));
        const theta = Math.acos(dot);
        // Only treat gentle, continuous turns as curvature — sharp corners
        // and reversals (retraced columns) are not curves.
        if (theta > 1e-3 && theta < 2.1) {
          const R = len / theta; // local curvature radius of the chord sequence
          if (R < half && !u && !warnedTight) {
            this.warnings.push(
              `satin ${width.toFixed(1)} mm is wider than the curve it follows (radius ~${R.toFixed(1)} mm) — split the column or widen the curve`,
            );
            warnedTight = true;
          }
          if (shortStitch) {
            const innerSpacing = spacing * (1 - half / Math.max(R, half));
            if (innerSpacing < 0.3) {
              crowded = true;
              innerSide = cross > 0 ? 1 : -1;
            }
          }
        }
      }
      const steps = Math.max(1, Math.ceil(len / spacing));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const cx = ox + dxT * t,
          cy = oy + dyT * t;
        this.satinSide = -this.satinSide;
        let h = half;
        if (crowded && this.satinSide === innerSide) {
          innerCounter++;
          if (innerCounter % 2 === 1) h = half * 0.6;
        }
        this._push('stitch', cx + px * h * this.satinSide, cy + py * h * this.satinSide, u);
      }
      prevUx = ux;
      prevUy = uy;
    }
  }

  /** Sew an immediate satin column between two authored rails. */
  sewSatinBetween(
    localRailA: readonly Pt[],
    localRailB: readonly Pt[],
    localCheckpoints: readonly RailCheckpoint[],
    reporter:
      | ((t: number, s: number, i: number, u: number) => [number, number, number, number, number])
      | null,
    chargeOps?: (count: number) => void,
  ) {
    const forcedFlush = !!(this.satinPath && this.satinPath.length >= 2);
    this.flushSatin();
    if (forcedFlush)
      this.warnings.push(
        'note: satinbetween flushed the active spine satin column first; the satin mode remains active',
      );
    if (this.recording)
      throw new NeedlescriptError(
        'satinbetween cannot run inside beginfill…endfill — capture the rails and sew afterward',
        this.currentLine,
      );
    if ((this.penLayers.length || this.declumpStack.length) && !this._warnedSatinEffect) {
      this.warnings.push(
        'humanize/snaptogrid/declump skips satin columns — perturbing satin rails wrecks the column; it sews unaffected',
      );
      this._warnedSatinEffect = true;
    }

    // Rails are mapped before pairing: all lengths below are physical hoop millimetres.
    const railA = localRailA.map(([x, y]) => this.mapOut(x, y));
    const railB = localRailB.map(([x, y]) => this.mapOut(x, y));
    const checkpoints = localCheckpoints.map((cp) => ({
      a: this.mapOut(cp.a[0], cp.a[1]),
      b: this.mapOut(cp.b[0], cp.b[1]),
    }));
    const geometry = prepareRailPair(railA, railB, checkpoints, this.currentLine, chargeOps);
    if (geometry.railBReversed)
      this.warnings.push(
        geometry.closed
          ? 'note: rail B winding reversed to match rail A'
          : "note: rail B reversed to match rail A's direction",
      );
    if (geometry.closed && geometry.seamChosen)
      this.warnings.push('note: satinbetween chose a deterministic closed-rail seam');
    if (geometry.samples.every((sample) => this._railWidth(sample) < 0.05))
      throw new NeedlescriptError(
        'satinbetween rails coincide everywhere; the column has no width',
        this.currentLine,
      );

    const topping: { x: number; y: number; side: number; sample: RailPairSample }[] = [];
    let side = this.satinSide;
    let insetWarned = false;
    let advanceWarned = false;
    const place = (
      sample: RailPairSample,
      which: number,
      inset: number,
      lag: number,
      arc: number,
    ) => {
      const width = this._railWidth(sample);
      let safeInset = inset;
      if (safeInset > width / 2) {
        safeInset = width / 2;
        if (!insetWarned) {
          this.warnings.push(
            'satinbetween reporter insets crossed the rung midpoint — clamped so the penetrations meet',
          );
          insetWarned = true;
        }
      }
      const basePoint = which > 0 ? sample.a : sample.b;
      const other = which > 0 ? sample.b : sample.a;
      const before = geometry.atArc(arc - 0.05);
      const after = geometry.atArc(arc + 0.05);
      const beforeRail = which > 0 ? before.a : before.b;
      const afterRail = which > 0 ? after.a : after.b;
      const tdx = afterRail[0] - beforeRail[0];
      const tdy = afterRail[1] - beforeRail[1];
      const tangentLength = Math.hypot(tdx, tdy) || 1;
      const base: Pt = [
        basePoint[0] + (tdx / tangentLength) * lag,
        basePoint[1] + (tdy / tangentLength) * lag,
      ];
      const dx = other[0] - basePoint[0];
      const dy = other[1] - basePoint[1];
      const len = Math.hypot(dx, dy);
      const ux = len > 1e-9 ? dx / len : 0;
      const uy = len > 1e-9 ? dy / len : 0;
      // Positive inset moves inward; pull compensation widens by the same
      // total amount as existing satin (half on each edge).
      const move = safeInset - this.pullComp / 2;
      return { x: base[0] + ux * move, y: base[1] + uy * move };
    };

    if (reporter) {
      let cursor = 0;
      let pair = 0;
      const guardMax = this.effectiveLimits.maxStitches + 10;
      while (cursor < geometry.spineLength - 1e-9 && pair < guardMax) {
        const base = geometry.atArc(cursor);
        const ret = reporter(cursor, cursor / geometry.spineLength, pair, base.heading);
        let advance = ret[0];
        if (!(advance > 0)) {
          advance = 0.1;
          if (!advanceWarned) {
            this.warnings.push(
              'satinbetween reporter advance must be greater than 0 — clamped to 0.1 mm',
            );
            advanceWarned = true;
          }
        }
        for (let k = 1; k <= 2; k++) {
          const arc = cursor + advance * k;
          if (arc > geometry.spineLength + 1e-9) break;
          side = -side;
          const sample = geometry.atArc(arc);
          const point = place(
            sample,
            side,
            side > 0 ? ret[1] : ret[2],
            side > 0 ? ret[3] : ret[4],
            arc,
          );
          topping.push({ ...point, side, sample });
        }
        cursor += advance * 2;
        pair++;
      }
    } else {
      const steps = Math.max(1, Math.ceil(geometry.spineLength / this.satinSpacing));
      for (let step = 1; step <= steps; step++) {
        const arc = (geometry.spineLength * step) / steps;
        side = -side;
        const sample = geometry.linearSpine
          ? geometry.atProgress(step / steps)
          : geometry.atArc(arc);
        const point = place(sample, side, 0, 0, arc);
        topping.push({ ...point, side, sample });
      }
    }
    this.satinSide = side;

    this._shortenRailPairCrowding(topping);
    this._warnRailPairCrossings(geometry, chargeOps);
    this._warnRailPairCurvature(geometry);
    this._emitRailPairColumn(geometry, topping);

    // The turtle remains in local space. Keep heading/pen/mode untouched and
    // place it at the authored endpoint corresponding to the final rail side.
    const localEnd =
      side > 0 ? localRailA[localRailA.length - 1] : localRailB[localRailB.length - 1];
    this.x = localEnd[0];
    this.y = localEnd[1];
  }

  _railWidth(sample: RailPairSample): number {
    return Math.hypot(sample.b[0] - sample.a[0], sample.b[1] - sample.a[1]);
  }

  _shortenRailPairCrowding(
    topping: { x: number; y: number; side: number; sample: RailPairSample }[],
  ) {
    if (!this.shortStitch) return;
    let shortened = 0;
    for (let i = 2; i < topping.length; i++) {
      const point = topping[i];
      const previous = topping[i - 2];
      if (
        point.side !== previous.side ||
        Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.3
      )
        continue;
      if (shortened++ % 2 !== 0) continue;
      point.x = point.sample.mid[0] + (point.x - point.sample.mid[0]) * 0.6;
      point.y = point.sample.mid[1] + (point.y - point.sample.mid[1]) * 0.6;
    }
  }

  _warnRailPairCrossings(geometry: RailPairGeometry, chargeOps?: (count: number) => void) {
    let count = 0;
    let first: Pt | null = null;
    const intersects = (a: Pt, b: Pt, c: Pt, d: Pt) => {
      const cross = (p: Pt, q: Pt, r: Pt) =>
        (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const abC = cross(a, b, c);
      const abD = cross(a, b, d);
      const cdA = cross(c, d, a);
      const cdB = cross(c, d, b);
      return abC * abD < -1e-12 && cdA * cdB < -1e-12;
    };
    for (let i = 1; i < geometry.samples.length; i++) {
      chargeOps?.(1);
      const a = geometry.samples[i - 1];
      const b = geometry.samples[i];
      if (intersects(a.a, a.b, b.a, b.b)) {
        count++;
        first ??= b.mid;
      }
    }
    if (first)
      this.warnings.push(
        `rail-pair rungs cross near (${first[0].toFixed(1)}, ${first[1].toFixed(1)}); ${count} crossing${count === 1 ? '' : 's'} found — add checkpoints or split the column`,
      );
  }

  _warnRailPairCurvature(geometry: RailPairGeometry) {
    for (const rail of ['a', 'b'] as const) {
      for (let i = 1; i < geometry.samples.length - 1; i++) {
        const p0 = geometry.samples[i - 1][rail];
        const p1 = geometry.samples[i][rail];
        const p2 = geometry.samples[i + 1][rail];
        const ax = p1[0] - p0[0];
        const ay = p1[1] - p0[1];
        const bx = p2[0] - p1[0];
        const by = p2[1] - p1[1];
        const la = Math.hypot(ax, ay);
        const lb = Math.hypot(bx, by);
        if (la < 1e-9 || lb < 1e-9) continue;
        const theta = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
        if (theta > 1e-3 && theta < 2.1 && lb / theta < this._railWidth(geometry.samples[i])) {
          this.warnings.push(
            `satinbetween column is wider than the curve it follows near (${p1[0].toFixed(1)}, ${p1[1].toFixed(1)}) — split the column or widen the curve`,
          );
          return;
        }
      }
    }
  }

  _emitRailPairColumn(
    geometry: RailPairGeometry,
    topping: { x: number; y: number; side: number; sample: RailPairSample }[],
  ) {
    const start = geometry.samples[0].mid;
    const from = this.lastEmit ?? { x: 0, y: 0 };
    if (Math.hypot(start[0] - from.x, start[1] - from.y) > 0.05)
      this._push('jump', start[0], start[1]);
    if (!this.started) {
      this.started = true;
      this._push('stitch', start[0], start[1]);
    }
    this._railPairUnderlay(geometry);

    let previous = this.lastEmit;
    let tipNoted = false;
    let ceilingWarned = false;
    let snagWarned = false;
    for (const point of topping) {
      const d = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
      if (d > 8 && !snagWarned) {
        this.warnings.push(
          `satinbetween: a realized stitch spans ${d.toFixed(1)} mm — stitches over ~8 mm tend to snag`,
        );
        snagWarned = true;
      }
      if (d > 12.1 && previous) {
        if (!ceilingWarned) {
          this.warnings.push(
            `rail gap exceeds the 12 mm stitch ceiling near (${point.x.toFixed(1)}, ${point.y.toFixed(1)}); mid-span penetrations inserted`,
          );
          ceilingWarned = true;
        }
        const pieces = Math.ceil(d / LIMITS.maxStitch);
        for (let i = 1; i < pieces; i++)
          this._push(
            'stitch',
            previous.x + ((point.x - previous.x) * i) / pieces,
            previous.y + ((point.y - previous.y) * i) / pieces,
          );
      }
      if (previous && d < LIMITS.minStitch * 0.5 && this._railWidth(point.sample) < 0.05) {
        if (!tipNoted) {
          this.warnings.push('note: satinbetween merged coincident penetrations at a tapered tip');
          tipNoted = true;
        }
        continue;
      }
      this._push('stitch', point.x, point.y);
      previous = point;
    }
  }

  _railPairUnderlay(geometry: RailPairGeometry) {
    const width = geometry.meanWidth + this.pullComp;
    const mode: 'off' | 'center' | 'edge' | 'zigzag' =
      this.underlayMode === 'auto'
        ? width < 1.5
          ? 'off'
          : width < 4
            ? 'center'
            : 'zigzag'
        : this.underlayMode;
    if (mode === 'off') return;
    const uLen = Math.max(1.5, Math.min(this.stitchLen, 3));
    const underlaySteps = Math.max(1, Math.ceil(geometry.spineLength / uLen));
    const underlaySamples: RailPairSample[] = [];
    for (let i = 0; i <= underlaySteps; i++)
      underlaySamples.push(geometry.atArc((geometry.spineLength * i) / underlaySteps));
    const spine = underlaySamples.map(({ mid }) => ({ x: mid[0], y: mid[1] }));
    const reverseSpine = spine.slice().reverse();
    const runCenter = () => {
      this._runAlong(spine, uLen, true);
      this._runAlong(reverseSpine, uLen, true);
    };
    if (this.doubleUnderlay && mode !== 'center') runCenter();
    if (mode === 'center') {
      runCenter();
      return;
    }
    if (mode === 'edge') {
      const left = underlaySamples.map((sample) => {
        const f = this._railWidth(sample) < 1 ? 0 : 0.3;
        return {
          x: sample.a[0] + (sample.b[0] - sample.a[0]) * f,
          y: sample.a[1] + (sample.b[1] - sample.a[1]) * f,
        };
      });
      const right = underlaySamples.map((sample) => {
        const f = this._railWidth(sample) < 1 ? 0 : 0.3;
        return {
          x: sample.b[0] + (sample.a[0] - sample.b[0]) * f,
          y: sample.b[1] + (sample.a[1] - sample.b[1]) * f,
        };
      });
      this._runAlong(left, uLen, true);
      this._runAlong(right.reverse(), uLen, true);
      return;
    }
    const steps = Math.max(1, Math.ceil(geometry.spineLength / 2));
    const zigzag: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const sample = geometry.atArc((geometry.spineLength * i) / steps);
      const edge = i % 2 === 0 ? sample.a : sample.b;
      zigzag.push({
        x: sample.mid[0] + (edge[0] - sample.mid[0]) * 0.6,
        y: sample.mid[1] + (edge[1] - sample.mid[1]) * 0.6,
      });
    }
    for (const point of zigzag) {
      const previous = this.lastEmit;
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.1) continue;
      this._push('stitch', point.x, point.y, true);
    }
    this._runAlong(reverseSpine, uLen, true);
  }

  /** Sew the buffered satin column: underlay passes first, then the zigzag. */
  flushSatin() {
    // Flush any pending running-stitch buffer first — the same events that
    // close a satin column also close a reporter-mode stretch.
    this.flushRunningStitch();
    const path = this.satinPath;
    this.satinPath = null;
    if (!path || path.length < 2) return;
    // After-split effects (humanize / snaptogrid / declump) deliberately skip satin:
    // the rails are emitted via _push, not _emitPen, so they sew unaffected —
    // quantizing, jittering, or easing a precise satin rail wrecks the column. Warn once.
    if ((this.penLayers.length || this.declumpStack.length) && !this._warnedSatinEffect) {
      this.warnings.push(
        'humanize/snaptogrid/declump skips satin columns — perturbing satin rails wrecks the column; it sews unaffected',
      );
      this._warnedSatinEffect = true;
    }
    // The buffer holds local points; under an active transform or warp the
    // column is mapped to hoop space (warp deforms the centerline; width stays
    // affine). With no transform and no warp the original (exact) path runs, so
    // existing output is byte-for-byte unchanged.
    if (this.satinReporter) this._flushSatinProgrammable(path);
    else if (isIdentity(this.satinCTM) && !this.satinHasWarp) this._flushSatinPlain(path);
    else this._flushSatinTransformed(path, this.satinCTM);
  }

  _flushSatinPlain(path: { x: number; y: number }[]) {
    if (!this.started) {
      this.started = true;
      this._push('stitch', path[0].x, path[0].y);
    }
    const w = this.satinWidth + this.pullComp;
    // Resolve underlay: physics says thin columns need none, medium columns a
    // spine, wide columns a zigzag that lofts the topping and grips the fabric.
    const mode: 'off' | 'center' | 'edge' | 'zigzag' =
      this.underlayMode === 'auto'
        ? w < 1.5
          ? 'off'
          : w < 4
            ? 'center'
            : 'zigzag'
        : this.underlayMode;
    const uLen = Math.max(1.5, Math.min(this.stitchLen, 3));
    const rev = path.slice().reverse();
    if (mode !== 'off' && this.doubleUnderlay && mode !== 'center') {
      // heavy-pile fabrics: spine first, then the resolved pass
      this._runAlong(path, uLen, true);
      this._runAlong(rev, uLen, true);
    }
    if (mode === 'center') {
      this._runAlong(path, uLen, true);
      this._runAlong(rev, uLen, true);
      if (this.doubleUnderlay) {
        this._zigzagAlong(path, w * 0.6, 2, true, false);
        this._runAlong(rev, uLen, true);
      }
    } else if (mode === 'edge') {
      const off = Math.max(0.3, w * 0.3);
      this._runAlong(this._offsetPath(path, off), uLen, true);
      this._runAlong(this._offsetPath(rev, off), uLen, true);
    } else if (mode === 'zigzag') {
      this._zigzagAlong(path, w * 0.6, 2, true, false);
      this._runAlong(rev, uLen, true);
    }
    // The topping
    this._zigzagAlong(path, w, this.satinSpacing, false, this.shortStitch);
  }

  // ---- Transform-aware satin (CTM active) ----

  /** Map a local polyline into hoop space (through the satin snapshot map). */
  _toHoop(pts: { x: number; y: number }[]): { x: number; y: number }[] {
    return pts.map((p) => {
      const [x, y] = this._mapSatin(p.x, p.y);
      return { x, y };
    });
  }

  /**
   * The hoop offset vector for a unit width perpendicular to a local segment
   * direction: L(local left-normal). Its length is the per-direction width
   * scale; its direction is where that perpendicular lands in hoop space.
   */
  _perpVec(
    ctm: Mat,
    lax: number,
    lay: number,
    lbx: number,
    lby: number,
  ): { ox: number; oy: number; scale: number } {
    const dx = lbx - lax,
      dy = lby - lay;
    const len = Math.hypot(dx, dy) || 1;
    const [ox, oy] = linApply(ctm, -dy / len, dx / len);
    return { ox, oy, scale: Math.hypot(ox, oy) || 1 };
  }

  _offsetPathT(
    local: { x: number; y: number }[],
    ctm: Mat,
    dist: number,
  ): { x: number; y: number }[] {
    const n = local.length;
    if (n < 2) return this._toHoop(local);
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = local[Math.max(0, i - 1)],
        b = local[Math.min(n - 1, i + 1)];
      const { ox, oy, scale } = this._perpVec(ctm, a.x, a.y, b.x, b.y);
      const [hx, hy] = this._mapSatin(local[i].x, local[i].y);
      out.push({ x: hx + (ox / scale) * dist, y: hy + (oy / scale) * dist });
    }
    return out;
  }

  _zigzagAlongT(
    local: { x: number; y: number }[],
    designWidth: number,
    pull: number,
    spacing: number,
    u: boolean,
    shortStitch: boolean,
  ) {
    const hoop = this._toHoop(local);
    const halfDesign = designWidth / 2;
    let prevUx: number | null = null,
      prevUy = 0;
    let innerCounter = 0;
    let warnedTight = false;
    for (let i = 1; i < hoop.length; i++) {
      const ox = hoop[i - 1].x,
        oy = hoop[i - 1].y;
      const dxT = hoop[i].x - ox,
        dyT = hoop[i].y - oy;
      const len = Math.hypot(dxT, dyT);
      if (len < 1e-9) continue;
      const ux = dxT / len,
        uy = dyT / len; // hoop travel direction
      // Width perpendicular to the *local* travel direction, mapped to hoop.
      const {
        ox: ovx,
        oy: ovy,
        scale,
      } = this._perpVec(this.satinCTM, local[i - 1].x, local[i - 1].y, local[i].x, local[i].y);
      const dirx = ovx / scale,
        diry = ovy / scale;
      const halfBase = halfDesign * scale + pull / 2; // pull comp is never scaled
      let innerSide = 0;
      let crowded = false;
      if (prevUx !== null) {
        const cross = prevUx * uy - prevUy * ux;
        const dot = Math.max(-1, Math.min(1, prevUx * ux + prevUy * uy));
        const theta = Math.acos(dot);
        if (theta > 1e-3 && theta < 2.1) {
          const R = len / theta;
          if (R < halfBase && !u && !warnedTight) {
            this.warnings.push(
              `satin ${(halfBase * 2).toFixed(1)} mm is wider than the curve it follows (radius ~${R.toFixed(1)} mm) — split the column or widen the curve`,
            );
            warnedTight = true;
          }
          if (shortStitch) {
            const innerSpacing = spacing * (1 - halfBase / Math.max(R, halfBase));
            if (innerSpacing < 0.3) {
              crowded = true;
              innerSide = cross > 0 ? 1 : -1;
            }
          }
        }
      }
      const steps = Math.max(1, Math.ceil(len / spacing));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const cx = ox + dxT * t,
          cy = oy + dyT * t;
        this.satinSide = -this.satinSide;
        let h = halfBase;
        if (crowded && this.satinSide === innerSide) {
          innerCounter++;
          if (innerCounter % 2 === 1) h = halfBase * 0.6;
        }
        this._push('stitch', cx + dirx * h * this.satinSide, cy + diry * h * this.satinSide, u);
      }
      prevUx = ux;
      prevUy = uy;
    }
  }

  _flushSatinTransformed(local: { x: number; y: number }[], ctm: Mat) {
    const hoop0 = this._mapSatin(local[0].x, local[0].y);
    if (!this.started) {
      this.started = true;
      this._push('stitch', hoop0[0], hoop0[1]);
    }
    // Representative width (average perpendicular scale) for underlay choice.
    let scaleSum = 0,
      scaleN = 0;
    for (let i = 1; i < local.length; i++) {
      const { scale } = this._perpVec(ctm, local[i - 1].x, local[i - 1].y, local[i].x, local[i].y);
      scaleSum += scale;
      scaleN++;
    }
    const avgScale = scaleN ? scaleSum / scaleN : 1;
    const w = this.satinWidth * avgScale + this.pullComp;
    const mode: 'off' | 'center' | 'edge' | 'zigzag' =
      this.underlayMode === 'auto'
        ? w < 1.5
          ? 'off'
          : w < 4
            ? 'center'
            : 'zigzag'
        : this.underlayMode;
    const uLen = Math.max(1.5, Math.min(this.stitchLen, 3));
    const hoop = this._toHoop(local);
    const revLocal = local.slice().reverse();
    const revHoop = hoop.slice().reverse();
    if (mode !== 'off' && this.doubleUnderlay && mode !== 'center') {
      this._runAlong(hoop, uLen, true);
      this._runAlong(revHoop, uLen, true);
    }
    if (mode === 'center') {
      this._runAlong(hoop, uLen, true);
      this._runAlong(revHoop, uLen, true);
      if (this.doubleUnderlay) {
        this._zigzagAlongT(local, this.satinWidth * 0.6, this.pullComp * 0.6, 2, true, false);
        this._runAlong(revHoop, uLen, true);
      }
    } else if (mode === 'edge') {
      const off = Math.max(0.3, w * 0.3);
      this._runAlong(this._offsetPathT(local, ctm, off), uLen, true);
      this._runAlong(this._offsetPathT(revLocal, ctm, off), uLen, true);
    } else if (mode === 'zigzag') {
      this._zigzagAlongT(local, this.satinWidth * 0.6, this.pullComp * 0.6, 2, true, false);
      this._runAlong(revHoop, uLen, true);
    }
    // The topping
    this._zigzagAlongT(
      local,
      this.satinWidth,
      this.pullComp,
      this.satinSpacing,
      false,
      this.shortStitch,
    );
  }

  // ---- Programmable satin (`satin @fn`) ----

  /**
   * Walk the buffered spine in arc-length steps, querying the shape reporter
   * once per stitch pair to place each rail endpoint independently (§3/§6/§7).
   *
   * Walk semantics (the equivalence-pin reading, §3.4): the generator emits one
   * penetration per step, alternating rail exactly as the built-in zigzag does
   * (via this.satinSide), with the cursor advancing `advance` mm per step. A
   * logical pair is two steps; the reporter is queried once per pair. For a
   * reporter returning `[0.4, 2, 2, 0, 0]` on a straight spine this reproduces
   * `satin 4`/`density 0.4` byte-for-byte. Each endpoint is anchored at its own
   * lagged arc-length and offset along the spine normal *at that arc-length*,
   * so a curved spine fans the rails correctly and opposite lags rake the
   * stitch into a self-crossing diagonal — while the cursor never turns back,
   * which is the termination guarantee.
   *
   * The generator itself is drawless; any RNG the reporter touches is its own
   * business, sampled at deterministic (t, s, i) coordinates (§8).
   */
  _flushSatinProgrammable(local: { x: number; y: number }[]) {
    const reporter = this.satinReporter!;
    const n = local.length;
    if (n < 2) return;

    // Cumulative arc length of the spine in the *CTM-mapped* (hoop-affine)
    // frame (§4 step 1: the CTM maps the spine before generation). Walking this
    // arc length keeps penetration spacing physical under scale — a scaled
    // column gets more stitches, not stretched ones (§11.9) — while the
    // equivalence pin is untouched (identity CTM ⇒ this equals the local
    // length). Warp is *not* folded in here; it deforms the emitted rails
    // downstream (width stays affine, centerline warps), as in built-in satin.
    const mapped = local.map((p) => apply(this.satinCTM, p.x, p.y));
    const cum: number[] = new Array(n);
    cum[0] = 0;
    for (let i = 1; i < n; i++)
      cum[i] =
        cum[i - 1] + Math.hypot(mapped[i][0] - mapped[i - 1][0], mapped[i][1] - mapped[i - 1][1]);
    const L = cum[n - 1];
    if (!(L > 1e-9)) return;

    // Resolve a (clamped) hoop arc-length to: the LOCAL spine point there, the
    // LEFT normal of the LOCAL tangent (matching _zigzagAlong's px=-uy, py=ux),
    // and the local turtle heading. Affine maps preserve along-segment ratios,
    // so the fraction found in the mapped frame is the same fraction in local
    // space — width then scales through the CTM exactly like built-in satin.
    const resolve = (arcLen: number) => {
      const a = Math.min(Math.max(arcLen, 0), L);
      let seg = 1;
      while (seg < n - 1 && cum[seg] < a) seg++;
      const segLen = cum[seg] - cum[seg - 1] || 1;
      const f = (a - cum[seg - 1]) / segLen;
      const p0 = local[seg - 1],
        p1 = local[seg];
      const dx = p1.x - p0.x,
        dy = p1.y - p0.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const ux = dx / dlen,
        uy = dy / dlen;
      return {
        x: p0.x + dx * f,
        y: p0.y + dy * f,
        nx: -uy,
        ny: ux, // left normal (local)
        heading: ((Math.atan2(ux, uy) * 180) / Math.PI + 360) % 360,
      };
    };

    // Place one rail endpoint: anchor at the lagged arc-length, offset along the
    // (CTM-mapped) spine normal there by the half-width, signed by the rail.
    // Mirrors _zigzagAlongT exactly so the identity case is byte-identical.
    const place = (arcLen: number, halfW: number, side: number): [number, number] => {
      const sp = resolve(arcLen);
      const [ovx, ovy] = linApply(this.satinCTM, sp.nx, sp.ny);
      const scale = Math.hypot(ovx, ovy) || 1;
      const [cx, cy] = this._mapSatin(sp.x, sp.y);
      const h = halfW * scale + this.pullComp / 2; // pull comp is never scaled
      return [cx + (ovx / scale) * h * side, cy + (ovy / scale) * h * side];
    };

    // Single walk: buffer the topping penetrations (so underlay can be emitted
    // first), tracking the max realized full width (for auto-underlay, §9) and
    // the longest realized chord (for the snag check on real geometry, §5.2).
    interface Pen {
      x: number;
      y: number;
    }
    const topping: Pen[] = [];
    let maxFullW = 0;
    let maxChord = 0;
    let side = this.satinSide; // local copy of the alternating rail flag
    let cursor = 0; // arc-length consumed (pair base)
    let pair = 0; // 0-based pair index → reporter's `i`
    let advWarned = false;
    let prev: Pen | null = null;
    let guard = 0;
    const guardMax = this.effectiveLimits.maxStitches + 10;

    while (cursor < L - 1e-9 && guard++ < guardMax) {
      const ret = reporter(cursor, cursor / L, pair, resolve(cursor).heading);
      let adv = ret[0];
      const lw = Math.max(0, ret[1]); // negative half-widths clamp to 0 (§5.1)
      const rw = Math.max(0, ret[2]);
      const ll = ret[3];
      const rl = ret[4];
      if (!(adv > 0)) {
        adv = 0.1; // the one hard rule: advance must be > 0, floored at 0.1 mm
        if (!advWarned) {
          this.warnings.push(
            'satin @fn: advance must be greater than 0 — clamped to 0.1 mm (a non-positive advance never terminates)',
          );
          advWarned = true;
        }
      }
      if (lw + rw > maxFullW) maxFullW = lw + rw;
      // Two steps per pair. Rail (and which lag/width applies) follows the
      // persistent side flip, exactly as the built-in zigzag alternates.
      for (let k = 1; k <= 2; k++) {
        const stepPos = cursor + adv * k;
        if (stepPos > L + 1e-9) break;
        side = -side;
        const left = side > 0; // side=+1 → left rail (lw/ll); −1 → right (rw/rl)
        const [hx, hy] = place(stepPos + (left ? ll : rl), left ? lw : rw, side);
        if (prev) {
          const d = Math.hypot(hx - prev.x, hy - prev.y);
          if (d > maxChord) maxChord = d;
          if (d < LIMITS.minStitch * 0.5) {
            this._dropTiny(hx, hy);
            continue;
          }
        }
        const pen = { x: hx, y: hy };
        topping.push(pen);
        prev = pen;
      }
      cursor += adv * 2;
      pair++;
    }
    this.satinSide = side;

    // Curvature guard: a column wider than the arc it follows can't sew — let it
    // warn honestly on the realized representative width (§7.5), reusing the
    // built-in "wider than radius" phrasing.
    this._warnIfWiderThanRadius(local, (maxFullW + this.pullComp) / 2);

    // Snag: keys off the realized chord, which for a raked stitch is the
    // hypotenuse across width and longitudinal span — not leftw + rightw (§5.2).
    if (maxChord > 8)
      this.warnings.push(
        `satin @fn: a realized stitch spans ${maxChord.toFixed(1)} mm — stitches over ~8 mm tend to snag; reduce the rake or width`,
      );

    // Emit order: anchor, then underlay (chosen from the max realized width),
    // then the buffered topping — matching the built-in flush.
    if (!this.started) {
      this.started = true;
      const [hx, hy] = this._mapSatin(local[0].x, local[0].y);
      this._push('stitch', hx, hy);
    }
    this._programmableUnderlay(local, maxFullW + this.pullComp);
    for (const p of topping) this._push('stitch', p.x, p.y, false);
  }

  /** One-time "wider than the curve it follows" warning on the realized width. */
  _warnIfWiderThanRadius(local: { x: number; y: number }[], half: number) {
    if (!(half > 0)) return;
    for (let i = 1; i < local.length - 1; i++) {
      const ax = local[i].x - local[i - 1].x,
        ay = local[i].y - local[i - 1].y;
      const bx = local[i + 1].x - local[i].x,
        by = local[i + 1].y - local[i].y;
      const la = Math.hypot(ax, ay),
        lb = Math.hypot(bx, by);
      if (la < 1e-9 || lb < 1e-9) continue;
      const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
      const theta = Math.acos(dot);
      if (theta > 1e-3 && theta < 2.1) {
        const R = lb / theta;
        if (R < half) {
          this.warnings.push(
            `satin @fn column (~${(half * 2).toFixed(1)} mm wide) is wider than the curve it follows (radius ~${R.toFixed(1)} mm) — split the column or widen the curve`,
          );
          return;
        }
      }
    }
  }

  /** Underlay for a programmable column, sized by the max realized width (§9). */
  _programmableUnderlay(local: { x: number; y: number }[], w: number) {
    const mode: 'off' | 'center' | 'edge' | 'zigzag' =
      this.underlayMode === 'auto'
        ? w < 1.5
          ? 'off'
          : w < 4
            ? 'center'
            : 'zigzag'
        : this.underlayMode;
    if (mode === 'off') return;
    const uLen = Math.max(1.5, Math.min(this.stitchLen, 3));
    const hoop = this._toHoop(local);
    const revHoop = hoop.slice().reverse();
    const revLocal = local.slice().reverse();
    if (this.doubleUnderlay && mode !== 'center') {
      this._runAlong(hoop, uLen, true);
      this._runAlong(revHoop, uLen, true);
    }
    if (mode === 'center') {
      this._runAlong(hoop, uLen, true);
      this._runAlong(revHoop, uLen, true);
    } else if (mode === 'edge') {
      const off = Math.max(0.3, w * 0.3);
      this._runAlong(this._offsetPathT(local, this.satinCTM, off), uLen, true);
      this._runAlong(this._offsetPathT(revLocal, this.satinCTM, off), uLen, true);
    } else if (mode === 'zigzag') {
      this._zigzagAlongT(local, w * 0.6, this.pullComp * 0.6, 2, true, false);
      this._runAlong(revHoop, uLen, true);
    }
  }

  // ── Running-stitch reporter buffer (§stitchlen @fn) ──────────────────────

  /**
   * Map a local point to hoop space through the running-stitch buffer's
   * snapshot of the transform stack — identical to _mapSatin but for the run buffer.
   */
  _mapRunBuffer(lx: number, ly: number): [number, number] {
    if (!this.runBufferHasWarp) return apply(this.runBufferCTM, lx, ly);
    let px = lx,
      py = ly;
    for (let i = this.runBufferLayers.length - 1; i >= 0; i--) {
      const L = this.runBufferLayers[i];
      const r = L.kind === 'aff' ? apply(L.m, px, py) : L.fn(px, py);
      px = r[0];
      py = r[1];
    }
    return [px, py];
  }

  /**
   * Flush the pending running-stitch reporter buffer (§stitchlen @fn).
   * Called automatically from flushSatin() so every existing stretch-closing
   * event (pen-up, trim, color, mode-change, end-of-program, …) triggers it.
   * Also call directly when switching stitchlen forms mid-stretch to avoid
   * leaving an orphaned buffer.
   */
  flushRunningStitch() {
    const buf = this.runBuffer;
    this.runBuffer = null;
    // Reset the stretch-start flag regardless: the next pen-down is a new stretch.
    this.stitchLenStretchStart = true;
    this.stitchLenStretchIndex = 0;
    if (!buf || buf.length < 2) return;
    this._splitBufferedStretch(buf);
  }

  /**
   * Walk the buffered spine under the stitchlen reporter and emit penetrations.
   *
   * Semantics (§3–§5 of the spec):
   * - t  = arc-length cursor from the stretch start (in mm, hoop-space)
   * - s  = t / L (normalised 0..1)
   * - i  = 0-based stitch index, incremented for every placed stitch
   * - p  = cursor position in hoop space [x, y]
   *
   * Pinned vertices: every buffer waypoint (each spine vertex / segment
   * boundary) is a potential pin. If the reporter's advance would overshoot
   * the next waypoint, the advance is truncated and a stitch is placed at the
   * waypoint. The truncated stitch still increments i.
   *
   * The reporter runs with m.ctm = identity so that coverat(p) calls inside
   * it treat p as hoop-space (the same contract as the warp reporter).
   */
  _splitBufferedStretch(buf: readonly { x: number; y: number }[]) {
    const reporter = this.stitchLenReporter!;
    const n = buf.length;
    if (n < 2) return;

    // Map all local points to hoop space using the snapshot transform.
    const hoop: [number, number][] = buf.map((p) => this._mapRunBuffer(p.x, p.y));

    // Cumulative arc-length table (hoop-space).
    const cum: number[] = new Array(n);
    cum[0] = 0;
    for (let k = 1; k < n; k++) {
      cum[k] = cum[k - 1] + Math.hypot(hoop[k][0] - hoop[k - 1][0], hoop[k][1] - hoop[k - 1][1]);
    }
    const L = cum[n - 1];
    if (!(L > 1e-9)) return;

    // Interpolate hoop position at arc-length t.
    const atT = (t: number): [number, number] => {
      const a = Math.min(Math.max(t, 0), L);
      let seg = 1;
      while (seg < n - 1 && cum[seg] < a) seg++;
      const segLen = cum[seg] - cum[seg - 1] || 1;
      const f = (a - cum[seg - 1]) / segLen;
      return [
        hoop[seg - 1][0] + (hoop[seg][0] - hoop[seg - 1][0]) * f,
        hoop[seg - 1][1] + (hoop[seg][1] - hoop[seg - 1][1]) * f,
      ];
    };

    // Temporarily set the CTM to identity so coverat(p) inside the reporter
    // interprets p as hoop-space (no double-transform).
    const savedCTM = this.ctm;
    const savedLayers = this.outLayers;
    const savedHasWarp = this.hasWarp;
    this.ctm = IDENTITY;
    this.outLayers = [];
    this.hasWarp = false;

    try {
      let cursor = 0;
      let stitchIdx = 0;
      let advWarned = false;
      let prevPt: [number, number] = hoop[0];
      const guardMax = Math.ceil(L / LIMITS.minStitch) + n + 10;
      let guard = 0;

      while (cursor < L - 1e-9 && guard++ < guardMax) {
        const [hx, hy] = atT(cursor);

        const rawAdv = reporter(cursor, cursor / L, stitchIdx, [hx, hy]);

        // Validate reporter return value.
        if (typeof rawAdv !== 'number' || !isFinite(rawAdv)) {
          throw new NeedlescriptError(
            'stitchlen reporter must return a finite number — got ' +
              (typeof rawAdv === 'number' ? 'NaN/Infinity' : typeof rawAdv),
          );
        }
        if (rawAdv <= 0) {
          throw new NeedlescriptError(
            'stitchlen reporter returned ' +
              rawAdv +
              ' — advance must be greater than 0 (a non-positive advance never terminates)',
          );
        }

        // Clamp to machine-safe band with a warning.
        let adv = rawAdv;
        if (rawAdv < LIMITS.minStitch || rawAdv > LIMITS.maxStitch) {
          const clamped = Math.min(Math.max(rawAdv, LIMITS.minStitch), LIMITS.maxStitch);
          if (!advWarned) {
            this.warnings.push(
              `stitchlen reporter returned ${rawAdv.toFixed(3)} mm — clamped to ${clamped.toFixed(3)} mm (machine-safe range ${LIMITS.minStitch}–${LIMITS.maxStitch})`,
            );
            advWarned = true;
          }
          adv = clamped;
        }

        // Find the next buffer vertex (pinned corner) after cursor.
        let nextPin = L;
        for (let k = 1; k < n; k++) {
          if (cum[k] > cursor + 1e-9) {
            nextPin = cum[k];
            break;
          }
        }

        // Advance at most to the next pin or to L.
        const actualAdv = Math.min(adv, Math.min(nextPin, L) - cursor);

        if (actualAdv < LIMITS.minStitch * 0.5) {
          // Tiny remainder — merge (drop and record).
          const [tx, ty] = atT(cursor + actualAdv);
          this._dropTiny(tx, ty);
          cursor += actualAdv;
          stitchIdx++;
          continue;
        }

        cursor += actualAdv;
        const [nx2, ny2] = atT(cursor);
        this._emitPen(nx2, ny2);
        for (let r = 1; r < this.beanRepeats; r++) {
          this._emitPen(r % 2 === 1 ? prevPt[0] : nx2, r % 2 === 1 ? prevPt[1] : ny2);
        }
        prevPt = [nx2, ny2];
        stitchIdx++;
      }
    } finally {
      this.ctm = savedCTM;
      this.outLayers = savedLayers;
      this.hasWarp = savedHasWarp;
    }
  }
}
