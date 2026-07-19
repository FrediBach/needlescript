import { defineModes, modeKeys } from './mode-registry.ts';
import type { MaterialIntent } from './types.ts';

export const SATIN_UNDERLAY_MODES = defineModes(['auto', 'center', 'edge', 'zigzag', 'off']);
export type SatinUnderlayMode = (typeof SATIN_UNDERLAY_MODES)[number];

export const FILL_UNDERLAY_MODES = defineModes(['auto', 'tatami', 'edge', 'off']);
export type FillUnderlayMode = (typeof FILL_UNDERLAY_MODES)[number];

export interface FabricUnderlayPreset {
  satin: SatinUnderlayMode;
  fill: FillUnderlayMode;
  doubled: boolean;
}

export interface FabricPreset {
  pull: number;
  maxDensity: number;
  densityFloor?: number;
  underlay: FabricUnderlayPreset;
  note?: string;
}

/**
 * Compatibility view of the construction settings historically exposed as
 * `FABRICS`. Keep this shape stable for library consumers.
 */
const LEGACY_FABRICS = {
  woven: {
    pull: 0.2,
    maxDensity: 3.5,
    underlay: { satin: 'auto', fill: 'auto', doubled: false },
  },
  knit: {
    pull: 0.5,
    maxDensity: 3.0,
    densityFloor: 0.45,
    underlay: { satin: 'auto', fill: 'auto', doubled: false },
  },
  stretch: {
    pull: 0.6,
    maxDensity: 2.8,
    densityFloor: 0.5,
    underlay: { satin: 'auto', fill: 'auto', doubled: false },
  },
  denim: {
    pull: 0.15,
    maxDensity: 4.0,
    underlay: { satin: 'auto', fill: 'auto', doubled: false },
  },
  canvas: {
    pull: 0.15,
    maxDensity: 4.0,
    underlay: { satin: 'auto', fill: 'auto', doubled: false },
  },
  fleece: {
    pull: 0.3,
    maxDensity: 2.6,
    underlay: { satin: 'auto', fill: 'auto', doubled: true },
    note: 'fleece: consider a water-soluble topping so stitches don\u2019t sink into the pile',
  },
} as const satisfies Record<string, FabricPreset>;

export const FABRICS: Readonly<Record<string, FabricPreset>> & typeof LEGACY_FABRICS =
  LEGACY_FABRICS;

export interface FabricMaterialDefaults {
  grainHeading: number;
  stretchAlong: number;
  stretchAcross: number;
}

export interface FabricProfile {
  construction: FabricPreset;
  material: FabricMaterialDefaults;
}

const NEUTRAL_FABRIC_DEFAULTS = {
  grainHeading: 0,
  stretchAlong: 0,
  stretchAcross: 0,
} as const satisfies FabricMaterialDefaults;

/**
 * Full fabric profiles. Directional defaults stay neutral until sew-out data
 * supports automatic material-specific values; authors can declare measured
 * stretch explicitly with `fabricstretch` today.
 */
export const FABRIC_PROFILES = {
  woven: { construction: FABRICS.woven, material: NEUTRAL_FABRIC_DEFAULTS },
  knit: { construction: FABRICS.knit, material: NEUTRAL_FABRIC_DEFAULTS },
  stretch: { construction: FABRICS.stretch, material: NEUTRAL_FABRIC_DEFAULTS },
  denim: { construction: FABRICS.denim, material: NEUTRAL_FABRIC_DEFAULTS },
  canvas: { construction: FABRICS.canvas, material: NEUTRAL_FABRIC_DEFAULTS },
  fleece: { construction: FABRICS.fleece, material: NEUTRAL_FABRIC_DEFAULTS },
} as const satisfies Record<string, FabricProfile>;

export const FABRIC_MODES = modeKeys(FABRIC_PROFILES);
export type FabricMode = (typeof FABRIC_MODES)[number];

export interface ThreadProfile {
  fiber: 'rayon' | 'polyester';
  weight: 40 | 60;
  /** Physical width approximation used by coverage analysis. */
  widthMM: number;
}

