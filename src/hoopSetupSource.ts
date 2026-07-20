import type { MaterialIntent } from './lib/engine.ts';

export interface HoopSetupPatch {
  background?: string;
  palette?: string[];
  material?: MaterialIntent;
}

const MATERIAL_COMMANDS = [
  'fabric',
  'fabricgrain',
  'fabricstretch',
  'threadprofile',
  'threadwidth',
  'needle',
  'stabilizer',
  'topping',
] as const;

function sourceLines(source: string): { lines: string[]; newline: string } {
  return {
    lines: source.split(/\r?\n/),
    newline: source.includes('\r\n') ? '\r\n' : '\n',
  };
}

/** Track NeedleScript's square-bracket block depth while ignoring strings and comments. */
function bracketDelta(line: string): number {
  let delta = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === "'") quoted = false;
      continue;
    }
    if (char === "'") quoted = true;
    else if (char === ';' || char === '#' || (char === '/' && line[index + 1] === '/')) break;
    else if (char === '[') delta++;
    else if (char === ']') delta--;
  }
  return delta;
}

function removeTopLevelCommands(lines: string[], commands: ReadonlySet<string>): string[] {
  let depth = 0;
  return lines.filter((line) => {
    const atTopLevel = depth === 0;
    const command = atTopLevel ? line.match(/^\s*([a-z][\w-]*)\b/i)?.[1].toLowerCase() : undefined;
    depth = Math.max(0, depth + bracketDelta(line));
    return !command || !commands.has(command);
  });
}

function insertSetupLines(lines: string[], directives: string[]): string[] {
  if (directives.length === 0) return lines;

  let insertAt = 0;
  while (
    insertAt < lines.length &&
    (lines[insertAt].trim() === '' ||
      (/^\s*(?:\/\/|;|#)/.test(lines[insertAt]) && !/^\s*\/\/\s*@machine\b/i.test(lines[insertAt])))
  )
    insertAt++;

  // Machine presets are managed as one block. Keep setup declarations outside it so editing
  // the hoop dialog does not make the machine block look manually modified.
  if (/^\s*\/\/\s*@machine\b/i.test(lines[insertAt] ?? '')) {
    const blockEnd = lines.findIndex(
      (line, index) => index >= insertAt && /^\s*\/\/\s*@endmachine\s*$/i.test(line),
    );
    if (blockEnd >= 0) insertAt = blockEnd + 1;
  }

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  while (before.at(-1)?.trim() === '') before.pop();
  while (after[0]?.trim() === '') after.shift();
  return [
    ...before,
    ...(before.length ? [''] : []),
    ...directives,
    ...(after.length ? [''] : []),
    ...after,
  ];
}

function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function materialDirectives(material: MaterialIntent): string[] {
  return [
    ...(material.fabricPreset === 'unspecified'
      ? []
      : [`fabric '${material.fabricPreset}'  // material intent`]),
    `fabricgrain ${formatNumber(material.grainHeading)}`,
    `fabricstretch ${formatNumber(material.stretchAlong)} ${formatNumber(material.stretchAcross)}`,
    `threadprofile '${material.threadProfile}'`,
    `threadwidth ${formatNumber(material.threadWidthMM)}`,
    `needle ${material.needleSize ?? 0}`,
    `stabilizer '${material.stabilizer ?? 'none'}'`,
    `topping ${material.topping ? 1 : 0}`,
  ];
}

/**
 * Apply the visual setup chosen in the hoop dialog as canonical top-level declarations.
 * Nested material commands inside stitch scopes and procedures are deliberately left alone.
 */
export function applyHoopSetupPatch(source: string, patch: HoopSetupPatch): string {
  const { lines: originalLines, newline } = sourceLines(source);
  const commands = new Set<string>();
  const directives: string[] = [];

  if (patch.background !== undefined) {
    commands.add('background');
    directives.push(`background '${patch.background}'`);
  }
  if (patch.palette !== undefined) {
    commands.add('palette');
    directives.push(`palette [${patch.palette.map((color) => `'${color}'`).join(', ')}]`);
  }
  if (patch.material !== undefined) {
    MATERIAL_COMMANDS.forEach((command) => commands.add(command));
    directives.push(...materialDirectives(patch.material));
  }
  if (directives.length === 0) return source;

  const cleaned = removeTopLevelCommands(originalLines, commands);
  return insertSetupLines(cleaned, directives).join(newline);
}
