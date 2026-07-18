// Quick import is a fixed preset over the canonical parser/model/emitter.

import { emit } from '../lib/svg/emit.ts';
import type { ImportField } from '../lib/svg/model.ts';
import { parseSvgToModel } from './parse-svg-dom.ts';

export interface QuickImportOptions {
  fitMM?: number;
  palette?: string[];
  name?: string;
  maxSegments?: number;
  field?: ImportField;
}

export interface QuickImportReport {
  fills: number;
  outlines: number;
  colors: number;
  segments: number;
  tolerance: number;
  fitMM: number;
  ignored: Record<string, number>;
}

export interface ConvertibleShape {
  subpaths: [number, number][][];
  fill: string | null;
  stroke: string | null;
}

export function svgToCode(svgText: string, options: QuickImportOptions = {}) {
  const palette = options.palette ?? [
    '#C8472F',
    '#31604F',
    '#3A4E8C',
    '#D9A441',
    '#8C4A6B',
    '#2B2B2B',
  ];
  const { doc, ignored } = parseSvgToModel(svgText, { ...options, palette });
  const blockingFinding = doc.sourceObjects
    .flatMap((sourceObject) => sourceObject.findings)
    .find((finding) => finding.severity === 'error');
  if (blockingFinding) throw new Error(blockingFinding.message);
  const { code } = emit(doc, { mode: 'replace' });
  const included = doc.operations.filter(
    (operation) => operation.include && operation.strategy.kind !== 'skip',
  );
  if (!included.length) throw new Error('No stitchable operations remain after SVG import.');
  return {
    code,
    report: {
      fills: included.filter((operation) => operation.role === 'fill').length,
      outlines: included.filter((operation) => operation.role === 'stroke').length,
      colors: new Set(
        included.flatMap((operation) =>
          operation.sourceGradient
            ? operation.sourceGradient.stops.map(
                (stop) => doc.threadMap[stop.color] ?? operation.threadIndex,
              )
            : [operation.threadIndex],
        ),
      ).size,
      segments: doc.geometries.reduce(
        (sum, geometry) =>
          sum + geometry.paths.reduce((pathSum, path) => pathSum + Math.max(0, path.length - 1), 0),
        0,
      ),
      tolerance: doc.geometryToleranceMM,
      fitMM: options.fitMM ?? 80,
      ignored,
    } satisfies QuickImportReport,
  };
}

/** Compatibility helper routed through the same canonical DOM pipeline. */
export function convertShapes(shapes: ConvertibleShape[], options: QuickImportOptions = {}) {
  const visible = shapes.filter((shape) => shape.fill !== null || shape.stroke !== null);
  const points = visible.flatMap((shape) => shape.subpaths.flat());
  if (!points.length) throw new Error('No stitchable outlines found in this SVG.');
  const spanX =
    Math.max(...points.map((point) => point[0])) - Math.min(...points.map((point) => point[0]));
  const spanY =
    Math.max(...points.map((point) => point[1])) - Math.min(...points.map((point) => point[1]));
  if (Math.max(spanX, spanY) < 1e-9) throw new Error('SVG geometry has zero size.');
  const paths = visible.flatMap((shape) =>
    shape.subpaths.map((subpath) => {
      const data = subpath.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
      const first = subpath[0];
      const last = subpath.at(-1);
      const closed = first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9;
      return `<path d="${data}${closed ? ' Z' : ''}" fill="${shape.fill ?? 'none'}" stroke="${shape.stroke ?? 'none'}"/>`;
    }),
  );
  return svgToCode(`<svg xmlns="http://www.w3.org/2000/svg">${paths.join('')}</svg>`, options);
}
