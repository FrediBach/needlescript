import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AiChatStep, AiQuestionAnswer } from '../ai/chat-types.ts';
import type { UseAIChatReturn } from '../hooks/useAIChat.ts';
import AIQuestionSet from './AIQuestionSet.tsx';
import AIWorkPlan from './AIWorkPlan.tsx';
import AICodeProposal from './AICodeProposal.tsx';
import styles from './AIChatPanel.module.css';

interface Props {
  chat: UseAIChatReturn;
  selectedModel?: string;
  hasApiKey?: boolean;
  onApplyProposal: () => void;
}

function Step({ step }: { step: AiChatStep }) {
  if (step.kind === 'assistant') {
    if (!step.message.content) return null;
    return (
      <li className={styles.assistantMessage}>
        <span className="sr-only">Assistant</span>
        <div>{step.message.content}</div>
      </li>
    );
  }
  if (step.kind === 'tool-result') {
    return (
      <li className={styles.toolRow} data-status={step.display.status}>
        <span aria-hidden="true">
          {step.display.status === 'success' ? '✓' : step.display.status === 'error' ? '×' : '!'}
        </span>
        <details>
          <summary>
            <strong>{step.display.title}</strong> — {step.display.summary}
          </summary>
          {step.display.detail && <pre>{step.display.detail}</pre>}
        </details>
      </li>
    );
  }
  if (step.kind === 'plan-update') {
    return (
      <li>
        <AIWorkPlan plan={step.plan} />
      </li>
    );
  }
  if (step.kind === 'notice') {
    return (
      <li className={styles.notice} data-level={step.level}>
        {step.text}
      </li>
    );
  }
  if (step.kind === 'question-set' && step.status !== 'open') {
    return (
      <li className={styles.notice}>
        Questions {step.status === 'answered' ? 'answered' : 'cancelled'}
        {step.answers?.map((answer) => (
          <span key={answer.questionId}>
            {' '}
            · {answer.selectedOptionIds.join(', ')}
            {answer.other ? ` (${answer.other})` : ''}
          </span>
        ))}
      </li>
    );
  }
  return null;
}

export default function AIChatPanel({ chat, selectedModel, hasApiKey, onApplyProposal }: Props) {
  const [composer, setComposer] = useState(chat.composerSeed);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLOListElement>(null);
  const active = chat.activeThread;
  const pending = active?.pendingQuestionSet;
  const scrollKey = useMemo(
    () =>
      active
        ? [
            active.id,
            ...active.turns.map((turn) => `${turn.id}:${turn.status}:${turn.steps.length}`),
            pending?.openedAt ?? '',
            chat.proposal?.id ?? '',
          ].join('|')
        : '',
    [active, chat.proposal?.id, pending?.openedAt],
  );

  useEffect(() => {
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [chat.openRequestId]);
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    const scrollToEnd = () => {
      transcript.scrollTop = transcript.scrollHeight;
    };
    scrollToEnd();
    const frame = requestAnimationFrame(scrollToEnd);
    return () => cancelAnimationFrame(frame);
  }, [scrollKey]);

  const submit = () => {
    const message = composer.trim();
    if (!message) return;
    setComposer('');
    void chat.sendMessage(message);
  };
  return (
    <section className={styles.panel} aria-label="AI chat">
      <div className={styles.chatToolbar}>
        <label>
          <span className="sr-only">Chat thread</span>
          <select
            value={active?.id ?? ''}
            onChange={(event) => chat.selectThread(event.target.value)}
            aria-label="Chat thread"
          >
            {!active && <option value="">No chats</option>}
            {chat.threads.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={chat.newChat}>
          New chat
        </button>
        {active && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Delete this local AI chat?')) chat.clearActiveChat();
            }}
          >
            Delete
          </button>
        )}
      </div>

      {!hasApiKey ? (
        <div className={styles.empty}>Set an OpenRouter key with /ai apikey to start chatting.</div>
      ) : !chat.modelSupportsTools ? (
        <div className={styles.empty} role="alert">
          {selectedModel ?? 'The selected model'} is not known to support tools. Choose a
          tool-capable model with /ai model.
        </div>
      ) : active && !active.intent ? (
        <section className={styles.intentChooser} aria-labelledby="ai-chat-intent-title">
          <strong id="ai-chat-intent-title">What would you like to do?</strong>
          <span>Choose once for this chat so the assistant uses the right source boundary.</span>
          <div>
            <button type="button" onClick={() => chat.setIntent('create')}>
              <strong>Create something new</strong>
              <span>
                Begin with an empty private draft and replace the editor only after Apply.
              </span>
            </button>
            <button type="button" onClick={() => chat.setIntent('edit')}>
              <strong>Edit current code</strong>
              <span>Inspect the live design and propose changes in a private draft.</span>
            </button>
          </div>
        </section>
      ) : !active?.turns.length ? (
        <div className={styles.empty}>
          <strong>
            {active?.intent === 'create'
              ? 'Describe the new design'
              : 'Ask about or change this design'}
          </strong>
          <span>
            Chat can inspect source, compiled geometry, and physics. Source edits stay private until
            you review and apply them.
          </span>
        </div>
      ) : (
        <ol ref={transcriptRef} className={styles.transcript} aria-live="polite">
          {active.turns.map((turn) => (
            <li key={turn.id} className={styles.turn}>
              <article>
                <h3 className="sr-only">User message</h3>
                <div className={styles.userMessage}>{turn.user.content}</div>
                <ol className={styles.steps}>
                  {turn.steps.map((step, index) => (
                    <Step key={`${step.kind}-${index}`} step={step} />
                  ))}
                </ol>
              </article>
            </li>
          ))}
          {pending && (
            <li>
              <AIQuestionSet
                questionSet={pending.questions}
                onSubmit={(answers: AiQuestionAnswer[]) => void chat.answerQuestions(answers)}
                onCancel={chat.cancelQuestions}
              />
            </li>
          )}
          {chat.proposal && (
            <li>
              <AICodeProposal
                proposal={chat.proposal}
                onApply={onApplyProposal}
                onDiscard={chat.discardDraft}
                onRebase={chat.rebaseDraft}
              />
            </li>
          )}
        </ol>
      )}

      <div className={styles.composer}>
        <textarea
          ref={composerRef}
          value={composer}
          rows={3}
          maxLength={8000}
          placeholder={
            active?.intent === 'create'
              ? 'Describe what you want to create…'
              : 'Ask about or change this design…'
          }
          disabled={
            !active?.intent ||
            !chat.canSend ||
            Boolean(pending) ||
            !hasApiKey ||
            !chat.modelSupportsTools
          }
          onChange={(event) => setComposer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {chat.isBusy ? (
          <button type="button" onClick={chat.cancelTurn}>
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!chat.canSend || !composer.trim() || Boolean(pending)}
          >
            Send
          </button>
        )}
      </div>
      {active && (
        <footer className={styles.usage}>
          {active.usage.totalTokens.toLocaleString()} tokens · {active.turns.length} turn(s) · local
          history
        </footer>
      )}
    </section>
  );
}
