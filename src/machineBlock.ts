import { tokenize } from './lib/engine.ts';
import type { MachineHoop, MachinePreset } from './data.ts';

export interface MachineBlock {
  id: string;
  hoopId: string;
  budgetMode: boolean;
  start: number;
  end: number;
  source: string;
}

export interface BlockOptions {
  budgetMode?: boolean;
  omitHoop?: boolean;
  omitBudget?: boolean;
}

const START = /^\s*\/\/\s*@machine\s+([\w-]+)\s+hoop=([\w-]+)(?:\s+(budget))?\s+v1\s*$/i;
const END = /^\s*\/\/\s*@endmachine\s*$/i;

export function findBlock(source: string): MachineBlock | null {
  const lines = source.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(START);
    if (!match) {
      offset += lines[i].length + 1;
      continue;
    }
    let endOffset = offset + lines[i].length;
    for (let j = i + 1; j < lines.length; j++) {
      endOffset += 1 + lines[j].length;
      if (END.test(lines[j])) {
        return {
          id: match[1].toLowerCase(),
          hoopId: match[2].toLowerCase(),
          budgetMode: !!match[3],
          start: offset,
          end: endOffset,
          source: source.slice(offset, endOffset),
        };
      }
    }
    return null; // A stray start marker is deliberately treated as ordinary text.
  }
  return null;
}

function maxDensity(machine: MachinePreset): string {
  return machine.cls === 'home' ? '3.0' : machine.cls === 'multi-needle' ? '3.5' : '4.0';
}

export function generateBlock(
  machine: MachinePreset,
  hoop: MachineHoop,
  opts: BlockOptions = {},
): string {
  const budget = opts.budgetMode && !opts.omitBudget;
  const marker = `// @machine ${machine.id} hoop=${opts.omitHoop ? 'keep' : hoop.id}${budget ? ' budget' : ''} v1`;
  const lines = [marker];
  if (!opts.omitHoop)
    lines.push(`hoop ${hoop.hoopArg}  // ${hoop.label} — sized for the ${machine.model}`);
  if (machine.trimmer === 'jump')
    lines.push('autotrim 7  // machine trims jump threads automatically');
  if (machine.trimmer === 'colorchange')
    lines.push('autotrim 12  // trims at colour changes — prefer fewer, longer travels');
  if (machine.trimmer === 'none')
    lines.push('autotrim 0  // no trimmer: leave connectors for scissor-trimming');
  lines.push('lock 0.7  // tie-off so runs cannot unravel');
  lines.push(
    `maxdensity ${maxDensity(machine)}  // ${machine.cls} machine: keep coverage practical`,
  );
  if (budget && machine.budgetStitches)
    lines.push(
      `override 'stitches' ${machine.budgetStitches}  // budget mode: practical ${machine.model} limit`,
    );
  else lines.push("// Add override 'stitches' only with eyes open if this design needs more.");
  lines.push('// @endmachine');
  return lines.join('\n');
}

export function blockHasManualEdits(
  block: MachineBlock,
  machine: MachinePreset,
  hoop: MachineHoop,
): boolean {
  const canonical = generateBlock(machine, hoop, {
    budgetMode: block.budgetMode,
    omitHoop: block.hoopId === 'keep',
  });
  return normalise(block.source) !== normalise(canonical);
}

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

export function applyBlock(source: string, block: string): string {
  const found = findBlock(source);
  if (found) return surroundBlock(source.slice(0, found.start), block, source.slice(found.end));
  const lines = source.split(/\r?\n/);
  let insertAt = 0;
  while (insertAt < lines.length && /^\s*(?:\/\/|;|#)/.test(lines[insertAt])) insertAt++;
  return surroundBlock(
    lines.slice(0, insertAt).join('\n'),
    block,
    lines.slice(insertAt).join('\n'),
  );
}

/** Keep managed settings visually distinct without accumulating blank lines on re-apply. */
function surroundBlock(before: string, block: string, after: string): string {
  const trimmedBefore = before.replace(/(?:\r?\n)+$/, '');
  const trimmedAfter = after.replace(/^(?:\r?\n)+/, '');
  const top = trimmedBefore ? `${trimmedBefore}\n\n` : '\n';
  const bottom = trimmedAfter ? `\n\n${trimmedAfter}` : '\n\n';
  return `${top}${block}${bottom}`;
}

export function removeBlock(source: string): string {
  const found = findBlock(source);
  if (!found) return source;
  return `${source.slice(0, found.start)}${source.slice(found.end).replace(/^\r?\n/, '')}`;
}

export function findConflicts(source: string): { hoop: boolean; stitchesOverride: boolean } {
  const found = findBlock(source);
  const outside = found ? `${source.slice(0, found.start)}${source.slice(found.end)}` : source;
  // Tokenization keeps comments and strings out of the scan and is tolerant of formatting.
  const tokens = tokenize(outside);
  let hoop = false;
  let stitchesOverride = false;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].t !== 'word') continue;
    if (tokens[i].v === 'hoop') hoop = true;
    if (
      tokens[i].v === 'override' &&
      tokens[i + 1]?.t === 'string' &&
      tokens[i + 1].v === 'stitches'
    )
      stitchesOverride = true;
  }
  return { hoop, stitchesOverride };
}

export function applyFabric(source: string, fabric: string): string {
  const line = `fabric '${fabric}'  // selected material preset`;
  const block = findBlock(source);
  const restStart = block ? block.end : 0;
  const before = source.slice(0, restStart);
  const after = source.slice(restStart);
  const replaced = after.replace(/^\s*fabric\s+'[^']*'.*$/im, line);
  if (replaced !== after) return before + replaced;
  const pos = block ? block.end : 0;
  return `${source.slice(0, pos)}${pos ? '\n' : ''}${line}\n${source.slice(pos)}`;
}
