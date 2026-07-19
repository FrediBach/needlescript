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
 * Extend both ends of an open physical path by the tensor projection along
 * each endpoint tangent. The path is expected to be in final hoop space;
 * closed paths must be filtered by the caller because endpoint extension does
 * not widen a contour.
 */
export function compensateOpenPathEnds(
  path: readonly [number, number][],
  pullTensor: CompensationTensor,
): [number, number][] {
  if (path.length < 2) return path.map(([x, y]) => [x, y]);

  const extend = (
    endpoint: readonly [number, number],
    neighbor: readonly [number, number],
  ): [number, number] => {
    const dx = endpoint[0] - neighbor[0];
    const dy = endpoint[1] - neighbor[1];
    const length = Math.hypot(dx, dy);
    if (!(length > EPSILON)) return [endpoint[0], endpoint[1]];
    const heading = normalizeHeading((Math.atan2(dx, dy) * 180) / Math.PI);
    const extension = Math.max(0, compensationForHeading(pullTensor, heading).alongStitchMM);
    return [endpoint[0] + (dx / length) * extension, endpoint[1] + (dy / length) * extension];
  };

  const last = path.length - 1;
  let startNeighbor = 1;
  while (
    startNeighbor < path.length &&
    Math.hypot(path[startNeighbor][0] - path[0][0], path[startNeighbor][1] - path[0][1]) <= EPSILON
  )
    startNeighbor++;
  let endNeighbor = last - 1;
  while (
    endNeighbor >= 0 &&
    Math.hypot(path[endNeighbor][0] - path[last][0], path[endNeighbor][1] - path[last][1]) <=
      EPSILON
  )
    endNeighbor--;
  if (startNeighbor >= path.length || endNeighbor < 0) return path.map(([x, y]) => [x, y]);

  const start = extend(path[0], path[startNeighbor]);
  const end = extend(path[last], path[endNeighbor]);
  return [start, ...path.slice(1, -1).map(([x, y]) => [x, y] as [number, number]), end];
}

/**
 * Resolve material intent into a directional recommendation. The fabric
 * preset supplies the existing scalar magnitude. Declared stretch distributes
 * that magnitude between grain axes while preserving their arithmetic mean.
 * Push remains zero until versioned sew-out measurements support it.
 */
export function resolveDirectionalCompensation(
  material: Readonly<MaterialIntent>,
  meanPullOverrideMM?: number,
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

  if (
    meanPullOverrideMM !== undefined &&
    (!Number.isFinite(meanPullOverrideMM) || meanPullOverrideMM < 0)
  )
    throw new Error('mean pull compensation override must be a non-negative finite number');
  const preset = FABRIC_PROFILES[material.fabricPreset as keyof typeof FABRIC_PROFILES];
  const scalarPullMM = meanPullOverrideMM ?? preset?.construction.pull ?? 0;
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
  options: {
    mode?: 'legacy' | 'directional';
    pullCompExplicit?: boolean;
  } = {},
): DirectionalCompensationPreview {
  validateAxisValue('current scalar pull compensation', currentScalarPullMM);
  const explicit = options.pullCompExplicit ?? false;
  const applyExplicitToTensor = explicit && options.mode === 'directional';
  const resolved = resolveDirectionalCompensation(
    material,
    applyExplicitToTensor ? currentScalarPullMM : undefined,
  );
  const preset = FABRIC_PROFILES[material.fabricPreset as keyof typeof FABRIC_PROFILES];
  const headings = [
    { axis: 'grain' as const, heading: resolved.grainHeading },
    { axis: 'cross-grain' as const, heading: normalizeHeading(resolved.grainHeading + 90) },
  ];
  return {
    appliedMode: options.mode === 'directional' ? 'directional-satin' : 'legacy-scalar',
    fillEndpointMode: options.mode === 'directional' ? 'directional-open-path' : 'legacy-scalar',
    currentScalarPullMM,
    pullMagnitudeSource: applyExplicitToTensor
      ? 'explicit-pullcomp'
      : preset
        ? 'fabric-profile'
        : 'none',
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
