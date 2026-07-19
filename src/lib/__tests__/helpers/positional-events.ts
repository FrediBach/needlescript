import type { StitchEvent } from '../../core/types.ts';

export interface PositionalEventOptions {
  tolerance?: number;
  includeLine?: boolean;
}

function eventDescription(event: StitchEvent | undefined): string {
  if (!event) return '<missing>';
  const flags = [event.u === 1 ? 'underlay' : '', event.label ? `label=${event.label}` : '']
    .filter(Boolean)
    .join(', ');
  return `${event.t} (${event.x}, ${event.y}) color=${event.c}${
    event.line === undefined ? '' : ` line=${event.line}`
  }${flags ? ` ${flags}` : ''}`;
}

/**
 * Compare the public, positional semantics of two event streams and report the
 * first mismatch with its index and neighbouring events.
 */
export function expectPositionalEvents(
  actual: readonly StitchEvent[],
  expected: readonly StitchEvent[],
  options: PositionalEventOptions = {},
): void {
  const tolerance = options.tolerance ?? 1e-9;
  const count = Math.max(actual.length, expected.length);

  for (let index = 0; index < count; index++) {
    const received = actual[index];
    const wanted = expected[index];
    const differs =
      received === undefined ||
      wanted === undefined ||
      received.t !== wanted.t ||
      received.c !== wanted.c ||
      received.u !== wanted.u ||
      received.label !== wanted.label ||
      Math.abs(received.x - wanted.x) > tolerance ||
      Math.abs(received.y - wanted.y) > tolerance ||
      (options.includeLine === true && received.line !== wanted.line);

    if (!differs) continue;

    const previous = index > 0 ? index - 1 : undefined;
    throw new Error(
      [
        `Positional event streams first differ at index ${index}.`,
        `Expected: ${eventDescription(wanted)}`,
        `Received: ${eventDescription(received)}`,
        previous === undefined
          ? 'Previous: <start of stream>'
          : `Previous expected: ${eventDescription(expected[previous])}`,
        previous === undefined ? '' : `Previous received: ${eventDescription(actual[previous])}`,
        `Lengths: expected ${expected.length}, received ${actual.length}`,
        `Tolerance: ${tolerance}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}
