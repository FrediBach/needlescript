import { useCallback, useEffect, useRef, useState } from 'react';
import * as Comlink from 'comlink';
import type { CompilerWorkerApi } from '../compiler.worker.ts';
import type { CompileResponse } from '../compiler.worker.types.ts';
import type { MachineProfile, PhysicsAnalysisMode } from '../lib/core/types.ts';
import { CompilerQueue, type CompilePriority } from './compilerQueue.ts';

// Import the worker via Vite's native ?worker syntax so it gets bundled as a
// separate chunk and never runs on the main thread.
import CompilerWorker from '../compiler.worker?worker';

const COMPILE_TIMEOUT_MS = 5000;

interface CompileJob {
  source: string;
  seed?: number;
  machineProfile?: MachineProfile;
  physicsAnalysis?: PhysicsAnalysisMode;
}

let sharedWorker: Worker | null = null;
let sharedProxy: Comlink.Remote<CompilerWorkerApi> | null = null;
let consumers = 0;
let nextConsumerId = 0;
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

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

function executeCompile(job: CompileJob, signal: AbortSignal): Promise<CompileResponse> {
  const proxy = ensureSharedWorker();
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new DOMException('Background compilation cancelled', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      spawnSharedWorker();
      resolve({
        id: 0,
        ok: false,
        message: 'Compilation timed out — check for infinite loops',
      });
    }, COMPILE_TIMEOUT_MS);

    proxy
      .compile(job.source, job.seed, job.machineProfile, job.physicsAnalysis)
      .then((response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        resolve(response);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        resolve({ id: 0, ok: false, message: 'Compilation worker stopped unexpectedly' });
        if (sharedProxy === proxy) spawnSharedWorker();
      });
    signal.addEventListener('abort', abort, { once: true });
  });
}

const queue = new CompilerQueue<CompileJob, CompileResponse>(
  executeCompile,
  spawnSharedWorker,
  () => {
    if (consumers === 0) disposeSharedWorker();
  },
);

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
    if (consumers === 0 && queue.idle) disposeSharedWorker();
  }, 0);
}

export interface UseCompilerOptions {
  physicsAnalysis?: PhysicsAnalysisMode;
}

export function useCompiler({ physicsAnalysis }: UseCompilerOptions = {}) {
  // Generations stay local to this hook consumer even though the worker queue
  // is shared by the playground, book, and staging UI.
  const foregroundIdRef = useRef(0);
  const backgroundIdRef = useRef(0);
  const [consumerId] = useState(() => ++nextConsumerId);

  useEffect(() => {
    acquireCompiler();
    return releaseCompiler;
  }, []);

  const compileWithPriority = useCallback(
    (
      source: string,
      seed?: number,
      machineProfile?: MachineProfile,
      priority: CompilePriority = 'foreground',
    ): Promise<CompileResponse | null> => {
      const foregroundId =
        priority === 'foreground' ? ++foregroundIdRef.current : foregroundIdRef.current;
      if (priority === 'foreground') backgroundIdRef.current++;
      const backgroundId =
        priority === 'background' ? ++backgroundIdRef.current : backgroundIdRef.current;
      const id = priority === 'foreground' ? foregroundId : backgroundId;
      const startedAt = performance.now();
      const isStale = () =>
        priority === 'foreground'
          ? foregroundIdRef.current !== foregroundId
          : foregroundIdRef.current !== foregroundId || backgroundIdRef.current !== backgroundId;

      return queue
        .enqueue(
          { source, seed, machineProfile, physicsAnalysis },
          {
            priority,
            ...(priority === 'background' ? { coalesceKey: consumerId } : {}),
            isStale,
          },
        )
        .then((response) => {
          if (response === null || isStale()) return null;
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
        });
    },
    [consumerId, physicsAnalysis],
  );

  const compile = useCallback(
    (source: string, seed?: number, machineProfile?: MachineProfile) =>
      compileWithPriority(source, seed, machineProfile, 'foreground'),
    [compileWithPriority],
  );
  const compileAnalysis = useCallback(
    (source: string, seed?: number, machineProfile?: MachineProfile) =>
      compileWithPriority(source, seed, machineProfile, 'background'),
    [compileWithPriority],
  );

  return { compile, compileAnalysis };
}
