import type { FabricPreset, FillUnderlayMode, SatinUnderlayMode } from './embroidery-registry.ts';

export type SatinUnderlayPassKind = 'center' | 'edge' | 'zigzag';
export type FillUnderlayPassKind = 'edge' | 'tatami';

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

/** Shared bounds for current and future satin-underlay profile commands. */
export const SATIN_UNDERLAY_RANGES = {
  runningStitchLengthMM: { min: 0.4, max: 12 },
  edgeInsetMM: { min: 0, max: 10 },
  edgeInsetRatio: { min: 0, max: 0.5 },
  zigzagWidthRatio: { min: 0, max: 1 },
  zigzagSpacingMM: { min: 0.25, max: 5 },
} as const satisfies Record<string, NumericRange>;

/** Shared bounds for current and future fill-underlay profile commands. */
export const FILL_UNDERLAY_RANGES = {
  insetMM: { min: 0, max: 10 },
  stitchLengthMM: { min: 1, max: 7 },
  rowSpacingMM: { min: 0.25, max: 5 },
  minimumRegionAreaMM2: { min: 0, max: 1_000_000 },
} as const satisfies Record<string, NumericRange>;

export type SatinEdgeInset =
  | { readonly unit: 'mm'; readonly value: number }
  | { readonly unit: 'column-width-ratio'; readonly value: number };

export type SatinReturnRunPolicy = 'none' | 'reverse-center';

export interface SatinCenterUnderlayPass {
  readonly kind: 'center';
  readonly runningStitchLengthMM: number;
  readonly returnRun: 'reverse-center';
}

export interface SatinEdgeUnderlayPass {
  readonly kind: 'edge';
  readonly runningStitchLengthMM: number;
  readonly inset: SatinEdgeInset;
  readonly returnRun: 'opposite-edge';
}

export interface SatinZigzagUnderlayPass {
  readonly kind: 'zigzag';
  readonly widthRatio: number;
  readonly spacingMM: number;
  readonly returnRun: SatinReturnRunPolicy;
  readonly returnRunStitchLengthMM: number;
}

export type SatinUnderlayPass =
  SatinCenterUnderlayPass | SatinEdgeUnderlayPass | SatinZigzagUnderlayPass;

export type LegacySatinGenerator = 'spine' | 'rail-pair' | 'programmable';

export interface SatinUnderlayProfile {
  readonly passes: readonly SatinUnderlayPass[];
}

export interface ResolvedSatinUnderlayProfile extends SatinUnderlayProfile {
  readonly source: 'legacy';
  readonly requestedMode: SatinUnderlayMode;
  readonly resolvedMode: Exclude<SatinUnderlayMode, 'auto'>;
  readonly generator: LegacySatinGenerator;
  readonly doubled: boolean;
}

export type FillUnderlayAngle =
  | { readonly kind: 'relative-to-topping'; readonly degrees: number }
  | { readonly kind: 'absolute'; readonly degrees: number };

export type FillDirectionFieldBehavior = 'rotate-field' | 'fixed-heading';

export interface FillEdgeUnderlayPass {
  readonly kind: 'edge';
  readonly insetMM: number;
  readonly stitchLengthMM: number;
  readonly minimumRegionAreaMM2: number;
}

export interface FillTatamiUnderlayPass {
  readonly kind: 'tatami';
  readonly insetMM: number;
  readonly stitchLengthMM: number;
  readonly rowSpacingMM: number;
  readonly angle: FillUnderlayAngle;
  readonly minimumRegionAreaMM2: number;
  readonly directionFieldBehavior: FillDirectionFieldBehavior;
}

export type FillUnderlayPass = FillEdgeUnderlayPass | FillTatamiUnderlayPass;
export type LegacyFillGenerator = 'scanline' | 'direction-field';

export interface FillUnderlayProfile {
  readonly passes: readonly FillUnderlayPass[];
}

export interface ResolvedFillUnderlayProfile extends FillUnderlayProfile {
  readonly source: 'legacy';
  readonly requestedMode: FillUnderlayMode;
  readonly resolvedMode: 'off' | 'edge' | 'tatami' | 'both';
  readonly generator: LegacyFillGenerator;
  readonly doubled: boolean;
}

export interface ProfileValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface LegacySatinUnderlayContext {
  readonly columnWidthMM: number;
  readonly runningStitchLengthMM: number;
  readonly doubled: boolean;
  readonly generator?: LegacySatinGenerator;
}

export interface LegacyFillUnderlayContext {
  readonly regionAreaMM2: number;
  readonly toppingRowSpacingMM: number;
  readonly doubled: boolean;
  readonly generator?: LegacyFillGenerator;
}

