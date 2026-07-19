// ---------- Fill recording and generation ----------

import { type FillPoint, evenOddInside, generateFill, generateFillRows } from './fill.ts';
import { NeedlescriptError } from '../errors.ts';
import { IDENTITY, apply, invert, linApply } from '../affine.ts';
import { vfromheading, vheading } from '../genmath.ts';
import { pathlen, segdist, segisect } from '../genmath.ts';
import { clipClosedPaths, clipOpenPaths, offsetCompoundRegion } from '../geometry.ts';
import { LIMITS } from './limits.ts';
import { SatinMachine } from './machine-satin.ts';
import { resolveFillUnderlayProfile } from '../underlay-profile.ts';
import type {
  FillEdgeUnderlayPass,
  FillUnderlayProfile,
  LegacyFillGenerator,
} from '../underlay-profile.ts';

export class FillMachine extends SatinMachine {
  beginFill() {
    if (this.recording)
      throw new NeedlescriptError(
        'beginfill while already recording a fill — close it with endfill first',
      );
    this.flushSatin();
    this.recording = true;
    this.rings = [];
    this.curRing = [this.mapOut(this.x, this.y)];
    if (this.fillArmed) {
      // Capture the output stack so the field/region compose with transforms;
      // record the boundary in local space so reporters see local coordinates.
      this.fillCTM = this.ctm;
      this.fillHasWarp = this.hasWarp;
      this.fillLayers = this.hasWarp ? this.outLayers.slice() : this.fillLayers;
      this.localRings = [];
      this.curLocalRing = [[this.x, this.y]];
    }
  }

  /** Map a local point to hoop space through the fill's captured snapshot. */
  _mapFill(lx: number, ly: number): [number, number] {
    if (!this.fillHasWarp) return apply(this.fillCTM, lx, ly);
    let px = lx,
      py = ly;
    for (let i = this.fillLayers.length - 1; i >= 0; i--) {
      const L = this.fillLayers[i];
      const r = L.kind === 'aff' ? apply(L.m, px, py) : L.fn(px, py);
      px = r[0];
      py = r[1];
    }
    return [px, py];
  }

