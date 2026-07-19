// ---------- Satin and buffered running-stitch generation ----------

import { LIMITS } from './limits.ts';
import { NeedlescriptError } from '../errors.ts';
import { IDENTITY, apply, isIdentity, linApply } from '../affine.ts';
import type { Mat } from '../affine.ts';
import { MachineCore } from './machine-core.ts';
import type { Pt } from '../genmath.ts';
import { prepareRailPair } from '../rail-pair.ts';
import type { RailCheckpoint, RailPairGeometry, RailPairSample } from '../rail-pair.ts';
import { resolveSatinUnderlayProfile } from '../underlay-profile.ts';
import type {
  LegacySatinGenerator,
  ResolvedSatinUnderlayProfile,
  SatinEdgeInset,
} from '../underlay-profile.ts';
import {
  analyzeRailPairColumn,
  analyzeSpineColumn,
  legacyRailWidthIssue,
} from '../column-analysis.ts';
import type { AnalyzedColumn, AnalyzedColumnSample } from '../column-analysis.ts';
import {
  SATIN_CORNER_LIMITS,
  satinSplitCount,
  satinSplitSeamFraction,
  satinCapUnderlayInset,
  satinCapWidthFactor,
} from '../satin-profile.ts';
import type { SatinCapMode, SatinJoinMode } from '../satin-profile.ts';
import {
  compensationForHeading,
  resolveDirectionalCompensation,
} from '../directional-compensation.ts';
import type { CompensationTensor } from '../types.ts';

interface ResolvedSatinCaps {
  readonly start: SatinCapMode;
  readonly end: SatinCapMode;
  readonly startLengthMM: number;
  readonly endLengthMM: number;
}

interface SatinToppingPoint {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  side: number;
  arc: number;
  widthMM: number;
}

interface WideSatinSection {
  readonly arc: number;
  readonly a: Pt;
  readonly b: Pt;
}

interface WideSatinLaneSample {
  readonly arc: number;
  readonly a: Pt;
  readonly b: Pt;
  readonly mid: Pt;
}

export class SatinMachine extends MachineCore {
  // ---- Satin column: underlay + zigzag, sewn when the column ends ----

  _directionalPullTensor(): CompensationTensor | null {
    if (this.compensationMode !== 'directional') return null;
    return resolveDirectionalCompensation(
      this.materialIntent,
      this.pullCompExplicit ? this.pullComp : undefined,
    ).pullTensor;
  }

  _directionalSatinPullTensor(): CompensationTensor | null {
    return this._directionalPullTensor();
  }

  _satinPullForHeading(heading: number, tensor: CompensationTensor | null): number {
    return tensor ? compensationForHeading(tensor, heading).acrossStitchMM : this.pullComp;
  }

  _satinPullForVector(dx: number, dy: number, tensor: CompensationTensor | null): number {
    if (!tensor) return this.pullComp;
    const heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    return this._satinPullForHeading(heading, tensor);
  }

  _resolveSatinCaps(
    lengthMM: number,
    startWidthMM: number,
    endWidthMM: number,
    closed: boolean,
    label: string,
  ): ResolvedSatinCaps {
    if (closed) return { start: 'legacy', end: 'legacy', startLengthMM: 0, endLengthMM: 0 };

    const resolveEnd = (mode: SatinCapMode, widthMM: number, end: 'start' | 'end') => {
      if (mode === 'legacy' || mode === 'butt') return { mode, lengthMM: 0 };
      const bounded = Math.min(this.satinCapLength, lengthMM / 2);
      if (mode !== 'round') return { mode, lengthMM: bounded };
      const radius = widthMM / 2;
      if (!(radius > 0) || radius > this.satinCapLength + 1e-9 || radius > lengthMM / 2 + 1e-9) {
        const lineSuffix = this.currentLine === undefined ? '' : ` (line ${this.currentLine})`;
        this.warnings.push(
          `${label}: round ${end} cap needs ${radius.toFixed(1)} mm of spine for a ${widthMM.toFixed(1)} mm semicircle — using point${lineSuffix}`,
        );
        return { mode: 'point' as const, lengthMM: bounded };
      }
      return { mode, lengthMM: radius };
    };

    const start = resolveEnd(this.satinCapStart, startWidthMM, 'start');
    const end = resolveEnd(this.satinCapEnd, endWidthMM, 'end');
    return {
      start: start.mode,
      end: end.mode,
      startLengthMM: start.lengthMM,
      endLengthMM: end.lengthMM,
    };
  }

  _satinCapFactor(caps: ResolvedSatinCaps, arcMM: number, lengthMM: number, widthMM: number) {
    const start = satinCapWidthFactor(
      caps.start,
      arcMM,
      caps.startLengthMM,
      widthMM,
      LIMITS.minStitch,
    );
    const end = satinCapWidthFactor(
      caps.end,
      lengthMM - arcMM,
      caps.endLengthMM,
      widthMM,
      LIMITS.minStitch,
    );
    return Math.min(start, end);
  }

  _cornerFallbackWarning(label: string, mode: SatinJoinMode, corner: AnalyzedColumnSample) {
    const lineSuffix = this.currentLine === undefined ? '' : ` (line ${this.currentLine})`;
    this.warnings.push(
      `${label}: ${mode} join cannot be constructed safely near (${corner.point[0].toFixed(1)}, ${corner.point[1].toFixed(1)}) — using continuous${lineSuffix}`,
    );
  }

  _relieveContinuousCorner<T extends SatinToppingPoint>(
    points: readonly T[],
    corner: AnalyzedColumnSample,
    windowMM: number,
  ): T[] {
    const out = points.map((point) => ({ ...point }));
    if (!this.shortStitch) return out;
    const innerSide = corner.signedTurnDeg > 0 ? 1 : -1;
    const candidates = out
      .map((point, index) => ({ point, index }))
      .filter(
        ({ point }) =>
          point.side === innerSide && Math.abs(point.arc - corner.arcLengthMM) <= windowMM + 1e-9,
      )
      .sort(
        (a, b) =>
          Math.abs(a.point.arc - corner.arcLengthMM) - Math.abs(b.point.arc - corner.arcLengthMM),
      );
    for (let rank = 0; rank < candidates.length; rank += 2) {
      const point = out[candidates[rank].index];
      point.x = point.centerX + (point.x - point.centerX) * 0.6;
      point.y = point.centerY + (point.y - point.centerY) * 0.6;
    }
    return out;
  }

  _cornerSupport(analysis: AnalyzedColumn, corner: AnalyzedColumnSample) {
    const position = analysis.sharpCornerIndices.indexOf(corner.index);
    if (position < 0) return null;
    const previousIndex = analysis.sharpCornerIndices[position - 1];
    const nextIndex = analysis.sharpCornerIndices[position + 1];
    const previousArc =
      previousIndex === undefined
        ? analysis.closed
          ? analysis.samples[analysis.sharpCornerIndices.at(-1)!].arcLengthMM - analysis.lengthMM
          : 0
        : analysis.samples[previousIndex].arcLengthMM;
    const nextArc =
      nextIndex === undefined
        ? analysis.closed
          ? analysis.samples[analysis.sharpCornerIndices[0]].arcLengthMM + analysis.lengthMM
          : analysis.lengthMM
        : analysis.samples[nextIndex].arcLengthMM;
    const incoming = corner.arcLengthMM - previousArc;
    const outgoing = nextArc - corner.arcLengthMM;
    if (!(incoming > 1e-9) || !(outgoing > 1e-9)) return null;
    const available = Math.min(incoming, outgoing) * 0.45;
    const desired = Math.max(corner.realizedWidthMM * 0.75, this.satinSpacing * 2);
    return {
      incoming,
      outgoing,
      windowMM: Math.min(available, desired),
    };
  }

  _fanCorner<T extends SatinToppingPoint>(
    points: readonly T[],
    corner: AnalyzedColumnSample,
    windowMM: number,
  ): T[] | null {
    const incoming = corner.incomingTangent;
    const outgoing = corner.outgoingTangent;
    if (!incoming || !outgoing || corner.turnAngleDeg >= 150) return null;
    const innerSide = corner.signedTurnDeg > 0 ? 1 : -1;
    const outerSide = -innerSide;
    const near = points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => Math.abs(point.arc - corner.arcLengthMM) <= windowMM + 1e-9);
    const inner = near.filter(({ point }) => point.side === innerSide);
    const outer = near.filter(({ point }) => point.side === outerSide);
    if (inner.length < 2 || outer.length < 2) return null;

    const keepInner = new Set(
      inner
        .slice()
        .sort(
          (a, b) =>
            Math.abs(a.point.arc - corner.arcLengthMM) - Math.abs(b.point.arc - corner.arcLengthMM),
        )
        .slice(0, SATIN_CORNER_LIMITS.maxInnerPenetrations)
        .map(({ index }) => index),
    );
    const keepOuter = new Set<number>();
    const outerLimit = SATIN_CORNER_LIMITS.maxOuterPenetrations;
    if (outer.length <= outerLimit) {
      for (const { index } of outer) keepOuter.add(index);
    } else {
      for (let i = 0; i < outerLimit; i++) {
        const selected = Math.round((i * (outer.length - 1)) / (outerLimit - 1));
        keepOuter.add(outer[selected].index);
      }
    }

