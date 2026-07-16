import { NeedlescriptError } from './errors.ts';
import { describeVal, isList } from './list.ts';
import type { NsList, Val } from './list.ts';
import type { ChalkDataVar, ChalkStroke } from './types.ts';

type ChalkInspection = Pick<
  ChalkDataVar,
  'strokes' | 'kind' | 'vertexCount' | 'pathCount' | 'pathLength'
>;

type InspectOptions =
  { mode: 'loud'; line?: number; label?: string } | { mode: 'silent'; line?: never; label?: never };

const isFinitePoint = (value: Val): boolean =>
  isList(value) &&
  value.items.length === 2 &&
  value.items.every((item) => typeof item === 'number' && Number.isFinite(item));

function pointFrom(value: Val): [number, number] {
  const list = value as NsList;
  return [list.items[0] as number, list.items[1] as number];
}

function pathLength(vertices: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i++) {
    const dx = vertices[i][0] - vertices[i - 1][0];
    const dy = vertices[i][1] - vertices[i - 1][1];
    total += Math.hypot(dx, dy);
  }
  return total;
}

/**
 * Classify and snapshot a point, path, or point/path group. Loud mode is used
 * by the language command; silent mode filters final globals for the inspector.
 */
export function inspectChalkValue(value: Val, options: InspectOptions): ChalkInspection | null {
  const fail = (message: string): null => {
    if (options.mode === 'loud')
      throw new NeedlescriptError(`${options.label ?? 'chalk'}: ${message}`, options.line);
    return null;
  };

  if (!isList(value))
    return fail(`expected a point, path, or list of paths, got ${describeVal(value)}`);
  if (value.items.length === 0) return null;

  if (isFinitePoint(value)) {
    return {
      strokes: [{ vertices: [pointFrom(value)], kind: 'point' }],
      kind: 'point',
      vertexCount: 1,
      pathCount: 0,
    };
  }

  const numericItems = value.items.filter((item) => typeof item === 'number');
  if (numericItems.length > 0) {
    if (numericItems.length === value.items.length)
      return fail(
        `flat list of ${value.items.length} numbers is neither a point nor a path` +
          (value.items.length % 2 === 0 ? ' — did you mean nested [x, y] points?' : ''),
      );
    return fail('ragged list mixes numbers with nested values');
  }

  const readPath = (candidate: Val, elementIndex?: number): ChalkStroke | null => {
    if (!isList(candidate) || candidate.items.length === 0)
      return fail(
        `${elementIndex === undefined ? 'value' : `element ${elementIndex + 1}`} must be a point or non-empty path`,
      );
    if (isFinitePoint(candidate)) return { vertices: [pointFrom(candidate)], kind: 'point' };
    const vertices: [number, number][] = [];
    for (let vertexIndex = 0; vertexIndex < candidate.items.length; vertexIndex++) {
      const vertex = candidate.items[vertexIndex];
      if (!isFinitePoint(vertex))
        return fail(
          `${elementIndex === undefined ? '' : `element ${elementIndex + 1}, `}vertex ${vertexIndex + 1} must be [x, y] with finite coordinates`,
        );
      vertices.push(pointFrom(vertex));
    }
    return { vertices, kind: 'path' };
  };

  // A list whose every member is a point is one ordered path.
  if (value.items.every(isFinitePoint)) {
    const vertices = value.items.map(pointFrom);
    return {
      strokes: [{ vertices, kind: 'path' }],
      kind: 'path',
      vertexCount: vertices.length,
      pathCount: 1,
      pathLength: pathLength(vertices),
    };
  }

  const strokes: ChalkStroke[] = [];
  for (let i = 0; i < value.items.length; i++) {
    const stroke = readPath(value.items[i], i);
    if (!stroke) return null;
    strokes.push(stroke);
  }
  const hasPoints = strokes.some((stroke) => stroke.kind === 'point');
  const hasPaths = strokes.some((stroke) => stroke.kind === 'path');
  return {
    strokes,
    kind: hasPoints && hasPaths ? 'mixed' : 'group',
    vertexCount: strokes.reduce((sum, stroke) => sum + stroke.vertices.length, 0),
    pathCount: strokes.filter((stroke) => stroke.kind === 'path').length,
  };
}
