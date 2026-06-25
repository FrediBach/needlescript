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
import { IDENTITY, isIdentity, apply, linApply, compose } from './affine.ts';
import type { Mat } from './affine.ts';
import { DensityGrid } from './postprocess.ts';

/**
 * One entry of the pre-split output stack: either an affine transform delta
 * or a nonlinear warp (a point→point reporter). Transforms collapse, warps
 * don't, so the stack is kept explicit — but with no warp active it is exactly
 * a single affine matrix and the fast path below stays byte-identical to the
 * pre-effects engine.
 */
type OutLayer = { kind: 'aff'; m: Mat } | { kind: 'warp'; fn: (x: number, y: number) => [number, number] };

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
  // Programmable satin (`satin @fn`): a user shape reporter that supersedes the
  // built-in generator, queried once per stitch pair at flush time. null = the
  // built-in numeric generator. Set/cleared by the `satin`/`estitch` commands.
  satinReporter:
    | ((t: number, s: number, i: number, u: number) => [number, number, number, number, number])
    | null = null;
  satinDensityNoted = false; // one-time "density ignored under satin @fn" note
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
  // Live coverage / penetration index, fed in sewing order from _push and read
  // by the history queries (coverat/countat/nearestsewn/sewnwithin/
  // stitchedpoints). Finalized at program end for the heatmap — one grid, so a
  // query always reports the same number the heatmap shows. Buffered satin /
  // fills aren't here until flushed (committed-only); locks are added later and
  // never fed, so tie-offs don't read as crowding.
  density = new DensityGrid(1);
  usedQuery = false; // a history query ran — used to make limit errors loop-aware

  // The pre-split output map: transforms (CTM) and `warp` effects share one
  // block-scoped stack, applied to emitted geometry *before* stitch-length
  // splitting and the physics layer ("transform the path, then stitch it").
  // `ctm` is the collapsed affine of all transform layers (warps ignored); it
  // drives satin width and is the fast path when no warp is active, keeping
  // non-warp output byte-identical. The turtle (x/y/heading) is always local.
  ctm: Mat = IDENTITY;
  outLayers: OutLayer[] = [];
  hasWarp = false;
  private outSnap: { ctm: Mat; hasWarp: boolean }[] = [];
  // After-split penetration maps (`humanize` / `snaptogrid`): applied to each
  // final penetration point, after splitting, before the physics layer.
  penLayers: ((x: number, y: number) => [number, number])[] = [];
  // Snapshot of the output stack taken when the current satin column began. A
  // column is always flushed at stack boundaries, so it lives under one map.
  satinCTM: Mat = IDENTITY;
  satinLayers: OutLayer[] = [];
  satinHasWarp = false;
  private _warnedSatinEffect = false;

  /** Push an affine transform delta (translate/rotate/scale/…) onto the stack. */
  pushTransform(delta: Mat) {
    this.outSnap.push({ ctm: this.ctm, hasWarp: this.hasWarp });
    this.outLayers.push({ kind: 'aff', m: delta });
    this.ctm = compose(this.ctm, delta);
  }

  /** Push a nonlinear warp (point→point reporter) onto the stack. */
  pushWarp(fn: (x: number, y: number) => [number, number]) {
    this.outSnap.push({ ctm: this.ctm, hasWarp: this.hasWarp });
    this.outLayers.push({ kind: 'warp', fn });
    this.hasWarp = true;
  }

  /** Pop the innermost transform or warp layer, restoring the prior state. */
  popOut() {
    this.outLayers.pop();
    const s = this.outSnap.pop();
    if (s) { this.ctm = s.ctm; this.hasWarp = s.hasWarp; }
    else { this.ctm = IDENTITY; this.hasWarp = false; }
  }

  /** Push / pop an after-split penetration effect (humanize / snaptogrid). */
  pushPen(fn: (x: number, y: number) => [number, number]) { this.penLayers.push(fn); }
  popPen() { this.penLayers.pop(); }

  /**
   * Map a local point to hoop space through the pre-split stack. With no warp
   * active this is exactly `apply(ctm, …)` — the byte-identical fast path.
   * Warps are applied innermost-first (the layer closest to the drawing
   * command runs first), composing inside-out like transform nesting.
   */
  mapOut(x: number, y: number): [number, number] {
    if (!this.hasWarp) return apply(this.ctm, x, y);
    let px = x, py = y;
    for (let i = this.outLayers.length - 1; i >= 0; i--) {
      const L = this.outLayers[i];
      const r = L.kind === 'aff' ? apply(L.m, px, py) : L.fn(px, py);
      px = r[0]; py = r[1];
    }
    return [px, py];
  }

  /** Like mapOut, but using the satin column's captured snapshot. */
  _mapSatin(lx: number, ly: number): [number, number] {
    if (!this.satinHasWarp) return apply(this.satinCTM, lx, ly);
    let px = lx, py = ly;
    for (let i = this.satinLayers.length - 1; i >= 0; i--) {
      const L = this.satinLayers[i];
      const r = L.kind === 'aff' ? apply(L.m, px, py) : L.fn(px, py);
      px = r[0]; py = r[1];
    }
    return [px, py];
  }

  /**
   * Emit one penetration point, running it through the after-split effect
   * stack (humanize / snaptogrid) first. Snapped or jittered duplicates that
   * collapse below the minimum stitch ride the existing tiny-stitch merge.
   * With no effect active this is exactly `_push('stitch', …)`.
   */
  _emitPen(x: number, y: number, u = false) {
    if (this.penLayers.length === 0) { this._push('stitch', x, y, u); return; }
    let px = x, py = y;
    for (let i = this.penLayers.length - 1; i >= 0; i--) {
      const r = this.penLayers[i](px, py);
      px = r[0]; py = r[1];
    }
    if (this.lastEmit) {
      const d = Math.hypot(px - this.lastEmit.x, py - this.lastEmit.y);
      if (d < LIMITS.minStitch * 0.5) { this.tinyDropped++; return; }
    }
    this._push('stitch', px, py, u);
  }

  _push(t: EventType, x: number, y: number, u = false) {
    if (this.events.length >= LIMITS.maxStitches)
      throw new NeedlescriptError(
        `Design exceeds ${LIMITS.maxStitches.toLocaleString('en-US')} stitches — stopped. Reduce repeats, raise stitchlen, or raise fillspacing.` +
        (this.usedQuery
          ? ' A feedback loop may not be terminating — is your coverage target reachable? Cap it with  repeat N [ … if done [ break ] ].'
          : ''),
      );
    const ev: StitchEvent = { t, x, y, c: this.colorIdx, line: this.currentLine };
    if (u) ev.u = 1;
    this.events.push(ev);
    this.density.feed(t, x, y, this.currentLine);
    if (t === 'stitch' || t === 'jump') this.lastEmit = { x, y };
  }

  _ensureStart() {
    if (!this.started) {
      this.started = true;
      const [hx, hy] = this.mapOut(this.x, this.y);
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
    const [hx, hy] = this.mapOut(this.x, this.y);
    this._push('mark', hx, hy);
  }

  travel(nx: number, ny: number) {
    const ox = this.x, oy = this.y;

    if (this.recording) {
      // Fill boundaries are recorded in hoop space so the fill is generated
      // (and pull-compensated) on the geometry that actually sews.
      if (this.penDown) {
        const [hnx, hny] = this.mapOut(nx, ny);
        if (!this.curRing) {
          const [hox, hoy] = this.mapOut(ox, oy);
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
      const [hnx, hny] = this.mapOut(nx, ny);
      this._push('jump', hnx, hny);
      this.x = nx; this.y = ny;
      return;
    }

    if (this.mode === 'satin' && (this.satinWidth > 0.05 || this.satinReporter)) {
      // Buffer the column path in *local* space and snapshot the output stack;
      // the column is mapped to hoop space (with width transformed
      // perpendicular to local travel) when it ends — see flushSatin().
      const localLen = Math.hypot(nx - ox, ny - oy);
      if (localLen > 1e-9) {
        if (!this.satinPath) {
          this.satinPath = [{ x: ox, y: oy }];
          this.satinCTM = this.ctm;
          this.satinHasWarp = this.hasWarp;
          this.satinLayers = this.hasWarp ? this.outLayers.slice() : this.satinLayers;
        }
        const lastP = this.satinPath[this.satinPath.length - 1];
        if (Math.hypot(nx - lastP.x, ny - lastP.y) > 0.05)
          this.satinPath.push({ x: nx, y: ny });
      }
      this.x = nx; this.y = ny;
      return;
    }

    // Map both endpoints to hoop space; split on the *hoop* length so stitch
    // length stays physical under scaling (transform the path, then stitch).
    const [hox, hoy] = this.mapOut(ox, oy);
    const [hnx, hny] = this.mapOut(nx, ny);
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
        this._emitPen(cx, cy);
        this._emitPen(cx + ovx * this.eWidth, cy + ovy * this.eWidth);
        this._emitPen(cx, cy);
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
      this._emitPen(tx, ty);
      for (let r = 1; r < this.beanRepeats; r++) {
        this._emitPen(r % 2 === 1 ? pxv : tx, r % 2 === 1 ? pyv : ty);
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
    // After-split effects (humanize / snaptogrid) deliberately skip satin: the
    // rails are emitted via _push, not _emitPen, so they sew unaffected —
    // quantizing or jittering a precise satin rail wrecks the column. Warn once.
    if (this.penLayers.length && !this._warnedSatinEffect) {
      this.warnings.push(
        'humanize/snaptogrid skips satin columns — perturbing satin rails wrecks the column; it sews unaffected',
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

  /** Map a local polyline into hoop space (through the satin snapshot map). */
  _toHoop(pts: { x: number; y: number }[], _ctm: Mat): { x: number; y: number }[] {
    return pts.map(p => { const [x, y] = this._mapSatin(p.x, p.y); return { x, y }; });
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
    const hoop0 = this._mapSatin(local[0].x, local[0].y);
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
    const mapped = local.map(p => apply(this.satinCTM, p.x, p.y));
    const cum: number[] = new Array(n);
    cum[0] = 0;
    for (let i = 1; i < n; i++)
      cum[i] = cum[i - 1] + Math.hypot(mapped[i][0] - mapped[i - 1][0], mapped[i][1] - mapped[i - 1][1]);
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
      const p0 = local[seg - 1], p1 = local[seg];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const ux = dx / dlen, uy = dy / dlen;
      return {
        x: p0.x + dx * f, y: p0.y + dy * f,
        nx: -uy, ny: ux,                                   // left normal (local)
        heading: (Math.atan2(ux, uy) * 180 / Math.PI + 360) % 360,
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
    interface Pen { x: number; y: number }
    const topping: Pen[] = [];
    let maxFullW = 0;
    let maxChord = 0;
    let side = this.satinSide;       // local copy of the alternating rail flag
    let cursor = 0;                  // arc-length consumed (pair base)
    let pair = 0;                    // 0-based pair index → reporter's `i`
    let advWarned = false;
    let prev: Pen | null = null;
    let guard = 0;
    const guardMax = LIMITS.maxStitches + 10;

    while (cursor < L - 1e-9 && guard++ < guardMax) {
      const ret = reporter(cursor, cursor / L, pair, resolve(cursor).heading);
      let adv = ret[0];
      const lw = Math.max(0, ret[1]);   // negative half-widths clamp to 0 (§5.1)
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
          if (d < LIMITS.minStitch * 0.5) { this.tinyDropped++; continue; }
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
      const ax = local[i].x - local[i - 1].x, ay = local[i].y - local[i - 1].y;
      const bx = local[i + 1].x - local[i].x, by = local[i + 1].y - local[i].y;
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
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
        ? (w < 1.5 ? 'off' : w < 4 ? 'center' : 'zigzag')
        : this.underlayMode;
    if (mode === 'off') return;
    const uLen = Math.max(1.5, Math.min(this.stitchLen, 3));
    const hoop = this._toHoop(local, this.satinCTM);
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
    this.curRing = [this.mapOut(this.x, this.y)];
  }

  /** Emit a sequence of fill points, connecting from wherever the thread is. */
  _emitFillPts(pts: FillPoint[], u: boolean) {
    if (!pts.length) return;
    const first = pts[0];
    if (!this.started) {
      this.started = true;
      if (Math.hypot(first.x, first.y) > 1) this._push('jump', first.x, first.y, u);
      else this._emitPen(first.x, first.y, u);
    } else {
      const le = this.lastEmit || { x: 0, y: 0 };
      const d0 = Math.hypot(first.x - le.x, first.y - le.y);
      if (d0 > Math.max(this.stitchLen * 1.5, 2)) this._push('jump', first.x, first.y, u);
      else if (d0 > 0.05) this._emitPen(first.x, first.y, u);
    }
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].jump) this._push('jump', pts[i].x, pts[i].y, u);
      else this._emitPen(pts[i].x, pts[i].y, u);
    }
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
    const [hx, hy] = this.mapOut(this.x, this.y);
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
      const [hx, hy] = this.mapOut(this.x, this.y);
      this._push('color', hx, hy);
    }
    this.colorIdx = idx;
  }

  trimThread() {
    this.flushSatin();
    if (this.started) {
      const [hx, hy] = this.mapOut(this.x, this.y);
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
