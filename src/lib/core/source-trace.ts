import type { PhysicsSourceLocation, SourceTrace, StitchEvent } from './types.ts';

/** Most precise addressable line for an event, with legacy fallback. */
export function eventSourceLine(event: StitchEvent): number | undefined {
  return event.source?.line ?? event.line;
}

/** Convert event provenance into deterministic PhysicsIntellisense source roles. */
export function sourceLocationsForEvents(events: readonly StitchEvent[]): PhysicsSourceLocation[] {
  const primary: number[] = [];
  const related: number[] = [];
  const add = (target: number[], line: number) => {
    if (!target.includes(line)) target.push(line);
  };
  for (const event of events) {
    const line = eventSourceLine(event);
    if (line !== undefined) add(primary, line);
    for (const callLine of event.source?.callLines ?? []) add(related, callLine);
  }
  const seen = new Set<number>();
  return [
    ...primary.flatMap((line, index) => {
      if (seen.has(line)) return [];
      seen.add(line);
      return [{ line, role: index === 0 ? ('primary' as const) : ('contributor' as const) }];
    }),
    ...related.flatMap((line) => {
      if (seen.has(line)) return [];
      seen.add(line);
      return [{ line, role: 'related' as const }];
    }),
  ];
}

export function sourceLocationsForTraces(
  traces: readonly (SourceTrace | undefined)[],
): PhysicsSourceLocation[] {
  return sourceLocationsForEvents(
    traces.flatMap((source) =>
      source ? [{ t: 'stitch' as const, x: 0, y: 0, c: 0, source }] : [],
    ),
  );
}

/** Convert one trace into source roles for diagnostics without a retained event. */
export function sourceLocationsForTrace(trace: SourceTrace): PhysicsSourceLocation[] {
  return sourceLocationsForTraces([trace]);
}
