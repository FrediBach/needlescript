import { useEffect, useMemo, useState } from 'react';
import type {
  PhysicsDiagnostic,
  PhysicsDiagnosticCategory,
  PhysicsReport,
  PreflightSeverity,
} from '../lib/engine.ts';
import { physicsStatusMessage, type PhysicsReportState } from '../physics-analysis-state.ts';
import {
  filterPhysicsDiagnostics,
  groupPhysicsDiagnostics,
  serializePhysicsDiagnosticReport,
  type PhysicsAcknowledgmentFilter,
} from './physics-panel-model.ts';
import {
  acknowledgePhysicsDiagnostic,
  isPhysicsDiagnosticAcknowledged,
  readPhysicsAcknowledgments,
  removePhysicsAcknowledgment,
  writePhysicsAcknowledgments,
  type PhysicsAcknowledgment,
} from './physics-acknowledgments-model.ts';
import type { PhysicsQuickFix, PhysicsQuickFixOutcome } from './physics-remedies-model.ts';
import PhysicsDiagnosticCard from './PhysicsDiagnosticCard.tsx';
import styles from './PhysicsPanel.module.css';

interface Props {
  report?: PhysicsReport;
  reportState: PhysicsReportState;
  projectKey: string;
  selectedDiagnosticId: string | null;
  onDiagnosticSelect: (diagnostic: PhysicsDiagnostic) => void;
  onDiagnosticHover: (diagnostic: PhysicsDiagnostic | null) => void;
  quickFixes: ReadonlyMap<string, PhysicsQuickFix>;
  quickFixPreview: PhysicsQuickFix | null;
  quickFixOutcome: PhysicsQuickFixOutcome | null;
  onQuickFixPreview: (fix: PhysicsQuickFix) => void;
  onQuickFixCancel: () => void;
  onQuickFixApply: (fix: PhysicsQuickFix) => void;
  onQuickFixOutcomeDismiss: () => void;
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

function readShowInfoPreference(): boolean {
  try {
    return localStorage.getItem(INFO_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function readProjectAcknowledgments(projectKey: string): Map<string, PhysicsAcknowledgment> {
  try {
    return readPhysicsAcknowledgments(localStorage, projectKey);
  } catch {
    return new Map();
  }
}

interface PhysicsFiltersProps {
  showInfo: boolean;
  enabledSeverities: ReadonlySet<PreflightSeverity>;
  category: PhysicsDiagnosticCategory | 'all';
  availableCategories: readonly PhysicsDiagnosticCategory[];
  acknowledgmentFilter: PhysicsAcknowledgmentFilter;
  acknowledgedCount: number;
  selectedOnly: boolean;
  hasSelection: boolean;
  onSeverityToggle: (severity: PreflightSeverity) => void;
  onCategoryChange: (category: PhysicsDiagnosticCategory | 'all') => void;
  onAcknowledgmentFilterChange: (filter: PhysicsAcknowledgmentFilter) => void;
  onSelectedOnlyChange: (selectedOnly: boolean) => void;
}

function PhysicsFilters({
  showInfo,
  enabledSeverities,
  category,
  availableCategories,
  acknowledgmentFilter,
  acknowledgedCount,
  selectedOnly,
  hasSelection,
  onSeverityToggle,
  onCategoryChange,
  onAcknowledgmentFilterChange,
  onSelectedOnlyChange,
}: PhysicsFiltersProps) {
  return (
    <div className={styles.filters} aria-label="Physics finding filters">
      <fieldset className={styles.severityFilters}>
        <legend>Severity</legend>
        {SEVERITIES.map((severity) => (
          <label key={severity}>
            <input
              type="checkbox"
              checked={severity === 'info' ? showInfo : enabledSeverities.has(severity)}
              onChange={() => onSeverityToggle(severity)}
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
            onCategoryChange(event.target.value as PhysicsDiagnosticCategory | 'all')
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
      <label className={styles.selectFilter}>
        <span>Status</span>
        <select
          value={acknowledgmentFilter}
          onChange={(event) =>
            onAcknowledgmentFilterChange(event.target.value as PhysicsAcknowledgmentFilter)
          }
        >
          <option value="active">Active findings</option>
          <option value="acknowledged">Acknowledged findings ({acknowledgedCount})</option>
          <option value="all">All findings</option>
        </select>
      </label>
      <label className={styles.selectedFilter}>
        <input
          type="checkbox"
          checked={selectedOnly}
          disabled={!hasSelection}
          onChange={(event) => onSelectedOnlyChange(event.target.checked)}
        />
        Current selection
      </label>
    </div>
  );
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
  projectKey,
  selectedDiagnosticId,
  onDiagnosticSelect,
  onDiagnosticHover,
  quickFixes,
  quickFixPreview,
  quickFixOutcome,
  onQuickFixPreview,
  onQuickFixCancel,
  onQuickFixApply,
  onQuickFixOutcomeDismiss,
}: Props) {
  const [showInfo, setShowInfo] = useState(readShowInfoPreference);
  const [enabledSeverities, setEnabledSeverities] = useState<Set<PreflightSeverity>>(
    () => new Set(['error', 'warning']),
  );
  const [category, setCategory] = useState<PhysicsDiagnosticCategory | 'all'>('all');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [acknowledgmentFilter, setAcknowledgmentFilter] =
    useState<PhysicsAcknowledgmentFilter>('active');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [acknowledgments, setAcknowledgments] = useState(() =>
    readProjectAcknowledgments(projectKey),
  );

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
        {
          severities: effectiveSeverities,
          category,
          selectedOnly,
          acknowledgment: acknowledgmentFilter,
        },
        selectedDiagnosticId,
        acknowledgments,
      ),
    [
      acknowledgmentFilter,
      acknowledgments,
      category,
      effectiveSeverities,
      report,
      selectedDiagnosticId,
      selectedOnly,
    ],
  );
  const groups = useMemo(() => groupPhysicsDiagnostics(filtered), [filtered]);
  const statusMessage = physicsStatusMessage(reportState);
  const acknowledgedCount =
    report?.diagnostics.filter((diagnostic) =>
      isPhysicsDiagnosticAcknowledged(diagnostic, acknowledgments),
    ).length ?? 0;

  const updateAcknowledgments = (next: Map<string, PhysicsAcknowledgment>) => {
    try {
      writePhysicsAcknowledgments(localStorage, projectKey, next);
    } catch {
      // The acknowledgment still applies for this session when storage is unavailable.
    }
    setAcknowledgments(next);
  };

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
          {acknowledgedCount > 0 && (
            <span className={styles.acknowledgedCount}>
              {plural(acknowledgedCount, 'acknowledged finding')}
            </span>
          )}
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

      {quickFixOutcome && (
        <div
          className={styles.quickFixOutcome}
          data-status={quickFixOutcome.status}
          role={
            quickFixOutcome.status === 'error' || quickFixOutcome.status === 'warning'
              ? 'alert'
              : 'status'
          }
        >
          <div>
            <strong>
              {quickFixOutcome.status === 'checking'
                ? 'Checking change'
                : quickFixOutcome.status === 'success'
                  ? 'Change checked'
                  : quickFixOutcome.status === 'error'
                    ? 'Change needs attention'
                    : 'Review comparison'}
            </strong>
            <span>{quickFixOutcome.message}</span>
            {quickFixOutcome.introduced.length > 0 && (
              <ul>
                {quickFixOutcome.introduced.map((finding) => (
                  <li key={finding}>{finding}</li>
                ))}
              </ul>
            )}
          </div>
          {quickFixOutcome.status !== 'checking' && (
            <button type="button" onClick={onQuickFixOutcomeDismiss}>
              Dismiss
            </button>
          )}
        </div>
      )}

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
        <PhysicsFilters
          showInfo={showInfo}
          enabledSeverities={enabledSeverities}
          category={category}
          availableCategories={availableCategories}
          acknowledgmentFilter={acknowledgmentFilter}
          acknowledgedCount={acknowledgedCount}
          selectedOnly={selectedOnly}
          hasSelection={selectedDiagnosticId !== null}
          onSeverityToggle={toggleSeverity}
          onCategoryChange={setCategory}
          onAcknowledgmentFilterChange={setAcknowledgmentFilter}
          onSelectedOnlyChange={setSelectedOnly}
        />
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
            {diagnostics.map((diagnostic) => (
              <PhysicsDiagnosticCard
                key={diagnostic.id}
                diagnostic={diagnostic}
                selected={diagnostic.id === selectedDiagnosticId}
                expanded={expandedIds.has(diagnostic.id)}
                quickFix={quickFixes.get(diagnostic.id)}
                quickFixPreview={quickFixPreview}
                acknowledgment={acknowledgments.get(diagnostic.fingerprint)}
                onSelect={onDiagnosticSelect}
                onHover={onDiagnosticHover}
                onToggleExpanded={toggleExpanded}
                onQuickFixPreview={onQuickFixPreview}
                onQuickFixCancel={onQuickFixCancel}
                onQuickFixApply={onQuickFixApply}
                onAcknowledge={(finding, reason) =>
                  updateAcknowledgments(
                    acknowledgePhysicsDiagnostic(acknowledgments, finding, reason),
                  )
                }
                onRemoveAcknowledgment={(finding) =>
                  updateAcknowledgments(
                    removePhysicsAcknowledgment(acknowledgments, finding.fingerprint),
                  )
                }
              />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
