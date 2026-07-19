import { useMemo, useState } from 'react';
import type { PreflightIssue, PreflightResult, PreflightSeverity } from '../lib/engine.ts';
import styles from './PreflightPanel.module.css';

interface Props {
  result: PreflightResult;
  onIssueHover: (issue: PreflightIssue | null) => void;
  onIssueSelect: (issue: PreflightIssue) => void;
}

const SEVERITIES: readonly PreflightSeverity[] = ['error', 'warning', 'info'];

export default function PreflightPanel({ result, onIssueHover, onIssueSelect }: Props) {
  const [showInfo, setShowInfo] = useState(true);
  const groups = useMemo(
    () =>
      SEVERITIES.flatMap((severity) => {
        if (severity === 'info' && !showInfo) return [];
        const issues = result.issues.filter((issue) => issue.severity === severity);
        const byCode = new Map<string, PreflightIssue[]>();
        for (const issue of issues) {
          const entries = byCode.get(issue.code);
          if (entries) entries.push(issue);
          else byCode.set(issue.code, [issue]);
        }
        return issues.length ? [{ severity, byCode }] : [];
      }),
    [result.issues, showInfo],
  );

  if (result.issues.length === 0) return null;

  return (
    <section className={styles.panel} aria-label="Preflight findings">
      <div className={styles.header}>
        <span>
          preflight · {result.summary.total} finding{result.summary.total === 1 ? '' : 's'}
        </span>
        {result.summary.info > 0 && (
          <button
            type="button"
            className={styles.infoToggle}
            aria-pressed={showInfo}
            onClick={() => setShowInfo((visible) => !visible)}
          >
            {showInfo ? 'hide' : 'show'} info ({result.summary.info})
          </button>
        )}
      </div>
      {groups.map(({ severity, byCode }) => (
        <div key={severity} className={styles.severityGroup} data-severity={severity}>
          <div className={styles.severityLabel}>
            {severity} · {result.summary[severity]}
          </div>
          {[...byCode].map(([code, issues]) => (
            <div key={code} className={styles.codeGroup}>
              <div className={styles.codeLabel}>
                {code}
                {issues.length > 1 ? ` ×${issues.length}` : ''}
              </div>
              {issues.map((issue, index) => (
                <button
                  key={`${code}-${index}`}
                  type="button"
                  className={styles.issue}
                  onMouseEnter={() => onIssueHover(issue)}
                  onMouseLeave={() => onIssueHover(null)}
                  onFocus={() => onIssueHover(issue)}
                  onBlur={() => onIssueHover(null)}
                  onClick={() => onIssueSelect(issue)}
                  title="Select attributed source lines and highlight design points"
                >
                  <span>{issue.message}</span>
                  {issue.suggestion && (
                    <span className={styles.suggestion}>{issue.suggestion}</span>
                  )}
                  {(issue.lines.length > 0 || issue.points.length > 0) && (
                    <span className={styles.location}>
                      {issue.lines.length > 0
                        ? `line${issue.lines.length === 1 ? '' : 's'} ${issue.lines.join(', ')}`
                        : 'no source line'}
                      {issue.points.length > 0
                        ? ` · ${issue.points.length} design point${issue.points.length === 1 ? '' : 's'}`
                        : ''}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
