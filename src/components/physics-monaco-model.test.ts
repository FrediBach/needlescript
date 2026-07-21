import { describe, expect, it } from 'vitest';
import { run, type PhysicsDiagnostic } from '../lib/engine.ts';
import {
  adjacentPhysicsDiagnostic,
  buildPhysicsMonacoMarkers,
  COMPILER_MARKER_OWNER,
  PHYSICS_MARKER_OWNER,
  physicsCodeActions,
  physicsDiagnosticMarkerMessage,
  physicsDiagnosticsAtPosition,
} from './physics-monaco-model.ts';

function diagnostic(overrides: Partial<PhysicsDiagnostic> = {}): PhysicsDiagnostic {
  return {
    id: 'risk-1',
    fingerprint: 'fingerprint-1',
    code: 'coverage.density-hotspot',
    category: 'coverage',
    severity: 'warning',
    evidence: 'engine-derived',
    thresholdVersion: 'test-thresholds-v1',
    evidenceReferences: [],
    title: 'Thread coverage is concentrated here',
    explanation: 'Several fill passes overlap in this area.',
    measurements: [{ label: 'Coverage', value: 4.8, unit: 'layers', threshold: 3.5 }],
    sourceLocations: [
      { line: 6, startColumn: 2, endColumn: 10, role: 'primary' },
      { line: 4, role: 'contributor' },
      { line: 5, role: 'related' },
    ],
    geometry: [],
    playbackRanges: [],
    remedies: [
      {
        id: 'spacing',
        title: 'Increase spacing',
        description: 'Space the fill rows farther apart.',
        kind: 'guidance',
      },
    ],
    ...overrides,
  };
}

describe('Physics Monaco model', () => {
  it('keeps compiler and physics markers under independent owners', () => {
    expect(COMPILER_MARKER_OWNER).not.toBe(PHYSICS_MARKER_OWNER);
    expect(buildPhysicsMonacoMarkers([diagnostic()])).toEqual([
      expect.objectContaining({ diagnosticId: 'risk-1', line: 6, role: 'primary' }),
      expect.objectContaining({ diagnosticId: 'risk-1', line: 4, role: 'contributor' }),
      expect.objectContaining({ diagnosticId: 'risk-1', line: 5, role: 'related' }),
    ]);
  });

  it('builds rich marker and hover copy from measurements, evidence, explanation, and remedies', () => {
    const message = physicsDiagnosticMarkerMessage(diagnostic(), 'contributor');
    expect(message).toContain('Risk: Thread coverage is concentrated here');
    expect(message).toContain('Coverage: 4.8 layers; limit 3.5 layers');
    expect(message).toContain('Several fill passes overlap');
    expect(message).toContain('Evidence: Engine-derived');
    expect(message).toContain('Source role: contributor');
    expect(message).toContain('Try: Increase spacing');
  });

  it('resolves source-span hits, prefers primary attribution, and honors shared selection', () => {
    const primary = diagnostic();
    const contributor = diagnostic({
      id: 'risk-2',
      fingerprint: 'fingerprint-2',
      sourceLocations: [{ line: 6, role: 'contributor' }],
    });
    expect(physicsDiagnosticsAtPosition([contributor, primary], 6, 4)[0].id).toBe('risk-1');
    expect(physicsDiagnosticsAtPosition([contributor, primary], 6, 12)[0].id).toBe('risk-2');
    expect(physicsDiagnosticsAtPosition([primary, contributor], 6, 4, 'risk-2')[0].id).toBe(
      'risk-2',
    );
  });

  it('navigates by source line in both directions and wraps', () => {
    const lineSix = diagnostic();
    const lineTwo = diagnostic({
      id: 'risk-2',
      fingerprint: 'fingerprint-2',
      sourceLocations: [{ line: 2, role: 'primary' }],
    });
    expect(adjacentPhysicsDiagnostic([lineSix, lineTwo], null, 1)?.id).toBe('risk-2');
    expect(adjacentPhysicsDiagnostic([lineSix, lineTwo], 'risk-2', -1)?.id).toBe('risk-1');
    expect(adjacentPhysicsDiagnostic([lineSix, lineTwo], 'risk-1', 1)?.id).toBe('risk-2');
  });

  it('does not offer source edits without a current physics report', () => {
    expect(physicsCodeActions('', undefined, 1)).toEqual([]);
  });

  it('exposes a proven source edit through Monaco only at the attributed location', () => {
    const source = 'fillspacing 0.4\nbeginfill fd 10 endfill';
    const finding = diagnostic({ sourceLocations: [{ line: 2, role: 'primary' }] });
    const base = run('fd 1', { physicsAnalysis: 'full' }).physics!;
    const report = { ...base, diagnostics: [finding] };

    expect(physicsCodeActions(source, report, 2)).toEqual([
      expect.objectContaining({ diagnosticId: finding.id, title: 'Increase literal fillspacing' }),
    ]);
    expect(physicsCodeActions(source, report, 1)).toEqual([]);
  });
});
