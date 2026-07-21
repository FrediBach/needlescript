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
    location.kind === 'overflow'
      ? overflowCode(location, hoop)
      : LEGACY_CODE_BY_LOCATION_KIND[location.kind];
  return code ? { code, ...preflightCatalogMetadata(code) } : undefined;
}

function uniqueLines(lines: readonly number[]): number[] {
  return [...new Set(lines)];
}

function capabilityIssue(
  event: StitchEvent,
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
  };
}

function analyzeMachineCapabilities(
  events: readonly StitchEvent[],
  profile: ResolvedMachineProfile,
): PreflightIssue[] {
  if (profile.source === 'default') return [];
  const trim = events.find((event) => event.t === 'trim');
  const color = events.find((event) => event.t === 'color');
  return [
    ...(trim ? [capabilityIssue(trim, profile, 'trim', profile.trimCapability)] : []),
    ...(color
      ? [capabilityIssue(color, profile, 'color change', profile.colorChangeCapability)]
      : []),
  ].filter((issue): issue is PreflightIssue => issue !== undefined);
}

/**
 * Build structured issues from completed, internal diagnostic metadata.
 * This function is deliberately pure: it neither rewrites events nor warnings.
 */
export function buildPreflightResult(input: PreflightInput): PreflightResult {
  const mode = input.mode ?? 'off';
  const profile = input.profile ?? resolveMachineProfile(input.maximumDensityLayers);
  const legacyIssues: PreflightIssue[] = input.warningLocations
    .toSorted((a, b) => a.index - b.index)
    .flatMap((location) => {
      const descriptor = issueDescriptor(location, input.hoop);
      const message = input.warnings[location.index];
      if (!descriptor || message === undefined) return [];
      return [
        {
          ...descriptor,
          message,
          points: location.points.map(({ x, y }) => ({ x, y })),
          lines: uniqueLines(location.lines),
        },
      ];
    });

  const capabilityIssues = analyzeMachineCapabilities(input.events, profile);
  const extendedIssues =
    mode === 'off'
      ? []
      : [
          ...analyzeEventStreamPreflight(input.events, profile),
          ...analyzeConstructionPreflight(input.constructionRecords ?? [], input.events),
        ];
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
