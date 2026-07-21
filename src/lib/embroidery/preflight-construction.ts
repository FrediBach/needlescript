import type {
  ConstructionEventRecord,
  ConstructionRecord,
  FillConstructionRecord,
  SatinConstructionRecord,
  SatinEnvelopeSection,
} from './construction-metadata.ts';
import { evenOddInside } from './machine/fill.ts';
import { segdist } from '../geometry/genmath.ts';
import type {
  DirectionalCompensationPreview,
  MaterialIntent,
  PreflightIssue,
  ResolvedMachineProfile,
  StitchEvent,
} from '../core/types.ts';
import { eventSourceLine } from '../core/source-trace.ts';
import { preflightCatalogMetadata } from './physics-diagnostics/catalog.ts';
import { eventIndicesFor } from './physics-diagnostics/attribution.ts';

export const CONSTRUCTION_PREFLIGHT_THRESHOLDS = Object.freeze({
  boundaryToleranceMM: 0.05,
  borderAssociationDistanceMM: 0.75,
  minimumFillBorderOverlapMM: 0.4,
  maximumFillBorderOverlapMM: 1.25,
  splitHotspotRadiusMM: 0.3,
  splitHotspotPenetrations: 4,
  maximumRelationshipComparisons: 4096,
  maximumBoundarySamplesPerConstruction: 2048,
  wideSatinUnderlayWidthMM: 4,
  largeFillUnderlayAreaMM2: 100,
  maximumConstructionsPerExpansionCheck: 64,
  maximumCoverageSamplesPerConstruction: 512,
  maximumCoverageSegmentsPerConstruction: 1024,
  coverageGapRatio: 0.2,
  maximumShortSegmentsPerConstruction: 8192,
  minimumSegmentsForShortRatio: 12,
  maximumShortStitchRatio: 0.25,
  shortStitchMultiplier: 1.5,
  directionalStretchDelta: 0.1,
  directionalCompensationDeltaMM: 0.05,
  maximumIssuesPerCheck: 3,
  maximumPointsPerIssue: 16,
});

export interface ConstructionPreflightContext {
  profile?: ResolvedMachineProfile;
  material?: MaterialIntent;
  compensation?: DirectionalCompensationPreview;
}

const point = (value: readonly [number, number]) => ({ x: value[0], y: value[1] });

const regionGeometry = (rings: readonly (readonly (readonly [number, number])[])[]) => ({
  kind: 'region' as const,
  role: 'boundary' as const,
  rings: rings.map((ring) => ring.map(point)),
});

function sourceLocations(
  primary: number | undefined,
  contributors: readonly (number | undefined)[] = [],
  related: readonly (number | undefined)[] = [],
) {
  const resolvedPrimary =
    primary ??
    contributors.find((line) => line !== undefined) ??
    related.find((line) => line !== undefined);
  const seen = new Set(resolvedPrimary === undefined ? [] : [resolvedPrimary]);
  return [
    ...(resolvedPrimary === undefined ? [] : [{ line: resolvedPrimary, role: 'primary' as const }]),
    ...contributors.flatMap((line) => {
      if (line === undefined || seen.has(line)) return [];
      seen.add(line);
      return [{ line, role: 'contributor' as const }];
    }),
    ...related.flatMap((line) => {
      if (line === undefined || seen.has(line)) return [];
      seen.add(line);
      return [{ line, role: 'related' as const }];
    }),
  ];
}

