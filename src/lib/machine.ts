// ---------- Engine limits ----------

export const LIMITS = {
  maxStitches: 60000,
  maxOps: 2000000,
  maxCallDepth: 200,
  minStitch: 0.4,
  maxStitch: 12.0,
  // Lists (RFC-2) — these protect the browser tab, like the op cap.
  maxListLen: 100000,
  maxListCells: 1000000,
  maxListDepth: 16,
  // Generative math (RFC-3 §8)
  sewableRadius: 47,        // the sewable field inside the 100 mm hoop, in mm
  maxScatterPoints: 20000,
  maxDelaunayPoints: 10000, // voronoi / triangulate / hull / relax input
};

// ---------- Stitch machine ----------

import type { StitchEvent, EventType } from './types.ts';
import { NeedlescriptError } from './errors.ts';
import { IDENTITY, isIdentity, apply, linApply } from './affine.ts';
import type { Mat } from './affine.ts';

export class Machine {
  x = 0; y = 0; heading = 0;
  penDown = true;
  stitchLen = 2.5;
  mode: 'run' | 'satin' | 'estitch' = 'run';
  satinWidth = 0;
  satinSpacing = 0.4;
  satinSide = 1;
  eWidth = 0;
  beanRepeats = 1;
  fillAngle = 0;
  fillSpacing = 0.4;
  fillLen: number | null = null;
  lockLen = 0.7;
  pullComp = 0;                 // pull compensation in mm
  underlayMode: 'off' | 'auto' | 'center' | 'edge' | 'zigzag' = 'off';
  fillUnderlayMode: 'off' | 'auto' | 'tatami' | 'edge' = 'off';
  doubleUnderlay = false;       // fleece: stack center + zigzag passes
  shortStitch = true;           // auto short-stitch on tight satin curves
  autoTrim = 7;                 // insert trim before jumps ≥ this (0 = off)
  maxDensity = 3.5;             // coverage warning threshold, in layers of thread
  satinPath: { x: number; y: number }[] | null = null; // buffered satin column
  recording = false;
  rings: [number, number][][] = [];
  curRing: [number, number][] | null = null;
  lastEmit: { x: number; y: number } | null = null;
  colorIdx = 0;
  events: StitchEvent[] = [];
  warnings: string[] = [];
  started = false;
  tinyDropped = 0;
  currentLine: number | undefined = undefined; // source line being executed
  stateStack: { x: number; y: number; heading: number; penDown: boolean }[] = [];

  // Current transformation matrix (CTM) and its stack. The turtle lives in
  // untransformed local space (x/y/heading are always local); only emitted
  // geometry is mapped through the CTM on its way out — and stitch-length
  // splitting, satin width and the physics layer all run *after* the map.
  ctm: Mat = IDENTITY;
  ctmStack: Mat[] = [];
  // CTM snapshot taken when the current satin column began. A column is always
  // flushed at CTM boundaries (push/pop), so it lives under a single matrix.
  satinCTM: Mat = IDENTITY;

  pushCTM(next: Mat) {
    this.ctmStack.push(this.ctm);
    this.ctm = next;
  }

  popCTM() {
    this.ctm = this.ctmStack.pop() ?? IDENTITY;
  }

  _push(t: EventType, x: number, y: number, u = false) {
    if (this.events.length >= LIMITS.maxStitches)
      throw new NeedlescriptError(
        `Design exceeds ${LIMITS.maxStitches.toLocaleString('en-US')} stitches — stopped. Reduce repeats, raise stitchlen, or raise fillspacing.`,
      );
    const ev: StitchEvent = { t, x, y, c: this.colorIdx, line: this.currentLine };
    if (u) ev.u = 1;
    this.events.push(ev);
    if (t === 'stitch' || t === 'jump') this.lastEmit = { x, y };
  }

  _ensureStart() {
    if (!this.started) {
      this.started = true;
      const [hx, hy] = apply(this.ctm, this.x, this.y);
      this._push('stitch', hx, hy);
    }
  }

