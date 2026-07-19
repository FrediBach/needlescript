import { apply, isIdentity, type Mat } from '../geometry/affine.ts';
import type { ConstructionRecord } from './construction-metadata.ts';
import { cloneRegion } from './construction-metadata.ts';
import { LIMITS } from './machine/limits.ts';
import { DEFAULT_PREFERRED_SATIN_CHORD_MM } from './satin-profile.ts';
import type {
  MachineCalibration,
  MachineOperationCapability,
  MachineProfile,
  MachineSpeedClass,
  ResolvedMachineCalibration,
  ResolvedMachineProfile,
  StitchEvent,
} from '../core/types.ts';

const SAME_HOLE_PENETRATION_LIMIT = 5;

export const MACHINE_PROFILE_LIMITS = Object.freeze({
  nameLength: { min: 1, max: 80 },
  minimumReliableMovementMM: { min: 0.1, max: 2 },
  maximumPreferredStitchMM: { min: 1, max: LIMITS.maxStitch },
  maximumPreferredJumpMM: { min: 1, max: 50 },
  calibrationScale: { min: 0.9, max: 1.1 },
  calibrationSkew: { min: -0.05, max: 0.05 },
  calibrationOffsetMM: { min: -5, max: 5 },
});

const OPERATION_CAPABILITIES: readonly MachineOperationCapability[] = [
  'automatic',
  'manual',
  'none',
];
const SPEED_CLASSES: readonly MachineSpeedClass[] = ['slow', 'standard', 'high-speed'];

function bounded(
  value: number | undefined,
  fallback: number,
  label: string,
  range: { readonly min: number; readonly max: number },
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < range.min || resolved > range.max)
    throw new RangeError(`${label} must be a finite number from ${range.min} to ${range.max}`);
  return resolved;
}

function choice<T extends string>(
  value: T | undefined,
  fallback: T,
  label: string,
  choices: readonly T[],
): T {
  if (value === undefined) return fallback;
  if (!choices.includes(value))
    throw new RangeError(
      `${label} must be one of ${choices.map((entry) => `'${entry}'`).join(', ')}`,
    );
  return value;
}

function resolveCalibration(input: MachineCalibration | undefined): ResolvedMachineCalibration {
  if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input)))
    throw new TypeError('machineProfile.calibration must be a serializable object');
  return {
    scaleX: bounded(
      input?.scaleX,
      1,
      'machineProfile.calibration.scaleX',
      MACHINE_PROFILE_LIMITS.calibrationScale,
    ),
    scaleY: bounded(
      input?.scaleY,
      1,
      'machineProfile.calibration.scaleY',
      MACHINE_PROFILE_LIMITS.calibrationScale,
    ),
    skewX: bounded(
      input?.skewX,
      0,
      'machineProfile.calibration.skewX',
      MACHINE_PROFILE_LIMITS.calibrationSkew,
    ),
    skewY: bounded(
      input?.skewY,
      0,
      'machineProfile.calibration.skewY',
      MACHINE_PROFILE_LIMITS.calibrationSkew,
    ),
    offsetXMM: bounded(
      input?.offsetXMM,
      0,
      'machineProfile.calibration.offsetXMM',
      MACHINE_PROFILE_LIMITS.calibrationOffsetMM,
    ),
    offsetYMM: bounded(
      input?.offsetYMM,
      0,
      'machineProfile.calibration.offsetYMM',
      MACHINE_PROFILE_LIMITS.calibrationOffsetMM,
    ),
  };
}

/** Resolve and validate a caller-supplied local profile into a complete serializable value. */
export function resolveMachineProfile(
  maximumDensityLayers: number,
  input?: MachineProfile,
): ResolvedMachineProfile {
  if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input)))
    throw new TypeError('machineProfile must be a serializable object');
  if (input !== undefined && typeof input.name !== 'string')
    throw new TypeError('machineProfile.name must be a string');
  const name = input?.name.trim() ?? 'NeedleScript default';
  if (
    name.length < MACHINE_PROFILE_LIMITS.nameLength.min ||
    name.length > MACHINE_PROFILE_LIMITS.nameLength.max
  )
    throw new RangeError(
      `machineProfile.name must contain ${MACHINE_PROFILE_LIMITS.nameLength.min}–${MACHINE_PROFILE_LIMITS.nameLength.max} characters`,
    );

  const minimumReliableMovementMM = bounded(
    input?.minimumReliableMovementMM,
    LIMITS.minStitch,
    'machineProfile.minimumReliableMovementMM',
    MACHINE_PROFILE_LIMITS.minimumReliableMovementMM,
  );
  const maximumPreferredSewnStitchMM = bounded(
    input?.maximumPreferredStitchMM,
    DEFAULT_PREFERRED_SATIN_CHORD_MM,
    'machineProfile.maximumPreferredStitchMM',
    MACHINE_PROFILE_LIMITS.maximumPreferredStitchMM,
  );
  if (maximumPreferredSewnStitchMM < minimumReliableMovementMM)
    throw new RangeError(
      'machineProfile.maximumPreferredStitchMM must be at least minimumReliableMovementMM',
    );

  return {
    source: input ? 'run-options' : 'default',
    name,
    minimumReliableMovementMM,
    maximumStitchMM: LIMITS.maxStitch,
    maximumPreferredSewnStitchMM,
    maximumPreferredSatinStitchMM: maximumPreferredSewnStitchMM,
    maximumPreferredJumpMM: bounded(
      input?.maximumPreferredJumpMM,
      LIMITS.maxStitch,
      'machineProfile.maximumPreferredJumpMM',
      MACHINE_PROFILE_LIMITS.maximumPreferredJumpMM,
    ),
    maximumConsecutiveStitches: 20_000,
    maximumDensityLayers,
    sameHolePenetrationLimit: SAME_HOLE_PENETRATION_LIMIT,
    trimCapability: choice(
      input?.trimCapability,
      'automatic',
      'machineProfile.trimCapability',
      OPERATION_CAPABILITIES,
    ),
    colorChangeCapability: choice(
      input?.colorChangeCapability,
      'automatic',
      'machineProfile.colorChangeCapability',
      OPERATION_CAPABILITIES,
    ),
    speedClass: choice(input?.speedClass, 'standard', 'machineProfile.speedClass', SPEED_CLASSES),
    calibration: resolveCalibration(input?.calibration),
  };
}

