import { useState, useRef, useCallback, useEffect } from 'react';
import { OpenRouter } from '@openrouter/sdk';
import type { ChatMessages } from '@openrouter/sdk/models';
import type { ChatUsage, Model } from '@openrouter/sdk/models';
import type { ConsoleMessage } from '../App.tsx';
import type { CompileResponse } from '../compiler.worker.types.ts';
import { rasterizeAiPreview } from '../ai-preview.ts';
import {
  appendAiActivityEvent,
  createAiActivitySession,
  finishAiActivitySession,
  type AiActivityEventDraft,
  type AiActivitySession,
  type AiActivityStatus,
  type AiActivityUsage,
} from '../ai-activity.ts';
import {
  buildMessages,
  buildPhysicsFeedback,
  buildPhysicsRetryMessages,
  buildRetryMessages,
  buildSpatialReviewMessages,
  extractCode,
  AI_HELP_TEXT,
  type AiCommandType,
  type ChatMessage,
} from '../lib/editor/ai-prompt.ts';
import {
  buildAiPreviewSvg,
  buildSpatialDigest,
  type AiSpatialContext,
} from '../lib/editor/ai-spatial.ts';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const NS_AI_APIKEY_KEY = 'ns-ai-apikey';
const NS_AI_MODEL_KEY = 'ns-ai-model';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5';
const MAX_AI_REVISIONS = 2;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIModelInfo {
  id: string;
  name: string;
  supportsImageInput: boolean;
}

type AddMsg = (text: string, type?: ConsoleMessage['type']) => void;

interface UseAIOptions {
  sourceRef: React.RefObject<string>;
  compile: (src: string) => Promise<CompileResponse | null>;
  setSource: (src: string) => void;
  runProgram: (src: string, name: string) => Promise<void>;
  addMsg: AddMsg;
  /** Returns the most recent compile error message, or null if the last run succeeded. */
  getLastError: () => string | null;
}

interface SuccessfulAiCandidate {
  code: string;
  errors: number;
  warnings: number;
  attempt: number;
}

type SuccessfulCompileResponse = Extract<CompileResponse, { ok: true }>;

export interface UseAIReturn {
  handleAiCommand: (input: string) => Promise<void>;
  aiModels: AIModelInfo[];
  selectedModel: string;
  hasApiKey: boolean;
  isGenerating: boolean;
  activity: AiActivitySession | null;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Cast our simple message objects to the SDK's discriminated union.
 * The runtime shapes are identical; the cast is purely to satisfy TypeScript.
 */
function toSdkMessages(messages: ChatMessage[]): ChatMessages[] {
  return messages as unknown as ChatMessages[];
}

function toActivityUsage(usage: ChatUsage | undefined): AiActivityUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    ...(usage.cost === undefined || usage.cost === null ? {} : { cost: usage.cost }),
  };
}

function isBetterCandidate(
  candidate: SuccessfulAiCandidate,
  current: SuccessfulAiCandidate | null,
): boolean {
  if (!current) return true;
  if (candidate.errors !== current.errors) return candidate.errors < current.errors;
  return candidate.warnings <= current.warnings;
}

