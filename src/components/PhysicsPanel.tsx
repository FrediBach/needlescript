import { useEffect, useMemo, useState } from 'react';
import type {
  PhysicsDiagnostic,
  PhysicsDiagnosticCategory,
  PhysicsEvidence,
  PhysicsMeasurement,
  PhysicsReport,
  PreflightSeverity,
} from '../lib/engine.ts';
import { physicsStatusMessage, type PhysicsReportState } from '../physics-analysis-state.ts';
import {
  filterPhysicsDiagnostics,
  groupPhysicsDiagnostics,
  serializePhysicsDiagnosticReport,
} from './physics-panel-model.ts';
import styles from './PhysicsPanel.module.css';

interface Props {
  report?: PhysicsReport;
  reportState: PhysicsReportState;
  selectedDiagnosticId: string | null;
  onDiagnosticSelect: (diagnostic: PhysicsDiagnostic) => void;
  onDiagnosticHover: (diagnostic: PhysicsDiagnostic | null) => void;
}

const INFO_PREFERENCE_KEY = 'ns.physics.showInfo:v1';
const SEVERITIES: readonly PreflightSeverity[] = ['error', 'warning', 'info'];
const CATEGORY_LABELS: Record<PhysicsDiagnosticCategory, string> = {
  coverage: 'Coverage',
  penetration: 'Needle penetrations',
  stitch: 'Stitch length',
  path: 'Path movement',
  travel: 'Thread travel',
  satin: 'Satin construction',
  fill: 'Fill construction',
  underlay: 'Underlay',
  hoop: 'Hoop reach',
  machine: 'Machine operation',
  material: 'Material',
};
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

