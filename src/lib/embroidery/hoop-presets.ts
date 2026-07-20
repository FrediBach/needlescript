// ---------- Hoop presets and field geometry helpers ----------
//
// Language-level hoop configuration — no DOM or UI dependencies.
// The `hoop` command in interpreter.ts uses these helpers exclusively.

import type { HoopInfo } from '../core/types.ts';
import type { Pt } from '../geometry/genmath.ts';
import type { Domain } from '../geometry/generators.ts';
import { defineModes } from '../core/mode-registry.ts';

// ---------- Preset table ----------

interface HoopPreset {
  name: string;
  widthMM: number;
  heightMM: number;
  shape: HoopInfo['shape'];
}

export const HOOP_SHAPES = defineModes(['circle', 'oval', 'rectangle'] as const);

/** Named hoop presets, matching spec §2.3. Matching is case-insensitive. */
const HOOP_PRESETS: HoopPreset[] = [
  { name: 'round100', widthMM: 100, heightMM: 100, shape: 'circle' },
  { name: '4x4', widthMM: 100, heightMM: 100, shape: 'rectangle' },
  { name: '5x7', widthMM: 130, heightMM: 180, shape: 'rectangle' },
  { name: '6x10', widthMM: 160, heightMM: 260, shape: 'rectangle' },
  { name: '8x8', widthMM: 200, heightMM: 200, shape: 'rectangle' },
  { name: '8x12', widthMM: 200, heightMM: 300, shape: 'rectangle' },
];

/** All preset names, in table order. Used for did-you-mean and completions. */
export const HOOP_PRESET_NAMES: readonly string[] = HOOP_PRESETS.map((p) => p.name);

// ---------- Builders ----------

/**
 * Build a HoopInfo from raw dimensions and shape.
 * The sewable field is the hoop inset by 3 mm on every side (6 mm total per axis).
 */
export function buildHoopInfo(
  widthMM: number,
  heightMM: number,
  shape: HoopInfo['shape'],
  presetName?: string,
): HoopInfo {
  return {
    shape,
    widthMM,
    heightMM,
    fieldWidthMM: widthMM - 6,
    fieldHeightMM: heightMM - 6,
    presetName,
  };
}

/** The default hoop — round ⌀100 mm, field ⌀94 mm (radius 47 mm). */
export const DEFAULT_HOOP_INFO: HoopInfo = buildHoopInfo(100, 100, 'circle', 'round100');

/**
 * Look up a preset by name (case-insensitive).
 * Returns null if name is unknown; use HOOP_PRESET_NAMES for did-you-mean.
 */
export function lookupHoopPreset(name: string): HoopInfo | null {
  const lower = name.toLowerCase();
  const preset = HOOP_PRESETS.find((p) => p.name === lower);
  if (!preset) return null;
  return buildHoopInfo(preset.widthMM, preset.heightMM, preset.shape, preset.name);
}

// ---------- Field geometry ----------

/** True when (x, y) (hoop-space mm) is inside the sewable field. */
export function inHoopField(info: HoopInfo, x: number, y: number): boolean {
  if (info.shape !== 'rectangle') {
    const rx = info.fieldWidthMM / 2;
    const ry = info.fieldHeightMM / 2;
    return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
  }
  return Math.abs(x) <= info.fieldWidthMM / 2 && Math.abs(y) <= info.fieldHeightMM / 2;
}

/** True when (x, y) (hoop-space mm) is inside the outer hoop boundary. */
export function inHoopOuter(info: HoopInfo, x: number, y: number): boolean {
  if (info.shape !== 'rectangle') {
    const rx = info.widthMM / 2;
    const ry = info.heightMM / 2;
    return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
  }
  return Math.abs(x) <= info.widthMM / 2 && Math.abs(y) <= info.heightMM / 2;
}

/**
 * The sewable field boundary as a CCW polygon, ready for use as a region.
 * Round and oval fields are approximated with chords ≤ chordMM mm.
 * Rectangular fields are returned as 4-corner polygons.
 */
export function hoopFieldPolygon(info: HoopInfo, chordMM: number): Pt[] {
  if (info.shape !== 'rectangle') {
    const rx = info.fieldWidthMM / 2;
    const ry = info.fieldHeightMM / 2;
    const radius = Math.max(rx, ry);
    // The major-axis radius gives a conservative segment count for an ellipse.
    const n = Math.max(8, Math.ceil(Math.PI / Math.asin(Math.min(1, chordMM / (2 * radius)))));
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * 2 * Math.PI;
      out.push([rx * Math.cos(t), ry * Math.sin(t)]);
    }
    return out;
  }
  // Rectangular: 4 corners, CCW (counter-clockwise)
  const hw = info.fieldWidthMM / 2;
  const hh = info.fieldHeightMM / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
}

/**
 * The sewable field as a generators.ts Domain (used as the default domain for
 * scatter / voronoi / relax when no explicit region is given).
 */
export function hoopFieldDomain(info: HoopInfo): Domain {
  if (info.shape === 'circle') {
    return { kind: 'disc', r: info.fieldWidthMM / 2 };
  }
  if (info.shape === 'oval') {
    return { kind: 'ellipse', rx: info.fieldWidthMM / 2, ry: info.fieldHeightMM / 2 };
  }
  return { kind: 'rect', w: info.fieldWidthMM, h: info.fieldHeightMM };
}

/** Human-readable field description for warning/error messages. */
export function fieldDescription(info: HoopInfo): string {
  if (info.shape === 'circle') {
    return `⌀${info.fieldWidthMM} mm field`;
  }
  return `${info.fieldWidthMM} × ${info.fieldHeightMM} mm${info.shape === 'oval' ? ' oval' : ''} field`;
}

/** Human-readable hoop description for stats / error messages. */
export function hoopDescription(info: HoopInfo): string {
  if (info.shape === 'circle') {
    return `⌀${info.widthMM} mm round hoop`;
  }
  return `${info.widthMM} × ${info.heightMM} mm${info.shape === 'oval' ? ' oval' : ''} hoop`;
}