function linesOf(events: readonly ConstructionEventRecord[], fallback?: number): number[] {
  const lines = events
    .map(({ event }) => eventSourceLine(event))
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

function underlayEnvelopeIssues(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
): PreflightIssue[] {
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
      sourceLocations: sourceLocations(
        record.line,
        outside.map(({ event }) => eventSourceLine(event)),
      ),
      geometry: [
        regionGeometry(region),
        {
          kind: 'points',
          role: 'overlap',
          points: outside
            .slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumPointsPerIssue)
            .map(({ event }) => ({ x: event.x, y: event.y })),
        },
      ],
      eventIndices: eventIndicesFor(
        finalEvents,
        outside.map(({ event }) => event),
      ),
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

function fillBorderIssues(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
): PreflightIssue[] {
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
      const overlapGeometry = [
        regionGeometry(fill.region),
        regionGeometry(satinEnvelope(satin)),
        {
          kind: 'polyline' as const,
          role: 'overlap' as const,
          points: [point(representative.section.a), point(representative.section.b)],
        },
      ];
      const nearbyEvents: StitchEvent[] = [];
      for (const { event } of [...fill.events, ...satin.events])
        if (
          Math.hypot(event.x - representative.location[0], event.y - representative.location[1]) <=
          CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumFillBorderOverlapMM + 0.5
        )
          nearbyEvents.push(event);
      if (representative.overlapMM < CONSTRUCTION_PREFLIGHT_THRESHOLDS.minimumFillBorderOverlapMM) {
        issues.push({
          ...preflightCatalogMetadata('fill.border-overlap-too-small'),
          code: 'fill.border-overlap-too-small',
          message: `Fill ${fill.id} and satin border ${satin.id} overlap by about ${Math.max(0, representative.overlapMM).toFixed(2)} mm, below the ${CONSTRUCTION_PREFLIGHT_THRESHOLDS.minimumFillBorderOverlapMM.toFixed(1)} mm construction minimum.`,
          points: [point(representative.location)],
          lines,
          sourceLocations: sourceLocations(fill.line, [], [satin.line]),
          geometry: overlapGeometry,
          eventIndices: eventIndicesFor(finalEvents, nearbyEvents),
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
          sourceLocations: sourceLocations(fill.line, [], [satin.line]),
          geometry: overlapGeometry,
          eventIndices: eventIndicesFor(finalEvents, nearbyEvents),
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
        const stackedLines = linesOf([stacked], fill.line);
        const stackedLineSet = new Set(stackedLines);
        issues.push({
          ...preflightCatalogMetadata('fill.edge-run-border-stack'),
          code: 'fill.edge-run-border-stack',
          message: `Fill ${fill.id} edge run is stacked beneath explicit satin border ${satin.id}.`,
          points: [{ x: stacked.event.x, y: stacked.event.y }],
          lines: stackedLines.concat(
            satin.line === undefined || stackedLineSet.has(satin.line) ? [] : [satin.line],
          ),
          sourceLocations: sourceLocations(
            fill.line,
            [eventSourceLine(stacked.event)],
            [satin.line],
          ),
          geometry: [
            regionGeometry(fill.region),
            regionGeometry(envelope),
            {
              kind: 'points',
              role: 'overlap',
              points: [{ x: stacked.event.x, y: stacked.event.y }],
            },
          ],
          eventIndices: eventIndicesFor(finalEvents, [stacked.event]),
          constructionIds: ids,
        });
      }
      if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck * 2)
        return issues;
    }
  }
  return issues;
}

function splitOverlapIssues(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
): PreflightIssue[] {
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
      const { x, y } = candidate.event;
      const ix = Math.floor(x / radius);
      const iy = Math.floor(y / radius);
      const cluster = [candidate];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const other of buckets.get(`${ix + dx},${iy + dy}`) ?? [])
            if (Math.hypot(other.event.x - x, other.event.y - y) <= radius) cluster.push(other);
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
      sourceLocations: sourceLocations(
        record.line,
        hotspot.map(({ event }) => eventSourceLine(event)),
      ),
      geometry: [
        regionGeometry(satinEnvelope(record)),
        {
          kind: 'points',
          role: 'overlap',
          points: hotspot
            .slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumPointsPerIssue)
            .map(({ event }) => ({ x: event.x, y: event.y })),
        },
      ],
      eventIndices: eventIndicesFor(
        finalEvents,
        hotspot.map(({ event }) => event),
      ),
      constructionIds: [record.id],
    });
    if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) break;
  }
  return issues;
}

