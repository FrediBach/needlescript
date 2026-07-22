import type {
  DesignStats,
  DiagnosticBounds,
  DiagnosticGeometry,
  PhysicsDiagnostic,
  RunResult,
  StitchEvent,
} from '../core/types.ts';

const GRID_COLUMNS = 16;
const GRID_ROWS = 10;
const GRID_LEVELS = ' .:-=+*#%@';
const MAX_COLOR_SUMMARIES = 8;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ColorExtent extends Bounds {
  color: number;
  stitches: number;
}

export interface AiSpatialContext {
  content: string;
  imageDataUrl?: string;
}

function finiteBounds(bounds: Bounds): boolean {
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite);
}

function visibleBounds(events: readonly StitchEvent[]): Bounds | null {
  const bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  let previousPosition: StitchEvent | null = null;
  const include = (event: StitchEvent) => {
    bounds.minX = Math.min(bounds.minX, event.x);
    bounds.minY = Math.min(bounds.minY, event.y);
    bounds.maxX = Math.max(bounds.maxX, event.x);
    bounds.maxY = Math.max(bounds.maxY, event.y);
  };
  for (const event of events) {
    if (event.t === 'jump') {
      previousPosition = event;
      continue;
    }
    if (event.t === 'trim' || event.t === 'color') {
      previousPosition = null;
      continue;
    }
    if (event.t !== 'stitch') continue;
    if (event.u === 1) {
      previousPosition = event;
      continue;
    }
    if (previousPosition) include(previousPosition);
    include(event);
    previousPosition = event;
  }
  return finiteBounds(bounds) ? bounds : null;
}

