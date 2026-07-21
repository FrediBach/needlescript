import type {
  PhysicsDiagnostic,
  PhysicsReport,
  PreflightSeverity,
  ResolvedMachineProfile,
  Token,
} from '../lib/engine.ts';
import { tokenize } from '../lib/language/tokenizer.ts';

export interface PhysicsSourceEdit {
  start: number;
  end: number;
  text: string;
}

export interface PhysicsQuickFix {
  id: string;
  diagnosticId: string;
  diagnosticCode: string;
  title: string;
  description: string;
  edit: PhysicsSourceEdit;
  beforeSource: string;
  diff: {
    line: number;
    before: string;
    after: string;
  };
}

export interface PhysicsQuickFixComparison {
  targetResolved: boolean;
  beforeTargetCount: number;
  afterTargetCount: number;
  newEqualOrHigher: Array<{
    code: string;
    title: string;
    severity: PreflightSeverity;
    count: number;
  }>;
}

export interface PhysicsQuickFixOutcome {
  status: 'checking' | 'success' | 'warning' | 'error';
  message: string;
  introduced: string[];
}

interface ScannedToken {
  token: Token;
  squareDepth: number;
}

const SEVERITY_RANK: Record<PreflightSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

const FILL_ANCHORS = new Set(['beginfill', 'endfill']);
const SATIN_ANCHORS = new Set(['satin', 'satinbetween']);
const TRAVEL_ANCHORS = new Set(['jump', 'setpos', 'setxy', 'setx', 'sety']);

function scannedTokens(source: string): ScannedToken[] {
  const result: ScannedToken[] = [];
  let squareDepth = 0;
  for (const token of tokenize(source)) {
    if (token.t === ']') squareDepth = Math.max(0, squareDepth - 1);
    result.push({ token, squareDepth });
    if (token.t === '[') squareDepth++;
  }
  return result;
}

function primaryLine(diagnostic: PhysicsDiagnostic): number | undefined {
  return (
    diagnostic.sourceLocations.find(({ role }) => role === 'primary')?.line ??
    diagnostic.sourceLocations[0]?.line
  );
}

function lineBounds(source: string, line: number): { start: number; end: number } | undefined {
  if (line < 1) return undefined;
  let start = 0;
  for (let current = 1; current < line; current++) {
    const newline = source.indexOf('\n', start);
    if (newline < 0) return undefined;
    start = newline + 1;
  }
  const newline = source.indexOf('\n', start);
  return { start, end: newline < 0 ? source.length : newline };
}

function tokenWord(entry: ScannedToken): string | undefined {
  return entry.token.t === 'word' ? String(entry.token.v) : undefined;
}

function firstRootAnchor(
  entries: readonly ScannedToken[],
  line: number,
  anchors: ReadonlySet<string>,
): number | undefined {
  return entries.find(
    ({ token, squareDepth }) =>
      squareDepth === 0 &&
      token.line === line &&
      token.t === 'word' &&
      anchors.has(String(token.v)),
  )?.token.start;
}

function exactNumericArgument(
  entries: readonly ScannedToken[],
  commandIndex: number,
): Token | undefined {
  const command = entries[commandIndex];
  const next = entries[commandIndex + 1];
  if (!command || !next) return undefined;
  if (next.token.t === 'num') {
    const following = entries[commandIndex + 2]?.token;
    if (following?.t === 'op') return undefined;
    return next.token;
  }
  if (next.token.t !== '(') return undefined;
  const literal = entries[commandIndex + 2]?.token;
  const close = entries[commandIndex + 3]?.token;
  if (literal?.t !== 'num' || close?.t !== ')') return undefined;
  if (entries[commandIndex + 4]?.token.t === 'op') return undefined;
  return literal;
}

function latestCommandBefore(
  entries: readonly ScannedToken[],
  command: string,
  beforeOffset: number,
): { command: Token; literal?: Token } | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.token.start >= beforeOffset || entry.squareDepth !== 0) continue;
    if (tokenWord(entry) !== command) continue;
    return { command: entry.token, literal: exactNumericArgument(entries, index) };
  }
  return undefined;
}

