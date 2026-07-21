import { describe, expect, it } from 'vitest';
import {
  assignPhysicsDiagnosticIdentities,
  buildPhysicsDiagnosticFingerprint,
  buildPhysicsReport,
  getPhysicsDiagnosticCatalogEntry,
  PHYSICS_DIAGNOSTIC_CATALOG,
  PHYSICS_REPORT_VERSION,
  run,
  validatePhysicsDiagnosticCatalog,
} from '../engine.ts';
import type {
  DiagnosticGeometry,
  PhysicsDiagnostic,
  PhysicsDiagnosticCatalogEntry,
  PhysicsSourceLocation,
  PreflightResult,
} from '../engine.ts';

const EMITTED_CODES = [
  'construction.layer-order',
  'construction.underlay-outside-topping',
  'coverage.density-hotspot',
  'fill.border-overlap-dense',
  'fill.border-overlap-too-small',
  'fill.compensation-outside-boundary',
  'fill.connector-outside-region',
  'fill.edge-run-border-stack',
  'fill.edge-run-collapse',
  'fill.edge-run-dense-overlap',
  'fill.edge-run-penetration-guard',
  'fill.inset-region-change',
  'fill.short-fragment-omitted',
  'fill.stagger-short-fragment',
  'hoop.field-overflow',
  'hoop.unreachable',
  'machine.color-change-manual',
  'machine.color-change-unsupported',
  'machine.continuous-stitch-run',
  'machine.trim-manual',
  'machine.trim-unsupported',
  'path.direction-change-cluster',
  'path.reversal-cluster',
  'penetration.near-hole-cluster',
  'penetration.same-hole-stack',
  'satin.snag-risk',
  'satin.split-overlap-hotspot',
  'stitch.below-reliable-movement',
  'stitch.long-sewn-float',
  'stitch.short-cluster',
  'travel.long-untrimmed-jump',
] as const;

function catalogEntry(overrides: Partial<PhysicsDiagnosticCatalogEntry> = {}) {
  const source = PHYSICS_DIAGNOSTIC_CATALOG[0];
  return {
    ...source,
    remedies: source.remedies.map((remedy) => ({ ...remedy })),
    ...overrides,
  } satisfies PhysicsDiagnosticCatalogEntry;
}

describe('physics diagnostic catalog', () => {
  it('covers every currently emitted code with complete semantic metadata', () => {
    expect(() => validatePhysicsDiagnosticCatalog()).not.toThrow();
    expect(PHYSICS_DIAGNOSTIC_CATALOG.map(({ code }) => code).toSorted()).toEqual(EMITTED_CODES);

    for (const entry of PHYSICS_DIAGNOSTIC_CATALOG) {
      expect(entry.category).toBeTruthy();
      expect(entry.evidence).toBeTruthy();
      expect(entry.explanation.trim()).not.toBe('');
      expect(entry.remedies.length).toBeGreaterThan(0);
      expect(entry.documentationId).toMatch(/^physics\./);
      expect(getPhysicsDiagnosticCatalogEntry(entry.code)).toBe(entry);
    }
  });

  it('rejects duplicate identities, missing documentation, empty guidance, and UI metadata', () => {
    const base = catalogEntry();
    expect(() => validatePhysicsDiagnosticCatalog([base, catalogEntry()])).toThrow(
      /duplicate code/,
    );
    expect(() =>
      validatePhysicsDiagnosticCatalog([
        base,
        catalogEntry({
          code: 'test.other',
          remedies: base.remedies.map((remedy) => ({ ...remedy })),
        }),
      ]),
    ).toThrow(/duplicate remedy id/);
    expect(() =>
      validatePhysicsDiagnosticCatalog([catalogEntry({ documentationId: ' ' })]),
    ).toThrow(/documentationId must not be empty/);
    expect(() =>
      validatePhysicsDiagnosticCatalog([
        catalogEntry({ remedies: [{ ...base.remedies[0], description: '' }] }),
      ]),
    ).toThrow(/remedy description must not be empty/);

    const withPresentationMetadata = {
      ...base,
      markerColor: '#f00',
    } as PhysicsDiagnosticCatalogEntry;
    expect(() => validatePhysicsDiagnosticCatalog([withPresentationMetadata])).toThrow(
      /unsupported metadata 'markerColor'/,
    );
  });
});

