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
  'fill.connector-outside-region',
  'fill.edge-run-border-stack',
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
        playbackRanges: [],
      }),
    );
  });

  it('maps existing locations to point geometry and reports default assumptions', () => {
    const result = run('lock 0\nfd 0.1\nfd 0.1');
    const diagnostic = result.physics?.diagnostics.find(
      ({ code }) => code === 'stitch.below-reliable-movement',
    );

    expect(diagnostic?.geometry).toEqual([
      {
        kind: 'points',
        role: 'hotspot',
        points: [
          { x: 0, y: 0.1 },
          { x: 0, y: 0.2 },
        ],
      },
    ]);
    expect(result.physics?.assumptions.map(({ key }) => key)).toEqual([
      'machine-profile',
      'fabric-profile',
    ]);
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
});
