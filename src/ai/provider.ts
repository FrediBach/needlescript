import type { AiActivityUsage } from '../ai-activity.ts';
import type { AiProviderMessage, AiToolCall } from './chat-types.ts';

/**
 * Minimal provider-neutral chat contract used by the agent loop.
 *
 * Keeping SDK-specific message and response shapes behind this interface lets orchestration,
 * storage, and tests remain independent of OpenRouter or any future transport.
 */
export interface AiProviderTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface AiProviderRequest {
  model: string;
  messages: AiProviderMessage[];
  tools?: AiProviderTool[];
  signal?: AbortSignal;
}

export interface AiProviderResponse {
  model: string;
  message: { role: 'assistant'; content: string | null; toolCalls?: AiToolCall[] };
  usage?: AiActivityUsage;
}

export interface AiProvider {
  complete(request: AiProviderRequest): Promise<AiProviderResponse>;
}