function formatMM(value: number): string {
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded.toFixed(1)} mm`;
}

function formatPoint(x: number, y: number): string {
  return `(${formatMM(x)}, ${formatMM(y)})`;
}

function formatBounds(bounds: Bounds): string {
  return `x ${formatMM(bounds.minX)}..${formatMM(bounds.maxX)}, y ${formatMM(bounds.minY)}..${formatMM(bounds.maxY)}`;
}

function colorExtents(result: RunResult): ColorExtent[] {
  const byColor = new Map<number, ColorExtent>();
  let previousPosition: StitchEvent | null = null;
  for (const event of result.events) {
    if (event.t === 'jump') {
      previousPosition = event;
      continue;
    }
    if (event.t === 'trim' || event.t === 'color') {
      previousPosition = null;
      continue;
    }
    if (event.t !== 'stitch') continue;
    if (event.u === 1) {
      previousPosition = event;
      continue;
    }
    const extent = byColor.get(event.c) ?? {
      color: event.c,
      stitches: 0,
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    extent.stitches++;
    for (const point of previousPosition ? [previousPosition, event] : [event]) {
      extent.minX = Math.min(extent.minX, point.x);
      extent.minY = Math.min(extent.minY, point.y);
      extent.maxX = Math.max(extent.maxX, point.x);
      extent.maxY = Math.max(extent.maxY, point.y);
    }
    byColor.set(event.c, extent);
    previousPosition = event;
  }
  return [...byColor.values()].toSorted((a, b) => a.color - b.color);
}

function plotSegment(grid: number[][], bounds: Bounds, start: StitchEvent, end: StitchEvent): void {
  const rawWidth = bounds.maxX - bounds.minX;
  const rawHeight = bounds.maxY - bounds.minY;
  const width = Math.max(rawWidth, 0.001);
  const height = Math.max(rawHeight, 0.001);
  const cellWidth = rawWidth > 0.001 ? rawWidth / GRID_COLUMNS : Infinity;
  const cellHeight = rawHeight > 0.001 ? rawHeight / GRID_ROWS : Infinity;
  const sampleStep = Math.min(cellWidth, cellHeight);
  const samples = Math.max(
    1,
    Math.min(
      64,
      Number.isFinite(sampleStep)
        ? Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / sampleStep)
        : 1,
    ),
  );
  for (let sample = 0; sample <= samples; sample++) {
    const t = sample / samples;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const column = Math.min(
      GRID_COLUMNS - 1,
      Math.max(0, Math.floor(((x - bounds.minX) / width) * GRID_COLUMNS)),
    );
    const row = Math.min(
      GRID_ROWS - 1,
      Math.max(0, Math.floor(((bounds.maxY - y) / height) * GRID_ROWS)),
    );
    grid[row][column]++;
  }
}

function occupancyMap(events: readonly StitchEvent[], bounds: Bounds): string[] {
  const grid = Array.from({ length: GRID_ROWS }, () => Array<number>(GRID_COLUMNS).fill(0));
  let previousPosition: StitchEvent | null = null;
  for (const event of events) {
    if (event.t === 'jump') {
      previousPosition = event;
      continue;
    }
    if (event.t === 'trim' || event.t === 'color') {
      previousPosition = null;
      continue;
    }
    if (event.t !== 'stitch') continue;
    if (event.u === 1) {
      previousPosition = event;
      continue;
    }
    if (previousPosition) plotSegment(grid, bounds, previousPosition, event);
    else plotSegment(grid, bounds, event, event);
    previousPosition = event;
  }
  const peak = Math.max(1, ...grid.flat());
  return grid.map((row) =>
    row
      .map((value) => {
        if (value === 0) return GRID_LEVELS[0];
        const normalized = Math.log1p(value) / Math.log1p(peak);
        return GRID_LEVELS[Math.max(1, Math.round(normalized * (GRID_LEVELS.length - 1)))];
      })
      .join(''),
  );
}

/** Build deterministic, model-independent spatial context from compiled stitch geometry. */
export function buildSpatialDigest(result: RunResult, stats: DesignStats): string {
  const bounds = visibleBounds(result.events) ?? {
    minX: stats.minX,
    minY: stats.minY,
    maxX: stats.maxX,
    maxY: stats.maxY,
  };
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const colors = colorExtents(result);
  const colorLines = colors.slice(0, MAX_COLOR_SUMMARIES).map((extent) => {
    const thread = result.colorTable[extent.color];
    const label = thread?.name ? `${thread.hex} ${thread.name}` : (thread?.hex ?? 'default color');
    return `- slot ${thread?.slot ?? extent.color + 1} (${label}): ${extent.stitches.toLocaleString('en-US')} visible stitches; ${formatBounds(extent)}`;
  });
  if (colors.length > MAX_COLOR_SUMMARIES) {
    colorLines.push(`- ${colors.length - MAX_COLOR_SUMMARIES} additional color slot(s) omitted`);
  }

  const hoop = result.activeHoop;
  const hoopLine = hoop
    ? `Hoop: ${hoop.shape}, ${formatMM(hoop.widthMM)} × ${formatMM(hoop.heightMM)} outer; ${formatMM(hoop.fieldWidthMM)} × ${formatMM(hoop.fieldHeightMM)} sewable field, centered at the origin.`
    : 'Hoop: no explicit hoop; the preview is framed around the visible design.';
  const map = occupancyMap(result.events, bounds);

  return [
    'Compiled spatial context (the compiled stitch plan is ground truth):',
    'Coordinates are hoop-space millimetres: +x is right, +y is up, origin is hoop centre.',
    `Visible design bounds: ${formatBounds(bounds)}.`,
    `Visible size: ${formatMM(width)} × ${formatMM(height)}; centre ${formatPoint(centerX, centerY)}; aspect ratio ${height === 0 ? 'undefined' : (width / height).toFixed(2)}.`,
    hoopLine,
    `Machine plan: ${stats.stitches.toLocaleString('en-US')} stitches, ${stats.jumps.toLocaleString('en-US')} jumps, ${stats.trims.toLocaleString('en-US')} trims, ${stats.colorChanges.toLocaleString('en-US')} color changes.`,
    colorLines.length
      ? `Color extents:\n${colorLines.join('\n')}`
      : 'Color extents: no visible stitches.',
    `Coarse stitched silhouette (top row is +y; left column is -x; denser cells use darker characters):\n${map.map((row) => `|${row}|`).join('\n')}`,
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function diagnosticBounds(geometry: readonly DiagnosticGeometry[]): DiagnosticBounds | null {
  const points = geometry.flatMap((item) => {
    if (item.bounds) {
      return [
        { x: item.bounds.minX, y: item.bounds.minY },
        { x: item.bounds.maxX, y: item.bounds.maxY },
      ];
    }
    switch (item.kind) {
      case 'points':
      case 'polyline':
        return item.points;
      case 'cell':
        return [
          { x: item.x, y: item.y },
          { x: item.x + item.width, y: item.y + item.height },
        ];
      case 'region':
        return item.rings.flat();
    }
  });
  if (!points.length) return null;
  return points.reduce<DiagnosticBounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function previewFrame(result: RunResult, stats: DesignStats): Bounds {
  const design = visibleBounds(result.events) ?? {
    minX: stats.minX,
    minY: stats.minY,
    maxX: stats.maxX,
    maxY: stats.maxY,
  };
  const hoop = result.activeHoop;
  const bounds = hoop
    ? {
        minX: Math.min(design.minX, -hoop.widthMM / 2),
        minY: Math.min(design.minY, -hoop.heightMM / 2),
        maxX: Math.max(design.maxX, hoop.widthMM / 2),
        maxY: Math.max(design.maxY, hoop.heightMM / 2),
      }
    : { ...design };
  const width = Math.max(bounds.maxX - bounds.minX, 10);
  const height = Math.max(bounds.maxY - bounds.minY, 10);
  const side = Math.max(width, height) * 1.12;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    minX: centerX - side / 2,
    minY: centerY - side / 2,
    maxX: centerX + side / 2,
    maxY: centerY + side / 2,
  };
}

function stitchPaths(result: RunResult): string[] {
  const paths: string[] = [];
  let points: string[] = [];
  let color = 0;
  let previousPosition: StitchEvent | null = null;
  const flush = () => {
    if (points.length >= 2) {
      const thread = result.colorTable[color];
      paths.push(
        `<path d="${points.join(' ')}" fill="none" stroke="${escapeXml(thread?.hex ?? '#1f2937')}" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
    points = [];
  };
  for (const event of result.events) {
    if (event.t === 'jump' || event.t === 'trim' || event.t === 'color') {
      flush();
      previousPosition = event.t === 'jump' ? event : null;
      continue;
    }
    if (event.t !== 'stitch' || event.u === 1) {
      if (event.t === 'stitch') {
        flush();
        previousPosition = event;
      }
      continue;
    }
    if (points.length === 0) {
      color = event.c;
      const start = previousPosition ?? event;
      points.push(`M ${start.x.toFixed(3)} ${(-start.y).toFixed(3)}`);
    }
    points.push(`L ${event.x.toFixed(3)} ${(-event.y).toFixed(3)}`);
    previousPosition = event;
  }
  flush();
  return paths;
}

