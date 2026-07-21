import { describe, expect, it } from 'vitest';
import { CompilerQueue } from './compilerQueue.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('CompilerQueue', () => {
  it('runs foreground work before queued background checks', async () => {
    const first = deferred<string>();
    const order: string[] = [];
    const queue = new CompilerQueue<string, string>(
      async (value) => {
        order.push(value);
        if (value === 'active') return first.promise;
        return value;
      },
      () => undefined,
    );

    const active = queue.enqueue('active', { priority: 'foreground', isStale: () => false });
    const background = queue.enqueue('background', {
      priority: 'background',
      coalesceKey: 1,
      isStale: () => false,
    });
    const foreground = queue.enqueue('foreground', {
      priority: 'foreground',
      isStale: () => false,
    });

    first.resolve('active');
    await expect(active).resolves.toBe('active');
    await expect(foreground).resolves.toBe('foreground');
    await expect(background).resolves.toBe('background');
    expect(order).toEqual(['active', 'foreground', 'background']);
  });

  it('coalesces queued background checks from the same consumer', async () => {
    const first = deferred<string>();
    const order: string[] = [];
    const queue = new CompilerQueue<string, string>(
      async (value) => {
        order.push(value);
        if (value === 'active') return first.promise;
        return value;
      },
      () => undefined,
    );

    const active = queue.enqueue('active', { priority: 'foreground', isStale: () => false });
    const obsolete = queue.enqueue('obsolete', {
      priority: 'background',
      coalesceKey: 7,
      isStale: () => false,
    });
    const latest = queue.enqueue('latest', {
      priority: 'background',
      coalesceKey: 7,
      isStale: () => false,
    });

    await expect(obsolete).resolves.toBeNull();
    first.resolve('active');
    await active;
    await expect(latest).resolves.toBe('latest');
    expect(order).toEqual(['active', 'latest']);
  });

  it('cancels an active background check when foreground work arrives', async () => {
    const backgroundRun = deferred<string>();
    let cancellations = 0;
    const queue = new CompilerQueue<string, string>(
      (value) => (value === 'background' ? backgroundRun.promise : Promise.resolve(value)),
      () => {
        cancellations++;
      },
    );

    const background = queue.enqueue('background', {
      priority: 'background',
      coalesceKey: 3,
      isStale: () => false,
    });
    const foreground = queue.enqueue('foreground', {
      priority: 'foreground',
      isStale: () => false,
    });

    await expect(background).resolves.toBeNull();
    await expect(foreground).resolves.toBe('foreground');
    expect(cancellations).toBe(1);
    backgroundRun.resolve('ignored');
  });

  it('replaces an active background check with the latest check from that consumer', async () => {
    const obsoleteRun = deferred<string>();
    let cancellations = 0;
    const queue = new CompilerQueue<string, string>(
      (value) => (value === 'obsolete' ? obsoleteRun.promise : Promise.resolve(value)),
      () => {
        cancellations++;
      },
    );

    const obsolete = queue.enqueue('obsolete', {
      priority: 'background',
      coalesceKey: 4,
      isStale: () => false,
    });
    const latest = queue.enqueue('latest', {
      priority: 'background',
      coalesceKey: 4,
      isStale: () => false,
    });

    await expect(obsolete).resolves.toBeNull();
    await expect(latest).resolves.toBe('latest');
    expect(cancellations).toBe(1);
    obsoleteRun.resolve('ignored');
  });
});
