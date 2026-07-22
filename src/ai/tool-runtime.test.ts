import { describe, expect, it } from 'vitest';
import { EMPTY_AI_USAGE, type AiChatThread } from './chat-types.ts';
import { createToolRuntime } from './tool-runtime.ts';

describe('AI chat tool runtime intent', () => {
  it('defaults create intent to an empty draft with the live source as its base', async () => {
    let thread: AiChatThread = {
      version: 1,
      id: 'thread',
      workspaceId: 'workspace',
      title: 'New design',
      model: 'model',
      createdAt: 1,
      updatedAt: 1,
      status: 'running',
      intent: 'create',
      usage: { ...EMPTY_AI_USAGE },
      turns: [
        {
          id: 'turn',
          startedAt: 1,
          status: 'running',
          user: { role: 'user', content: 'Create a flower' },
          steps: [],
          usage: { ...EMPTY_AI_USAGE },
          modelSteps: 0,
          toolCalls: 0,
          compiles: 0,
        },
      ],
    };
    const execute = createToolRuntime({
      liveSource: () => ({ text: 'forward 10', revision: 7 }),
      compile: async () => null,
      getThread: () => thread,
      updateDraft: (draft) => {
        thread = { ...thread, draft };
      },
      updatePlan: () => undefined,
      incrementCompileCount: () => undefined,
    });
    const result = await execute('read_source', '{}');
    expect(JSON.parse(result.content ?? '{}')).toMatchObject({
      ok: true,
      source: { target: 'draft', revision: 0 },
      data: {
        totalCharacters: 0,
        lines: [{ line: 1, text: '' }],
      },
    });
    expect(thread.draft).toMatchObject({
      text: '',
      base: { text: 'forward 10', revision: 7 },
    });
  });
});
