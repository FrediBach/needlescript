// Determinism tripwire (RFC-3 §5): the engine must never touch
// Math.random — every run is a pure function of (source, seed). Stubbing
// it to throw makes a dependency sneaking in nondeterminism fail CI
// rather than review.
//
// The stub is scoped per test via beforeEach/afterEach so test-runner and
// environment internals (which may legitimately use Math.random between
// tests) are unaffected.

import { beforeEach, afterEach } from 'vitest';

const realRandom = Math.random;

beforeEach(() => {
  Math.random = () => {
    throw new Error(
      'Math.random was called — the NeedleScript engine must be fully deterministic (RFC-3 §5)',
    );
  };
});

afterEach(() => {
  Math.random = realRandom;
});