  /** Emit a sequence of fill points, connecting from wherever the thread is. */
  _emitFillPts(pts: FillPoint[], u: boolean, connectRegion?: [number, number][][]) {
    if (!pts.length) return;
    const first = pts[0];
    if (!this.started) {
      this.started = true;
      if (Math.hypot(first.x, first.y) > 1) this._push('jump', first.x, first.y, u);
      else this._emitPen(first.x, first.y, u);
    } else {
      const le = this.lastEmit || { x: 0, y: 0 };
      const d0 = Math.hypot(first.x - le.x, first.y - le.y);
      if (
        d0 > Math.max(this.stitchLen * 1.5, 2) ||
        (connectRegion &&
          !this._fillConnectorInside(connectRegion, [le.x, le.y], [first.x, first.y]))
      )
        this._push('jump', first.x, first.y, u);
      else if (d0 > 0.05) this._emitPen(first.x, first.y, u);
    }
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].jump) this._push('jump', pts[i].x, pts[i].y, u);
      else this._emitPen(pts[i].x, pts[i].y, u);
    }
  }

  /** Conservative containment check for a prospective sewn fill connector. */
  _fillConnectorInside(
    rings: [number, number][][],
    from: [number, number],
    to: [number, number],
  ): boolean {
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const samples = Math.max(2, Math.ceil(distance / 1.5));
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      if (!evenOddInside(rings, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t))
        return false;
    }
    return true;
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
      const a = pts[(i - 1 + n) % n],
        b = pts[(i + 1) % n];
      // average of the two edge normals ≈ angle bisector
      const d1x = p[0] - a[0],
        d1y = p[1] - a[1];
      const d2x = b[0] - p[0],
        d2y = b[1] - p[1];
      const l1 = Math.hypot(d1x, d1y) || 1,
        l2 = Math.hypot(d2x, d2y) || 1;
      let nx = -(d1y / l1) - d2y / l2,
        ny = d1x / l1 + d2x / l2;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-6) {
        nx = -d1y / l1;
        ny = d1x / l1;
      } else {
        nx /= nl;
        ny /= nl;
      }
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
      if (!prev || p.jump) {
        out.push(p);
        continue;
      }
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      const steps = Math.max(1, Math.ceil(d / slen));
      for (let s = 1; s <= steps; s++)
        out.push({
          x: prev.x + ((p.x - prev.x) * s) / steps,
          y: prev.y + ((p.y - prev.y) * s) / steps,
          jump: false,
        });
    }
    return out;
  }

  _fillRegionArea(rings: [number, number][][]): number {
    const ringArea = (ring: [number, number][]) => {
      let area = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(area / 2);
    };
    return Math.max(0, ...rings.map(ringArea));
  }

  _resolveFillUnderlay(
    rings: [number, number][][],
    toppingRowSpacingMM: number,
    generator: LegacyFillGenerator,
  ) {
    return resolveFillUnderlayProfile(
      this.fillUnderlayMode,
      {
        regionAreaMM2: this._fillRegionArea(rings),
        toppingRowSpacingMM,
        doubled: this.doubleUnderlay,
        generator,
      },
      this.fillUnderlayCustomization,
    );
  }

  _emitFillEdgeUnderlay(
    rings: [number, number][][],
    pass: FillEdgeUnderlayPass,
    robustCompoundInset: boolean,
  ) {
    if (!robustCompoundInset) {
      for (const ring of rings) {
        const inset = this._insetRing(ring, rings, pass.insetMM);
        if (inset.length)
          this._emitFillPts(
            this._subdividePts(inset, pass.stitchLengthMM),
            true,
            this.fillInset > 0 ? rings : undefined,
          );
      }
      return;
    }

    const insetRings = offsetCompoundRegion(
      rings,
      -pass.insetMM,
      undefined,
      this.effectiveLimits.maxClipVerts,
    );
    for (const ring of insetRings) {
      if (ring.length < 3) continue;
      const closed: FillPoint[] = ring.map(([x, y]) => ({ x, y, jump: false }));
      closed.push({ ...closed[0] });
      const first = closed[0];
      if (
        this.started &&
        this.lastEmit &&
        Math.hypot(first.x - this.lastEmit.x, first.y - this.lastEmit.y) > 0.05
      )
        this._push('jump', first.x, first.y, true);
      this._emitFillPts(this._subdividePts(closed, pass.stitchLengthMM), true);
    }
  }

  _emitScanlineFillUnderlay(
    profile: FillUnderlayProfile & { readonly source: 'legacy' | 'custom' },
    rings: [number, number][][],
    toppingAngle: number,
    endNear: { x: number; y: number },
  ) {
    for (const pass of profile.passes) {
      if (pass.kind === 'edge') {
        this._emitFillEdgeUnderlay(rings, pass, profile.source === 'custom');
      } else {
        this._emitFillPts(
          generateFill(rings, {
            angle: toppingAngle + pass.angle.degrees,
            spacing: pass.rowSpacingMM,
            stitchLen: pass.stitchLengthMM,
            endNear,
            comp: -pass.insetMM,
            safeConnect: this.fillInset > 0,
          }),
          true,
          this.fillInset > 0 ? rings : undefined,
        );
      }
    }
  }

  _insetStreamline(poly: [number, number][], insetMM: number): [number, number][] {
    if (!(insetMM > 0) || poly.length < 2) return poly;
    const cumulative = [0];
    for (let i = 1; i < poly.length; i++)
      cumulative.push(
        cumulative[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]),
      );
    const total = cumulative[cumulative.length - 1];
    if (total - insetMM * 2 < 0.5) return [];
    const at = (distance: number): [number, number] => {
      let i = 1;
      while (i < cumulative.length && cumulative[i] < distance) i++;
      const a = poly[i - 1],
        b = poly[i];
      const span = cumulative[i] - cumulative[i - 1] || 1;
      const t = (distance - cumulative[i - 1]) / span;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    const start = insetMM,
      end = total - insetMM;
    return [
      at(start),
      ...poly.filter((_point, index) => cumulative[index] > start && cumulative[index] < end),
      at(end),
    ];
  }

  // ---- Programmable fill (`fill dir @d shape @s`, §7–§9) -------------------
  //
  // Evenly-spaced streamline placement (Jobard–Lefer), adapted for a clipped
  // region with holes. The engine owns coverage (even spacing) and termination
  // (two finite budgets, §5.2); the reporters drive direction (the field) and
  // texture (spacing/len/phase). All placement runs in hoop-affine space so
  // spacing stays physical under transforms; reporters are queried in local
  // space (inverse-mapped); warp deforms the emitted penetrations downstream.

  /**
   * Place evenly-spaced streamlines through `fieldFn` over `hoopRings`.
   * Returns the streamline polylines in deterministic placement order. `fieldFn`
   * returns a unit hoop direction or null (a field singularity, §6). `spacingFn`
   * gives the row separation sampled at a seed (§7.4).
   */
  _placeStreamlines(
    hoopRings: [number, number][][],
    fieldFn: (x: number, y: number) => [number, number] | null,
    spacingFn: (x: number, y: number, row: number) => number,
    diameter: number,
    area: number,
  ): { rows: [number, number][][]; truncated: boolean; seedCapped: boolean } {
    const K_len = 4,
      K_seed = 4,
      D_test = 0.5;
    // A representative spacing fixes the hash cell + the seed budget. Queries
    // scan ceil(r / cell) rings so a varying per-row spacing stays correct.
    let baseSpacing = spacingFn(...(this._regionSeedPoint(hoopRings) ?? [0, 0]), 0);
    if (!(baseSpacing > 0)) baseSpacing = 0.4;
    const cell = baseSpacing;
    const spacingMin = Math.max(0.25, baseSpacing);
    const lenCap = Math.max(diameter, 1) * K_len;
    const seedCap = Math.max(8, (area / (spacingMin * spacingMin)) * K_seed);

    // Spatial hash of every emitted vertex, tagged with its streamline id so the
    // separation test ignores a streamline's own vertices (§7.1/§7.2).
    const hash = new Map<string, [number, number, number][]>();
    const keyOf = (x: number, y: number) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
    const addVertex = (x: number, y: number, id: number) => {
      const k = keyOf(x, y);
      let arr = hash.get(k);
      if (!arr) {
        arr = [];
        hash.set(k, arr);
      }
      arr.push([x, y, id]);
    };
    const tooClose = (x: number, y: number, r: number, excludeId: number): boolean => {
      const ix = Math.floor(x / cell),
        iy = Math.floor(y / cell);
      const span = Math.max(1, Math.ceil(r / cell));
      const r2 = r * r;
      for (let dx = -span; dx <= span; dx++)
        for (let dy = -span; dy <= span; dy++) {
          const arr = hash.get(ix + dx + ',' + (iy + dy));
          if (!arr) continue;
          for (const v of arr) {
            if (v[2] === excludeId) continue;
            const ex = x - v[0],
              ey = y - v[1];
            if (ex * ex + ey * ey < r2) return true;
          }
        }
      return false;
    };
    const inRegion = (x: number, y: number) => evenOddInside(hoopRings, x, y);

    let truncated = false,
      seedCapped = false;

    // Integrate one streamline from `seed` with separation `sp`, both directions
    // (forward along the field, backward against it). RK2 midpoint stepping.
    // Each vertex carries the field direction sampled there [x, y, fx, fy] so
    // the seeding pass can reuse it instead of re-querying the reporter.
    const integrate = (
      seed: [number, number],
      sp: number,
      id: number,
    ): [number, number, number, number][] => {
      const h = sp * 0.5;
      const sep = sp * D_test;
      const seedDir = fieldFn(seed[0], seed[1]);
      const oneDir = (sign: number): [number, number, number, number][] => {
        const verts: [number, number, number, number][] = [];
        let px = seed[0],
          py = seed[1];
        let arc = 0,
          guard = 0;
        const guardMax = Math.ceil(lenCap / h) + 16;
        while (arc < lenCap && guard++ < guardMax) {
          const d1 = fieldFn(px, py);
          if (!d1) break; // singularity (§6)
          const mx = px + d1[0] * sign * h * 0.5;
          const my = py + d1[1] * sign * h * 0.5;
          const d2 = fieldFn(mx, my) ?? d1;
          const nx = px + d2[0] * sign * h;
          const ny = py + d2[1] * sign * h;
          if (!inRegion(nx, ny)) break; // left region/hole
          if (tooClose(nx, ny, sep, id)) break; // merge guard (§7.2)
          // Closed-orbit guard: a streamline that loops back near its own seed
          // (a vortex/swirl) is terminated after one revolution rather than
          // re-tracing to the length cap — the standard refinement that keeps a
          // pole's orbits finite without re-covering the same circle (§5.2).
          if (arc > sep * 4 && Math.hypot(nx - seed[0], ny - seed[1]) < sep) break;
          verts.push([nx, ny, d2[0], d2[1]]);
          arc += h;
          px = nx;
          py = ny;
        }
        if (arc >= lenCap) truncated = true;
        return verts;
      };
      const fwd = oneDir(1);
      const bwd = oneDir(-1);
      bwd.reverse();
      const seedVert: [number, number, number, number] = [
        seed[0],
        seed[1],
        seedDir ? seedDir[0] : 0,
        seedDir ? seedDir[1] : 1,
      ];
      return [...bwd, seedVert, ...fwd];
    };

    // FIFO seed queue (never a set — order must be deterministic, §10). Seed each
    // disconnected piece in lexicographic-centroid order (§14).
    const queue: [number, number][] = this._regionSeeds(hoopRings);
    const rows: [number, number][][] = [];
    let row = 0;
    let pops = 0;
    let totalVerts = 0;
    const popCap = seedCap * 8 + 64;
    // A finite total-work budget (the §5.2 seed-budget generalized to integration
    // steps): a pathological field — vortex, divergent, chaotic — produces a
    // finite, possibly imperfect fill with a warning, rather than running the
    // global op backstop into a hard error.
    const vertBudget = 55000;

    while (queue.length && row < seedCap && pops++ < popCap && totalVerts < vertBudget) {
      const seed = queue.shift()!;
      if (!inRegion(seed[0], seed[1])) continue;
      let sp = spacingFn(seed[0], seed[1], row);
      if (!(sp > 0)) sp = spacingMin;
      // Re-test at pop time: the field may have filled in since this candidate
      // was queued (§7.3).
      if (tooClose(seed[0], seed[1], sp * D_test, -1)) continue;
      const verts = integrate(seed, sp, row);
      if (verts.length < 2) continue;
      totalVerts += verts.length;
      for (const v of verts) addVertex(v[0], v[1], row);
      rows.push(verts.map((v) => [v[0], v[1]] as [number, number]));
      // Candidate seeds perpendicular to the field, reusing each vertex's stored
      // field direction (§7.3). Subsample to ~one candidate per `sp` of arc so a
      // fine integration step doesn't flood the queue (and the reporter) with
      // near-duplicate candidates that the proximity test would reject anyway.
      const stride = Math.max(1, Math.round(sp / (sp * 0.5)));
      for (let i = 0; i < verts.length; i += stride) {
        const v = verts[i];
        const px = -v[3],
          py = v[2]; // perpendicular to field
        for (const s of [-1, 1]) {
          const cx = v[0] + px * sp * s,
            cy = v[1] + py * sp * s;
          if (!inRegion(cx, cy)) continue;
          if (tooClose(cx, cy, sp * D_test, -1)) continue;
          if (queue.length < popCap) queue.push([cx, cy]);
        }
      }
      row++;
    }
    if (row >= seedCap || totalVerts >= vertBudget) seedCapped = true;
    return { rows, truncated, seedCapped };
  }

  /** Deterministic first-seed candidates: each in-region ring centroid (the
   * fillable pieces), sorted lexicographically (§7.3/§14). */
  _regionSeeds(hoopRings: [number, number][][]): [number, number][] {
    const seeds: [number, number][] = [];
    for (const ring of hoopRings) {
      const c = this._ringCentroid(ring);
      const seed = evenOddInside(hoopRings, c[0], c[1])
        ? c
        : this._nearestInRegion(hoopRings, ring, c);
      if (seed) seeds.push(seed);
    }
    seeds.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    // De-dup seeds that collapse onto the same piece centroid.
    const out: [number, number][] = [];
    for (const s of seeds)
      if (!out.some((o) => Math.hypot(o[0] - s[0], o[1] - s[1]) < 1e-6)) out.push(s);
    return out;
  }

  _regionSeedPoint(hoopRings: [number, number][][]): [number, number] | null {
    return this._regionSeeds(hoopRings)[0] ?? null;
  }

  _ringCentroid(ring: [number, number][]): [number, number] {
    let a = 0,
      cx = 0,
      cy = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i],
        q = ring[(i + 1) % ring.length];
      const cross = p[0] * q[1] - q[0] * p[1];
      a += cross;
      cx += (p[0] + q[0]) * cross;
      cy += (p[1] + q[1]) * cross;
    }
    if (Math.abs(a) < 1e-9) {
      let sx = 0,
        sy = 0;
      for (const p of ring) {
        sx += p[0];
        sy += p[1];
      }
      return [sx / ring.length, sy / ring.length];
    }
    return [cx / (3 * a), cy / (3 * a)];
  }

  /** Nearest in-region point to `target`, scanned on a coarse grid over the
   * ring bbox (used when a centroid lands in a hole, §7.3). */
  _nearestInRegion(
    all: [number, number][][],
    ring: [number, number][],
    target: [number, number],
  ): [number, number] | null {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of ring) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const N = 24;
    let best: [number, number] | null = null,
      bestD = Infinity;
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const x = minX + ((maxX - minX) * i) / N;
        const y = minY + ((maxY - minY) * j) / N;
        if (!evenOddInside(all, x, y)) continue;
        const d = Math.hypot(x - target[0], y - target[1]);
        if (d < bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    return best;
  }

  /**
   * Run the programmable-fill generator at endfill for the general (non
   * short-circuit) case: place streamlines through the field, walk each into
   * penetrations with per-point len/phase, and emit in placement order with
   * boustrophedon row direction. The constant-field / constant-shape case is
   * handled upstream by the byte-identical tatami short-circuit.
   *
   * `dir`/`shape` are the user reporters (local-space). `constAngle` is the
   * heading used when there is no direction field. The angle offset and optional
   * spacing/length/inset fields drive custom underlay; `coarse` retains the exact
   * legacy cross-grain path. `underlay` flags the emitted stitches.
   */
  _generateProgrammableFill(opts: {
    dir: ((lx: number, ly: number) => number) | null;
    shape: ((lx: number, ly: number, row: number, v: number) => [number, number, number]) | null;
    constAngle: number;
    angleOffsetDegrees: number;
    coarse: boolean;
    underlay: boolean;
    spacingMM?: number;
    stitchLengthMM?: number;
    insetMM?: number;
  }) {
    const inv = invert(this.fillCTM);
    if (!inv) {
      this.warnings.push('fill skipped — the active transform is degenerate (zero scale)');
      return;
    }
    const hoopRings = this.localRings
      .map((r) => r.map((p) => apply(this.fillCTM, p[0], p[1]) as [number, number]))
      .filter((r) => r.length >= 3);
    if (!hoopRings.length) return;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let area = 0;
    for (const ring of hoopRings) {
      let a = 0;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i],
          q = ring[(i + 1) % ring.length];
        a += p[0] * q[1] - q[0] * p[1];
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      area = Math.max(area, Math.abs(a / 2));
    }
    const diameter = Math.hypot(maxX - minX, maxY - minY);
    if (!(diameter > 0) || !(area > 0)) return;

    const localOf = (x: number, y: number): [number, number] => apply(inv, x, y);
    const baseSpacing = this.fillSpacing > 0 ? this.fillSpacing : 0.4;
    const topSpacing = opts.spacingMM ?? (opts.coarse ? Math.min(baseSpacing * 4, 5) : baseSpacing);
    // `v` is the cross-field position, assigned by placement order (§14),
    // normalized by an estimate of the row count so it spans ~0..1.
    const estRows = Math.max(1, Math.round(diameter / Math.max(0.25, topSpacing)));
    const vOf = (rowIdx: number) => Math.min(rowIdx / estRows, 1);

    // Field: local heading → hoop unit direction. Non-finite or a degenerate
    // mapped vector is a singularity (§6) → null halts the streamline.
    const fieldFn = (x: number, y: number): [number, number] | null => {
      let theta: number;
      if (opts.dir) {
        const [lx, ly] = localOf(x, y);
        theta = opts.dir(lx, ly);
      } else theta = opts.constAngle;
      if (!isFinite(theta)) return null;
      theta += opts.angleOffsetDegrees;
      const [vx, vy] = vfromheading(theta, 1);
      const [hxv, hyv] = linApply(this.fillCTM, vx, vy);
      const L = Math.hypot(hxv, hyv);
      if (!(L > 1e-9)) return null;
      return [hxv / L, hyv / L];
    };
    let spacingClampWarned = false;
    const spacingFn = (x: number, y: number, rowIdx: number): number => {
      if (opts.coarse || !opts.shape) return topSpacing;
      const [lx, ly] = localOf(x, y);
      let sp = opts.shape(lx, ly, rowIdx, vOf(rowIdx))[0];
      if (!(sp > 0)) {
        if (!spacingClampWarned) {
          this.warnings.push('fill: spacing must be greater than 0 — clamped to 0.25 mm');
          spacingClampWarned = true;
        }
        sp = 0.25;
      }
      return sp;
    };
    const defaultLen =
      this.fillLenReporter !== null || this.fillLenList !== null
        ? null // will be handled per-stitch by lenFn
        : this.fillLen !== null
          ? this.fillLen
          : this.stitchLenList !== null || this.stitchLenReporter !== null
            ? null // stitchlen form will be forwarded per-stitch
            : Math.min(Math.max(this.stitchLen, 1), 7);

    // Closures for the fill-len extended forms — captured once per _generateProgrammableFill call.
    const fillLenList = this.fillLenList;
    const fillLenListPhase = this.fillLenListPhase;
    const fillLenReporter = this.fillLenReporter;
    const stitchLenList = this.stitchLenList;
    const stitchLenListPhase = this.stitchLenListPhase;
    const stitchLen = this.stitchLen;
    const fillCTM = this.fillCTM;

    // Build the lenFn for this fill. Saved CTM is restored inside any reporter call.
    const lenFn = (lx: number, ly: number, rowIdx: number, v: number, si: number): number => {
      if (opts.stitchLengthMM !== undefined) return opts.stitchLengthMM;
      if (opts.coarse) return 4;
      if (opts.shape) return opts.shape(lx, ly, rowIdx, v)[1];
      if (fillLenReporter !== null) {
        // call with hoop-affine position (≈ hoop-space when no warp)
        const hp = apply(fillCTM, lx, ly) as [number, number];
        return Math.min(Math.max(fillLenReporter(0, 0, si, hp), 1), 7);
      }
      if (fillLenList !== null) {
        return fillLenList[(si + fillLenListPhase) % fillLenList.length];
      }
      if (defaultLen !== null) return defaultLen;
      // Follow stitchlen
      if (stitchLenList !== null) {
        return Math.min(
          Math.max(stitchLenList[(si + stitchLenListPhase) % stitchLenList.length], 1),
          7,
        );
      }
      return Math.min(Math.max(stitchLen, 1), 7);
    };
    const phaseFn = (lx: number, ly: number, rowIdx: number, v: number): number => {
      if (opts.underlay || !opts.shape) return 0.5;
      return opts.shape(lx, ly, rowIdx, v)[2];
    };

    const { rows, truncated, seedCapped } = this._placeStreamlines(
      hoopRings,
      fieldFn,
      spacingFn,
      diameter,
      area,
    );
    if (!rows.length) return;

    if (truncated && !opts.underlay)
      this.warnings.push(
        'fill: a streamline was truncated at the length cap — possible field singularity (the field may spiral or diverge here)',
      );
    if (seedCapped && !opts.underlay)
      this.warnings.push(
        'fill: streamline seed budget reached — coverage may be incomplete (the field may be pathological; re-seed or simplify it)',
      );

    // Final hoop point for a placement (hoop-affine) point: identity when no
    // warp (byte-exact); otherwise round-trip to local and re-apply the warp.
    const toFinal = (x: number, y: number): [number, number] => {
      if (!this.fillHasWarp) return [x, y];
      const [lx, ly] = apply(inv, x, y);
      return this._mapFill(lx, ly);
    };

    let cumPhase = 0;
    for (let r = 0; r < rows.length; r++) {
      let poly = rows[r];
      // Boustrophedon: alternate row direction in placement order (§8/§14).
      if (r % 2 === 1) poly = poly.slice().reverse();
      poly =
        opts.underlay && opts.insetMM !== undefined
          ? this._insetStreamline(poly, opts.insetMM)
          : this._extendForPullComp(poly);
      if (poly.length < 2) continue;
      const v = vOf(r);
      const pen = this._walkStreamline(poly, r, v, cumPhase, lenFn, localOf);
      // Advance the cumulative brick phase by this row's phase (§8).
      const [sx, sy] = localOf(poly[0][0], poly[0][1]);
      cumPhase += phaseFn(sx, sy, r, v);
      if (!pen.length) continue;
      const fillPts: FillPoint[] = pen.map((p) => {
        const [fx, fy] = toFinal(p[0], p[1]);
        return { x: fx, y: fy, jump: false };
      });
      this._emitFillPts(fillPts, opts.underlay, this.fillInset > 0 ? hoopRings : undefined);
    }
  }

  /** Extend a streamline's two endpoints outward along the end tangent by
   * pullComp, so rows reach the boundary against fabric pull (§4.4). */
  _extendForPullComp(poly: [number, number][]): [number, number][] {
    if (!(this.pullComp > 0) || poly.length < 2) return poly;
    const ext = this.pullComp;
    const a = poly[0],
      a1 = poly[1];
    const b = poly[poly.length - 1],
      b1 = poly[poly.length - 2];
    const ed = (p: [number, number], q: [number, number]): [number, number] => {
      const dx = p[0] - q[0],
        dy = p[1] - q[1];
      const l = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / l) * ext, p[1] + (dy / l) * ext];
    };
    return [ed(a, a1), ...poly.slice(1, -1), ed(b, b1)];
  }

  /**
   * Walk a streamline polyline into penetrations spaced by `lenFn` (clamped
   * 1–7 mm), preserving the first and last vertex, with the start phase shifted
   * by the cumulative brick offset (§8). Returns hoop-affine penetration points.
   *
   * `lenFn` receives the local position, row index, cross-field v, and the
   * within-row stitch index `si` — so list-cycling and reporter forms can use
   * `si` without changing callers that don't need it.
   */
  _walkStreamline(
    poly: [number, number][],
    row: number,
    v: number,
    cumPhase: number,
    lenFn: (x: number, y: number, row: number, v: number, si: number) => number,
    localOf: (x: number, y: number) => [number, number],
  ): [number, number][] {
    const out: [number, number][] = [];
    if (poly.length < 2) return poly.slice();
    // Cumulative arc length.
    const cum = [0];
    for (let i = 1; i < poly.length; i++)
      cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
    const total = cum[cum.length - 1];
    if (!(total > 0)) return [poly[0].slice() as [number, number]];

    const at = (s: number): [number, number] => {
      const a = Math.min(Math.max(s, 0), total);
      let seg = 1;
      while (seg < poly.length - 1 && cum[seg] < a) seg++;
      const segLen = cum[seg] - cum[seg - 1] || 1;
      const f = (a - cum[seg - 1]) / segLen;
      return [
        poly[seg - 1][0] + (poly[seg][0] - poly[seg - 1][0]) * f,
        poly[seg - 1][1] + (poly[seg][1] - poly[seg - 1][1]) * f,
      ];
    };

    out.push([poly[0][0], poly[0][1]]);
    // Brick offset: a fractional shift of the first interior penetration.
    const frac = ((cumPhase % 1) + 1) % 1;
    const [l0x, l0y] = localOf(poly[0][0], poly[0][1]);
    const firstLen = Math.min(Math.max(lenFn(l0x, l0y, row, v, 0), 1), 7);
    let s = frac > 1e-6 ? frac * firstLen : firstLen;
    let guard = 0;
    let si = 1; // stitch index within this row (0 = the first, above; si tracks subsequent)
    const guardMax = Math.ceil(total / 0.5) + 16;
    while (s < total - 1e-6 && guard++ < guardMax) {
      const p = at(s);
      out.push(p);
      const [lx, ly] = localOf(p[0], p[1]);
      const len = Math.min(Math.max(lenFn(lx, ly, row, v, si), 1), 7);
      s += len;
      si++;
    }
    out.push([poly[poly.length - 1][0], poly[poly.length - 1][1]]);
    return out;
  }

  /**
   * Build the physical hoop-space construction region selected by `fillinset`.
   * The zero setting deliberately avoids Clipper so existing fills remain
   * byte-identical. Positive settings normalize and offset the complete
   * even-odd region in one operation, allowing concavities to split and holes
   * to expand into the filled material.
   */
  _applyFillInset(rings: [number, number][][]): [number, number][][] {
    if (!(this.fillInset > 0)) return rings;

    const normalized = offsetCompoundRegion(
      rings,
      0,
      this.currentLine,
      this.effectiveLimits.maxClipVerts,
      'fillinset',
    );
    const inset = offsetCompoundRegion(
      rings,
      -this.fillInset,
      this.currentLine,
      this.effectiveLimits.maxClipVerts,
      'fillinset',
    );
    const componentCount = (region: [number, number][][]) => {
      if (!region.length) return 0;
      const signedArea = (ring: [number, number][]) => {
        let twiceArea = 0;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          twiceArea += a[0] * b[1] - b[0] * a[1];
        }
        return twiceArea / 2;
      };
      const areas = region.map(signedArea);
      let largest = 0;
      for (let i = 1; i < areas.length; i++)
        if (Math.abs(areas[i]) > Math.abs(areas[largest])) largest = i;
      const outerSign = Math.sign(areas[largest]) || 1;
      return areas.filter((area) => (Math.sign(area) || outerSign) === outerSign).length;
    };
    const originalComponents = componentCount(normalized);
    const insetComponents = componentCount(inset);
    const location = rings[0]?.[0];
    const warn = (message: string) => {
      const lineSuffix = this.currentLine === undefined ? '' : ` (line ${this.currentLine})`;
      const index = this.warnings.length;
      this.warnings.push(`${message}${lineSuffix}`);
      if (location)
        this.constructionWarningLocations.push({
          index,
          points: [{ x: location[0], y: location[1] }],
          lines: this.currentLine === undefined ? [] : [this.currentLine],
          kind: 'fill',
        });
    };

    if (!inset.length) {
      warn(`fillinset ${this.fillInset} mm emptied the fill region — nothing sewn`);
      return inset;
    }
    if (insetComponents > originalComponents)
      warn(
        `fillinset ${this.fillInset} mm split the fill region into ${insetComponents} disconnected components`,
      );
    if (insetComponents < originalComponents || inset.length < normalized.length) {
      const lost = Math.max(
        originalComponents - insetComponents,
        normalized.length - inset.length,
        1,
      );
      warn(
        `fillinset ${this.fillInset} mm collapsed ${lost} fill ${lost === 1 ? 'boundary or component' : 'boundaries or components'}`,
      );
    }
    return inset;
  }

  endFill() {
    if (!this.recording) throw new NeedlescriptError('endfill without a matching beginfill');
    this._closeRing();
    this.recording = false;
    if (!this.rings.length) {
      this.warnings.push('fill skipped — the boundary needs at least 3 pen-down points');
      if (this.fillArmed) {
        this.fillArmed = false;
        this.fillDirReporter = null;
        this.fillShapeReporter = null;
        this.fillPathsReporter = null;
        this.fillPathsStatic = null;
        this.fillPathsName = null;
        this.fillArmLine = undefined;
      }
      return;
    }
    let rings = this.rings;
    this.rings = [];
    // Rings are recorded in hoop space, so the "end near" hint must be too.
    const [hx, hy] = this.mapOut(this.x, this.y);
    const endNear = { x: hx, y: hy };
    rings = this._applyFillInset(rings);
    if (!rings.length) {
      if (this.fillArmed) {
        this.fillArmed = false;
        this.fillDirReporter = null;
        this.fillShapeReporter = null;
        this.fillPathsReporter = null;
        this.fillPathsStatic = null;
        this.fillPathsName = null;
        this.fillArmLine = undefined;
        this.localRings = [];
        this.curLocalRing = null;
      }
      return;
    }
    if (this.fillArmed && this.fillInset > 0) {
      const inv = invert(this.fillCTM);
      if (!inv)
        throw new NeedlescriptError(
          'fillinset cannot run under a singular transform (scale 0 has no local inverse)',
          this.currentLine,
        );
      this.localRings = rings.map((ring) =>
        ring.map((point) => apply(inv, point[0], point[1]) as [number, number]),
      );
      // The inset is already expressed in final physical hoop space. Reusing
      // it as the programmable construction frame avoids applying a warp twice.
      this.fillHasWarp = false;
      this.fillLayers = [];
    }

    if (this.fillArmed && (this.fillPathsReporter || this.fillPathsStatic)) {
      const reporter = this.fillPathsReporter;
      const staticPaths = this.fillPathsStatic;
      const armLine = this.fillArmLine;
      const inv = invert(this.fillCTM);
      if (!inv)
        throw new NeedlescriptError(
          'fill paths cannot run under a singular transform (scale 0 has no local inverse)',
          armLine,
        );
      const localRegion = rings.map((ring) => {
        const mapped = ring.map((p) => apply(inv, p[0], p[1]) as [number, number]);
        if (
          mapped.length > 1 &&
          Math.hypot(
            mapped[0][0] - mapped[mapped.length - 1][0],
            mapped[0][1] - mapped[mapped.length - 1][1],
          ) < 1e-6
        )
          mapped.pop();
        return mapped;
      });
      let paths: [number, number][][];
      try {
        paths = reporter ? reporter(localRegion) : staticPaths!.map((p) => p.map((q) => [...q]));
      } finally {
        this.fillArmed = false;
        this.fillDirReporter = null;
        this.fillShapeReporter = null;
        this.fillPathsReporter = null;
        this.fillPathsStatic = null;
        this.fillPathsName = null;
        this.fillArmLine = undefined;
      }
      const totalVertices = paths.reduce((n, path) => n + path.length, 0);
      if (
        totalVertices + localRegion.reduce((n, ring) => n + ring.length, 0) >
        this.effectiveLimits.maxClipVerts
      )
        throw new NeedlescriptError(
          `fill paths: too many vertices (over ${this.effectiveLimits.maxClipVerts.toLocaleString('en-US')})`,
          armLine,
        );
      const canonicalRows = generateFillRows(localRegion, this.fillSpacing, this.fillAngle);
      const sameRows =
        paths.length === canonicalRows.length &&
        paths.every(
          (path, i) =>
            path.length === canonicalRows[i].length &&
            path.every(
              (point, j) =>
                Math.hypot(point[0] - canonicalRows[i][j][0], point[1] - canonicalRows[i][j][1]) <
                1e-9,
            ),
        );
      if (
        sameRows &&
        (this.fillLenList !== null ||
          this.fillLenReporter !== null ||
          this.stitchLenList !== null ||
          this.stitchLenReporter !== null)
      ) {
        if (this.fillUnderlayCustomization) {
          const profile = this._resolveFillUnderlay(rings, this.fillSpacing, 'scanline');
          this._emitScanlineFillUnderlay(profile, rings, this.fillAngle, endNear);
        }
        const savedLocalRings = this.localRings;
        this.localRings = rings.map((ring) =>
          ring.map((point) => apply(inv, point[0], point[1]) as [number, number]),
        );
        try {
          this._generateProgrammableFill({
            dir: null,
            shape: null,
            constAngle: this.fillAngle,
            angleOffsetDegrees: 0,
            coarse: false,
            underlay: false,
          });
        } finally {
          this.localRings = savedLocalRings;
        }
        const back = Math.hypot((this.lastEmit?.x ?? 0) - hx, (this.lastEmit?.y ?? 0) - hy);
        if (back > 0.6) this._push('jump', hx, hy);
        return;
      }
      if (
        sameRows &&
        this.fillLenList === null &&
        this.fillLenReporter === null &&
        this.stitchLenList === null &&
        this.stitchLenReporter === null
      ) {
        const stitchLen = this.fillLen ?? Math.min(Math.max(this.stitchLen, 1), 7);
        const underlayProfile = this._resolveFillUnderlay(rings, this.fillSpacing, 'scanline');
        this._emitScanlineFillUnderlay(underlayProfile, rings, this.fillAngle, endNear);
        const points = generateFill(rings, {
          angle: this.fillAngle,
          spacing: this.fillSpacing,
          stitchLen,
          endNear,
          comp: this.pullComp,
          safeConnect: this.fillInset > 0,
        });
        this._emitFillPts(points, false, this.fillInset > 0 ? rings : undefined);
        const back = Math.hypot((this.lastEmit?.x ?? 0) - hx, (this.lastEmit?.y ?? 0) - hy);
        if (back > 0.6) this._push('jump', hx, hy);
        return;
      }
      const clipped: { path: [number, number][]; closed: boolean }[] = [];
      let dropped = 0;
      for (const path of paths) {
        const closed =
          Math.hypot(path[0][0] - path[path.length - 1][0], path[0][1] - path[path.length - 1][1]) <
          0.001;
        const pieces = closed
          ? clipClosedPaths(
              [path.slice(0, -1)],
              localRegion,
              armLine,
              this.effectiveLimits.maxClipVerts,
            )
          : clipOpenPaths([path], localRegion, armLine, this.effectiveLimits.maxClipVerts);
        for (const piece of pieces) {
          const candidate = closed ? [...piece, piece[0]] : piece;
          if (pathlen(candidate) < LIMITS.minStitch * 2) dropped++;
          else clipped.push({ path: candidate, closed });
        }
      }
      if (dropped)
        this.warnings.push(
          `${dropped} path fragment${dropped === 1 ? '' : 's'} shorter than 0.8 mm ${dropped === 1 ? 'was' : 'were'} dropped after clipping`,
        );
      if (!clipped.length) {
        this.warnings.push(`custom path fill produced no paths — nothing sewn (line ${armLine})`);
        return;
      }
      if (this.pullComp > 0 && clipped.some((p) => p.closed))
        this.warnings.push('pullcomp does not widen closed contour rings — open row ends only');

      // Underlay is always generated from the recorded compound region, never
      // from the decorative paths returned by the custom generator.
      const underlayProfile = this._resolveFillUnderlay(rings, this.fillSpacing, 'scanline');
      this._emitScanlineFillUnderlay(underlayProfile, rings, this.fillAngle, endNear);

      const lengthAt = (si: number, p: [number, number]) => {
        if (this.fillLenReporter) return this.fillLenReporter(0, 0, si, this._mapFill(p[0], p[1]));
        if (this.fillLenList)
          return this.fillLenList[(si + this.fillLenListPhase) % this.fillLenList.length];
        if (this.fillLen !== null) return this.fillLen;
        if (this.stitchLenList)
          return this.stitchLenList[(si + this.stitchLenListPhase) % this.stitchLenList.length];
        return this.stitchLen;
      };
      const all: FillPoint[] = [];
      let previousLocal: [number, number] | null = null;
      const connectorInside = (a: [number, number], b: [number, number]) => {
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > LIMITS.fillConnectMax) return false;
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (
          !evenOddInside(localRegion, a[0], a[1]) ||
          !evenOddInside(localRegion, b[0], b[1]) ||
          !evenOddInside(localRegion, mid[0], mid[1])
        )
          return false;
        for (const ring of localRegion)
          for (let i = 0; i < ring.length; i++) {
            const c = ring[i],
              d = ring[(i + 1) % ring.length];
            const hit = segisect(a, b, c, d);
            if (
              hit &&
              Math.hypot(hit[0] - a[0], hit[1] - a[1]) > 0.001 &&
              Math.hypot(hit[0] - b[0], hit[1] - b[1]) > 0.001
            )
              return false;
            if (segdist(mid, c, d) < 0.1) return false;
          }
        return true;
      };
      for (let row = 0; row < clipped.length; row++) {
        const local = clipped[row].closed
          ? clipped[row].path
          : this._extendForPullComp(clipped[row].path);
        const hoop = local.map((p) => this._mapFill(p[0], p[1]));
        const subdivided = this._walkStreamline(
          hoop,
          row,
          0,
          0,
          (_x, _y, _r, _v, si) => lengthAt(si, local[Math.min(si, local.length - 1)]),
          (x, y) => apply(inv, x, y),
        );
        const sewConnector = previousLocal ? connectorInside(previousLocal, local[0]) : true;
        for (let i = 0; i < subdivided.length; i++)
          all.push({ x: subdivided[i][0], y: subdivided[i][1], jump: i === 0 && !sewConnector });
        previousLocal = local[local.length - 1];
      }
      this._emitFillPts(all, false, this.fillInset > 0 ? rings : undefined);
      const back = Math.hypot((this.lastEmit?.x ?? 0) - hx, (this.lastEmit?.y ?? 0) - hy);
      if (back > 0.6) this._push('jump', hx, hy);
      return;
    }
    // effLen: effective fixed stitch length for the built-in tatami path.
    // When fillLenList / fillLenReporter is active the programmable path is
    // used instead (see below), so effLen is only needed for the flat path.
    const effLen =
      this.fillLenList !== null || this.fillLenReporter !== null
        ? null
        : this.fillLen !== null
          ? this.fillLen
          : this.stitchLenList !== null || this.stitchLenReporter !== null
            ? null // forward to programmable path
            : Math.min(Math.max(this.stitchLen, 1), 7);

    // Effective row direction / spacing / length for the tatami pass. For a
    // built-in fill these are the fill-state fields; an armed programmable fill
    // whose field+shape are constant overrides them here so the byte-identical
    // tatami short-circuit (§3.3/§7.5) drives the same generator.
    let useAngle = this.fillAngle;
    let useSpacing = this.fillSpacing;
    let useLen = effLen ?? Math.min(Math.max(this.stitchLen, 1), 7); // fallback for display; overridden below

    // When fillLenList / fillLenReporter (or their stitchlen equivalents) are
    // active on a plain (non-armed) fill, route through _generateProgrammableFill
    // so the extended lenFn gets called per stitch.  Temporarily populate
    // localRings from the hoop-space rings with an identity fillCTM so the
    // generator can work without a real arm-site transform snapshot.
    if (!this.fillArmed && effLen === null) {
      if (this.fillUnderlayCustomization) {
        const profile = this._resolveFillUnderlay(rings, this.fillSpacing, 'scanline');
        this._emitScanlineFillUnderlay(profile, rings, this.fillAngle, endNear);
      }
      const savedLocalRings = this.localRings;
      const savedFillCTM = this.fillCTM;
      const savedFillHasWarp = this.fillHasWarp;
      const savedFillLayers = this.fillLayers;
      this.localRings = rings.slice();
      this.fillCTM = IDENTITY;
      this.fillHasWarp = false;
      this.fillLayers = [];
      try {
        this._generateProgrammableFill({
          dir: null,
          shape: null,
          constAngle: this.fillAngle,
          angleOffsetDegrees: 0,
          coarse: false,
          underlay: false,
        });
      } finally {
        this.localRings = savedLocalRings;
        this.fillCTM = savedFillCTM;
        this.fillHasWarp = savedFillHasWarp;
        this.fillLayers = savedFillLayers;
      }
      const back = Math.hypot((this.lastEmit?.x ?? 0) - hx, (this.lastEmit?.y ?? 0) - hy);
      if (back > 0.6) this._push('jump', hx, hy);
      return;
    }

    if (this.fillArmed) {
      const dir = this.fillDirReporter;
      const shape = this.fillShapeReporter;
      // Consume the arming exactly at the matching endfill (§2), whatever path
      // we take below.
      const disarm = () => {
        this.fillArmed = false;
        this.fillDirReporter = null;
        this.fillShapeReporter = null;
        this.fillArmLine = undefined;
        this.localRings = [];
        this.curLocalRing = null;
      };

      // Local-space bbox of the recorded region, for constant-field sampling.
      let lminX = Infinity,
        lminY = Infinity,
        lmaxX = -Infinity,
        lmaxY = -Infinity;
      for (const ring of this.localRings)
        for (const p of ring) {
          if (p[0] < lminX) lminX = p[0];
          if (p[0] > lmaxX) lmaxX = p[0];
          if (p[1] < lminY) lminY = p[1];
          if (p[1] > lmaxY) lmaxY = p[1];
        }
      const sampleLocals: [number, number][] = [];
      for (let i = 0; i <= 4; i++)
        for (let j = 0; j <= 4; j++)
          sampleLocals.push([lminX + ((lmaxX - lminX) * i) / 4, lminY + ((lmaxY - lminY) * j) / 4]);

      // Constant-field detection: no field ⇒ the constant fillAngle; otherwise
      // the field is constant only if every sample returns the same heading.
      let constField = true;
      let theta0 = this.fillAngle; // local heading
      if (dir) {
        theta0 = dir(sampleLocals[0][0], sampleLocals[0][1]);
        for (const [lx, ly] of sampleLocals) {
          const t = dir(lx, ly);
          if (!isFinite(t) || Math.abs(t - theta0) > 1e-7) {
            constField = false;
            break;
          }
        }
      }
      // Constant-shape detection: no shape ⇒ trivially constant; otherwise the
      // three returns must match across samples and phase must be the default
      // 0.5 (other phases need the per-row streamline emitter).
      let constShape = true;
      let scSpacing = this.fillSpacing,
        scLen = effLen;
      if (shape) {
        const probes: [number, number, number][] = [
          [0, 0],
          [1, 0.5],
          [2, 1],
        ].map(([r, v]) => {
          const [sp, ln, ph] = shape(sampleLocals[0][0], sampleLocals[0][1], r, v);
          return [sp, ln, ph];
        });
        const [sp0, ln0, ph0] = probes[0];
        constShape =
          Math.abs(ph0 - 0.5) < 1e-9 &&
          probes.every(
            (p) =>
              Math.abs(p[0] - sp0) < 1e-9 &&
              Math.abs(p[1] - ln0) < 1e-9 &&
              Math.abs(p[2] - ph0) < 1e-9,
          );
        scSpacing = sp0;
        scLen = Math.min(Math.max(ln0, 1), 7);
      }

      if (constField && constShape) {
        // Byte-identical tatami short-circuit. Map the constant local heading to
        // a hoop heading; the rings already carry the transform, so the angle is
        // hoop-space like the built-in fill.
        const [hvx, hvy] = linApply(this.fillCTM, ...vfromheading(theta0, 1));
        useAngle = vheading([hvx, hvy]);
        if (shape) {
          useSpacing = scSpacing;
          useLen = scLen ?? useLen;
        }
        disarm();
        // fall through to the built-in tatami pass below
      } else {
        // General streamline fill. Underlay first (cross-grain rotated field,
        // coarser spacing), then the topping. Mirrors the built-in order.
        const underlayProfile = this._resolveFillUnderlay(
          rings,
          this.fillSpacing,
          'direction-field',
        );
        for (const pass of underlayProfile.passes) {
          if (pass.kind === 'edge') {
            this._emitFillEdgeUnderlay(rings, pass, underlayProfile.source === 'custom');
          } else {
            this._generateProgrammableFill({
              dir,
              shape: null,
              constAngle: this.fillAngle,
              angleOffsetDegrees: pass.angle.degrees,
              coarse: underlayProfile.source === 'legacy',
              underlay: true,
              ...(underlayProfile.source === 'custom'
                ? {
                    spacingMM: pass.rowSpacingMM,
                    stitchLengthMM: pass.stitchLengthMM,
                    insetMM: pass.insetMM,
                  }
                : {}),
            });
          }
        }
        this._generateProgrammableFill({
          dir,
          shape,
          constAngle: this.fillAngle,
          angleOffsetDegrees: 0,
          coarse: false,
          underlay: false,
        });
        disarm();
        const back = Math.hypot((this.lastEmit?.x ?? 0) - hx, (this.lastEmit?.y ?? 0) - hy);
        if (back > 0.6) this._push('jump', hx, hy);
        return;
      }
    }

    // ---- Underlay (sewn first, so the topping rides on a stable base) ----
    const underlayProfile = this._resolveFillUnderlay(rings, useSpacing, 'scanline');
    this._emitScanlineFillUnderlay(underlayProfile, rings, useAngle, endNear);

    // ---- Topping ----
    const pts = generateFill(rings, {
      angle: useAngle,
      spacing: useSpacing,
      stitchLen: useLen,
      endNear,
      comp: this.pullComp, // rows run along the stitch axis: extend against pull
      safeConnect: this.fillInset > 0,
    });
    if (!pts.length) {
      this.warnings.push('fill skipped — the area is too small to fill at this spacing');
      return;
    }
    this._emitFillPts(pts, false, this.fillInset > 0 ? rings : undefined);
    const back = Math.hypot((this.lastEmit?.x ?? 0) - hx, (this.lastEmit?.y ?? 0) - hy);
    if (back > 0.6) this._push('jump', hx, hy);
  }
}
