import { describe, expect, it } from 'vitest';
import { run, type PhysicsDiagnostic, type PhysicsReport } from '../lib/engine.ts';
import {
  applyPhysicsSourceEdit,
  comparePhysicsQuickFix,
  physicsQuickFixForDiagnostic,
} from './physics-remedies-model.ts';

const baseReport = run('fd 1', { physicsAnalysis: 'full' }).physics!;

function diagnostic(overrides: Partial<PhysicsDiagnostic> = {}): PhysicsDiagnostic {
  return {
    id: 'finding-1',
    fingerprint: 'fingerprint-1',
    code: 'fill.border-overlap-too-small',
    category: 'fill',
    severity: 'warning',
    evidence: 'engine-derived',
    thresholdVersion: 'test-thresholds-v1',
    evidenceReferences: [],
    title: 'Fill and border overlap too little',
    explanation: 'The fill needs more registration overlap.',
    sourceLocations: [{ line: 2, role: 'primary' }],
    geometry: [],
    playbackRanges: [],
    remedies: [],
    ...overrides,
  };
}

function report(diagnostics: PhysicsDiagnostic[]): PhysicsReport {
  return {
    ...baseReport,
    diagnostics,
    summary: {
      error: diagnostics.filter(({ severity }) => severity === 'error').length,
      warning: diagnostics.filter(({ severity }) => severity === 'warning').length,
      info: diagnostics.filter(({ severity }) => severity === 'info').length,
    },
  };
}

function resolvedFix(source: string, finding: PhysicsDiagnostic) {
  const fix = physicsQuickFixForDiagnostic(source, finding, baseReport.profile);
  expect(fix).toBeDefined();
  return fix!;
}

