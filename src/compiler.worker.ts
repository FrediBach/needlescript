import * as Comlink from 'comlink';
import { run, designStats, NeedlescriptError } from './lib/engine.ts';
import type { MachineProfile, PhysicsAnalysisMode, RunOptions } from './lib/core/types.ts';
import type { RunTimings } from './lib/core/types.ts';
import type { CompileResponse } from './compiler.worker.types.ts';

const compiler = {
  compile(
    source: string,
    seed?: number,
    machineProfile?: MachineProfile,
    physicsAnalysis?: PhysicsAnalysisMode,
  ): CompileResponse {
    const startedAt = performance.now();
    let runTimings: RunTimings | undefined;
    const opts: RunOptions = {
      ...(seed !== undefined ? { seed } : {}),
      ...(machineProfile !== undefined ? { machineProfile } : {}),
      ...(physicsAnalysis !== undefined ? { physicsAnalysis } : {}),
      onTiming(timings) {
        runTimings = timings;
      },
    };
    try {
      const result = run(source, opts);
      const statsStartedAt = performance.now();
      const stats = designStats(result.events, result.plan, result.colorTable);
      const completedAt = performance.now();
      if (!runTimings) throw new Error('Compiler timing instrumentation did not complete');
      // id is a placeholder; the hook that wraps us never reads it —
      // Comlink resolves each call via its own internal message routing.
      return {
        id: 0,
        ok: true,
        result,
        stats,
        timings: {
          ...runTimings,
          statsMs: completedAt - statsStartedAt,
          workerMs: completedAt - startedAt,
        },
      };
    } catch (err) {
      return {
        id: 0,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        slLine: err instanceof NeedlescriptError ? err.slLine : undefined,
      };
    }
  },
};

export type CompilerWorkerApi = typeof compiler;

Comlink.expose(compiler);
