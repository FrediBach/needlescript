// ---------- Extensible deterministic route ordering ----------

export type RoutePoint = readonly [number, number];

export interface RouteItem<T> {
  value: T;
  index: number;
  entry: RoutePoint;
  exit: RoutePoint;
  reverseEntry?: RoutePoint;
  reverseExit?: RoutePoint;
}

export interface RoutedItem<T> {
  item: RouteItem<T>;
  reversed: boolean;
}

export interface RouteOptions {
  start?: RoutePoint;
  anchorFirst?: boolean;
  allowReverse?: boolean;
  /** Budget hook. Called once per endpoint whose distance is examined. */
  examine?: (count: number) => void;
}

export type RouteAlgorithm = <T>(items: RouteItem<T>[], options: RouteOptions) => RoutedItem<T>[];

const BUCKET_MM = 4;
const TIE_EPSILON = 1e-9;

interface Candidate<T> {
  item: RouteItem<T>;
  reversed: boolean;
  entry: RoutePoint;
  exit: RoutePoint;
}

const bucketKey = (x: number, y: number) =>
  `${Math.floor(x / BUCKET_MM)},${Math.floor(y / BUCKET_MM)}`;

function nearestRoute<T>(items: RouteItem<T>[], options: RouteOptions): RoutedItem<T>[] {
  if (items.length === 0) return [];

  const candidates = new Map<number, Candidate<T>[]>();
  const buckets = new Map<string, Candidate<T>[]>();
  const remaining = new Set<number>();
  const add = (candidate: Candidate<T>) => {
    const list = candidates.get(candidate.item.index);
    if (list) list.push(candidate);
    else candidates.set(candidate.item.index, [candidate]);
    const key = bucketKey(candidate.entry[0], candidate.entry[1]);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(candidate);
    else buckets.set(key, [candidate]);
  };

  for (const item of items) {
    remaining.add(item.index);
    add({ item, reversed: false, entry: item.entry, exit: item.exit });
    if (options.allowReverse && item.reverseEntry && item.reverseExit)
      add({ item, reversed: true, entry: item.reverseEntry, exit: item.reverseExit });
  }

  const result: RoutedItem<T>[] = [];
  let cursor: RoutePoint;
  if (options.anchorFirst !== false && options.start === undefined) {
    const first = items[0];
    result.push({ item: first, reversed: false });
    remaining.delete(first.index);
    cursor = first.exit;
  } else {
    cursor = options.start ?? items[0].entry;
  }

  const consider = (
    candidate: Candidate<T>,
    best: Candidate<T> | null,
    bestDistance: number,
  ): [Candidate<T> | null, number] => {
    if (!remaining.has(candidate.item.index)) return [best, bestDistance];
    options.examine?.(1);
    const distance = Math.hypot(candidate.entry[0] - cursor[0], candidate.entry[1] - cursor[1]);
    if (
      distance < bestDistance - TIE_EPSILON ||
      (Math.abs(distance - bestDistance) <= TIE_EPSILON &&
        (best === null ||
          candidate.item.index < best.item.index ||
          (candidate.item.index === best.item.index && best.reversed && !candidate.reversed)))
    )
      return [candidate, distance];
    return [best, bestDistance];
  };

  while (remaining.size > 0) {
    const bx = Math.floor(cursor[0] / BUCKET_MM);
    const by = Math.floor(cursor[1] / BUCKET_MM);
    let best: Candidate<T> | null = null;
    let bestDistance = Infinity;
    let usedFallback = false;

    for (let ring = 0; ; ring++) {
      // Very sparse or enormous coordinate ranges should not spend time walking
      // empty buckets. The fallback is exact and keeps the worst case bounded.
      if (ring === 64) {
        usedFallback = true;
        break;
      }
      for (let x = bx - ring; x <= bx + ring; x++) {
        for (let y = by - ring; y <= by + ring; y++) {
          if (Math.max(Math.abs(x - bx), Math.abs(y - by)) !== ring) continue;
          const bucket = buckets.get(`${x},${y}`);
          if (!bucket) continue;
          for (const candidate of bucket)
            [best, bestDistance] = consider(candidate, best, bestDistance);
        }
      }
      if (best !== null) {
        const minX = (bx - ring) * BUCKET_MM;
        const maxX = (bx + ring + 1) * BUCKET_MM;
        const minY = (by - ring) * BUCKET_MM;
        const maxY = (by + ring + 1) * BUCKET_MM;
        const distanceOutside = Math.min(
          cursor[0] - minX,
          maxX - cursor[0],
          cursor[1] - minY,
          maxY - cursor[1],
        );
        // Search through the epsilon band so an equidistant item in an outer
        // bucket can still win by its lower original index.
        if (bestDistance < distanceOutside - TIE_EPSILON) break;
      }
    }

    if (usedFallback) {
      best = null;
      bestDistance = Infinity;
      for (const index of remaining)
        for (const candidate of candidates.get(index) ?? [])
          [best, bestDistance] = consider(candidate, best, bestDistance);
    }
    // Every route item has at least its forward candidate.
    if (best === null) break;
    result.push({ item: best.item, reversed: best.reversed });
    remaining.delete(best.item.index);
    cursor = best.exit;
  }
  return result;
}

/**
 * Central algorithm registry. Data routing and event planning both resolve
 * through this table, so new algorithms do not need parser/interpreter edits.
 */
export const ROUTE_ALGORITHMS = {
  nearest: nearestRoute,
} satisfies Record<string, RouteAlgorithm>;

export interface RouteSortMode {
  algorithm: keyof typeof ROUTE_ALGORITHMS;
  reversePaths: boolean;
}

/** Public data-router modes, separate from the algorithms they configure. */
export const ROUTESORT_MODES: Readonly<Record<string, RouteSortMode>> = {
  chain: { algorithm: 'nearest', reversePaths: false },
  both: { algorithm: 'nearest', reversePaths: true },
};

export function routeItems<T>(
  algorithm: keyof typeof ROUTE_ALGORITHMS,
  items: RouteItem<T>[],
  options: RouteOptions = {},
): RoutedItem<T>[] {
  return ROUTE_ALGORITHMS[algorithm](items, options);
}
