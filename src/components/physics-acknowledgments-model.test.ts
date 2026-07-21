import { describe, expect, it } from 'vitest';
import type { PhysicsDiagnostic } from '../lib/engine.ts';
import {
  acknowledgePhysicsDiagnostic,
  canAcknowledgePhysicsDiagnostic,
  isPhysicsDiagnosticAcknowledged,
  PHYSICS_ACKNOWLEDGMENTS_STORAGE_KEY,
  readPhysicsAcknowledgments,
  removePhysicsAcknowledgment,
  writePhysicsAcknowledgments,
} from './physics-acknowledgments-model.ts';

function diagnostic(overrides: Partial<PhysicsDiagnostic> = {}): PhysicsDiagnostic {
  return {
    id: 'finding-1',
    fingerprint: 'fingerprint-1',
    code: 'coverage.density-hotspot',
    category: 'coverage',
    severity: 'warning',
    evidence: 'engine-derived',
    thresholdVersion: 'test-thresholds-v1',
    evidenceReferences: [],
    title: 'Dense thread coverage',
    explanation: 'Several layers overlap here.',
    sourceLocations: [{ line: 3, role: 'primary' }],
    geometry: [],
    playbackRanges: [],
    remedies: [],
    ...overrides,
  };
}

function memoryStorage(initial?: string): Pick<Storage, 'getItem' | 'setItem'> {
  let value = initial ?? null;
  return {
    getItem: (key) => (key === PHYSICS_ACKNOWLEDGMENTS_STORAGE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === PHYSICS_ACKNOWLEDGMENTS_STORAGE_KEY) value = next;
    },
  };
}

describe('physics acknowledgment model', () => {
  it('requires a reason and matches later occurrences by fingerprint', () => {
    const finding = diagnostic();
    expect(() => acknowledgePhysicsDiagnostic(new Map(), finding, '   ')).toThrow(
      /reason is required/,
    );

    const acknowledgments = acknowledgePhysicsDiagnostic(
      new Map(),
      finding,
      '  Decorative overlap approved after a test sew-out.  ',
      new Date('2026-07-21T12:00:00.000Z'),
    );
    expect(
      isPhysicsDiagnosticAcknowledged(diagnostic({ id: 'another-occurrence-id' }), acknowledgments),
    ).toBe(true);
    expect(acknowledgments.get(finding.fingerprint)).toEqual({
      fingerprint: finding.fingerprint,
      reason: 'Decorative overlap approved after a test sew-out.',
      acknowledgedAt: '2026-07-21T12:00:00.000Z',
    });
    expect(removePhysicsAcknowledgment(acknowledgments, finding.fingerprint).size).toBe(0);
  });

  it('does not allow blockers or hard-limit findings to be acknowledged', () => {
    const blocker = diagnostic({ severity: 'error' });
    const hardLimit = diagnostic({ evidence: 'hard-limit' });
    expect(canAcknowledgePhysicsDiagnostic(blocker)).toBe(false);
    expect(canAcknowledgePhysicsDiagnostic(hardLimit)).toBe(false);
    expect(() => acknowledgePhysicsDiagnostic(new Map(), blocker, 'Intentional')).toThrow(
      /cannot be acknowledged/,
    );
    expect(() => acknowledgePhysicsDiagnostic(new Map(), hardLimit, 'Intentional')).toThrow(
      /cannot be acknowledged/,
    );
  });

  it('persists projects independently and ignores malformed local data', () => {
    const storage = memoryStorage();
    const first = acknowledgePhysicsDiagnostic(new Map(), diagnostic(), 'Approved for project A.');
    writePhysicsAcknowledgments(storage, 'snippet:project-a', first);
    writePhysicsAcknowledgments(
      storage,
      'snippet:project-b',
      acknowledgePhysicsDiagnostic(
        new Map(),
        diagnostic({ fingerprint: 'fingerprint-2' }),
        'Approved for project B.',
      ),
    );

    expect([...readPhysicsAcknowledgments(storage, 'snippet:project-a')]).toEqual([...first]);
    expect([...readPhysicsAcknowledgments(storage, 'snippet:project-b').keys()]).toEqual([
      'fingerprint-2',
    ]);
    expect(readPhysicsAcknowledgments(memoryStorage('{not json'), 'project').size).toBe(0);
  });
});
