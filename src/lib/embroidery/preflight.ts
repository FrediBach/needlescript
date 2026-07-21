import { inHoopOuter } from './hoop-presets.ts';
import { analyzeEventStreamPreflight } from './preflight-event-stream.ts';
import { analyzeConstructionPreflight } from './preflight-construction.ts';
import type { ConstructionRecord } from './construction-metadata.ts';
import { defineModes } from '../core/mode-registry.ts';
import { resolveMachineProfile } from './machine-profile.ts';
import {
  preflightCatalogMetadata,
  type PhysicsDiagnosticCode,
} from './physics-diagnostics/catalog.ts';
import type {
  HoopInfo,
  PreflightIssue,
  PreflightMode,
  PreflightResult,
  PreflightSeverity,
  ResolvedMachineProfile,
  StitchEvent,
  WarningLocation,
} from '../core/types.ts';

export const PREFLIGHT_MODES: readonly PreflightMode[] = defineModes(['off', 'warn', 'strict']);

export interface PreflightInput {
  events: readonly StitchEvent[];
  warnings: readonly string[];
  warningLocations: readonly WarningLocation[];
  hoop: HoopInfo;
  maximumDensityLayers: number;
  profile?: ResolvedMachineProfile;
  mode?: PreflightMode;
  constructionRecords?: readonly ConstructionRecord[];
}

function overflowCode(location: WarningLocation, hoop: HoopInfo): PhysicsDiagnosticCode {
  const physicallyUnreachable = location.points.some(
    (point) => !inHoopOuter(hoop, point.x, point.y),
  );
  return physicallyUnreachable ? 'hoop.unreachable' : 'hoop.field-overflow';
}

const LEGACY_CODE_BY_LOCATION_KIND: Partial<
  Record<WarningLocation['kind'], PhysicsDiagnosticCode>
> = {
  density: 'coverage.density-hotspot',
  stack: 'penetration.same-hole-stack',
  tiny: 'stitch.below-reliable-movement',
  satin: 'satin.snag-risk',
};

function issueDescriptor(
  location: WarningLocation,
  hoop: HoopInfo,
): ({ code: PhysicsDiagnosticCode } & ReturnType<typeof preflightCatalogMetadata>) | undefined {
  const code =
    (location.code as PhysicsDiagnosticCode | undefined) ??
    (location.kind === 'overflow'
      ? overflowCode(location, hoop)
      : LEGACY_CODE_BY_LOCATION_KIND[location.kind]);
  return code ? { code, ...preflightCatalogMetadata(code) } : undefined;
}

function uniqueLines(lines: readonly number[]): number[] {
  return [...new Set(lines)];
}

function eventIndicesForLocation(
  events: readonly StitchEvent[],
  location: WarningLocation,
): number[] {
  // Merged tiny moves and omitted/collapsed fill fragments have no final event.
  if (
    location.kind === 'tiny' ||
    location.code === 'fill.stagger-short-fragment' ||
    location.code === 'fill.short-fragment-omitted' ||
    location.code === 'fill.edge-run-collapse' ||
    location.code === 'fill.edge-run-penetration-guard' ||
    location.code === 'fill.inset-region-change'
  )
    return [];
  const cells = location.geometry?.filter(
    (
      geometry,
    ): geometry is Extract<NonNullable<WarningLocation['geometry']>[number], { kind: 'cell' }> =>
      geometry.kind === 'cell',
  );
  return events.flatMap((event, index) => {
    if (event.t !== 'stitch' && event.t !== 'jump') return [];
    const atPoint = location.points.some(
      (point) => Math.hypot(event.x - point.x, event.y - point.y) <= 0.01,
    );
    const inCell = cells?.some(
      (cell) =>
        event.x >= cell.x &&
        event.x <= cell.x + cell.width &&
        event.y >= cell.y &&
        event.y <= cell.y + cell.height,
    );
    return atPoint || inCell ? [index] : [];
  });
}