function connectorIssues(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
): PreflightIssue[] {
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
      const connectorEvents: StitchEvent[] = [];
      for (const { event, layer } of record.events)
        if (
          layer === 'travel' &&
          (connector.line === undefined || eventSourceLine(event) === connector.line) &&
          (Math.hypot(event.x - connector.from[0], event.y - connector.from[1]) < 0.05 ||
            Math.hypot(event.x - connector.to[0], event.y - connector.to[1]) < 0.05)
        )
          connectorEvents.push(event);
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
        sourceLocations: sourceLocations(connector.line ?? record.line),
        geometry: [
          regionGeometry(record.region),
          {
            kind: 'polyline',
            role: 'travel',
            points: [point(connector.from), point(connector.to)],
          },
        ],
        eventIndices: eventIndicesFor(finalEvents, connectorEvents),
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
        sourceLocations: sourceLocations(record.line, [
          eventSourceLine(firstDecorative.event),
          eventSourceLine(lastUnderlay.event),
        ]),
        geometry: [
          record.kind === 'fill'
            ? regionGeometry(record.region)
            : regionGeometry(satinEnvelope(record)),
          {
            kind: 'points',
            role: 'overlap',
            points: [
              { x: firstDecorative.event.x, y: firstDecorative.event.y },
              { x: lastUnderlay.event.x, y: lastUnderlay.event.y },
            ],
          },
        ],
        eventIndices: eventIndicesFor(finalEvents, [firstDecorative.event, lastUnderlay.event]),
        constructionIds: [record.id],
      });
      if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) return issues;
    }
  }
  return issues;
}

function constructionRegion(record: ConstructionRecord): [number, number][][] {
  return record.kind === 'fill' ? record.region : satinEnvelope(record);
}

function signedRingArea(ring: readonly (readonly [number, number])[]): number {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function regionAreaMM2(rings: readonly (readonly (readonly [number, number])[])[]): number {
  return Math.abs(rings.reduce((total, ring) => total + signedRingArea(ring), 0));
}

function maximumSatinWidth(record: SatinConstructionRecord): number {
  return record.sections.reduce(
    (maximum, section) =>
      Math.max(maximum, Math.hypot(section.a[0] - section.b[0], section.a[1] - section.b[1])),
    0,
  );
}

function constructionEvents(
  record: ConstructionRecord,
  layers: readonly ConstructionEventRecord['layer'][],
): ConstructionEventRecord[] {
  const selectedLayers = new Set(layers);
  return record.events.filter(
    ({ event, layer }) => event.t === 'stitch' && selectedLayers.has(layer),
  );
}

function wideConstructionUnderlayIssues(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
): PreflightIssue[] {
  const missing: PreflightIssue[] = [];
  const unsuitable: PreflightIssue[] = [];
  for (const record of records.slice(
    0,
    CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumConstructionsPerExpansionCheck,
  )) {
    const region = constructionRegion(record);
    if (!region.length) continue;
    const width = record.kind === 'satin' ? maximumSatinWidth(record) : undefined;
    const area = record.kind === 'fill' ? regionAreaMM2(record.region) : undefined;
    const qualifies =
      (width !== undefined &&
        width >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.wideSatinUnderlayWidthMM) ||
      (area !== undefined && area >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.largeFillUnderlayAreaMM2);
    if (!qualifies) continue;
    const underlay = constructionEvents(record, ['underlay']);
    const base = {
      points: [],
      lines: record.line === undefined ? [] : [record.line],
      sourceLocations: sourceLocations(record.line),
      geometry: [regionGeometry(region)],
      eventIndices: eventIndicesFor(
        finalEvents,
        constructionEvents(record, ['topping', 'edge-run'])
          .slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumPointsPerIssue)
          .map(({ event }) => event),
      ),
      constructionIds: [record.id],
      measurements: [
        width !== undefined
          ? {
              label: 'Maximum satin width',
              value: width,
              unit: 'mm' as const,
              threshold: CONSTRUCTION_PREFLIGHT_THRESHOLDS.wideSatinUnderlayWidthMM,
              comparison: 'above' as const,
            }
          : {
              label: 'Fill area',
              value: area!,
              unit: 'mm²' as const,
              threshold: CONSTRUCTION_PREFLIGHT_THRESHOLDS.largeFillUnderlayAreaMM2,
              comparison: 'above' as const,
            },
      ],
    };
    if (!underlay.length) {
      missing.push({
        ...preflightCatalogMetadata('underlay.missing-wide-construction'),
        ...base,
        code: 'underlay.missing-wide-construction',
        message: `Construction ${record.id} has no underlay beneath its ${record.kind === 'satin' ? `${width!.toFixed(2)} mm satin width` : `${area!.toFixed(1)} mm² fill area`}.`,
      });
    } else {
      const unsuitableMode =
        (record.kind === 'satin' &&
          (record.underlayPasses?.length
            ? record.underlayPasses.every((pass) => pass === 'center')
            : record.underlayMode === 'center')) ||
        (record.kind === 'fill' &&
          (record.underlayPasses?.length
            ? record.underlayPasses.every((pass) => pass === 'edge')
            : record.underlayMode === 'edge'));
      if (unsuitableMode)
        unsuitable.push({
          ...preflightCatalogMetadata('underlay.unsuitable-wide-construction'),
          ...base,
          code: 'underlay.unsuitable-wide-construction',
          message: `Construction ${record.id} uses ${record.underlayMode}-only underlay across its ${record.kind === 'satin' ? `${width!.toFixed(2)} mm satin width` : `${area!.toFixed(1)} mm² fill area`}.`,
        });
    }
    if (
      missing.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck &&
      unsuitable.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck
    )
      break;
  }
  return [
    ...missing.slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck),
    ...unsuitable.slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck),
  ];
}

