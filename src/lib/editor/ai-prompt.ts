/**
 * Builds the AI system prompt and message arrays for NeedleScript AI generation.
 * Exported functions are browser-safe (no DOM, no Node APIs).
 */

import rawSystemPrompt from '../../../docs/ai-system-prompt.md?raw';

export type AiCommandType = 'create' | 'improve' | 'fix' | 'explain' | 'default';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── System prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = rawSystemPrompt;

// ─── Message builders ─────────────────────────────────────────────────────────

/**
 * Extracts plain NeedleScript code from an AI response, stripping markdown fences.
 */
export function extractCode(response: string): string {
  // Try to find a fenced code block
  const fenced = response.match(/```(?:needlescript|ns|text)?\s*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  // If the whole response looks like plain code (no markdown formatting), return as-is
  // Heuristic: if it doesn't start with typical prose words, treat as code
  const trimmed = response.trim();
  if (
    !trimmed.startsWith('#') &&
    !trimmed.match(/^(here|this|the|i |sure|let me|of course|certainly)/i)
  ) {
    return trimmed;
  }
  // Fall back: strip any ``` fences and return
  return trimmed
    .replace(/^```\w*\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
}

/**
 * Builds the chat messages array for a given command type.
 * The returned messages include the system prompt plus the user request.
 */
export function buildMessages(
  type: AiCommandType,
  instruction: string,
  source?: string,
  lastError?: string,
): ChatMessage[] {
  const system: ChatMessage = { role: 'system', content: SYSTEM_PROMPT };

  const hasSource = source && source.trim().length > 0;
  const codeCtx = hasSource
    ? `\n\nCurrent NeedleScript code:\n\`\`\`\n${source.trim()}\n\`\`\``
    : '';

  const errorCtx = lastError ? `\n\nLast compile error:\n${lastError}` : '';

  const outputInstruction =
    'Return ONLY the complete NeedleScript code. No markdown, no explanation, no code fences. Just the raw code.';

  let userContent: string;

  switch (type) {
    case 'create':
      userContent = `Create a NeedleScript generative embroidery design: ${instruction}\n\n${outputInstruction}`;
      break;

    case 'improve':
      userContent = `Improve the following NeedleScript code: ${instruction}${codeCtx}\n\n${outputInstruction}`;
      break;

    case 'fix':
      userContent = `Fix the following NeedleScript code: ${instruction}${codeCtx}${errorCtx}\n\n${outputInstruction}`;
      break;

    case 'explain':
      userContent = `Explain the following NeedleScript code: ${instruction}${codeCtx}\n\nAnswer concisely in plain text. Do not produce code unless it directly illustrates your answer.`;
      break;

    case 'default':
    default:
      if (hasSource) {
        // Has existing code — treat as an improvement/modification
        userContent = `Modify the NeedleScript code as follows: ${instruction}${codeCtx}\n\n${outputInstruction}`;
      } else {
        // No code yet — treat as a create
        userContent = `Create a NeedleScript generative embroidery design: ${instruction}\n\n${outputInstruction}`;
      }
      break;
  }

  return [system, { role: 'user', content: userContent }];
}

/**
 * Builds a retry message array when generated code fails to compile.
 * Appends an assistant turn (the bad code) plus a user follow-up asking to fix it.
 */
export function buildRetryMessages(
  originalMessages: ChatMessage[],
  badCode: string,
  compileError: string,
): ChatMessage[] {
  return [
    ...originalMessages,
    { role: 'assistant', content: badCode },
    {
      role: 'user',
      content: `The code you generated has a compile error:\n${compileError}\n\nPlease fix it and return ONLY the corrected NeedleScript code. No markdown, no explanation.`,
    },
  ];
}

/** Help text shown for /ai help */
export const AI_HELP_TEXT = `AI commands (prefix: /ai):
  apikey <key>       — set your OpenRouter API key (stored in browser)
  model <fuzzy>      — select model (e.g. "claude sonnet 4.5" or "gpt-4o")
  credits            — show remaining OpenRouter credit balance
  reset              — clear API key and model selection
  help               — show this message
  create <desc>      — generate new code from description
  improve <desc>     — improve current code
  fix <desc>         — fix current code (includes last error)
  explain <question> — explain the current code or a specific line
  <anything>         — shorthand for create/improve depending on context
  
Tip: Start typing "/ai model " to see model suggestions.`;
