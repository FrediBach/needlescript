import { useRef } from 'react';
import { EXAMPLES } from '../data.ts';
import styles from './Header.module.css';

interface Props {
  fitMM: number;
  onFitMMChange: (v: number) => void;
  onSVGImport: () => void;
  onExampleSelect: (key: string) => void;
  onRun: () => void;
  onDownloadDST: () => void;
}

export default function Header({
  fitMM, onFitMMChange, onSVGImport, onExampleSelect, onRun, onDownloadDST,
}: Props) {
  const selectRef = useRef<HTMLSelectElement>(null);

  function handleExampleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onExampleSelect(e.target.value);
  }

  return (
    <header className={styles.header}>
      <div className={styles.wordmark}>
        <h1>
          <span className={styles.needle}>N</span>eedlescript
        </h1>
        <span className={styles.tag}>a turtle that sews — programs export to Tajima .DST</span>
      </div>

      <label className={styles.fit}>
        fit{' '}
        <input
          type="number"
          value={fitMM}
          min={10}
          max={190}
          step={5}
          aria-label="Import size in millimetres"
          onChange={e => onFitMMChange(Number(e.target.value))}
        />{' '}
        mm
      </label>

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
          <option key={k} value={k}>{k}</option>
        ))}
      </select>

      <button type="button" className={styles.runBtn} onClick={onRun}>
        Run&nbsp;&nbsp;<kbd>⌘↵</kbd>
      </button>

      <button type="button" className={styles.dlBtn} onClick={onDownloadDST}>Download .DST</button>
    </header>
  );
}
