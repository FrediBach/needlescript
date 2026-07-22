import type { AiCodeProposal } from '../ai/chat-types.ts';
import styles from './AIChatPanel.module.css';

interface Props {
  proposal: AiCodeProposal;
  onApply: () => void;
  onDiscard: () => void;
  onRebase: () => void;
}

export default function AICodeProposal({ proposal, onApply, onDiscard, onRebase }: Props) {
  return (
    <section className={styles.proposal} aria-label="Proposed source change">
      <div className={styles.proposalHeading}>
        <strong>Proposed source change</strong>
        <span>
          +{proposal.addedLines} −{proposal.removedLines} lines
        </span>
      </div>
      <div className={styles.proposalMeta}>
        Draft revision {proposal.draftRevision}
        {proposal.compile ? ` · ${proposal.compile.summary}` : ' · Not compiled yet'}
      </div>
      {proposal.stale && (
        <div className={styles.stale} role="alert">
          Live source changed after this draft began. Rebase or discard before applying.
        </div>
      )}
      <details>
        <summary>Show line diff</summary>
        <pre className={styles.diff}>
          {proposal.diff.map((line, index) => (
            <span key={`${line.kind}-${index}`} data-kind={line.kind}>
              {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '} {line.text}
              {'\n'}
            </span>
          ))}
        </pre>
      </details>
      <div className={styles.proposalActions}>
        {proposal.stale ? (
          <button type="button" onClick={onRebase}>
            Rebase on live source
          </button>
        ) : (
          <button type="button" onClick={onApply}>
            Apply
          </button>
        )}
        <button type="button" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </section>
  );
}
