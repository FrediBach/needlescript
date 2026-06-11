import type { DesignState } from '../App.tsx';
import styles from './StatsChips.module.css';

interface Props {
  design: DesignState;
}

export default function StatsChips({ design }: Props) {
  if (!design.stats && design.warnings.length === 0) return null;

  const s = design.stats;
  const chips: { text: string; type?: 'warn' | 'err' }[] = [];

  if (!design.ok) {
    chips.push({ text: 'program error — see console', type: 'err' });
  } else if (s) {
    chips.push({ text: `${s.stitches.toLocaleString()} stitches` });
    if (s.jumps) chips.push({ text: `${s.jumps} jump${s.jumps > 1 ? 's' : ''}` });
    chips.push({ text: `${s.colorsUsed} colour${s.colorsUsed > 1 ? 's' : ''}` });
    chips.push({ text: `${s.width.toFixed(1)} × ${s.height.toFixed(1)} mm` });
    design.warnings.forEach(w => chips.push({ text: w, type: 'warn' }));
  }

  return (
    <div className={styles.stats}>
      {chips.map((chip, i) => (
        <span
          key={i}
          className={`${styles.chip}${chip.type ? ' ' + styles[chip.type] : ''}`}
        >
          {chip.text}
        </span>
      ))}
    </div>
  );
}
