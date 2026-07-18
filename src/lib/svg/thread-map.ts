// ============================================================
// SVG-import thread mapping (pure, DOM-free).
//
// Maps source SVG colours to palette slots by perceptual OKLab distance, and
// maintains the document-wide source→slot map plus per-element overrides
// (spec §10.1). Colour parsing mirrors the importer's parser.
// ============================================================

import { colorDist, parseColor } from '../colormath.ts';

const SVG_NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  gray: '#808080',
  grey: '#808080',
  gold: '#ffd700',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
  olive: '#808000',
  cyan: '#00ffff',
  magenta: '#ff00ff',
};

/**
 * Parse an SVG colour string to an [r,g,b] triple.
 * Returns `null` for none/transparent and `undefined` for inherit/unknown.
 */
export function parseColorStr(s: string | null | undefined): number[] | null | undefined {
  if (!s) return undefined;
  s = s.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return null;
  if (s === 'currentcolor' || s === 'inherit') return undefined;
  if (s[0] === '#') {
    if (s.length === 4)
      return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)];
    if (s.length >= 7)
      return [
        parseInt(s.slice(1, 3), 16),
        parseInt(s.slice(3, 5), 16),
        parseInt(s.slice(5, 7), 16),
      ];
    return undefined;
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)/);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]].map((v) =>
      v.endsWith('%') ? Math.round(parseFloat(v) * 2.55) : Math.round(parseFloat(v)),
    );
  }
  if (SVG_NAMED[s]) return parseColorStr(SVG_NAMED[s]);
  return undefined;
}

export function rgbToHex(rgb: number[]): string {
  return (
    '#' + rgb.map((v) => ('0' + Math.min(255, Math.max(0, v)).toString(16)).slice(-2)).join('')
  );
}

/** Index of the nearest palette thread by native NeedleScript OKLab distance. */
export function nearestThread(rgb: number[], palette: string[]): number {
  const source = rgbToHex(rgb);
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    let candidate: string;
    try {
      candidate = parseColor(palette[i]);
    } catch {
      continue;
    }
    const distance = colorDist(source, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** Nearest thread for a colour string, defaulting unparsable colours to black-match. */
export function threadForColor(hex: string | null | undefined, palette: string[]): number {
  const rgb = (parseColorStr(hex || '') as number[]) || [0, 0, 0];
  return nearestThread(rgb, palette);
}

/**
 * Build the document-wide source-colour → palette-slot map from a list of
 * source colours (fill or stroke hex), so remapping one source colour can
 * update every element that uses it.
 */
export function buildThreadMap(
  sourceColors: (string | null)[],
  palette: string[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of sourceColors) {
    if (c === null) continue;
    if (!(c in map)) map[c] = threadForColor(c, palette);
  }
  return map;
}
