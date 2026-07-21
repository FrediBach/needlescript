import type {
  MaterialIntent,
  PhysicsAssumption,
  PhysicsDiagnostic,
  PhysicsReport,
  PreflightIssue,
  PreflightResult,
} from '../../core/types.ts';
import { getPhysicsDiagnosticCatalogEntry } from './catalog.ts';
import { assignPhysicsDiagnosticIdentities } from './identity.ts';

export const PHYSICS_REPORT_VERSION = 1;

export interface PhysicsReportCompatibilityInput {
  preflight: PreflightResult;
  material: MaterialIntent;
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

function diagnosticDraft(issue: PreflightIssue): Omit<PhysicsDiagnostic, 'id' | 'fingerprint'> {
  const catalog = getPhysicsDiagnosticCatalogEntry(issue.code);
  const lines = [...new Set(issue.lines)].toSorted((a, b) => a - b);
  const constructionIds = issue.constructionIds
    ? [...new Set(issue.constructionIds)].toSorted((a, b) => a - b)
    : undefined;
  return {
    code: catalog.code,
    category: catalog.category,
    severity: issue.severity,
    evidence: catalog.evidence,
    title: catalog.title,
    explanation: catalog.explanation,
    sourceLocations: lines.map((line, index) => ({
      line,
      role: index === 0 ? 'primary' : 'contributor',
    })),
    geometry: issue.points.length
      ? [
          {
            kind: 'points',
            role: catalog.geometryRole,
            points: issue.points.map(({ x, y }) => ({ x, y })),
          },
        ]
      : [],
    playbackRanges: [],
    ...(constructionIds?.length ? { constructionIds } : {}),
    remedies: catalog.remedies.map((remedy) => ({ ...remedy })),
    documentationId: catalog.documentationId,
  };
}

/** Adapt today's selected PreflightIssue list without changing legacy policy or ordering. */
export function buildPhysicsReport(input: PhysicsReportCompatibilityInput): PhysicsReport {
  const diagnostics = assignPhysicsDiagnosticIdentities(
    input.preflight.issues.map(diagnosticDraft),
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
