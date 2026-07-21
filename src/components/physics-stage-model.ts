import type {
  DiagnosticBounds,
  DiagnosticGeometry,
  DiagnosticPoint,
  PhysicsDiagnostic,
  PhysicsDiagnosticCategory,
  PhysicsPlaybackRange,
  PreflightSeverity,
} from '../lib/engine.ts';

export type PhysicsOverlayPrimitive =
  | { kind: 'point'; point: DiagnosticPoint }
  | { kind: 'segment'; points: [DiagnosticPoint, DiagnosticPoint] }
  | { kind: 'polyline'; points: DiagnosticPoint[]; closed: boolean }
  | { kind: 'cell'; x: number; y: number; width: number; height: number }
  | { kind: 'region'; rings: DiagnosticPoint[][] };

export interface PhysicsOverlayFixture {
  diagnosticId: string;
  severity: PreflightSeverity;
  category: PhysicsDiagnosticCategory;
  primitives: PhysicsOverlayPrimitive[];
  bounds?: DiagnosticBounds;
  anchor?: DiagnosticPoint;
}

export interface PhysicsDiagnosticHit {
  diagnostic: PhysicsDiagnostic;
  distance: number;
}

export interface PhysicsPlaybackSpan extends PhysicsPlaybackRange {
  diagnosticId: string;
  severity: PreflightSeverity;
  category: PhysicsDiagnosticCategory;
}

function pointsBounds(points: readonly DiagnosticPoint[]): DiagnosticBounds | undefined {
  if (!points.length) return undefined;
  return points.reduce<DiagnosticBounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function geometryPoints(geometry: DiagnosticGeometry): DiagnosticPoint[] {
  switch (geometry.kind) {
    case 'points':
    case 'polyline':
      return geometry.points;
    case 'cell':
      return [
        { x: geometry.x, y: geometry.y },
        { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
      ];
    case 'region':
      return geometry.rings.flat();
  }
}

function primitiveForGeometry(geometry: DiagnosticGeometry): PhysicsOverlayPrimitive[] {
  switch (geometry.kind) {
    case 'points':
      return geometry.points.map((point) => ({ kind: 'point', point }));
    case 'polyline':
      return geometry.points.length === 2 && !geometry.closed
        ? [{ kind: 'segment', points: [geometry.points[0], geometry.points[1]] }]
        : [{ kind: 'polyline', points: geometry.points, closed: geometry.closed ?? false }];
    case 'cell':
      return [
        {
          kind: 'cell',
          x: geometry.x,
          y: geometry.y,
          width: geometry.width,
          height: geometry.height,
        },
      ];
    case 'region':
      return [{ kind: 'region', rings: geometry.rings }];
  }
}

/** Stable, presentation-neutral drawing fixture consumed by the canvas renderer and tests. */
export function buildPhysicsOverlayFixture(diagnostic: PhysicsDiagnostic): PhysicsOverlayFixture {
  const points = diagnostic.geometry.flatMap(geometryPoints);
  const bounds = pointsBounds(points);
  return {
    diagnosticId: diagnostic.id,
    severity: diagnostic.severity,
    category: diagnostic.category,
    primitives: diagnostic.geometry.flatMap(primitiveForGeometry),
    bounds,
    anchor: bounds
      ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
      : undefined,
  };
}

function pointSegmentDistance(
  point: DiagnosticPoint,
  start: DiagnosticPoint,
  end: DiagnosticPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
        );
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function polylineDistance(
  point: DiagnosticPoint,
  points: readonly DiagnosticPoint[],
  closed: boolean,
): number {
  if (!points.length) return Infinity;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);
  let distance = Infinity;
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index++) {
    distance = Math.min(
      distance,
      pointSegmentDistance(point, points[index], points[(index + 1) % points.length]),
    );
  }
  return distance;
}

function pointInRing(point: DiagnosticPoint, ring: readonly DiagnosticPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function primitiveDistance(point: DiagnosticPoint, primitive: PhysicsOverlayPrimitive): number {
  switch (primitive.kind) {
    case 'point':
      return Math.hypot(point.x - primitive.point.x, point.y - primitive.point.y);
    case 'segment':
      return pointSegmentDistance(point, primitive.points[0], primitive.points[1]);
    case 'polyline':
      if (primitive.closed && pointInRing(point, primitive.points)) return 0;
      return polylineDistance(point, primitive.points, primitive.closed);
    case 'cell': {
      const minX = Math.min(primitive.x, primitive.x + primitive.width);
      const maxX = Math.max(primitive.x, primitive.x + primitive.width);
      const minY = Math.min(primitive.y, primitive.y + primitive.height);
      const maxY = Math.max(primitive.y, primitive.y + primitive.height);
      const dx = Math.max(minX - point.x, 0, point.x - maxX);
      const dy = Math.max(minY - point.y, 0, point.y - maxY);
      return Math.hypot(dx, dy);
    }
    case 'region': {
      const inOuterRing = primitive.rings[0] ? pointInRing(point, primitive.rings[0]) : false;
      const inHole = primitive.rings.slice(1).some((ring) => pointInRing(point, ring));
      if (inOuterRing && !inHole) return 0;
      return Math.min(
        ...primitive.rings.map((ring) => polylineDistance(point, ring, true)),
        Infinity,
      );
    }
  }
}

const SEVERITY_ORDER: Record<PreflightSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Hit-test semantic geometry in hoop millimetres; all overlaps are retained for a chooser. */
export function hitTestPhysicsDiagnostics(
  diagnostics: readonly PhysicsDiagnostic[],
  point: DiagnosticPoint,
  toleranceMM: number,
): PhysicsDiagnosticHit[] {
  return diagnostics
    .flatMap((diagnostic): PhysicsDiagnosticHit[] => {
      const fixture = buildPhysicsOverlayFixture(diagnostic);
      const distance = Math.min(
        ...fixture.primitives.map((primitive) => primitiveDistance(point, primitive)),
        Infinity,
      );
      return distance <= toleranceMM ? [{ diagnostic, distance }] : [];
    })
    .toSorted(
      (a, b) =>
        a.distance - b.distance ||
        SEVERITY_ORDER[a.diagnostic.severity] - SEVERITY_ORDER[b.diagnostic.severity] ||
        a.diagnostic.id.localeCompare(b.diagnostic.id),
    );
}

/** Clamp and normalize exact zero-based inclusive playback ranges for rendering. */
export function physicsPlaybackSpans(
  diagnostics: readonly PhysicsDiagnostic[],
  total: number,
): PhysicsPlaybackSpan[] {
  if (total <= 0) return [];
  return diagnostics
    .flatMap((diagnostic) =>
      diagnostic.playbackRanges.flatMap(({ start, end }): PhysicsPlaybackSpan[] => {
        const normalizedStart = Math.max(0, Math.min(total - 1, Math.min(start, end)));
        const normalizedEnd = Math.max(0, Math.min(total - 1, Math.max(start, end)));
        return [
          {
            diagnosticId: diagnostic.id,
            severity: diagnostic.severity,
            category: diagnostic.category,
            start: normalizedStart,
            end: normalizedEnd,
          },
        ];
      }),
    )
    .toSorted(
      (a, b) => a.start - b.start || a.end - b.end || a.diagnosticId.localeCompare(b.diagnosticId),
    );
}
