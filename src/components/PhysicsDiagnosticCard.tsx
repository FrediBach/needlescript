import { useState } from 'react';
import type {
  PhysicsDiagnostic,
  PhysicsEvidence,
  PhysicsMeasurement,
  PreflightSeverity,
} from '../lib/engine.ts';
import {
  canAcknowledgePhysicsDiagnostic,
  PHYSICS_ACKNOWLEDGMENT_REASON_MAX_LENGTH,
  type PhysicsAcknowledgment,
} from './physics-acknowledgments-model.ts';
import type { PhysicsQuickFix } from './physics-remedies-model.ts';
import styles from './PhysicsPanel.module.css';

interface Props {
  diagnostic: PhysicsDiagnostic;
  selected: boolean;
  expanded: boolean;
  quickFix?: PhysicsQuickFix;
  quickFixPreview: PhysicsQuickFix | null;
  acknowledgment?: PhysicsAcknowledgment;
  onSelect: (diagnostic: PhysicsDiagnostic) => void;
  onHover: (diagnostic: PhysicsDiagnostic | null) => void;
  onToggleExpanded: (id: string) => void;
  onQuickFixPreview: (fix: PhysicsQuickFix) => void;
  onQuickFixCancel: () => void;
  onQuickFixApply: (fix: PhysicsQuickFix) => void;
  onAcknowledge: (diagnostic: PhysicsDiagnostic, reason: string) => void;
  onRemoveAcknowledgment: (diagnostic: PhysicsDiagnostic) => void;
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
  acknowledgment,
  onSelect,
  onHover,
  onToggleExpanded,
  onQuickFixPreview,
  onQuickFixCancel,
  onQuickFixApply,
  onAcknowledge,
  onRemoveAcknowledgment,
}: Props) {
  const [showAcknowledgmentForm, setShowAcknowledgmentForm] = useState(false);
  const [acknowledgmentReason, setAcknowledgmentReason] = useState('');
  const primaryLine = diagnostic.sourceLocations.find(({ role }) => role === 'primary')?.line;
  const headingId = `physics-heading-${diagnostic.id}`;
  const previewing = quickFixPreview?.diagnosticId === diagnostic.id;
  const canAcknowledge = canAcknowledgePhysicsDiagnostic(diagnostic);
  const submitAcknowledgment = () => {
    const reason = acknowledgmentReason.trim();
    if (!reason) return;
    onAcknowledge(diagnostic, reason);
    setAcknowledgmentReason('');
    setShowAcknowledgmentForm(false);
  };
  return (
    <article
      className={styles.card}
      data-severity={diagnostic.severity}
      data-selected={selected || undefined}
      data-acknowledged={acknowledgment ? true : undefined}
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
            <span aria-hidden="true">
              {diagnostic.severity === 'error'
                ? '◆'
                : diagnostic.severity === 'warning'
                  ? '▲'
                  : '●'}{' '}
            </span>
            {SEVERITY_LABELS[diagnostic.severity]}
          </span>
          <strong id={headingId}>{diagnostic.title}</strong>
          <span className={styles.cardMeta}>
            {EVIDENCE_LABELS[diagnostic.evidence]}
            {primaryLine !== undefined ? ` · line ${primaryLine}` : ' · generated'}
            {acknowledgment ? ' · Acknowledged' : ''}
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
            aria-label={`${expanded ? 'Hide' : 'Show'} details for ${diagnostic.title}`}
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
        <div
          id={`physics-details-${diagnostic.id}`}
          className={styles.cardDetails}
          role="region"
          aria-labelledby={headingId}
        >
          {acknowledgment && (
            <div className={styles.acknowledgment}>
              <strong>Acknowledged for this project</strong>
              <span>{acknowledgment.reason}</span>
              <button type="button" onClick={() => onRemoveAcknowledgment(diagnostic)}>
                Remove acknowledgment
              </button>
            </div>
          )}
          {showAcknowledgmentForm && !acknowledgment && (
            <form
              className={styles.acknowledgmentForm}
              onSubmit={(event) => {
                event.preventDefault();
                submitAcknowledgment();
              }}
            >
              <label htmlFor={`physics-acknowledgment-${diagnostic.id}`}>
                Why is this finding intentional for this project?
              </label>
              <textarea
                id={`physics-acknowledgment-${diagnostic.id}`}
                value={acknowledgmentReason}
                required
                maxLength={PHYSICS_ACKNOWLEDGMENT_REASON_MAX_LENGTH}
                rows={2}
                autoFocus
                onChange={(event) => setAcknowledgmentReason(event.target.value)}
              />
              <span>
                This local acknowledgment does not change the source, stitches, or export policy.
              </span>
              <div className={styles.acknowledgmentActions}>
                <button type="submit" disabled={!acknowledgmentReason.trim()}>
                  Save acknowledgment
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAcknowledgmentReason('');
                    setShowAcknowledgmentForm(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
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
          <p>
            <strong>Threshold set:</strong> {diagnostic.thresholdVersion}
          </p>
          {diagnostic.evidenceReferences.length > 0 && (
            <div className={styles.evidenceReferences}>
              <strong>Evidence references</strong>
              <ul>
                {diagnostic.evidenceReferences.map((reference) => (
                  <li key={`${reference.id}@${reference.version}`}>
                    {reference.title} v{reference.version}
                    {reference.status === 'pending' ? ' — physical validation pending' : ''}
                  </li>
                ))}
              </ul>
            </div>
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
          {!acknowledgment && canAcknowledge && !showAcknowledgmentForm && (
            <button
              type="button"
              className={styles.acknowledgeButton}
              aria-expanded={showAcknowledgmentForm}
              onClick={() => setShowAcknowledgmentForm(true)}
            >
              Acknowledge for this project
            </button>
          )}
          {!canAcknowledge && (
            <p className={styles.acknowledgmentUnavailable}>
              Blockers and hard-limit findings cannot be acknowledged.
            </p>
          )}
          <code>{diagnostic.code}</code>
        </div>
      )}
    </article>
  );
}
