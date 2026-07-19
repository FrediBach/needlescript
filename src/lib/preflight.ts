import { inHoopOuter } from './hoop-presets.ts';
import { analyzeEventStreamPreflight } from './preflight-event-stream.ts';
import { analyzeConstructionPreflight } from './preflight-construction.ts';
import type { ConstructionRecord } from './construction-metadata.ts';
import { defineModes } from './mode-registry.ts';
import { resolveMachineProfile } from './machine-profile.ts';
import type {
  HoopInfo,
  PreflightIssue,
  PreflightMode,
  PreflightResult,
  PreflightSeverity,
  ResolvedMachineProfile,
  StitchEvent,
  WarningLocation,
} from './types.ts';

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

function overflowCode(
  location: WarningLocation,
  hoop: HoopInfo,
): { code: string; severity: PreflightSeverity; suggestion: string } {
  const physicallyUnreachable = location.points.some(
    (point) => !inHoopOuter(hoop, point.x, point.y),
  );
  return physicallyUnreachable
    ? {
        code: 'hoop.unreachable',
        severity: 'error',
        suggestion: 'Move or scale the design so every penetration is inside the physical hoop.',
      }
    : {
        code: 'hoop.field-overflow',
        severity: 'warning',
        suggestion: 'Move or scale the design into the inset sewable field.',
      };
}

function issueDescriptor(
  location: WarningLocation,
  hoop: HoopInfo,
): { code: string; severity: PreflightSeverity; suggestion: string } | undefined {
  switch (location.kind) {
    case 'density':
      return {
        code: 'coverage.density-hotspot',
        severity: 'warning',
        suggestion: 'Reduce overlapping layers or increase stitch spacing in this area.',
      };
    case 'stack':
      return {
        code: 'penetration.same-hole-stack',
        severity: 'warning',
        suggestion: 'Offset or remove repeated penetrations through the same needle hole.',
      };
    case 'tiny':
      return {
        code: 'stitch.below-reliable-movement',
        severity: 'warning',
        suggestion: 'Increase stitch spacing or simplify the construction around these points.',
      };
    case 'overflow':
      return overflowCode(location, hoop);
    case 'satin':
      return {
        code: 'satin.snag-risk',
        severity: 'warning',
        suggestion: 'Reduce the satin width or rake, or split the column.',
      };
    case 'fill':
      return undefined;
  }
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
  const codeOperation = operation === 'trim' ? 'trim' : 'color-change';
  const manual = capability === 'manual';
  return {
    severity: manual ? 'info' : 'error',
    code: `machine.${codeOperation}-${manual ? 'manual' : 'unsupported'}`,
    message: manual
      ? `${profile.name} requires operator action for each ${operation}.`
      : `${profile.name} does not support the design's ${operation} operation.`,
    points: [{ x: event.x, y: event.y }],
    lines: event.line === undefined ? [] : [event.line],
    suggestion: manual
      ? `Include the ${operation} in the sew-out worksheet and pause at this point.`
      : `Remove the ${operation} or choose a local machine profile that supports it.`,
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