async function buildCompiledSpatialContext(
  compileResponse: SuccessfulCompileResponse,
  includeImage: boolean,
  diagnostics = compileResponse.result.physics?.diagnostics ?? [],
): Promise<AiSpatialContext> {
  const content = buildSpatialDigest(compileResponse.result, compileResponse.stats);
  if (!includeImage) return { content };
  const svg = buildAiPreviewSvg(compileResponse.result, compileResponse.stats, diagnostics);
  const imageDataUrl = await rasterizeAiPreview(svg);
  return imageDataUrl ? { content, imageDataUrl } : { content };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAI({
  sourceRef,
  compile,
  setSource,
  runProgram,
  addMsg,
  getLastError,
}: UseAIOptions): UseAIReturn {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem(NS_AI_APIKEY_KEY) ?? '');
  const [selectedModel, setSelectedModelState] = useState(
    () => localStorage.getItem(NS_AI_MODEL_KEY) ?? DEFAULT_MODEL,
  );
  const [aiModels, setAiModels] = useState<AIModelInfo[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activity, setActivity] = useState<AiActivitySession | null>(null);

  // Guard against concurrent generations
  const isGeneratingRef = useRef(false);
  const nextActivitySessionIdRef = useRef(0);
  const nextActivityEventIdRef = useRef(0);

  const beginActivity = useCallback(
    (command: AiActivitySession['command'], instruction: string): number => {
      const id = ++nextActivitySessionIdRef.current;
      setActivity(createAiActivitySession(id, command, instruction, selectedModel, Date.now()));
      return id;
    },
    [selectedModel],
  );

  const addActivity = useCallback((sessionId: number, event: AiActivityEventDraft) => {
    const activityEvent = {
      ...event,
      id: ++nextActivityEventIdRef.current,
      at: Date.now(),
    };
    setActivity((current) =>
      current?.id === sessionId ? appendAiActivityEvent(current, activityEvent) : current,
    );
  }, []);

  const endActivity = useCallback(
    (sessionId: number, status: Exclude<AiActivityStatus, 'running'>) => {
      setActivity((current) =>
        current?.id === sessionId ? finishAiActivitySession(current, status, Date.now()) : current,
      );
    },
    [],
  );

  // ── OpenRouter client factory ──────────────────────────────────
  const getClient = useCallback((): OpenRouter | null => {
    if (!apiKey) return null;
    return new OpenRouter({
      apiKey,
      appTitle: 'NeedleScript Playground',
      httpReferer: 'https://needlescript.app',
    });
  }, [apiKey]);

  // ── Fetch model list whenever the API key changes ──────────────
  useEffect(() => {
    if (!apiKey) return;
    const client = new OpenRouter({ apiKey });
    client.models
      .list()
      .then((res) => {
        const models: AIModelInfo[] = [];
        for (const model of res.data ?? ([] as Model[])) {
          if (!model.id || !model.name) continue;
          models.push({
            id: model.id,
            name: model.name,
            supportsImageInput: model.architecture.inputModalities.includes('image'),
          });
        }
        models.sort((a, b) => a.name.localeCompare(b.name));
        setAiModels(models);
      })
      .catch(() => {
        // Non-fatal — model list might be unavailable but generation still works
      });
  }, [apiKey]);

  // ── Command: help ──────────────────────────────────────────────
  const showHelp = useCallback(() => {
    AI_HELP_TEXT.split('\n').forEach((line) => addMsg(line, 'info'));
  }, [addMsg]);

  // ── Command: apikey ────────────────────────────────────────────
  const setApiKey = useCallback(
    (key: string) => {
      const trimmed = key.trim();
      if (!trimmed) {
        addMsg('usage: /ai apikey sk-or-v1-…', 'err');
        return;
      }
      localStorage.setItem(NS_AI_APIKEY_KEY, trimmed);
      setApiKeyState(trimmed);
      addMsg('API key saved.', 'ok');
    },
    [addMsg],
  );

  // ── Command: model ─────────────────────────────────────────────
  const selectModel = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) {
        const current = selectedModel;
        addMsg(`current model: ${current}`, 'info');
        addMsg(`type "/ai model <name>" to change — suggestions appear as you type`, 'info');
        return;
      }

      let found: AIModelInfo | null = null;

      if (aiModels.length > 0) {
        // 1. Exact ID match
        found = aiModels.find((m) => m.id.toLowerCase() === q) ?? null;
        // 2. Partial ID contains
        if (!found) found = aiModels.find((m) => m.id.toLowerCase().includes(q)) ?? null;
        // 3. Display name contains
        if (!found) found = aiModels.find((m) => m.name.toLowerCase().includes(q)) ?? null;
        // 4. All words match somewhere in id or name
        if (!found) {
          const words = q.split(/\s+/);
          found =
            aiModels.find((m) =>
              words.every(
                (w) => m.id.toLowerCase().includes(w) || m.name.toLowerCase().includes(w),
              ),
            ) ?? null;
        }
      }

      const modelId = found ? found.id : q;
      const modelLabel = found ? `${found.id} (${found.name})` : modelId;

      localStorage.setItem(NS_AI_MODEL_KEY, modelId);
      setSelectedModelState(modelId);
      addMsg(`model → ${modelLabel}`, 'ok');
    },
    [aiModels, addMsg, selectedModel],
  );

  // ── Command: reset ─────────────────────────────────────────────
  const resetSettings = useCallback(() => {
    localStorage.removeItem(NS_AI_APIKEY_KEY);
    localStorage.removeItem(NS_AI_MODEL_KEY);
    setApiKeyState('');
    setSelectedModelState(DEFAULT_MODEL);
    setAiModels([]);
    addMsg('AI settings cleared.', 'ok');
  }, [addMsg]);

  // ── Command: credits ───────────────────────────────────────────
  const showCredits = useCallback(async () => {
    const client = getClient();
    if (!client) {
      addMsg('set your OpenRouter API key first: /ai apikey sk-or-…', 'err');
      return;
    }
    try {
      const res = await client.credits.getCredits();
      const { totalCredits, totalUsage } = res.data;
      const remaining = totalCredits - totalUsage;
      addMsg(
        `credits: $${remaining.toFixed(4)} remaining` +
          `  (purchased $${totalCredits.toFixed(4)} · used $${totalUsage.toFixed(4)})`,
        'ok',
      );
    } catch (err) {
      addMsg(`credits error: ${err instanceof Error ? err.message : String(err)}`, 'err');
    }
  }, [getClient, addMsg]);

  // ── Command: explain ───────────────────────────────────────────
  const explainCode = useCallback(
    async (question: string) => {
      if (isGeneratingRef.current) {
        addMsg('already generating — please wait', 'warn');
        return;
      }
      const effectiveQuestion = question || 'explain this code';
      const sessionId = beginActivity('explain', effectiveQuestion);
      const client = getClient();
      if (!client) {
        addMsg('set your OpenRouter API key first: /ai apikey sk-or-…', 'err');
        addActivity(sessionId, {
          phase: 'error',
          tone: 'error',
          title: 'Request blocked',
          summary: 'No OpenRouter API key is configured.',
        });
        endActivity(sessionId, 'failed');
        return;
      }
      isGeneratingRef.current = true;
      setIsGenerating(true);
      try {
        const source = sourceRef.current;
        const supportsImageInput =
          aiModels.find(({ id }) => id === selectedModel)?.supportsImageInput ?? false;
        let spatial: AiSpatialContext | undefined;
        if (source.trim()) {
          const current = await compile(source);
          if (current?.ok) {
            spatial = await buildCompiledSpatialContext(current, supportsImageInput, []);
            addActivity(sessionId, {
              phase: 'spatial',
              tone: 'success',
              title: 'Compiled spatial context prepared',
              summary: spatial.imageDataUrl
                ? 'Exact geometry summary · rendered preview attached'
                : 'Exact geometry summary · text-only model context',
            });
          }
        }
        const messages = buildMessages('explain', effectiveQuestion, source, undefined, spatial);

        addMsg(`asking ${selectedModel}…`, 'info');
        addActivity(sessionId, {
          phase: 'request',
          tone: 'progress',
          title: 'Explanation requested',
          summary: `${selectedModel} · ${source.split(/\r?\n/).length} source line(s)`,
        });
        const result = await client.chat.send({
          chatRequest: {
            model: selectedModel,
            messages: toSdkMessages(messages),
          },
        });
        const raw = result.choices[0]?.message?.content;
        const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        addActivity(sessionId, {
          phase: 'response',
          tone: 'success',
          title: 'Explanation received',
          summary: `${result.model} · ${text.length.toLocaleString()} character(s)`,
          usage: toActivityUsage(result.usage),
        });
        text.split('\n').forEach((line) => addMsg(line, 'print'));
        endActivity(sessionId, 'completed');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addMsg(`AI error: ${message}`, 'err');
        addActivity(sessionId, {
          phase: 'error',
          tone: 'error',
          title: 'Explanation failed',
          summary: message,
        });
        endActivity(sessionId, 'failed');
      } finally {
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    },
    [
      beginActivity,
      getClient,
      sourceRef,
      selectedModel,
      aiModels,
      compile,
      addMsg,
      addActivity,
      endActivity,
    ],
  );

  // ── Command: create / improve / fix / default ──────────────────
  const generateCode = useCallback(
    async (instruction: string, type: AiCommandType) => {
      if (isGeneratingRef.current) {
        addMsg('already generating — please wait', 'warn');
        return;
      }
      const effectiveInstruction = instruction || `${type} the current design`;
      const sessionId = beginActivity(type, effectiveInstruction);
      const client = getClient();
      if (!client) {
        addMsg('set your OpenRouter API key first: /ai apikey sk-or-…', 'err');
        addActivity(sessionId, {
          phase: 'error',
          tone: 'error',
          title: 'Generation blocked',
          summary: 'No OpenRouter API key is configured.',
        });
        endActivity(sessionId, 'failed');
        return;
      }

      isGeneratingRef.current = true;
      setIsGenerating(true);

      try {
        const source = sourceRef.current;
        const lastError = type === 'fix' ? (getLastError() ?? undefined) : undefined;
        const supportsImageInput =
          aiModels.find(({ id }) => id === selectedModel)?.supportsImageInput ?? false;
        let initialSpatial: AiSpatialContext | undefined;
        if (source.trim() && type !== 'create') {
          addActivity(sessionId, {
            phase: 'spatial',
            tone: 'progress',
            title: 'Reading the current compiled design',
          });
          const current = await compile(source);
          if (current?.ok) {
            initialSpatial = await buildCompiledSpatialContext(current, supportsImageInput, []);
            addActivity(sessionId, {
              phase: 'spatial',
              tone: 'success',
              title: 'Current spatial context prepared',
              summary: initialSpatial.imageDataUrl
                ? 'Exact geometry summary · rendered preview attached'
                : 'Exact geometry summary · text-only model context',
            });
          } else {
            addActivity(sessionId, {
              phase: 'spatial',
              tone: 'warning',
              title: 'Current preview unavailable',
              summary: current === null ? 'Compilation was superseded.' : current.message,
            });
          }
        }
        let messages = buildMessages(type, instruction, source, lastError, initialSpatial);

        addMsg(`generating with ${selectedModel}…`, 'info');
        addActivity(sessionId, {
          phase: 'request',
          tone: 'neutral',
          title: 'Generation prepared',
          summary: `${selectedModel} · ${source.trim() ? `${source.split(/\r?\n/).length} source line(s)` : 'new design'}`,
          detail: lastError ? `The latest compile error is included:\n${lastError}` : undefined,
        });

        let bestSuccessful: SuccessfulAiCandidate | null = null;
        let lastCode = '';
        let revisionReason = 'original instruction';
        let spatialReviewUsed = false;

        for (let attempt = 0; attempt <= MAX_AI_REVISIONS; attempt++) {
          addActivity(sessionId, {
            phase: 'request',
            tone: 'progress',
            title: `Requesting candidate ${attempt + 1}`,
            summary: revisionReason,
          });
          const result = await client.chat.send({
            chatRequest: {
              model: selectedModel,
              messages: toSdkMessages(messages),
            },
          });
          const rawContent = result.choices[0]?.message?.content;
          const rawText = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
          const code = extractCode(rawText);
          lastCode = code;
          const lineCount = code ? code.split(/\r?\n/).length : 0;
          addActivity(sessionId, {
            phase: 'response',
            tone: 'neutral',
            title: `Candidate ${attempt + 1} received`,
            summary: `${result.model} · ${lineCount} line(s) · ${code.length.toLocaleString()} character(s)`,
            usage: toActivityUsage(result.usage),
          });

          addMsg(attempt === 0 ? 'checking…' : `checking revision ${attempt}…`, 'info');
          addActivity(sessionId, {
            phase: 'compile',
            tone: 'progress',
            title: `Compiling candidate ${attempt + 1}`,
          });
          const check = await compile(code);
          if (check === null) {
            addMsg('AI review cancelled because a newer compile started', 'warn');
            addActivity(sessionId, {
              phase: 'error',
              tone: 'warning',
              title: 'Review cancelled',
              summary: 'A newer foreground compile superseded this candidate.',
            });
            endActivity(sessionId, 'cancelled');
            return;
          }

          if (!check.ok) {
            addActivity(sessionId, {
              phase: 'compile',
              tone: 'error',
              title: `Candidate ${attempt + 1} failed to compile`,
              summary:
                check.slLine === undefined
                  ? check.message
                  : `Line ${check.slLine}: ${check.message.replace(/\s*\(line\s+\d+\)\s*$/i, '')}`,
              detail:
                check.slLine === undefined ? undefined : code.split(/\r?\n/)[check.slLine - 1],
            });
            if (attempt < MAX_AI_REVISIONS) {
              addMsg(
                `compile error — refining (${attempt + 1}/${MAX_AI_REVISIONS}): ${check.message}`,
                'warn',
              );
              messages = buildRetryMessages(messages, code, check.message, check.slLine);
              revisionReason = `compiler feedback${check.slLine === undefined ? '' : ` for line ${check.slLine}`}`;
              continue;
            }
            addMsg(
              bestSuccessful
                ? 'AI revisions still do not compile; using the best compiled revision'
                : 'AI revisions still do not compile; keeping the last revision for manual repair',
              'warn',
            );
            break;
          }

          const feedback = buildPhysicsFeedback(check.result.physics, code);
          const errorCount = feedback?.counts.error ?? 0;
          const warningCount = feedback?.counts.warning ?? 0;
          addActivity(sessionId, {
            phase: 'compile',
            tone: 'success',
            title: `Candidate ${attempt + 1} compiled`,
            summary: `${check.stats.stitches.toLocaleString()} stitch(es) · ${check.result.physics?.diagnostics.length ?? 0} physics finding(s)`,
          });
          const candidate: SuccessfulAiCandidate = {
            code,
            errors: errorCount,
            warnings: warningCount,
            attempt: attempt + 1,
          };
          if (isBetterCandidate(candidate, bestSuccessful)) {
            bestSuccessful = candidate;
            addActivity(sessionId, {
              phase: 'decision',
              tone: 'neutral',
              title: `Candidate ${attempt + 1} is the best compiled revision`,
              summary: `${errorCount} blocker(s) · ${warningCount} risk(s)`,
            });
          }

          const canRevise = attempt < MAX_AI_REVISIONS;
          const needsSpatialFeedback = canRevise && (feedback !== null || !spatialReviewUsed);
          const spatial = needsSpatialFeedback
            ? await buildCompiledSpatialContext(
                check,
                supportsImageInput,
                feedback?.diagnostics ?? [],
              )
            : undefined;
          if (spatial) {
            addActivity(sessionId, {
              phase: 'spatial',
              tone: 'success',
              title: `Spatial review of candidate ${attempt + 1} prepared`,
              summary: spatial.imageDataUrl
                ? 'Exact geometry summary · annotated preview attached'
                : 'Exact geometry summary · text-only model context',
              detail: spatial.content,
            });
          }

          if (!feedback) {
            addMsg('physics review found no modeled blockers or risks', 'ok');
            addActivity(sessionId, {
              phase: 'physics',
              tone: 'success',
              title: 'Physics review has no actionable findings',
              summary: `${check.result.physics?.summary.info ?? 0} informational note(s) remain for human review.`,
            });
            if (spatial && !spatialReviewUsed) {
              spatialReviewUsed = true;
              addMsg(
                `reviewing compiled composition (${attempt + 1}/${MAX_AI_REVISIONS})…`,
                'info',
              );
              messages = buildSpatialReviewMessages(messages, code, spatial);
              revisionReason = `compiled spatial review of candidate ${attempt + 1}`;
              continue;
            }
            break;
          }
          addActivity(sessionId, {
            phase: 'physics',
            tone: errorCount > 0 ? 'error' : 'warning',
            title: `Physics review of candidate ${attempt + 1}`,
            summary: `${errorCount} blocker(s) · ${warningCount} risk(s)`,
            detail: feedback.content,
          });
          if (!canRevise) {
            addMsg(
              `physics review finished with ${errorCount} blocker(s) and ${warningCount} risk(s); review them before sewing`,
              'warn',
            );
            break;
          }

          addMsg(
            `physics review — ${errorCount} blocker(s), ${warningCount} risk(s); refining (${attempt + 1}/${MAX_AI_REVISIONS})…`,
            'warn',
          );
          messages = buildPhysicsRetryMessages(messages, code, feedback, spatial);
          revisionReason = `structured physics and spatial feedback from candidate ${attempt + 1}`;
        }

        const code = bestSuccessful?.code ?? lastCode;
        if (!code) throw new Error('The model returned no NeedleScript code');
        addActivity(sessionId, {
          phase: 'decision',
          tone: bestSuccessful ? 'success' : 'warning',
          title: bestSuccessful
            ? `Applying candidate ${bestSuccessful.attempt}`
            : 'Applying the uncompiled final candidate for manual repair',
          summary: bestSuccessful
            ? `${bestSuccessful.errors} blocker(s) · ${bestSuccessful.warnings} risk(s)`
            : undefined,
        });
        setSource(code);
        await runProgram(code, 'ai');
        addActivity(sessionId, {
          phase: 'complete',
          tone: bestSuccessful ? 'success' : 'warning',
          title: bestSuccessful
            ? 'Editor updated and design run completed'
            : 'Editor updated; manual repair is still required',
        });
        endActivity(sessionId, 'completed');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addMsg(`AI error: ${message}`, 'err');
        addActivity(sessionId, {
          phase: 'error',
          tone: 'error',
          title: 'AI generation failed',
          summary: message,
        });
        endActivity(sessionId, 'failed');
      } finally {
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    },
    [
      beginActivity,
      getClient,
      sourceRef,
      selectedModel,
      aiModels,
      compile,
      setSource,
      runProgram,
      addMsg,
      getLastError,
      addActivity,
      endActivity,
    ],
  );

  // ── Main command dispatcher ────────────────────────────────────
  const handleAiCommand = useCallback(
    async (input: string): Promise<void> => {
      const trimmed = input.trim();
      if (!trimmed) {
        showHelp();
        return;
      }

      const spaceIdx = trimmed.indexOf(' ');
      const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
      const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

      switch (cmd) {
        case 'help':
          showHelp();
          break;
        case 'apikey':
          setApiKey(args);
          break;
        case 'model':
          await selectModel(args);
          break;
        case 'reset':
          resetSettings();
          break;
        case 'credits':
          await showCredits();
          break;
        case 'explain':
          await explainCode(args || 'explain this code');
          break;
        case 'create':
          await generateCode(args, 'create');
          break;
        case 'improve':
          await generateCode(args, 'improve');
          break;
        case 'fix':
          await generateCode(args, 'fix');
          break;
        default:
          // Bare instruction: treat as create if no source, improve if there is
          await generateCode(trimmed, 'default');
          break;
      }
    },
    [showHelp, setApiKey, selectModel, resetSettings, showCredits, explainCode, generateCode],
  );

  return {
    handleAiCommand,
    aiModels,
    selectedModel,
    hasApiKey: apiKey.length > 0,
    isGenerating,
    activity,
  };
}
