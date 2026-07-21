import { describe, expect, it } from 'vitest';
import {
  run,
  type PhysicsDiagnostic,
  type PhysicsReport,
  type WarningLocation,
} from '../lib/engine.ts';
import {
  consoleWarningsWithoutStructuredDuplicates,
  filterPhysicsDiagnostics,
  groupPhysicsDiagnostics,
  physicsDiagnosticLocation,
  serializePhysicsDiagnosticReport,
} from './physics-panel-model.ts';

function diagnostic(overrides: Partial<PhysicsDiagnostic> = {}): PhysicsDiagnostic {
  return {
    id: 'finding-1',
    fingerprint: 'fingerprint-1',
    code: 'coverage.density-hotspot',
    category: 'coverage',
    severity: 'warning',
    evidence: 'engine-derived',
    title: 'Dense thread coverage',
    explanation: 'Several layers overlap here.',
    sourceLocations: [{ line: 3, role: 'primary' }],
    geometry: [{ kind: 'cell', role: 'hotspot', x: 1, y: 2, width: 2, height: 4 }],
    playbackRanges: [],
    remedies: [
      {
        id: 'remedy-1',
        title: 'Increase spacing',
        description: 'Space the rows farther apart.',
        kind: 'guidance',
      },
    ],
    ...overrides,
  };
}

function report(diagnostics: PhysicsDiagnostic[]): PhysicsReport {
  const base = run('fd 1', { physicsAnalysis: 'full' }).physics!;
  return {
    ...base,
    diagnostics,
    summary: {
      error: diagnostics.filter(({ severity }) => severity === 'error').length,
      warning: diagnostics.filter(({ severity }) => severity === 'warning').length,
      info: diagnostics.filter(({ severity }) => severity === 'info').length,
    },
  };
}

describe('physics panel model', () => {
  it('filters in-memory diagnostics by severity, category, and current selection', () => {
    const diagnostics = [
      diagnostic(),
      diagnostic({
        id: 'finding-2',
        fingerprint: 'fingerprint-2',
        code: 'travel.long-untrimmed-jump',
        category: 'travel',
        severity: 'info',
      }),
      diagnostic({
        id: 'finding-3',
        fingerprint: 'fingerprint-3',
        code: 'hoop.unreachable',
        category: 'hoop',
        severity: 'error',
      }),
    ];

    expect(
      filterPhysicsDiagnostics(
        diagnostics,
        { severities: new Set(['warning', 'error']), category: 'coverage', selectedOnly: false },
        null,
      ).map(({ id }) => id),
    ).toEqual(['finding-1']);
    expect(
      filterPhysicsDiagnostics(
        diagnostics,
        { severities: new Set(['warning', 'error']), category: 'all', selectedOnly: true },
        'finding-3',
      ).map(({ id }) => id),
    ).toEqual(['finding-3']);
    expect(groupPhysicsDiagnostics(diagnostics).map(([category]) => category)).toEqual([
      'coverage',
      'travel',
      'hoop',
    ]);
  });

  it('removes one console warning per equivalent structured occurrence', () => {
    const locations: WarningLocation[] = [
      { index: 0, points: [], lines: [1], kind: 'density' },
      { index: 1, points: [], lines: [2], kind: 'density' },
    ];
    const retained = consoleWarningsWithoutStructuredDuplicates(
      ['first physical warning', 'second compatibility warning', 'non-physics note'],
      locations,
      report([diagnostic()]),
    );

    expect(retained.map(({ warning }) => warning)).toEqual([
      'second compatibility warning',
      'non-physics note',
    ]);
    expect(retained[0].location).toBe(locations[1]);
  });

  it('projects semantic geometry for linked selection and copies lifecycle context', () => {
    const finding = diagnostic();
    expect(physicsDiagnosticLocation(finding)).toMatchObject({
      points: [{ x: 2, y: 4 }],
      lines: [3],
      kind: 'density',
      code: finding.code,
    });

    const copied = JSON.parse(
      serializePhysicsDiagnosticReport(report([finding]), {
        sourceRevision: 4,
        reportRevision: 3,
        status: 'stale',
      }),
    ) as { kind: string; lifecycle: { status: string }; report: PhysicsReport };
    expect(copied.kind).toBe('needlescript-physics-diagnostic-report');
    expect(copied.lifecycle.status).toBe('stale');
    expect(copied.report.diagnostics[0].code).toBe(finding.code);
  });
});
