export type PhysicsReportStatus = 'checking' | 'current' | 'stale' | 'blocked';

/** Playground-only lifecycle data. Serialized engine reports remain stitch-inert. */
export interface PhysicsReportState {
  sourceRevision: number;
  reportRevision: number;
  status: PhysicsReportStatus;
}

export const INITIAL_PHYSICS_REPORT_STATE: PhysicsReportState = {
  sourceRevision: 0,
  reportRevision: -1,
  status: 'checking',
};

export function physicsSourceChanged(state: PhysicsReportState): PhysicsReportState {
  return {
    ...state,
    sourceRevision: state.sourceRevision + 1,
    status: 'stale',
  };
}

export function physicsCheckStarted(
  state: PhysicsReportState,
  revision: number,
): PhysicsReportState {
  return state.sourceRevision === revision ? { ...state, status: 'checking' } : state;
}

export function physicsCheckSucceeded(
  state: PhysicsReportState,
  revision: number,
): PhysicsReportState {
  return state.sourceRevision === revision
    ? { ...state, reportRevision: revision, status: 'current' }
    : state;
}

export function physicsCheckBlocked(
  state: PhysicsReportState,
  revision: number,
): PhysicsReportState {
  return state.sourceRevision === revision ? { ...state, status: 'blocked' } : state;
}

export function physicsStatusMessage(state: PhysicsReportState): string | null {
  switch (state.status) {
    case 'current':
      return null;
    case 'stale':
      return 'Physics findings are stale — showing results from the previous run.';
    case 'blocked':
      return 'Physics is waiting for a valid design.';
    case 'checking':
      return state.reportRevision >= 0
        ? 'Physics is checking — showing results from the previous run.'
        : 'Physics is checking the design…';
  }
}
