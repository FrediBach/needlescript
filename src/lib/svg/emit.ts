// Dependency-aware SVG import emitter. Geometry bindings are emitted once and
// referenced by independently ordered fill/stroke operations.

import type { ImportOperation, Point, SourceGeometry, StagedDocument } from './model.ts';
import type { SvgCurveSpec } from './svg-path.ts';
import { normalizedFillGroups } from './geometry.ts';
import { STRATEGIES, strategySupportsAtomic, type EmitContext } from './strategies.ts';
import { RESERVED } from '../commands.ts';

export interface EmitOptions {
  mode?: 'replace' | 'append';
  date?: string;
  /** Names already owned by a base program when emitting an append fragment. */
  reservedNames?: Iterable<string>;
  /** Existing imports that append emission may reuse instead of duplicating. */
  availableImports?: Iterable<{ specifier: string; alias: string }>;
}

export interface EmitResult {
  code: string;
  imports: string[];
  preamble: string[];
  body: string[];
  sewSpans: Record<string, { start: number; end: number }>;
}

function fmt(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function sanitizeBase(name: string, used: Set<string>): string {
  let base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base || /^[0-9]/.test(base)) base = `shape_${base}`;
  if (RESERVED.has(base)) base += '_';
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

/** Kept as a public geometry utility for callers that explicitly need samples. */
export function resampleRing(ring: Point[], spacing: number): Point[] {
  if (ring.length < 2 || spacing <= 0) return ring.slice();
  const out: Point[] = [ring[0]];
  let carry = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const segmentLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segmentLength < 1e-9) continue;
    let distance = spacing - carry;
    while (distance <= segmentLength + 1e-9) {
      const t = distance / segmentLength;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      distance += spacing;
    }
    carry = segmentLength - (distance - spacing);
  }
  const last = ring[ring.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1e-6) out.push(last);
  return out;
}

function formatPathLiteral(points: Point[]): string {
  const formatted = points.map((point) => `[ ${fmt(point[0])}, ${fmt(point[1])} ]`);
  if (formatted.length <= 6) return `[${formatted.join(', ')}]`;
  const lines = ['['];
  for (let i = 0; i < formatted.length; i += 6) {
    lines.push(`  ${formatted.slice(i, i + 6).join(', ')}${i + 6 < formatted.length ? ',' : ''}`);
  }
  lines.push(']');
  return lines.join('\n');
}

function formatCurveLiteral(spec: SvgCurveSpec): string {
  const anchors = spec.anchors.map(
    ([position, incoming, outgoing]) =>
      `[${formatPathLiteral([position]).slice(1, -1)}, ${formatPathLiteral([incoming]).slice(1, -1)}, ${formatPathLiteral([outgoing]).slice(1, -1)}]`,
  );
  if (anchors.length <= 3) return `[${anchors.join(', ')}]`;
  return `[\n${anchors.map((anchor) => `  ${anchor},`).join('\n')}\n]`;
}

function included(operation: ImportOperation): boolean {
  return operation.include && operation.strategy.kind !== 'skip';
}

function namesForGeometry(
  base: string,
  geometry: SourceGeometry,
  usedNames: Set<string>,
): string[] {
  if (geometry.paths.length === 1) return [base];
  return geometry.paths.map((_, index) => sanitizeBase(`${base}_path${index + 1}`, usedNames));
}

function operationColor(operation: ImportOperation): string | null {
  return operation.role === 'fill' ? operation.sourceFill : operation.sourceStroke;
}

function pathNamesForOperation(
  operation: ImportOperation,
  geometryNames: Map<string, string[]>,
): string[] {
  if (operation.role === 'relation') {
    return operation.geometryIds.flatMap((geometryId, index) => {
      const name = geometryNames.get(geometryId)?.[operation.pathIndices[index] ?? 0];
      return name ? [name] : [];
    });
  }
  const names = geometryNames.get(operation.geometryIds[0]);
  return names ? operation.pathIndices.flatMap((index) => names[index] ?? []) : [];
}

function planningUnit(operation: ImportOperation): string {
  return operation.groupPath[0] ?? operation.sourceObjectId;
}

