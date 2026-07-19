// Explicit authored relationships between SVG paths. These helpers never infer
// proximity: callers must provide exactly two selected source operations.

import { bboxOf, defaultStrategy } from './model.ts';
import type { ImportOperation, StagedDocument } from './model.ts';

interface PathSelection {
  operation: ImportOperation;
  geometryId: string;
  pathIndex: number;
  closed: boolean;
}

function selectedPaths(doc: StagedDocument, ids: Iterable<string>): PathSelection[] | null {
  const geometryById = new Map(doc.geometries.map((geometry) => [geometry.id, geometry]));
  const operationById = new Map(doc.operations.map((operation) => [operation.id, operation]));
  const selections: PathSelection[] = [];
  for (const id of ids) {
    const operation = operationById.get(id);
    if (
      !operation ||
      operation.role === 'relation' ||
      !operation.include ||
      operation.geometryIds.length !== 1 ||
      operation.pathIndices.length !== 1
    ) {
      return null;
    }
    const geometryId = operation.geometryIds[0];
    const pathIndex = operation.pathIndices[0];
    const geometry = geometryById.get(geometryId);
    if (!geometry?.paths[pathIndex] || geometry.paths[pathIndex].length < 2) return null;
    selections.push({
      operation,
      geometryId,
      pathIndex,
      closed: geometry.closed[pathIndex] ?? false,
    });
  }
  return selections.length === 2 ? selections : null;
}

function samePath(a: PathSelection, b: PathSelection): boolean {
  return a.geometryId === b.geometryId && a.pathIndex === b.pathIndex;
}

function hasRelationship(
  doc: StagedDocument,
  kind: 'railPair' | 'motifAlong',
  selections: PathSelection[],
): boolean {
  return doc.operations.some((operation) => {
    if (operation.role !== 'relation' || operation.strategy.kind !== kind) return false;
    const refs = operation.geometryIds.map(
      (geometryId, index) => `${geometryId}:${operation.pathIndices[index] ?? 0}`,
    );
    const selected = selections.map(
      (selection) => `${selection.geometryId}:${selection.pathIndex}`,
    );
    return kind === 'railPair'
      ? refs.length === 2 && refs.every((ref) => selected.includes(ref))
      : refs.length === 2 && refs[0] === selected[0] && refs[1] === selected[1];
  });
}

export function canCreateRailPair(doc: StagedDocument, ids: Iterable<string>): boolean {
  const selections = selectedPaths(doc, ids);
  return Boolean(
    selections &&
    !selections[0].closed &&
    !selections[1].closed &&
    !samePath(selections[0], selections[1]) &&
    !hasRelationship(doc, 'railPair', selections),
  );
}

export function canCreateMotifAlong(doc: StagedDocument, ids: Iterable<string>): boolean {
  const selections = selectedPaths(doc, ids);
  return Boolean(
    selections &&
    !samePath(selections[0], selections[1]) &&
    !hasRelationship(doc, 'motifAlong', selections),
  );
}

function commonGroupPath(selections: PathSelection[]): string[] {
  const [first, second] = selections.map((selection) => selection.operation.groupPath);
  let length = 0;
  while (length < first.length && first[length] === second[length]) length++;
  return first.slice(0, length);
}

function nextRelationshipId(doc: StagedDocument, kind: 'railPair' | 'motifAlong'): string {
  const base = `relation-${kind}`;
  const ids = new Set(doc.operations.map((operation) => operation.id));
  let suffix = 1;
  while (ids.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

function addRelationship(
  doc: StagedDocument,
  selections: PathSelection[],
  kind: 'railPair' | 'motifAlong',
): StagedDocument {
  const [first, second] = selections;
  const sourceOperations = selections.map((selection) => selection.operation);
  const colorSource = kind === 'motifAlong' ? second.operation : first.operation;
  const rings = selections.map((selection) => selection.operation.rings[0]);
  const groupPath = commonGroupPath(selections);
  const insertAfter = Math.max(...sourceOperations.map((operation) => operation.order));
  const relation: ImportOperation = {
    id: nextRelationshipId(doc, kind),
    sourceObjectId: first.operation.sourceObjectId,
    geometryIds: selections.map((selection) => selection.geometryId),
    pathIndices: selections.map((selection) => selection.pathIndex),
    name:
      kind === 'railPair'
        ? `${first.operation.name} + ${second.operation.name} · rails`
        : `${first.operation.name} → ${second.operation.name} · motif`,
    role: 'relation',
    geomType: first.closed ? 'closedPath' : 'openPath',
    rings,
    bbox: bboxOf(rings),
    areaMm2: 0,
    sourceFill: null,
    sourceGradient: null,
    sourceStroke: colorSource.sourceStroke ?? colorSource.sourceFill ?? '#000000',
    sourceStrokeWidth: null,
    fillRule: 'nonzero',
    strategy: defaultStrategy(kind),
    threadIndex: colorSource.threadIndex,
    holeMap: [],
    sourceOrder: Math.max(...sourceOperations.map((operation) => operation.sourceOrder)) + 0.5,
    order: insertAfter + 1,
    include: true,
    atomic: false,
    planBarrierBefore: false,
    flags: {},
    findings: [],
    groupPath,
    groupId: groupPath.at(-1) ?? null,
  };
  const sourceIds = new Set(sourceOperations.map((operation) => operation.id));
  return {
    ...doc,
    sewOrderKey: 'manual',
    operations: [
      ...doc.operations.map((operation) => ({
        ...operation,
        include: sourceIds.has(operation.id) ? false : operation.include,
        order: operation.order > insertAfter ? operation.order + 1 : operation.order,
      })),
      relation,
    ],
  };
}

/** Create a satin relationship only from two explicitly selected open paths. */
export function createRailPair(doc: StagedDocument, ids: Iterable<string>): StagedDocument {
  const idList = Array.from(ids);
  const selections = selectedPaths(doc, idList);
  return selections && canCreateRailPair(doc, idList)
    ? addRelationship(doc, selections, 'railPair')
    : doc;
}

/** First selection is the route; second selection is the reusable motif. */
export function createMotifAlong(doc: StagedDocument, ids: Iterable<string>): StagedDocument {
  const idList = Array.from(ids);
  const selections = selectedPaths(doc, idList);
  return selections && canCreateMotifAlong(doc, idList)
    ? addRelationship(doc, selections, 'motifAlong')
    : doc;
}