interface ConstructionSegment {
  from: ConstructionEventRecord;
  to: ConstructionEventRecord;
}

function toppingSegments(
  record: ConstructionRecord,
  maximumSegments: number = CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumCoverageSegmentsPerConstruction,
): ConstructionSegment[] {
  const segments: ConstructionSegment[] = [];
  let previous: ConstructionEventRecord | undefined;
  for (const entry of record.events) {
    if (entry.event.t !== 'stitch' || (entry.layer !== 'topping' && entry.layer !== 'edge-run')) {
      previous = undefined;
      continue;
    }
    if (
      previous &&
      (previous.layer !== entry.layer || (previous.lane ?? -1) !== (entry.lane ?? -1))
    ) {
      previous = entry;
      continue;
    }
    if (previous) segments.push({ from: previous, to: entry });
    previous = entry;
    if (segments.length >= maximumSegments) break;
  }
  return segments;
}

function distanceToSegment(pointValue: readonly [number, number], segment: ConstructionSegment) {
  return segdist(
    [pointValue[0], pointValue[1]],
    [segment.from.event.x, segment.from.event.y],
    [segment.to.event.x, segment.to.event.y],
  );
}

function constructionCoverageGapIssues(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
  threadWidthMM: number,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const coverageRadiusMM = Math.max(0.45, threadWidthMM * 1.5);
  for (const record of records.slice(
    0,
    CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumConstructionsPerExpansionCheck,
  )) {
    const region = constructionRegion(record);
    const points = region.flat();
    const segments = toppingSegments(record);
    if (points.length < 3 || segments.length < 2) continue;
    const minX = Math.min(...points.map(([x]) => x));
    const maxX = Math.max(...points.map(([x]) => x));
    const minY = Math.min(...points.map(([, y]) => y));
    const maxY = Math.max(...points.map(([, y]) => y));
    const width = Math.max(coverageRadiusMM, maxX - minX);
    const height = Math.max(coverageRadiusMM, maxY - minY);
    const minimumStep = Math.max(0.5, coverageRadiusMM);
    let columns = Math.max(1, Math.ceil(width / minimumStep));
    let rows = Math.max(1, Math.ceil(height / minimumStep));
    if (columns * rows > CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumCoverageSamplesPerConstruction) {
      const scale = Math.sqrt(
        (columns * rows) / CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumCoverageSamplesPerConstruction,
      );
      columns = Math.max(1, Math.floor(columns / scale));
      rows = Math.max(1, Math.floor(rows / scale));
      while (
        columns * rows >
        CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumCoverageSamplesPerConstruction
      ) {
        if (columns >= rows) columns--;
        else rows--;
      }
    }
    const stepX = width / columns;
    const stepY = height / rows;
    let sampled = 0;
    let gaps = 0;
    let firstGap: [number, number] | undefined;
    for (let column = 0; column < columns; column++) {
      const x = minX + stepX * (column + 0.5);
      for (let row = 0; row < rows; row++) {
        const y = minY + stepY * (row + 0.5);
        if (!insideOrOnBoundary(region, [x, y])) continue;
        sampled++;
        let nearest = Infinity;
        for (const segment of segments) {
          nearest = Math.min(nearest, distanceToSegment([x, y], segment));
          if (nearest <= coverageRadiusMM) break;
        }
        if (nearest > coverageRadiusMM) {
          gaps++;
          firstGap ??= [x, y];
        }
      }
    }
    const gapRatio = sampled ? gaps / sampled : 0;
    if (!firstGap || gapRatio <= CONSTRUCTION_PREFLIGHT_THRESHOLDS.coverageGapRatio) continue;
    const nearby = segments
      .flatMap(({ from, to }) => [from.event, to.event])
      .toSorted(
        (a, b) =>
          Math.hypot(a.x - firstGap[0], a.y - firstGap[1]) -
          Math.hypot(b.x - firstGap[0], b.y - firstGap[1]),
      )
      .slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumPointsPerIssue);
    const nearbySet = new Set(nearby);
    issues.push({
      ...preflightCatalogMetadata('coverage.construction-gap'),
      code: 'coverage.construction-gap',
      message: `${(gapRatio * 100).toFixed(1)}% of sampled coverage in construction ${record.id} is farther than ${coverageRadiusMM.toFixed(2)} mm from topping thread.`,
      points: [{ x: firstGap[0], y: firstGap[1] }],
      lines: linesOf(
        record.events.filter(({ event }) => nearbySet.has(event)),
        record.line,
      ),
      sourceLocations: sourceLocations(
        record.line,
        nearby.map(({ line }) => line),
      ),
      geometry: [
        regionGeometry(region),
        {
          kind: 'cell',
          role: 'hotspot',
          x: firstGap[0] - stepX / 2,
          y: firstGap[1] - stepY / 2,
          width: stepX,
          height: stepY,
        },
      ],
      eventIndices: eventIndicesFor(finalEvents, nearby),
      constructionIds: [record.id],
      measurements: [
        {
          label: 'Uncovered samples',
          value: gapRatio * 100,
          unit: 'percent',
          threshold: CONSTRUCTION_PREFLIGHT_THRESHOLDS.coverageGapRatio * 100,
          comparison: 'above',
        },
        {
          label: 'Coverage radius',
          value: coverageRadiusMM,
          unit: 'mm',
        },
      ],
    });
    if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) break;
  }
  return issues;
}

