import type { AiProvider } from './provider.ts';
import type {
  AiChatThread,
  AiProviderMessage,
  AiQuestionSet,
  AiToolCall,
  AiToolDisplay,
} from './chat-types.ts';
import type { ToolExecution } from './tool-runtime.ts';
import { MAX_MODEL_STEPS_PER_TURN, MAX_TOOL_CALLS_PER_TURN } from './chat-limits.ts';
import { AI_FORCE_FINAL_FALLBACK, AI_FORCE_FINAL_PROMPT } from './prompt-templates.ts';

export interface AgentLoopOptions {
  provider: AiProvider;
  model: string;
  signal: AbortSignal;
  getThread: () => AiChatThread;
  messages: () => AiProviderMessage[];
  executeTool: (name: string, rawArguments: string) => Promise<ToolExecution>;
  appendAssistant: (
    message: Extract<AiProviderMessage, { role: 'assistant' }>,
    model: string,
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number },
  ) => void;
  appendToolResult: (call: AiToolCall, content: string, display: AiToolDisplay) => void;
  awaitQuestions: (call: AiToolCall, questions: AiQuestionSet) => void;
  finish: () => void;
  fail: (message: string) => void;
  tools: import('./provider.ts').AiProviderTool[];
}

/**
 * Drive one active turn until the model answers, asks the user a question, or is cancelled.
 *
 * State mutations are delegated to callbacks so this loop remains provider- and UI-agnostic. A
 * model response containing tool calls is persisted before those tools run, preserving a valid
 * provider transcript if execution pauses. Once a turn reaches either work budget, tools are
 * removed and the model receives one final, answer-only request.
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<void> {
  try {
    while (!options.signal.aborted) {
      const turn = options.getThread().turns.at(-1);
      if (!turn) throw new Error('No active chat turn.');
      const forceFinal =
        turn.modelSteps >= MAX_MODEL_STEPS_PER_TURN || turn.toolCalls >= MAX_TOOL_CALLS_PER_TURN;
      const toolsAllowed = !forceFinal;
      const request = {
        model: options.model,
        messages: forceFinal
          ? [
              ...options.messages(),
              {
                role: 'system' as const,
                content: AI_FORCE_FINAL_PROMPT,
              },
            ]
          : options.messages(),
        ...(toolsAllowed ? { tools: options.tools } : {}),
        signal: options.signal,
      };
      let response;
      try {
        response = await options.provider.complete(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/\b(429|5\d\d|network|fetch|temporar|timeout)\b/i.test(message)) throw error;
        // Retry only transient transport/provider failures, once. Abort remains responsive during
        // the short backoff and all other errors retain their original stack and message.
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 500);
          options.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new DOMException('AI request cancelled', 'AbortError'));
            },
            { once: true },
          );
        });
        response = await options.provider.complete(request);
      }
      if (options.signal.aborted) return;
      const assistantMessage = forceFinal
        ? {
            role: 'assistant' as const,
            content: response.message.content ?? AI_FORCE_FINAL_FALLBACK,
          }
        : response.message;
      options.appendAssistant(assistantMessage, response.model, response.usage);
      if (forceFinal) {
        options.finish();
        return;
      }
      const calls = assistantMessage.toolCalls ?? [];
      if (!calls.length) {
        options.finish();
        return;
      }
      for (const call of calls) {
        if (options.signal.aborted) return;
        const current = options.getThread().turns.at(-1);
        if ((current?.toolCalls ?? 0) >= MAX_TOOL_CALLS_PER_TURN) {
          options.appendToolResult(
            call,
            JSON.stringify({
              ok: false,
              tool: call.function.name,
              error: {
                code: 'tool_budget',
                message: 'The tool-call budget is exhausted.',
                retryable: false,
              },
            }),
            {
              title: call.function.name.replaceAll('_', ' '),
              summary: 'Tool-call budget exhausted',
              status: 'error',
            },
          );
          continue;
        }
        const execution = await options.executeTool(call.function.name, call.function.arguments);
        if (execution.pause) {
          options.awaitQuestions(call, execution.pause);
          return;
        }
        options.appendToolResult(
          call,
          execution.content ??
            JSON.stringify({
              ok: false,
              tool: call.function.name,
              error: {
                code: 'empty_result',
                message: 'Tool returned no result.',
                retryable: false,
              },
            }),
          execution.display ?? {
            title: call.function.name.replaceAll('_', ' '),
            summary: 'No display summary',
            status: 'warning',
          },
        );
      }
    }
  } catch (error) {
    if (options.signal.aborted) return;
    options.fail(error instanceof Error ? error.message : String(error));
  }
}