function diagnosticOverlays(diagnostics: readonly PhysicsDiagnostic[]): string[] {
  return diagnostics.flatMap((diagnostic, index) => {
    const bounds = diagnosticBounds(diagnostic.geometry);
    if (!bounds) return [];
    const color = diagnostic.severity === 'error' ? '#dc2626' : '#f59e0b';
    const x = (bounds.minX + bounds.maxX) / 2;
    const y = (bounds.minY + bounds.maxY) / 2;
    const shapes = diagnostic.geometry
      .map((geometry) => {
        switch (geometry.kind) {
          case 'points':
            return geometry.points
              .map(
                (point) =>
                  `<circle cx="${point.x.toFixed(3)}" cy="${(-point.y).toFixed(3)}" r="1.2"/>`,
              )
              .join('');
          case 'polyline':
            return `<polyline points="${geometry.points.map((point) => `${point.x.toFixed(3)},${(-point.y).toFixed(3)}`).join(' ')}"${geometry.closed ? ` fill="${color}" fill-opacity="0.18"` : ' fill="none"'}/>`;
          case 'cell':
            return `<rect x="${geometry.x.toFixed(3)}" y="${(-geometry.y - geometry.height).toFixed(3)}" width="${geometry.width.toFixed(3)}" height="${geometry.height.toFixed(3)}" rx="0.5"/>`;
          case 'region':
            return `<path d="${geometry.rings
              .map(
                (ring) =>
                  `${ring.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point.x.toFixed(3)} ${(-point.y).toFixed(3)}`).join(' ')} Z`,
              )
              .join(' ')}" fill="${color}" fill-opacity="0.18" fill-rule="evenodd"/>`;
        }
      })
      .join('');
    return [
      `<g data-finding="${index + 1}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="0.65" stroke-linejoin="round">${shapes}<circle cx="${x.toFixed(3)}" cy="${(-y).toFixed(3)}" r="2.3" fill="${color}" fill-opacity="1" stroke="#fff" stroke-width="0.5"/><text x="${x.toFixed(3)}" y="${(-y + 0.95).toFixed(3)}" fill="#fff" fill-opacity="1" stroke="none" font-family="sans-serif" font-size="2.7" font-weight="700" text-anchor="middle">${index + 1}</text></g>`,
    ];
  });
}

/** Build a compact, annotated SVG intended for rasterization into a vision-model prompt. */
export function buildAiPreviewSvg(
  result: RunResult,
  stats: DesignStats,
  diagnostics: readonly PhysicsDiagnostic[] = [],
): string {
  const frame = previewFrame(result, stats);
  const side = frame.maxX - frame.minX;
  const svgMinY = -frame.maxY;
  const hoop = result.activeHoop;
  const hoopShape = hoop
    ? hoop.shape === 'circle'
      ? `<circle cx="0" cy="0" r="${(hoop.widthMM / 2).toFixed(3)}"/>`
      : hoop.shape === 'oval'
        ? `<ellipse cx="0" cy="0" rx="${(hoop.widthMM / 2).toFixed(3)}" ry="${(hoop.heightMM / 2).toFixed(3)}"/>`
        : `<rect x="${(-hoop.widthMM / 2).toFixed(3)}" y="${(-hoop.heightMM / 2).toFixed(3)}" width="${hoop.widthMM.toFixed(3)}" height="${hoop.heightMM.toFixed(3)}" rx="2"/>`
    : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame.minX.toFixed(3)} ${svgMinY.toFixed(3)} ${side.toFixed(3)} ${side.toFixed(3)}" width="640" height="640">`,
    `<rect x="${frame.minX.toFixed(3)}" y="${svgMinY.toFixed(3)}" width="${side.toFixed(3)}" height="${side.toFixed(3)}" fill="${escapeXml(result.background)}"/>`,
    `<g fill="none" stroke="#64748b" stroke-opacity="0.42" stroke-width="0.35" stroke-dasharray="1.4 1.4">${hoopShape}</g>`,
    `<g stroke="#64748b" stroke-opacity="0.18" stroke-width="0.2"><path d="M ${frame.minX.toFixed(3)} 0 H ${frame.maxX.toFixed(3)}"/><path d="M 0 ${svgMinY.toFixed(3)} V ${(-frame.minY).toFixed(3)}"/></g>`,
    `<g>${stitchPaths(result).join('')}</g>`,
    `<g>${diagnosticOverlays(diagnostics).join('')}</g>`,
    '</svg>',
  ].join('');
}
