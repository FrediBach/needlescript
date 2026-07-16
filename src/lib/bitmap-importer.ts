import { RESERVED } from './commands.ts';
import { prescan } from './prescan.ts';
import { tokenize } from './tokenizer.ts';

export const EST_STITCHES_PER_MM2 = 1.8;

export interface BitmapPixels {
  width: number;
  height: number;
  /** RGBA8 pixels, row-major. This deliberately has no DOM ImageData dependency. */
  data: Uint8ClampedArray;
}

export interface BitmapCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BitmapSettings {
  crop: BitmapCrop;
  columns: number;
  rows: number;
  fabric: string;
  threads: string[];
  invert: boolean;
  steps: number;
  dither: boolean;
  mm: number;
}

export interface BitmapPlate {
  color: string;
  rows: string[];
  coverage: number;
}

export interface ProcessedBitmap {
  plates: BitmapPlate[];
  estimatedStitches: number;
  sourceBytes: number;
}

export interface EmitBitmapOptions {
  filename: string;
  prefix: string;
  source: string;
  includeHelpers: boolean;
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const HEX = '0123456789abcdef';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseHex(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return [245, 239, 228];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function srgbToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const channel = clamp(value, 0, 1);
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function squaredDistance(a: readonly number[], b: readonly number[]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Area-downsample image pixels into 0–15 hexadecimal plates. It is intentionally
 * DOM-free, which keeps import output deterministic and straightforward to test.
 */
export function processBitmap(image: BitmapPixels, settings: BitmapSettings): ProcessedBitmap {
  const crop = {
    x: clamp(settings.crop.x, 0, image.width - 1),
    y: clamp(settings.crop.y, 0, image.height - 1),
    width: clamp(settings.crop.width, 1, image.width),
    height: clamp(settings.crop.height, 1, image.height),
  };
  crop.width = Math.min(crop.width, image.width - crop.x);
  crop.height = Math.min(crop.height, image.height - crop.y);

  const columns = clamp(Math.round(settings.columns), 8, 96);
  const rows = clamp(Math.round(settings.rows), 8, 96);
  const steps = clamp(Math.round(settings.steps), 2, 16);
  const colors = settings.threads.length ? settings.threads : ['#2b2b2b'];
  const fabric = parseHex(settings.fabric);
  const fabricLinear = fabric.map(srgbToLinear);
  const threadLinear = colors.map((color) => parseHex(color).map(srgbToLinear));
  const values = colors.map(() =>
    Array.from({ length: rows }, () => Array<number>(columns).fill(0)),
  );

  for (let row = 0; row < rows; row++) {
    const y0 = crop.y + (row * crop.height) / rows;
    const y1 = crop.y + ((row + 1) * crop.height) / rows;
    for (let column = 0; column < columns; column++) {
      const x0 = crop.x + (column * crop.width) / columns;
      const x1 = crop.x + ((column + 1) * crop.width) / columns;
      const sum = [0, 0, 0];
      let weight = 0;
      for (let py = Math.floor(y0); py < Math.ceil(y1); py++) {
        const oy = Math.max(0, Math.min(y1, py + 1) - Math.max(y0, py));
        if (!oy) continue;
        for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
          const ox = Math.max(0, Math.min(x1, px + 1) - Math.max(x0, px));
          if (!ox) continue;
          const offset = (py * image.width + px) * 4;
          const alpha = image.data[offset + 3] / 255;
          const pixelWeight = ox * oy;
          for (let channel = 0; channel < 3; channel++) {
            const source = srgbToLinear(image.data[offset + channel]);
            sum[channel] += (source * alpha + fabricLinear[channel] * (1 - alpha)) * pixelWeight;
          }
          weight += pixelWeight;
        }
      }
      const rgb = sum.map((value) => value / Math.max(weight, Number.EPSILON));
      const luma = linearToSrgb(rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722);
      const baseCoverage = settings.invert ? luma : 1 - luma;

      if (colors.length === 1) {
        values[0][row][column] = quantize(baseCoverage, steps, settings.dither, column, row);
        continue;
      }

      const distanceToFabric = Math.sqrt(squaredDistance(rgb, fabricLinear));
      const overallCoverage = clamp(distanceToFabric / 0.8, 0, 1);
      const distances = threadLinear.map((thread) => squaredDistance(rgb, thread));
      const closest = distances.indexOf(Math.min(...distances));
      for (let plate = 0; plate < colors.length; plate++) {
        // A small, stable soft assignment keeps nearby colours from looking posterized.
        const weights = distances.map((distance) => Math.exp(-distance / 0.05));
        const total = weights.reduce((a, b) => a + b, 0);
        const coverage =
          (settings.invert ? 1 - overallCoverage : overallCoverage) * (weights[plate] / total);
        values[plate][row][column] = quantize(
          plate === closest ? Math.max(coverage, 0.08 * overallCoverage) : coverage,
          steps,
          settings.dither,
          column,
          row,
        );
      }
    }
  }

  const plates = values.map((plate, index) => {
    const hexRows = plate.map((line) => line.map((value) => HEX[value]).join(''));
    const coverage = plate.flat().reduce((sum, value) => sum + value / 15, 0);
    return { color: colors[index], rows: hexRows, coverage };
  });
  const mmPerCell = settings.mm / Math.max(columns, rows);
  const estimatedStitches = Math.round(
    EST_STITCHES_PER_MM2 * mmPerCell ** 2 * plates.reduce((sum, plate) => sum + plate.coverage, 0),
  );
  const sourceBytes = plates.reduce((sum, plate) => sum + plate.rows.join('\n').length, 0);
  return { plates, estimatedStitches, sourceBytes };
}

function quantize(value: number, steps: number, dither: boolean, x: number, y: number): number {
  const level = dither
    ? clamp(Math.floor(clamp(value, 0, 1) * steps + BAYER_4[y % 4][x % 4] / 16), 0, steps - 1)
    : Math.round(clamp(value, 0, 1) * (steps - 1));
  return Math.round((level * 15) / (steps - 1));
}

export function bitmapPrefix(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '').toLowerCase();
  const cleaned = stem
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const prefixed = /^[a-z]/.test(cleaned) ? cleaned : `img_${cleaned || 'bitmap'}`;
  return prefixed.slice(0, 16);
}

function usedNames(source: string): Set<string> {
  try {
    const scan = prescan(tokenize(source));
    return new Set([...scan.globalNames, ...Object.keys(scan.procArity), ...RESERVED]);
  } catch {
    return new Set([
      ...RESERVED,
      ...Array.from(source.matchAll(/\b[a-z][a-z0-9_]*\b/gi), (m) => m[0]),
    ]);
  }
}

export function uniqueBitmapPrefix(filename: string, source: string): string {
  const base = bitmapPrefix(filename);
  const names = usedNames(source);
  let candidate = base;
  let suffix = 2;
  while (
    names.has(candidate) ||
    ['mm', 'w', 'h'].some((tail) => names.has(`${candidate}_${tail}`))
  ) {
    candidate = `${base.slice(0, Math.max(1, 16 - String(suffix).length - 1))}_${suffix++}`;
  }
  return candidate;
}

function helpersAlreadyDefined(source: string): boolean {
  return /\bdef\s+(?:bmpixel|bmsample)\b/.test(source);
}

function plateName(prefix: string, color: string, index: number, total: number): string {
  if (total === 1) return prefix;
  return `${prefix}_${color.replace('#', '').toLowerCase()}_${index + 1}`;
}

export function emitBitmapCode(
  processed: ProcessedBitmap,
  settings: BitmapSettings,
  { filename, prefix, source, includeHelpers }: EmitBitmapOptions,
): string {
  const normalizedCrop = [
    +(settings.crop.x / Math.max(1, settings.crop.x + settings.crop.width)).toFixed(3),
    +(settings.crop.y / Math.max(1, settings.crop.y + settings.crop.height)).toFixed(3),
    1,
    1,
  ];
  const recipe = {
    src: filename,
    crop: normalizedCrop,
    cells: [settings.columns, settings.rows],
    mode: processed.plates.length === 1 ? 'gray' : 'plates',
    threads: processed.plates.length > 1 ? settings.threads : undefined,
    fabric: settings.fabric,
    invert: settings.invert,
    steps: settings.steps,
    dither: settings.dither ? 'bayer4' : 'none',
    mm: settings.mm,
  };
  const names = processed.plates.map((plate, index) =>
    plateName(prefix, plate.color, index, processed.plates.length),
  );
  const lines = [
    `// ── bitmap import: ${filename} ──────────────────────────────────────`,
    `// bitmap-import v1 ${JSON.stringify(recipe)}`,
    `let ${prefix}_mm = ${settings.mm} // [10:90] printed size of the bitmap (mm, square)`,
  ];
  processed.plates.forEach((plate, index) => {
    lines.push(`let ${names[index]} = [`);
    plate.rows.forEach((row) => lines.push(`  '${row}',`));
    lines.push(']');
  });
  lines.push(`let ${prefix}_w = len(${names[0]}[0])`, `let ${prefix}_h = len(${names[0]})`);
  if (processed.plates.length > 1) {
    lines.push(
      '// Plates overlap — use different hatch angles or spiral phases to avoid density hotspots.',
    );
  }
  if (includeHelpers && !helpersAlreadyDefined(source)) lines.push(BITMAP_HELPERS);
  lines.push(
    `// darkness 0..1 at hoop coords: bmsample(${names[0]}, ${prefix}_w, ${prefix}_h, ${prefix}_mm, xcor(), ycor())`,
  );
  return lines.join('\n');
}

export const BITMAP_HELPERS = `// generic bitmap samplers (shared by all imports)
def bmpixel(rows, w, h, col, rowi) [
  let cc = clamp(col, 0, w - 1)
  let rr = clamp(rowi, 0, h - 1)
  let rowstr = rows[rr]
  return indexof('0123456789abcdef', rowstr[cc]) / 15
]

def bmsample(rows, w, h, mm, px, py) [
  let fx = remap(px, 0 - mm / 2, mm / 2, 0, w) - 0.5
  let fy = remap(py, mm / 2, 0 - mm / 2, 0, h) - 0.5
  let ci = floor(fx)
  let ri = floor(fy)
  let ta = lerp(bmpixel(rows, w, h, ci, ri), bmpixel(rows, w, h, ci + 1, ri), fx - ci)
  let tb = lerp(bmpixel(rows, w, h, ci, ri + 1), bmpixel(rows, w, h, ci + 1, ri + 1), fx - ci)
  return lerp(ta, tb, fy - ri)
]`;
