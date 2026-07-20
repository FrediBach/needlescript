import type { HoopConfig } from './data.ts';

/** Emit the canonical source form used by the playground hoop picker. */
export function hoopDirective(hoop: HoopConfig): string {
  if (hoop.shape === 'circle') return `hoop ${hoop.widthMM}`;
  if (hoop.shape === 'oval') return `hoop [${hoop.widthMM}, ${hoop.heightMM}, 'oval']`;
  return `hoop [${hoop.widthMM}, ${hoop.heightMM}]`;
}

function commentStart(line: string, from: number): number {
  let quoted = false;
  let escaped = false;
  for (let index = from; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === "'") quoted = false;
      continue;
    }
    if (char === "'") quoted = true;
    else if (char === ';' || char === '#' || (char === '/' && line[index + 1] === '/'))
      return index;
  }
  return -1;
}

/**
 * Replace the first top-level-looking hoop line, or add one near the top of the program.
 * Comments that merely mention `hoop` are left alone. An inline author comment is retained.
 */
export function applyHoopDirective(source: string, hoop: HoopConfig): string {
  const directive = hoopDirective(hoop);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^(\s*)hoop\b/i);
    if (!match) continue;
    const suffixAt = commentStart(lines[index], match[0].length);
    const suffix = suffixAt >= 0 ? lines[index].slice(suffixAt).trimStart() : '';
    const isManagedMachineComment = suffix.includes('— sized for the ');
    lines[index] =
      `${match[1]}${directive}${suffix && !isManagedMachineComment ? `  ${suffix}` : ''}`;
    return lines.join(newline);
  }

  let insertAt = 0;
  while (
    insertAt < lines.length &&
    (lines[insertAt].trim() === '' || /^\s*(?:\/\/|;|#)/.test(lines[insertAt]))
  )
    insertAt++;

  const before = lines
    .slice(0, insertAt)
    .join(newline)
    .replace(/(?:\r?\n)+$/, '');
  const after = lines
    .slice(insertAt)
    .join(newline)
    .replace(/^(?:\r?\n)+/, '');
  if (!after) return `${before ? `${before}${newline}` : ''}${directive}${newline}`;
  return `${before ? `${before}${newline}` : ''}${directive}${newline}${newline}${after}`;
}
