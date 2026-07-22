import { describe, expect, it } from 'vitest';
import { runAgentLoop } from './agent-loop.ts';
import { MAX_MODEL_STEPS_PER_TURN } from './chat-limits.ts';
import { EMPTY_AI_USAGE, type AiChatThread, type AiProviderMessage } from './chat-types.ts';
import type { AiProvider, AiProviderResponse } from './provider.ts';

class FakeProvider implements AiProvider {
  requests: AiProviderMessage[][] = [];
  private readonly responses: AiProviderResponse[];

  constructor(responses: AiProviderResponse[]) {
    this.responses = responses;
  }

  async complete(request: Parameters<AiProvider['complete']>[0]): Promise<AiProviderResponse> {
    this.requests.push(structuredClone(request.messages));
    const response = this.responses.shift();
    if (!response) throw new Error('No fake response remains.');
    return response;
  }
}

function runningThread(): AiChatThread {
  return {
    version: 1,
    id: 'thread',
    workspaceId: 'workspace',
    title: 'Question',
    model: 'fake-model',
    createdAt: 1,
    updatedAt: 1,
    status: 'running',
    usage: { ...EMPTY_AI_USAGE },
    turns: [
      {
        id: 'turn',
        startedAt: 1,
        status: 'running',
        user: { role: 'user', content: 'How many stitches?' },
        steps: [],
        usage: { ...EMPTY_AI_USAGE },
        modelSteps: 0,
        toolCalls: 0,
        compiles: 0,
      },
    ],
  };
}

describe('AI agent loop', () => {
  it('preserves a tool-call bundle and continues to a final response', async () => {
    const provider = new FakeProvider([
      {
        model: 'fake-model',
        message: {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'compile_design', arguments: '{"target":"live"}' },
            },
          ],
        },
      },
      {
        model: 'fake-model',
        message: { role: 'assistant', content: 'The design has 120 stitches.' },
      },
    ]);
    const thread = runningThread();
    const messages: AiProviderMessage[] = [thread.turns[0].user];
    let finished = false;
    await runAgentLoop({
      provider,
      model: 'fake-model',
      signal: new AbortController().signal,
      getThread: () => thread,
      messages: () => messages,
      tools: [],
      executeTool: async () => ({
        content: '{"ok":true,"data":{"stitches":120}}',
        display: { title: 'Compiled design', summary: '120 stitches', status: 'success' },
      }),
      appendAssistant: (message) => {
        thread.turns[0].modelSteps++;
        messages.push(message);
      },
      appendToolResult: (call, content) => {
        thread.turns[0].toolCalls++;
        messages.push({ role: 'tool', toolCallId: call.id, content });
      },
      awaitQuestions: () => {
        throw new Error('Unexpected question.');
      },
      finish: () => {
        finished = true;
      },
      fail: (message) => {
        throw new Error(message);
      },
    });
    expect(finished).toBe(true);
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1].slice(-2)).toEqual([
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'compile_design', arguments: '{"target":"live"}' },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: '{"ok":true,"data":{"stitches":120}}',
      },
    ]);
  });

  it('pauses without sending another request for a user question', async () => {
    const provider = new FakeProvider([
      {
        model: 'fake-model',
        message: {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'question-1',
              type: 'function',
              function: { name: 'ask_user_questions', arguments: '{}' },
            },
          ],
        },
      },
    ]);
    const thread = runningThread();
    let paused = false;
    await runAgentLoop({
      provider,
      model: 'fake-model',
      signal: new AbortController().signal,
      getThread: () => thread,
      messages: () => [thread.turns[0].user],
      tools: [],
      executeTool: async () => ({
        pause: {
          questions: [
            {
              id: 'scope',
              prompt: 'Which scope?',
              selection: 'single',
              required: true,
              options: [
                { id: 'local', label: 'Local', description: 'Change one area.' },
                { id: 'all', label: 'All', description: 'Change the whole design.' },
              ],
            },
          ],
        },
      }),
      appendAssistant: () => {
        thread.turns[0].modelSteps++;
      },
      appendToolResult: () => {
        throw new Error('Question must not have an immediate result.');
      },
      awaitQuestions: () => {
        paused = true;
      },
      finish: () => {
        throw new Error('Question turn must pause.');
      },
      fail: (message) => {
        throw new Error(message);
      },
    });
    expect(paused).toBe(true);
    expect(provider.requests).toHaveLength(1);
  });

  it('requests a tools-disabled final response after the raised model-step ceiling', async () => {
    const provider = new FakeProvider([
      {
        model: 'fake-model',
        message: {
          role: 'assistant',
          content: 'I completed the available checks; one optional refinement remains.',
          toolCalls: [
            {
              id: 'ignored-call',
              type: 'function',
              function: { name: 'read_source', arguments: '{}' },
            },
          ],
        },
      },
    ]);
    const thread = runningThread();
    thread.turns[0].modelSteps = MAX_MODEL_STEPS_PER_TURN;
    let finalContent: string | null = null;
    let finished = false;
    await runAgentLoop({
      provider,
      model: 'fake-model',
      signal: new AbortController().signal,
      getThread: () => thread,
      messages: () => [thread.turns[0].user],
      tools: [],
      executeTool: async () => {
        throw new Error('Finalization must not execute tools.');
      },
      appendAssistant: (message) => {
        finalContent = message.content;
        expect(message.toolCalls).toBeUndefined();
      },
      appendToolResult: () => {
        throw new Error('Finalization must not append tool results.');
      },
      awaitQuestions: () => {
        throw new Error('Finalization must not ask questions.');
      },
      finish: () => {
        finished = true;
      },
      fail: (message) => {
        throw new Error(message);
      },
    });
    expect(MAX_MODEL_STEPS_PER_TURN).toBe(64);
    expect(finalContent).toContain('completed the available checks');
    expect(finished).toBe(true);
    expect(provider.requests[0].at(-1)?.content).toContain('Return the best concise final answer');
  });
});
