import type {
  ConstructionEventRecord,
  ConstructionRecord,
  FillConstructionRecord,
  SatinConstructionRecord,
  SatinEnvelopeSection,
} from './construction-metadata.ts';
import { evenOddInside } from './machine/fill.ts';
import { segdist } from '../geometry/genmath.ts';
import type { PreflightIssue, StitchEvent } from '../core/types.ts';
import { preflightCatalogMetadata } from './physics-diagnostics/catalog.ts';

export const CONSTRUCTION_PREFLIGHT_THRESHOLDS = Object.freeze({
  boundaryToleranceMM: 0.05,
  borderAssociationDistanceMM: 0.75,
  minimumFillBorderOverlapMM: 0.4,
  maximumFillBorderOverlapMM: 1.25,
  splitHotspotRadiusMM: 0.3,
  splitHotspotPenetrations: 4,
  maximumRelationshipComparisons: 4096,
  maximumBoundarySamplesPerConstruction: 2048,
  maximumIssuesPerCheck: 3,
  maximumPointsPerIssue: 16,
});

const point = (value: readonly [number, number]) => ({ x: value[0], y: value[1] });

function linesOf(events: readonly ConstructionEventRecord[], fallback?: number): number[] {
  const lines = events
    .map(({ event }) => event.line)
    .filter((line): line is number => line !== undefined);
  if (fallback !== undefined) lines.push(fallback);
  return [...new Set(lines)];
}

function distanceToBoundary(
  rings: readonly (readonly (readonly [number, number])[])[],
  value: readonly [number, number],
): number {
  let distance = Infinity;
  for (const ring of rings)
    for (let index = 0; index < ring.length; index++)
      distance = Math.min(
        distance,
        segdist(
          [value[0], value[1]],
          [ring[index][0], ring[index][1]],
          [ring[(index + 1) % ring.length][0], ring[(index + 1) % ring.length][1]],
        ),
      );
  return distance;
}

function insideOrOnBoundary(
  rings: [number, number][][],
  value: readonly [number, number],
): boolean {
  return (
    evenOddInside(rings, value[0], value[1]) ||
    distanceToBoundary(rings, value) <= CONSTRUCTION_PREFLIGHT_THRESHOLDS.boundaryToleranceMM
  );
}

function satinEnvelope(record: SatinConstructionRecord): [number, number][][] {
  if (record.sections.length < 2) return [];
  return [
    [
      ...record.sections.map(({ a }) => [a[0], a[1]] as [number, number]),
      ...record.sections.toReversed().map(({ b }) => [b[0], b[1]] as [number, number]),
    ],
  ];
}

function underlayEnvelopeIssues(records: readonly ConstructionRecord[]): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  for (const record of records) {
    const region = record.kind === 'fill' ? record.region : satinEnvelope(record);
    if (!region.length) continue;
    const outside = record.events.filter(
      ({ event, layer }) =>
        layer === 'underlay' &&
        event.t === 'stitch' &&
        !insideOrOnBoundary(region, [event.x, event.y]),
    );
    if (!outside.length) continue;
    issues.push({
      ...preflightCatalogMetadata('construction.underlay-outside-topping'),
      code: 'construction.underlay-outside-topping',
      message: `Construction ${record.id} has underlay protruding beyond its explicit topping envelope.`,
      points: outside
        .slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumPointsPerIssue)
        .map(({ event }) => ({ x: event.x, y: event.y })),
      lines: linesOf(outside, record.line),
      constructionIds: [record.id],
    });
    if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) break;
  }
  return issues;
}

interface BorderSample {
  section: SatinEnvelopeSection;
  overlapMM: number;
  location: readonly [number, number];
}

function relatedBorderSamples(
  fill: FillConstructionRecord,
  satin: SatinConstructionRecord,
): BorderSample[] {
  const samples: BorderSample[] = [];
  for (const section of satin.sections.slice(
    0,
    CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumBoundarySamplesPerConstruction,
  )) {
    const center: [number, number] = [
      (section.a[0] + section.b[0]) / 2,
      (section.a[1] + section.b[1]) / 2,
    ];
    if (
      distanceToBoundary(fill.authoredRegion, center) >
      CONSTRUCTION_PREFLIGHT_THRESHOLDS.borderAssociationDistanceMM
    )
      continue;
    const candidates = [section.a, section.b].map((rail) => {
      const distance = distanceToBoundary(fill.region, rail);
      return {
        rail,
        signedDistance: insideOrOnBoundary(fill.region, rail) ? distance : -distance,
      };
    });
    const insideRail =
      candidates[0].signedDistance >= candidates[1].signedDistance ? candidates[0] : candidates[1];
    samples.push({
      section,
      overlapMM: insideRail.signedDistance,
      location: insideRail.rail,
    });
  }
  return samples;
}