export function machineCalibrationMatrix(calibration: ResolvedMachineCalibration): Mat {
  return [
    calibration.scaleX,
    calibration.skewY,
    calibration.skewX,
    calibration.scaleY,
    calibration.offsetXMM,
    calibration.offsetYMM,
  ];
}

export function isIdentityMachineCalibration(calibration: ResolvedMachineCalibration): boolean {
  return isIdentity(machineCalibrationMatrix(calibration));
}

export interface CalibratedEventStream {
  events: StitchEvent[];
  eventMap: ReadonlyMap<StitchEvent, StitchEvent>;
}

/** Apply the resolved correction without mutating the authored event array. */
export function applyMachineCalibration(
  events: readonly StitchEvent[],
  calibration: ResolvedMachineCalibration,
): CalibratedEventStream {
  const matrix = machineCalibrationMatrix(calibration);
  const eventMap = new Map<StitchEvent, StitchEvent>();
  const corrected = events.map((event) => {
    const [x, y] = apply(matrix, event.x, event.y);
    const next = { ...event, x, y };
    eventMap.set(event, next);
    return next;
  });
  return { events: corrected, eventMap };
}

export function applyMachineCalibrationToPoints(
  points: readonly { x: number; y: number }[],
  calibration: ResolvedMachineCalibration,
): { x: number; y: number }[] {
  const matrix = machineCalibrationMatrix(calibration);
  return points.map((point) => {
    const [x, y] = apply(matrix, point.x, point.y);
    return { x, y };
  });
}

const calibrateTuple = (matrix: Mat, point: readonly [number, number]): [number, number] =>
  apply(matrix, point[0], point[1]);

/** Calibrate explicit construction geometry while retaining corrected event identity. */
export function applyMachineCalibrationToConstructionRecords(
  records: readonly ConstructionRecord[],
  calibration: ResolvedMachineCalibration,
  eventMap: ReadonlyMap<StitchEvent, StitchEvent>,
): ConstructionRecord[] {
  const matrix = machineCalibrationMatrix(calibration);
  return records.map((record) => {
    const events = record.events.map((entry) => ({
      ...entry,
      event: eventMap.get(entry.event) ?? entry.event,
    }));
    if (record.kind === 'fill')
      return {
        ...record,
        region: cloneRegion(record.region).map((ring) =>
          ring.map((point) => calibrateTuple(matrix, point)),
        ),
        authoredRegion: cloneRegion(record.authoredRegion).map((ring) =>
          ring.map((point) => calibrateTuple(matrix, point)),
        ),
        connectors: record.connectors.map((connector) => ({
          ...connector,
          from: calibrateTuple(matrix, connector.from),
          to: calibrateTuple(matrix, connector.to),
        })),
        events,
      };
    return {
      ...record,
      sections: record.sections.map((section) => ({
        a: calibrateTuple(matrix, section.a),
        b: calibrateTuple(matrix, section.b),
      })),
      events,
    };
  });
}

/** Re-split corrected moves that calibration stretched beyond the hard machine ceiling. */
export function enforceMaximumMovement(
  events: readonly StitchEvent[],
  maximumMM: number,
): StitchEvent[] {
  const output: StitchEvent[] = [];
  let previous: { x: number; y: number } = { x: 0, y: 0 };
  for (const event of events) {
    if (event.t !== 'stitch' && event.t !== 'jump') {
      output.push(event);
      continue;
    }
    const dx = event.x - previous.x;
    const dy = event.y - previous.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / maximumMM));
    for (let step = 1; step < steps; step++)
      output.push({
        ...event,
        x: previous.x + (dx * step) / steps,
        y: previous.y + (dy * step) / steps,
      });
    output.push(event);
    previous = event;
  }
  return output;
}
