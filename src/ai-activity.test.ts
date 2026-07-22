import { describe, expect, it } from 'vitest';
import {
  aiActivityUsageTotal,
  appendAiActivityEvent,
  createAiActivitySession,
  finishAiActivitySession,
} from './ai-activity.ts';

describe('AI activity model', () => {
  it('builds an immutable session timeline and closes it once', () => {
    const started = createAiActivitySession(1, 'create', 'a wave', 'test/model', 100);
    const withEvent = appendAiActivityEvent(started, {
      id: 1,
      at: 120,
      phase: 'request',
      tone: 'progress',
      title: 'Requesting candidate 1',
    });
    const completed = finishAiActivitySession(withEvent, 'completed', 180);
    const ignored = appendAiActivityEvent(completed, {
      id: 2,
      at: 200,
      phase: 'error',
      tone: 'error',
      title: 'Too late',
    });

    expect(started.events).toEqual([]);
    expect(withEvent.events).toHaveLength(1);
    expect(completed).toMatchObject({ status: 'completed', finishedAt: 180 });
    expect(ignored).toBe(completed);
  });

  it('totals usage across revision responses without inventing missing cost', () => {
    let session = createAiActivitySession(1, 'fix', 'repair it', 'test/model', 100);
    session = appendAiActivityEvent(session, {
      id: 1,
      at: 120,
      phase: 'response',
      tone: 'neutral',
      title: 'Candidate 1',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, cost: 0.002 },
    });
    session = appendAiActivityEvent(session, {
      id: 2,
      at: 140,
      phase: 'response',
      tone: 'neutral',
      title: 'Candidate 2',
      usage: { promptTokens: 130, completionTokens: 30, totalTokens: 160 },
    });

    expect(aiActivityUsageTotal(session)).toEqual({
      promptTokens: 230,
      completionTokens: 50,
      totalTokens: 280,
      cost: 0.002,
    });
    expect(
      aiActivityUsageTotal(createAiActivitySession(2, 'explain', 'why?', 'model', 0)),
    ).toBeNull();
  });
});
