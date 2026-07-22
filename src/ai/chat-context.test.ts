import { describe, expect, it } from 'vitest';
import { buildProviderMessages } from './chat-context.ts';
import { EMPTY_AI_USAGE, type AiChatThread } from './chat-types.ts';

describe('AI provider history', () => {
  it('keeps assistant tool calls next to their matching tool results', () => {
    const thread: AiChatThread = {
      version: 1,
      id: 'thread',
      workspaceId: 'workspace',
      title: 'Inspect',
      model: 'model',
      createdAt: 1,
      updatedAt: 1,
      status: 'idle',
      usage: { ...EMPTY_AI_USAGE },
      turns: [
        {
          id: 'turn',
          startedAt: 1,
          status: 'completed',
          user: { role: 'user', content: 'How large is it?' },
          usage: { ...EMPTY_AI_USAGE },
          modelSteps: 2,
          toolCalls: 1,
          compiles: 1,
          steps: [
            {
              kind: 'assistant',
              message: {
                role: 'assistant',
                content: null,
                toolCalls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'compile_design', arguments: '{}' },
                  },
                ],
              },
            },
            {
              kind: 'tool-result',
              message: { role: 'tool', toolCallId: 'call-1', content: '{"ok":true}' },
              display: { title: 'Compiled', summary: 'ok', status: 'success' },
            },
            {
              kind: 'assistant',
              message: { role: 'assistant', content: 'It is 40 mm wide.' },
            },
          ],
        },
      ],
    };
    expect(buildProviderMessages(thread, 'snapshot').slice(2)).toEqual([
      { role: 'user', content: 'How large is it?' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'compile_design', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call-1', content: '{"ok":true}' },
      { role: 'assistant', content: 'It is 40 mm wide.' },
    ]);
  });
});
