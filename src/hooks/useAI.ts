import { useState, useRef, useCallback, useEffect } from 'react';
import { OpenRouter } from '@openrouter/sdk';
import type { ChatMessages } from '@openrouter/sdk/models';
import type { Model } from '@openrouter/sdk/models';
import type { ConsoleMessage } from '../App.tsx';
import type { CompileResponse } from '../compiler.worker.types.ts';
import {
  buildMessages,
  buildRetryMessages,
  extractCode,
  AI_HELP_TEXT,
  type AiCommandType,
  type ChatMessage,
} from '../lib/ai-prompt.ts';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const NS_AI_APIKEY_KEY = 'ns-ai-apikey';
const NS_AI_MODEL_KEY = 'ns-ai-model';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIModelInfo {
  id: string;
  name: string;
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

export interface UseAIReturn {
  handleAiCommand: (input: string) => Promise<void>;
  aiModels: AIModelInfo[];
  selectedModel: string;
  hasApiKey: boolean;
  isGenerating: boolean;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Cast our simple message objects to the SDK's discriminated union.
 * The runtime shapes are identical; the cast is purely to satisfy TypeScript.
 */
function toSdkMessages(messages: ChatMessage[]): ChatMessages[] {
  return messages as unknown as ChatMessages[];
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

  // Guard against concurrent generations
  const isGeneratingRef = useRef(false);

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
        const models = (res.data ?? ([] as Model[]))
          .filter((m: Model) => m.id && m.name)
          .map((m: Model) => ({ id: m.id, name: m.name }))
          .sort((a: AIModelInfo, b: AIModelInfo) => a.name.localeCompare(b.name));
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
    [aiModels, addMsg],
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
      const client = getClient();
      if (!client) {
        addMsg('set your OpenRouter API key first: /ai apikey sk-or-…', 'err');
        return;
      }
      const source = sourceRef.current;
      const messages = buildMessages('explain', question || 'explain this code', source);

      addMsg(`asking ${selectedModel}…`, 'info');
      try {
        const result = await client.chat.send({
          chatRequest: {
            model: selectedModel,
            messages: toSdkMessages(messages),
          },
        });
        const raw = result.choices[0]?.message?.content;
        const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        text.split('\n').forEach((line) => addMsg(line, 'print'));
      } catch (err) {
        addMsg(`AI error: ${err instanceof Error ? err.message : String(err)}`, 'err');
      }
    },
    [getClient, sourceRef, selectedModel, addMsg],
  );

  // ── Command: create / improve / fix / default ──────────────────
  const generateCode = useCallback(
    async (instruction: string, type: AiCommandType) => {
      if (isGeneratingRef.current) {
        addMsg('already generating — please wait', 'warn');
        return;
      }
      const client = getClient();
      if (!client) {
        addMsg('set your OpenRouter API key first: /ai apikey sk-or-…', 'err');
        return;
      }

      isGeneratingRef.current = true;
      setIsGenerating(true);

      const source = sourceRef.current;
      const lastError = type === 'fix' ? (getLastError() ?? undefined) : undefined;
      const messages = buildMessages(type, instruction, source, lastError);

      addMsg(`generating with ${selectedModel}…`, 'info');

      try {
        // ── First generation attempt ──
        const result = await client.chat.send({
          chatRequest: {
            model: selectedModel,
            messages: toSdkMessages(messages),
          },
        });

        const rawContent = result.choices[0]?.message?.content;
        const rawText = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        let code = extractCode(rawText);

        // ── Silent compile check ──
        addMsg('checking…', 'info');
        const check = await compile(code);

        if (check !== null && !check.ok) {
          // ── Auto-retry with error context ──
          addMsg(`compile error — retrying: ${check.message}`, 'warn');
          const retryMessages = buildRetryMessages(messages, code, check.message);

          const retryResult = await client.chat.send({
            chatRequest: {
              model: selectedModel,
              messages: toSdkMessages(retryMessages),
            },
          });

          const retryRaw = retryResult.choices[0]?.message?.content;
          const retryText = typeof retryRaw === 'string' ? retryRaw : JSON.stringify(retryRaw);
          code = extractCode(retryText);

          const recheck = await compile(code);
          if (recheck !== null && !recheck.ok) {
            addMsg('retry failed — applying code anyway; fix manually or try again', 'warn');
          }
        }

        // ── Apply and run the final code ──
        setSource(code);
        await runProgram(code, 'ai');
      } catch (err) {
        addMsg(`AI error: ${err instanceof Error ? err.message : String(err)}`, 'err');
      } finally {
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    },
    [getClient, sourceRef, selectedModel, compile, setSource, runProgram, addMsg, getLastError],
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
  };
}
