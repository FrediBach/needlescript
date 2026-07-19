import type { Val } from './list.ts';

/** Thrown by `output` / `exit` to unwind to the enclosing procedure call. */
export class ReturnSignal {
  readonly value: Val | undefined;
  constructor(value: Val | undefined) {
    this.value = value;
  }
}

/**
 * Thrown by `break` / `continue` to unwind to the innermost enclosing loop
 * (RFC-4). Parse-time validation guarantees a loop catches it before any
 * procedure boundary; the catches in callProc and at the top level are
 * defensive only.
 */
export class LoopSignal {
  readonly kind: 'break' | 'continue';
  readonly line?: number;
  constructor(kind: 'break' | 'continue', line?: number) {
    this.kind = kind;
    this.line = line;
  }
}
