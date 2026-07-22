# `/ai chat` Implementation Plan

Status: **Proposed**

Last updated: 2026-07-22

## Executive decision

Add a persistent, workspace-aware chat mode under `/ai chat` without replacing the existing
one-shot `/ai create`, `/ai improve`, `/ai fix`, and `/ai explain` commands.

The chat model gets a bounded set of local NeedleScript tools. It can read the current source,
compile a private draft, inspect exact stitch-space measurements, inspect structured physics
findings, ask the user structured multiple-choice questions, maintain a visible multi-step plan, and
edit that private draft. It cannot silently overwrite the live editor. Code changes become a
reviewed proposal that the user can apply or discard; applying is one atomic, undoable Monaco edit.

```text
user message
    ↓
model response ──→ final explanation
    │
    └─ tool call → validate → run locally → append tool result → ask model again
                         │
                         ├─ ask user → pause → selected answer → resume
                         ├─ create/update visible checklist plan
                         ├─ read live source
                         ├─ compile/inspect private draft
                         ├─ inspect spatial or physics data
                         └─ edit private draft
                                      ↓
                         reviewed diff → Apply / Discard
```

Version 1 should continue using OpenRouter Chat Completions through the installed SDK. OpenRouter
normalizes tool calling across supported models, but the application—not the model or provider—must
execute each tool and return its result. Tool schemas must be sent on every tool-capable request, and
assistant tool calls plus matching tool results must remain in history. See the
[OpenRouter tool-calling guide](https://openrouter.ai/docs/guides/features/tool-calling) and
[API reference](https://openrouter.ai/docs/api_reference/overview).

Do not make a provider/API migration a prerequisite for this feature. Keep the orchestration behind
a provider adapter so a later Responses API implementation can reuse the same thread, tool, draft,
and UI contracts. This is especially important because multi-turn history remains an application
responsibility even in OpenRouter's current Responses API beta; its documentation requires the
complete conversation to be resubmitted
([conversation-history guidance](https://openrouter.ai/docs/api_reference/responses/basic-usage)).

## Goals

1. Let a user have a genuine multi-turn conversation about one NeedleScript workspace.
2. Let the model inspect current code and compiled facts instead of guessing from source alone.
3. Let the model make several private code revisions, compile them, and compare physics/spatial
   results before proposing a change.
4. Preserve conversation history across follow-up turns and, by default, browser reloads.
5. Keep every live source change visible, reversible, revision-safe, and user-approved.
6. Retain all current direct AI commands and their bounded compiler/physics review behavior.
7. Keep `src/lib/` platform-neutral and keep all model/network activity in the playground layer.
8. Bound latency, token use, compile work, tool loops, stored history, and returned geometry.
9. Let the model resolve material ambiguity with concise multiple-choice questions and resume the
   same tool-call turn from the selected answers.
10. Let the model create and maintain a visible multi-step checklist for complex work, updating each
    step as it progresses.

## Non-goals for version 1

- General filesystem, shell, browser, network, export, or arbitrary JavaScript tools.
- Automatic edits to the live editor during a chat turn.
- A server-side account, synced conversation service, or shared/team threads.
- Provider-managed conversation IDs as the source of truth.
- Autonomous background work after the user closes or cancels the turn.
- Exact fabric simulation or claims that a design is safe to sew.
- Automatic three-way merging when the user edits the live document under a pending proposal.
- Removing or changing the semantics of the existing direct AI commands.
- Sending full stitch-event arrays, raster data URLs, or API keys into persisted chat history.

## What exists today

The current implementation already contains most of the domain-specific foundations:

- [`src/hooks/useAI.ts`](../src/hooks/useAI.ts) owns OpenRouter settings, model discovery, the
  one-shot request lifecycle, compile retries, spatial review, and physics-driven revision.
- [`src/lib/editor/ai-prompt.ts`](../src/lib/editor/ai-prompt.ts) builds the compact NeedleScript
  system prompt, source-aware requests, compiler retries, and structured physics feedback.
- [`src/lib/editor/ai-spatial.ts`](../src/lib/editor/ai-spatial.ts) derives deterministic hoop-space
  bounds, color extents, a coarse stitched silhouette, and an annotated SVG preview.
- [`src/compiler.worker.ts`](../src/compiler.worker.ts) compiles with runtime budgets and full physics
  analysis off the UI thread.
- [`src/lib/core/types.ts`](../src/lib/core/types.ts) exposes structured physics diagnostics with
  source roles, geometry, measurements, evidence, remedies, construction IDs, and playback ranges.
- [`src/components/AIPanel.tsx`](../src/components/AIPanel.tsx) displays the latest one-shot activity
  timeline and token/cost usage.
- [`src/components/EditorPane.tsx`](../src/components/EditorPane.tsx) already has the AI bottom tab,
  `/ai` dispatch, model autocomplete, source selection context, and a Monaco editor reference.
- [`src/physics-analysis-state.ts`](../src/physics-analysis-state.ts) demonstrates revision-aware
  current/stale/blocked lifecycle handling that chat proposals should mirror.
- [`src/components/physics-remedies-model.ts`](../src/components/physics-remedies-model.ts) already
  implements narrow, source-positioned, preview-before-apply edits for deterministic quick fixes.

The important gaps are architectural rather than analytical:

- `useAI` is one large hook and stores only the latest activity session.
- Requests are single-purpose prompt/response exchanges; there is no durable conversation model.
- `AIModelInfo` tracks image input but not tool-call support or context length.
- There is no validated tool registry or bounded agent loop.
- There is no resumable human-input tool or `awaiting-user` turn state.
- There is no durable, model-maintained task plan whose status the UI can render independently from
  assistant prose.
- Source replacement uses React state directly rather than a Monaco edit transaction with an undo
  boundary.
- Spatial context is optimized for a one-shot prompt, not focused source-line or region queries.
- A foreground AI compile currently shares the app hook's compile generation, so unrelated
  foreground compilation can supersede it.
- The AI tab has an activity timeline but no thread list, chat transcript, composer, proposal diff,
  or stale-proposal state.

## Product contract

### Vocabulary

| Term             | Meaning                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Thread**       | A user-visible multi-turn conversation bound to one workspace identity.                                           |
| **Turn**         | One user message plus every model step, tool call/result, and final assistant message caused by it.               |
| **Live source**  | The exact text currently in Monaco. Tools may read it but never mutate it.                                        |
| **Draft**        | Conversation-local source derived from a specific live-source revision. Model edit tools mutate only this text.   |
| **Proposal**     | The diff between a draft and its base live source, ready for user review.                                         |
| **Apply**        | One user action that writes a current, non-conflicting proposal into Monaco as one undoable transaction.          |
| **Tool step**    | A model-requested local inspection or draft edit shown in the transcript in summarized form.                      |
| **Question set** | One model request containing one or more bounded multiple-choice questions whose answers resume the paused turn.  |
| **Work plan**    | A model-maintained ordered checklist for a complex task, with durable per-step status.                            |
| **Workspace**    | The currently loaded snippet/share/example/import/unsaved document identity, not merely the compiled design name. |

### Required behavior

- `/ai chat` opens the AI tab in Chat view and focuses its multiline composer.
- `/ai chat <message>` opens Chat view and submits `<message>` as a new turn.
- Subsequent messages are sent from the chat composer; the general REPL continues to accept normal
  NeedleScript and slash commands.
- `/ai new` creates a new empty thread for the current workspace after handling any pending proposal.
- `/ai chats` opens the local thread picker. `/ai clear` deletes only the active thread after a
  confirmation in the UI; `/ai reset` keeps its existing meaning of clearing AI settings.
- Chat remembers previous user and assistant messages, tool calls, tool results, decisions, and the
  active draft within the thread's context policy.
- A chat turn may answer without tools. It should inspect rather than guess whenever the answer
  depends on current source, compiled geometry, stitch statistics, or physics.
- When multiple plausible interpretations would materially change the design, source edit, plan, or
  validation target, the model asks one compact set of multiple-choice questions before committing
  to an interpretation. It should not ask about facts available through inspection tools or block on
  inconsequential preferences.
- A question set pauses the active turn. Selecting answers appends a matching tool result and resumes
  the same turn with its prior tool history and budgets intact.
- For work with three or more meaningful dependent steps, the model creates a visible work plan
  before implementation and keeps it current. Simple answers and single edits do not require a
  ceremonial plan.
- The plan shows pending, in-progress, and completed steps as empty, active, and checked boxes. The
  model advances it as work is performed; prose claims never change plan status implicitly.
- A draft remains active across follow-up turns. “Make that smaller” should refine the pending draft,
  not restart from the live document.
- Apply, Discard, and Rebase are explicit UI actions, never model-callable live mutations.
- Applying a proposal runs the program through the existing foreground path and updates Physics,
  stage, playback, parameters, diagnostics, and normal activity state.
- If live source changes after the draft's base revision, the proposal becomes **stale** immediately.
  Apply is disabled. Version 1 offers “Discard draft” and “Rebase conversation on current source”;
  it does not guess at a merge.
- Informational physics notes remain available to the model but do not automatically force edits.
- Chat must use the same approved Physics vocabulary: blocker, risk, note, finding, evidence,
  assumption, and remedy. It must not claim that an empty report guarantees a safe sew-out.

### Direct AI commands remain first-class

The following flows retain their current command syntax and behavior:

```text
/ai create <description>
/ai improve <instruction>
/ai fix <instruction>
/ai explain <question>
```

They remain fast, task-specific shortcuts with up to two bounded revisions and automatic application
to the editor. The editor context-menu “Explain with AI” remains. Their runs should appear in an
Activity view beside Chat, but they do not implicitly append to a chat thread in version 1. This
avoids contaminating a deliberate conversation with prompt-internal compiler retry turns.

A later opt-in action, “Continue in chat,” may seed a new thread with the direct run's user request,
final response/source, compile summary, and physics result—not its hidden prompt scaffolding.

## UX specification

### AI panel structure

Turn the existing AI panel into two views under the same bottom-panel tab:

```text
AI  [Chat] [Activity]                         Model ▾   New chat
┌────────────────────────────────────────────────────────────┐
│ user: Make the wavefront denser near the lower-left ...    │
│                                                            │
│ Plan                                                       │
│ ☑ Inspect the current wavefront geometry                   │
│ ◉ Identify and edit the controlling parameters             │
│ ☐ Compile and check physics                                │
│                                                            │
│ assistant/tool: Read source                    ✓ 3 ms      │
│ assistant/tool: Inspected spatial layout       ✓ 18 ms     │
│ assistant/tool: Compiled draft                 ⚠ 1 risk    │
│                                                            │
│ assistant: I tightened the lower-left spacing while ...    │
│ ┌ Proposed source change ─ 12 + 16 lines ─ physics checked │
│ │ [Show diff]  [Apply]  [Discard]                          │
│ └────────────────────────────────────────────────────────── │
├────────────────────────────────────────────────────────────┤
│ Ask about or change this design…                [Cancel]   │
└────────────────────────────────────────────────────────────┘
```

- Chat is the default view after `/ai chat`; Activity is the default after a direct command starts.
- Tool steps render as compact status rows with accessible labels. Expanded details show bounded,
  sanitized tool input/result summaries, never reasoning text, credentials, image data, or the full
  duplicated source.
- Assistant text supports paragraphs, lists, and fenced NeedleScript snippets. Do not render raw
  HTML. If adding a Markdown renderer, sanitize output and keep links visibly external.
- The proposal card shows added/removed line counts, compile status, physics counts, source revision,
  and a line diff. Apply and Discard remain visible while the user scrolls the proposal details.
- Selecting a source-linked tool result or diff hunk reveals the matching Monaco range. Selecting a
  physics result uses the existing `selectedDiagnosticId` coordination across editor, stage, and
  playback.
- A currently running turn has a Cancel button. Cancelling aborts the provider request, stops further
  tool dispatch, leaves already completed transcript steps visible, and retains the last valid draft.
- Sending is disabled only while the active turn is running. Direct AI commands are rejected with a
  clear “chat turn is already running” message while the shared provider session is busy.

### Multiple-choice questions

Render `ask_user_questions` as an owned form inside the transcript rather than ordinary assistant
Markdown:

```text
Before I change the wavefront:

1. Which area should become denser?
   (•) Lower-left (recommended)  ( ) Whole design  ( ) Center

2. What should remain most stable?
   (•) Overall silhouette  ( ) Stitch count  ( ) Current spacing

                                        [Submit answers]
```

- One tool call may contain one to three related questions. Each question has two to five concise,
  mutually exclusive options by default.
- A question may explicitly allow multiple selections when choices can be combined.
- The model may mark one option as recommended, but the UI must explain the impact of every option
  and must not pre-submit it.
- Include an optional “Other” free-text answer only when the listed choices cannot cover a reasonable
  interpretation. Bound and sanitize that text like a normal user message.
- Submit the complete question set atomically. Required unanswered questions keep Submit disabled;
  optional questions include a visible “No preference” choice.
- While awaiting answers, the turn status is `awaiting-user`, the provider and wall-time clocks are
  stopped, and no other model or domain tool runs. The user may cancel the question set, which
  appends a cancelled tool result and ends the turn cleanly.
- Submitted questions, options, selected option IDs/labels, and free text appear in the transcript
  and persist as conversation history. They are never reconstructed from visual labels alone.
- If the workspace changes while a question is open, preserve it in the old workspace thread and do
  not display or answer it from the new workspace.

### Multi-step work plans

Render the active plan as a compact checklist card pinned near the latest turn while also preserving
each plan update in transcript order:

- Pending steps use an empty checkbox, the sole in-progress step uses an indeterminate checkbox or
  spinner plus “In progress,” and completed steps use checked boxes with completion time.
- Checkboxes communicate model progress and are not directly toggleable by the user. The user changes
  scope conversationally, so the model can revise the plan with an explicit tool call and explanation.
- At most one step may be in progress. Creating a plan may set its first step in progress.
- The model marks a step complete only after the corresponding action or evidence exists in the
  transcript. For example, “Check physics” completes after a successful physics tool result, not when
  the model merely says it will check.
- One update may complete the current step and start the next atomically, avoiding an intermediate
  plan with no active work.
- If new information changes the approach, pending steps may be added, renamed, or reordered.
  Completed steps remain in the audit trail; reopening one requires a short explanation.
- Cancellation, provider failure, or a question pauses the plan without erasing it. A later user turn
  can resume the first incomplete step.
- A completed plan remains collapsed in the thread with an “All steps completed” summary and can be
  expanded to review the implementation sequence and evidence links.

### Workspace and thread lifecycle

- Add an explicit `workspaceId`/`workspaceEpoch` in `App.tsx`. Increment or replace it when an
  example, saved snippet, share, SVG import, or other external document is loaded.
- Do not key threads solely by `design.name`; direct runs currently use names such as `ai`, and
  unsaved source may retain a previous compiled name.
- Keep multiple threads per workspace, ordered by `updatedAt`. Derive the initial title from the first
  user message locally; do not spend a model call on title generation.
- Loading another workspace switches to its most recent thread or an empty Chat state. Returning to a
  workspace restores its local threads.
- New chat starts from the then-current live source and current selection. It does not copy a pending
  draft unless the user explicitly chooses “Branch from draft.”
- Changing models does not erase the transcript. Add a visible system notice and use the new model on
  the next turn.

### Mobile and accessibility

- Reuse the existing collapsed/half/full bottom-sheet behavior. Opening Chat moves to at least half
  height; it must not cover the composer with the software keyboard.
- Transcript is a semantic list; user and assistant messages have headings available to screen
  readers. Tool status changes use a polite live region, while final failure and stale-proposal
  alerts use assertive status only once.
- All question, option, plan, proposal, thread, model, expand/collapse, cancel, apply, and discard
  controls are keyboard reachable with visible focus.
- Focus stays in the composer after a completed text-only turn. After an Apply action, focus moves to
  the first changed editor line; after an apply error, it moves to the error alert.
- Color is never the only indication of tool status, compile result, physics severity, or diff kind.
- Virtualize long transcripts, but keep screen-reader order and search semantics intact.

## Architecture

### Module boundaries

Keep provider protocol, orchestration, domain tools, state, and presentation separate:

| Area               | Responsibility                                                                               | Proposed files                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider           | Convert provider-neutral messages/tools to the OpenRouter SDK and normalize replies/usage    | `src/ai/provider.ts`, `src/ai/openrouter-provider.ts`                                                                                      |
| Thread state       | Immutable thread/turn reducer, questions, plans, status transitions, usage aggregation       | `src/ai/chat-types.ts`, `src/ai/chat-reducer.ts`                                                                                           |
| Persistence        | Versioned IndexedDB records, retention, migrations, privacy setting                          | `src/ai/chat-storage.ts`                                                                                                                   |
| Context            | Build bounded provider history and compact old completed turns                               | `src/ai/chat-context.ts`                                                                                                                   |
| Tool registry      | JSON schemas, capability metadata, validation, result envelopes                              | `src/ai/tool-definitions.ts`, `src/ai/tool-validation.ts`                                                                                  |
| Tool runtime       | Execute allow-listed read/compile/spatial/physics/draft tools                                | `src/ai/tool-runtime.ts`                                                                                                                   |
| Draft edits        | Source hashing, range conversion, overlap checks, diff/proposal creation                     | `src/ai/source-edits.ts`                                                                                                                   |
| Agent loop         | Bounded request → tool → result loop with abort and telemetry                                | `src/ai/agent-loop.ts`                                                                                                                     |
| React integration  | Bind thread/tool runtime to current source, revision, compiler, and editor apply             | `src/hooks/useAIChat.ts`                                                                                                                   |
| UI                 | Transcript, composer, questions, plan checklist, tool rows, proposal diff, thread picker     | `src/components/AIChatPanel.tsx`, `src/components/AIQuestionSet.tsx`, `src/components/AIWorkPlan.tsx`, `src/components/AICodeProposal.tsx` |
| Shared AI services | Model discovery, provider client, spatial/physics formatting reused by direct and chat flows | refactor from `src/hooks/useAI.ts` without changing commands                                                                               |

Avoid a large file move before behavior is covered. Extract shared helpers in small commits, retain
`useAI.ts` as the direct-command facade, and introduce `useAIChat.ts` beside it. A later cleanup can
combine them behind a single public `useAIWorkspace` hook.

### Provider-neutral types

The thread model must preserve complete tool-call bundles. Never flatten history into display-only
strings and try to reconstruct protocol messages later.

```ts
type AiThreadStatus = 'idle' | 'running' | 'awaiting-user';
type AiTurnStatus = 'running' | 'awaiting-user' | 'completed' | 'cancelled' | 'failed';

interface AiChatThread {
  version: 1;
  id: string;
  workspaceId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: AiThreadStatus;
  turns: AiChatTurn[];
  summary?: AiConversationSummary;
  draft: AiDraftState;
  activePlan?: AiWorkPlan;
  pendingQuestionSet?: AiPendingQuestionSet;
  usage: AiActivityUsage;
}

interface AiChatTurn {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: AiTurnStatus;
  user: AiUserMessage;
  steps: AiChatStep[];
  usage: AiActivityUsage;
}

type AiChatStep =
  | { kind: 'assistant'; message: AiAssistantMessage; usage?: AiActivityUsage }
  | { kind: 'tool-result'; message: AiToolResultMessage; display: AiToolDisplay }
  | { kind: 'question-set'; questionSet: AiQuestionSet; status: 'open' | 'answered' | 'cancelled' }
  | { kind: 'plan-update'; plan: AiWorkPlan; explanation?: string }
  | { kind: 'notice'; level: 'info' | 'warning' | 'error'; text: string };

type AiPlanStepStatus = 'pending' | 'in-progress' | 'completed';

interface AiWorkPlan {
  id: string;
  version: number;
  title: string;
  steps: Array<{
    id: string;
    text: string;
    status: AiPlanStepStatus;
    completedAt?: number;
  }>;
}

interface AiPendingQuestionSet {
  toolCallId: string;
  questions: AiQuestionSet;
  openedAt: number;
}

interface AiAssistantMessage {
  role: 'assistant';
  content: string | null;
  toolCalls?: AiToolCall[];
}

interface AiToolResultMessage {
  role: 'tool';
  toolCallId: string;
  content: string; // bounded JSON AiToolResultEnvelope
}
```

`buildProviderMessages(thread)` must deterministically emit:

1. the chat system prompt;
2. the current compacted summary, if any;
3. complete recent user messages;
4. each assistant message containing `toolCalls`;
5. exactly one matching `role: 'tool'` result per completed call, in call order;
6. the final assistant response when present.

Never prune an assistant tool-call message independently from its results. Interrupted calls get a
synthetic bounded error result before a later request is allowed to replay that turn.

An open question set is the one intentional temporary exception: its assistant tool-call message is
persisted while the matching tool result is pending, but that incomplete protocol history is never
sent to the provider. Submitting or cancelling the form creates the matching tool result first, then
the agent loop may resume. Plans are application state derived only from validated plan-tool results;
assistant prose cannot mutate them.

### Draft and proposal model

```ts
interface SourceSnapshot {
  revision: number;
  hash: string;
  text: string;
}

interface AiDraftState {
  base: SourceSnapshot;
  text: string;
  revision: number;
  status: 'clean' | 'changed' | 'stale';
  lastCompile?: AiCompileSnapshot;
}

interface AiCodeProposal {
  id: string;
  threadId: string;
  baseRevision: number;
  baseHash: string;
  draftRevision: number;
  source: string;
  diff: AiLineDiff[];
  compile?: AiCompileSnapshot;
}
```

- Create the draft lazily on the first source-dependent tool call, using the latest live revision and
  text at tool-execution time.
- Every edit tool call includes the expected draft revision and hash. A mismatch returns a conflict
  result; it never partially edits.
- The proposal is derived, not independently editable state: `draft.text !== draft.base.text`.
- Live source changes compare the current revision/hash to `draft.base`. A mismatch marks the draft
  stale even if the resulting text happens to be visually similar.
- Apply verifies the same base revision/hash again immediately before the Monaco transaction.
- Apply calls `editor.pushUndoStop()`, `editor.executeEdits(...)`, and `editor.pushUndoStop()` around
  one full-document or ordered multi-range edit. Then it follows the normal `onSourceChange` and
  `runProgram` path.
- After Apply, promote the applied source to a new clean base and add a thread notice. After Discard,
  reset the draft from current live source. Rebase also resets from current source but retains the
  conversation and records that old proposal evidence is historical.

### Compiler isolation and caching

Create a dedicated `useCompiler({ physicsAnalysis: 'full' })` consumer for chat tools. Do not pass the
same `compile` callback used by `App.runProgram` into the agent loop:

- Chat compiles are explicit foreground work in their own consumer generation, so a later chat
  compile supersedes only an older chat compile.
- They still use the shared worker/priority queue, budgets, and five-second timeout.
- User Run remains foreground and is not cancelled by chat staleness logic.
- Cache successful and failed compile results by `sourceHash + seed + machineProfile + analysisMode`
  for the current turn. Spatial and physics tools reuse the cached result rather than compiling
  independently.
- Limit compile executions per turn even when the model repeatedly asks for the same operation.
- Never persist full `RunResult.events`; retain only bounded tool-result summaries and the latest
  proposal compile summary.

## Tool contract

### General rules

All tools are browser-local, allow-listed functions. Tool arguments are untrusted JSON.

Each result is a serialized envelope:

```ts
interface AiToolResultEnvelope<T> {
  ok: boolean;
  tool: string;
  source?: {
    target: 'live' | 'draft';
    revision: number;
    hash: string;
  };
  data?: T;
  error?: { code: string; message: string; retryable: boolean };
  truncated?: boolean;
  nextCursor?: string;
}
```

Requirements for every dispatcher:

- Reject unknown tool names and unknown argument properties.
- Parse JSON once, validate types, enums, numeric bounds, array lengths, and total payload size.
- Return validation and runtime failures as tool results so the model can recover.
- Cap every text field and collection; report omissions explicitly.
- Normalize non-finite numbers before serialization.
- Include source target, revision, and hash in every source-dependent result. Human-input and plan
  tools instead include their question/plan ID and version.
- Never include the API key, browser storage contents, hidden prompt text, raw reasoning, or data URLs.
- Log safe display metadata separately from the exact provider result.

### Version 1 tools

#### `ask_user_questions`

Pauses the current turn and asks a bounded set of structured multiple-choice questions when an
unresolved ambiguity can materially change the outcome.

```ts
{
  introduction?: string;
  questions: Array<{
    id: string;
    prompt: string;
    selection: 'single' | 'multiple';
    required: boolean;
    options: Array<{
      id: string;
      label: string;
      description: string;
    }>;
    recommendedOptionId?: string;
    allowOther?: boolean;
  }>;
}
```

Allow one to three questions, two to five options per question, unique stable IDs, bounded labels,
and bounded one-sentence descriptions. `recommendedOptionId` must identify an option in that
question. A multiple-selection question must state how combined choices affect the result.

This tool does not return immediately. The runtime records its call ID and moves the turn to
`awaiting-user`. Form submission returns selected option IDs and labels plus any bounded “Other”
text in the normal matching tool-result message, then resumes the agent loop. Cancelling returns
`{ cancelled: true }` and ends the turn without another model request.

Use it when there are multiple plausible interpretations with meaningful consequences—for example,
which motif to preserve, whether a change applies locally or globally, or which tradeoff has
priority. Do not use it for information available from source/spatial/physics tools, for trivial
styling choices the user delegated, or merely to seek confirmation after a clear instruction.

#### `create_plan`

Creates the active checklist for a complex task.

```ts
{
  title: string;
  steps: Array<{
    id: string;
    text: string;
    status: 'pending' | 'in-progress';
  }>;
}
```

Allow two to eight concrete, outcome-oriented steps with unique stable IDs and at most one initial
`in-progress` step. The result returns the normalized plan and version. If an unfinished plan already
exists, reject creation and require `update_plan`; never silently replace the user's visible plan.

#### `update_plan`

Atomically updates progress or revises the active checklist.

```ts
{
  planId: string;
  expectedVersion: number;
  explanation?: string;
  steps: Array<{
    id: string;
    text: string;
    status: 'pending' | 'in-progress' | 'completed';
  }>;
}
```

The complete normalized step list is submitted on every update. Validate plan ID/version, unique
step IDs, two-to-eight-step bounds, at most one in-progress step, and preservation of completed
steps. Allow adding, renaming, or reordering pending steps. Reopening a completed step requires a
non-empty explanation and is displayed explicitly. Stamp newly completed steps in the runtime and
return the new plan version.

Use a plan for dependent multi-step implementation, diagnosis, or iterative design work. Do not
create one for a simple answer, explanation, or single localized edit. Before substantive work, set
the relevant step in progress. Mark it completed only after its action/evidence is present, and use
one atomic update to complete it and start the next when possible.

#### `read_source`

Reads numbered NeedleScript source from live or draft state.

```ts
{
  target?: 'live' | 'draft'; // default: draft if one exists, otherwise live
  startLine?: number;        // default: 1
  endLine?: number;          // inclusive; bounded page
}
```

Result: total line/character counts, returned numbered lines, current selection if it intersects the
page, and a continuation cursor when truncated. The model must page deliberately for large files.

#### `compile_design`

Compiles live or draft source with full physics analysis.

```ts
{
  target?: 'live' | 'draft';
  seed?: number;
}
```

Successful result: stitch/jump/trim/color counts, dimensions/bounds, hoop/profile/material
assumptions, warnings count, physics severity counts, timing, and whether the result came from cache.
Failed result: message, reported line, that source line, and target revision/hash. This tool does not
return every event or every diagnostic.

#### `inspect_spatial`

Returns exact, compiled hoop-space data. It uses a cached compile or performs one within the turn's
compile budget.

```ts
{
  target?: 'live' | 'draft';
  scope?: 'design' | 'source-lines' | 'box';
  sourceLines?: number[]; // max 24, used by source-lines
  box?: { minX: number; minY: number; maxX: number; maxY: number };
  includeOccupancy?: boolean;
}
```

Result fields by scope:

- `design`: visible bounds, dimensions, center, hoop/field, per-color extents, plan counts, coarse
  occupancy grid, and out-of-field extent.
- `source-lines`: for each line, stitch count, event range, visible bounds, center, colors,
  construction IDs, and whether the line produced no visible stitches.
- `box`: event/stitch/color counts inside/intersecting the box, contributing source lines, and
  construction IDs. State clearly that this is an event/segment query, not semantic object naming.

Extract the source-line spatial index from `App.tsx` into a pure helper under `src/lib/editor/` so the
canvas hover feature and AI tool share one definition. Keep coordinates in millimetres with `+x`
right, `+y` up, and origin at hoop center.

#### `inspect_physics`

Returns structured findings from the same compiled target.

```ts
{
  target?: 'live' | 'draft';
  severities?: Array<'error' | 'warning' | 'info'>;
  codes?: string[];
  sourceLines?: number[];
  limit?: number;  // hard maximum below global result cap
  cursor?: string;
}
```

Each returned finding includes stable code/fingerprint, severity, category, title, explanation,
measurements/thresholds, evidence and limitations, source roles with line text, bounded semantic
geometry, construction IDs, assumptions, and prioritized remedies. Preserve report/threshold/catalog
versions. Do not encourage threshold weakening, `preflight` insertion, or acknowledgment as a first
remedy.

#### `edit_draft`

Applies validated non-overlapping text edits only to the private draft.

```ts
{
  expectedRevision: number;
  expectedHash: string;
  edits: Array<{
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    text: string;
  }>;
  reason: string;
}
```

Zero-width ranges insert. Edits are interpreted against the same pre-edit document, checked for
overlap, then applied from the end of the document toward the start. The result contains the new
draft revision/hash, changed line ranges, added/removed counts, and a short source preview. Enforce a
maximum edit count, replacement size, and final document size.

Do not expose `set_source`, `apply_source`, or any equivalent live-write tool. Apply is a human UI
action.

### Capability-gated later tools

After the text/spatial tools are reliable, add `inspect_preview` for vision-capable, tool-capable
models. Reuse `buildAiPreviewSvg` and `rasterizeAiPreview`, but do not persist the data URL. Confirm
the selected provider/model accepts image content in tool results; otherwise append a clearly marked
ephemeral visual context item through the provider adapter. The exact spatial digest remains the
authoritative measurement source; preview vision is for composition, balance, and visual intent.

A later `lookup_language_reference` tool may replace large static prompt sections with on-demand
reference retrieval. It is not required for the first release, because changing prompt retrieval and
adding an agent loop simultaneously would make regressions harder to attribute.

## Agent loop

Implement a deterministic state machine, not recursive hook callbacks:

```text
prepare bounded context
  → request model with tool schemas
  → append exact assistant message
  → no tool calls? finalize turn
  → validate requested call
  → question call? persist form → await user → append answer result
  → otherwise execute local/plan tool
  → append matching tool result
  → repeat until final response or limit
```

Initial limits should be constants with tests and activity reporting:

| Limit                    |         Initial value | Behavior at limit                                                              |
| ------------------------ | --------------------: | ------------------------------------------------------------------------------ |
| Model steps per turn     |                    16 | Ask model for a final answer with tools disabled once; otherwise fail clearly. |
| Tool calls per turn      |                    24 | Return a limit result, then request a final answer.                            |
| Actual compiles per turn |                     4 | Cache hits remain allowed; later compile calls get a budget error.             |
| Draft edits per call     |                    24 | Reject the complete call.                                                      |
| Source page              | 400 lines / 24k chars | Return a cursor.                                                               |
| Tool result              |             32k chars | Deterministically truncate with counts/cursor.                                 |
| Active turn wall time    |            90 seconds | Abort provider work and stop dispatch; time awaiting user input is excluded.   |

Use `parallel_tool_calls: false` for version 1. OpenRouter documents that this forces one requested
tool call at a time, which makes draft revisions, compiler caching, transcript ordering, and
cancellation deterministic. Read-only parallel execution can be evaluated later.

Other invariants:

- Use one `AbortController` per turn and check it before and after every awaited operation.
- Append the assistant message containing a tool request before executing it.
- Append one tool result for every call ID, including invalid, cancelled, and runtime-error calls.
- `ask_user_questions` suspends the loop after persisting the unmatched call. No provider request is
  made until an answer result exists. Resume with the original turn ID, counters, abort policy, and
  exact prior messages.
- Plan tools update application state synchronously and append ordinary tool results. They consume
  tool/model-step budgets but never source, compile, or wall-clock budgets beyond their execution.
- Before a final response for an unfinished complex task, the plan must accurately show the first
  remaining step. Before claiming completion, every plan step must be completed or the final response
  must clearly state why work stopped.
- Send the complete `tools` definition on every loop request, as required by OpenRouter.
- Do not retry provider errors blindly. Retry at most once for transient 429/5xx/network failures,
  with visible status and abort-aware backoff.
- A malformed or unknown call counts toward limits.
- A final response may accompany tool calls; retain it in the exact assistant message, but do not
  treat the turn as complete until its calls have results and the model returns without calls.
- Aggregate usage and cost across every model step in the turn and thread.
- Never expose provider reasoning fields in the transcript or persistence layer.

## Prompt and context strategy

### Chat system prompt

Create a chat-specific wrapper around the existing NeedleScript prompt. It should state once:

- answer/review requests are read-only unless the user asks for a change;
- change/fix/create requests may edit the private draft and validate it without pausing;
- ask concise multiple-choice questions when a material ambiguity cannot be resolved through tools,
  and continue without questioning when the user has already delegated the choice;
- create and maintain a visible plan for genuinely multi-step work, with status grounded in completed
  actions and evidence;
- live application always requires the user's Apply action;
- use compiled spatial and physics data as ground truth;
- inspect relevant source before editing;
- preserve requested visual intent and intentional geometry;
- address blockers before risks and do not chase informational notes automatically;
- do not hide findings by weakening thresholds, adding `preflight`, deleting intent, or silencing;
- the available tools, budgets, and source/draft semantics;
- concise user-facing final responses that summarize what changed and what validation found.

Avoid repeating full tool instructions in both the system prompt and tool descriptions. Current
OpenAI model guidance recommends lean tool descriptions, explicit action/approval boundaries, and
tracking context growth in long sessions
([official model guidance](https://developers.openai.com/api/docs/guides/latest-model)). Treat that
as general design guidance, not a requirement to switch providers or model families.

### Per-turn workspace snapshot

Add a compact synthetic context item before the new user message:

- workspace ID and live source revision/hash;
- whether a clean, changed, or stale draft exists;
- active-plan ID/version and the first incomplete step, if one exists;
- pending question-set ID, if the turn is awaiting user input;
- current editor selection/cursor location, if any;
- current machine/hoop/material identity;
- last successful live compile status and physics counts;
- tool budget remaining.

Do not attach complete source automatically on every chat turn. The model can call `read_source`, and
tool results become part of the exact history. This avoids repeatedly billing unchanged source while
still making the state boundary unambiguous.

### History and compaction

The visible transcript and provider context are related but not identical:

- Persist the complete user-visible transcript and bounded tool display records.
- Preserve exact recent provider messages needed for valid tool-call replay.
- Use `Model.contextLength` from the OpenRouter model list and a conservative local token estimate.
- Reserve room for the system/tool schemas, current workspace snapshot, and model output.
- Compact only completed oldest turns. Never compact the active turn or split a tool-call bundle.
- Never compact an open question set, its eventual answer, or the active unfinished plan. Summaries
  preserve answered decisions and the status/evidence of every incomplete plan step.
- Store a structured summary with user goals, accepted decisions, rejected approaches, pending work,
  applied proposal IDs, and unresolved physics/spatial facts. Do not summarize generated reasoning.
- Include hashes/revisions with summarized source facts so later turns know when they are historical.
- When no safe compaction fits, stop before the provider call and ask the user to start a new thread
  or discard old context; do not silently drop the newest instructions.

Start with deterministic extraction plus a bounded summarization request only when required. Put
summarization behind the provider adapter and test it separately. A summary request cannot use tools
or change a draft.

## Persistence and privacy

Use IndexedDB for chat threads; keep the existing API-key/model localStorage keys unchanged.

- Schema-version every record and add explicit migration tests.
- Persist messages, question sets and answers, plan versions/statuses, safe tool display summaries,
  exact bounded provider messages required for replay, conversation summaries, proposal source/diff,
  usage, timestamps, and model IDs.
- Never persist API keys, raster/data URLs, raw full stitch events, provider reasoning, or request
  headers.
- Default to local persistence because “knows its chat history” should survive reloads. Add a setting
  to keep new threads session-only and a visible “Delete all AI chats on this device” action.
- Suggested initial retention: 20 threads per workspace, 200 completed turns total, 30 days since
  last use, and a 5 MB aggregate soft cap. Evict oldest non-active threads first and never evict a
  pending proposal without a warning.
- Never evict the active thread while it has an open question set or unfinished plan. If retention
  cannot proceed without doing so, surface storage management instead of silently deleting it.
- Corrupt or newer-version records fail closed: show a recoverable reset message and do not submit
  malformed history to the provider.
- README/settings copy must state that source and chat content are sent to the selected OpenRouter
  model/provider when a turn runs, and that history is stored locally on the device.

## Model capability handling

Extend `AIModelInfo`:

```ts
interface AIModelInfo {
  id: string;
  name: string;
  contextLength: number | null;
  supportsImageInput: boolean;
  supportsTools: boolean;
}
```

Derive `supportsTools` from `model.supportedParameters.includes('tools')`, which is present in the
installed SDK's `Model` type. The model picker should show capability badges and support filters.

- Direct create/improve/fix/explain remain available for compatible text models even if they lack
  tools.
- Chat is disabled for non-tool-capable models with a clear model-selection action. Do not silently
  degrade a workspace-aware request into source-free conversation.
- If model discovery fails, retain direct-command behavior for a manually selected model but require
  an explicit “try tool support” action before chat. Cache the successful capability only for that
  model ID and SDK/API version.
- Record the actual response model on each assistant step, because provider routing may differ from
  the selected identifier.

## Error and conflict behavior

| Situation                       | Required result                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Missing API key                 | Keep `/ai apikey` guidance and preserve unsent composer text.                                                |
| Model lacks tools               | Block Chat send, show compatible-model selection; direct features still work.                                |
| Provider/network/rate error     | Keep completed steps/draft, mark turn failed, allow Retry from the same last complete protocol boundary.     |
| Invalid tool JSON               | Append a validation error result; allow the model to correct it.                                             |
| Unknown tool                    | Append `unknown_tool`; never dynamically resolve a function name.                                            |
| Invalid question set            | Append a validation error; do not render a partial or ambiguous form.                                        |
| User leaves a question open     | Persist `awaiting-user` without provider polling, cost, or active wall-time consumption.                     |
| User cancels a question         | Append a cancelled answer result, end the turn, and leave any work plan paused.                              |
| Stale plan update               | Return the current plan ID/version; never overwrite newer checklist progress.                                |
| Model claims untracked progress | Keep checklist state unchanged; only validated `create_plan`/`update_plan` results alter it.                 |
| Compile timeout                 | Return the existing bounded timeout as a tool error and keep the prior valid compile snapshot.               |
| Compile error                   | Return line-linked error data; draft remains editable.                                                       |
| Tool/step budget exhausted      | Disable tools for one final-answer request and disclose the limit.                                           |
| User cancels                    | Abort, close unmatched calls with cancelled results, keep the draft and completed transcript.                |
| Live source changes during turn | Let read-only work finish against its identified snapshot, mark draft/proposal stale, and disable Apply.     |
| Workspace changes during turn   | Abort the old turn and persist it to the old workspace; never deliver its proposal into the new workspace.   |
| Apply conflicts                 | No edit; show current/base revisions and offer Rebase or Discard.                                            |
| Apply compiles unsuccessfully   | Keep the Monaco edit undoable, surface normal compiler markers, and keep the proposal record for comparison. |

## Security and safety boundaries

- The tool registry is a static map; no `eval`, dynamic imports, arbitrary URLs, DOM scripting, or
  command execution.
- The only executable input is NeedleScript source passed to the existing budgeted worker compiler.
- Model-provided edit coordinates and text are validated before touching the draft.
- Question option text, “Other” responses, plan labels, and plan explanations are bounded and
  rendered as untrusted content.
- Live changes require the Apply control and revision/hash verification.
- Render model text as untrusted content. No raw HTML, inline event handlers, or unsanitized URLs.
- Keep image data ephemeral and strip it from activity details, errors, persistence, and analytics.
- Never send local saved-snippet catalogs, other workspace threads, or browser storage to a model.
- Avoid logging full source/tool payloads to the console in production.
- Expose total request count, token usage, cost when available, tool count, and elapsed time so the
  user can understand a multi-step turn's cost.

## Implementation phases

### AI-0 — Product contract and prototype

Deliverables:

- Approve this contract, especially draft-only tool writes, persistent local history, workspace
  boundaries, and direct-command separation.
- Add a static desktop/mobile prototype for Chat, tool rows, proposal review, stale conflict, and
  empty/missing-key/model-unsupported states, multiple-choice question forms, and checklist plans.
- Test keyboard order, screen-reader labels, long code blocks, and a 50-turn transcript in prototype.

Exit gate: product owner can complete “ask → clarify → plan → inspect → revise → apply” and “edit
live source → stale proposal → rebase” without explanation.

### AI-1 — Shared services and model capabilities

Deliverables:

- Extract OpenRouter client creation, normalized request/response/usage types, and model discovery
  from `useAI.ts` behind `AiProvider`.
- Add `contextLength` and `supportsTools` to model state and autocomplete UI.
- Extract compile/spatial/physics formatting helpers currently private to `useAI` where both flows
  need them.
- Keep all existing one-shot tests and behavior passing before adding Chat.

Exit gate: direct commands and context-menu explain are behavior-compatible; tool-capable models are
identified from real model metadata.

### AI-2 — Thread state, persistence, and chat UI shell

Deliverables:

- Implement versioned thread/turn reducer with exhaustive state-transition tests.
- Implement workspace IDs, thread picker, new/delete actions, IndexedDB persistence, retention, and
  migration/failure states.
- Add Chat/Activity views, transcript, multiline composer, cancel affordance, usage footer, and
  empty/configuration states, plus owned question and plan-card components with static fixtures.
- Initially support text-only multi-turn replies through the provider adapter, without domain tools.

Exit gate: reload preserves a thread; switching workspaces does not leak messages; exact user and
assistant history is resent and visible.

### AI-3 — Bounded agent loop and read-only tools

Deliverables:

- Add schemas, validators, dispatcher, result envelopes, loop budgets, abort behavior, and safe
  telemetry.
- Add `ask_user_questions`, `create_plan`, `update_plan`, `read_source`, `compile_design`,
  `inspect_spatial`, and `inspect_physics`.
- Add `awaiting-user` suspension/resume, atomic answer submission, plan versioning, and evidence-aware
  checklist transitions.
- Add a dedicated chat compiler consumer and per-turn compile cache.
- Preserve assistant tool calls and matching results exactly in provider history.
- Render tool steps and link source/physics results into Monaco/stage selection.

Exit gate: the model can clarify a material ambiguity, create and advance a multi-step plan, and
answer source-, placement-, and physics-specific questions using only facts returned by tools;
malformed calls and loops terminate safely.

### AI-4 — Draft editing and proposal application

Deliverables:

- Implement source hashing, draft state, range validation, `edit_draft`, diff creation, and proposal
  cards.
- Add atomic Monaco Apply, Discard, and Rebase; add stale detection on every live source revision.
- Run the existing foreground program path after Apply.
- Preserve the draft across follow-ups and cancellation.

Exit gate: a model can perform at least two private edit/compile/inspect cycles, present one diff,
keep its checklist synchronized with those cycles, and never alter live source until Apply. Apply is
undoable with one editor Undo.

### AI-5 — Visual context and cross-surface polish

Deliverables:

- Add capability-gated `inspect_preview` only after provider/model compatibility tests.
- Add preview/tool thumbnails without persisting image data.
- Make source ranges, physics geometry, stage overlays, and proposal hunks navigable from Chat.
- Complete responsive/mobile, virtualization, and accessibility work.

Exit gate: visual composition tasks improve measurably over text spatial data alone without losing
measurement correctness or introducing image-history leakage.

### AI-6 — Context compaction, evals, and rollout hardening

Deliverables:

- Add model-aware context budgeting, complete-turn compaction, structured summaries, and recovery
  when context cannot fit.
- Add deterministic mocked integration scenarios and an optional live-model evaluation script.
- Document privacy, cost, history, tools, proposal review, and direct-vs-chat usage in README/help.
- Add performance marks for time to first response, tool latency, compile latency/cache hits, total
  turn time, token use, cost, cancellation, and conflict rates.
- Roll out behind a local feature flag until exit thresholds are met.

Exit gate: representative evals, accessibility checks, full tests/lint/build, and a manual usability
protocol pass without unresolved blocker-class defects.

## Test plan

### Pure unit tests

- Thread reducer: start, append assistant, append tool result, finalize, fail, cancel, retry, model
  switch, await/resume user input, new thread, and impossible transitions.
- Question validation: question/option limits, unique IDs, recommendation membership, required and
  optional answers, single/multiple selection, bounded Other text, atomic submit, and cancellation.
- Plan reducer: create, version conflict, complete-and-start atomic update, at-most-one in-progress,
  completed-step preservation, explained reopening, pending-step revision, pause, resume, and finish.
- Provider-message reconstruction preserves assistant tool calls, IDs, order, null content, results,
  and complete bundles.
- Tool schema validation rejects unknown fields, invalid enums, oversized arrays/text, non-finite
  coordinates, bad cursors, and malformed JSON.
- Source range conversion covers CRLF, Unicode, EOF insertion, reversed ranges, overlaps,
  out-of-bounds columns, and descending application.
- Draft revision/hash conflicts are atomic and never partially apply.
- Spatial queries match existing `RunResult` fixtures for overall, per-line, and box scopes.
- Physics paging/filtering preserves severity order, source roles, evidence, assumptions, geometry
  caps, and version fields.
- Compile cache keys include every input that can affect output.
- Context pruning never splits tool bundles or drops the newest instructions.
- IndexedDB migrations, corruption handling, retention, and proposal-preservation rules.

### Agent-loop tests with a fake provider

1. Final text with no tools.
2. `read_source → final answer`.
3. `compile_design → inspect_physics → final answer`.
4. `read_source → edit_draft → compile error → edit_draft → compile success → final proposal`.
5. Spatial inspection of selected source lines.
6. `ask_user_questions → await → answer result → resumed tool work → final answer`.
7. Cancelled question, persisted/reloaded open question, and workspace switch while awaiting input.
8. `create_plan → work → update_plan` through every step, with evidence before completion.
9. Stale plan version, invalid simultaneous in-progress steps, and an interrupted plan resumed later.
10. Invalid JSON followed by a corrected call.
11. Unknown tool, tool exception, compile timeout, and provider failure.
12. Model returns content plus tool calls.
13. Tool-call, model-step, compile, output-size, context, and active wall-time limits.
14. Cancel during provider wait, compile, and immediately before tool dispatch.
15. Workspace switch during a turn.
16. Live edit during a turn and immediately before Apply.
17. Retry resumes only from a valid protocol boundary.
18. Usage/cost aggregation across multiple model steps.

### UI/integration tests

- `/ai chat` focuses the composer; `/ai chat hello` submits once.
- Multiple questions render as one accessible form, validate atomically, and resume exactly once.
- Question focus moves to the first prompt, errors return to the first invalid question, and resumed
  work does not steal focus before submission feedback is announced.
- Plan checkboxes correctly expose pending, in-progress, and checked states without being user
  toggles; updates preserve focus and announce only changed steps.
- Direct commands still open Activity and retain current generated-code behavior.
- Chat/Activity switching does not cancel work or lose scroll position.
- Apply is one undo step and runs the normal program path.
- Stale proposals cannot be applied through pointer, keyboard, or programmatic double-submit.
- Tool details never show credentials or image data.
- Physics result selection coordinates Monaco, stage, and playback using existing state.
- Mobile sheet, software keyboard, long transcript virtualization, focus restoration, reduced motion,
  contrast, and screen-reader announcements.

### Evaluation scenarios

Create a small versioned corpus using bundled examples, including `examples/generative/wavefront.ns`:

- explain why a visible element occupies a particular quadrant, citing measured bounds;
- find and explain the highest-priority physics risk without editing;
- move one source-linked construction while preserving another;
- reduce a blocker through construction changes and retain visual intent;
- make two follow-up refinements that depend on prior conversation decisions;
- recognize two materially different interpretations, ask bounded questions, and use the selected
  answers without asking the same question again;
- create a useful non-ceremonial plan for a multi-step revision, keep its checkboxes synchronized with
  actual tool evidence, and finish every step;
- recognize that a clean physics report is not a sew-out guarantee;
- refuse to hide a risk by weakening limits when asked for a real construction fix;
- detect a live-source conflict and avoid applying the stale proposal.

Score task completion, factual agreement with tool data, compile success, blocker/risk delta, visual
intent retention, unnecessary questions, repeated questions, plan usefulness, plan/evidence
agreement, incomplete or falsely completed steps, tool calls, model steps, latency, tokens, cost,
and whether Apply boundaries were respected. Do not make a single provider/model's prose the golden
output.

## Verification commands

Run Node through the repo's configured version first:

```text
nvm use
npm test
npm run lint
npx prettier --check .
npm run build
npm run doctor
```

When pure helpers under `src/lib/` change, also run:

```text
npm run build:lib
npm run check:lib
```

Only address React Doctor findings introduced in edited code. Live-provider evaluations require an
explicit developer key and must not run in the ordinary deterministic test suite.

## Documentation updates required at implementation time

- `README.md`: `/ai chat`, thread storage/privacy, questions, checklist plans, tool behavior, draft
  Apply/Discard/Rebase, model capability, costs, and direct-command distinction.
- `/ai help`: new commands and concise workflow.
- `docs/ai-system-prompt.md`: chat autonomy, tool, draft, approval, and physics wording without
  duplicating schemas.
- `docs/needlescript-language-reference.md`: only if public editor behavior belongs in the generated
  reference source; do not hand-edit generated references without updating
  `docs/needlescript-language-reference.json` and regenerating.
- Architecture docs only when the language/runtime/machine pipeline changes. The proposed v1 keeps
  model orchestration in the playground and should not change parser/interpreter/machine semantics.

## Risks and mitigations

| Risk                                      | Mitigation                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Model edits stale source                  | Base revision/hash on every draft and Apply; disable stale Apply.                                   |
| Tool loop runs indefinitely               | Hard model/tool/compile/time budgets plus one tools-disabled final request.                         |
| AI asks too many questions                | Material-ambiguity threshold, bundled questions, eval rate, and no questions for inspectable facts. |
| Open question consumes work indefinitely  | Persisted `awaiting-user` state with no polling, provider request, or active timer.                 |
| Checklist reports false progress          | Only plan tools mutate state; completion requires transcript evidence and eval checks.              |
| Plan updates crowd out real work          | Use plans only for complex tasks, combine complete/start updates, and cap plan length.              |
| Prompt/history cost grows                 | On-demand source reads, bounded results, model-aware complete-turn compaction.                      |
| Tool-capability varies by routed model    | Capability metadata, compatible-model filter, normalized adapter, eval matrix.                      |
| Physics/spatial facts drift between tools | Compile cache and source hash on every result.                                                      |
| User Run competes with agent compile      | Dedicated compiler consumer and existing shared foreground priority.                                |
| AI silently damages code                  | Draft-only edits, reviewed diff, atomic Apply, one-step Undo.                                       |
| History leaks across designs              | Explicit workspace identity/epoch and scoped persistence keys.                                      |
| Persisted history contains sensitive code | Local-only disclosure, deletion controls, retention cap, session-only option.                       |
| Image context bloats or leaks             | Capability-gated later phase; ephemeral data URL; exact text remains canonical.                     |
| Markdown creates an injection surface     | No raw HTML; sanitize links/content; render tool data with owned components.                        |
| Monolithic `useAI` becomes harder to test | Extract provider, reducer, tools, loop, drafts, and persistence as pure modules.                    |
| Direct features regress                   | Refactor behind compatibility tests before Chat and keep direct/chat histories separate.            |

## Definition of done

The feature is complete when all of the following are true:

1. `/ai chat` supports multi-turn text conversation and restores the thread after reload.
2. The selected model receives valid complete chat/tool history within a bounded context policy.
3. The model can read source and inspect compile, spatial, and physics facts from the current or draft
   revision.
4. The model can ask one or more bounded multiple-choice questions, persist while awaiting the user,
   and resume the exact same tool-call turn from the submitted answers.
5. The model can create a visible multi-step checklist, work through it, and keep each checkbox status
   consistent with actual transcript evidence across interruptions and follow-up turns.
6. The model can perform multiple draft edits and validations in one turn.
7. No chat tool can mutate live source; Apply is explicit, revision-safe, and one-step undoable.
8. Follow-up turns refine the pending draft and retain earlier user decisions.
9. Workspace changes, live edits, cancellation, malformed tool calls, provider errors, and exhausted
   budgets have tested, recoverable states.
10. Question, plan, tool, and message rendering is accessible on desktop and mobile and exposes useful cost/activity
    information without credentials or hidden reasoning.
11. `/ai create`, `/ai improve`, `/ai fix`, `/ai explain`, model selection, credits, reset, context-menu
    explain, compiled spatial review, and bounded physics revisions still work.
12. Unit/integration/evaluation gates and the repository's test, lint, formatting, app build, library
    validation (when applicable), and React Doctor checks pass.