const inRange = (value: number, range: NumericRange) =>
  Number.isFinite(value) && value >= range.min && value <= range.max;

const rangeMessage = (range: NumericRange, unit: string) =>
  `must be finite and between ${range.min} and ${range.max}${unit}`;

const centerPass = (runningStitchLengthMM: number): SatinCenterUnderlayPass => ({
  kind: 'center',
  runningStitchLengthMM,
  returnRun: 'reverse-center',
});

const edgePass = (
  runningStitchLengthMM: number,
  generator: LegacySatinGenerator,
): SatinEdgeUnderlayPass => ({
  kind: 'edge',
  runningStitchLengthMM,
  // Spine satin runs at 30% of full width from the centre (20% inset); the
  // historical rail-pair path interpolates 30% inward from each authored rail.
  inset: { unit: 'column-width-ratio', value: generator === 'rail-pair' ? 0.3 : 0.2 },
  returnRun: 'opposite-edge',
});

const zigzagPass = (runningStitchLengthMM: number): SatinZigzagUnderlayPass => ({
  kind: 'zigzag',
  widthRatio: 0.6,
  spacingMM: 2,
  returnRun: 'reverse-center',
  returnRunStitchLengthMM: runningStitchLengthMM,
});

/**
 * Lower a legacy satin mode to an ordered, concrete profile.
 *
 * The generator variant preserves existing doubled-center behavior: buffered
 * spine satin adds the historical zigzag, while rail-pair and programmable
 * satin retain their historical center-only output.
 */
export function lowerLegacySatinUnderlay(
  mode: SatinUnderlayMode,
  context: LegacySatinUnderlayContext,
): ResolvedSatinUnderlayProfile {
  const generator = context.generator ?? 'spine';
  const resolvedMode =
    mode === 'auto'
      ? context.columnWidthMM < 1.5
        ? 'off'
        : context.columnWidthMM < 4
          ? 'center'
          : 'zigzag'
      : mode;
  const runningStitchLengthMM = Math.max(1.5, Math.min(context.runningStitchLengthMM, 3));
  const passes: SatinUnderlayPass[] = [];

  if (resolvedMode !== 'off' && context.doubled && resolvedMode !== 'center')
    passes.push(centerPass(runningStitchLengthMM));

  if (resolvedMode === 'center') {
    passes.push(centerPass(runningStitchLengthMM));
    if (context.doubled && generator === 'spine') passes.push(zigzagPass(runningStitchLengthMM));
  } else if (resolvedMode === 'edge') {
    passes.push(edgePass(runningStitchLengthMM, generator));
  } else if (resolvedMode === 'zigzag') {
    passes.push(zigzagPass(runningStitchLengthMM));
  }

  return {
    source: 'legacy',
    requestedMode: mode,
    resolvedMode,
    generator,
    doubled: context.doubled,
    passes,
  };
}

const fillEdgePass = (): FillEdgeUnderlayPass => ({
  kind: 'edge',
  insetMM: 0.5,
  stitchLengthMM: 2.5,
  minimumRegionAreaMM2: 30,
});

const fillTatamiPass = (
  relativeDegrees: number,
  rowSpacingMM: number,
  generator: LegacyFillGenerator,
): FillTatamiUnderlayPass => ({
  kind: 'tatami',
  insetMM: 0.6,
  stitchLengthMM: 4,
  rowSpacingMM,
  angle: { kind: 'relative-to-topping', degrees: relativeDegrees },
  minimumRegionAreaMM2: 0,
  directionFieldBehavior: generator === 'direction-field' ? 'rotate-field' : 'fixed-heading',
});

/** Lower a legacy fill mode to its exact ordered edge/tatami pass profile. */
export function lowerLegacyFillUnderlay(
  mode: FillUnderlayMode,
  context: LegacyFillUnderlayContext,
): ResolvedFillUnderlayProfile {
  const generator = context.generator ?? 'scanline';
  const resolvedMode = mode === 'auto' ? (context.regionAreaMM2 > 100 ? 'both' : 'tatami') : mode;
  const rowSpacingMM = Math.min(context.toppingRowSpacingMM * 4, 5);
  const passes: FillUnderlayPass[] = [];

  if ((resolvedMode === 'edge' || resolvedMode === 'both') && context.regionAreaMM2 >= 30)
    passes.push(fillEdgePass());

  if (resolvedMode === 'tatami' || resolvedMode === 'both') {
    // The legacy direction-field generator has always emitted only its rotated
    // field pass, even for fleece. Other fill paths add the doubled pass first.
    if (context.doubled && generator === 'scanline')
      passes.push(fillTatamiPass(0, rowSpacingMM, generator));
    passes.push(fillTatamiPass(90, rowSpacingMM, generator));
  }

  return {
    source: 'legacy',
    requestedMode: mode,
    resolvedMode,
    generator,
    doubled: context.doubled,
    passes,
  };
}