describe('physics diagnostic identity', () => {
  const sourceLocations: PhysicsSourceLocation[] = [
    { line: 9, role: 'contributor' },
    { line: 3, role: 'primary' },
  ];
  const points = (offset: number): Extract<DiagnosticGeometry, { kind: 'points' }>[] => [
    {
      kind: 'points',
      role: 'hotspot',
      points: [
        { x: 2.004 + offset, y: -0.004 },
        { x: 1, y: 4 },
      ],
    },
  ];

  it('canonicalizes ordering and quantizes semantic geometry to 0.01 mm', () => {
    const baseline = buildPhysicsDiagnosticFingerprint({
      code: 'coverage.density-hotspot',
      constructionIds: [8, 2],
      sourceLocations,
      geometry: points(0),
    });
    const reordered = buildPhysicsDiagnosticFingerprint({
      code: 'coverage.density-hotspot',
      constructionIds: [2, 8],
      sourceLocations: sourceLocations.toReversed(),
      geometry: [
        {
          kind: 'points',
          role: 'hotspot',
          points: points(0)[0].points.toReversed(),
        },
      ],
    });
    const belowQuantization = buildPhysicsDiagnosticFingerprint({
      code: 'coverage.density-hotspot',
      constructionIds: [8, 2],
      sourceLocations,
      geometry: points(0.0009),
    });
    const changed = buildPhysicsDiagnosticFingerprint({
      code: 'coverage.density-hotspot',
      constructionIds: [8, 2],
      sourceLocations,
      geometry: points(0.01),
    });

    expect(reordered).toBe(baseline);
    expect(belowQuantization).toBe(baseline);
    expect(changed).not.toBe(baseline);
  });

  it('assigns stable suffixes when fingerprints coexist', () => {
    const base: Omit<PhysicsDiagnostic, 'id' | 'fingerprint'> = {
      code: 'coverage.density-hotspot',
      category: 'coverage',
      severity: 'warning',
      evidence: 'heuristic',
      title: 'Title',
      explanation: 'Explanation',
      sourceLocations: [{ line: 1, role: 'primary' }],
      geometry: points(0),
      playbackRanges: [],
      remedies: [],
    };
    const low = { ...base, measurements: [{ label: 'layers', value: 4, unit: 'layers' as const }] };
    const high = {
      ...base,
      measurements: [{ label: 'layers', value: 8, unit: 'layers' as const }],
    };
    const forward = assignPhysicsDiagnosticIdentities([low, high]);
    const reverse = assignPhysicsDiagnosticIdentities([high, low]);
    const idsByValue = (items: PhysicsDiagnostic[]) =>
      Object.fromEntries(items.map((item) => [item.measurements?.[0].value, item.id]));
    const reworded = {
      ...low,
      severity: 'error' as const,
      title: 'Reworded title',
      explanation: 'Reworded explanation',
      remedies: [
        { id: 'changed', title: 'Changed', description: 'Changed', kind: 'guidance' as const },
      ],
    };

    expect(forward[0].fingerprint).toBe(forward[1].fingerprint);
    expect(buildPhysicsDiagnosticFingerprint(reworded)).toBe(forward[0].fingerprint);
    expect(new Set(forward.map(({ id }) => id)).size).toBe(2);
    expect(idsByValue(reverse)).toEqual(idsByValue(forward));
  });

  it('canonicalizes large closed regions without depending on start or winding', () => {
    const ring = Array.from({ length: 2_000 }, (_, index) => ({
      x: Math.cos((index / 2_000) * Math.PI * 2) * 10,
      y: Math.sin((index / 2_000) * Math.PI * 2) * 10,
    }));
    const rotated = [...ring.slice(731), ...ring.slice(0, 731)].toReversed();
    const fingerprint = (points: typeof ring) =>
      buildPhysicsDiagnosticFingerprint({
        code: 'fill.inset-region-change',
        sourceLocations: [{ line: 2, role: 'primary' }],
        geometry: [{ kind: 'region', role: 'boundary', rings: [points] }],
      });

    expect(fingerprint(rotated)).toBe(fingerprint(ring));
  });
});

