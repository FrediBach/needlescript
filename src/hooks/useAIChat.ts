import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_AI_USAGE,
  type AiChatStep,
  type AiChatThread,
  type AiChatTurn,
  type AiCodeProposal,
  type AiQuestionAnswer,
  type AiQuestionSet,
  type AiToolCall,
  type AiToolDisplay,
  type AiWorkPlan,
} from '../ai/chat-types.ts';
import { AI_CHAT_TOOLS } from '../ai/tool-definitions.ts';
import { buildProviderMessages } from '../ai/chat-context.ts';
import { loadChatThreads, loadChatThreadsAsync, saveChatThreads } from '../ai/chat-storage.ts';
import { OpenRouterAiProvider } from '../ai/openrouter-provider.ts';
import { createDraft, createProposal, hashSource } from '../ai/source-edits.ts';
import { createToolRuntime } from '../ai/tool-runtime.ts';
import { runAgentLoop } from '../ai/agent-loop.ts';
import { useCompiler } from './useCompiler.ts';
import type { AIModelInfo } from './useAI.ts';

interface UseAIChatOptions {
  workspaceId: string;
  sourceRef: React.RefObject<string>;
  sourceRevision: number;
  selectedModel: string;
  models: AIModelInfo[];
  directAiBusy: boolean;
}

export interface UseAIChatReturn {
  threads: AiChatThread[];
  activeThread: AiChatThread | null;
  proposal: AiCodeProposal | null;
  view: 'chat' | 'activity';
  openRequestId: number;
  composerSeed: string;
  isBusy: boolean;
  canSend: boolean;
  modelSupportsTools: boolean;
  setView: (view: 'chat' | 'activity') => void;
  selectThread: (threadId: string) => void;
  openChat: (message?: string) => Promise<void>;
  openChats: () => void;
  newChat: () => void;
  clearActiveChat: () => void;
  sendMessage: (message: string) => Promise<void>;
  cancelTurn: () => void;
  answerQuestions: (answers: AiQuestionAnswer[]) => Promise<void>;
  cancelQuestions: () => void;
  discardDraft: () => void;
  rebaseDraft: () => void;
  proposalApplied: () => void;
}