export const DEFAULT_THREAD_WIDTH_MM = 0.4;

export const THREAD_PROFILES = {
  'rayon-40wt': { fiber: 'rayon', weight: 40, widthMM: DEFAULT_THREAD_WIDTH_MM },
  'rayon-60wt': { fiber: 'rayon', weight: 60, widthMM: 0.3 },
  'polyester-40wt': {
    fiber: 'polyester',
    weight: 40,
    widthMM: DEFAULT_THREAD_WIDTH_MM,
  },
  'polyester-60wt': { fiber: 'polyester', weight: 60, widthMM: 0.3 },
} as const satisfies Record<string, ThreadProfile>;

export const THREAD_PROFILE_MODES = modeKeys(THREAD_PROFILES);
export type ThreadProfileMode = (typeof THREAD_PROFILE_MODES)[number];

export interface NeedleProfile {
  sizeNM: number;
  sizeUS: string;
}

/** Common machine-embroidery needle sizes, exposed as advisory metadata only. */
export const NEEDLE_PROFILES = {
  60: { sizeNM: 60, sizeUS: '8' },
  65: { sizeNM: 65, sizeUS: '9' },
  70: { sizeNM: 70, sizeUS: '10' },
  75: { sizeNM: 75, sizeUS: '11' },
  80: { sizeNM: 80, sizeUS: '12' },
  90: { sizeNM: 90, sizeUS: '14' },
} as const satisfies Record<number, NeedleProfile>;

export const NEEDLE_SIZES = Object.freeze(
  Object.values(NEEDLE_PROFILES).map((profile) => profile.sizeNM),
) as readonly (keyof typeof NEEDLE_PROFILES)[];
export type NeedleSize = (typeof NEEDLE_SIZES)[number];

export interface StabilizerProfile {
  category: 'none' | 'tearaway' | 'cutaway' | 'washaway';
}

export const STABILIZER_PROFILES = {
  none: { category: 'none' },
  tearaway: { category: 'tearaway' },
  cutaway: { category: 'cutaway' },
  washaway: { category: 'washaway' },
} as const satisfies Record<string, StabilizerProfile>;

export const STABILIZER_MODES = modeKeys(STABILIZER_PROFILES);
export type StabilizerMode = (typeof STABILIZER_MODES)[number];

/** Named compatibility view for the boolean `topping` command. */
export const TOPPING_PROFILES = {
  off: false,
  on: true,
} as const;
export type ToppingMode = keyof typeof TOPPING_PROFILES;

export const MATERIAL_RANGES = {
  stretch: { min: 0, max: 1 },
  threadWidthMM: { min: 0.1, max: 1 },
} as const;

export const DEFAULT_THREAD_PROFILE: ThreadProfileMode = 'polyester-40wt';

/** Default metadata is intentionally explicit even when no `fabric` command ran. */
export const DEFAULT_MATERIAL_INTENT: Readonly<MaterialIntent> = Object.freeze({
  fabricPreset: 'unspecified',
  grainHeading: 0,
  stretchAlong: 0,
  stretchAcross: 0,
  threadProfile: DEFAULT_THREAD_PROFILE,
  threadWidthMM: THREAD_PROFILES[DEFAULT_THREAD_PROFILE].widthMM,
  stabilizer: 'none',
  topping: false,
});

/**
 * Focused registry for quoted embroidery commands. Future construction modes
 * belong here so parser, runtime, Monaco, and documentation tests share names.
 */
export const EMBROIDERY_MODE_REGISTRIES = {
  fabric: FABRIC_MODES,
  threadprofile: THREAD_PROFILE_MODES,
  stabilizer: STABILIZER_MODES,
  underlay: SATIN_UNDERLAY_MODES,
  fillunderlay: FILL_UNDERLAY_MODES,
} as const;

export type EmbroideryModeCommand = keyof typeof EMBROIDERY_MODE_REGISTRIES;