function constructionShortRatioIssues(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const shortLengthMM =
    profile.minimumReliableMovementMM * CONSTRUCTION_PREFLIGHT_THRESHOLDS.shortStitchMultiplier;
  for (const record of records.slice(
    0,
    CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumConstructionsPerExpansionCheck,
  )) {
    const segments = toppingSegments(
      record,
      CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumShortSegmentsPerConstruction,
    );
    if (segments.length < CONSTRUCTION_PREFLIGHT_THRESHOLDS.minimumSegmentsForShortRatio) continue;
    const short = segments.filter(({ from, to }) => {
      const fromEvent = from.event;
      const toEvent = to.event;
      return Math.hypot(toEvent.x - fromEvent.x, toEvent.y - fromEvent.y) < shortLengthMM;
    });
    const ratio = short.length / segments.length;
    if (ratio <= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumShortStitchRatio) continue;
    const selected = short.slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumPointsPerIssue);
    const selectedEvents = selected.flatMap(({ from, to }) => [from.event, to.event]);
    issues.push({
      ...preflightCatalogMetadata('stitch.construction-short-ratio'),
      code: 'stitch.construction-short-ratio',
      message: `${(ratio * 100).toFixed(1)}% of construction ${record.id}'s topping segments are shorter than ${shortLengthMM.toFixed(2)} mm.`,
      points: selected.map(({ to }) => ({ x: to.event.x, y: to.event.y })),
      lines: linesOf(
        selected.flatMap(({ from, to }) => [from, to]),
        record.line,
      ),
      sourceLocations: sourceLocations(
        record.line,
        selectedEvents.map(({ line }) => line),
      ),
      geometry: [
        regionGeometry(constructionRegion(record)),
        {
          kind: 'points',
          role: 'hotspot',
          points: selected.map(({ to }) => ({ x: to.event.x, y: to.event.y })),
        },
      ],
      eventIndices: eventIndicesFor(finalEvents, selectedEvents),
      constructionIds: [record.id],
      measurements: [
        {
          label: 'Short-stitch ratio',
          value: ratio * 100,
          unit: 'percent',
          threshold: CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumShortStitchRatio * 100,
          comparison: 'above',
        },
        {
          label: 'Reliable movement threshold',
          value: shortLengthMM,
          unit: 'mm',
        },
      ],
    });
    if (issues.length >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) break;
  }
  return issues;
}