function fillBorderIssues(records: readonly ConstructionRecord[]): PreflightIssue[] {
  const fills = records.filter(
    (record): record is FillConstructionRecord => record.kind === 'fill',
  );
  const satins = records.filter(
    (record): record is SatinConstructionRecord => record.kind === 'satin',
  );
  const issues: PreflightIssue[] = [];
  let comparisons = 0;
  for (const fill of fills) {
    for (const satin of satins) {
      if (comparisons++ >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumRelationshipComparisons)
        return issues;
      const samples = relatedBorderSamples(fill, satin);
      if (samples.length < 2) continue;
      const ordered = samples.toSorted((a, b) => a.overlapMM - b.overlapMM);
      const representative = ordered[Math.floor(ordered.length / 2)];
      const ids = [fill.id, satin.id];
      const lines = [
        ...new Set([fill.line, satin.line].filter((line): line is number => line !== undefined)),
      ];
      if (representative.overlapMM < CONSTRUCTION_PREFLIGHT_THRESHOLDS.minimumFillBorderOverlapMM) {
        issues.push({
          ...preflightCatalogMetadata('fill.border-overlap-too-small'),
          code: 'fill.border-overlap-too-small',
          message: `Fill ${fill.id} and satin border ${satin.id} overlap by about ${Math.max(0, representative.overlapMM).toFixed(2)} mm, below the ${CONSTRUCTION_PREFLIGHT_THRESHOLDS.minimumFillBorderOverlapMM.toFixed(1)} mm construction minimum.`,
          points: [point(representative.location)],
          lines,
          constructionIds: ids,
        });
      } else if (
        representative.overlapMM > CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumFillBorderOverlapMM
      ) {
        issues.push({
          ...preflightCatalogMetadata('fill.border-overlap-dense'),
          code: 'fill.border-overlap-dense',
          message: `Fill ${fill.id} extends about ${representative.overlapMM.toFixed(2)} mm beneath satin border ${satin.id}, above the ${CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumFillBorderOverlapMM.toFixed(1)} mm dense-overlap threshold.`,
          points: [point(representative.location)],
          lines,
          constructionIds: ids,
        });
      }

      const envelope = satinEnvelope(satin);
      const stacked = fill.events.find(
        ({ event, layer }) =>
          layer === 'edge-run' &&
          event.t === 'stitch' &&
          envelope.length > 0 &&
          insideOrOnBoundary(envelope, [event.x, event.y]),
      );
      if (stacked) {
        issues.push({
          ...preflightCatalogMetadata('fill.edge-run-border-stack'),
          code: 'fill.edge-run-border-stack',
          message: `Fill ${fill.id} edge run is stacked beneath explicit satin border ${satin.id}.`,
          points: [{ x: stacked.event.x, y: stacked.event.y }],
          lines: linesOf([stacked], fill.line).concat(
            satin.line === undefined || linesOf([stacked], fill.line).includes(satin.line)
              ? []
              : [satin.line],
          ),
          constructionIds: ids,
        });
      }
      if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck * 2)
        return issues;
    }
  }
  return issues;
}

function splitOverlapIssues(records: readonly ConstructionRecord[]): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  for (const record of records) {
    if (record.kind !== 'satin' || !(record.splitColumnCount && record.splitColumnCount > 1))
      continue;
    const topping = record.events.filter(
      ({ event, layer, lane }) => layer === 'topping' && event.t === 'stitch' && lane !== undefined,
    );
    const radius = CONSTRUCTION_PREFLIGHT_THRESHOLDS.splitHotspotRadiusMM;
    const buckets = new Map<string, ConstructionEventRecord[]>();
    const key = (x: number, y: number) => `${Math.floor(x / radius)},${Math.floor(y / radius)}`;
    let hotspot: ConstructionEventRecord[] | undefined;
    for (const candidate of topping) {
      const ix = Math.floor(candidate.event.x / radius);
      const iy = Math.floor(candidate.event.y / radius);
      const cluster = [candidate];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const other of buckets.get(`${ix + dx},${iy + dy}`) ?? [])
            if (
              Math.hypot(other.event.x - candidate.event.x, other.event.y - candidate.event.y) <=
              radius
            )
              cluster.push(other);
      if (
        cluster.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.splitHotspotPenetrations &&
        new Set(cluster.map(({ lane }) => lane)).size > 1
      ) {
        hotspot = cluster;
        break;
      }
      const bucketKey = key(candidate.event.x, candidate.event.y);
      const bucket = buckets.get(bucketKey);
      if (bucket) bucket.push(candidate);
      else buckets.set(bucketKey, [candidate]);
    }
    if (!hotspot) continue;
    issues.push({
      ...preflightCatalogMetadata('satin.split-overlap-hotspot'),
      code: 'satin.split-overlap-hotspot',
      message: `Split satin construction ${record.id} has ${hotspot.length} adjacent-lane penetrations within ${CONSTRUCTION_PREFLIGHT_THRESHOLDS.splitHotspotRadiusMM.toFixed(1)} mm.`,
      points: hotspot
        .slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumPointsPerIssue)
        .map(({ event }) => ({ x: event.x, y: event.y })),
      lines: linesOf(hotspot, record.line),
      constructionIds: [record.id],
    });
    if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) break;
  }
  return issues;
}

