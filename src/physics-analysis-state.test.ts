import { describe, expect, it } from 'vitest';
import {
  INITIAL_PHYSICS_REPORT_STATE,
  physicsCheckBlocked,
  physicsCheckStarted,
  physicsCheckSucceeded,
  physicsSourceChanged,
  physicsStatusMessage,
} from './physics-analysis-state.ts';

describe('PhysicsReportState', () => {
  it('marks a current report stale immediately after a source edit', () => {
    const current = physicsCheckSucceeded(INITIAL_PHYSICS_REPORT_STATE, 0);
    const stale = physicsSourceChanged(current);

    expect(stale).toEqual({ sourceRevision: 1, reportRevision: 0, status: 'stale' });
    expect(physicsStatusMessage(stale)).toMatch(/stale.*previous run/i);
  });

  it('ignores completion from an obsolete source revision', () => {
    const edited = physicsSourceChanged(INITIAL_PHYSICS_REPORT_STATE);

    expect(physicsCheckSucceeded(edited, 0)).toBe(edited);
    expect(physicsCheckBlocked(edited, 0)).toBe(edited);
  });

  it('tracks checking, blocked, and recovered reports without discarding the last revision', () => {
    const current = physicsCheckSucceeded(INITIAL_PHYSICS_REPORT_STATE, 0);
    const edited = physicsSourceChanged(current);
    const checking = physicsCheckStarted(edited, 1);
    const blocked = physicsCheckBlocked(checking, 1);
    const recovered = physicsCheckSucceeded(blocked, 1);

    expect(checking.status).toBe('checking');
    expect(physicsStatusMessage(checking)).toMatch(/previous run/i);
    expect(blocked).toEqual({ sourceRevision: 1, reportRevision: 0, status: 'blocked' });
    expect(physicsStatusMessage(blocked)).toMatch(/waiting for a valid design/i);
    expect(recovered).toEqual({ sourceRevision: 1, reportRevision: 1, status: 'current' });
    expect(physicsStatusMessage(recovered)).toBeNull();
  });
});
