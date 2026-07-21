import type {
  DiagnosticGeometry,
  DiagnosticPoint,
  PhysicsDiagnostic,
  PhysicsMeasurement,
  PhysicsSourceLocation,
} from '../../core/types.ts';

export type PhysicsDiagnosticIdentityInput = Pick<
  PhysicsDiagnostic,
  'code' | 'constructionIds' | 'geometry' | 'sourceLocations'
>;

type PhysicsDiagnosticDraft = Omit<PhysicsDiagnostic, 'id' | 'fingerprint'>;

const quantizeMM = (value: number): number => {
  if (!Number.isFinite(value))
    throw new RangeError('Diagnostic geometry coordinates must be finite.');
  const quantized = Math.round(value * 100);
  return Object.is(quantized, -0) ? 0 : quantized;
};

const pointKey = ({ x, y }: DiagnosticPoint): string => `${quantizeMM(x)},${quantizeMM(y)}`;

function canonicalRing(points: readonly DiagnosticPoint[]): string {
  if (!points.length) return '';
  const values = points.map(pointKey);
  if (values.length > 1 && values[0] === values.at(-1)) values.pop();
  const variants: string[] = [];
  for (const ordered of [values, values.toReversed()])
    for (let offset = 0; offset < ordered.length; offset++)
      variants.push([...ordered.slice(offset), ...ordered.slice(0, offset)].join(';'));
  return variants.toSorted()[0] ?? '';
}

function commonGeometryKey(geometry: DiagnosticGeometry): string {
  const anchor = geometry.anchor ? pointKey(geometry.anchor) : '';
  const bounds = geometry.bounds
    ? [
        quantizeMM(geometry.bounds.minX),
        quantizeMM(geometry.bounds.minY),
        quantizeMM(geometry.bounds.maxX),
        quantizeMM(geometry.bounds.maxY),
      ].join(',')
    : '';
  return `${geometry.role}|a:${anchor}|b:${bounds}`;
}

function geometryKey(geometry: DiagnosticGeometry): string {
  const common = commonGeometryKey(geometry);
  switch (geometry.kind) {
    case 'points':
      return `points|${common}|${geometry.points.map(pointKey).toSorted().join(';')}`;
    case 'polyline': {
      if (geometry.closed) return `polyline|${common}|closed|${canonicalRing(geometry.points)}`;
      const forward = geometry.points.map(pointKey).join(';');
      const reverse = geometry.points.toReversed().map(pointKey).join(';');
      return `polyline|${common}|open|${[forward, reverse].toSorted()[0]}`;
    }
    case 'cell':
      return `cell|${common}|${[
        quantizeMM(geometry.x),
        quantizeMM(geometry.y),
        quantizeMM(geometry.width),
        quantizeMM(geometry.height),
      ].join(',')}`;
    case 'region':
      return `region|${common}|${geometry.rings.map(canonicalRing).toSorted().join('|')}`;
  }
}

function sourceLocationKey(location: PhysicsSourceLocation): string {
  return [location.line, location.startColumn ?? '', location.endColumn ?? '', location.role].join(
    ':',
  );
}

function hashIdentity(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

/** Stable across copy/severity changes; semantic coordinates are quantized to 0.01 mm. */
export function buildPhysicsDiagnosticFingerprint(input: PhysicsDiagnosticIdentityInput): string {
  const canonical = [
    'physics-report-v1',
    input.code,
    `construction:${[...new Set(input.constructionIds ?? [])].toSorted((a, b) => a - b).join(',')}`,
    `source:${input.sourceLocations.map(sourceLocationKey).toSorted().join('|')}`,
    `geometry:${input.geometry.map(geometryKey).toSorted().join('|')}`,
  ].join('\n');
  return `physics-v1:${input.code}:${hashIdentity(canonical)}`;
}

function measurementKey(measurement: PhysicsMeasurement): string {
  return [
    measurement.label,
    measurement.value,
    measurement.unit,
    measurement.threshold ?? '',
    measurement.comparison ?? '',
  ].join(':');
}

function occurrenceKey(diagnostic: PhysicsDiagnosticDraft): string {
  return [
    diagnostic.measurements?.map(measurementKey).toSorted().join('|') ?? '',
    diagnostic.sourceLocations.map(sourceLocationKey).toSorted().join('|'),
    diagnostic.geometry.map(geometryKey).toSorted().join('|'),
    [...new Set(diagnostic.constructionIds ?? [])].toSorted((a, b) => a - b).join(','),
  ].join('\n');
}

/** Assign deterministic occurrence suffixes without changing detector ordering. */
export function assignPhysicsDiagnosticIdentities(
  drafts: readonly PhysicsDiagnosticDraft[],
): PhysicsDiagnostic[] {
  const fingerprinted = drafts.map((draft) => ({
    draft,
    fingerprint: buildPhysicsDiagnosticFingerprint(draft),
  }));
  const groups = new Map<string, number[]>();
  fingerprinted.forEach(({ fingerprint }, index) => {
    const group = groups.get(fingerprint);
    if (group) group.push(index);
    else groups.set(fingerprint, [index]);
  });
  const ids = new Map<number, string>();
  for (const [fingerprint, indices] of groups) {
    if (indices.length === 1) {
      ids.set(indices[0], fingerprint);
      continue;
    }
    const ordered = indices.toSorted((left, right) => {
      const leftKey = occurrenceKey(fingerprinted[left].draft);
      const rightKey = occurrenceKey(fingerprinted[right].draft);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    ordered.forEach((index, occurrence) => ids.set(index, `${fingerprint}:${occurrence + 1}`));
  }
  return fingerprinted.map(({ draft, fingerprint }, index) => ({
    ...draft,
    fingerprint,
    id: ids.get(index)!,
  }));
}
