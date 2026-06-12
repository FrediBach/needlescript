import { useEffect } from 'react';
import type { HoopConfig } from '../data.ts';
import { HOOPS } from '../data.ts';
import styles from './HoopDialog.module.css';

// Hoop shape icon — used in both the dialog and the header button
export function HoopIcon({ hoop, size = 20 }: { hoop: HoopConfig; size?: number }) {
  const pad = size * 0.12;
  const hw = size / 2;
  const aspect = hoop.widthMM / hoop.heightMM;
  const maxW = size - pad * 2;
  const maxH = size - pad * 2;

  let shapeW: number, shapeH: number;
  if (aspect >= 1) {
    shapeW = maxW;
    shapeH = maxW / aspect;
  } else {
    shapeH = maxH;
    shapeW = maxH * aspect;
  }

  const rx = shapeW / 2;
  const ry = shapeH / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {hoop.shape === 'circle' && (
        <circle cx={hw} cy={hw} r={rx} stroke="currentColor" strokeWidth="1.5" />
      )}
      {hoop.shape === 'oval' && (
        <ellipse cx={hw} cy={hw} rx={rx} ry={ry} stroke="currentColor" strokeWidth="1.5" />
      )}
      {hoop.shape === 'rectangle' && (
        <rect
          x={hw - rx}
          y={hw - ry}
          width={shapeW}
          height={shapeH}
          rx={2.5}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

interface Props {
  open: boolean;
  current: HoopConfig;
  onSelect: (hoop: HoopConfig) => void;
  onClose: () => void;
}

export default function HoopDialog({ open, current, onSelect, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Hoop size and shape">
        <div className={styles.header}>
          <span className={styles.title}>Hoop size &amp; shape</span>
          <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.grid}>
          {HOOPS.map(hoop => (
            <button
              key={hoop.id}
              className={`${styles.option}${hoop.id === current.id ? ' ' + styles.selected : ''}`}
              onClick={() => { onSelect(hoop); onClose(); }}
              aria-pressed={hoop.id === current.id}
            >
              <HoopIcon hoop={hoop} size={38} />
              <span className={styles.optionLabel}>{hoop.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