function planningUnits(operations: ImportOperation[], keepGroups: boolean): ImportOperation[][] {
  if (!keepGroups) return operations.map((operation) => [operation]);
  const byUnit = new Map<string, ImportOperation[]>();
  for (const operation of operations) {
    const key = planningUnit(operation);
    const members = byUnit.get(key) ?? [];
    members.push(operation);
    byUnit.set(key, members);
  }
  return [...byUnit.values()];
}

function indentLines(lines: string[], indent: string): string[] {
  return lines.map((line) => `${indent}${line}`);
}

export function emit(doc: StagedDocument, opts: EmitOptions = {}): EmitResult {
  const mode = opts.mode ?? 'replace';
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const operations = doc.operations
    .filter(included)
    .slice()
    .sort((a, b) => a.order - b.order);
  const requiredGeometryIds = new Set(operations.flatMap((operation) => operation.geometryIds));
  const geometries = doc.geometries.filter((geometry) => requiredGeometryIds.has(geometry.id));
  const preamble: string[] = [`// imported from ${doc.name}.svg — ${date}`];
  preamble.push(
    `// fabric "${doc.fabric}", thread '${doc.threadProfile}', geometry tolerance ${fmt(doc.geometryToleranceMM)} mm` +
      (doc.scaleFactor !== 1 ? `, scale ${fmt(doc.scaleFactor)}×` : '') +
      `, ${operations.length} operation${operations.length === 1 ? '' : 's'}, seed ${doc.seed}, plan '${doc.planMode}'`,
  );
  if (mode === 'replace') {
    preamble.push(
      '',
      `seed ${doc.seed}`,
      `fabric "${doc.fabric}"`,
      `threadprofile '${doc.threadProfile}'`,
    );
    if (doc.planMode !== 'off') preamble.push(`plan '${doc.planMode}'`);
  }

  const usedNames = new Set(Array.from(opts.reservedNames ?? [], (name) => name.toLowerCase()));
  const imports: string[] = [];
  const needsMotifLayout = operations.some((operation) => operation.strategy.kind === 'motifAlong');
  const needsGradient = operations.some((operation) => operation.strategy.kind === 'gradientFill');
  const existingLayout = Array.from(opts.availableImports ?? []).find(
    (requirement) => requirement.specifier === 'std.layout.alongpath',
  );
  const layoutName = needsMotifLayout
    ? (existingLayout?.alias ?? sanitizeBase('svg_alongpath', usedNames))
    : undefined;
  if (layoutName && !existingLayout) {
    imports.push(`import std.layout.alongpath as ${layoutName}`);
  }
  const existingGradientRows = Array.from(opts.availableImports ?? []).find(
    (requirement) => requirement.specifier === 'std.stitchcraft.gradientrowsn',
  );
  const gradientRowsName = needsGradient
    ? (existingGradientRows?.alias ?? sanitizeBase('svg_gradientrowsn', usedNames))
    : undefined;
  if (gradientRowsName && !existingGradientRows) {
    imports.push(`import std.stitchcraft.gradientrowsn as ${gradientRowsName}`);
  }
  const existingGradientRoute = Array.from(opts.availableImports ?? []).find(
    (requirement) => requirement.specifier === 'std.stitchcraft.serpentinerows',
  );
  const gradientRouteName = needsGradient
    ? (existingGradientRoute?.alias ?? sanitizeBase('svg_serpentinerows', usedNames))
    : undefined;
  if (gradientRouteName && !existingGradientRoute) {
    imports.push(`import std.stitchcraft.serpentinerows as ${gradientRouteName}`);
  }

  const body: string[] = ['', '// --- geometry ---'];
  const geometryNames = new Map<string, string[]>();
  const geometryBases = new Map<string, string>();
  for (const geometry of geometries) {
    const base = sanitizeBase(geometry.name, usedNames);
    const names = namesForGeometry(base, geometry, usedNames);
    geometryNames.set(geometry.id, names);
    geometryBases.set(geometry.id, base);
    geometry.paths.forEach((path, index) => {
      const curve = doc.editableCurves ? geometry.curveSpecs?.[index] : undefined;
      if (!curve) {
        body.push(`let ${names[index]} = ${formatPathLiteral(path)}`);
        return;
      }
      const specName = sanitizeBase(`${names[index]}_spec`, usedNames);
      body.push(
        `let ${specName} = ${formatCurveLiteral(curve)} // ${curve.closed ? '[curve: closed]' : '[curve]'}`,
      );
      body.push(
        `let ${names[index]} = curveflat(${specName}, ${fmt(doc.geometryToleranceMM)}${curve.closed ? ", 'closed'" : ''})`,
      );
    });
  }

  body.push('', '// --- sew ---');
  const spansRelative: Record<string, { start: number; end: number }> = {};
  let currentColor: number | string | null = null;
  const appendOperation = (operation: ImportOperation, indent: string): void => {
    const geometryId = operation.geometryIds[0];
    const strategyKind = operation.strategy.kind;
    const ringNames = pathNamesForOperation(operation, geometryNames);
    if (ringNames.length === 0) return;
    const base = geometryBases.get(geometryId) ?? 'imported';
    const context: EmitContext = {
      ringNames,
      holeMap: operation.holeMap,
      fillGroups:
        operation.role === 'fill'
          ? normalizedFillGroups(operation.holeMap)
          : operation.rings.map((_, index) => [index]),
      scaffoldName: sanitizeBase(`${base}_grain`, usedNames),
      layoutName,
      helperName:
        strategyKind === 'motifAlong' ? sanitizeBase(`${base}_place_motif`, usedNames) : undefined,
      derivedName:
        strategyKind === 'motifAlong'
          ? sanitizeBase(`${base}_centered_motif`, usedNames)
          : undefined,
      gradientReporterName:
        strategyKind === 'gradientFill'
          ? sanitizeBase(`${base}_gradient_weights`, usedNames)
          : undefined,
      gradientGroupsName:
        strategyKind === 'gradientFill'
          ? sanitizeBase(`${base}_gradient_groups`, usedNames)
          : undefined,
      gradientColorsName:
        strategyKind === 'gradientFill'
          ? sanitizeBase(`${base}_gradient_colors`, usedNames)
          : undefined,
      gradientRowsName,
      gradientRouteName,
      gradientColors: operation.sourceGradient?.stops.map((stop) =>
        mode === 'append' ? stop.color : (doc.threadMap[stop.color] ?? operation.threadIndex),
      ),
    };
    const operationBody = STRATEGIES[strategyKind].emit(operation, context);
    if (operationBody.length === 0) return;

    body.push('');
    if (operation.planBarrierBefore) body.push(`${indent}planbarrier`);
    if (strategyKind !== 'gradientFill') {
      const color =
        mode === 'append' ? (operationColor(operation) ?? '#000000') : operation.threadIndex;
      if (color !== currentColor) {
        body.push(`${indent}${typeof color === 'number' ? `color ${color}` : `color '${color}'`}`);
        currentColor = color;
      }
    } else {
      currentColor = null;
    }
    const start = body.length + 1;
    const scopedBody = [...operationBody, 'trim'];
    if (operation.atomic && strategySupportsAtomic(strategyKind)) {
      body.push(`${indent}atomic [`, ...indentLines(scopedBody, `${indent}  `), `${indent}]`);
    } else {
      body.push(...indentLines(scopedBody, indent));
    }
    spansRelative[operation.id] = { start, end: body.length };
  };

  const units = planningUnits(operations, doc.keepGroups);
  const emitRouteGroups = mode === 'replace' && doc.keepGroups;
  units.forEach((unit, unitIndex) => {
    if (emitRouteGroups) {
      body.push('', 'routegroup [');
      unit.forEach((operation) => appendOperation(operation, '  '));
      body.push(']');
    } else {
      unit.forEach((operation) => appendOperation(operation, ''));
    }
    if (doc.keepGroups && unitIndex < units.length - 1) body.push('', 'planbarrier');
  });

  const lines = [...imports, ...preamble, ...body];
  const lineOffset = imports.length + preamble.length;
  const sewSpans = Object.fromEntries(
    Object.entries(spansRelative).map(([id, span]) => [
      id,
      { start: span.start + lineOffset, end: span.end + lineOffset },
    ]),
  );
  return { code: lines.join('\n'), imports, preamble, body, sewSpans };
}
