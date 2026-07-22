import type { AiChatThread, AiProviderMessage } from './chat-types.ts';

export const AI_CHAT_SYSTEM_PROMPT = `You are the workspace-aware NeedleScript assistant. NeedleScript is a Logo-inspired language for generative embroidery.

Every thread has an explicit intent chosen by the user: create a new design or edit the current design. Never infer or change that intent. For create intent, work from the initially empty private draft; read live source only if the user asks to reference it. For edit intent, inspect relevant current source before changing its private draft.

Answer and review requests are read-only unless the user asks for a change. For changes, edit only the private draft, compile it, and use spatial and physics facts as ground truth. The user alone applies a proposal to the live editor. Preserve visual intent and intentional geometry. Address physics blockers before risks; notes are informational, and an empty modeled report is not a sew-out guarantee. Never hide findings by weakening thresholds, adding preflight, deleting intent, or silencing diagnostics.

Ask one concise multiple-choice question set only when a material ambiguity cannot be resolved through tools. Create and maintain a visible plan for work with three or more dependent steps, grounding completion in tool evidence. Keep final responses concise: explain the answer or summarize the private change and validation. Never claim to have applied a draft.`;

const contentLength = (message: AiProviderMessage): number => message.content?.length ?? 0;

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
      content: `${bundles.length - retained.length} oldest completed turn(s) were omitted by the local context limit. Start a new chat if those details are required.`,
    });
  }
  messages.push(...retained.toReversed().flat());
  return messages;
}