function readShowInfoPreference(): boolean {
  try {
    return localStorage.getItem(INFO_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatSummary(report: PhysicsReport): string {
  return [
    plural(report.summary.error, 'blocker'),
    plural(report.summary.warning, 'risk'),
    plural(report.summary.info, 'note'),
  ].join(', ');
}

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

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export default function PhysicsPanel({
  report,
  reportState,
  selectedDiagnosticId,
  onDiagnosticSelect,
  onDiagnosticHover,
}: Props) {
  const [showInfo, setShowInfo] = useState(readShowInfoPreference);
  const [enabledSeverities, setEnabledSeverities] = useState<Set<PreflightSeverity>>(
    () => new Set(['error', 'warning']),
  );
  const [category, setCategory] = useState<PhysicsDiagnosticCategory | 'all'>('all');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    try {
      localStorage.setItem(INFO_PREFERENCE_KEY, String(showInfo));
    } catch {
      // Storage may be unavailable in privacy-restricted browser contexts.
    }
  }, [showInfo]);

  const effectiveSeverities = useMemo(() => {
    const next = new Set(enabledSeverities);
    if (showInfo) next.add('info');
    return next;
  }, [enabledSeverities, showInfo]);

  const availableCategories = useMemo(
    () =>
      [
        ...new Set(report?.diagnostics.map(({ category: itemCategory }) => itemCategory) ?? []),
      ].toSorted((a, b) => CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b])),
    [report],
  );
  const filtered = useMemo(
    () =>
      filterPhysicsDiagnostics(
        report?.diagnostics ?? [],
        { severities: effectiveSeverities, category, selectedOnly },
        selectedDiagnosticId,
      ),
    [category, effectiveSeverities, report, selectedDiagnosticId, selectedOnly],
  );
  const groups = useMemo(() => groupPhysicsDiagnostics(filtered), [filtered]);
  const statusMessage = physicsStatusMessage(reportState);

  const toggleSeverity = (severity: PreflightSeverity) => {
    if (severity === 'info') {
      setShowInfo((visible) => !visible);
      return;
    }
    setEnabledSeverities((current) => {
      const next = new Set(current);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async () => {
    if (!report) return;
    try {
      await copyText(serializePhysicsDiagnosticReport(report, reportState));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <section className={styles.panel} aria-label="Physics findings">
      <div className={styles.statusHeader}>
        <div>
          <strong>{report ? formatSummary(report) : 'Physics analysis'}</strong>
          {statusMessage && (
            <span className={styles.lifecycle} data-status={reportState.status} role="status">
              {statusMessage}
            </span>
          )}
        </div>
        <button type="button" className={styles.copyButton} disabled={!report} onClick={handleCopy}>
          {copyState === 'copied'
            ? 'Report copied'
            : copyState === 'failed'
              ? 'Copy failed'
              : 'Copy diagnostic report'}
        </button>
      </div>

      {report && report.assumptions.length > 0 && (
        <div className={styles.assumptions} aria-label="Analysis assumptions">
          <span>Assumptions:</span>
          {report.assumptions.map((assumption) => (
            <span key={assumption.key} title={assumption.effect}>
              {assumption.label}: {assumption.value}
            </span>
          ))}
        </div>
      )}

      {report && report.diagnostics.length > 0 && (
        <div className={styles.filters} aria-label="Physics finding filters">
          <fieldset className={styles.severityFilters}>
            <legend>Severity</legend>
            {SEVERITIES.map((severity) => (
              <label key={severity}>
                <input
                  type="checkbox"
                  checked={severity === 'info' ? showInfo : enabledSeverities.has(severity)}
                  onChange={() => toggleSeverity(severity)}
                />
                {SEVERITY_LABELS[severity]}
              </label>
            ))}
          </fieldset>
          <label className={styles.selectFilter}>
            <span>Category</span>
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as PhysicsDiagnosticCategory | 'all')
              }
            >
              <option value="all">All categories</option>
              {availableCategories.map((itemCategory) => (
                <option key={itemCategory} value={itemCategory}>
                  {CATEGORY_LABELS[itemCategory]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.selectedFilter}>
            <input
              type="checkbox"
              checked={selectedOnly}
              disabled={!selectedDiagnosticId}
              onChange={(event) => setSelectedOnly(event.target.checked)}
            />
            Current selection
          </label>
        </div>
      )}

      {!report && reportState.status !== 'blocked' && (
        <div className={styles.emptyState}>Physics is checking the design…</div>
      )}
      {reportState.status === 'blocked' && (
        <div className={styles.blockedState}>
          <strong>Waiting for a valid design.</strong>
          <span>Fix the compiler diagnostics to run Physics checks.</span>
        </div>
      )}
      {report && report.diagnostics.length === 0 && reportState.status === 'current' && (
        <div className={styles.cleanState}>
          Physics checks complete — no modeled risks found for the selected material and machine
          assumptions. A physical test sew-out is still recommended.
        </div>
      )}
      {report && report.diagnostics.length > 0 && filtered.length === 0 && (
        <div className={styles.emptyState}>No findings match the current filters.</div>
      )}

      <div className={styles.groups}>
        {groups.map(([groupCategory, diagnostics]) => (
          <section key={groupCategory} className={styles.group}>
            <h3>
              {CATEGORY_LABELS[groupCategory]} <span>{diagnostics.length}</span>
            </h3>
            {diagnostics.map((diagnostic) => {
              const selected = diagnostic.id === selectedDiagnosticId;
              const expanded = expandedIds.has(diagnostic.id);
              const primaryLine = diagnostic.sourceLocations.find(
                ({ role }) => role === 'primary',
              )?.line;
              return (
                <article
                  key={diagnostic.id}
                  className={styles.card}
                  data-severity={diagnostic.severity}
                  data-selected={selected || undefined}
                  onMouseEnter={() => onDiagnosticHover(diagnostic)}
                  onMouseLeave={() => onDiagnosticHover(null)}
                >
                  <div className={styles.cardHeader}>
                    <button
                      type="button"
                      className={styles.selectCard}
                      aria-pressed={selected}
                      onFocus={() => onDiagnosticHover(diagnostic)}
                      onBlur={() => onDiagnosticHover(null)}
                      onClick={() => onDiagnosticSelect(diagnostic)}
                    >
                      <span className={styles.severity}>
                        {diagnostic.severity === 'error'
                          ? '◆'
                          : diagnostic.severity === 'warning'
                            ? '▲'
                            : '●'}{' '}
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
                    <button
                      type="button"
                      className={styles.expandButton}
                      aria-expanded={expanded}
                      aria-controls={`physics-details-${diagnostic.id}`}
                      onClick={() => toggleExpanded(diagnostic.id)}
                    >
                      {expanded ? 'Hide details' : 'Show details'}
                    </button>
                  </div>
                  {expanded && (
                    <div id={`physics-details-${diagnostic.id}`} className={styles.cardDetails}>
                      <p>{diagnostic.explanation}</p>
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
            })}
          </section>
        ))}
      </div>
    </section>
  );
}
