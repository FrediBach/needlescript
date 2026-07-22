import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_AI_USAGE, type AiChatThread } from '../ai/chat-types.ts';
import type { UseAIChatReturn } from '../hooks/useAIChat.ts';
import AIChatPanel from './AIChatPanel.tsx';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function thread(overrides: Partial<AiChatThread> = {}): AiChatThread {
  return {
    version: 1,
    id: 'thread',
    workspaceId: 'workspace',
    title: 'New chat',
    model: 'model',
    createdAt: 1,
    updatedAt: 1,
    status: 'idle',
    turns: [],
    usage: { ...EMPTY_AI_USAGE },
    ...overrides,
  };
}

function chat(activeThread: AiChatThread, setIntent = vi.fn()): UseAIChatReturn {
  return {
    threads: [activeThread],
    activeThread,
    proposal: null,
    view: 'chat',
    openRequestId: 1,
    composerSeed: '',
    isBusy: false,
    canSend: true,
    modelSupportsTools: true,
    setView: vi.fn(),
    selectThread: vi.fn(),
    setIntent,
    openChat: vi.fn(),
    openChats: vi.fn(),
    newChat: vi.fn(),
    clearActiveChat: vi.fn(),
    sendMessage: vi.fn(),
    cancelTurn: vi.fn(),
    answerQuestions: vi.fn(),
    cancelQuestions: vi.fn(),
    discardDraft: vi.fn(),
    rebaseDraft: vi.fn(),
    proposalApplied: vi.fn(),
  };
}

async function render(value: UseAIChatReturn) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => {
    root?.render(
      createElement(AIChatPanel, {
        chat: value,
        selectedModel: 'model',
        hasApiKey: true,
        onApplyProposal: vi.fn(),
      }),
    );
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('AI chat panel', () => {
  it('requires create-new or edit-current intent before enabling the composer', async () => {
    const setIntent = vi.fn();
    await render(chat(thread(), setIntent));
    const buttons = [...(container?.querySelectorAll('button') ?? [])];
    const createButton = buttons.find((button) =>
      button.textContent?.includes('Create something new'),
    );
    expect(createButton).toBeDefined();
    expect(container?.querySelector('textarea')?.disabled).toBe(true);
    await act(async () => createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(setIntent).toHaveBeenCalledWith('create');
  });

  it('scrolls to the rendered end when a step is appended without relying on timestamps', async () => {
    const baseTurn = {
      id: 'turn',
      startedAt: 1,
      status: 'running' as const,
      user: { role: 'user' as const, content: 'Inspect this' },
      steps: [],
      usage: { ...EMPTY_AI_USAGE },
      modelSteps: 0,
      toolCalls: 0,
      compiles: 0,
    };
    const active = thread({ intent: 'edit', status: 'running', turns: [baseTurn] });
    await render(chat(active));
    const transcript = container?.querySelector('ol[aria-live="polite"]') as HTMLOListElement;
    Object.defineProperty(transcript, 'scrollHeight', { configurable: true, value: 480 });
    const updated = thread({
      intent: 'edit',
      status: 'running',
      updatedAt: active.updatedAt,
      turns: [
        {
          ...baseTurn,
          steps: [
            {
              kind: 'assistant' as const,
              message: { role: 'assistant' as const, content: 'Latest response' },
            },
          ],
        },
      ],
    });
    await render(chat(updated));
    expect(transcript.scrollTop).toBe(480);
  });
});
