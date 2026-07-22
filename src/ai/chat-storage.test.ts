import { describe, expect, it } from 'vitest';
import { retainChatThreads } from './chat-storage.ts';
import { EMPTY_AI_USAGE, type AiChatThread } from './chat-types.ts';

function thread(id: string, workspaceId: string, updatedAt: number): AiChatThread {
  return {
    version: 1,
    id,
    workspaceId,
    title: id,
    model: 'model',
    createdAt: updatedAt,
    updatedAt,
    status: 'idle',
    turns: [],
    usage: { ...EMPTY_AI_USAGE },
  };
}

describe('AI chat retention', () => {
  it('keeps the twenty newest ordinary threads per workspace', () => {
    const now = 1_800_000_000_000;
    const threads = Array.from({ length: 25 }, (_, index) =>
      thread(`thread-${index}`, 'workspace', now - index),
    );
    expect(retainChatThreads(threads, now).map(({ id }) => id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `thread-${index}`),
    );
  });

  it('does not silently evict an old pending proposal', () => {
    const now = 1_800_000_000_000;
    const pending = {
      ...thread('pending', 'workspace', now - 40 * 24 * 60 * 60 * 1000),
      draft: {
        base: { revision: 1, hash: 'base', text: 'forward 10' },
        text: 'forward 20',
        revision: 1,
        hash: 'draft',
        status: 'stale' as const,
      },
    };
    expect(retainChatThreads([pending], now)).toEqual([pending]);
  });
});
