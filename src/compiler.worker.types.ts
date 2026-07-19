import type { RunResult, DesignStats, MachineProfile, RunTimings } from './lib/core/types.ts';

interface CompileTimings extends RunTimings {
  statsMs: number;
  workerMs: number;
  roundTripMs?: number;
}

export interface CompileRequest {
  id: number;
  source: string;
  seed?: number;
  machineProfile?: MachineProfile;
}

export type CompileResponse =
  | { id: number; ok: true; result: RunResult; stats: DesignStats; timings: CompileTimings }
  | { id: number; ok: false; message: string; slLine?: number };
