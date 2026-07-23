import type { AiChatThread, AiProviderMessage } from './chat-types.ts';
import { AI_CHAT_SYSTEM_PROMPT, omittedTurnsPrompt } from './prompt-templates.ts';

export { AI_CHAT_SYSTEM_PROMPT } from './prompt-templates.ts';

const contentLength = (message: AiProviderMessage): number => message.content?.length ?? 0;

/**
 * Assemble provider history without splitting a user/assistant/tool exchange.
 *
 * Context is trimmed in whole-turn bundles from oldest to newest. Keeping each assistant tool call
 * adjacent to its result is required by chat-completion providers and also prevents a later turn
 * from seeing an unexplained tool payload. The system prompt and current workspace snapshot are
 * always retained.
 */
export function buildProviderMessages(
  thread: AiChatThread,
  workspaceSnapshot: string,
): AiProviderMessage[] {
  const messages: AiProviderMessage[] = [
    { role: 'system', content: AI_CHAT_SYSTEM_PROMPT },
    { role: 'system', content: workspaceSnapshot },
  ];
  const bundles = thread.turns.map((turn): AiProviderMessage[] => {
    const bundle: AiProviderMessage[] = [turn.user];
    for (const step of turn.steps) {
      if (step.kind === 'assistant' || step.kind === 'tool-result') bundle.push(step.message);
    }
    return bundle;
  });
  const retained: AiProviderMessage[][] = [];
  let characters = messages.reduce((total, message) => total + contentLength(message), 0);
  for (const bundle of bundles.toReversed()) {
    const bundleCharacters = bundle.reduce((total, message) => total + contentLength(message), 0);
    if (retained.length > 0 && characters + bundleCharacters > 120_000) break;
    retained.push(bundle);
    characters += bundleCharacters;
  }
  if (retained.length < bundles.length) {
    messages.push({
      role: 'system',
      content: omittedTurnsPrompt(bundles.length - retained.length),
    });
  }
  messages.push(...retained.toReversed().flat());
  return messages;
}
