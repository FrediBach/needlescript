import * as Comlink from 'comlink';
import { run, designStats, NeedlescriptError } from './lib/engine.ts';
import type { RunOptions } from './lib/types.ts';
import type { CompileResponse } from './compiler.worker.types.ts';

const compiler = {
  compile(source: string, seed?: number): CompileResponse {
    const opts: RunOptions | undefined = seed !== undefined ? { seed } : undefined;
    try {
      const result = run(source, opts);
      const stats = designStats(result.events, result.plan);
      // id is a placeholder; the hook that wraps us never reads it —
      // Comlink resolves each call via its own internal message routing.
      return { id: 0, ok: true, result, stats };
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
