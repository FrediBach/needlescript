import { useCallback, useEffect, useRef } from 'react';
import * as Comlink from 'comlink';
import type { CompilerWorkerApi } from '../compiler.worker.ts';
import type { CompileResponse } from '../compiler.worker.types.ts';
import type { MachineProfile } from '../lib/core/types.ts';

// Import the worker via Vite's native ?worker syntax so it gets bundled as a
// separate chunk and never runs on the main thread.
import CompilerWorker from '../compiler.worker?worker';

const COMPILE_TIMEOUT_MS = 5000;

interface QueuedCompile {
  source: string;
  seed?: number;
  machineProfile?: MachineProfile;
  isStale: () => boolean;
  resolve: (response: CompileResponse | null) => void;
}

let sharedWorker: Worker | null = null;
let sharedProxy: Comlink.Remote<CompilerWorkerApi> | null = null;
let active = false;
let consumers = 0;
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
const queue: QueuedCompile[] = [];

function disposeSharedWorker(): void {
  const proxy = sharedProxy;
  const worker = sharedWorker;
  sharedProxy = null;
  sharedWorker = null;
  proxy?.[Comlink.releaseProxy]();
  worker?.terminate();
}

function spawnSharedWorker(): void {
  disposeSharedWorker();
  const worker = new CompilerWorker();
  sharedWorker = worker;
  sharedProxy = Comlink.wrap<CompilerWorkerApi>(worker);
}

function ensureSharedWorker(): Comlink.Remote<CompilerWorkerApi> {
  if (!sharedProxy) spawnSharedWorker();
  return sharedProxy!;
}

function finishJob(): void {
  active = false;
  runNextJob();
  if (consumers === 0 && !active && queue.length === 0) disposeSharedWorker();
}

function runNextJob(): void {
  if (active) return;
  let job = queue.shift();
  while (job?.isStale()) {
    job.resolve(null);
    job = queue.shift();
  }
  if (!job) return;
  active = true;

  const proxy = ensureSharedWorker();
  let settled = false;
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    spawnSharedWorker();
    job.resolve({
      id: 0,
      ok: false,
      message: 'Compilation timed out — check for infinite loops',
    });
    finishJob();
  }, COMPILE_TIMEOUT_MS);

  proxy
    .compile(job.source, job.seed, job.machineProfile)
    .then((response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      job.resolve(response);
      finishJob();
    })
    .catch(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      job.resolve({ id: 0, ok: false, message: 'Compilation worker stopped unexpectedly' });
      spawnSharedWorker();
      finishJob();
    });
}

function enqueueCompile(
  source: string,
  seed: number | undefined,
  machineProfile: MachineProfile | undefined,
  isStale: () => boolean,
): Promise<CompileResponse | null> {
  return new Promise((resolve) => {
    queue.push({ source, seed, machineProfile, isStale, resolve });
    runNextJob();
  });
}

function acquireCompiler(): void {
  consumers++;
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
  ensureSharedWorker();
}

function releaseCompiler(): void {
  consumers = Math.max(0, consumers - 1);
  if (consumers > 0 || cleanupTimer) return;

  // Delay disposal through React StrictMode's intentional unmount/remount pair.
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    if (consumers === 0 && !active && queue.length === 0) disposeSharedWorker();
  }, 0);
}

export function useCompiler() {
  // Monotonic counter scoped to this hook consumer. A shared worker serializes
  // jobs across the playground/book, while stale-result semantics stay local.
  const latestIdRef = useRef(0);

  useEffect(() => {
    acquireCompiler();
    return releaseCompiler;
  }, []);

  const compile = useCallback(
    (
      source: string,
      seed?: number,
      machineProfile?: MachineProfile,
    ): Promise<CompileResponse | null> => {
      const id = ++latestIdRef.current;
      const startedAt = performance.now();

      return enqueueCompile(source, seed, machineProfile, () => latestIdRef.current !== id).then(
        (response) => {
          if (response === null || latestIdRef.current !== id) return null;
          return {
            ...response,
            id,
            ...(response.ok
              ? {
                  timings: {
                    ...response.timings,
                    roundTripMs: performance.now() - startedAt,
                  },
                }
              : {}),
          };
        },
      );
    },
    [],
  );

  return { compile };
}
