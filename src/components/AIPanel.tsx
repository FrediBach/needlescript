import {
  aiActivityUsageTotal,
  type AiActivitySession,
  type AiActivityStatus,
} from '../ai-activity.ts';
import styles from './AIPanel.module.css';

interface Props {
  activity: AiActivitySession | null;
  selectedModel?: string;
  hasApiKey?: boolean;
}

const STATUS_LABELS: Record<AiActivityStatus, string> = {
  running: 'Working',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function formatDuration(activity: AiActivitySession): string {
  const end = activity.finishedAt ?? Date.now();
  const duration = Math.max(0, end - activity.startedAt);
  return duration < 1000 ? `${duration} ms` : `${(duration / 1000).toFixed(1)} s`;
}

function formatOffset(activity: AiActivitySession, at: number): string {
  const offset = Math.max(0, at - activity.startedAt);
  return `+${offset < 1000 ? `${offset} ms` : `${(offset / 1000).toFixed(1)} s`}`;
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0';
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

export default function AIPanel({ activity, selectedModel, hasApiKey }: Props) {
  if (!activity) {
    return (
      <section className={styles.panel} aria-label="AI activity">
        <div className={styles.emptyState}>
          <strong>No AI activity yet</strong>
          <span>
            {hasApiKey
              ? `Run /ai create, improve, fix, or explain to inspect requests, revisions, compiler checks, and physics feedback here.`
              : 'Set an OpenRouter key with /ai apikey to enable AI commands.'}
          </span>
          {selectedModel && <span>Selected model: {selectedModel}</span>}
        </div>
      </section>
    );
  }

  const usage = aiActivityUsageTotal(activity);
  const requestCount = activity.events.reduce(
    (count, event) => count + Number(event.phase === 'response'),
    0,
  );

  return (
    <section
      className={styles.panel}
      aria-label="AI activity"
      aria-busy={activity.status === 'running'}
    >
      <header className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <strong>/ai {activity.command}</strong>
            <span className={styles.status} data-status={activity.status} role="status">
              {STATUS_LABELS[activity.status]}
            </span>
          </div>
          <div className={styles.instruction}>{activity.instruction}</div>
          <div className={styles.meta}>
            <span>{activity.model}</span>
            <span>{requestCount} model request(s)</span>
            <span>{formatDuration(activity)}</span>
          </div>
        </div>
        {usage && (
          <div className={styles.usage} aria-label="AI usage">
            <span>{usage.totalTokens.toLocaleString()} tokens</span>
            <span>
              {usage.promptTokens.toLocaleString()} in · {usage.completionTokens.toLocaleString()}{' '}
              out
            </span>
            {usage.cost !== undefined && <span>{formatCost(usage.cost)}</span>}
          </div>
        )}
      </header>

      <ol className={styles.timeline} aria-label="AI activity timeline" aria-live="polite">
        {activity.events.map((event) => (
          <li key={event.id} className={styles.event} data-tone={event.tone}>
            <span className={styles.marker} aria-hidden="true" />
            <div className={styles.eventBody}>
              <div className={styles.eventHeading}>
                <strong>{event.title}</strong>
                <time dateTime={new Date(event.at).toISOString()}>
                  {formatOffset(activity, event.at)}
                </time>
              </div>
              {event.summary && <div className={styles.summary}>{event.summary}</div>}
              {event.usage && (
                <div className={styles.eventUsage}>
                  {event.usage.totalTokens.toLocaleString()} tokens
                  {event.usage.cost === undefined ? '' : ` · ${formatCost(event.usage.cost)}`}
                </div>
              )}
              {event.detail && (
                <details className={styles.details}>
                  <summary>Show details</summary>
                  <pre>{event.detail}</pre>
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