function connectorIssues(records: readonly ConstructionRecord[]): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  for (const record of records) {
    if (record.kind !== 'fill') continue;
    for (const connector of record.connectors) {
      const samples = Math.max(2, Math.ceil(connector.distanceMM / 0.5));
      const contained = Array.from({ length: samples + 1 }, (_, index) => index / samples).every(
        (fraction) =>
          insideOrOnBoundary(record.region, [
            connector.from[0] + (connector.to[0] - connector.from[0]) * fraction,
            connector.from[1] + (connector.to[1] - connector.from[1]) * fraction,
          ]),
      );
      if (connector.action !== 'sew' || contained) continue;
      issues.push({
        ...preflightCatalogMetadata('fill.connector-outside-region'),
        code: 'fill.connector-outside-region',
        message: `Fill ${record.id} has a sewn connector outside its explicit construction region.`,
        points: [point(connector.from), point(connector.to)],
        lines:
          connector.line === undefined
            ? record.line === undefined
              ? []
              : [record.line]
            : [connector.line],
        constructionIds: [record.id],
      });
      if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) return issues;
    }
  }
  return issues;
}

function orderIssues(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
): PreflightIssue[] {
  const indices = new Map(finalEvents.map((event, index) => [event, index]));
  const issues: PreflightIssue[] = [];
  for (const record of records) {
    const lanes = new Set(record.events.map(({ lane }) => lane ?? -1));
    for (const lane of lanes) {
      const inLane = record.events.filter(({ lane: eventLane }) => (eventLane ?? -1) === lane);
      const underlay = inLane.filter(
        ({ event, layer }) => layer === 'underlay' && indices.has(event),
      );
      const decorative = inLane.filter(
        ({ event, layer }) => (layer === 'topping' || layer === 'edge-run') && indices.has(event),
      );
      if (!underlay.length || !decorative.length) continue;
      const lastUnderlay = underlay.reduce((latest, entry) =>
        (indices.get(entry.event) ?? -1) > (indices.get(latest.event) ?? -1) ? entry : latest,
      );
      const firstDecorative = decorative.reduce((earliest, entry) =>
        (indices.get(entry.event) ?? Infinity) < (indices.get(earliest.event) ?? Infinity)
          ? entry
          : earliest,
      );
      if (
        (indices.get(firstDecorative.event) ?? Infinity) > (indices.get(lastUnderlay.event) ?? -1)
      )
        continue;
      issues.push({
        ...preflightCatalogMetadata('construction.layer-order'),
        code: 'construction.layer-order',
        message: `Construction ${record.id}${lane < 0 ? '' : ` lane ${lane + 1}`} is planned with topping before its underlay.`,
        points: [
          { x: firstDecorative.event.x, y: firstDecorative.event.y },
          { x: lastUnderlay.event.x, y: lastUnderlay.event.y },
        ],
        lines: linesOf([firstDecorative, lastUnderlay], record.line),
        constructionIds: [record.id],
      });
      if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) return issues;
    }
  }
  return issues;
}

/** Pure, fixed-order analysis over explicit construction sidecars only. */
export function analyzeConstructionPreflight(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
): PreflightIssue[] {
  if (!records.length) return [];
  const counts = new Map<string, number>();
  return [
    ...underlayEnvelopeIssues(records),
    ...fillBorderIssues(records),
    ...splitOverlapIssues(records),
    ...connectorIssues(records),
    ...orderIssues(records, finalEvents),
  ].filter((issue) => {
    const count = counts.get(issue.code) ?? 0;
    if (count >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) return false;
    counts.set(issue.code, count + 1);
    return true;
  });
}
