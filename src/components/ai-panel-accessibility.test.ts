import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiActivitySession } from '../ai-activity.ts';
import AIPanel from './AIPanel.tsx';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

const activity: AiActivitySession = {
  id: 1,
  command: 'create',
  instruction: 'a layered wave',
  model: 'anthropic/test-model',
  startedAt: 100,
  finishedAt: 240,
  status: 'completed',
  events: [
    {
      id: 1,
      at: 120,
      phase: 'response',
      tone: 'neutral',
      title: 'Candidate 1 received',
      summary: '20 lines',
      usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130, cost: 0.004 },
    },
    {
      id: 2,
      at: 160,
      phase: 'physics',
      tone: 'warning',
      title: 'Physics review of candidate 1',
      summary: '0 blockers · 2 risks',
      detail: 'Finding 1\nSource (primary): line 8',
    },
  ],
};

async function renderPanel(value: AiActivitySession | null) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(AIPanel, {
        activity: value,
        selectedModel: 'anthropic/test-model',
        hasApiKey: true,
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

describe('AI panel accessibility', () => {
  it('exposes session status, usage, a live timeline, and expandable feedback', async () => {
    await renderPanel(activity);
    const panel = container?.querySelector('section[aria-label="AI activity"]');
    const status = panel?.querySelector('[role="status"]');
    const timeline = panel?.querySelector('ol[aria-label="AI activity timeline"]');
    const details = panel?.querySelector('details');

    expect(status?.textContent).toBe('Completed');
    expect(panel?.querySelector('[aria-label="AI usage"]')?.textContent).toContain('130 tokens');
    expect(timeline?.getAttribute('aria-live')).toBe('polite');
    expect(timeline?.children).toHaveLength(2);
    expect(details?.textContent).toContain('Source (primary): line 8');
  });

  it('explains setup before the first activity', async () => {
    await renderPanel(null);
    expect(container?.textContent).toContain('No AI activity yet');
    expect(container?.textContent).toContain('/ai create');
  });
});
