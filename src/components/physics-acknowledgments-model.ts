import type { PhysicsDiagnostic } from '../lib/engine.ts';

export const PHYSICS_ACKNOWLEDGMENTS_STORAGE_KEY = 'ns.physics.acknowledgments:v1';
export const PHYSICS_ACKNOWLEDGMENT_REASON_MAX_LENGTH = 500;

export interface PhysicsAcknowledgment {
  fingerprint: string;
  reason: string;
  acknowledgedAt: string;
}

interface StoredPhysicsAcknowledgments {
  version: 1;
  projects: Record<string, PhysicsAcknowledgment[]>;
}

const EMPTY_STORE: StoredPhysicsAcknowledgments = { version: 1, projects: {} };

function isAcknowledgment(value: unknown): value is PhysicsAcknowledgment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PhysicsAcknowledgment>;
  return (
    typeof candidate.fingerprint === 'string' &&
    candidate.fingerprint.length > 0 &&
    typeof candidate.reason === 'string' &&
    candidate.reason.trim().length > 0 &&
    candidate.reason.length <= PHYSICS_ACKNOWLEDGMENT_REASON_MAX_LENGTH &&
    typeof candidate.acknowledgedAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.acknowledgedAt))
  );
}

function readStore(storage: Pick<Storage, 'getItem'>): StoredPhysicsAcknowledgments {
  const raw = storage.getItem(PHYSICS_ACKNOWLEDGMENTS_STORAGE_KEY);
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPhysicsAcknowledgments>;
    if (parsed.version !== 1 || !parsed.projects || typeof parsed.projects !== 'object')
      return EMPTY_STORE;
    const projects = Object.fromEntries(
      Object.entries(parsed.projects).flatMap(([projectKey, acknowledgments]) => {
        if (!Array.isArray(acknowledgments)) return [];
        return [[projectKey, acknowledgments.filter(isAcknowledgment)]];
      }),
    );
    return { version: 1, projects };
  } catch {
    return EMPTY_STORE;
  }
}

export function readPhysicsAcknowledgments(
  storage: Pick<Storage, 'getItem'>,
  projectKey: string,
): Map<string, PhysicsAcknowledgment> {
  return new Map(
    (readStore(storage).projects[projectKey] ?? []).map((acknowledgment) => [
      acknowledgment.fingerprint,
      acknowledgment,
    ]),
  );
}

export function writePhysicsAcknowledgments(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  projectKey: string,
  acknowledgments: ReadonlyMap<string, PhysicsAcknowledgment>,
): void {
  const store = readStore(storage);
  const projects = { ...store.projects };
  if (acknowledgments.size > 0) projects[projectKey] = [...acknowledgments.values()];
  else delete projects[projectKey];
  storage.setItem(
    PHYSICS_ACKNOWLEDGMENTS_STORAGE_KEY,
    JSON.stringify({ version: 1, projects } satisfies StoredPhysicsAcknowledgments),
  );
}

export function canAcknowledgePhysicsDiagnostic(diagnostic: PhysicsDiagnostic): boolean {
  return diagnostic.severity !== 'error' && diagnostic.evidence !== 'hard-limit';
}

export function isPhysicsDiagnosticAcknowledged(
  diagnostic: PhysicsDiagnostic,
  acknowledgments: ReadonlyMap<string, PhysicsAcknowledgment>,
): boolean {
  return canAcknowledgePhysicsDiagnostic(diagnostic) && acknowledgments.has(diagnostic.fingerprint);
}

export function acknowledgePhysicsDiagnostic(
  acknowledgments: ReadonlyMap<string, PhysicsAcknowledgment>,
  diagnostic: PhysicsDiagnostic,
  reason: string,
  acknowledgedAt = new Date(),
): Map<string, PhysicsAcknowledgment> {
  if (!canAcknowledgePhysicsDiagnostic(diagnostic))
    throw new Error('Blockers and hard-limit findings cannot be acknowledged.');
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error('An acknowledgment reason is required.');
  if (normalizedReason.length > PHYSICS_ACKNOWLEDGMENT_REASON_MAX_LENGTH)
    throw new Error(
      `Acknowledgment reasons must be ${PHYSICS_ACKNOWLEDGMENT_REASON_MAX_LENGTH} characters or fewer.`,
    );
  const next = new Map(acknowledgments);
  next.set(diagnostic.fingerprint, {
    fingerprint: diagnostic.fingerprint,
    reason: normalizedReason,
    acknowledgedAt: acknowledgedAt.toISOString(),
  });
  return next;
}

export function removePhysicsAcknowledgment(
  acknowledgments: ReadonlyMap<string, PhysicsAcknowledgment>,
  fingerprint: string,
): Map<string, PhysicsAcknowledgment> {
  const next = new Map(acknowledgments);
  next.delete(fingerprint);
  return next;
}
