import type {
  DiagnosticBounds,
  DiagnosticGeometry,
  DiagnosticPoint,
  PhysicsPlaybackRange,
  StitchEvent,
} from '../../core/types.ts';

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

function boundsOf(points: readonly DiagnosticPoint[]): DiagnosticBounds | undefined {
  if (!points.length) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** Add reusable hit-test/label context without introducing presentation metadata. */
export function addDiagnosticGeometryContext(geometry: DiagnosticGeometry): DiagnosticGeometry {
  const points = geometryPoints(geometry);
  const bounds = geometry.bounds ?? boundsOf(points);
  const anchor =
    geometry.anchor ??
    (geometry.kind === 'cell'
      ? { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 }
      : bounds
        ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
        : undefined);
  return {
    ...geometry,
    ...(anchor ? { anchor } : {}),
    ...(bounds ? { bounds } : {}),
  };
}

function compactRanges(indices: readonly number[]): PhysicsPlaybackRange[] {
  const ordered = [...new Set(indices)].toSorted((a, b) => a - b);
  if (!ordered.length) return [];
  const ranges: PhysicsPlaybackRange[] = [];
  let start = ordered[0];
  let end = start;
  for (const index of ordered.slice(1)) {
    if (index === end + 1) end = index;
    else {
      ranges.push({ start, end });
      start = end = index;
    }
  }
  ranges.push({ start, end });
  return ranges;
}

/**
 * Translate analyzed event identities through lock insertion to the final
 * stitch/jump playback stream. Locks preserve the original event objects.
 */
export function playbackRangesForEventIndices(
  eventIndices: readonly number[],
  analysisEvents: readonly StitchEvent[],
  playbackEvents: readonly StitchEvent[],
): PhysicsPlaybackRange[] {
  const playbackIndex = new Map<StitchEvent, number>();
  let pointIndex = 0;
  for (const event of playbackEvents) {
    if (event.t !== 'stitch' && event.t !== 'jump') continue;
    playbackIndex.set(event, pointIndex++);
  }
  return compactRanges(
    eventIndices.flatMap((index) => {
      const mapped = playbackIndex.get(analysisEvents[index]);
      return mapped === undefined ? [] : [mapped];
    }),
  );
}

export function eventIndicesFor(
  events: readonly StitchEvent[],
  selected: readonly StitchEvent[],
): number[] {
  const indexByEvent = new Map(events.map((event, index) => [event, index]));
  return selected.flatMap((event) => {
    const index = indexByEvent.get(event);
    return index === undefined ? [] : [index];
  });
}
