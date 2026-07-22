import type { AiActivityUsage } from '../ai-activity.ts';

export type AiThreadStatus = 'idle' | 'running' | 'awaiting-user';
export type AiTurnStatus = 'running' | 'awaiting-user' | 'completed' | 'cancelled' | 'failed';
export type AiPlanStepStatus = 'pending' | 'in-progress' | 'completed';
export type AiChatIntent = 'create' | 'edit';

export interface AiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type AiProviderMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: AiToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string };

export interface AiToolDisplay {
  title: string;
  summary: string;
  status: 'success' | 'warning' | 'error';
  detail?: string;
  sourceLines?: number[];
  diagnosticIds?: string[];
}

export interface AiQuestionOption {
  id: string;
  label: string;
  description: string;
}

export interface AiQuestion {
  id: string;
  prompt: string;
  selection: 'single' | 'multiple';
  required: boolean;
  options: AiQuestionOption[];
  recommendedOptionId?: string;
  allowOther?: boolean;
}

export interface AiQuestionSet {
  introduction?: string;
  questions: AiQuestion[];
}

export interface AiQuestionAnswer {
  questionId: string;
  selectedOptionIds: string[];
  other?: string;
}

export interface AiWorkPlan {
  id: string;
  version: number;
  title: string;
  steps: Array<{
    id: string;
    text: string;
    status: AiPlanStepStatus;
    completedAt?: number;
  }>;
}

export interface SourceSnapshot {
  revision: number;
  hash: string;
  text: string;
}

export interface AiCompileSnapshot {
  ok: boolean;
  at: number;
  summary: string;
  stitches?: number;
  blockers?: number;
  risks?: number;
}

export interface AiDraftState {
  base: SourceSnapshot;
  text: string;
  revision: number;
  hash: string;
  status: 'clean' | 'changed' | 'stale';
  lastCompile?: AiCompileSnapshot;
}

export interface AiLineDiff {
  kind: 'context' | 'added' | 'removed';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface AiCodeProposal {
  id: string;
  threadId: string;
  baseRevision: number;
  baseHash: string;
  draftRevision: number;
  source: string;
  diff: AiLineDiff[];
  addedLines: number;
  removedLines: number;
  stale: boolean;
  compile?: AiCompileSnapshot;
}

export type AiChatStep =
  | {
      kind: 'assistant';
      message: Extract<AiProviderMessage, { role: 'assistant' }>;
      model?: string;
    }
  | {
      kind: 'tool-result';
      message: Extract<AiProviderMessage, { role: 'tool' }>;
      display: AiToolDisplay;
    }
  | {
      kind: 'question-set';
      toolCallId: string;
      questionSet: AiQuestionSet;
      status: 'open' | 'answered' | 'cancelled';
      answers?: AiQuestionAnswer[];
    }
  | { kind: 'plan-update'; plan: AiWorkPlan; explanation?: string }
  | { kind: 'notice'; level: 'info' | 'warning' | 'error'; text: string };

export interface AiChatTurn {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: AiTurnStatus;
  user: { role: 'user'; content: string };
  steps: AiChatStep[];
  usage: AiActivityUsage;
  modelSteps: number;
  toolCalls: number;
  compiles: number;
}

export interface AiPendingQuestionSet {
  turnId: string;
  toolCallId: string;
  questions: AiQuestionSet;
  openedAt: number;
}

export interface AiChatThread {
  version: 1;
  id: string;
  workspaceId: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  status: AiThreadStatus;
  intent?: AiChatIntent;
  turns: AiChatTurn[];
  draft?: AiDraftState;
  activePlan?: AiWorkPlan;
  pendingQuestionSet?: AiPendingQuestionSet;
  usage: AiActivityUsage;
}

export const EMPTY_AI_USAGE: AiActivityUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};