    const incomingNormal: Pt = [-incoming[1] * outerSide, incoming[0] * outerSide];
    const outgoingNormal: Pt = [-outgoing[1] * outerSide, outgoing[0] * outerSide];
    const out: T[] = [];
    for (let index = 0; index < points.length; index++) {
      const source = points[index];
      const isNear = Math.abs(source.arc - corner.arcLengthMM) <= windowMM + 1e-9;
      if (!isNear) {
        out.push({ ...source });
        continue;
      }
      if (source.side === innerSide && !keepInner.has(index)) continue;
      if (source.side === outerSide && !keepOuter.has(index)) continue;
      const point = { ...source };
      if (source.side === innerSide) {
        point.x = point.centerX + (point.x - point.centerX) * 0.6;
        point.y = point.centerY + (point.y - point.centerY) * 0.6;
      } else {
        const progress = Math.min(
          Math.max((source.arc - corner.arcLengthMM + windowMM) / (windowMM * 2), 0),
          1,
        );
        let dx = incomingNormal[0] + (outgoingNormal[0] - incomingNormal[0]) * progress;
        let dy = incomingNormal[1] + (outgoingNormal[1] - incomingNormal[1]) * progress;
        const length = Math.hypot(dx, dy);
        if (!(length > 1e-6)) return null;
        dx /= length;
        dy /= length;
        const radius = Math.max(source.widthMM / 2, LIMITS.minStitch);
        point.x = corner.point[0] + dx * radius;
        point.y = corner.point[1] + dy * radius;
        point.centerX = corner.point[0];
        point.centerY = corner.point[1];
      }
      out.push(point);
    }
    return out;
  }

  _lineIntersection(a: Pt, ad: Pt, b: Pt, bd: Pt): Pt | null {
    const denominator = ad[0] * bd[1] - ad[1] * bd[0];
    if (Math.abs(denominator) < 1e-6) return null;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = (dx * bd[1] - dy * bd[0]) / denominator;
    return [a[0] + ad[0] * t, a[1] + ad[1] * t];
  }

  _splitCorner<T extends SatinToppingPoint>(
    points: readonly T[],
    corner: AnalyzedColumnSample,
    windowMM: number,
    miter: boolean,
  ): T[] | null {
    const incoming = corner.incomingTangent;
    const outgoing = corner.outgoingTangent;
    if (!incoming || !outgoing || corner.turnAngleDeg >= 150) return null;
    const replacementWindow = Math.min(
      windowMM,
      Math.max(this.satinSpacing * 1.5, SATIN_CORNER_LIMITS.overlapMM * 2),
    );
    const first = points.findIndex(
      (point) => Math.abs(point.arc - corner.arcLengthMM) <= replacementWindow + 1e-9,
    );
    if (first < 0) return null;
    let last = first;
    while (
      last + 1 < points.length &&
      Math.abs(points[last + 1].arc - corner.arcLengthMM) <= replacementWindow + 1e-9
    )
      last++;
    if (last - first + 1 < 4) return null;

    const halfWidth = corner.realizedWidthMM / 2;
    const overlap = Math.min(
      SATIN_CORNER_LIMITS.overlapMM,
      windowMM / 2,
      Math.max(halfWidth / 2, LIMITS.minStitch),
    );
    if (overlap < LIMITS.minStitch / 2) return null;
    const normalIn: Pt = [-incoming[1], incoming[0]];
    const normalOut: Pt = [-outgoing[1], outgoing[0]];
    const intersections = new Map<number, Pt>();
    if (miter) {
      for (const side of [-1, 1]) {
        const a: Pt = [
          corner.point[0] + normalIn[0] * halfWidth * side,
          corner.point[1] + normalIn[1] * halfWidth * side,
        ];
        const b: Pt = [
          corner.point[0] + normalOut[0] * halfWidth * side,
          corner.point[1] + normalOut[1] * halfWidth * side,
        ];
        const intersection = this._lineIntersection(a, incoming, b, outgoing);
        if (
          !intersection ||
          Math.hypot(intersection[0] - corner.point[0], intersection[1] - corner.point[1]) >
            Math.max(corner.realizedWidthMM * SATIN_CORNER_LIMITS.miterLimit, windowMM * 2)
        )
          return null;
        intersections.set(side, intersection);
      }
    }

    const beforeSide = first > 0 ? points[first - 1].side : -points[first].side;
    const firstSide = -beforeSide;
    const sides = [firstSide, -firstSide] as const;
    const base = points[first];
    const makePoint = (leg: 'incoming' | 'outgoing', side: number, order: number): T => {
      const tangent = leg === 'incoming' ? incoming : outgoing;
      const normal = leg === 'incoming' ? normalIn : normalOut;
      let center: Pt;
      let point: Pt;
      if (miter) {
        const intersection = intersections.get(side)!;
        const direction = leg === 'incoming' ? -1 : 1;
        point = [
          intersection[0] + tangent[0] * overlap * direction,
          intersection[1] + tangent[1] * overlap * direction,
        ];
        center = [point[0] - normal[0] * halfWidth * side, point[1] - normal[1] * halfWidth * side];
      } else {
        const direction = leg === 'incoming' ? 1 : -1;
        center = [
          corner.point[0] + tangent[0] * overlap * direction,
          corner.point[1] + tangent[1] * overlap * direction,
        ];
        point = [
          center[0] + normal[0] * halfWidth * side,
          center[1] + normal[1] * halfWidth * side,
        ];
      }
      return {
        ...base,
        x: point[0],
        y: point[1],
        centerX: center[0],
        centerY: center[1],
        side,
        arc: corner.arcLengthMM + (order - 1.5) * 1e-6,
        widthMM: corner.realizedWidthMM,
      };
    };
    const replacement = [
      makePoint('incoming', sides[0], 0),
      makePoint('incoming', sides[1], 1),
      makePoint('outgoing', sides[0], 2),
      makePoint('outgoing', sides[1], 3),
    ];
    return [
      ...points.slice(0, first).map((point) => ({ ...point })),
      ...replacement,
      ...points.slice(last + 1).map((point) => ({ ...point })),
    ];
  }

  _applySatinCornerStrategy<T extends SatinToppingPoint>(
    points: readonly T[],
    analysis: AnalyzedColumn,
    label: string,
  ): T[] {
    if (this.satinJoin === 'legacy' || !analysis.sharpCornerIndices.length) return points.slice();
    if (analysis.closed && this.satinJoin !== 'continuous') {
      const corner = analysis.samples[analysis.sharpCornerIndices[0]];
      this._cornerFallbackWarning(label, this.satinJoin, corner);
      return analysis.sharpCornerIndices.reduce((current, index) => {
        const sample = analysis.samples[index];
        const support = this._cornerSupport(analysis, sample);
        return support ? this._relieveContinuousCorner(current, sample, support.windowMM) : current;
      }, points.slice());
    }

    let out = points.slice();
    for (const index of analysis.sharpCornerIndices) {
      const corner = analysis.samples[index];
      const support = this._cornerSupport(analysis, corner);
      if (!support || support.windowMM < this.satinSpacing) {
        this._cornerFallbackWarning(label, this.satinJoin, corner);
        continue;
      }
      if (this.satinJoin === 'continuous') {
        out = this._relieveContinuousCorner(out, corner, support.windowMM);
        continue;
      }
      const constructed =
        this.satinJoin === 'fan'
          ? this._fanCorner(out, corner, support.windowMM)
          : this._splitCorner(out, corner, support.windowMM, this.satinJoin === 'miter');
      if (constructed) out = constructed;
      else {
        this._cornerFallbackWarning(label, this.satinJoin, corner);
        out = this._relieveContinuousCorner(out, corner, support.windowMM);
      }
    }
    return out;
  }

  _pushCappedTopping(x: number, y: number) {
    const previous = this.lastEmit;
    const distance = previous ? Math.hypot(x - previous.x, y - previous.y) : Infinity;
    // Exact tip coincidences are an intentional merge, not a malformed tiny move.
    if (distance < 1e-9) return false;
    if (distance < LIMITS.minStitch * 0.5) {
      this._dropTiny(x, y);
      return false;
    }
    this._push('stitch', x, y);
    return true;
  }

  _trimLocalPathForCaps(
    local: { x: number; y: number }[],
    caps: ResolvedSatinCaps,
  ): { x: number; y: number }[] {
    if (local.length < 2) return local.slice();
    const hoop = this._toHoop(local);
    const cumulative = [0];
    for (let i = 1; i < hoop.length; i++)
      cumulative.push(
        cumulative[i - 1] + Math.hypot(hoop[i].x - hoop[i - 1].x, hoop[i].y - hoop[i - 1].y),
      );
    const total = cumulative[cumulative.length - 1];
    const start = satinCapUnderlayInset(caps.start, caps.startLengthMM);
    const end = total - satinCapUnderlayInset(caps.end, caps.endLengthMM);
    if (start === 0 && end === total) return local.slice();
    if (end - start < LIMITS.minStitch) return [];

    const atArc = (arc: number) => {
      let segment = 1;
      while (segment < cumulative.length - 1 && cumulative[segment] < arc) segment++;
      const span = cumulative[segment] - cumulative[segment - 1] || 1;
      const t = (arc - cumulative[segment - 1]) / span;
      return {
        x: local[segment - 1].x + (local[segment].x - local[segment - 1].x) * t,
        y: local[segment - 1].y + (local[segment].y - local[segment - 1].y) * t,
      };
    };

    const out = [atArc(start)];
    for (let i = 1; i < local.length - 1; i++)
      if (cumulative[i] > start + 1e-9 && cumulative[i] < end - 1e-9) out.push(local[i]);
    out.push(atArc(end));
    return out;
  }

  _resolveSatinUnderlay(
    columnWidthMM: number,
    generator: LegacySatinGenerator,
  ): ResolvedSatinUnderlayProfile {
    return resolveSatinUnderlayProfile(
      this.underlayMode,
      {
        columnWidthMM,
        runningStitchLengthMM: this.stitchLen,
        doubled: this.doubleUnderlay,
        generator,
      },
      this.satinUnderlayCustomization,
    );
  }

  _warnCollapsedEdgeInset(profile: ResolvedSatinUnderlayProfile, width: number, label: string) {
    const edge = profile.passes.find((pass) => pass.kind === 'edge' && pass.inset.unit === 'mm');
    if (!edge || edge.kind !== 'edge' || edge.inset.unit !== 'mm') return;
    if (edge.inset.value <= 0) return;
    const insetSpan = edge.inset.value * 2;
    if (insetSpan < width - 1e-9) return;
    const behavior = Math.abs(insetSpan - width) <= 1e-9 ? 'collapses at' : 'crosses';
    this.warnings.push(
      `underlayinset ${edge.inset.value} mm ${behavior} the center of ${label} (${width.toFixed(1)} mm wide) — edge underlay clamped to the center`,
    );
  }

  _edgeCenterOffset(width: number, inset: SatinEdgeInset): number {
    if (inset.unit === 'mm') return Math.max(0, width / 2 - inset.value);
    return Math.max(0.3, width * (0.5 - inset.value));
  }

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
    caps?: ResolvedSatinCaps,
  ) {
    if (path.length < 2) return;
    const half = width / 2;
    const analysis = analyzeSpineColumn(
      path.map((point) => [point.x, point.y]),
      width,
      { sharpTurnThresholdDeg: this.satinCornerAngle },
    );
    const analyzedByInput = new Map(analysis.samples.map((sample) => [sample.inputIndex, sample]));
    const cumulative = [0];
    for (let i = 1; i < path.length; i++)
      cumulative.push(
        cumulative[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y),
      );
    const totalLength = cumulative[cumulative.length - 1];
    if (caps && (caps.start === 'point' || caps.start === 'round'))
      this._pushCappedTopping(path[0].x, path[0].y);
    let prevUx: number | null = null,
      prevUy = 0;
    let innerCounter = 0;
    let warnedTight = false;
    const topping: SatinToppingPoint[] = [];
    const planCorners = !u && this.satinJoin !== 'legacy';
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
        const analyzed = analyzedByInput.get(i - 1);
        const cross = prevUx * uy - prevUy * ux; // > 0 = turning left
        const dot = Math.max(-1, Math.min(1, prevUx * ux + prevUy * uy));
        const theta = Math.acos(dot);
        // Only treat gentle, continuous turns as curvature — sharp corners
        // and reversals (retraced columns) are not curves.
        if (theta > 1e-3 && theta < 2.1) {
          const analyzedTheta = analyzed ? (analyzed.turnAngleDeg * Math.PI) / 180 : 0;
          const R =
            analyzed && Math.abs(analyzedTheta - theta) <= 1e-12
              ? analyzed.legacyCurvatureRadiusMM
              : len / theta;
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
        if (caps) h *= this._satinCapFactor(caps, cumulative[i - 1] + len * t, totalLength, width);
        const x = cx + px * h * this.satinSide;
        const y = cy + py * h * this.satinSide;
        if (planCorners)
          topping.push({
            x,
            y,
            centerX: cx,
            centerY: cy,
            side: this.satinSide,
            arc: cumulative[i - 1] + len * t,
            widthMM: h * 2,
          });
        else if (caps) this._pushCappedTopping(x, y);
        else this._push('stitch', x, y, u);
      }
      prevUx = ux;
      prevUy = uy;
    }
    if (planCorners) {
      for (const point of this._applySatinCornerStrategy(topping, analysis, 'satin')) {
        if (caps) this._pushCappedTopping(point.x, point.y);
        else this._push('stitch', point.x, point.y, false);
      }
    }
  }

  _wideSplitWarning(label: string, reason: string) {
    const lineSuffix = this.currentLine === undefined ? '' : ` (line ${this.currentLine})`;
    this.warnings.push(
      `${label}: wide-column split refused because ${reason}; the original column remains unsplit${lineSuffix}`,
    );
  }

  _segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const cross = (p: Pt, q: Pt, r: Pt) =>
      (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return cross(a, b, c) * cross(a, b, d) < -1e-9 && cross(c, d, a) * cross(c, d, b) < -1e-9;
  }

  _wideSplitTopologyIssue(sections: readonly WideSatinSection[]): string | null {
    for (let index = 1; index < sections.length; index++) {
      const previous = sections[index - 1];
      const current = sections[index];
      const previousRung: Pt = [previous.b[0] - previous.a[0], previous.b[1] - previous.a[1]];
      const currentRung: Pt = [current.b[0] - current.a[0], current.b[1] - current.a[1]];
      const previousWidth = Math.hypot(previousRung[0], previousRung[1]);
      const currentWidth = Math.hypot(currentRung[0], currentRung[1]);
      if (
        previousWidth > 0.05 &&
        currentWidth > 0.05 &&
        previousRung[0] * currentRung[0] + previousRung[1] * currentRung[1] <= 0
      )
        return `the rail orientation reverses near (${current.a[0].toFixed(1)}, ${current.a[1].toFixed(1)})`;
      if (
        this._segmentsCross(previous.a, current.a, previous.b, current.b) ||
        this._segmentsCross(previous.a, previous.b, current.a, current.b)
      )
        return `the rails cross near (${current.a[0].toFixed(1)}, ${current.a[1].toFixed(1)})`;
    }
    return null;
  }

  _wideSectionAtArc(sections: readonly WideSatinSection[], arc: number): WideSatinSection {
    const target = Math.min(Math.max(arc, 0), sections[sections.length - 1].arc);
    let index = 1;
    while (index < sections.length - 1 && sections[index].arc < target) index++;
    const previous = sections[index - 1];
    const current = sections[index];
    const span = current.arc - previous.arc;
    const factor = span > 1e-9 ? (target - previous.arc) / span : 0;
    return {
      arc: target,
      a: [
        previous.a[0] + (current.a[0] - previous.a[0]) * factor,
        previous.a[1] + (current.a[1] - previous.a[1]) * factor,
      ],
      b: [
        previous.b[0] + (current.b[0] - previous.b[0]) * factor,
        previous.b[1] + (current.b[1] - previous.b[1]) * factor,
      ],
    };
  }

  _spineWideSections(
    centers: readonly Pt[],
    widths: readonly number[],
    directions?: readonly Pt[],
  ): WideSatinSection[] {
    const sections: WideSatinSection[] = [];
    let arc = 0;
    for (let index = 0; index < centers.length; index++) {
      if (index > 0)
        arc += Math.hypot(
          centers[index][0] - centers[index - 1][0],
          centers[index][1] - centers[index - 1][1],
        );
      const previous = centers[Math.max(0, index - 1)];
      const next = centers[Math.min(centers.length - 1, index + 1)];
      const dx = next[0] - previous[0];
      const dy = next[1] - previous[1];
      const length = Math.hypot(dx, dy) || 1;
      const direction = directions?.[index] ?? ([-dy / length, dx / length] as Pt);
      const half = widths[index] / 2;
      sections.push({
        arc,
        a: [centers[index][0] + direction[0] * half, centers[index][1] + direction[1] * half],
        b: [centers[index][0] - direction[0] * half, centers[index][1] - direction[1] * half],
      });
    }
    return sections;
  }

  _capWideSections(
    source: readonly WideSatinSection[],
    caps: ResolvedSatinCaps,
  ): WideSatinSection[] {
    const length = source[source.length - 1].arc;
    const steps = Math.max(1, Math.ceil(length / 0.5));
    const out: WideSatinSection[] = [];
    for (let index = 0; index <= steps; index++) {
      const arc = (length * index) / steps;
      const section = this._wideSectionAtArc(source, arc);
      const mid: Pt = [(section.a[0] + section.b[0]) / 2, (section.a[1] + section.b[1]) / 2];
      const width = Math.hypot(section.b[0] - section.a[0], section.b[1] - section.a[1]);
      const factor = this._satinCapFactor(caps, arc, length, width);
      out.push({
        arc,
        a: [mid[0] + (section.a[0] - mid[0]) * factor, mid[1] + (section.a[1] - mid[1]) * factor],
        b: [mid[0] + (section.b[0] - mid[0]) * factor, mid[1] + (section.b[1] - mid[1]) * factor],
      });
    }
    return out;
  }

  _wideBoundaryPoint(
    section: WideSatinSection,
    seamIndex: number,
    columnCount: number,
    rowIndex: number,
  ): Pt {
    if (seamIndex === 0) return [section.a[0], section.a[1]];
    if (seamIndex === columnCount) return [section.b[0], section.b[1]];
    const width = Math.hypot(section.b[0] - section.a[0], section.b[1] - section.a[1]);
    const fraction = satinSplitSeamFraction(
      seamIndex,
      columnCount,
      rowIndex,
      width,
      this.satinSplitOverlap,
    );
    return [
      section.a[0] + (section.b[0] - section.a[0]) * fraction,
      section.a[1] + (section.b[1] - section.a[1]) * fraction,
    ];
  }

  _wideLaneUnderlay(samples: readonly WideSatinLaneSample[], maxWidth: number) {
    const profile = this._resolveSatinUnderlay(maxWidth, 'rail-pair');
    if (!profile.passes.length || samples.length < 2) return;
    const forward = samples.map(({ mid }) => ({ x: mid[0], y: mid[1] }));
    const reverse = forward.slice().reverse();
    for (const pass of profile.passes) {
      if (pass.kind === 'center') {
        this._runAlong(forward, pass.runningStitchLengthMM, true);
        this._runAlong(reverse, pass.runningStitchLengthMM, true);
        continue;
      }
      if (pass.kind === 'edge') {
        const edge = (fromA: boolean) =>
          samples.map((sample) => {
            const width = Math.hypot(sample.b[0] - sample.a[0], sample.b[1] - sample.a[1]);
            const inset =
              pass.inset.unit === 'mm'
                ? Math.min(pass.inset.value, width / 2)
                : Math.max(0, width * pass.inset.value);
            const factor = width > 1e-9 ? inset / width : 0.5;
            const origin = fromA ? sample.a : sample.b;
            const target = fromA ? sample.b : sample.a;
            return {
              x: origin[0] + (target[0] - origin[0]) * factor,
              y: origin[1] + (target[1] - origin[1]) * factor,
            };
          });
        this._runAlong(edge(true), pass.runningStitchLengthMM, true);
        this._runAlong(edge(false).reverse(), pass.runningStitchLengthMM, true);
        continue;
      }
      const laneLength = Math.abs(samples[samples.length - 1].arc - samples[0].arc);
      const steps = Math.max(1, Math.ceil(laneLength / pass.spacingMM));
      const zigzag: { x: number; y: number }[] = [];
      for (let index = 0; index <= steps; index++) {
        const source = samples[Math.round((index * (samples.length - 1)) / steps)];
        const edge = index % 2 === 0 ? source.a : source.b;
        zigzag.push({
          x: source.mid[0] + (edge[0] - source.mid[0]) * pass.widthRatio,
          y: source.mid[1] + (edge[1] - source.mid[1]) * pass.widthRatio,
        });
      }
      for (const point of zigzag) {
        const previous = this.lastEmit;
        if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.1) continue;
        this._push('stitch', point.x, point.y, true);
      }
      if (pass.returnRun === 'reverse-center')
        this._runAlong(reverse, pass.returnRunStitchLengthMM, true);
    }
  }

  _emitWideLane(
    samples: readonly WideSatinLaneSample[],
    laneIndex: number,
    columnCount: number,
    chooseInitialPhase: boolean,
  ) {
    const start = samples[0].mid;
    const previous = this.lastEmit;
    if (previous && Math.hypot(start[0] - previous.x, start[1] - previous.y) > 0.05)
      this._push('jump', start[0], start[1]);
    if (!this.started) {
      this.started = true;
      this._push('stitch', start[0], start[1]);
    }
    const maxWidth = Math.max(
      ...samples.map((sample) => Math.hypot(sample.b[0] - sample.a[0], sample.b[1] - sample.a[1])),
    );
    this._wideLaneUnderlay(samples, maxWidth);
    const toppingSteps = samples.length - 1;
    let side = this.satinSide;
    if (chooseInitialPhase) {
      const desiredFinalSide = laneIndex < columnCount / 2 ? -1 : 1;
      side = toppingSteps % 2 === 0 ? desiredFinalSide : -desiredFinalSide;
    }
    for (let index = 1; index < samples.length; index++) {
      side = -side;
      const point = side > 0 ? samples[index].a : samples[index].b;
      this._pushCappedTopping(point[0], point[1]);
    }
    this.satinSide = side;
  }

  _tryEmitWideSplit(
    sections: readonly WideSatinSection[],
    analysis: AnalyzedColumn,
    label: string,
  ): boolean {
    if (this.satinWide !== 'split') return false;
    const maxWidth = Math.max(...analysis.samples.map((sample) => sample.realizedWidthMM));
    if (maxWidth <= this.satinMaxWidth + 1e-9) return false;
    if (analysis.closed) {
      this._wideSplitWarning(label, 'closed columns do not have an unambiguous split seam');
      return false;
    }
    const pathological = analysis.samples.find(
      (sample) => sample.kind === 'cusp' || sample.kind === 'u-turn',
    );
    if (pathological) {
      this._wideSplitWarning(
        label,
        `the spine has a ${pathological.kind} near (${pathological.point[0].toFixed(1)}, ${pathological.point[1].toFixed(1)})`,
      );
      return false;
    }
    if (analysis.sharpCornerIndices.length) {
      const corner = analysis.samples[analysis.sharpCornerIndices[0]];
      this._wideSplitWarning(
        label,
        `the spine has a sharp corner near (${corner.point[0].toFixed(1)}, ${corner.point[1].toFixed(1)})`,
      );
      return false;
    }
    if (analysis.unsafeWidthIndices.length) {
      const unsafe = analysis.samples[analysis.unsafeWidthIndices[0]];
      this._wideSplitWarning(
        label,
        `its width exceeds the local curve radius near (${unsafe.point[0].toFixed(1)}, ${unsafe.point[1].toFixed(1)})`,
      );
      return false;
    }
    const topologyIssue = this._wideSplitTopologyIssue(sections);
    if (topologyIssue) {
      this._wideSplitWarning(label, topologyIssue);
      return false;
    }

    const columnCount = satinSplitCount(maxWidth, this.satinMaxWidth, this.satinSplitOverlap);
    const length = sections[sections.length - 1].arc;
    const rows = Math.max(1, Math.ceil(length / this.satinSpacing));
    const lanes: WideSatinLaneSample[][] = Array.from({ length: columnCount }, () => []);
    for (let row = 0; row <= rows; row++) {
      const arc = (length * row) / rows;
      const section = this._wideSectionAtArc(sections, arc);
      for (let lane = 0; lane < columnCount; lane++) {
        const a = this._wideBoundaryPoint(section, lane, columnCount, row);
        const b = this._wideBoundaryPoint(section, lane + 1, columnCount, row);
        lanes[lane].push({ arc, a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
      }
    }

    const remaining = lanes.map((samples, index) => ({ samples, index }));
    let emittedLanes = 0;
    while (remaining.length) {
      const from = this.lastEmit ?? { x: sections[0].a[0], y: sections[0].a[1] };
      let bestIndex = 0;
      let bestReverse = false;
      let bestDistance = Infinity;
      for (let index = 0; index < remaining.length; index++) {
        const lane = remaining[index].samples;
        for (const reverse of [false, true]) {
          const start = reverse ? lane[lane.length - 1].mid : lane[0].mid;
          const distance = Math.hypot(start[0] - from.x, start[1] - from.y);
          if (
            distance < bestDistance - 1e-9 ||
            (Math.abs(distance - bestDistance) <= 1e-9 &&
              remaining[index].index < remaining[bestIndex].index)
          ) {
            bestDistance = distance;
            bestIndex = index;
            bestReverse = reverse;
          }
        }
      }
      const [{ samples, index }] = remaining.splice(bestIndex, 1);
      this._emitWideLane(
        bestReverse ? samples.slice().reverse() : samples,
        index,
        columnCount,
        emittedLanes === 0,
      );
      emittedLanes++;
    }
    this.warnings.push(
      `note: ${label} split into ${columnCount} interlocking columns at a ${this.satinMaxWidth.toFixed(1)} mm ceiling`,
    );
    return true;
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
    const pullTensor = this._directionalSatinPullTensor();
    const pullAt = (sample: RailPairSample) =>
      this._satinPullForHeading(sample.heading, pullTensor);
    const analysis = analyzeRailPairColumn(geometry.samples, {
      sharpTurnThresholdDeg: this.satinCornerAngle,
    });
    const caps = this._resolveSatinCaps(
      geometry.spineLength,
      this._railWidth(geometry.samples[0]) + pullAt(geometry.samples[0]),
      this._railWidth(geometry.samples[geometry.samples.length - 1]) +
        pullAt(geometry.samples[geometry.samples.length - 1]),
      geometry.closed,
      'satinbetween',
    );
    const hasCapPolicy = caps.start !== 'legacy' || caps.end !== 'legacy';
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

    const rawWideSections = geometry.samples.map((sample, index): WideSatinSection => {
      const width = this._railWidth(sample);
      const pull = pullAt(sample);
      const ux = width > 1e-9 ? (sample.b[0] - sample.a[0]) / width : 0;
      const uy = width > 1e-9 ? (sample.b[1] - sample.a[1]) / width : 0;
      return {
        arc: geometry.cumulative[index],
        a: [sample.a[0] - (ux * pull) / 2, sample.a[1] - (uy * pull) / 2],
        b: [sample.b[0] + (ux * pull) / 2, sample.b[1] + (uy * pull) / 2],
      };
    });
    const wideSections = hasCapPolicy
      ? this._capWideSections(rawWideSections, caps)
      : rawWideSections;
    const wideAnalysis = analyzeRailPairColumn(
      rawWideSections.map((section) => ({ a: section.a, b: section.b })),
      { sharpTurnThresholdDeg: this.satinCornerAngle },
    );
    if (!reporter && this._tryEmitWideSplit(wideSections, wideAnalysis, 'satinbetween')) {
      const localEnd =
        this.satinSide > 0 ? localRailA[localRailA.length - 1] : localRailB[localRailB.length - 1];
      this.x = localEnd[0];
      this.y = localEnd[1];
      return;
    }
    if (
      reporter &&
      this.satinWide === 'split' &&
      Math.max(...wideAnalysis.samples.map((sample) => sample.realizedWidthMM)) >
        this.satinMaxWidth + 1e-9
    )
      this._wideSplitWarning(
        'satinbetween',
        'reporter-defined insets and rake make the split topology ambiguous',
      );

    const topping: {
      x: number;
      y: number;
      side: number;
      sample: RailPairSample;
      arc: number;
      centerX: number;
      centerY: number;
      widthMM: number;
    }[] = [];
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
      const move = safeInset - pullAt(sample) / 2;
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
          const factor = hasCapPolicy
            ? this._satinCapFactor(
                caps,
                Math.min(arc, geometry.spineLength),
                geometry.spineLength,
                this._railWidth(sample) + pullAt(sample),
              )
            : 1;
          topping.push({
            x: hasCapPolicy ? sample.mid[0] + (point.x - sample.mid[0]) * factor : point.x,
            y: hasCapPolicy ? sample.mid[1] + (point.y - sample.mid[1]) * factor : point.y,
            side,
            sample,
            arc: Math.min(arc, geometry.spineLength),
            centerX: sample.mid[0],
            centerY: sample.mid[1],
            widthMM: (this._railWidth(sample) + pullAt(sample)) * factor,
          });
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
        const factor = hasCapPolicy
          ? this._satinCapFactor(
              caps,
              arc,
              geometry.spineLength,
              this._railWidth(sample) + pullAt(sample),
            )
          : 1;
        topping.push({
          x: hasCapPolicy ? sample.mid[0] + (point.x - sample.mid[0]) * factor : point.x,
          y: hasCapPolicy ? sample.mid[1] + (point.y - sample.mid[1]) * factor : point.y,
          side,
          sample,
          arc,
          centerX: sample.mid[0],
          centerY: sample.mid[1],
          widthMM: (this._railWidth(sample) + pullAt(sample)) * factor,
        });
      }
    }
    if (hasCapPolicy && (caps.end === 'point' || caps.end === 'round')) {
      const sample = geometry.samples[geometry.samples.length - 1];
      const last = topping[topping.length - 1];
      if (!last || Math.hypot(last.x - sample.mid[0], last.y - sample.mid[1]) >= 1e-9) {
        side = -side;
        topping.push({
          x: sample.mid[0],
          y: sample.mid[1],
          side,
          sample,
          arc: geometry.spineLength,
          centerX: sample.mid[0],
          centerY: sample.mid[1],
          widthMM: 0,
        });
      }
    }
    this.satinSide = side;

    this._shortenRailPairCrowding(topping);
    const effectiveAnalysis = pullTensor ? wideAnalysis : analysis;
    const joinedTopping = this._applySatinCornerStrategy(
      topping,
      effectiveAnalysis,
      'satinbetween',
    );
    this._warnRailPairCrossings(geometry, chargeOps);
    this._warnRailPairCurvature(effectiveAnalysis);
    this._emitRailPairColumn(geometry, joinedTopping, caps, pullTensor);

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
    topping: { x: number; y: number; side: number; sample: RailPairSample; arc: number }[],
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

  _warnRailPairCurvature(analysis: AnalyzedColumn) {
    const issue = legacyRailWidthIssue(analysis);
    if (!issue) return;
    const point = issue.rail === 'a' ? issue.sample.railA : issue.sample.railB;
    if (!point) return;
    this.warnings.push(
      `satinbetween column is wider than the curve it follows near (${point[0].toFixed(1)}, ${point[1].toFixed(1)}) — split the column or widen the curve`,
    );
  }

  _emitRailPairColumn(
    geometry: RailPairGeometry,
    topping: { x: number; y: number; side: number; sample: RailPairSample; arc: number }[],
    caps: ResolvedSatinCaps,
    pullTensor: CompensationTensor | null,
  ) {
    const start = geometry.samples[0].mid;
    const from = this.lastEmit ?? { x: 0, y: 0 };
    if (Math.hypot(start[0] - from.x, start[1] - from.y) > 0.05)
      this._push('jump', start[0], start[1]);
    if (!this.started) {
      this.started = true;
      this._push('stitch', start[0], start[1]);
    }
    this._railPairUnderlay(geometry, caps, pullTensor);

    if (caps.start === 'point' || caps.start === 'round')
      this._pushCappedTopping(start[0], start[1]);

    let previous = this.lastEmit;
    let tipNoted = false;
    let ceilingWarned = false;
    let snagWarned = false;
    for (const point of topping) {
      const d = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
      if (d > 8 && !snagWarned) {
        const index = this.warnings.length;
        this.warnings.push(
          `satinbetween: a realized stitch spans ${d.toFixed(1)} mm — stitches over ~8 mm tend to snag`,
        );
        this.constructionWarningLocations.push({
          index,
          points: previous
            ? [
                { x: previous.x, y: previous.y },
                { x: point.x, y: point.y },
              ]
            : [{ x: point.x, y: point.y }],
          lines: this.currentLine === undefined ? [] : [this.currentLine],
          kind: 'satin',
        });
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
      if (caps.start === 'legacy' && caps.end === 'legacy') {
        this._push('stitch', point.x, point.y);
        previous = point;
      } else if (this._pushCappedTopping(point.x, point.y)) previous = point;
    }
  }

  _railPairUnderlay(
    geometry: RailPairGeometry,
    caps: ResolvedSatinCaps,
    pullTensor: CompensationTensor | null,
  ) {
    const pullAt = (sample: RailPairSample) =>
      this._satinPullForHeading(sample.heading, pullTensor);
    const width = pullTensor
      ? geometry.samples.reduce(
          (sum, sample) => sum + this._railWidth(sample) + pullAt(sample),
          0,
        ) / geometry.samples.length
      : geometry.meanWidth + this.pullComp;
    const profile = this._resolveSatinUnderlay(width, 'rail-pair');
    if (!profile.passes.length) return;
    this._warnCollapsedEdgeInset(
      profile,
      Math.min(...geometry.samples.map((sample) => this._railWidth(sample) + pullAt(sample))),
      'the narrowest satinbetween section',
    );
    const runningLengths = profile.passes.flatMap((pass) =>
      pass.kind === 'zigzag'
        ? pass.returnRun === 'reverse-center'
          ? [pass.returnRunStitchLengthMM]
          : []
        : [pass.runningStitchLengthMM],
    );
    const uLen = runningLengths.length ? Math.min(...runningLengths) : 2.5;
    const startArc = satinCapUnderlayInset(caps.start, caps.startLengthMM);
    const endArc = geometry.spineLength - satinCapUnderlayInset(caps.end, caps.endLengthMM);
    if (endArc - startArc < LIMITS.minStitch) return;
    const underlayLength = endArc - startArc;
    const underlaySteps = Math.max(1, Math.ceil(underlayLength / uLen));
    const underlaySamples: RailPairSample[] = [];
    for (let i = 0; i <= underlaySteps; i++)
      underlaySamples.push(geometry.atArc(startArc + (underlayLength * i) / underlaySteps));
    const spine = underlaySamples.map(({ mid }) => ({ x: mid[0], y: mid[1] }));
    const reverseSpine = spine.slice().reverse();
    const runCenter = () => {
      this._runAlong(spine, uLen, true);
      this._runAlong(reverseSpine, uLen, true);
    };
    for (const pass of profile.passes) {
      if (pass.kind === 'center') {
        runCenter();
      } else if (pass.kind === 'edge') {
        const left = underlaySamples.map((sample) => {
          const railWidth = this._railWidth(sample);
          const pull = pullAt(sample);
          const f =
            pass.inset.unit === 'mm'
              ? railWidth > 1e-9
                ? (Math.min(pass.inset.value, (railWidth + pull) / 2) - pull / 2) / railWidth
                : 0.5
              : railWidth < 1
                ? 0
                : pass.inset.value;
          return {
            x: sample.a[0] + (sample.b[0] - sample.a[0]) * f,
            y: sample.a[1] + (sample.b[1] - sample.a[1]) * f,
          };
        });
        const right = underlaySamples.map((sample) => {
          const railWidth = this._railWidth(sample);
          const pull = pullAt(sample);
          const f =
            pass.inset.unit === 'mm'
              ? railWidth > 1e-9
                ? (Math.min(pass.inset.value, (railWidth + pull) / 2) - pull / 2) / railWidth
                : 0.5
              : railWidth < 1
                ? 0
                : pass.inset.value;
          return {
            x: sample.b[0] + (sample.a[0] - sample.b[0]) * f,
            y: sample.b[1] + (sample.a[1] - sample.b[1]) * f,
          };
        });
        this._runAlong(left, pass.runningStitchLengthMM, true);
        this._runAlong(right.reverse(), pass.runningStitchLengthMM, true);
      } else {
        const steps = Math.max(1, Math.ceil(underlayLength / pass.spacingMM));
        const zigzag: { x: number; y: number }[] = [];
        for (let i = 0; i <= steps; i++) {
          const sample = geometry.atArc(startArc + (underlayLength * i) / steps);
          const edge = i % 2 === 0 ? sample.a : sample.b;
          const railWidth = this._railWidth(sample);
          const pull = pullAt(sample);
          const widthRatio =
            (pullTensor || profile.source === 'custom') && railWidth > 1e-9
              ? pass.widthRatio * ((railWidth + pull) / railWidth)
              : pass.widthRatio;
          zigzag.push({
            x: sample.mid[0] + (edge[0] - sample.mid[0]) * widthRatio,
            y: sample.mid[1] + (edge[1] - sample.mid[1]) * widthRatio,
          });
        }
        for (const point of zigzag) {
          const previous = this.lastEmit;
          if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.1) continue;
          this._push('stitch', point.x, point.y, true);
        }
        if (pass.returnRun === 'reverse-center')
          this._runAlong(reverseSpine, pass.returnRunStitchLengthMM, true);
      }
    }
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
    else if (this.compensationMode === 'legacy' && isIdentity(this.satinCTM) && !this.satinHasWarp)
      this._flushSatinPlain(path);
    else this._flushSatinTransformed(path, this.satinCTM);
  }

  _flushSatinPlain(path: { x: number; y: number }[]) {
    const w = this.satinWidth + this.pullComp;
    const analysis = analyzeSpineColumn(
      path.map((point) => [point.x, point.y]),
      w,
    );
    const caps = this._resolveSatinCaps(analysis.lengthMM, w, w, analysis.closed, 'satin');
    const hasCapPolicy = caps.start !== 'legacy' || caps.end !== 'legacy';
    const centers = path.map((point) => [point.x, point.y] as Pt);
    const rawWideSections = this._spineWideSections(
      centers,
      path.map(() => w),
    );
    const wideSections = hasCapPolicy
      ? this._capWideSections(rawWideSections, caps)
      : rawWideSections;
    if (this._tryEmitWideSplit(wideSections, analysis, 'satin')) return;
    const underlayPath = hasCapPolicy ? this._trimLocalPathForCaps(path, caps) : path;
    const profile = this._resolveSatinUnderlay(w, 'spine');
    this._warnCollapsedEdgeInset(profile, w, 'the satin column');
    if (!this.started) {
      this.started = true;
      this._push('stitch', path[0].x, path[0].y);
    }
    const rev = underlayPath.slice().reverse();
    for (const pass of profile.passes) {
      if (pass.kind === 'center') {
        this._runAlong(underlayPath, pass.runningStitchLengthMM, true);
        this._runAlong(rev, pass.runningStitchLengthMM, true);
      } else if (pass.kind === 'edge') {
        const off = this._edgeCenterOffset(w, pass.inset);
        this._runAlong(this._offsetPath(underlayPath, off), pass.runningStitchLengthMM, true);
        this._runAlong(this._offsetPath(rev, off), pass.runningStitchLengthMM, true);
      } else {
        this._zigzagAlong(underlayPath, w * pass.widthRatio, pass.spacingMM, true, false);
        if (pass.returnRun === 'reverse-center')
          this._runAlong(rev, pass.returnRunStitchLengthMM, true);
      }
    }
    // The topping
    this._zigzagAlong(
      path,
      w,
      this.satinSpacing,
      false,
      this.shortStitch,
      hasCapPolicy ? caps : undefined,
    );
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

  _directionalEdgePathT(
    local: { x: number; y: number }[],
    ctm: Mat,
    designWidth: number,
    inset: SatinEdgeInset,
  ): { x: number; y: number }[] {
    const tensor = this._directionalSatinPullTensor();
    if (!tensor) return this._offsetPathT(local, ctm, this._edgeCenterOffset(designWidth, inset));
    const hoop = this._toHoop(local);
    return local.map((point, index) => {
      const previous = local[Math.max(0, index - 1)];
      const next = local[Math.min(local.length - 1, index + 1)];
      const hoopPrevious = hoop[Math.max(0, index - 1)];
      const hoopNext = hoop[Math.min(hoop.length - 1, index + 1)];
      const { ox, oy, scale } = this._perpVec(ctm, previous.x, previous.y, next.x, next.y);
      const pull = this._satinPullForVector(
        hoopNext.x - hoopPrevious.x,
        hoopNext.y - hoopPrevious.y,
        tensor,
      );
      const offset = this._edgeCenterOffset(designWidth * scale + pull, inset);
      const [x, y] = this._mapSatin(point.x, point.y);
      return { x: x + (ox / scale) * offset, y: y + (oy / scale) * offset };
    });
  }

  _zigzagAlongT(
    local: { x: number; y: number }[],
    designWidth: number,
    pull: number,
    spacing: number,
    u: boolean,
    shortStitch: boolean,
    caps?: ResolvedSatinCaps,
    directionalPullScale = 1,
  ) {
    if (local.length < 2) return;
    const pullTensor = this._directionalSatinPullTensor();
    const hoop = this._toHoop(local);
    const halfDesign = designWidth / 2;
    const realizedWidths = local.map((point, index) => {
      const previous = local[Math.max(0, index - 1)];
      const next = local[Math.min(local.length - 1, index + 1)];
      const a = index < local.length - 1 ? point : previous;
      const b = index < local.length - 1 ? next : point;
      const { scale } = this._perpVec(this.satinCTM, a.x, a.y, b.x, b.y);
      const hoopPrevious = hoop[Math.max(0, index - 1)];
      const hoopNext = hoop[Math.min(hoop.length - 1, index + 1)];
      const resolvedPull = pullTensor
        ? this._satinPullForVector(
            hoopNext.x - hoopPrevious.x,
            hoopNext.y - hoopPrevious.y,
            pullTensor,
          ) * directionalPullScale
        : pull;
      return designWidth * scale + resolvedPull;
    });
    const analysis = analyzeSpineColumn(
      hoop.map((point) => [point.x, point.y]),
      realizedWidths,
      { sharpTurnThresholdDeg: this.satinCornerAngle },
    );
    const analyzedByInput = new Map(analysis.samples.map((sample) => [sample.inputIndex, sample]));
    const cumulative = [0];
    for (let i = 1; i < hoop.length; i++)
      cumulative.push(
        cumulative[i - 1] + Math.hypot(hoop[i].x - hoop[i - 1].x, hoop[i].y - hoop[i - 1].y),
      );
    const totalLength = cumulative[cumulative.length - 1];
    if (caps && (caps.start === 'point' || caps.start === 'round'))
      this._pushCappedTopping(hoop[0].x, hoop[0].y);
    let prevUx: number | null = null,
      prevUy = 0;
    let innerCounter = 0;
    let warnedTight = false;
    const topping: SatinToppingPoint[] = [];
    const planCorners = !u && this.satinJoin !== 'legacy';
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
      const resolvedPull = pullTensor
        ? this._satinPullForVector(dxT, dyT, pullTensor) * directionalPullScale
        : pull;
      const halfBase = halfDesign * scale + resolvedPull / 2; // compensation is never scaled
      let innerSide = 0;
      let crowded = false;
      if (prevUx !== null) {
        const analyzed = analyzedByInput.get(i - 1);
        const cross = prevUx * uy - prevUy * ux;
        const dot = Math.max(-1, Math.min(1, prevUx * ux + prevUy * uy));
        const theta = Math.acos(dot);
        if (theta > 1e-3 && theta < 2.1) {
          const analyzedTheta = analyzed ? (analyzed.turnAngleDeg * Math.PI) / 180 : 0;
          const R =
            analyzed && Math.abs(analyzedTheta - theta) <= 1e-12
              ? analyzed.legacyCurvatureRadiusMM
              : len / theta;
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
        if (caps)
          h *= this._satinCapFactor(caps, cumulative[i - 1] + len * t, totalLength, halfBase * 2);
        const x = cx + dirx * h * this.satinSide;
        const y = cy + diry * h * this.satinSide;
        if (planCorners)
          topping.push({
            x,
            y,
            centerX: cx,
            centerY: cy,
            side: this.satinSide,
            arc: cumulative[i - 1] + len * t,
            widthMM: h * 2,
          });
        else if (caps) this._pushCappedTopping(x, y);
        else this._push('stitch', x, y, u);
      }
      prevUx = ux;
      prevUy = uy;
    }
    if (planCorners) {
      for (const point of this._applySatinCornerStrategy(topping, analysis, 'transformed satin')) {
        if (caps) this._pushCappedTopping(point.x, point.y);
        else this._push('stitch', point.x, point.y, false);
      }
    }
  }

  _flushSatinTransformed(local: { x: number; y: number }[], ctm: Mat) {
    const hoop0 = this._mapSatin(local[0].x, local[0].y);
    if (!this.started) {
      this.started = true;
      this._push('stitch', hoop0[0], hoop0[1]);
    }
    const pullTensor = this._directionalSatinPullTensor();
    // Representative width (average perpendicular scale) for underlay choice.
    let scaleSum = 0,
      scaleN = 0;
    for (let i = 1; i < local.length; i++) {
      const { scale } = this._perpVec(ctm, local[i - 1].x, local[i - 1].y, local[i].x, local[i].y);
      scaleSum += scale;
      scaleN++;
    }
    const avgScale = scaleN ? scaleSum / scaleN : 1;
    const hoopFull = this._toHoop(local);
    const realizedWidths = local.map((point, index) => {
      const previous = local[Math.max(0, index - 1)];
      const next = local[Math.min(local.length - 1, index + 1)];
      const a = index < local.length - 1 ? point : previous;
      const b = index < local.length - 1 ? next : point;
      const hoopPrevious = hoopFull[Math.max(0, index - 1)];
      const hoopNext = hoopFull[Math.min(hoopFull.length - 1, index + 1)];
      const pull = this._satinPullForVector(
        hoopNext.x - hoopPrevious.x,
        hoopNext.y - hoopPrevious.y,
        pullTensor,
      );
      return this.satinWidth * this._perpVec(ctm, a.x, a.y, b.x, b.y).scale + pull;
    });
    const w = pullTensor
      ? realizedWidths.reduce((sum, width) => sum + width, 0) / realizedWidths.length
      : this.satinWidth * avgScale + this.pullComp;
    const analysis = analyzeSpineColumn(
      hoopFull.map((point) => [point.x, point.y]),
      realizedWidths,
    );
    const caps = this._resolveSatinCaps(
      analysis.lengthMM,
      realizedWidths[0],
      realizedWidths[realizedWidths.length - 1],
      analysis.closed,
      'transformed satin',
    );
    const hasCapPolicy = caps.start !== 'legacy' || caps.end !== 'legacy';
    const directions = local.map((point, index) => {
      const previous = local[Math.max(0, index - 1)];
      const next = local[Math.min(local.length - 1, index + 1)];
      const a = index < local.length - 1 ? point : previous;
      const b = index < local.length - 1 ? next : point;
      const { ox, oy, scale } = this._perpVec(ctm, a.x, a.y, b.x, b.y);
      return [ox / scale, oy / scale] as Pt;
    });
    const rawWideSections = this._spineWideSections(
      hoopFull.map((point) => [point.x, point.y] as Pt),
      realizedWidths,
      directions,
    );
    const wideSections = hasCapPolicy
      ? this._capWideSections(rawWideSections, caps)
      : rawWideSections;
    if (this._tryEmitWideSplit(wideSections, analysis, 'transformed satin')) return;
    const underlayLocal = hasCapPolicy ? this._trimLocalPathForCaps(local, caps) : local;
    const profile = this._resolveSatinUnderlay(w, 'spine');
    this._warnCollapsedEdgeInset(profile, w, 'the transformed satin column');
    const hoop = this._toHoop(underlayLocal);
    const revLocal = underlayLocal.slice().reverse();
    const revHoop = hoop.slice().reverse();
    for (const pass of profile.passes) {
      if (pass.kind === 'center') {
        this._runAlong(hoop, pass.runningStitchLengthMM, true);
        this._runAlong(revHoop, pass.runningStitchLengthMM, true);
      } else if (pass.kind === 'edge') {
        const off = this._edgeCenterOffset(w, pass.inset);
        this._runAlong(
          pullTensor
            ? this._directionalEdgePathT(underlayLocal, ctm, this.satinWidth, pass.inset)
            : this._offsetPathT(underlayLocal, ctm, off),
          pass.runningStitchLengthMM,
          true,
        );
        this._runAlong(
          pullTensor
            ? this._directionalEdgePathT(revLocal, ctm, this.satinWidth, pass.inset)
            : this._offsetPathT(revLocal, ctm, off),
          pass.runningStitchLengthMM,
          true,
        );
      } else {
        this._zigzagAlongT(
          underlayLocal,
          this.satinWidth * pass.widthRatio,
          this.pullComp * pass.widthRatio,
          pass.spacingMM,
          true,
          false,
          undefined,
          pass.widthRatio,
        );
        if (pass.returnRun === 'reverse-center')
          this._runAlong(revHoop, pass.returnRunStitchLengthMM, true);
      }
    }
    // The topping
    this._zigzagAlongT(
      local,
      this.satinWidth,
      this.pullComp,
      this.satinSpacing,
      false,
      this.shortStitch,
      hasCapPolicy ? caps : undefined,
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
    const pullTensor = this._directionalSatinPullTensor();

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
        segment: seg,
        nx: -uy,
        ny: ux, // left normal (local)
        heading: ((Math.atan2(ux, uy) * 180) / Math.PI + 360) % 360,
      };
    };

    // Place one rail endpoint: anchor at the lagged arc-length, offset along the
    // (CTM-mapped) spine normal there by the half-width, signed by the rail.
    // Mirrors _zigzagAlongT exactly so the identity case is byte-identical.
    const place = (arcLen: number, halfW: number, side: number) => {
      const sp = resolve(arcLen);
      const [ovx, ovy] = linApply(this.satinCTM, sp.nx, sp.ny);
      const scale = Math.hypot(ovx, ovy) || 1;
      const [cx, cy] = this._mapSatin(sp.x, sp.y);
      const segmentStart = capSpine[sp.segment - 1];
      const segmentEnd = capSpine[sp.segment];
      const pull = this._satinPullForVector(
        segmentEnd[0] - segmentStart[0],
        segmentEnd[1] - segmentStart[1],
        pullTensor,
      );
      const h = halfW * scale + pull / 2; // compensation is never scaled
      return {
        x: cx + (ovx / scale) * h * side,
        y: cy + (ovy / scale) * h * side,
        pull,
      };
    };

    // Single walk: buffer the topping penetrations (so underlay can be emitted
    // first), tracking the max realized full width (for auto-underlay, §9) and
    // the longest realized chord (for the snag check on real geometry, §5.2).
    interface Pen {
      x: number;
      y: number;
      centerX: number;
      centerY: number;
      arc: number;
      capArc: number;
      realizedWidth: number;
      widthMM: number;
      side: number;
    }
    let topping: Pen[] = [];
    let maxFullW = 0;
    let maxChord = 0;
    let maxChordPoints: [{ x: number; y: number }, { x: number; y: number }] | undefined;
    let side = this.satinSide; // local copy of the alternating rail flag
    let cursor = 0; // arc-length consumed (pair base)
    let pair = 0; // 0-based pair index → reporter's `i`
    let advWarned = false;
    let prev: Pen | null = null;
    let guard = 0;
    const guardMax = this.effectiveLimits.maxStitches + 10;
    const capSpine = local.map((point) => this._mapSatin(point.x, point.y));
    const capCumulative = [0];
    for (let index = 1; index < capSpine.length; index++)
      capCumulative.push(
        capCumulative[index - 1] +
          Math.hypot(
            capSpine[index][0] - capSpine[index - 1][0],
            capSpine[index][1] - capSpine[index - 1][1],
          ),
      );
    const capLength = capCumulative[capCumulative.length - 1];

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
        const placed = place(stepPos + (left ? ll : rl), left ? lw : rw, side);
        const { x: hx, y: hy } = placed;
        const center = resolve(stepPos);
        const [centerX, centerY] = this._mapSatin(center.x, center.y);
        const capArc =
          capCumulative[center.segment - 1] +
          Math.hypot(
            centerX - capSpine[center.segment - 1][0],
            centerY - capSpine[center.segment - 1][1],
          );
        const segmentStart = local[center.segment - 1];
        const segmentEnd = local[center.segment];
        const widthScale = this._perpVec(
          this.satinCTM,
          segmentStart.x,
          segmentStart.y,
          segmentEnd.x,
          segmentEnd.y,
        ).scale;
        if (prev) {
          const d = Math.hypot(hx - prev.x, hy - prev.y);
          if (d > maxChord) {
            maxChord = d;
            maxChordPoints = [
              { x: prev.x, y: prev.y },
              { x: hx, y: hy },
            ];
          }
          if (d < LIMITS.minStitch * 0.5) {
            this._dropTiny(hx, hy);
            continue;
          }
        }
        const pen = {
          x: hx,
          y: hy,
          centerX,
          centerY,
          arc: capArc,
          capArc,
          realizedWidth: (lw + rw) * widthScale + placed.pull,
          widthMM: (lw + rw) * widthScale + placed.pull,
          side,
        };
        topping.push(pen);
        prev = pen;
      }
      cursor += adv * 2;
      pair++;
    }
    const startScale = this._perpVec(
      this.satinCTM,
      local[0].x,
      local[0].y,
      local[1].x,
      local[1].y,
    ).scale;
    const endScale = this._perpVec(
      this.satinCTM,
      local[n - 2].x,
      local[n - 2].y,
      local[n - 1].x,
      local[n - 1].y,
    ).scale;
    const startPull = this._satinPullForVector(
      capSpine[1][0] - capSpine[0][0],
      capSpine[1][1] - capSpine[0][1],
      pullTensor,
    );
    const endPull = this._satinPullForVector(
      capSpine[n - 1][0] - capSpine[n - 2][0],
      capSpine[n - 1][1] - capSpine[n - 2][1],
      pullTensor,
    );
    const startWidth = maxFullW * startScale + startPull;
    const endWidth = maxFullW * endScale + endPull;
    const widestProgrammable = Math.max(
      startWidth,
      endWidth,
      ...topping.map((point) => point.realizedWidth),
    );
    if (this.satinWide === 'split' && widestProgrammable > this.satinMaxWidth + 1e-9)
      this._wideSplitWarning(
        'programmable satin',
        'reporter-defined width and rake make the split topology ambiguous',
      );
    const mappedWidths = local.map((point, index) => {
      const previous = local[Math.max(0, index - 1)];
      const next = local[Math.min(local.length - 1, index + 1)];
      const a = index < local.length - 1 ? point : previous;
      const b = index < local.length - 1 ? next : point;
      const hoopPrevious = capSpine[Math.max(0, index - 1)];
      const hoopNext = capSpine[Math.min(capSpine.length - 1, index + 1)];
      return (
        maxFullW * this._perpVec(this.satinCTM, a.x, a.y, b.x, b.y).scale +
        this._satinPullForVector(
          hoopNext[0] - hoopPrevious[0],
          hoopNext[1] - hoopPrevious[1],
          pullTensor,
        )
      );
    });
    const mappedAnalysis = analyzeSpineColumn(
      capSpine,
      pullTensor ? mappedWidths : maxFullW + this.pullComp,
      {
        sharpTurnThresholdDeg: this.satinCornerAngle,
      },
    );
    const caps = this._resolveSatinCaps(
      capLength,
      startWidth,
      endWidth,
      mappedAnalysis.closed,
      'programmable satin',
    );
    const hasCapPolicy = caps.start !== 'legacy' || caps.end !== 'legacy';
    if (hasCapPolicy) {
      for (const pen of topping) {
        const factor = this._satinCapFactor(caps, pen.capArc, capLength, pen.realizedWidth);
        pen.x = pen.centerX + (pen.x - pen.centerX) * factor;
        pen.y = pen.centerY + (pen.y - pen.centerY) * factor;
      }
      if (caps.end === 'point' || caps.end === 'round') {
        const endpoint = resolve(L);
        const [x, y] = this._mapSatin(endpoint.x, endpoint.y);
        const last = topping[topping.length - 1];
        if (!last || Math.hypot(last.x - x, last.y - y) >= 1e-9) {
          side = -side;
          topping.push({
            x,
            y,
            centerX: x,
            centerY: y,
            arc: capLength,
            capArc: capLength,
            realizedWidth: endWidth,
            widthMM: endWidth,
            side,
          });
        }
      }
      maxChord = 0;
      maxChordPoints = undefined;
      for (let index = 1; index < topping.length; index++) {
        const chord = Math.hypot(
          topping[index].x - topping[index - 1].x,
          topping[index].y - topping[index - 1].y,
        );
        if (chord > maxChord) {
          maxChord = chord;
          maxChordPoints = [
            { x: topping[index - 1].x, y: topping[index - 1].y },
            { x: topping[index].x, y: topping[index].y },
          ];
        }
      }
    }
    if (this.satinJoin !== 'legacy') {
      topping = this._applySatinCornerStrategy(topping, mappedAnalysis, 'programmable satin');
      maxChord = 0;
      maxChordPoints = undefined;
      for (let index = 1; index < topping.length; index++) {
        const chord = Math.hypot(
          topping[index].x - topping[index - 1].x,
          topping[index].y - topping[index - 1].y,
        );
        if (chord > maxChord) {
          maxChord = chord;
          maxChordPoints = [
            { x: topping[index - 1].x, y: topping[index - 1].y },
            { x: topping[index].x, y: topping[index].y },
          ];
        }
      }
    }
    this.satinSide = side;

    // Curvature guard: a column wider than the arc it follows can't sew — let it
    // warn honestly on the realized representative width (§7.5), reusing the
    // built-in "wider than radius" phrasing.
    const representativeWidth = pullTensor ? Math.max(...mappedWidths) : maxFullW + this.pullComp;
    this._warnIfWiderThanRadius(local, representativeWidth / 2);

    // Snag: keys off the realized chord, which for a raked stitch is the
    // hypotenuse across width and longitudinal span — not leftw + rightw (§5.2).
    if (maxChord > 8) {
      const index = this.warnings.length;
      this.warnings.push(
        `satin @fn: a realized stitch spans ${maxChord.toFixed(1)} mm — stitches over ~8 mm tend to snag; reduce the rake or width`,
      );
      this.constructionWarningLocations.push({
        index,
        points: maxChordPoints ?? [],
        lines: this.currentLine === undefined ? [] : [this.currentLine],
        kind: 'satin',
      });
    }

    // Emit order: anchor, then underlay (chosen from the max realized width),
    // then the buffered topping — matching the built-in flush.
    if (!this.started) {
      this.started = true;
      const [hx, hy] = this._mapSatin(local[0].x, local[0].y);
      this._push('stitch', hx, hy);
    }
    this._programmableUnderlay(
      local,
      maxFullW,
      representativeWidth,
      hasCapPolicy ? caps : undefined,
    );
    if (hasCapPolicy && (caps.start === 'point' || caps.start === 'round')) {
      const start = resolve(0);
      const [x, y] = this._mapSatin(start.x, start.y);
      this._pushCappedTopping(x, y);
    }
    for (const p of topping) {
      if (hasCapPolicy) this._pushCappedTopping(p.x, p.y);
      else this._push('stitch', p.x, p.y, false);
    }
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
  _programmableUnderlay(
    local: { x: number; y: number }[],
    designWidth: number,
    realizedWidth: number,
    caps?: ResolvedSatinCaps,
  ) {
    const profile = this._resolveSatinUnderlay(realizedWidth, 'programmable');
    if (!profile.passes.length) return;
    this._warnCollapsedEdgeInset(profile, realizedWidth, 'the programmable satin column');
    const underlayLocal = caps ? this._trimLocalPathForCaps(local, caps) : local;
    const hoop = this._toHoop(underlayLocal);
    const revHoop = hoop.slice().reverse();
    const revLocal = underlayLocal.slice().reverse();
    for (const pass of profile.passes) {
      if (pass.kind === 'center') {
        this._runAlong(hoop, pass.runningStitchLengthMM, true);
        this._runAlong(revHoop, pass.runningStitchLengthMM, true);
      } else if (pass.kind === 'edge') {
        const off = this._edgeCenterOffset(realizedWidth, pass.inset);
        this._runAlong(
          this.compensationMode === 'directional'
            ? this._directionalEdgePathT(underlayLocal, this.satinCTM, designWidth, pass.inset)
            : this._offsetPathT(underlayLocal, this.satinCTM, off),
          pass.runningStitchLengthMM,
          true,
        );
        this._runAlong(
          this.compensationMode === 'directional'
            ? this._directionalEdgePathT(revLocal, this.satinCTM, designWidth, pass.inset)
            : this._offsetPathT(revLocal, this.satinCTM, off),
          pass.runningStitchLengthMM,
          true,
        );
      } else {
        const passDesignWidth =
          this.compensationMode === 'directional'
            ? designWidth
            : profile.source === 'custom'
              ? Math.max(0, realizedWidth - this.pullComp)
              : realizedWidth;
        this._zigzagAlongT(
          underlayLocal,
          passDesignWidth * pass.widthRatio,
          this.pullComp * pass.widthRatio,
          pass.spacingMM,
          true,
          false,
          undefined,
          pass.widthRatio,
        );
        if (pass.returnRun === 'reverse-center')
          this._runAlong(revHoop, pass.returnRunStitchLengthMM, true);
      }
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