describe('preflight compatibility adapter', () => {
  it('adds a versioned semantic report while retaining legacy ordering and policy', () => {
    const result = run("preflight 'warn'\nlock 0\nfd 0.1\nrepeat 12 [ fd 0.4 bk 0.4 ]");
    const physics = result.physics!;

    expect(physics.version).toBe(PHYSICS_REPORT_VERSION);
    expect(physics.policy).toBe(result.preflight?.mode);
    expect(physics.profile).toEqual(result.machineProfile);
    expect(physics.material).toEqual(result.material);
    expect(physics.diagnostics.map(({ code }) => code)).toEqual(
      result.preflight?.issues.map(({ code }) => code),
    );
    expect(physics.summary).toEqual({
      error: result.preflight?.summary.error,
      warning: result.preflight?.summary.warning,
      info: result.preflight?.summary.info,
    });
    expect(physics.diagnostics[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^physics-v1:/),
        fingerprint: expect.stringMatching(/^physics-v1:/),
        playbackRanges: expect.any(Array),
      }),
    );
  });

  it('maps existing locations to point geometry and reports default assumptions', () => {
    const result = run('lock 0\nfd 0.1\nfd 0.1');
    const diagnostic = result.physics?.diagnostics.find(
      ({ code }) => code === 'stitch.below-reliable-movement',
    );

    expect(diagnostic?.geometry).toEqual([
      expect.objectContaining({
        kind: 'points',
        role: 'hotspot',
        points: [
          { x: 0, y: 0.1 },
          { x: 0, y: 0.2 },
        ],
        anchor: { x: 0, y: 0.15000000000000002 },
        bounds: { minX: 0, minY: 0.1, maxX: 0, maxY: 0.2 },
      }),
    ]);
    expect(result.physics?.assumptions.map(({ key }) => key)).toEqual([
      'machine-profile',
      'fabric-profile',
    ]);
  });

  it('catalogs locatable fill warnings with their affected region', () => {
    const result = run(
      'lock 0 maxdensity 0 fillinset 10 beginfill repeat 4 [ fd 10 rt 90 ] endfill',
    );
    const diagnostic = result.physics?.diagnostics.find(
      ({ code }) => code === 'fill.inset-region-change',
    );

    expect(diagnostic).toEqual(
      expect.objectContaining({
        sourceLocations: expect.arrayContaining([expect.objectContaining({ role: 'primary' })]),
        geometry: expect.arrayContaining([
          expect.objectContaining({ kind: 'region', role: 'boundary' }),
        ]),
      }),
    );
    const issue = result.preflight?.issues.find(({ code }) => code === diagnostic?.code);
    expect(issue).toBeDefined();
    expect(result.warnings).toContain(issue!.message);
  });

  it('fails instead of silently dropping an uncatalogued emitted code', () => {
    const result = run('fd 1');
    const preflight: PreflightResult = {
      ...result.preflight!,
      issues: [
        {
          severity: 'warning',
          code: 'unknown.detector',
          message: 'Unknown',
          points: [],
          lines: [],
        },
      ],
    };

    expect(() => buildPhysicsReport({ preflight, material: result.material })).toThrow(
      /Unknown physics diagnostic code 'unknown.detector'/,
    );
  });

  it('retains exact event identity through final lock insertion', () => {
    const result = run('lock 0.7\nstitchlen 0.5\nfd 4.5', { physicsAnalysis: 'full' });
    const diagnostic = result.physics?.diagnostics.find(
      ({ code }) => code === 'stitch.short-cluster',
    );
    const playbackPoints = result.events.filter(({ t }) => t === 'stitch' || t === 'jump');

    expect(diagnostic?.playbackRanges.length).toBeGreaterThan(0);
    const attributed = diagnostic!.playbackRanges.flatMap(({ start, end }) =>
      playbackPoints.slice(start, end + 1),
    );
    expect(attributed.length).toBeGreaterThanOrEqual(9);
    expect(attributed.every(({ line }) => line === 3)).toBe(true);
  });

  it('adds construct geometry, source roles, and explicit generated-source reasons', () => {
    const result = run(`preflight 'warn' lock 0 autotrim 0 maxdensity 0 fillunderlay 'off'
      fillspacing 2 filllen 2 fillinset 2
      beginfill repeat 4 [ fd 20 rt 90 ] endfill
      satin 4 repeat 4 [ fd 20 rt 90 ] satin 0`);
    const overlap = result.physics?.diagnostics.find(
      ({ code }) => code === 'fill.border-overlap-too-small',
    );

    expect(overlap?.geometry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'region', role: 'boundary' }),
        expect.objectContaining({ kind: 'polyline', role: 'overlap' }),
      ]),
    );
    expect(overlap?.sourceLocations.map(({ role }) => role)).toContain('related');

    const synthetic: PreflightResult = {
      ...result.preflight!,
      issues: [
        {
          severity: 'warning',
          code: 'stitch.below-reliable-movement',
          message: 'Generated movement',
          points: [],
          lines: [],
        },
      ],
    };
    expect(
      buildPhysicsReport({ preflight: synthetic, material: result.material }).diagnostics[0]
        .sourceReason,
    ).toEqual(
      expect.objectContaining({
        kind: 'generated',
        explanation: expect.any(String),
      }),
    );
  });

  it('keeps library defaults policy-bound while full analysis is caller-controlled', () => {
    const source = 'lock 0 stitchlen 0.5 fd 4.5';
    const compatible = run(source);
    const full = run(source, { physicsAnalysis: 'full' });

    expect(
      compatible.physics?.diagnostics.some(({ code }) => code === 'stitch.short-cluster'),
    ).toBe(false);
    expect(full.physics?.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'stitch.short-cluster' }),
    );
    expect(full.physics?.policy).toBe('off');
    expect(full.preflight).toEqual(compatible.preflight);
    expect(full.events).toEqual(compatible.events);
    expect(full.warnings).toEqual(compatible.warnings);
    expect(full.warningLocations).toEqual(compatible.warningLocations);
  });

  it('keeps source policy behavior and event streams identical at full analysis breadth', () => {
    const source = 'lock 0 stitchlen 0.5 fd 4.5';
    const off = run(`preflight 'off'\n${source}`, { physicsAnalysis: 'full' });
    const warn = run(`preflight 'warn'\n${source}`, { physicsAnalysis: 'full' });
    const strict = run(`preflight 'strict'\n${source}`, { physicsAnalysis: 'full' });

    expect(off.events).toEqual(warn.events);
    expect(strict.events).toEqual(warn.events);
    expect(off.preflight?.issues.some(({ code }) => code === 'stitch.short-cluster')).toBe(false);
    expect(warn.preflight?.issues.some(({ code }) => code === 'stitch.short-cluster')).toBe(true);
    expect(strict.preflight?.issues).toEqual(warn.preflight?.issues);
    for (const result of [off, warn, strict])
      expect(result.physics?.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'stitch.short-cluster' }),
      );
  });

  it('leaves export blocking source-controlled when full analysis finds a blocker', () => {
    const source = "hoop '5x7'\nmoveto 70 0\nfd 1";
    const editorAnalysis = run(source, { physicsAnalysis: 'full' });

    expect(editorAnalysis.physics?.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'hoop.unreachable', severity: 'error' }),
    );
    expect(editorAnalysis.physics?.policy).toBe('off');
    expect(() => run(`preflight 'strict'\n${source}`, { physicsAnalysis: 'full' })).toThrow(
      /preflight strict failed \[hoop\.unreachable\]/,
    );
  });

  it('rejects unknown caller analysis levels', () => {
    expect(() => run('fd 1', { physicsAnalysis: 'maximum' as never })).toThrow(
      /physicsAnalysis must be 'preflight' or 'full'/,
    );
  });

  it('keeps full analysis bounded on a large event stream', () => {
    const result = run('lock 0 stitchlen 1 repeat 25000 [ fd 1 ]', {
      physicsAnalysis: 'full',
    });

    expect(result.events.length).toBeGreaterThanOrEqual(25_000);
    expect(result.physics?.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'machine.continuous-stitch-run' }),
    );
  });
});
