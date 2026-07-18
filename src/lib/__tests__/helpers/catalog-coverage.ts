import type { NSItem } from '../../needlescript-monaco/catalog.ts';

export interface CatalogCoverageGap {
  command: string;
  missing: Array<'completion' | 'hover' | 'signature'>;
}

/**
 * The Monaco providers all consume NSItem: completion needs its insertion
 * fields, hover needs documentation, and signature help needs params.
 */
export function catalogCoverageGaps(
  commands: Iterable<string>,
  catalog: ReadonlyMap<string, NSItem>,
): CatalogCoverageGap[] {
  const gaps: CatalogCoverageGap[] = [];
  for (const command of [...commands].sort()) {
    const item = catalog.get(command);
    const missing: CatalogCoverageGap['missing'] = [];
    if (!item || !item.label || !item.detail || !item.insertText) missing.push('completion');
    if (!item || !item.documentation.trim()) missing.push('hover');
    if (!item || !item.params || item.params.length === 0) missing.push('signature');
    if (missing.length > 0) gaps.push({ command, missing });
  }
  return gaps;
}

export function catalogModeGaps(
  command: string,
  modes: readonly string[],
  catalog: ReadonlyMap<string, NSItem>,
): string[] {
  const item = catalog.get(command);
  if (!item) return modes.map((mode) => `${command}:${mode}:missing-item`);
  const documentation = item.documentation.toLowerCase();
  const insertion = item.insertText.toLowerCase();
  return modes.flatMap((mode) => {
    const gaps: string[] = [];
    if (!documentation.includes(mode.toLowerCase()))
      gaps.push(`${command}:${mode}:missing-documentation`);
    if (!insertion.includes(mode.toLowerCase())) gaps.push(`${command}:${mode}:missing-completion`);
    return gaps;
  });
}