let nextId = 0;
const makeId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(++nextId).toString(36)}`;

function titleFrom(message: string): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length > 48 ? `${compact.slice(0, 47)}…` : compact || 'New chat';
}

function createThread(workspaceId: string, model: string): AiChatThread {
  const now = Date.now();
  return {
    version: 1,
    id: makeId('thread'),
    workspaceId,
    title: 'New chat',
    model,
    createdAt: now,
    updatedAt: now,
    status: 'idle',
    turns: [],
    usage: { ...EMPTY_AI_USAGE },
  };
}

function addUsage(
  left: AiChatThread['usage'],
  right: AiChatThread['usage'] | undefined,
): AiChatThread['usage'] {
  if (!right) return left;
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    ...(left.cost === undefined && right.cost === undefined
      ? {}
      : { cost: (left.cost ?? 0) + (right.cost ?? 0) }),
  };
}

function closeUnmatchedToolCalls(turn: AiChatTurn, reason: string): AiChatTurn {
  const completed = new Set(
    turn.steps.flatMap((step) => (step.kind === 'tool-result' ? [step.message.toolCallId] : [])),
  );
  const unmatched = turn.steps.flatMap((step) =>
    step.kind === 'assistant'
      ? (step.message.toolCalls ?? []).filter(({ id }) => !completed.has(id))
      : [],
  );
  if (!unmatched.length) return turn;
  return {
    ...turn,
    toolCalls: turn.toolCalls + unmatched.length,
    steps: [
      ...turn.steps,
      ...unmatched.map((call): AiChatStep => ({
        kind: 'tool-result',
        message: {
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify({
            ok: false,
            tool: call.function.name,
            error: { code: 'cancelled', message: reason, retryable: true },
          }),
        },
        display: {
          title: call.function.name.replaceAll('_', ' '),
          summary: reason,
          status: 'warning',
        },
      })),
    ],
  };
}

export function useAIChat({
  workspaceId,
  sourceRef,
  sourceRevision,
  selectedModel,
  models,
  directAiBusy,
}: UseAIChatOptions): UseAIChatReturn {
  const { compile } = useCompiler({ physicsAnalysis: 'full' });
  const [threads, setThreads] = useState<AiChatThread[]>(loadChatThreads);
  const threadsRef = useRef(threads);
  const storageHydratedRef = useRef(typeof indexedDB === 'undefined');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const activeThreadIdRef = useRef(activeThreadId);
  const [view, setView] = useState<'chat' | 'activity'>('chat');
  const [openRequestId, setOpenRequestId] = useState(0);
  const [composerSeed, setComposerSeed] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const sourceRevisionRef = useRef(sourceRevision);
  const workspaceIdRef = useRef(workspaceId);

  useEffect(() => {
    threadsRef.current = threads;
    if (storageHydratedRef.current) saveChatThreads(threads);
  }, [threads]);
  useEffect(() => {
    let active = true;
    void loadChatThreadsAsync().then((stored) => {
      if (!active) return;
      storageHydratedRef.current = true;
      if (stored.length > 0 && threadsRef.current.length === 0) {
        threadsRef.current = stored;
        setThreads(stored);
        const recent = stored
          .filter((thread) => thread.workspaceId === workspaceIdRef.current)
          .sort((left, right) => right.updatedAt - left.updatedAt)[0];
        if (recent) setActiveThreadId(recent.id);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);
  useEffect(() => {
    sourceRevisionRef.current = sourceRevision;
  }, [sourceRevision]);

  const replaceThread = useCallback(
    (threadId: string, update: (thread: AiChatThread) => AiChatThread) => {
      const next = threadsRef.current.map((thread) =>
        thread.id === threadId ? update(thread) : thread,
      );
      threadsRef.current = next;
      setThreads(next);
      saveChatThreads(next);
    },
    [],
  );

  const activeThread = useMemo(
    () => threads.find(({ id }) => id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );

  useEffect(() => {
    if (workspaceIdRef.current !== workspaceId) {
      abortRef.current?.abort();
      abortRef.current = null;
      workspaceIdRef.current = workspaceId;
    }
    const current = threadsRef.current.find(
      ({ id, workspaceId: owner }) => id === activeThreadIdRef.current && owner === workspaceId,
    );
    if (current) return;
    const recent = threadsRef.current
      .filter((thread) => thread.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    setActiveThreadId(recent?.id ?? null);
  }, [workspaceId]);

  useEffect(() => {
    const liveHash = hashSource(sourceRef.current);
    for (const thread of threadsRef.current) {
      if (thread.workspaceId !== workspaceId || !thread.draft || thread.draft.status === 'stale')
        continue;
      if (thread.draft.base.revision !== sourceRevision || thread.draft.base.hash !== liveHash) {
        replaceThread(thread.id, (current) => ({
          ...current,
          updatedAt: Date.now(),
          draft: current.draft ? { ...current.draft, status: 'stale' } : undefined,
        }));
      }
    }
  }, [replaceThread, sourceRef, sourceRevision, workspaceId]);

  const ensureThread = useCallback((): AiChatThread => {
    const existing = threadsRef.current.find(
      ({ id, workspaceId: owner }) =>
        id === activeThreadIdRef.current && owner === workspaceIdRef.current,
    );
    if (existing) return existing;
    const thread = createThread(workspaceIdRef.current, selectedModel);
    const next = [thread, ...threadsRef.current];
    threadsRef.current = next;
    setThreads(next);
    saveChatThreads(next);
    setActiveThreadId(thread.id);
    activeThreadIdRef.current = thread.id;
    return thread;
  }, [selectedModel]);

  const runTurn = useCallback(
    async (threadId: string) => {
      const apiKey = localStorage.getItem('ns-ai-apikey') ?? '';
      if (!apiKey) {
        replaceThread(threadId, (thread) => ({
          ...thread,
          status: 'idle',
          turns: thread.turns.map((turn, index) =>
            index === thread.turns.length - 1
              ? {
                  ...turn,
                  status: 'failed',
                  finishedAt: Date.now(),
                  steps: [
                    ...turn.steps,
                    {
                      kind: 'notice',
                      level: 'error',
                      text: 'Set an OpenRouter key with /ai apikey before sending.',
                    },
                  ],
                }
              : turn,
          ),
        }));
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => {
        controller.abort();
        replaceThread(threadId, (thread) => ({
          ...thread,
          status: 'idle',
          updatedAt: Date.now(),
          turns: thread.turns.map((turn, index) => {
            if (index !== thread.turns.length - 1 || turn.status !== 'running') return turn;
            const closed = closeUnmatchedToolCalls(
              turn,
              'Tool call cancelled after the 90-second turn limit.',
            );
            return {
              ...closed,
              status: 'failed',
              finishedAt: Date.now(),
              steps: [
                ...closed.steps,
                {
                  kind: 'notice',
                  level: 'error',
                  text: 'The active turn exceeded its 90-second limit.',
                },
              ],
            };
          }),
        }));
        abortRef.current = null;
      }, 90_000);
      const getThread = () => threadsRef.current.find(({ id }) => id === threadId)!;
      const modelForTurn = getThread().model;
      const updateLatestTurn = (update: (turn: AiChatTurn) => AiChatTurn) =>
        replaceThread(threadId, (thread) => ({
          ...thread,
          updatedAt: Date.now(),
          turns: thread.turns.map((turn, index) =>
            index === thread.turns.length - 1 ? update(turn) : turn,
          ),
        }));
      const appendStep = (step: AiChatStep) =>
        updateLatestTurn((turn) => ({ ...turn, steps: [...turn.steps, step] }));
      const runtime = createToolRuntime({
        liveSource: () => ({ text: sourceRef.current, revision: sourceRevisionRef.current }),
        compile,
        getThread,
        updateDraft: (draft) =>
          replaceThread(threadId, (thread) => ({ ...thread, updatedAt: Date.now(), draft })),
        updatePlan: (plan: AiWorkPlan, explanation?: string) => {
          replaceThread(threadId, (thread) => ({
            ...thread,
            updatedAt: Date.now(),
            activePlan: plan,
          }));
          appendStep({ kind: 'plan-update', plan, ...(explanation ? { explanation } : {}) });
        },
        incrementCompileCount: () =>
          updateLatestTurn((turn) => ({ ...turn, compiles: turn.compiles + 1 })),
      });
      const snapshot = () => {
        const thread = getThread();
        const draft = thread.draft;
        return [
          'Current workspace snapshot:',
          `workspace=${thread.workspaceId}`,
          `live revision=${sourceRevisionRef.current}, hash=${hashSource(sourceRef.current)}`,
          `draft=${draft ? `${draft.status}, revision=${draft.revision}, hash=${draft.hash}` : 'not created'}`,
          `plan=${thread.activePlan ? `${thread.activePlan.id} v${thread.activePlan.version}` : 'none'}`,
        ].join('\n');
      };
      await runAgentLoop({
        provider: new OpenRouterAiProvider(apiKey),
        model: modelForTurn,
        signal: controller.signal,
        getThread,
        messages: () => buildProviderMessages(getThread(), snapshot()),
        executeTool: runtime,
        tools: AI_CHAT_TOOLS,
        appendAssistant: (message, model, usage) => {
          replaceThread(threadId, (thread) => ({
            ...thread,
            model: modelForTurn,
            updatedAt: Date.now(),
            usage: addUsage(thread.usage, usage),
            turns: thread.turns.map((turn, index) =>
              index === thread.turns.length - 1
                ? {
                    ...turn,
                    modelSteps: turn.modelSteps + 1,
                    usage: addUsage(turn.usage, usage),
                    steps: [...turn.steps, { kind: 'assistant', message, model }],
                  }
                : turn,
            ),
          }));
        },
        appendToolResult: (call: AiToolCall, content: string, display: AiToolDisplay) => {
          updateLatestTurn((turn) => ({
            ...turn,
            toolCalls: turn.toolCalls + 1,
            steps: [
              ...turn.steps,
              {
                kind: 'tool-result',
                message: { role: 'tool', toolCallId: call.id, content },
                display,
              },
            ],
          }));
        },
        awaitQuestions: (call: AiToolCall, questions: AiQuestionSet) => {
          const now = Date.now();
          replaceThread(threadId, (thread) => ({
            ...thread,
            status: 'awaiting-user',
            updatedAt: now,
            pendingQuestionSet: {
              turnId: thread.turns.at(-1)!.id,
              toolCallId: call.id,
              questions,
              openedAt: now,
            },
            turns: thread.turns.map((turn, index) =>
              index === thread.turns.length - 1
                ? {
                    ...turn,
                    status: 'awaiting-user',
                    toolCalls: turn.toolCalls + 1,
                    steps: [
                      ...turn.steps,
                      {
                        kind: 'question-set',
                        toolCallId: call.id,
                        questionSet: questions,
                        status: 'open',
                      },
                    ],
                  }
                : turn,
            ),
          }));
          abortRef.current = null;
        },
        finish: () => {
          replaceThread(threadId, (thread) => ({
            ...thread,
            status: 'idle',
            updatedAt: Date.now(),
            turns: thread.turns.map((turn, index) =>
              index === thread.turns.length - 1
                ? { ...turn, status: 'completed', finishedAt: Date.now() }
                : turn,
            ),
          }));
          abortRef.current = null;
        },
        fail: (message) => {
          replaceThread(threadId, (thread) => ({
            ...thread,
            status: 'idle',
            updatedAt: Date.now(),
            turns: thread.turns.map((turn, index) =>
              index === thread.turns.length - 1
                ? {
                    ...turn,
                    status: 'failed',
                    finishedAt: Date.now(),
                    steps: [...turn.steps, { kind: 'notice', level: 'error', text: message }],
                  }
                : turn,
            ),
          }));
          abortRef.current = null;
        },
      });
      clearTimeout(timeout);
    },
    [compile, replaceThread, sourceRef],
  );

  const sendMessage = useCallback(
    async (message: string) => {
      const content = message.trim().slice(0, 8_000);
      if (!content || directAiBusy) return;
      const model = models.find(({ id }) => id === selectedModel);
      if (!model?.supportsTools) return;
      const thread = ensureThread();
      if (thread.status !== 'idle') return;
      const now = Date.now();
      const turn: AiChatTurn = {
        id: makeId('turn'),
        startedAt: now,
        status: 'running',
        user: { role: 'user', content },
        steps: [],
        usage: { ...EMPTY_AI_USAGE },
        modelSteps: 0,
        toolCalls: 0,
        compiles: 0,
      };
      replaceThread(thread.id, (current) => ({
        ...current,
        title: current.turns.length ? current.title : titleFrom(content),
        model: selectedModel,
        status: 'running',
        updatedAt: now,
        turns: [...current.turns, turn],
      }));
      setComposerSeed('');
      await runTurn(thread.id);
    },
    [directAiBusy, ensureThread, models, replaceThread, runTurn, selectedModel],
  );

  const openChat = useCallback(
    async (message?: string) => {
      setView('chat');
      setOpenRequestId((id) => id + 1);
      ensureThread();
      if (message?.trim()) {
        const supportsTools = models.find(({ id }) => id === selectedModel)?.supportsTools ?? false;
        if (!localStorage.getItem('ns-ai-apikey') || !supportsTools || directAiBusy) {
          setComposerSeed(message.trim().slice(0, 8_000));
        } else {
          await sendMessage(message);
        }
      }
    },
    [directAiBusy, ensureThread, models, selectedModel, sendMessage],
  );

  const newChat = useCallback(() => {
    const thread = createThread(workspaceIdRef.current, selectedModel);
    const next = [thread, ...threadsRef.current];
    threadsRef.current = next;
    setThreads(next);
    saveChatThreads(next);
    setActiveThreadId(thread.id);
    activeThreadIdRef.current = thread.id;
    setView('chat');
    setOpenRequestId((id) => id + 1);
  }, [selectedModel]);

  const clearActiveChat = useCallback(() => {
    const id = activeThreadIdRef.current;
    if (!id) return;
    const next = threadsRef.current.filter((thread) => thread.id !== id);
    threadsRef.current = next;
    setThreads(next);
    saveChatThreads(next);
    const recent = next
      .filter((thread) => thread.workspaceId === workspaceIdRef.current)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    setActiveThreadId(recent?.id ?? null);
  }, []);

  const cancelTurn = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const id = activeThreadIdRef.current;
    if (!id) return;
    replaceThread(id, (thread) => ({
      ...thread,
      status: 'idle',
      updatedAt: Date.now(),
      turns: thread.turns.map((turn, index) => {
        if (index !== thread.turns.length - 1 || turn.status !== 'running') return turn;
        const closed = closeUnmatchedToolCalls(turn, 'Tool call cancelled by the user.');
        return {
          ...closed,
          status: 'cancelled',
          finishedAt: Date.now(),
          steps: [
            ...closed.steps,
            {
              kind: 'notice',
              level: 'warning',
              text: 'Turn cancelled. The last valid private draft was retained.',
            },
          ],
        };
      }),
    }));
  }, [replaceThread]);

  const answerQuestions = useCallback(
    async (answers: AiQuestionAnswer[]) => {
      const id = activeThreadIdRef.current;
      const thread = id
        ? threadsRef.current.find(({ id: candidate }) => candidate === id)
        : undefined;
      const pending = thread?.pendingQuestionSet;
      if (!thread || !pending) return;
      const answerData = answers.map((answer) => {
        const question = pending.questions.questions.find(
          ({ id: questionId }) => questionId === answer.questionId,
        );
        return {
          questionId: answer.questionId,
          selected: answer.selectedOptionIds.map((optionId) => {
            const option = question?.options.find(({ id: candidate }) => candidate === optionId);
            return { id: optionId, label: option?.label ?? optionId };
          }),
          ...(answer.other?.trim() ? { other: answer.other.trim().slice(0, 500) } : {}),
        };
      });
      const content = JSON.stringify({
        ok: true,
        tool: 'ask_user_questions',
        data: { answers: answerData },
      });
      replaceThread(thread.id, (current) => ({
        ...current,
        status: 'running',
        updatedAt: Date.now(),
        pendingQuestionSet: undefined,
        turns: current.turns.map((turn) => {
          if (turn.id !== pending.turnId) return turn;
          const updatedSteps: AiChatStep[] = turn.steps.map((step): AiChatStep =>
            step.kind === 'question-set' && step.toolCallId === pending.toolCallId
              ? { ...step, status: 'answered', answers }
              : step,
          );
          updatedSteps.push({
            kind: 'tool-result',
            message: { role: 'tool', toolCallId: pending.toolCallId, content },
            display: {
              title: 'Answered questions',
              summary: `${answers.length} answer(s) submitted`,
              status: 'success',
            },
          });
          return { ...turn, status: 'running', steps: updatedSteps };
        }),
      }));
      await runTurn(thread.id);
    },
    [replaceThread, runTurn],
  );

  const cancelQuestions = useCallback(() => {
    const id = activeThreadIdRef.current;
    const thread = id
      ? threadsRef.current.find(({ id: candidate }) => candidate === id)
      : undefined;
    const pending = thread?.pendingQuestionSet;
    if (!thread || !pending) return;
    const content = JSON.stringify({
      ok: true,
      tool: 'ask_user_questions',
      data: { cancelled: true },
    });
    replaceThread(thread.id, (current) => ({
      ...current,
      status: 'idle',
      pendingQuestionSet: undefined,
      updatedAt: Date.now(),
      turns: current.turns.map((turn) => {
        if (turn.id !== pending.turnId) return turn;
        const updatedSteps: AiChatStep[] = turn.steps.map((step): AiChatStep =>
          step.kind === 'question-set' && step.toolCallId === pending.toolCallId
            ? { ...step, status: 'cancelled' }
            : step,
        );
        updatedSteps.push({
          kind: 'tool-result',
          message: { role: 'tool', toolCallId: pending.toolCallId, content },
          display: {
            title: 'Question cancelled',
            summary: 'Turn ended without answers',
            status: 'warning',
          },
        });
        return { ...turn, status: 'cancelled', finishedAt: Date.now(), steps: updatedSteps };
      }),
    }));
  }, [replaceThread]);

  const resetDraft = useCallback(
    (notice: string) => {
      const id = activeThreadIdRef.current;
      if (!id) return;
      replaceThread(id, (thread) => ({
        ...thread,
        updatedAt: Date.now(),
        draft: createDraft(sourceRef.current, sourceRevisionRef.current),
        turns: thread.turns.map((turn, index) =>
          index === thread.turns.length - 1
            ? { ...turn, steps: [...turn.steps, { kind: 'notice', level: 'info', text: notice }] }
            : turn,
        ),
      }));
    },
    [replaceThread, sourceRef],
  );

  const proposalApplied = useCallback(() => {
    const id = activeThreadIdRef.current;
    if (!id) return;
    replaceThread(id, (thread) => ({
      ...thread,
      updatedAt: Date.now(),
      draft: createDraft(sourceRef.current, sourceRevisionRef.current + 1),
      turns: thread.turns.map((turn, index) =>
        index === thread.turns.length - 1
          ? {
              ...turn,
              steps: [
                ...turn.steps,
                {
                  kind: 'notice',
                  level: 'info',
                  text: 'Proposal applied to the live editor as one undoable edit.',
                },
              ],
            }
          : turn,
      ),
    }));
  }, [replaceThread, sourceRef]);

  const proposal = activeThread?.draft ? createProposal(activeThread.id, activeThread.draft) : null;
  const modelSupportsTools = models.find(({ id }) => id === selectedModel)?.supportsTools ?? false;

  return {
    threads: threads.filter((thread) => thread.workspaceId === workspaceId),
    activeThread,
    proposal,
    view,
    openRequestId,
    composerSeed,
    isBusy: activeThread?.status === 'running',
    canSend: !directAiBusy && activeThread?.status !== 'running',
    modelSupportsTools,
    setView,
    selectThread: (threadId) => {
      if (
        threadsRef.current.some(
          ({ id, workspaceId: owner }) => id === threadId && owner === workspaceIdRef.current,
        )
      )
        setActiveThreadId(threadId);
    },
    openChat,
    openChats: () => {
      setView('chat');
      setOpenRequestId((id) => id + 1);
    },
    newChat,
    clearActiveChat,
    sendMessage,
    cancelTurn,
    answerQuestions,
    cancelQuestions,
    discardDraft: () => resetDraft('Private draft discarded.'),
    rebaseDraft: () =>
      resetDraft(
        'Conversation rebased on the current live source. Earlier proposal evidence is historical.',
      ),
    proposalApplied,
  };
}
