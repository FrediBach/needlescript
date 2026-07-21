export type CompilePriority = 'foreground' | 'background';

export interface CompileQueueOptions {
  priority: CompilePriority;
  coalesceKey?: number;
  isStale: () => boolean;
}

interface QueuedTask<Input, Output> extends CompileQueueOptions {
  input: Input;
  resolve: (result: Output | null) => void;
}

interface ActiveTask<Input, Output> {
  task: QueuedTask<Input, Output>;
  controller: AbortController;
  cancelled: boolean;
}

/**
 * A small priority queue for the shared compiler worker.
 *
 * Background work is coalesced per hook consumer. Foreground work skips queued
 * background checks and cancels an active background check so an explicit Run
 * never waits behind analysis for obsolete source.
 */
export class CompilerQueue<Input, Output> {
  private readonly queued: Array<QueuedTask<Input, Output>> = [];
  private active: ActiveTask<Input, Output> | null = null;
  private readonly execute: (input: Input, signal: AbortSignal) => Promise<Output>;
  private readonly cancelActiveExecution: () => void;
  private readonly onIdle?: () => void;

  constructor(
    execute: (input: Input, signal: AbortSignal) => Promise<Output>,
    cancelActiveExecution: () => void,
    onIdle?: () => void,
  ) {
    this.execute = execute;
    this.cancelActiveExecution = cancelActiveExecution;
    this.onIdle = onIdle;
  }

  get idle(): boolean {
    return this.active === null && this.queued.length === 0;
  }

  enqueue(input: Input, options: CompileQueueOptions): Promise<Output | null> {
    return new Promise((resolve) => {
      const task = { input, ...options, resolve };

      if (options.priority === 'background' && options.coalesceKey !== undefined) {
        for (let index = this.queued.length - 1; index >= 0; index--) {
          const queued = this.queued[index];
          if (queued.priority === 'background' && queued.coalesceKey === options.coalesceKey) {
            this.queued.splice(index, 1);
            queued.resolve(null);
          }
        }
      }

      if (options.priority === 'foreground') {
        const firstBackground = this.queued.findIndex(({ priority }) => priority === 'background');
        if (firstBackground < 0) this.queued.push(task);
        else this.queued.splice(firstBackground, 0, task);

        if (this.active?.task.priority === 'background') this.cancelBackgroundExecution();
      } else {
        this.queued.push(task);
        if (
          options.coalesceKey !== undefined &&
          this.active?.task.priority === 'background' &&
          this.active.task.coalesceKey === options.coalesceKey
        ) {
          this.cancelBackgroundExecution();
        }
      }

      this.pump();
    });
  }

  private cancelBackgroundExecution(): void {
    const active = this.active;
    if (!active || active.task.priority !== 'background') return;
    active.cancelled = true;
    this.active = null;
    active.controller.abort();
    this.cancelActiveExecution();
    active.task.resolve(null);
  }

  private pump(): void {
    if (this.active) return;

    let task = this.queued.shift();
    while (task?.isStale()) {
      task.resolve(null);
      task = this.queued.shift();
    }
    if (!task) {
      this.onIdle?.();
      return;
    }

    const active: ActiveTask<Input, Output> = {
      task,
      controller: new AbortController(),
      cancelled: false,
    };
    this.active = active;
    void this.execute(task.input, active.controller.signal)
      .then((result) => {
        if (!active.cancelled) task.resolve(result);
      })
      .catch(() => {
        if (!active.cancelled) task.resolve(null);
      })
      .finally(() => {
        if (this.active === active) this.active = null;
        this.pump();
      });
  }
}