function directionalCompensationIssues(
  records: readonly ConstructionRecord[],
  context: ConstructionPreflightContext,
): PreflightIssue[] {
  const { compensation, material } = context;
  if (!compensation || !material || compensation.appliedMode !== 'legacy-scalar') return [];
  if (
    Math.abs(material.stretchAlong - material.stretchAcross) <
    CONSTRUCTION_PREFLIGHT_THRESHOLDS.directionalStretchDelta
  )
    return [];
  const maximumDeltaMM = compensation.samples.reduce(
    (maximum, sample) =>
      Math.max(
        maximum,
        Math.abs(sample.pullDeltaAlongStitchMM),
        Math.abs(sample.pullDeltaAcrossStitchMM),
      ),
    0,
  );
  if (maximumDeltaMM <= CONSTRUCTION_PREFLIGHT_THRESHOLDS.directionalCompensationDeltaMM) return [];
  return records
    .slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumConstructionsPerExpansionCheck)
    .filter((record) => record.compensationMode !== 'directional')
    .slice(0, CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck)
    .map((record) => ({
      ...preflightCatalogMetadata('material.directional-compensation-mismatch'),
      code: 'material.directional-compensation-mismatch',
      message: `Construction ${record.id} uses scalar compensation while declared directional stretch produces up to ${maximumDeltaMM.toFixed(2)} mm of modeled pull difference.`,
      points: [],
      lines: record.line === undefined ? [] : [record.line],
      sourceLocations: sourceLocations(record.line),
      geometry: [regionGeometry(constructionRegion(record))],
      eventIndices: [],
      constructionIds: [record.id],
      measurements: [
        {
          label: 'Directional pull difference',
          value: maximumDeltaMM,
          unit: 'mm' as const,
          threshold: CONSTRUCTION_PREFLIGHT_THRESHOLDS.directionalCompensationDeltaMM,
          comparison: 'above' as const,
        },
        {
          label: 'Stretch-axis difference',
          value: Math.abs(material.stretchAlong - material.stretchAcross) * 100,
          unit: 'percent' as const,
          threshold: CONSTRUCTION_PREFLIGHT_THRESHOLDS.directionalStretchDelta * 100,
          comparison: 'above' as const,
        },
      ],
    }));
}

/** Pure, fixed-order analysis over explicit construction sidecars only. */
export function analyzeConstructionPreflight(
  records: readonly ConstructionRecord[],
  finalEvents: readonly StitchEvent[],
  context: ConstructionPreflightContext = {},
): PreflightIssue[] {
  if (!records.length) return [];
  const counts = new Map<string, number>();
  return [
    ...wideConstructionUnderlayIssues(records, finalEvents),
    ...constructionCoverageGapIssues(records, finalEvents, context.material?.threadWidthMM ?? 0.4),
    ...(context.profile ? constructionShortRatioIssues(records, finalEvents, context.profile) : []),
    ...directionalCompensationIssues(records, context),
    ...underlayEnvelopeIssues(records, finalEvents),
    ...fillBorderIssues(records, finalEvents),
    ...splitOverlapIssues(records, finalEvents),
    ...connectorIssues(records, finalEvents),
    ...orderIssues(records, finalEvents),
  ].filter((issue) => {
    const count = counts.get(issue.code) ?? 0;
    if (count >= CONSTRUCTION_PREFLIGHT_THRESHOLDS.maximumIssuesPerCheck) return false;
    counts.set(issue.code, count + 1);
    return true;
  });
}
