import { inHoopOuter } from './hoop-presets.ts';
import { LIMITS } from './machine/limits.ts';
import { analyzeEventStreamPreflight } from './preflight-event-stream.ts';
import { analyzeConstructionPreflight } from './preflight-construction.ts';
import type { ConstructionRecord } from './construction-metadata.ts';
import { DEFAULT_PREFERRED_SATIN_CHORD_MM } from './satin-profile.ts';
import { defineModes } from './mode-registry.ts';
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

const SAME_HOLE_PENETRATION_LIMIT = 5;
export const PREFLIGHT_MODES: readonly PreflightMode[] = defineModes(['off', 'warn', 'strict']);

export interface PreflightInput {
  events: readonly StitchEvent[];
  warnings: readonly string[];
  warningLocations: readonly WarningLocation[];
  hoop: HoopInfo;
  maximumDensityLayers: number;
  mode?: PreflightMode;
  constructionRecords?: readonly ConstructionRecord[];
}

/** Resolve the current built-in diagnostic envelope without retaining machine state. */
export function resolveMachineProfile(maximumDensityLayers: number): ResolvedMachineProfile {
  return {
    name: 'NeedleScript default',
    minimumReliableMovementMM: LIMITS.minStitch,
    maximumStitchMM: LIMITS.maxStitch,
    maximumPreferredSewnStitchMM: DEFAULT_PREFERRED_SATIN_CHORD_MM,
    maximumPreferredSatinStitchMM: DEFAULT_PREFERRED_SATIN_CHORD_MM,
    maximumPreferredJumpMM: LIMITS.maxStitch,
    maximumConsecutiveStitches: 20_000,
    maximumDensityLayers,
    sameHolePenetrationLimit: SAME_HOLE_PENETRATION_LIMIT,
  };
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

/**
 * Build structured issues from completed, internal diagnostic metadata.
 * This function is deliberately pure: it neither rewrites events nor warnings.
 */
export function buildPreflightResult(input: PreflightInput): PreflightResult {
  const mode = input.mode ?? 'off';
  const profile = resolveMachineProfile(input.maximumDensityLayers);
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

  const extendedIssues =
    mode === 'off'
      ? []
      : [
          ...analyzeEventStreamPreflight(input.events, profile),
          ...analyzeConstructionPreflight(input.constructionRecords ?? [], input.events),
        ];
  const issues = [...legacyIssues, ...extendedIssues];
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
