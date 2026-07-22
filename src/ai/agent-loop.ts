import type { AiProvider } from './provider.ts';
import type {
  AiChatThread,
  AiProviderMessage,
  AiQuestionSet,
  AiToolCall,
  AiToolDisplay,
} from './chat-types.ts';
import type { ToolExecution } from './tool-runtime.ts';

export const MAX_MODEL_STEPS_PER_TURN = 16;
export const MAX_TOOL_CALLS_PER_TURN = 24;

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

export async function runAgentLoop(options: AgentLoopOptions): Promise<void> {
  try {
    while (!options.signal.aborted) {
      const turn = options.getThread().turns.at(-1);
      if (!turn) throw new Error('No active chat turn.');
      if (turn.modelSteps >= MAX_MODEL_STEPS_PER_TURN) {
        options.fail('The model-step limit was reached before a final response.');
        return;
      }
      const toolsAllowed = turn.toolCalls < MAX_TOOL_CALLS_PER_TURN;
      const request = {
        model: options.model,
        messages: options.messages(),
        ...(toolsAllowed ? { tools: options.tools } : {}),
        signal: options.signal,
      };
      let response;
      try {
        response = await options.provider.complete(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/\b(429|5\d\d|network|fetch|temporar|timeout)\b/i.test(message)) throw error;
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
      options.appendAssistant(response.message, response.model, response.usage);
      const calls = response.message.toolCalls ?? [];
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
