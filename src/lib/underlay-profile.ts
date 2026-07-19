import type { FabricPreset, FillUnderlayMode, SatinUnderlayMode } from './embroidery-registry.ts';
import { defineModes } from './mode-registry.ts';

export const SATIN_UNDERLAY_PASS_KINDS = defineModes(['center', 'edge', 'zigzag']);
export type SatinUnderlayPassKind = (typeof SATIN_UNDERLAY_PASS_KINDS)[number];
export const FILL_UNDERLAY_PASS_KINDS = defineModes(['edge', 'tatami']);
export type FillUnderlayPassKind = (typeof FILL_UNDERLAY_PASS_KINDS)[number];

export const SATIN_UNDERLAY_MAX_PASSES = 16;
export const FILL_UNDERLAY_MAX_PASSES = 16;

export const SATIN_UNDERLAY_DEFAULTS = {
  edgeInsetMM: 0.5,
  zigzagWidthRatio: 0.6,
  zigzagSpacingMM: 2,
} as const;

export const FILL_UNDERLAY_DEFAULTS = {
  edgeInsetMM: 0.5,
  tatamiInsetMM: 0.6,
  edgeStitchLengthMM: 2.5,
  tatamiStitchLengthMM: 4,
  relativeAngleDegrees: 90,
} as const;

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

export interface LegacyResolvedSatinUnderlayProfile extends SatinUnderlayProfile {
  readonly source: 'legacy';
  readonly requestedMode: SatinUnderlayMode;
  readonly resolvedMode: Exclude<SatinUnderlayMode, 'auto'>;
  readonly generator: LegacySatinGenerator;
  readonly doubled: boolean;
}

export interface CustomResolvedSatinUnderlayProfile extends SatinUnderlayProfile {
  readonly source: 'custom';
  readonly generator: LegacySatinGenerator;
  readonly explicitPassOrder: boolean;
}

export type ResolvedSatinUnderlayProfile =
  LegacyResolvedSatinUnderlayProfile | CustomResolvedSatinUnderlayProfile;

/** Sticky user overrides. Omitted fields continue to inherit the selected legacy profile. */
export interface SatinUnderlayCustomization {
  readonly passKinds?: readonly SatinUnderlayPassKind[];
  readonly runningStitchLengthMM?: number;
  readonly edgeInsetMM?: number;
  readonly zigzagSpacingMM?: number;
}

