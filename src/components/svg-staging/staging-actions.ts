// Pure immutable updates for the canonical SVG source/geometry/operation model.

import type {
  BBox,
  ElementModel,
  StagedDocument,
  Strategy,
  StrategyKind,
  SewOrderKey,
} from '@/lib/engine';
import {
  autoSuggest,
  bboxOf,
  defaultStrategy,
  eligibleStrategies,
  geometryOutsideField,
  netFillArea,
  strategySupportsAtomic,
} from '@/lib/engine';
import { simplifyRDP } from '@/lib/formats/svg-import/svg-path';
import { orderOperations } from '@/lib/formats/svg-import/ordering';

export {
  canCreateMotifAlong,
  canCreateRailPair,
  createMotifAlong,
  createRailPair,
} from '@/lib/formats/svg-import/relationships';

function mapOperations(
  doc: StagedDocument,
  fn: (operation: ElementModel) => ElementModel,
): StagedDocument {
  return { ...doc, operations: doc.operations.map(fn) };
}

function compatibleParams(
  strategy: Strategy,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  if (strategy.kind !== 'runningMotif') return patch;
  if (patch.bean === true) return { ...patch, estitch: false };
  if (patch.estitch === true) return { ...patch, bean: false };
  return patch;
}

export function setElementStrategy(
  doc: StagedDocument,
  ids: Set<string>,
  kind: StrategyKind,
): StagedDocument {
  return mapOperations(doc, (operation) =>
    ids.has(operation.id) &&
    eligibleStrategies(
      operation.geomType,
      operation.role,
      operation.sourceGradient !== null,
    ).includes(kind) &&
    (operation.role !== 'relation' || operation.strategy.kind === kind)
      ? {
          ...operation,
          strategy: defaultStrategy(kind),
          atomic: operation.atomic && strategySupportsAtomic(kind),
        }
      : operation,
  );
}

export function setPlanningForSelection(
  doc: StagedDocument,
  ids: Set<string>,
  patch: { atomic?: boolean; planBarrierBefore?: boolean },
): StagedDocument {
  return mapOperations(doc, (operation) => {
    if (!ids.has(operation.id)) return operation;
    const atomic =
      patch.atomic === undefined
        ? operation.atomic
        : patch.atomic && strategySupportsAtomic(operation.strategy.kind);
    return { ...operation, ...patch, atomic };
  });
}

export function setElementParams(
  doc: StagedDocument,
  id: string,
  params: Record<string, unknown>,
): StagedDocument {
  return mapOperations(doc, (operation) => {
    if (operation.id !== id || operation.strategy.kind === 'skip') return operation;
    return {
      ...operation,
      strategy: {
        ...operation.strategy,
        params: {
          ...(operation.strategy as Extract<Strategy, { params: object }>).params,
          ...compatibleParams(operation.strategy, params),
        },
      } as Strategy,
    };
  });
}

export function setParamsForSelection(
  doc: StagedDocument,
  ids: Set<string>,
  params: Record<string, unknown>,
): StagedDocument {
  return mapOperations(doc, (operation) => {
    if (!ids.has(operation.id) || operation.strategy.kind === 'skip') return operation;
    return {
      ...operation,
      strategy: {
        ...operation.strategy,
        params: {
          ...(operation.strategy as Extract<Strategy, { params: object }>).params,
          ...compatibleParams(operation.strategy, params),
        },
      } as Strategy,
    };
  });
}

export function setInclude(doc: StagedDocument, id: string, include: boolean): StagedDocument {
  return mapOperations(doc, (operation) =>
    operation.id === id ? { ...operation, include } : operation,
  );
}

export function renameElement(doc: StagedDocument, id: string, name: string): StagedDocument {
  return mapOperations(doc, (operation) =>
    operation.id === id ? { ...operation, name } : operation,
  );
}

export function setHole(
  doc: StagedDocument,
  id: string,
  ringIndex: number,
  hole: boolean,
): StagedDocument {
  return mapOperations(doc, (operation) => {
    if (operation.id !== id) return operation;
    const holeMap = operation.holeMap.map((entry, index) =>
      index === ringIndex ? { ...entry, hole } : entry,
    );
    return { ...operation, holeMap, areaMm2: netFillArea(operation.rings, holeMap) };
  });
}

export function remapSourceColor(
  doc: StagedDocument,
  sourceHex: string,
  threadIndex: number,
): StagedDocument {
  const next = mapOperations(doc, (operation) => {
    const source = operation.sourceFill ?? operation.sourceStroke;
    const usesGradientColor = operation.sourceGradient?.stops.some(
      (stop) => stop.color === sourceHex,
    );
    return source === sourceHex || usesGradientColor ? { ...operation, threadIndex } : operation;
  });
  return { ...next, threadMap: { ...next.threadMap, [sourceHex]: threadIndex } };
}

export function remapElementThread(
  doc: StagedDocument,
  id: string,
  threadIndex: number,
): StagedDocument {
  return mapOperations(doc, (operation) =>
    operation.id === id ? { ...operation, threadIndex } : operation,
  );
}

export function setGlobal(doc: StagedDocument, patch: Partial<StagedDocument>): StagedDocument {
  return { ...doc, ...patch };
}

export function reorderElements(
  doc: StagedDocument,
  activeId: string,
  overId: string,
): StagedDocument {
  const ordered = doc.operations.slice().sort((a, b) => a.order - b.order);
  const from = ordered.findIndex((operation) => operation.id === activeId);
  const to = ordered.findIndex((operation) => operation.id === overId);
  if (from < 0 || to < 0 || from === to) return doc;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const orderById = new Map(ordered.map((operation, index) => [operation.id, index]));
  return {
    ...mapOperations(doc, (operation) => ({
      ...operation,
      order: orderById.get(operation.id) ?? operation.order,
    })),
    sewOrderKey: 'manual',
  };
}

