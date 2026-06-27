import type { RunResult, DesignStats } from './lib/types.ts';

export interface CompileRequest {
  id: number;
  source: string;
  seed?: number;
}

export type CompileResponse =
  | { id: number; ok: true; result: RunResult; stats: DesignStats }
  | { id: number; ok: false; message: string; slLine?: number };