function formatLiteral(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function changedNumber(
  source: string,
  diagnostic: PhysicsDiagnostic,
  token: Token,
  value: number,
  title: string,
  description: string,
): PhysicsQuickFix | undefined {
  if (token.t !== 'num' || token.v === value) return undefined;
  return makeQuickFix(
    source,
    diagnostic,
    { start: token.start, end: token.end, text: formatLiteral(value) },
    title,
    description,
  );
}

function makeQuickFix(
  source: string,
  diagnostic: PhysicsDiagnostic,
  edit: PhysicsSourceEdit,
  title: string,
  description: string,
): PhysicsQuickFix | undefined {
  const line =
    primaryLine(diagnostic) ?? tokenize(source).find(({ start }) => start >= edit.start)?.line;
  if (line === undefined) return undefined;
  const editLine =
    tokenize(source).find(({ start, end }) => edit.start >= start && edit.start <= end)?.line ??
    line;
  const bounds = lineBounds(source, editLine);
  if (!bounds || edit.end > bounds.end) return undefined;
  const before = source.slice(bounds.start, bounds.end);
  const relativeStart = edit.start - bounds.start;
  const relativeEnd = edit.end - bounds.start;
  const after = `${before.slice(0, relativeStart)}${edit.text}${before.slice(relativeEnd)}`;
  if (before === after) return undefined;
  return {
    id: `${diagnostic.id}:${edit.start}:${edit.end}:${edit.text}`,
    diagnosticId: diagnostic.id,
    diagnosticCode: diagnostic.code,
    title,
    description,
    edit,
    beforeSource: source,
    diff: { line: editLine, before, after },
  };
}

function literalAdjustment(
  source: string,
  entries: readonly ScannedToken[],
  diagnostic: PhysicsDiagnostic,
  command: string,
  update: (value: number) => number,
  title: string,
  description: string,
  anchors: ReadonlySet<string>,
): PhysicsQuickFix | undefined {
  const line = primaryLine(diagnostic);
  if (line === undefined) return undefined;
  const bounds = lineBounds(source, line);
  if (!bounds) return undefined;
  const beforeOffset = firstRootAnchor(entries, line, anchors) ?? bounds.start;
  const match = latestCommandBefore(entries, command, beforeOffset);
  if (!match?.literal || typeof match.literal.v !== 'number') return undefined;
  return changedNumber(
    source,
    diagnostic,
    match.literal,
    update(match.literal.v),
    title,
    description,
  );
}

function fillInsetFix(
  source: string,
  entries: readonly ScannedToken[],
  diagnostic: PhysicsDiagnostic,
): PhysicsQuickFix | undefined {
  const reduce =
    diagnostic.code === 'fill.border-overlap-too-small' ||
    diagnostic.code === 'fill.inset-region-change';
  return literalAdjustment(
    source,
    entries,
    diagnostic,
    'fillinset',
    (value) => Math.max(0, Math.min(10, value + (reduce ? -0.25 : 0.25))),
    reduce ? 'Reduce literal fill inset' : 'Increase literal fill inset',
    reduce
      ? 'Adjust the traced fillinset literal by 0.25 mm to retain more of the authored fill region.'
      : 'Adjust the traced fillinset literal by 0.25 mm to reserve more registration space.',
    FILL_ANCHORS,
  );
}

function underlayInsetFix(
  source: string,
  entries: readonly ScannedToken[],
  diagnostic: PhysicsDiagnostic,
): PhysicsQuickFix | undefined {
  return literalAdjustment(
    source,
    entries,
    diagnostic,
    'underlayinset',
    (value) => Math.min(10, value + 0.25),
    'Increase literal underlay inset',
    'Move the traced underlay edge pass inward by 0.25 mm.',
    SATIN_ANCHORS,
  );
}

function spacingFix(
  source: string,
  entries: readonly ScannedToken[],
  diagnostic: PhysicsDiagnostic,
): PhysicsQuickFix | undefined {
  const line = primaryLine(diagnostic);
  if (line === undefined) return undefined;
  const fillAnchor = firstRootAnchor(entries, line, FILL_ANCHORS);
  const satinAnchor = firstRootAnchor(entries, line, SATIN_ANCHORS);
  const command =
    fillAnchor !== undefined ? 'fillspacing' : satinAnchor !== undefined ? 'density' : undefined;
  const anchor = fillAnchor ?? satinAnchor;
  if (!command || anchor === undefined) return undefined;
  const match = latestCommandBefore(entries, command, anchor);
  if (!match?.literal || typeof match.literal.v !== 'number') return undefined;
  const next = Math.min(5, Math.max(match.literal.v + 0.1, match.literal.v * 1.2));
  return changedNumber(
    source,
    diagnostic,
    match.literal,
    next,
    `Increase literal ${command}`,
    `Increase the traced ${command} value to reduce local penetration density.`,
  );
}

function splitOverlapFix(
  source: string,
  entries: readonly ScannedToken[],
  diagnostic: PhysicsDiagnostic,
): PhysicsQuickFix | undefined {
  return literalAdjustment(
    source,
    entries,
    diagnostic,
    'satinsplitoverlap',
    (value) => Math.max(0, Math.min(value - 0.1, value * 0.8)),
    'Reduce literal split overlap',
    'Reduce the traced split-satin seam overlap while retaining an interlocking seam.',
    SATIN_ANCHORS,
  );
}

function longJumpFix(
  source: string,
  entries: readonly ScannedToken[],
  diagnostic: PhysicsDiagnostic,
  profile: ResolvedMachineProfile,
): PhysicsQuickFix | undefined {
  const line = primaryLine(diagnostic);
  if (line === undefined) return undefined;
  const bounds = lineBounds(source, line);
  if (!bounds) return undefined;
  const firstOnLine = entries.find(({ token }) => token.line === line);
  if (!firstOnLine || firstOnLine.squareDepth !== 0) return undefined;
  const threshold = Math.max(3, Math.min(30, profile.maximumPreferredJumpMM));
  const travelOffset = firstRootAnchor(entries, line, TRAVEL_ANCHORS) ?? bounds.start;
  const latest = latestCommandBefore(entries, 'autotrim', travelOffset);
  if (latest) {
    if (!latest.literal || typeof latest.literal.v !== 'number') return undefined;
    if (latest.literal.v > 0 && latest.literal.v <= threshold) return undefined;
    return changedNumber(
      source,
      diagnostic,
      latest.literal,
      threshold,
      'Adjust literal autotrim threshold',
      `Set the traced autotrim threshold to the profile's ${formatLiteral(threshold)} mm preferred jump limit.`,
    );
  }
  const indentation = source.slice(bounds.start, firstOnLine.token.start);
  if (!/^\s*$/.test(indentation)) return undefined;
  return makeQuickFix(
    source,
    diagnostic,
    {
      start: firstOnLine.token.start,
      end: firstOnLine.token.start,
      text: `autotrim ${formatLiteral(threshold)} `,
    },
    'Enable autotrim for long travel',
    `Insert a local autotrim threshold at the profile's ${formatLiteral(threshold)} mm preferred jump limit.`,
  );
}

function provenStraightSatinLine(
  entries: readonly ScannedToken[],
  line: number,
): { satinOffset: number } | undefined {
  const lineEntries = entries.filter(
    ({ token, squareDepth }) => token.line === line && squareDepth === 0,
  );
  for (let index = 0; index < lineEntries.length; index++) {
    if (tokenWord(lineEntries[index]) !== 'satin') continue;
    const width = exactNumericArgument(lineEntries, index);
    if (!width) continue;
    const movementIndex = lineEntries.findIndex(
      (entry, candidate) =>
        candidate > index && (tokenWord(entry) === 'fd' || tokenWord(entry) === 'bk'),
    );
    if (movementIndex < 0 || !exactNumericArgument(lineEntries, movementIndex)) continue;
    return { satinOffset: lineEntries[index].token.start };
  }
  return undefined;
}

function splitPolicyFix(
  source: string,
  entries: readonly ScannedToken[],
  diagnostic: PhysicsDiagnostic,
): PhysicsQuickFix | undefined {
  const line = primaryLine(diagnostic);
  if (line === undefined) return undefined;
  const topology = provenStraightSatinLine(entries, line);
  if (!topology) return undefined;
  const latestIndex = entries.findLastIndex(
    ({ token, squareDepth }) =>
      squareDepth === 0 &&
      token.start < topology.satinOffset &&
      token.t === 'word' &&
      token.v === 'satinwide',
  );
  if (latestIndex >= 0) {
    const mode = entries[latestIndex + 1]?.token;
    if (mode?.t !== 'string' && mode?.t !== 'qword') return undefined;
    if (mode.v === 'split') return undefined;
    if (mode.v !== 'warn') return undefined;
    return makeQuickFix(
      source,
      diagnostic,
      { start: mode.start, end: mode.end, text: "'split'" },
      'Enable split satin',
      'Change the existing wide-column policy for this proven straight, open numeric satin.',
    );
  }
  return makeQuickFix(
    source,
    diagnostic,
    { start: topology.satinOffset, end: topology.satinOffset, text: "satinwide 'split' " },
    'Enable split satin',
    'Enable the split policy immediately before this proven straight, open numeric satin.',
  );
}

/** Resolve one narrow, literal-only source edit, or return guidance-only. */
export function physicsQuickFixForDiagnostic(
  source: string,
  diagnostic: PhysicsDiagnostic,
  profile: ResolvedMachineProfile,
): PhysicsQuickFix | undefined {
  let entries: ScannedToken[];
  try {
    entries = scannedTokens(source);
  } catch {
    return undefined;
  }
  switch (diagnostic.code) {
    case 'travel.long-untrimmed-jump':
      return longJumpFix(source, entries, diagnostic, profile);
    case 'fill.border-overlap-too-small':
    case 'fill.border-overlap-dense':
    case 'fill.compensation-outside-boundary':
    case 'fill.inset-region-change':
      return fillInsetFix(source, entries, diagnostic);
    case 'construction.underlay-outside-topping':
      return underlayInsetFix(source, entries, diagnostic);
    case 'coverage.density-hotspot':
    case 'stitch.short-cluster':
    case 'stitch.below-reliable-movement':
      return spacingFix(source, entries, diagnostic);
    case 'satin.split-overlap-hotspot':
      return splitOverlapFix(source, entries, diagnostic);
    case 'satin.snag-risk':
      return splitPolicyFix(source, entries, diagnostic);
    default:
      return undefined;
  }
}

export function applyPhysicsSourceEdit(source: string, edit: PhysicsSourceEdit): string {
  return `${source.slice(0, edit.start)}${edit.text}${source.slice(edit.end)}`;
}

function fingerprintCounts(report: PhysicsReport): Map<string, number> {
  const counts = new Map<string, number>();
  for (const diagnostic of report.diagnostics)
    counts.set(diagnostic.fingerprint, (counts.get(diagnostic.fingerprint) ?? 0) + 1);
  return counts;
}

/** Compare report occurrences after an applied fix without treating source edits as policy. */
export function comparePhysicsQuickFix(
  before: PhysicsReport,
  after: PhysicsReport,
  target: Pick<PhysicsDiagnostic, 'code' | 'severity'>,
): PhysicsQuickFixComparison {
  const beforeTargetCount = before.diagnostics.filter(({ code }) => code === target.code).length;
  const afterTargetCount = after.diagnostics.filter(({ code }) => code === target.code).length;
  const beforeFingerprints = fingerprintCounts(before);
  const seenAfterFingerprints = new Map<string, number>();
  const added = new Map<string, PhysicsQuickFixComparison['newEqualOrHigher'][number]>();
  for (const diagnostic of after.diagnostics) {
    if (SEVERITY_RANK[diagnostic.severity] < SEVERITY_RANK[target.severity]) continue;
    const seen = (seenAfterFingerprints.get(diagnostic.fingerprint) ?? 0) + 1;
    seenAfterFingerprints.set(diagnostic.fingerprint, seen);
    if (seen <= (beforeFingerprints.get(diagnostic.fingerprint) ?? 0)) continue;
    const key = `${diagnostic.severity}:${diagnostic.code}`;
    const existing = added.get(key);
    if (existing) existing.count++;
    else
      added.set(key, {
        code: diagnostic.code,
        title: diagnostic.title,
        severity: diagnostic.severity,
        count: 1,
      });
  }
  return {
    targetResolved: afterTargetCount < beforeTargetCount,
    beforeTargetCount,
    afterTargetCount,
    newEqualOrHigher: [...added.values()],
  };
}
