import { FABRIC_PROFILES } from './embroidery-registry.ts';
import type {
  CompensationTensor,
  DirectionalCompensationPreview,
  HeadingCompensationComponents,
  MaterialIntent,
  ResolvedDirectionalCompensation,
} from './types.ts';

const EPSILON = 1e-12;

function clean(value: number): number {
  return Math.abs(value) < EPSILON ? 0 : value;
}

function normalizeHeading(heading: number): number {
  if (!Number.isFinite(heading)) throw new Error('compensation heading must be finite');
  return ((heading % 360) + 360) % 360;
}

function validateAxisValue(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

/**
 * Build a signed symmetric tensor whose eigenvectors follow the fabric grain
 * and cross-grain axes. Positive values expand; negative values contract.
 */
export function compensationTensor(
  grainHeading: number,
  alongGrainMM: number,
  acrossGrainMM: number,
): CompensationTensor {
  validateAxisValue('along-grain compensation', alongGrainMM);
  validateAxisValue('across-grain compensation', acrossGrainMM);
  const radians = (normalizeHeading(grainHeading) * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  return {
    xx: clean(alongGrainMM * sin * sin + acrossGrainMM * cos * cos),
    xy: clean((alongGrainMM - acrossGrainMM) * sin * cos),
    yy: clean(alongGrainMM * cos * cos + acrossGrainMM * sin * sin),
  };
}

function projection(tensor: CompensationTensor, x: number, y: number): number {
  return clean(tensor.xx * x * x + 2 * tensor.xy * x * y + tensor.yy * y * y);
}

/** Project a compensation tensor onto a construction heading and its perpendicular. */
export function compensationForHeading(
  tensor: CompensationTensor,
  heading: number,
): HeadingCompensationComponents {
  const normalized = normalizeHeading(heading);
  const radians = (normalized * Math.PI) / 180;
  const alongX = Math.sin(radians);
  const alongY = Math.cos(radians);
  const acrossX = Math.cos(radians);
  const acrossY = -Math.sin(radians);
  return {
    heading: normalized,
    alongStitchMM: projection(tensor, alongX, alongY),
    acrossStitchMM: projection(tensor, acrossX, acrossY),
  };
}

/**
 * Resolve material intent into a directional recommendation. The fabric
 * preset supplies the existing scalar magnitude. Declared stretch distributes
 * that magnitude between grain axes while preserving their arithmetic mean.
 * Push remains zero until versioned sew-out measurements support it.
 */
export function resolveDirectionalCompensation(
  material: Readonly<MaterialIntent>,
): ResolvedDirectionalCompensation {
  const { stretchAlong, stretchAcross } = material;
  if (
    !Number.isFinite(stretchAlong) ||
    !Number.isFinite(stretchAcross) ||
    stretchAlong < 0 ||
    stretchAlong > 1 ||
    stretchAcross < 0 ||
    stretchAcross > 1
  ) {
    throw new Error('material stretch must be finite fractions from 0 to 1');
  }

  const preset = FABRIC_PROFILES[material.fabricPreset as keyof typeof FABRIC_PROFILES];
  const scalarPullMM = preset?.construction.pull ?? 0;
  const meanPreservingScale = 2 / (2 + stretchAlong + stretchAcross);
  const pullAlongGrainMM = scalarPullMM * (1 + stretchAlong) * meanPreservingScale;
  const pullAcrossGrainMM = scalarPullMM * (1 + stretchAcross) * meanPreservingScale;
  const pushAlongGrainMM = 0;
  const pushAcrossGrainMM = 0;

  return {
    grainHeading: normalizeHeading(material.grainHeading),
    pullAlongGrainMM,
    pullAcrossGrainMM,
    pushAlongGrainMM,
    pushAcrossGrainMM,
    pullTensor: compensationTensor(material.grainHeading, pullAlongGrainMM, pullAcrossGrainMM),
    pushTensor: compensationTensor(material.grainHeading, pushAlongGrainMM, pushAcrossGrainMM),
  };
}

/** Create the additive RunResult diagnostic without mutating machine state. */
export function directionalCompensationPreview(
  material: Readonly<MaterialIntent>,
  currentScalarPullMM: number,
): DirectionalCompensationPreview {
  validateAxisValue('current scalar pull compensation', currentScalarPullMM);
  const resolved = resolveDirectionalCompensation(material);
  const headings = [
    { axis: 'grain' as const, heading: resolved.grainHeading },
    { axis: 'cross-grain' as const, heading: normalizeHeading(resolved.grainHeading + 90) },
  ];
  return {
    appliedMode: 'legacy-scalar',
    currentScalarPullMM,
    resolved,
    samples: headings.map(({ axis, heading }) => {
      const pull = compensationForHeading(resolved.pullTensor, heading);
      return {
        axis,
        heading,
        scalarPullMM: currentScalarPullMM,
        pull,
        push: compensationForHeading(resolved.pushTensor, heading),
        pullDeltaAlongStitchMM: pull.alongStitchMM - currentScalarPullMM,
        pullDeltaAcrossStitchMM: pull.acrossStitchMM - currentScalarPullMM,
      };
    }),
  };
}
