import type { ImportOperation, SewOrderKey } from './model.ts';

function sortOperations(
  operations: ImportOperation[],
  key: Exclude<SewOrderKey, 'manual'>,
): ImportOperation[] {
  const result = operations.slice();
  if (key === 'svg') result.sort((a, b) => a.sourceOrder - b.sourceOrder);
  if (key === 'depth') {
    result.sort((a, b) => b.areaMm2 - a.areaMm2 || a.sourceOrder - b.sourceOrder);
  }
  if (key === 'color') {
    result.sort(
      (a, b) =>
        a.threadIndex - b.threadIndex || b.areaMm2 - a.areaMm2 || a.sourceOrder - b.sourceOrder,
    );
  }
  return result;
}

/** Deterministic operation ordering with top-level SVG group constraints. */
export function orderOperations(
  operations: ImportOperation[],
  key: SewOrderKey,
  keepGroups: boolean,
): ImportOperation[] {
  if (key === 'manual') return operations.slice().sort((a, b) => a.order - b.order);
  if (!keepGroups) return sortOperations(operations, key);

  const units = new Map<string, ImportOperation[]>();
  for (const operation of operations.slice().sort((a, b) => a.sourceOrder - b.sourceOrder)) {
    const unit = operation.groupPath[0] ?? operation.sourceObjectId;
    const members = units.get(unit) ?? [];
    members.push(operation);
    units.set(unit, members);
  }
  const representatives = [...units.entries()].map(([unit, members]) => ({
    unit,
    representative:
      key === 'depth'
        ? members.reduce((largest, member) => (member.areaMm2 > largest.areaMm2 ? member : largest))
        : members[0],
  }));
  const unitByRepresentative = new Map(
    representatives.map((entry) => [entry.representative.id, entry.unit]),
  );
  return sortOperations(
    representatives.map((entry) => entry.representative),
    key,
  ).flatMap((representative) =>
    (units.get(unitByRepresentative.get(representative.id)!) ?? []).sort(
      (a, b) => a.sourceOrder - b.sourceOrder,
    ),
  );
}
