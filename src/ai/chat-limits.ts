/**
 * Per-turn safety budgets.
 *
 * Model and tool ceilings trigger the tools-disabled finalization prompt; compile calls have their
 * own lower ceiling because they are the expensive operation. The timeout is enforced by the chat
 * owner rather than the provider adapter so cancellation covers tool execution as well.
 */
export const MAX_MODEL_STEPS_PER_TURN = 64;
export const MAX_TOOL_CALLS_PER_TURN = 96;
export const MAX_COMPILES_PER_TURN = 12;
export const ACTIVE_TURN_TIMEOUT_MS = 5 * 60_000;
