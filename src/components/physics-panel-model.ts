import type {
  PhysicsDiagnostic,
  PhysicsDiagnosticCategory,
  PhysicsReport,
  PreflightSeverity,
  WarningLocation,
} from '../lib/engine.ts';
import type { PhysicsReportState } from '../physics-analysis-state.ts';

export interface PhysicsPanelFilters {
  severities: ReadonlySet<PreflightSeverity>;
  category: PhysicsDiagnosticCategory | 'all';
  selectedOnly: boolean;
}

const LEGACY_CODE_BY_LOCATION_KIND: Partial<
  Record<WarningLocation['kind'], PhysicsDiagnostic['code']>
> = {
  density: 'coverage.density-hotspot',
  stack: 'penetration.same-hole-stack',
  tiny: 'stitch.below-reliable-movement',
  satin: 'satin.snag-risk',
};

export function filterPhysicsDiagnostics(
  diagnostics: readonly PhysicsDiagnostic[],
  filters: PhysicsPanelFilters,
  selectedDiagnosticId: string | null,
): PhysicsDiagnostic[] {
  return diagnostics.filter(
    (diagnostic) =>
      filters.severities.has(diagnostic.severity) &&
      (filters.category === 'all' || diagnostic.category === filters.category) &&
      (!filters.selectedOnly || diagnostic.id === selectedDiagnosticId),
  );
}

export function groupPhysicsDiagnostics(
  diagnostics: readonly PhysicsDiagnostic[],
): Array<[PhysicsDiagnosticCategory, PhysicsDiagnostic[]]> {
  const groups = new Map<PhysicsDiagnosticCategory, PhysicsDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const group = groups.get(diagnostic.category);
    if (group) group.push(diagnostic);
    else groups.set(diagnostic.category, [diagnostic]);
  }
  return [...groups];
}

export function warningLocationCode(location: WarningLocation): string | undefined {
  return location.code ?? LEGACY_CODE_BY_LOCATION_KIND[location.kind];
}

/**
 * Keep the compatibility warning stream intact in RunResult while removing a
 * duplicate from the playground console for each structured occurrence shown.
 */
export function consoleWarningsWithoutStructuredDuplicates(
  warnings: readonly string[],
  locations: readonly WarningLocation[],
  report: PhysicsReport | undefined,
): Array<{ warning: string; index: number; location?: WarningLocation }> {
  const locationByIndex = new Map(locations.map((location) => [location.index, location]));
  const remainingByCode = new Map<string, number>();
  for (const diagnostic of report?.diagnostics ?? [])
    remainingByCode.set(diagnostic.code, (remainingByCode.get(diagnostic.code) ?? 0) + 1);

  return warnings.flatMap((warning, index) => {
    const location = locationByIndex.get(index);
    const code = location ? warningLocationCode(location) : undefined;
    const remaining = code ? (remainingByCode.get(code) ?? 0) : 0;
    if (code && remaining > 0) {
      remainingByCode.set(code, remaining - 1);
      return [];
    }
    return [{ warning, index, ...(location ? { location } : {}) }];
  });
}

function geometryPoints(diagnostic: PhysicsDiagnostic): Array<{ x: number; y: number }> {
  return diagnostic.geometry.flatMap((geometry) => {
    switch (geometry.kind) {
      case 'points':
      case 'polyline':
        return geometry.points;
      case 'cell':
        return [{ x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 }];
      case 'region':
        return geometry.rings.flat();
    }
  });
}

export function physicsDiagnosticLocation(diagnostic: PhysicsDiagnostic): WarningLocation {
  const kind: WarningLocation['kind'] =
    diagnostic.category === 'coverage'
      ? 'density'
      : diagnostic.category === 'penetration'
        ? 'stack'
        : diagnostic.category === 'hoop'
          ? 'overflow'
          : diagnostic.category === 'satin'
            ? 'satin'
            : 'fill';
  return {
    index: -1,
    points: geometryPoints(diagnostic),
    lines: [...new Set(diagnostic.sourceLocations.map(({ line }) => line))],
    kind,
    code: diagnostic.code,
    geometry: diagnostic.geometry,
  };
}

export function serializePhysicsDiagnosticReport(
  report: PhysicsReport,
  reportState: PhysicsReportState,
): string {
  return JSON.stringify(
    {
      kind: 'needlescript-physics-diagnostic-report',
      lifecycle: reportState,
      report,
    },
    null,
    2,
  );
}