describe('physics guided remedies', () => {
  it('previews and applies a traced literal fillinset adjustment', () => {
    const source = 'fillinset 0.5\nbeginfill fd 10 endfill';
    const fix = resolvedFix(source, diagnostic());
    expect(fix.title).toBe('Reduce literal fill inset');
    expect(fix.diff).toEqual({
      line: 1,
      before: 'fillinset 0.5',
      after: 'fillinset 0.25',
    });
    expect(applyPhysicsSourceEdit(source, fix.edit)).toBe(
      'fillinset 0.25\nbeginfill fd 10 endfill',
    );
  });

  it('resolves a real construction diagnostic through its primary source line', () => {
    const source = `lock 0 autotrim 0 maxdensity 0 fillunderlay 'off'
fillspacing 2 filllen 2 fillinset 2 beginfill repeat 4 [ fd 20 rt 90 ] endfill
satin 4 repeat 4 [ fd 20 rt 90 ] satin 0`;
    const result = run(source, { physicsAnalysis: 'full' });
    const finding = result.physics?.diagnostics.find(
      ({ code }) => code === 'fill.border-overlap-too-small',
    );
    expect(finding).toBeDefined();
    const fix = resolvedFix(source, finding!);
    expect(fix.diff.before).toContain('fillinset 2 beginfill');
    expect(fix.diff.after).toContain('fillinset 1.75 beginfill');
  });

  it('adjusts literal underlay, density, and split-overlap settings within physical bounds', () => {
    const underlay = resolvedFix(
      'underlayinset 0.4\nsatin 4 fd 10 satin 0',
      diagnostic({
        code: 'construction.underlay-outside-topping',
        category: 'underlay',
        sourceLocations: [{ line: 2, role: 'primary' }],
      }),
    );
    expect(underlay.diff.after).toBe('underlayinset 0.65');

    const spacing = resolvedFix(
      'fillspacing 0.4\nbeginfill fd 10 endfill',
      diagnostic({
        code: 'coverage.density-hotspot',
        category: 'coverage',
        sourceLocations: [{ line: 2, role: 'primary' }],
      }),
    );
    expect(spacing.diff.after).toBe('fillspacing 0.5');

    const overlap = resolvedFix(
      "satinsplitoverlap 0.5\nsatinwide 'split' satin 10 fd 10 satin 0",
      diagnostic({
        code: 'satin.split-overlap-hotspot',
        category: 'satin',
        sourceLocations: [{ line: 2, role: 'primary' }],
      }),
    );
    expect(overlap.diff.after).toBe('satinsplitoverlap 0.4');
  });

  it('inserts or adjusts autotrim without editing a machine profile or suppression threshold', () => {
    const finding = diagnostic({
      code: 'travel.long-untrimmed-jump',
      category: 'travel',
      sourceLocations: [{ line: 1, role: 'primary' }],
    });
    const inserted = resolvedFix('up setxy 20 0 down', finding);
    expect(inserted.diff.after).toBe(
      `autotrim ${baseReport.profile.maximumPreferredJumpMM} up setxy 20 0 down`,
    );

    const adjusted = resolvedFix(
      'autotrim 0\nup setxy 20 0 down',
      diagnostic({ ...finding, sourceLocations: [{ line: 2, role: 'primary' }] }),
    );
    expect(adjusted.diff.after).toBe(`autotrim ${baseReport.profile.maximumPreferredJumpMM}`);

    const sameLine = resolvedFix('autotrim 0 up setxy 20 0 down', finding);
    expect(sameLine.diff.after).toBe(
      `autotrim ${baseReport.profile.maximumPreferredJumpMM} up setxy 20 0 down`,
    );
  });

  it('enables split satin only for a proven top-level straight numeric column', () => {
    const finding = diagnostic({
      code: 'satin.snag-risk',
      category: 'satin',
      sourceLocations: [{ line: 1, role: 'primary' }],
    });
    const fix = resolvedFix('satin 10 fd 8 satin 0', finding);
    expect(fix.diff.after).toBe("satinwide 'split' satin 10 fd 8 satin 0");

    expect(
      physicsQuickFixForDiagnostic('satin @shape fd 8', finding, baseReport.profile),
    ).toBeUndefined();
    expect(
      physicsQuickFixForDiagnostic('repeat 2 [ satin 10 fd 8 ]', finding, baseReport.profile),
    ).toBeUndefined();
    expect(
      physicsQuickFixForDiagnostic('satin 10 arc 90 8', finding, baseReport.profile),
    ).toBeUndefined();
  });

  it('leaves expressions, reporters, scoped settings, and ambiguous attribution as guidance-only', () => {
    expect(
      physicsQuickFixForDiagnostic(
        'fillinset :inset\nbeginfill fd 10 endfill',
        diagnostic(),
        baseReport.profile,
      ),
    ).toBeUndefined();
    expect(
      physicsQuickFixForDiagnostic(
        'fillinset (0.5) + :extra\nbeginfill fd 10 endfill',
        diagnostic(),
        baseReport.profile,
      ),
    ).toBeUndefined();
    expect(
      physicsQuickFixForDiagnostic(
        'stitchscope [ fillinset 0.5 beginfill fd 10 endfill ]',
        diagnostic({ sourceLocations: [{ line: 1, role: 'primary' }] }),
        baseReport.profile,
      ),
    ).toBeUndefined();
    expect(
      physicsQuickFixForDiagnostic(
        'density 0.4\nfd 10',
        diagnostic({ code: 'coverage.density-hotspot', category: 'coverage' }),
        baseReport.profile,
      ),
    ).toBeUndefined();
    expect(
      physicsQuickFixForDiagnostic(
        'maxdensity 9\nfd 10',
        diagnostic({ code: 'coverage.density-hotspot', category: 'coverage' }),
        baseReport.profile,
      ),
    ).toBeUndefined();
  });

  it('calls out newly introduced findings at equal or higher severity', () => {
    const target = diagnostic();
    const existingInfo = diagnostic({
      id: 'note-1',
      fingerprint: 'note-fingerprint',
      code: 'machine.trim-manual',
      category: 'machine',
      severity: 'info',
      title: 'Manual trim required',
    });
    const newRisk = diagnostic({
      id: 'risk-2',
      fingerprint: 'risk-fingerprint',
      code: 'fill.inset-region-change',
      title: 'Fill inset changed region topology',
    });
    const newBlocker = diagnostic({
      id: 'error-1',
      fingerprint: 'error-fingerprint',
      code: 'construction.layer-order',
      category: 'underlay',
      severity: 'error',
      title: 'Construction layer order reversed',
    });
    const comparison = comparePhysicsQuickFix(
      report([target, existingInfo]),
      report([existingInfo, newRisk, newBlocker]),
      target,
    );
    expect(comparison.targetResolved).toBe(true);
    expect(comparison.newEqualOrHigher).toEqual([
      expect.objectContaining({ code: 'fill.inset-region-change', severity: 'warning' }),
      expect.objectContaining({ code: 'construction.layer-order', severity: 'error' }),
    ]);
  });
});
