import { useEffect, useRef, useCallback } from 'react';
import * as Comlink from 'comlink';
import type { CompilerWorkerApi } from '../compiler.worker.ts';
import type { CompileResponse } from '../compiler.worker.types.ts';

// Import the worker via Vite's native ?worker syntax so it gets bundled as a
// separate chunk and never runs on the main thread.
import CompilerWorker from '../compiler.worker?worker';

const COMPILE_TIMEOUT_MS = 5000;

export function useCompiler() {
  const workerRef = useRef<Worker | null>(null);
  const proxyRef = useRef<Comlink.Remote<CompilerWorkerApi> | null>(null);
  // Monotonic counter — only the response whose id matches latestIdRef is
  // applied; every earlier response (from fast typing / slider drag) is dropped.
  const latestIdRef = useRef(0);

  const spawnWorker = useCallback(() => {
    // Null the refs BEFORE releasing — Comlink's Proxy get-trap throws on any
    // property access (including [releaseProxy] itself) once a proxy is released,
    // so we must ensure we never call releaseProxy twice on the same proxy.
    const proxy = proxyRef.current;
    const worker = workerRef.current;
    proxyRef.current = null;
    workerRef.current = null;
    proxy?.[Comlink.releaseProxy]();
    worker?.terminate();
    const w = new CompilerWorker();
    workerRef.current = w;
    proxyRef.current = Comlink.wrap<CompilerWorkerApi>(w);
  }, []);

  useEffect(() => {
    spawnWorker();
    return () => {
      // Null refs immediately so a StrictMode re-mount's spawnWorker call sees
      // null and skips the double-release that would otherwise throw.
      const proxy = proxyRef.current;
      const worker = workerRef.current;
      proxyRef.current = null;
      workerRef.current = null;
      proxy?.[Comlink.releaseProxy]();
      worker?.terminate();
    };
  }, [spawnWorker]);

  /**
   * Compile `source` off the main thread.
   *
   * Returns the CompileResponse, or `null` if a newer compile was started
   * before this one finished (stale result — the caller should ignore it).
   *
   * If the worker does not respond within COMPILE_TIMEOUT_MS (e.g. an
   * infinite loop in user code), it is terminated and a fresh worker is
   * spawned for the next call. The returned response will have `ok: false`.
   */
  const compile = useCallback(
    (source: string, seed?: number): Promise<CompileResponse | null> => {
      const id = ++latestIdRef.current;

      return new Promise((resolve) => {
        let settled = false;

        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          spawnWorker(); // kill the runaway worker and get a fresh one
          resolve({
            id,
            ok: false,
            message: 'Compilation timed out — check for infinite loops',
          });
        }, COMPILE_TIMEOUT_MS);

        proxyRef.current!.compile(source, seed)
          .then((res) => {
            if (settled) return; // already timed out
            settled = true;
            clearTimeout(timeout);
            // Drop stale results so only the most-recent compile is applied.
            resolve(latestIdRef.current === id ? { ...res, id } : null);
          })
          .catch(() => {
            // Worker was terminated by the timeout branch above — already resolved.
          });
      });
    },
    [spawnWorker],
  );

  return { compile };
}
