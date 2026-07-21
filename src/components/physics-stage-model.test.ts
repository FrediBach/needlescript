import { describe, expect, it } from 'vitest';
import type { DiagnosticGeometry, PhysicsDiagnostic } from '../lib/engine.ts';
import {
  buildPhysicsOverlayFixture,
  hitTestPhysicsDiagnostics,
  physicsPlaybackSpans,
} from './physics-stage-model.ts';

function diagnostic(
  id: string,
  geometry: DiagnosticGeometry[],
  overrides: Partial<PhysicsDiagnostic> = {},
): PhysicsDiagnostic {
  return {
    id,
    fingerprint: id,
    code: 'fixture',
    category: 'stitch',
    severity: 'warning',
    evidence: 'engine-derived',
    title: id,
    explanation: id,
    sourceLocations: [],
    geometry,
    playbackRanges: [],
    remedies: [],
    ...overrides,
  };
}

describe('physics stage overlay fixtures', () => {
  it.each([
    ['point', [{ kind: 'points', role: 'hotspot', points: [{ x: 1, y: 2 }] }], 'point'],
    [
      'segment',
      [
        {
          kind: 'polyline',
          role: 'travel',
          points: [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
          ],
        },
      ],
      'segment',
    ],
    ['cell', [{ kind: 'cell', role: 'hotspot', x: -2, y: -1, width: 4, height: 2 }], 'cell'],
    [
      'polyline',
      [
        {
          kind: 'polyline',
          role: 'envelope',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 3 },
            { x: 4, y: 0 },
          ],
        },
      ],
      'polyline',
    ],
    [
      'region',
      [
        {
          kind: 'region',
          role: 'overlap',
          rings: [
            [
              { x: -2, y: -2 },
              { x: 2, y: -2 },
              { x: 2, y: 2 },
              { x: -2, y: 2 },
            ],
          ],
        },
      ],
      'region',
    ],
  ] as const)('builds a deterministic %s fixture', (_name, geometry, expectedKind) => {
    const fixture = buildPhysicsOverlayFixture(
      diagnostic('fixture', geometry as unknown as DiagnosticGeometry[]),
    );
    expect(fixture.primitives.map(({ kind }) => kind)).toEqual([expectedKind]);
    expect(fixture).toMatchSnapshot();
  });

  it('returns every overlapping finding in stable distance/severity order', () => {
    const point = diagnostic(
      'point',
      [{ kind: 'points', role: 'hotspot', points: [{ x: 0, y: 0 }] }],
      { severity: 'info' },
    );
    const cell = diagnostic(
      'cell',
      [{ kind: 'cell', role: 'hotspot', x: -1, y: -1, width: 2, height: 2 }],
      { severity: 'error' },
    );
    expect(hitTestPhysicsDiagnostics([point, cell], { x: 0, y: 0 }, 0.5)).toEqual([
      { diagnostic: cell, distance: 0 },
      { diagnostic: point, distance: 0 },
    ]);
  });

  it('hit-tests region interiors and polyline proximity without relying on bounds alone', () => {
    const region = diagnostic('region', [
      {
        kind: 'region',
        role: 'overlap',
        rings: [
          [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 0, y: 4 },
          ],
        ],
      },
    ]);
    expect(hitTestPhysicsDiagnostics([region], { x: 0.5, y: 0.5 }, 0.1)).toHaveLength(1);
    expect(hitTestPhysicsDiagnostics([region], { x: 3.5, y: 3.5 }, 0.1)).toHaveLength(0);
  });
});

describe('physics playback spans', () => {
  it('preserves exact inclusive ranges and clips them to the final playback stream', () => {
    const finding = diagnostic('risk', [], {
      category: 'travel',
      playbackRanges: [
        { start: 8, end: 4 },
        { start: 12, end: 15 },
      ],
    });
    expect(physicsPlaybackSpans([finding], 14)).toEqual([
      {
        diagnosticId: 'risk',
        severity: 'warning',
        category: 'travel',
        start: 4,
        end: 8,
      },
      {
        diagnosticId: 'risk',
        severity: 'warning',
        category: 'travel',
        start: 12,
        end: 13,
      },
    ]);
  });
});
