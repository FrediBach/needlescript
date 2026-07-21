import type {
  MaterialIntent,
  PhysicsAssumption,
  PhysicsDiagnostic,
  PhysicsReport,
  PreflightIssue,
  PreflightResult,
  StitchEvent,
} from '../../core/types.ts';
import { getPhysicsDiagnosticCatalogEntry } from './catalog.ts';
import { assignPhysicsDiagnosticIdentities } from './identity.ts';
import { addDiagnosticGeometryContext, playbackRangesForEventIndices } from './attribution.ts';

export const PHYSICS_REPORT_VERSION = 1;

export interface PhysicsReportCompatibilityInput {
  preflight: PreflightResult;
  material: MaterialIntent;
  /** Stream inspected by the selected diagnostic analysis (before locks). */
  analysisEvents?: readonly StitchEvent[];
  /** Final RunResult stream (after locks), used by stitch/jump playback. */
  playbackEvents?: readonly StitchEvent[];
}

function assumptionsFor(input: PhysicsReportCompatibilityInput): PhysicsAssumption[] {
  const assumptions: PhysicsAssumption[] = [];
  if (input.preflight.profile.source === 'default')
    assumptions.push({
      key: 'machine-profile',
      label: 'Machine profile',
      value: input.preflight.profile.name,
      source: 'default',
      effect: 'Uses NeedleScript’s generic movement, operation, and continuous-run thresholds.',
    });
  if (input.material.fabricPreset === 'unspecified')
    assumptions.push({
      key: 'fabric-profile',
      label: 'Fabric profile',
      value: 'Unspecified material',
      source: 'default',
      effect: 'Material-sensitive findings use generic rather than fabric-specific evidence.',
    });
  return assumptions;
}

function diagnosticDraft(
  issue: PreflightIssue,
  input: PhysicsReportCompatibilityInput,
): Omit<PhysicsDiagnostic, 'id' | 'fingerprint'> {
  const catalog = getPhysicsDiagnosticCatalogEntry(issue.code);
  const lines = [...new Set(issue.lines)].toSorted((a, b) => a - b);
  const constructionIds = issue.constructionIds
    ? [...new Set(issue.constructionIds)].toSorted((a, b) => a - b)
    : undefined;
  const sourceLocations = issue.sourceLocations?.length
    ? issue.sourceLocations.map((location) => ({ ...location }))
    : lines.map((line, index) => ({
        line,
        role: index === 0 ? ('primary' as const) : ('contributor' as const),
      }));
  const fallbackGeometry = issue.points.length
    ? [
        {
          kind: 'points' as const,
          role: catalog.geometryRole,
          points: issue.points.map(({ x, y }) => ({ x, y })),
        },
      ]
    : [];
  const geometry = (issue.geometry ?? fallbackGeometry).map(addDiagnosticGeometryContext);
  const playbackRanges =
    issue.eventIndices?.length && input.analysisEvents && input.playbackEvents
      ? playbackRangesForEventIndices(
          issue.eventIndices,
          input.analysisEvents,
          input.playbackEvents,
        )
      : [];
  return {
    code: catalog.code,
    category: catalog.category,
    severity: issue.severity,
    evidence: catalog.evidence,
    title: catalog.title,
    explanation: catalog.explanation,
    sourceLocations,
    ...(!sourceLocations.length
      ? {
          sourceReason: {
            kind: 'generated' as const,
            explanation:
              'This finding concerns generated machine events with no direct source location.',
          },
        }
      : {}),
    geometry,
    playbackRanges,
    ...(constructionIds?.length ? { constructionIds } : {}),
    remedies: catalog.remedies.map((remedy) => ({ ...remedy })),
    documentationId: catalog.documentationId,
  };
}

/** Adapt today's selected PreflightIssue list without changing legacy policy or ordering. */
export function buildPhysicsReport(input: PhysicsReportCompatibilityInput): PhysicsReport {
  const diagnostics = assignPhysicsDiagnosticIdentities(
    input.preflight.issues.map((issue) => diagnosticDraft(issue, input)),
  );
  const count = (severity: PhysicsDiagnostic['severity']) =>
    diagnostics.reduce((total, diagnostic) => total + Number(diagnostic.severity === severity), 0);
  return {
    version: PHYSICS_REPORT_VERSION,
    diagnostics,
    assumptions: assumptionsFor(input),
    summary: {
      error: count('error'),
      warning: count('warning'),
      info: count('info'),
    },
    profile: input.preflight.profile,
    material: { ...input.material },
    policy: input.preflight.mode,
  };
}
