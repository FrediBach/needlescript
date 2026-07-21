import type {
  PhysicsDiagnostic,
  PhysicsMeasurement,
  PhysicsSourceLocation,
  PreflightSeverity,
} from '../lib/engine.ts';

export const COMPILER_MARKER_OWNER = 'needlescript.compiler';
export const PHYSICS_MARKER_OWNER = 'needlescript.physics';

export interface PhysicsMonacoMarker {
  diagnosticId: string;
  role: PhysicsSourceLocation['role'];
  severity: PreflightSeverity;
  line: number;
  startColumn?: number;
  endColumn?: number;
  message: string;
  code: string;
}

const SEVERITY_LABELS: Record<PreflightSeverity, string> = {
  error: 'Blocker',
  warning: 'Risk',
  info: 'Note',
};

const EVIDENCE_LABELS: Record<PhysicsDiagnostic['evidence'], string> = {
  'hard-limit': 'Hard limit',
  'machine-profile': 'Machine profile',
  'engine-derived': 'Engine-derived',
  heuristic: 'Generic heuristic',
  experimental: 'Experimental model',
};

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

export function formatPhysicsMeasurement(measurement: PhysicsMeasurement): string {
  const value = `${formatNumber(measurement.value)} ${measurement.unit}`;
  if (measurement.threshold === undefined) return `${measurement.label}: ${value}`;
  const comparison =
    measurement.comparison === 'below'
      ? 'minimum'
      : measurement.comparison === 'outside'
        ? 'range limit'
        : 'limit';
  return `${measurement.label}: ${value}; ${comparison} ${formatNumber(measurement.threshold)} ${measurement.unit}`;
}

export function physicsDiagnosticMarkerMessage(
  diagnostic: PhysicsDiagnostic,
  role: PhysicsSourceLocation['role'],
): string {
  const lines = [
    `${SEVERITY_LABELS[diagnostic.severity]}: ${diagnostic.title}`,
    ...(diagnostic.measurements?.map(formatPhysicsMeasurement) ?? []),
    diagnostic.explanation,
    `Evidence: ${EVIDENCE_LABELS[diagnostic.evidence]}`,
  ];
  if (role !== 'primary') lines.push(`Source role: ${role}`);
  if (diagnostic.remedies.length > 0) {
    lines.push(
      `Try: ${diagnostic.remedies
        .slice(0, 2)
        .map(({ title, description }) => `${title} — ${description}`)
        .join(' ')}`,
    );
  }
  return lines.join('\n\n');
}

export function buildPhysicsMonacoMarkers(
  diagnostics: readonly PhysicsDiagnostic[],
): PhysicsMonacoMarker[] {
  return diagnostics.flatMap((diagnostic) =>
    diagnostic.sourceLocations.map((location) => ({
      diagnosticId: diagnostic.id,
      role: location.role,
      severity: diagnostic.severity,
      line: location.line,
      ...(location.startColumn === undefined ? {} : { startColumn: location.startColumn }),
      ...(location.endColumn === undefined ? {} : { endColumn: location.endColumn }),
      message: physicsDiagnosticMarkerMessage(diagnostic, location.role),
      code: diagnostic.code,
    })),
  );
}

function locationContains(location: PhysicsSourceLocation, line: number, column?: number): boolean {
  if (location.line !== line) return false;
  if (column === undefined || location.startColumn === undefined) return true;
  const endColumn = location.endColumn ?? location.startColumn + 1;
  return column >= location.startColumn && column < endColumn;
}

const ROLE_PRIORITY: Record<PhysicsSourceLocation['role'], number> = {
  primary: 0,
  contributor: 1,
  related: 2,
};

const SEVERITY_PRIORITY: Record<PreflightSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function physicsDiagnosticsAtPosition(
  diagnostics: readonly PhysicsDiagnostic[],
  line: number,
  column?: number,
  preferredDiagnosticId?: string | null,
): PhysicsDiagnostic[] {
  return diagnostics
    .flatMap((diagnostic, index) => {
      const location = diagnostic.sourceLocations.find((candidate) =>
        locationContains(candidate, line, column),
      );
      return location ? [{ diagnostic, location, index }] : [];
    })
    .toSorted(
      (a, b) =>
        Number(b.diagnostic.id === preferredDiagnosticId) -
          Number(a.diagnostic.id === preferredDiagnosticId) ||
        ROLE_PRIORITY[a.location.role] - ROLE_PRIORITY[b.location.role] ||
        SEVERITY_PRIORITY[a.diagnostic.severity] - SEVERITY_PRIORITY[b.diagnostic.severity] ||
        a.index - b.index,
    )
    .map(({ diagnostic }) => diagnostic);
}

function primaryLine(diagnostic: PhysicsDiagnostic): number {
  return (
    diagnostic.sourceLocations.find(({ role }) => role === 'primary')?.line ??
    diagnostic.sourceLocations[0]?.line ??
    Number.POSITIVE_INFINITY
  );
}

export function orderedPhysicsDiagnostics(
  diagnostics: readonly PhysicsDiagnostic[],
): PhysicsDiagnostic[] {
  return diagnostics
    .filter(({ sourceLocations }) => sourceLocations.length > 0)
    .map((diagnostic, index) => ({ diagnostic, index }))
    .toSorted(
      (a, b) =>
        primaryLine(a.diagnostic) - primaryLine(b.diagnostic) ||
        SEVERITY_PRIORITY[a.diagnostic.severity] - SEVERITY_PRIORITY[b.diagnostic.severity] ||
        a.index - b.index,
    )
    .map(({ diagnostic }) => diagnostic);
}

export function adjacentPhysicsDiagnostic(
  diagnostics: readonly PhysicsDiagnostic[],
  selectedDiagnosticId: string | null,
  direction: 1 | -1,
): PhysicsDiagnostic | null {
  const ordered = orderedPhysicsDiagnostics(diagnostics);
  if (ordered.length === 0) return null;
  const selectedIndex = ordered.findIndex(({ id }) => id === selectedDiagnosticId);
  if (selectedIndex < 0) return direction === 1 ? ordered[0] : ordered.at(-1)!;
  return ordered[(selectedIndex + direction + ordered.length) % ordered.length];
}

/**
 * PI-6 registers Monaco's code-action channel, but deliberately exposes no
 * edits. PI-8 will add a resolver that can prove and preview safe source edits.
 */
export function physicsCodeActions(): readonly never[] {
  return [];
}