export function cloneSatinUnderlayCustomization(
  customization: SatinUnderlayCustomization | null,
): SatinUnderlayCustomization | null {
  return customization
    ? {
        ...customization,
        ...(customization.passKinds ? { passKinds: customization.passKinds.slice() } : {}),
      }
    : null;
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

export interface LegacyResolvedFillUnderlayProfile extends FillUnderlayProfile {
  readonly source: 'legacy';
  readonly requestedMode: FillUnderlayMode;
  readonly resolvedMode: 'off' | 'edge' | 'tatami' | 'both';
  readonly generator: LegacyFillGenerator;
  readonly doubled: boolean;
}

export interface CustomResolvedFillUnderlayProfile extends FillUnderlayProfile {
  readonly source: 'custom';
  readonly generator: LegacyFillGenerator;
  readonly explicitPassOrder: boolean;
}

export type ResolvedFillUnderlayProfile =
  LegacyResolvedFillUnderlayProfile | CustomResolvedFillUnderlayProfile;

/** Sticky user overrides. Omitted fields continue to inherit the selected legacy profile. */
export interface FillUnderlayCustomization {
  readonly passKinds?: readonly FillUnderlayPassKind[];
  readonly stitchLengthMM?: number;
  readonly insetMM?: number;
  readonly rowSpacingMM?: number;
  readonly relativeAngleDegrees?: number;
}

export function cloneFillUnderlayCustomization(
  customization: FillUnderlayCustomization | null,
): FillUnderlayCustomization | null {
  return customization
    ? {
        ...customization,
        ...(customization.passKinds ? { passKinds: customization.passKinds.slice() } : {}),
      }
    : null;
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
): LegacyResolvedSatinUnderlayProfile {
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

const customPass = (
  kind: SatinUnderlayPassKind,
  runningStitchLengthMM: number,
  edgeInsetMM: number,
  zigzagSpacingMM: number,
): SatinUnderlayPass => {
  if (kind === 'center') return centerPass(runningStitchLengthMM);
  if (kind === 'edge')
    return {
      kind: 'edge',
      runningStitchLengthMM,
      inset: { unit: 'mm', value: edgeInsetMM },
      returnRun: 'opposite-edge',
    };
  return {
    kind: 'zigzag',
    widthRatio: SATIN_UNDERLAY_DEFAULTS.zigzagWidthRatio,
    spacingMM: zigzagSpacingMM,
    returnRun: 'reverse-center',
    returnRunStitchLengthMM: runningStitchLengthMM,
  };
};

/** Resolve optional user settings over the legacy profile once physical width is known. */
export function resolveSatinUnderlayProfile(
  mode: SatinUnderlayMode,
  context: LegacySatinUnderlayContext,
  customization: SatinUnderlayCustomization | null,
): ResolvedSatinUnderlayProfile {
  const legacy = lowerLegacySatinUnderlay(mode, context);
  if (!customization) return legacy;

  const runningStitchLengthMM =
    customization.runningStitchLengthMM ??
    Math.max(1.5, Math.min(context.runningStitchLengthMM, 3));
  const edgeInsetMM = customization.edgeInsetMM ?? SATIN_UNDERLAY_DEFAULTS.edgeInsetMM;
  const zigzagSpacingMM = customization.zigzagSpacingMM ?? SATIN_UNDERLAY_DEFAULTS.zigzagSpacingMM;
  const explicitPassOrder = customization.passKinds !== undefined;
  const passes = explicitPassOrder
    ? customization.passKinds!.map((kind) =>
        customPass(kind, runningStitchLengthMM, edgeInsetMM, zigzagSpacingMM),
      )
    : legacy.passes.map((pass): SatinUnderlayPass => {
        if (pass.kind === 'center') return centerPass(runningStitchLengthMM);
        if (pass.kind === 'edge')
          return {
            ...pass,
            runningStitchLengthMM,
            inset:
              customization.edgeInsetMM === undefined
                ? pass.inset
                : { unit: 'mm', value: edgeInsetMM },
          };
        return {
          ...pass,
          spacingMM: zigzagSpacingMM,
          returnRunStitchLengthMM: runningStitchLengthMM,
        };
      });

  return { source: 'custom', generator: legacy.generator, explicitPassOrder, passes };
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

const customFillPass = (
  kind: FillUnderlayPassKind,
  context: LegacyFillUnderlayContext,
  customization: FillUnderlayCustomization,
): FillUnderlayPass => {
  const stitchLengthMM =
    customization.stitchLengthMM ??
    (kind === 'edge'
      ? FILL_UNDERLAY_DEFAULTS.edgeStitchLengthMM
      : FILL_UNDERLAY_DEFAULTS.tatamiStitchLengthMM);
  const insetMM =
    customization.insetMM ??
    (kind === 'edge' ? FILL_UNDERLAY_DEFAULTS.edgeInsetMM : FILL_UNDERLAY_DEFAULTS.tatamiInsetMM);
  if (kind === 'edge') return { kind, insetMM, stitchLengthMM, minimumRegionAreaMM2: 0 };
  return {
    kind,
    insetMM,
    stitchLengthMM,
    rowSpacingMM: customization.rowSpacingMM ?? Math.min(context.toppingRowSpacingMM * 4, 5),
    angle: {
      kind: 'relative-to-topping',
      degrees: customization.relativeAngleDegrees ?? FILL_UNDERLAY_DEFAULTS.relativeAngleDegrees,
    },
    minimumRegionAreaMM2: 0,
    directionFieldBehavior: 'rotate-field',
  };
};

/** Resolve optional user settings over the legacy profile once physical region area is known. */
export function resolveFillUnderlayProfile(
  mode: FillUnderlayMode,
  context: LegacyFillUnderlayContext,
  customization: FillUnderlayCustomization | null,
): ResolvedFillUnderlayProfile {
  const legacy = lowerLegacyFillUnderlay(mode, context);
  if (!customization) return legacy;

  const explicitPassOrder = customization.passKinds !== undefined;
  const passes = explicitPassOrder
    ? customization.passKinds!.map((kind) => customFillPass(kind, context, customization))
    : legacy.passes.map((pass): FillUnderlayPass => {
        if (pass.kind === 'edge')
          return {
            ...pass,
            insetMM: customization.insetMM ?? pass.insetMM,
            stitchLengthMM: customization.stitchLengthMM ?? pass.stitchLengthMM,
          };
        return {
          ...pass,
          insetMM: customization.insetMM ?? pass.insetMM,
          stitchLengthMM: customization.stitchLengthMM ?? pass.stitchLengthMM,
          rowSpacingMM: customization.rowSpacingMM ?? pass.rowSpacingMM,
          angle:
            customization.relativeAngleDegrees === undefined
              ? pass.angle
              : {
                  kind: 'relative-to-topping',
                  degrees: customization.relativeAngleDegrees,
                },
          directionFieldBehavior:
            context.generator === 'direction-field' ? 'rotate-field' : pass.directionFieldBehavior,
        };
      });

  return {
    source: 'custom',
    generator: context.generator ?? 'scanline',
    explicitPassOrder,
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
  if (profile.passes.length > SATIN_UNDERLAY_MAX_PASSES)
    issues.push({
      path: 'passes',
      message: `must contain at most ${SATIN_UNDERLAY_MAX_PASSES} passes`,
    });
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
  if (profile.passes.length > FILL_UNDERLAY_MAX_PASSES)
    issues.push({
      path: 'passes',
      message: `must contain at most ${FILL_UNDERLAY_MAX_PASSES} passes`,
    });
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
