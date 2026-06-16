import { useRef, useState, useEffect } from 'react';
import { EXAMPLES, GALLERY_EXAMPLES } from '../data.ts';
import type { HoopConfig } from '../data.ts';
import { HoopIcon } from './HoopDialog.tsx';
import styles from './Header.module.css';

export type ExportFormat = 'dst' | 'pes' | 'exp';

interface Props {
  hoop: HoopConfig;
  onOpenHoopDialog: () => void;
  onSVGImport: () => void;
  onExampleSelect: (key: string) => void;
  onRun: () => void;
  onDownload: (format: ExportFormat) => void;
  onShare: () => Promise<void>;
  onOpenReference: () => void;
}

// Inline version of needlescript-logo-icon.svg with:
//   - background rect removed (transparent)
//   - all fills set to currentColor so it inherits the wordmark text colour
// The original public/needlescript-logo-icon.svg (black on white) is used
// unchanged as the favicon.
function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 692 692" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0_9_26)">
      <rect x="123" y="520.009" width="578" height="77" rx="38.5" transform="rotate(-45 123 520.009)" fill="currentColor"/>
      <path d="M557.932 493.786C572.966 508.821 572.967 533.198 557.932 548.233C542.897 563.268 518.52 563.268 503.484 548.233L370.503 415.252L424.95 360.805L557.932 493.786ZM149.224 139.525C164.259 124.49 188.636 124.49 203.671 139.525L337.269 273.123L282.821 327.57L149.224 193.973C134.188 178.938 134.188 154.561 149.224 139.525Z" fill="currentColor"/>
      <path d="M92 208C33.6349 129.275 130.431 30.0039 213.5 82" stroke="currentColor" stroke-width="48" stroke-linecap="round"/>
      <path d="M614 208C672.365 129.275 575.569 30.0039 492.5 82" stroke="currentColor" stroke-width="48" stroke-linecap="round"/>
      <path d="M92 473C33.6349 551.725 130.431 650.996 213.5 599" stroke="currentColor" stroke-width="48" stroke-linecap="round"/>
      <path d="M614 473C672.365 551.725 575.569 650.996 492.5 599" stroke="currentColor" stroke-width="48" stroke-linecap="round"/>
      </g>
      <defs>
      <clipPath id="clip0_9_26">
      <rect width="692" height="692" fill="white"/>
      </clipPath>
      </defs>
    </svg>
  );
}

// Strip the " — description" suffix from built-in example keys,
// leaving only the short name: "bloom — rose of circles" → "bloom"
function shortName(key: string): string {
  const sep = key.indexOf(' — ');
  return sep >= 0 ? key.slice(0, sep) : key;
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  dst: 'Download .DST',
  pes: 'Download .PES',
  exp: 'Download .EXP',
};

/** Dropdown export button — opens a small menu with three format options. */
function ExportDropdown({ onDownload }: { onDownload: (fmt: ExportFormat) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.exportDropdown}>
      <button
        type="button"
        className={styles.dlBtn}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export embroidery file"
      >
        Export&nbsp;&nbsp;<span className={styles.dlArrow} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="menu" className={styles.dlMenu}>
          {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map(fmt => (
            <button
              key={fmt}
              type="button"
              role="menuitem"
              className={styles.dlMenuItem}
              onClick={() => { setOpen(false); onDownload(fmt); }}
            >
              {FORMAT_LABELS[fmt]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Share button — calls onShare, briefly shows "Copied!" on success, "Failed" on error. */
function ShareButton({ onShare }: { onShare: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'pending' | 'copied' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleClick() {
    if (state === 'pending') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('pending');
    try {
      await onShare();
      setState('copied');
    } catch {
      setState('error');
    }
    timerRef.current = setTimeout(() => setState('idle'), 2000);
  }

  const label = state === 'pending' ? '…'
    : state === 'copied' ? 'Copied!'
    : state === 'error'  ? 'Failed'
    : 'Share';

  return (
    <button
      type="button"
      className={`${styles.shareBtn} ${state === 'copied' ? styles.shareBtnCopied : ''} ${state === 'error' ? styles.shareBtnError : ''}`}
      onClick={handleClick}
      disabled={state === 'pending'}
      aria-label="Copy shareable link to clipboard"
    >
      {label}
    </button>
  );
}

export default function Header({
  hoop, onOpenHoopDialog, onSVGImport, onExampleSelect, onRun, onDownload, onShare, onOpenReference,
}: Props) {
  const selectRef = useRef<HTMLSelectElement>(null);

  function handleExampleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onExampleSelect(e.target.value);
  }

  return (
    <header className={styles.header}>
      <div className={styles.wordmark}>
        <LogoIcon size={24} />
        <h1>NeedleScript</h1>
        <span className={styles.tag}>Logo inspired programming language for generative embroidery</span>
      </div>

      <button
        type="button"
        className={styles.hoopBtn}
        onClick={onOpenHoopDialog}
        title="Change hoop size and shape"
        aria-label={`Hoop: ${hoop.label}`}
      >
        <HoopIcon hoop={hoop} size={15} />
        <span>{hoop.label}</span>
      </button>

      <button type="button" className={styles.btn} onClick={onSVGImport}>Import SVG</button>

      <select
        ref={selectRef}
        aria-label="Example programs"
        className={styles.select}
        onChange={handleExampleChange}
        defaultValue=""
      >
        <option value="" disabled>examples</option>
        {Object.keys(EXAMPLES).map(k => (
          <option key={k} value={k}>{shortName(k)}</option>
        ))}
        {Object.keys(GALLERY_EXAMPLES).map(k => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>

      <button type="button" className={styles.runBtn} onClick={onRun}>
        Run&nbsp;&nbsp;<kbd>⌘↵</kbd>
      </button>

      <ExportDropdown onDownload={onDownload} />

      <ShareButton onShare={onShare} />

      <button type="button" className={styles.helpBtn} onClick={onOpenReference} aria-label="Language reference">?</button>
    </header>
  );
}