  setXY(nx: number, ny: number) {
    const dx = nx - this.x, dy = ny - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) { this.x = nx; this.y = ny; return; }
    this.travel(nx, ny);
  }

  forward(dist: number) {
    if (!isFinite(dist)) throw new NeedlescriptError('fd/bk got a non-numeric distance');
    const rad = this.heading * Math.PI / 180;
    this.travel(this.x + Math.sin(rad) * dist, this.y + Math.cos(rad) * dist);
  }

  /**
   * Sew an arc: turn `deg` degrees in total (positive = right/clockwise,
   * negative = left) while moving along a circle of the given radius.
   * Decomposed into half-turn / chord / half-turn steps so every stitch
   * mode (running, satin, bean, estitch) works on curves.
   */
  arc(deg: number, radius: number) {
    if (!isFinite(deg) || !isFinite(radius))
      throw new NeedlescriptError('arc got a non-numeric angle or radius');
    const r = Math.abs(radius);
    if (Math.abs(deg) < 1e-9 || r < 1e-9) return;
    const arcLen = Math.abs(deg) * Math.PI / 180 * r;
    const eff = Math.min(Math.max(this.stitchLen, LIMITS.minStitch), LIMITS.maxStitch);
    const steps = Math.max(1, Math.ceil(Math.max(arcLen / eff, Math.abs(deg) / 15)));
    const stepAng = deg / steps;
    const chord = 2 * r * Math.sin(Math.abs(stepAng) * Math.PI / 360);
    for (let s = 0; s < steps; s++) {
      this.heading = (this.heading + stepAng / 2) % 360;
      const rad = this.heading * Math.PI / 180;
      this.travel(this.x + Math.sin(rad) * chord, this.y + Math.cos(rad) * chord);
      this.heading = (this.heading + stepAng / 2) % 360;
    }
  }

  pushState() {
    if (this.stateStack.length >= 500)
      throw new NeedlescriptError('push/pop stack is too deep (max 500 saved states)');
    this.stateStack.push({ x: this.x, y: this.y, heading: this.heading, penDown: this.penDown });
  }

  popState() {
    const s = this.stateStack.pop();
    if (!s) {
      this.warnings.push('pop ignored — nothing was saved with push');
      return;
    }
    this.flushSatin();
    this.penDown = false; // travel back as a jump, never sewing
    this.setXY(s.x, s.y);
    this.penDown = s.penDown;
    this.heading = s.heading;
  }

  markHere() {
    this.flushSatin();
    const [hx, hy] = apply(this.ctm, this.x, this.y);
    this._push('mark', hx, hy);
  }

  travel(nx: number, ny: number) {
    const ox = this.x, oy = this.y;

    if (this.recording) {
      // Fill boundaries are recorded in hoop space so the fill is generated
      // (and pull-compensated) on the geometry that actually sews.
      if (this.penDown) {
        const [hnx, hny] = apply(this.ctm, nx, ny);
        if (!this.curRing) {
          const [hox, hoy] = apply(this.ctm, ox, oy);
          this.curRing = [[hox, hoy]];
        }
        this.curRing.push([hnx, hny]);
      } else {
        this._closeRing();
      }
      this.x = nx; this.y = ny;
      return;
    }

    if (!this.penDown) {
      this.flushSatin();
      const [hnx, hny] = apply(this.ctm, nx, ny);
      this._push('jump', hnx, hny);
      this.x = nx; this.y = ny;
      return;
    }

    if (this.mode === 'satin' && this.satinWidth > 0.05) {
      // Buffer the column path in *local* space and snapshot the CTM; the
      // column is mapped to hoop space (with width transformed perpendicular
      // to local travel) when it ends — see flushSatin().
      const localLen = Math.hypot(nx - ox, ny - oy);
      if (localLen > 1e-9) {
        if (!this.satinPath) { this.satinPath = [{ x: ox, y: oy }]; this.satinCTM = this.ctm; }
        const lastP = this.satinPath[this.satinPath.length - 1];
        if (Math.hypot(nx - lastP.x, ny - lastP.y) > 0.05)
          this.satinPath.push({ x: nx, y: ny });
      }
      this.x = nx; this.y = ny;
      return;
    }

    // Map both endpoints to hoop space; split on the *hoop* length so stitch
    // length stays physical under scaling (transform the path, then stitch).
    const [hox, hoy] = apply(this.ctm, ox, oy);
    const [hnx, hny] = apply(this.ctm, nx, ny);
    const hdx = hnx - hox, hdy = hny - hoy;
    const hlen = Math.hypot(hdx, hdy);

    this._ensureStart();

    if (this.mode === 'estitch' && this.eWidth > 0.05) {
      if (hlen < 1e-9) { this.x = nx; this.y = ny; return; }
      // Prong width follows the CTM perpendicular to the *local* travel
      // direction, like satin: transform the local left-normal.
      const llen = Math.hypot(nx - ox, ny - oy) || 1;
      const ldx = (nx - ox) / llen, ldy = (ny - oy) / llen;
      const [ovx, ovy] = linApply(this.ctm, -ldy, ldx); // L(local left-normal)
      const spacing = Math.max(1, this.stitchLen);
      const steps = Math.max(1, Math.round(hlen / spacing));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const cx = hox + hdx * t, cy = hoy + hdy * t;
        this._push('stitch', cx, cy);
        this._push('stitch', cx + ovx * this.eWidth, cy + ovy * this.eWidth);
        this._push('stitch', cx, cy);
      }
      this.x = nx; this.y = ny;
      return;
    }

    // Running stitch
    if (hlen < LIMITS.minStitch * 0.5) {
      this.tinyDropped++;
      this.x = nx; this.y = ny;
      return;
    }
    const eff = Math.min(Math.max(this.stitchLen, LIMITS.minStitch), LIMITS.maxStitch);
    const steps = Math.max(1, Math.ceil(hlen / eff));
    let pxv = hox, pyv = hoy;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const tx = hox + hdx * t, ty = hoy + hdy * t;
      this._push('stitch', tx, ty);
      for (let r = 1; r < this.beanRepeats; r++) {
        this._push('stitch', r % 2 === 1 ? pxv : tx, r % 2 === 1 ? pyv : ty);
      }
      pxv = tx; pyv = ty;
    }
    this.x = nx; this.y = ny;
  }

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
        this._push('stitch', cx + (p.x - cx) * s / steps, cy + (p.y - cy) * s / steps, u);
      }
      cx = p.x; cy = p.y;
    }
  }

  /** Offset a polyline sideways by `dist` along per-vertex left normals. */
  _offsetPath(pts: { x: number; y: number }[], dist: number): { x: number; y: number }[] {
    const n = pts.length;
    if (n < 2) return pts.slice();
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
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
    let prevUx: number | null = null, prevUy = 0;
    let innerCounter = 0;
    let warnedTight = false;
    for (let i = 1; i < path.length; i++) {
      const ox = path[i - 1].x, oy = path[i - 1].y;
      const dxT = path[i].x - ox, dyT = path[i].y - oy;
      const len = Math.hypot(dxT, dyT);
      if (len < 1e-9) continue;
      const ux = dxT / len, uy = dyT / len;
      const px = -uy, py = ux; // left normal
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
        const cx = ox + dxT * t, cy = oy + dyT * t;
        this.satinSide = -this.satinSide;
        let h = half;
        if (crowded && this.satinSide === innerSide) {
          innerCounter++;
          if (innerCounter % 2 === 1) h = half * 0.6;
        }
        this._push('stitch', cx + px * h * this.satinSide, cy + py * h * this.satinSide, u);
      }
      prevUx = ux; prevUy = uy;
    }
  }

  /** Sew the buffered satin column: underlay passes first, then the zigzag. */
  flushSatin() {
    const path = this.satinPath;
    this.satinPath = null;
    if (!path || path.length < 2) return;
    // The buffer holds local points; under an active transform the column is
    // mapped to hoop space with its width transformed perpendicular to the
    // local travel direction. With no transform the original (exact) path
    // runs, so existing output is byte-for-byte unchanged.
    if (isIdentity(this.satinCTM)) this._flushSatinPlain(path);
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
        ? (w < 1.5 ? 'off' : w < 4 ? 'center' : 'zigzag')
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

  /** Map a local polyline into hoop space. */
  _toHoop(pts: { x: number; y: number }[], ctm: Mat): { x: number; y: number }[] {
    return pts.map(p => { const [x, y] = apply(ctm, p.x, p.y); return { x, y }; });
  }

  /**
   * The hoop offset vector for a unit width perpendicular to a local segment
   * direction: L(local left-normal). Its length is the per-direction width
   * scale; its direction is where that perpendicular lands in hoop space.
   */
  _perpVec(ctm: Mat, lax: number, lay: number, lbx: number, lby: number): { ox: number; oy: number; scale: number } {
    const dx = lbx - lax, dy = lby - lay;
    const len = Math.hypot(dx, dy) || 1;
    const [ox, oy] = linApply(ctm, -dy / len, dx / len);
    return { ox, oy, scale: Math.hypot(ox, oy) || 1 };
  }

  _offsetPathT(local: { x: number; y: number }[], ctm: Mat, dist: number): { x: number; y: number }[] {
    const n = local.length;
    if (n < 2) return this._toHoop(local, ctm);
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = local[Math.max(0, i - 1)], b = local[Math.min(n - 1, i + 1)];
      const { ox, oy, scale } = this._perpVec(ctm, a.x, a.y, b.x, b.y);
      const [hx, hy] = apply(ctm, local[i].x, local[i].y);
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
    const hoop = this._toHoop(local, this.satinCTM);
    const halfDesign = designWidth / 2;
    let prevUx: number | null = null, prevUy = 0;
    let innerCounter = 0;
    let warnedTight = false;
    for (let i = 1; i < hoop.length; i++) {
      const ox = hoop[i - 1].x, oy = hoop[i - 1].y;
      const dxT = hoop[i].x - ox, dyT = hoop[i].y - oy;
      const len = Math.hypot(dxT, dyT);
      if (len < 1e-9) continue;
      const ux = dxT / len, uy = dyT / len; // hoop travel direction
      // Width perpendicular to the *local* travel direction, mapped to hoop.
      const { ox: ovx, oy: ovy, scale } = this._perpVec(
        this.satinCTM, local[i - 1].x, local[i - 1].y, local[i].x, local[i].y,
      );
      const dirx = ovx / scale, diry = ovy / scale;
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
        const cx = ox + dxT * t, cy = oy + dyT * t;
        this.satinSide = -this.satinSide;
        let h = halfBase;
        if (crowded && this.satinSide === innerSide) {
          innerCounter++;
          if (innerCounter % 2 === 1) h = halfBase * 0.6;
        }
        this._push('stitch', cx + dirx * h * this.satinSide, cy + diry * h * this.satinSide, u);
      }
      prevUx = ux; prevUy = uy;
    }
  }

  _flushSatinTransformed(local: { x: number; y: number }[], ctm: Mat) {
    const hoop0 = apply(ctm, local[0].x, local[0].y);
    if (!this.started) {
      this.started = true;
      this._push('stitch', hoop0[0], hoop0[1]);
    }
    // Representative width (average perpendicular scale) for underlay choice.
    let scaleSum = 0, scaleN = 0;
    for (let i = 1; i < local.length; i++) {
      const { scale } = this._perpVec(ctm, local[i - 1].x, local[i - 1].y, local[i].x, local[i].y);
      scaleSum += scale; scaleN++;
    }
    const avgScale = scaleN ? scaleSum / scaleN : 1;
    const w = this.satinWidth * avgScale + this.pullComp;
    const mode: 'off' | 'center' | 'edge' | 'zigzag' =
      this.underlayMode === 'auto'
        ? (w < 1.5 ? 'off' : w < 4 ? 'center' : 'zigzag')
        : this.underlayMode;
    const uLen = Math.max(1.5, Math.min(this.stitchLen, 3));
    const hoop = this._toHoop(local, ctm);
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
    this._zigzagAlongT(local, this.satinWidth, this.pullComp, this.satinSpacing, false, this.shortStitch);
  }

  _closeRing() {
    if (this.curRing && this.curRing.length >= 3) this.rings.push(this.curRing);
    this.curRing = null;
  }

  beginFill() {
    if (this.recording)
      throw new NeedlescriptError(
        'beginfill while already recording a fill — close it with endfill first',
      );
    this.flushSatin();
    this.recording = true;
    this.rings = [];
    this.curRing = [apply(this.ctm, this.x, this.y)];
  }

  /** Emit a sequence of fill points, connecting from wherever the thread is. */
  _emitFillPts(pts: FillPoint[], u: boolean) {
    if (!pts.length) return;
    const first = pts[0];
    if (!this.started) {
      this.started = true;
      this._push(Math.hypot(first.x, first.y) > 1 ? 'jump' : 'stitch', first.x, first.y, u);
    } else {
      const le = this.lastEmit || { x: 0, y: 0 };
      const d0 = Math.hypot(first.x - le.x, first.y - le.y);
      if (d0 > Math.max(this.stitchLen * 1.5, 2)) this._push('jump', first.x, first.y, u);
      else if (d0 > 0.05) this._push('stitch', first.x, first.y, u);
    }
    for (let i = 1; i < pts.length; i++)
      this._push(pts[i].jump ? 'jump' : 'stitch', pts[i].x, pts[i].y, u);
  }

  /** Inset a ring towards the interior of the shape by `d` mm (approximate). */
  _insetRing(ring: [number, number][], all: [number, number][][], d: number): FillPoint[] {
    // drop a duplicated closing vertex so corner normals stay sane
    let pts = ring;
    while (
      pts.length > 1 &&
      Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6
    )
      pts = pts.slice(0, -1);
    const n = pts.length;
    if (n < 3) return [];
    const out: FillPoint[] = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      // average of the two edge normals ≈ angle bisector
      const d1x = p[0] - a[0], d1y = p[1] - a[1];
      const d2x = b[0] - p[0], d2y = b[1] - p[1];
      const l1 = Math.hypot(d1x, d1y) || 1, l2 = Math.hypot(d2x, d2y) || 1;
      let nx = -(d1y / l1) - (d2y / l2), ny = d1x / l1 + d2x / l2;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-6) { nx = -d1y / l1; ny = d1x / l1; }
      else { nx /= nl; ny /= nl; }
      // pick whichever offset direction actually lands inside the shape
      const c1: [number, number] = [p[0] + nx * d, p[1] + ny * d];
      const c2: [number, number] = [p[0] - nx * d, p[1] - ny * d];
      if (evenOddInside(all, c1[0], c1[1])) out.push({ x: c1[0], y: c1[1], jump: false });
      else if (evenOddInside(all, c2[0], c2[1])) out.push({ x: c2[0], y: c2[1], jump: false });
    }
    if (out.length >= 3) out.push({ ...out[0] }); // close the loop
    return out.length >= 4 ? out : [];
  }

  /** Split long runs in a point list into stitch-length steps. */
  _subdividePts(pts: FillPoint[], slen: number): FillPoint[] {
    const out: FillPoint[] = [];
    for (const p of pts) {
      const prev = out[out.length - 1];
      if (!prev || p.jump) { out.push(p); continue; }
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      const steps = Math.max(1, Math.ceil(d / slen));
      for (let s = 1; s <= steps; s++)
        out.push({
          x: prev.x + (p.x - prev.x) * s / steps,
          y: prev.y + (p.y - prev.y) * s / steps,
          jump: false,
        });
    }
    return out;
  }

  endFill() {
    if (!this.recording)
      throw new NeedlescriptError('endfill without a matching beginfill');
    this._closeRing();
    this.recording = false;
    if (!this.rings.length) {
      this.warnings.push('fill skipped — the boundary needs at least 3 pen-down points');
      return;
    }
    const rings = this.rings;
    this.rings = [];
    // Rings are recorded in hoop space, so the "end near" hint must be too.
    const [hx, hy] = apply(this.ctm, this.x, this.y);
    const endNear = { x: hx, y: hy };
    const effLen =
      this.fillLen !== null
        ? this.fillLen
        : Math.min(Math.max(this.stitchLen, 1), 7);

    // ---- Underlay (sewn first, so the topping rides on a stable base) ----
    const ringArea = (r: [number, number][]) => {
      let s = 0;
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        s += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(s / 2);
    };
    const area = Math.max(...rings.map(ringArea));
    let uMode: 'off' | 'tatami' | 'edge' | 'both' = 'off';
    if (this.fillUnderlayMode === 'auto') uMode = area > 100 ? 'both' : 'tatami';
    else if (this.fillUnderlayMode === 'tatami') uMode = 'tatami';
    else if (this.fillUnderlayMode === 'edge') uMode = 'edge';
    if ((uMode === 'edge' || uMode === 'both') && area >= 30) {
      for (const ring of rings) {
        const inset = this._insetRing(ring, rings, 0.5);
        if (inset.length) this._emitFillPts(this._subdividePts(inset, 2.5), true);
      }
    }
    if (uMode === 'tatami' || uMode === 'both') {
      const uPts = generateFill(rings, {
        angle: this.fillAngle + 90, // cross-grain so the topping doesn't sink between rows
        spacing: Math.min(this.fillSpacing * 4, 5),
        stitchLen: 4,
        endNear,
        comp: -0.6, // inset so the underlay never peeks out of the topping
      });
      if (this.doubleUnderlay && uPts.length) {
        const uPts2 = generateFill(rings, {
          angle: this.fillAngle, spacing: Math.min(this.fillSpacing * 4, 5),
          stitchLen: 4, endNear, comp: -0.6,
        });
        this._emitFillPts(uPts2, true);
      }
      this._emitFillPts(uPts, true);
    }

    // ---- Topping ----
    const pts = generateFill(rings, {
      angle: this.fillAngle,
      spacing: this.fillSpacing,
      stitchLen: effLen,
      endNear,
      comp: this.pullComp, // rows run along the stitch axis: extend against pull
    });
    if (!pts.length) {
      this.warnings.push('fill skipped — the area is too small to fill at this spacing');
      return;
    }
    this._emitFillPts(pts, false);
    const back = Math.hypot(
      (this.lastEmit?.x ?? 0) - hx,
      (this.lastEmit?.y ?? 0) - hy,
    );
    if (back > 0.6) this._push('jump', hx, hy);
  }

  colorChange(n: number) {
    this.flushSatin();
    const idx = Math.max(0, Math.round(n));
    if (idx === this.colorIdx && this.started) return;
    if (this.started) {
      const [hx, hy] = apply(this.ctm, this.x, this.y);
      this._push('color', hx, hy);
    }
    this.colorIdx = idx;
  }

  trimThread() {
    this.flushSatin();
    if (this.started) {
      const [hx, hy] = apply(this.ctm, this.x, this.y);
      this._push('trim', hx, hy);
    }
  }
}

