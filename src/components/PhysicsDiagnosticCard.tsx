import type {
  PhysicsDiagnostic,
  PhysicsEvidence,
  PhysicsMeasurement,
  PreflightSeverity,
} from '../lib/engine.ts';
import type { PhysicsQuickFix } from './physics-remedies-model.ts';
import styles from './PhysicsPanel.module.css';

interface Props {
  diagnostic: PhysicsDiagnostic;
  selected: boolean;
  expanded: boolean;
  quickFix?: PhysicsQuickFix;
  quickFixPreview: PhysicsQuickFix | null;
  onSelect: (diagnostic: PhysicsDiagnostic) => void;
  onHover: (diagnostic: PhysicsDiagnostic | null) => void;
  onToggleExpanded: (id: string) => void;
  onQuickFixPreview: (fix: PhysicsQuickFix) => void;
  onQuickFixCancel: () => void;
  onQuickFixApply: (fix: PhysicsQuickFix) => void;
}

const SEVERITY_LABELS: Record<PreflightSeverity, string> = {
  error: 'Blocker',
  warning: 'Risk',
  info: 'Note',
};

const EVIDENCE_LABELS: Record<PhysicsEvidence, string> = {
  'hard-limit': 'Hard limit',
  'machine-profile': 'Machine profile',
  'engine-derived': 'Engine-derived',
  heuristic: 'Generic heuristic',
  experimental: 'Experimental model',
};

function formatMeasurement(measurement: PhysicsMeasurement): string {
  const value = `${measurement.value.toLocaleString()} ${measurement.unit}`;
  if (measurement.threshold === undefined) return `${measurement.label}: ${value}`;
  const comparison =
    measurement.comparison === 'below'
      ? 'minimum'
      : measurement.comparison === 'outside'
        ? 'range limit'
        : 'limit';
  return `${measurement.label}: ${value}; ${comparison} ${measurement.threshold.toLocaleString()} ${measurement.unit}`;
}

export default function PhysicsDiagnosticCard({
  diagnostic,
  selected,
  expanded,
  quickFix,
  quickFixPreview,
  onSelect,
  onHover,
  onToggleExpanded,
  onQuickFixPreview,
  onQuickFixCancel,
  onQuickFixApply,
}: Props) {
  const primaryLine = diagnostic.sourceLocations.find(({ role }) => role === 'primary')?.line;
  const previewing = quickFixPreview?.diagnosticId === diagnostic.id;
  return (
    <article
      className={styles.card}
      data-severity={diagnostic.severity}
      data-selected={selected || undefined}
      onMouseEnter={() => onHover(diagnostic)}
      onMouseLeave={() => onHover(null)}
    >
      <div className={styles.cardHeader}>
        <button
          type="button"
          className={styles.selectCard}
          aria-pressed={selected}
          onFocus={() => onHover(diagnostic)}
          onBlur={() => onHover(null)}
          onClick={() => onSelect(diagnostic)}
        >
          <span className={styles.severity}>
            {diagnostic.severity === 'error' ? '◆' : diagnostic.severity === 'warning' ? '▲' : '●'}{' '}
            {SEVERITY_LABELS[diagnostic.severity]}
          </span>
          <strong>{diagnostic.title}</strong>
          <span className={styles.cardMeta}>
            {EVIDENCE_LABELS[diagnostic.evidence]}
            {primaryLine !== undefined ? ` · line ${primaryLine}` : ' · generated'}
          </span>
          {diagnostic.measurements?.slice(0, 1).map((measurement) => (
            <span key={measurement.label} className={styles.measurement}>
              {formatMeasurement(measurement)}
            </span>
          ))}
        </button>
        <div className={styles.cardActions}>
          {quickFix && (
            <button
              type="button"
              className={styles.quickFixButton}
              aria-expanded={previewing}
              onClick={() => onQuickFixPreview(quickFix)}
            >
              Preview safe edit
            </button>
          )}
          <button
            type="button"
            className={styles.expandButton}
            aria-expanded={expanded}
            aria-controls={`physics-details-${diagnostic.id}`}
            onClick={() => onToggleExpanded(diagnostic.id)}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>
      {previewing && quickFixPreview && (
        <div className={styles.quickFixPreview} aria-label="Source edit preview">
          <strong>{quickFixPreview.title}</strong>
          <p>{quickFixPreview.description}</p>
          <pre aria-label={`Source diff for line ${quickFixPreview.diff.line}`}>
            <code>
              <span className={styles.diffRemoved}>- {quickFixPreview.diff.before}</span>
              {'\n'}
              <span className={styles.diffAdded}>+ {quickFixPreview.diff.after}</span>
            </code>
          </pre>
          <span className={styles.quickFixCaveat}>
            Applying creates one undo step, recompiles immediately, and compares the before/after
            findings.
          </span>
          <div className={styles.previewActions}>
            <button type="button" onClick={() => onQuickFixApply(quickFixPreview)}>
              Apply change
            </button>
            <button type="button" onClick={onQuickFixCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {expanded && (
        <div id={`physics-details-${diagnostic.id}`} className={styles.cardDetails}>
          <p>{diagnostic.explanation}</p>
          {diagnostic.methodology && (
            <p>
              <strong>Method:</strong> {diagnostic.methodology}
            </p>
          )}
          {diagnostic.limitations && diagnostic.limitations.length > 0 && (
            <p>
              <strong>Limitations:</strong> {diagnostic.limitations.join(' ')}
            </p>
          )}
          {diagnostic.performanceCap && (
            <p>
              <strong>Analysis cap:</strong> {diagnostic.performanceCap}
            </p>
          )}
          {diagnostic.measurements && diagnostic.measurements.length > 1 && (
            <ul>
              {diagnostic.measurements.slice(1).map((measurement) => (
                <li key={measurement.label}>{formatMeasurement(measurement)}</li>
              ))}
            </ul>
          )}
          {diagnostic.remedies.length > 0 && (
            <div className={styles.remedies}>
              <strong>Try</strong>
              <ul>
                {diagnostic.remedies.slice(0, 2).map((remedy) => (
                  <li key={remedy.id}>
                    <span>{remedy.title}</span> — {remedy.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <code>{diagnostic.code}</code>
        </div>
      )}
    </article>
  );
}
