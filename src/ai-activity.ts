export type AiActivityStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type AiActivityPhase =
  'request' | 'response' | 'compile' | 'spatial' | 'physics' | 'decision' | 'complete' | 'error';

export type AiActivityTone = 'neutral' | 'progress' | 'success' | 'warning' | 'error';

export interface AiActivityUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface AiActivityEvent {
  id: number;
  at: number;
  phase: AiActivityPhase;
  tone: AiActivityTone;
  title: string;
  summary?: string;
  detail?: string;
  usage?: AiActivityUsage;
}

export interface AiActivitySession {
  id: number;
  command: 'create' | 'improve' | 'fix' | 'explain' | 'default';
  instruction: string;
  model: string;
  startedAt: number;
  finishedAt?: number;
  status: AiActivityStatus;
  events: AiActivityEvent[];
}

export type AiActivityEventDraft = Omit<AiActivityEvent, 'id' | 'at'>;

export function createAiActivitySession(
  id: number,
  command: AiActivitySession['command'],
  instruction: string,
  model: string,
  startedAt: number,
): AiActivitySession {
  return {
    id,
    command,
    instruction,
    model,
    startedAt,
    status: 'running',
    events: [],
  };
}

export function appendAiActivityEvent(
  session: AiActivitySession,
  event: AiActivityEvent,
): AiActivitySession {
  if (session.status !== 'running') return session;
  return { ...session, events: [...session.events, event] };
}

export function finishAiActivitySession(
  session: AiActivitySession,
  status: Exclude<AiActivityStatus, 'running'>,
  finishedAt: number,
): AiActivitySession {
  if (session.status !== 'running') return session;
  return { ...session, status, finishedAt };
}

export function aiActivityUsageTotal(session: AiActivitySession): AiActivityUsage | null {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let cost = 0;
  let hasUsage = false;
  let hasCost = false;
  for (const event of session.events) {
    if (!event.usage) continue;
    hasUsage = true;
    promptTokens += event.usage.promptTokens;
    completionTokens += event.usage.completionTokens;
    totalTokens += event.usage.totalTokens;
    if (event.usage.cost !== undefined) {
      hasCost = true;
      cost += event.usage.cost;
    }
  }
  return hasUsage
    ? { promptTokens, completionTokens, totalTokens, ...(hasCost ? { cost } : {}) }
    : null;
}