// ---------- Tatami fill ----------

function evenOddInside(rings: [number, number][][], px: number, py: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a[1] <= py && b[1] > py) || (b[1] <= py && a[1] > py)) {
        const xi = a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (xi > px) inside = !inside;
      }
    }
  }
  return inside;
}

interface FillOpts {
  angle: number;
  spacing: number;
  stitchLen: number;
  endNear?: { x: number; y: number };
  /** Extend (+) or inset (−) each row end along the stitch axis, in mm. */
  comp?: number;
}

interface FillPoint {
  x: number;
  y: number;
  jump: boolean;
}

function generateFill(rings: [number, number][][], opt: FillOpts): FillPoint[] {
  const angle = (opt.angle || 0) * (Math.PI / 180);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const rot = (p: [number, number]): [number, number] => [p[0] * ca + p[1] * sa, -p[0] * sa + p[1] * ca];
  const unrot = (p: [number, number]): [number, number] => [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca];
  const R = rings.map(r => r.map(rot));
  const spacing = Math.min(Math.max(opt.spacing || 0.4, 0.25), 5);
  const slen = Math.min(Math.max(opt.stitchLen || 3, 1), 7);

  let minY = Infinity, maxY = -Infinity;
  R.forEach(r => r.forEach(p => { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }));
  if (!(maxY - minY > spacing * 0.6)) return [];

  interface Seg { x0: number; x1: number; y: number; row: number }

  const rows: Seg[][] = [];
  let rowIdx = 0;
  for (let y = minY + spacing * 0.5; y < maxY; y += spacing, rowIdx++) {
    const xs: number[] = [];
    for (const ring of R) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
    }
    xs.sort((p, q) => p - q);
    const segs: Seg[] = [];
    const comp = opt.comp || 0; // pull compensation (+) or underlay inset (−)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a0 = xs[i] - comp, a1 = xs[i + 1] + comp;
      if (a1 - a0 >= 0.5) segs.push({ x0: a0, x1: a1, y, row: rowIdx });
    }
    if (segs.length) rows.push(segs);
  }
  if (!rows.length) return [];

  let order = rows;
  if (opt.endNear) {
    const en = rot([opt.endNear.x, opt.endNear.y]);
    const dFirst = Math.abs(en[1] - rows[0][0].y);
    const dLast = Math.abs(en[1] - rows[rows.length - 1][0].y);
    if (dFirst < dLast) order = rows.slice().reverse();
  }

  const out: { p: [number, number]; jump: boolean }[] = [];
  let cur: [number, number] | null = null;

  function push(x: number, y: number, jump: boolean) {
    out.push({ p: [x, y], jump });
    cur = [x, y];
  }

  function sewLine(to: [number, number]) {
    if (!cur) return;
    const dx = to[0] - cur[0], dy = to[1] - cur[1];
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return;
    const start: [number, number] = [cur[0], cur[1]];
    const steps = Math.max(1, Math.ceil(d / slen));
    for (let k = 1; k <= steps; k++) {
      push(start[0] + dx * k / steps, start[1] + dy * k / steps, false);
    }
  }

  function connect(to: [number, number]) {
    if (!cur) return;
    const d = Math.hypot(to[0] - cur[0], to[1] - cur[1]);
    if (d < 0.05) return;
    if (d <= spacing * 3 + 0.6) { sewLine(to); return; }
    let allIn = d <= 12;
    if (allIn) {
      const n = Math.max(2, Math.ceil(d / 1.5));
      for (let k = 1; k < n; k++) {
        const mx = cur[0] + (to[0] - cur[0]) * k / n;
        const my = cur[1] + (to[1] - cur[1]) * k / n;
        if (!evenOddInside(R, mx, my)) { allIn = false; break; }
      }
    }
    if (allIn) sewLine(to);
    else push(to[0], to[1], true);
  }

  function sewSegment(seg: Seg, reverse: boolean) {
    const from = reverse ? seg.x1 : seg.x0;
    const to = reverse ? seg.x0 : seg.x1;
    if (cur === null) push(from, seg.y, false);
    else connect([from, seg.y]);
    const phase = (seg.row % 3) * (slen / 3);
    const lo = Math.min(from, to) + 0.3, hi = Math.max(from, to) - 0.3;
    const grid: number[] = [];
    for (let g = Math.ceil((lo - phase) / slen) * slen + phase; g < hi; g += slen) grid.push(g);
    if (reverse) grid.reverse();
    for (const g of grid) sewLine([g, seg.y]);
    sewLine([to, seg.y]);
  }

  const all: Seg[] = [];
  for (const rowSegs of order) for (const seg of rowSegs) all.push(seg);

  while (all.length) {
    let bi = 0, brev = false, bd = Infinity;
    for (let i = 0; i < all.length; i++) {
      const sgm = all[i];
      const dS = cur ? Math.hypot(sgm.x0 - cur[0], sgm.y - cur[1]) : i;
      const dE = cur ? Math.hypot(sgm.x1 - cur[0], sgm.y - cur[1]) : i + 0.5;
      if (dS < bd) { bd = dS; bi = i; brev = false; }
      if (dE < bd) { bd = dE; bi = i; brev = true; }
    }
    sewSegment(all.splice(bi, 1)[0], brev);
  }

  return out.map(o => {
    const p = unrot(o.p);
    return { x: p[0], y: p[1], jump: o.jump };
  });
}