export function lowerFabricUnderlay(
  preset: FabricPreset,
  satin: Omit<LegacySatinUnderlayContext, 'doubled'>,
  fill: Omit<LegacyFillUnderlayContext, 'doubled'>,
) {
  return {
    satin: lowerLegacySatinUnderlay(preset.underlay.satin, {
      ...satin,
      doubled: preset.underlay.doubled,
    }),
    fill: lowerLegacyFillUnderlay(preset.underlay.fill, {
      ...fill,
      doubled: preset.underlay.doubled,
    }),
  } as const;
}

export function validateSatinUnderlayProfile(
  profile: SatinUnderlayProfile,
): readonly ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];
  profile.passes.forEach((pass, index) => {
    const base = `passes[${index}]`;
    if (pass.kind === 'center' || pass.kind === 'edge') {
      if (!inRange(pass.runningStitchLengthMM, SATIN_UNDERLAY_RANGES.runningStitchLengthMM))
        issues.push({
          path: `${base}.runningStitchLengthMM`,
          message: rangeMessage(SATIN_UNDERLAY_RANGES.runningStitchLengthMM, ' mm'),
        });
    }
    if (pass.kind === 'edge') {
      const range =
        pass.inset.unit === 'mm'
          ? SATIN_UNDERLAY_RANGES.edgeInsetMM
          : SATIN_UNDERLAY_RANGES.edgeInsetRatio;
      if (!inRange(pass.inset.value, range))
        issues.push({
          path: `${base}.inset.value`,
          message: rangeMessage(range, pass.inset.unit === 'mm' ? ' mm' : ''),
        });
    }
    if (pass.kind === 'zigzag') {
      if (!inRange(pass.widthRatio, SATIN_UNDERLAY_RANGES.zigzagWidthRatio))
        issues.push({
          path: `${base}.widthRatio`,
          message: rangeMessage(SATIN_UNDERLAY_RANGES.zigzagWidthRatio, ''),
        });
      if (!inRange(pass.spacingMM, SATIN_UNDERLAY_RANGES.zigzagSpacingMM))
        issues.push({
          path: `${base}.spacingMM`,
          message: rangeMessage(SATIN_UNDERLAY_RANGES.zigzagSpacingMM, ' mm'),
        });
      if (
        pass.returnRun === 'reverse-center' &&
        !inRange(pass.returnRunStitchLengthMM, SATIN_UNDERLAY_RANGES.runningStitchLengthMM)
      )
        issues.push({
          path: `${base}.returnRunStitchLengthMM`,
          message: rangeMessage(SATIN_UNDERLAY_RANGES.runningStitchLengthMM, ' mm'),
        });
    }
  });
  return issues;
}

export function validateFillUnderlayProfile(
  profile: FillUnderlayProfile,
): readonly ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];
  profile.passes.forEach((pass, index) => {
    const base = `passes[${index}]`;
    if (!inRange(pass.insetMM, FILL_UNDERLAY_RANGES.insetMM))
      issues.push({
        path: `${base}.insetMM`,
        message: rangeMessage(FILL_UNDERLAY_RANGES.insetMM, ' mm'),
      });
    if (!inRange(pass.stitchLengthMM, FILL_UNDERLAY_RANGES.stitchLengthMM))
      issues.push({
        path: `${base}.stitchLengthMM`,
        message: rangeMessage(FILL_UNDERLAY_RANGES.stitchLengthMM, ' mm'),
      });
    if (!inRange(pass.minimumRegionAreaMM2, FILL_UNDERLAY_RANGES.minimumRegionAreaMM2))
      issues.push({
        path: `${base}.minimumRegionAreaMM2`,
        message: rangeMessage(FILL_UNDERLAY_RANGES.minimumRegionAreaMM2, ' mm²'),
      });
    if (pass.kind === 'tatami') {
      if (!inRange(pass.rowSpacingMM, FILL_UNDERLAY_RANGES.rowSpacingMM))
        issues.push({
          path: `${base}.rowSpacingMM`,
          message: rangeMessage(FILL_UNDERLAY_RANGES.rowSpacingMM, ' mm'),
        });
      if (!Number.isFinite(pass.angle.degrees))
        issues.push({ path: `${base}.angle.degrees`, message: 'must be finite' });
    }
  });
  return issues;
}