function capabilityIssue(
  event: StitchEvent,
  eventIndex: number,
  profile: ResolvedMachineProfile,
  operation: 'trim' | 'color change',
  capability: ResolvedMachineProfile['trimCapability'],
): PreflightIssue | undefined {
  if (capability === 'automatic') return undefined;
  const manual = capability === 'manual';
  const code: PhysicsDiagnosticCode =
    operation === 'trim'
      ? manual
        ? 'machine.trim-manual'
        : 'machine.trim-unsupported'
      : manual
        ? 'machine.color-change-manual'
        : 'machine.color-change-unsupported';
  return {
    ...preflightCatalogMetadata(code),
    code,
    message: manual
      ? `${profile.name} requires operator action for each ${operation}.`
      : `${profile.name} does not support the design's ${operation} operation.`,
    points: [{ x: event.x, y: event.y }],
    lines: event.line === undefined ? [] : [event.line],
    eventIndices: [eventIndex],
  };
}

function analyzeMachineCapabilities(
  events: readonly StitchEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  if (profile.source === 'default') return [];
  const trimIndex = events.findIndex((event) => event.t === 'trim');
  const colorIndex = events.findIndex((event) => event.t === 'color');
  const trim = events[trimIndex];
  const color = events[colorIndex];
  return [
    ...(trim ? [capabilityIssue(trim, trimIndex, profile, 'trim', profile.trimCapability)] : []),
    ...(color
      ? [capabilityIssue(color, colorIndex, profile, 'color change', profile.colorChangeCapability)]
      : []),
  ].filter((issue): issue is PreflightIssue => issue !== undefined);
}

/**
 * Build structured issues from completed, internal diagnostic metadata.
 * This function is deliberately pure: it neither rewrites events nor warnings.
 */
function buildResult(input: PreflightInput, includeExtended: boolean): PreflightResult {
  const mode = input.mode ?? 'off';
  const profile = input.profile ?? resolveMachineProfile(input.maximumDensityLayers);
  const legacyIssues: PreflightIssue[] = input.warningLocations
    .toSorted((a, b) => a.index - b.index)
    .flatMap((location) => {
      const descriptor = issueDescriptor(location, input.hoop);
      const message = input.warnings[location.index];
      if (!descriptor) {
        if (location.kind === 'fill' || location.kind === 'satin')
          throw new Error(
            `Spatial ${location.kind} warning at index ${location.index} has no physics diagnostic code.`,
          );
        return [];
      }
      if (message === undefined) return [];
      return [
        {
          ...descriptor,
          message,
          points: location.points.map(({ x, y }) => ({ x, y })),
          lines: uniqueLines(location.lines),
          ...(location.geometry
            ? { geometry: location.geometry.map((geometry) => ({ ...geometry })) }
            : {}),
          eventIndices: eventIndicesForLocation(input.events, location),
        },
      ];
    });

  const capabilityIssues = analyzeMachineCapabilities(input.events, profile);
  const extendedIssues = includeExtended
    ? [
        ...analyzeEventStreamPreflight(input.events, profile),
        ...analyzeConstructionPreflight(input.constructionRecords ?? [], input.events),
      ]
    : [];
  const issues = [...legacyIssues, ...capabilityIssues, ...extendedIssues];
  const count = (severity: PreflightSeverity) =>
    issues.reduce((total, issue) => total + Number(issue.severity === severity), 0);
  return {
    mode,
    issues,
    profile,
    summary: {
      total: issues.length,
      info: count('info'),
      warning: count('warning'),
      error: count('error'),
    },
  };
}

export function buildPreflightResult(input: PreflightInput): PreflightResult {
  return buildResult(input, input.mode !== undefined && input.mode !== 'off');
}

/** Internal preflight-shaped envelope for a caller-requested full physics report. */
export function buildFullPhysicsAnalysisResult(input: PreflightInput): PreflightResult {
  return buildResult(input, true);
}
