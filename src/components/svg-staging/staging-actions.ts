// Pure update helpers for the staged document. Each returns a new
// StagedDocument so the staging hook can drive React state immutably.

import type {
  ElementModel,
  StagedDocument,
  Strategy,
  StrategyKind,
  SewOrderKey,
} from '@/lib/engine';
import { defaultStrategy } from '@/lib/engine';

function mapElements(doc: StagedDocument, fn: (el: ElementModel) => ElementModel): StagedDocument {
  return { ...doc, elements: doc.elements.map(fn) };
}

export function setElementStrategy(
  doc: StagedDocument,
  ids: Set<string>,
  kind: StrategyKind,
): StagedDocument {
  return mapElements(doc, (el) =>
    ids.has(el.id) ? { ...el, strategy: defaultStrategy(kind) } : el,
  );
}

export function setElementParams(
  doc: StagedDocument,
  id: string,
  params: Record<string, unknown>,
): StagedDocument {
  return mapElements(doc, (el) => {
    if (el.id !== id || el.strategy.kind === 'skip') return el;
    return {
      ...el,
      strategy: {
        ...el.strategy,
        params: { ...(el.strategy as Extract<Strategy, { params: object }>).params, ...params },
      } as Strategy,
    };
  });
}

/** Edit a shared parameter across several elements (must share a strategy kind). */
export function setParamsForSelection(
  doc: StagedDocument,
  ids: Set<string>,
  params: Record<string, unknown>,
): StagedDocument {
  return mapElements(doc, (el) => {
    if (!ids.has(el.id) || el.strategy.kind === 'skip') return el;
    return {
      ...el,
      strategy: {
        ...el.strategy,
        params: { ...(el.strategy as Extract<Strategy, { params: object }>).params, ...params },
      } as Strategy,
    };
  });
}

export function setInclude(doc: StagedDocument, id: string, include: boolean): StagedDocument {
  return mapElements(doc, (el) => (el.id === id ? { ...el, include } : el));
}

export function renameElement(doc: StagedDocument, id: string, name: string): StagedDocument {
  return mapElements(doc, (el) => (el.id === id ? { ...el, name } : el));
}

export function setHole(
  doc: StagedDocument,
  id: string,
  ringIndex: number,
  hole: boolean,
): StagedDocument {
  return mapElements(doc, (el) => {
    if (el.id !== id) return el;
    const holeMap = el.holeMap.map((h, i) => (i === ringIndex ? { ...h, hole } : h));
    return { ...el, holeMap };
  });
}

/** Remap every element using a given source colour to a palette slot. */
export function remapSourceColor(
  doc: StagedDocument,
  sourceHex: string,
  threadIndex: number,
): StagedDocument {
  const next = mapElements(doc, (el) => {
    const src = el.sourceFill ?? el.sourceStroke;
    return src === sourceHex ? { ...el, threadIndex } : el;
  });
  return { ...next, threadMap: { ...next.threadMap, [sourceHex]: threadIndex } };
}

/** Remap a single element to a palette slot (split it onto its own thread). */
export function remapElementThread(
  doc: StagedDocument,
  id: string,
  threadIndex: number,
): StagedDocument {
  return mapElements(doc, (el) => (el.id === id ? { ...el, threadIndex } : el));
}

export function setGlobal(doc: StagedDocument, patch: Partial<StagedDocument>): StagedDocument {
  return { ...doc, ...patch };
}

/** Move an element so it sits at a new index in sew order. */
export function reorderElements(
  doc: StagedDocument,
  activeId: string,
  overId: string,
): StagedDocument {
  const ordered = doc.elements.slice().sort((a, b) => a.order - b.order);
  const from = ordered.findIndex((e) => e.id === activeId);
  const to = ordered.findIndex((e) => e.id === overId);
  if (from < 0 || to < 0 || from === to) return doc;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const orderById = new Map(ordered.map((e, i) => [e.id, i]));
  return {
    ...mapElements(doc, (el) => ({ ...el, order: orderById.get(el.id) ?? el.order })),
    sewOrderKey: 'manual' as SewOrderKey,
  };
}

/** Re-sort sew order by a primary key (depth or colour), keeping groups optional. */
export function autoOrder(doc: StagedDocument, key: SewOrderKey): StagedDocument {
  const els = doc.elements.slice();
  if (key === 'depth') {
    els.sort((a, b) => b.areaMm2 - a.areaMm2);
  } else if (key === 'color') {
    // group by thread (contiguous), tiebreak by area large→small
    els.sort((a, b) => a.threadIndex - b.threadIndex || b.areaMm2 - a.areaMm2);
  }
  const orderById = new Map(els.map((e, i) => [e.id, i]));
  return {
    ...mapElements(doc, (el) => ({ ...el, order: orderById.get(el.id) ?? el.order })),
    sewOrderKey: key,
  };
}
