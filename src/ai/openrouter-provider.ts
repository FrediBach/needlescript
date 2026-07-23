import { OpenRouter } from '@openrouter/sdk';
import type { ChatMessages } from '@openrouter/sdk/models';
import type { AiProvider, AiProviderRequest, AiProviderResponse } from './provider.ts';

/**
 * Thin OpenRouter adapter for the provider-neutral AI contract.
 *
 * Tool calls stay sequential because the local runtime mutates a revisioned draft and visible plan;
 * parallel calls could otherwise race on expected revisions. Response normalization deliberately
 * exposes only fields consumed by the rest of the application.
 */
export class OpenRouterAiProvider implements AiProvider {
  readonly client: OpenRouter;

  constructor(apiKey: string) {
    this.client = new OpenRouter({
      apiKey,
      appTitle: 'NeedleScript Playground',
      httpReferer: 'https://needlescript.app',
    });
  }

  async complete(request: AiProviderRequest): Promise<AiProviderResponse> {
    const result = await this.client.chat.send(
      {
        chatRequest: {
          model: request.model,
          messages: request.messages as unknown as ChatMessages[],
          tools: request.tools,
          parallelToolCalls: false,
        },
      },
      request.signal ? { signal: request.signal } : undefined,
    );
    const message = result.choices[0]?.message;
    const content = typeof message?.content === 'string' ? message.content : null;
    return {
      model: result.model,
      message: {
        role: 'assistant',
        content,
        ...(message?.toolCalls ? { toolCalls: message.toolCalls } : {}),
      },
      ...(result.usage
        ? {
            usage: {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
              ...(result.usage.cost == null ? {} : { cost: result.usage.cost }),
            },
          }
        : {}),
    };
  }
}
