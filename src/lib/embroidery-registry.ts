import { defineModes, modeKeys } from './mode-registry.ts';

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

/** Fabric profiles are also the single source of truth for accepted fabric modes. */
const FABRIC_PROFILES = {
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

export const FABRICS: Readonly<Record<string, FabricPreset>> & typeof FABRIC_PROFILES =
  FABRIC_PROFILES;

export const FABRIC_MODES = modeKeys(FABRIC_PROFILES);
export type FabricMode = (typeof FABRIC_MODES)[number];

/**
 * Focused registry for quoted embroidery commands. Future construction modes
 * belong here so parser, runtime, Monaco, and documentation tests share names.
 */
export const EMBROIDERY_MODE_REGISTRIES = {
  fabric: FABRIC_MODES,
  underlay: SATIN_UNDERLAY_MODES,
  fillunderlay: FILL_UNDERLAY_MODES,
} as const;

export type EmbroideryModeCommand = keyof typeof EMBROIDERY_MODE_REGISTRIES;