export function autoOrder(doc: StagedDocument, key: SewOrderKey): StagedDocument {
  const ordered = orderOperations(doc.operations, key, doc.keepGroups);
  const orderById = new Map(ordered.map((operation, index) => [operation.id, index]));
  return {
    ...mapOperations(doc, (operation) => ({
      ...operation,
      order: orderById.get(operation.id) ?? operation.order,
    })),
    sewOrderKey: key,
  };
}

function scaledBBox(bbox: BBox, ratio: number): BBox {
  return {
    minX: bbox.minX * ratio,
    minY: bbox.minY * ratio,
    maxX: bbox.maxX * ratio,
    maxY: bbox.maxY * ratio,
  };
}

function syncOperationGeometry(doc: StagedDocument): StagedDocument {
  const geometryById = new Map(doc.geometries.map((geometry) => [geometry.id, geometry]));
  return mapOperations(doc, (operation) => {
    const geometry = geometryById.get(operation.geometryIds[0]);
    if (!geometry) return operation;
    const rings =
      operation.role === 'relation'
        ? operation.geometryIds.flatMap((geometryId, index) => {
            const path = geometryById.get(geometryId)?.paths[operation.pathIndices[index] ?? 0];
            return path ? [path] : [];
          })
        : operation.pathIndices.map((index) => geometry.paths[index]);
    if (rings.length !== operation.pathIndices.length) return operation;
    const curveSpecs =
      operation.role !== 'relation' && geometry.curveSpecs
        ? operation.pathIndices.map((index) => geometry.curveSpecs![index])
        : undefined;
    const isOutside = geometryOutsideField(rings, doc.activeField);
    const wasOutside = operation.flags.outsideHoop ?? false;
    let include = operation.include;
    if (!wasOutside && isOutside) include = false;
    if (wasOutside && !isOutside && !operation.flags.degenerate) include = true;
    let strategy = operation.strategy;
    if (wasOutside && !isOutside && strategy.kind === 'skip' && !operation.flags.degenerate) {
      strategy = operation.sourceGradient
        ? defaultStrategy('gradientFill')
        : autoSuggest(
            operation.geomType,
            rings,
            operation.sourceFill,
            operation.sourceStroke,
            operation.sourceStrokeWidth,
          );
    }
    return {
      ...operation,
      rings,
      curveSpecs,
      bbox: bboxOf(rings),
      areaMm2: operation.role === 'fill' ? netFillArea(rings, operation.holeMap) : 0,
      include,
      strategy,
      flags: { ...operation.flags, outsideHoop: isOutside || undefined },
    };
  });
}

export function setGeometryTolerance(doc: StagedDocument, tolerance: number): StagedDocument {
  const next = {
    ...doc,
    geometryToleranceMM: tolerance,
    geometries: doc.geometries.map((geometry) => {
      const paths = geometry.sourcePaths.map((path) => simplifyRDP(path, tolerance));
      return { ...geometry, paths, bbox: bboxOf(paths) };
    }),
  };
  return syncOperationGeometry(next);
}

export function setScale(doc: StagedDocument, newFactor: number): StagedDocument {
  const ratio = newFactor / doc.scaleFactor;
  if (Math.abs(ratio - 1) < 1e-9) return { ...doc, scaleFactor: newFactor };
  const next: StagedDocument = {
    ...doc,
    scaleFactor: newFactor,
    geometries: doc.geometries.map((geometry) => ({
      ...geometry,
      paths: geometry.paths.map((path) => path.map(([x, y]) => [x * ratio, y * ratio])),
      sourcePaths: geometry.sourcePaths.map((path) => path.map(([x, y]) => [x * ratio, y * ratio])),
      curveSpecs: geometry.curveSpecs?.map((spec) => ({
        ...spec,
        anchors: spec.anchors.map(([position, incoming, outgoing]) => [
          [position[0] * ratio, position[1] * ratio],
          [incoming[0] * ratio, incoming[1] * ratio],
          [outgoing[0] * ratio, outgoing[1] * ratio],
        ]),
      })),
      bbox: scaledBBox(geometry.bbox, ratio),
    })),
    sourceObjects: doc.sourceObjects.map((sourceObject) => ({
      ...sourceObject,
      paint: {
        ...sourceObject.paint,
        strokeWidthMM:
          sourceObject.paint.strokeWidthMM === null
            ? null
            : sourceObject.paint.strokeWidthMM * ratio,
        dashArrayMM: sourceObject.paint.dashArrayMM?.map((value) => value * ratio) ?? null,
        dashOffsetMM: sourceObject.paint.dashOffsetMM * ratio,
        fillGradient: sourceObject.paint.fillGradient
          ? {
              ...sourceObject.paint.fillGradient,
              start: sourceObject.paint.fillGradient.start.map((value) => value * ratio) as [
                number,
                number,
              ],
              end: sourceObject.paint.fillGradient.end.map((value) => value * ratio) as [
                number,
                number,
              ],
            }
          : null,
      },
    })),
    operations: doc.operations.map((operation) => ({
      ...operation,
      sourceStrokeWidth:
        operation.sourceStrokeWidth === null ? null : operation.sourceStrokeWidth * ratio,
      sourceGradient: operation.sourceGradient
        ? {
            ...operation.sourceGradient,
            start: operation.sourceGradient.start.map((value) => value * ratio) as [number, number],
            end: operation.sourceGradient.end.map((value) => value * ratio) as [number, number],
          }
        : null,
    })),
  };
  return syncOperationGeometry(next);
}
