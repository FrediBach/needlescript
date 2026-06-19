import type { DesignState } from '../App.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { cn } from '@/lib/utils.ts';
import styles from './StatsChips.module.css';

interface Props {
  design: DesignState;
}

export default function StatsChips({ design }: Props) {
  if (!design.stats) return null;

  const s = design.stats;
  const chips: { text: string; type?: 'warn' | 'err' }[] = [];

  if (!design.ok) {
    chips.push({ text: 'program error — see console', type: 'err' });
  } else if (s) {
    chips.push({ text: `${s.stitches.toLocaleString()} stitches` });
    const yarnM = s.yarnLength / 1000;
    chips.push({ text: yarnM >= 1 ? `${yarnM.toFixed(1)} m yarn` : `${Math.round(s.yarnLength)} mm yarn` });
    if (s.jumps) chips.push({ text: `${s.jumps} jump${s.jumps > 1 ? 's' : ''}` });
    chips.push({ text: `${s.colorsUsed} colour${s.colorsUsed > 1 ? 's' : ''}` });
    chips.push({ text: `${s.width.toFixed(1)} × ${s.height.toFixed(1)} mm` });
    if (design.density && design.density.peak > 0.5)
      chips.push({ text: `peak ${design.density.peak.toFixed(1)} layers` });
  }

  return (
    <div className={styles.stats}>
      {chips.map((chip) => (
        <Badge
          key={chip.text}
          variant={chip.type === 'err' ? 'destructive' : 'outline'}
          className={cn(
            "font-mono text-[10.5px] h-auto py-[3px] px-[8px] rounded-[5px]",
            "bg-[rgba(0,0,0,0.05)] border-[rgba(0,0,0,0.1)] text-[rgba(0,0,0,0.4)]",
            chip.type === 'warn' && "border-[rgba(217,164,65,0.6)] text-[var(--gold)]",
            chip.type === 'err' && "bg-[rgba(200,71,47,0.25)] border-[rgba(200,71,47,0.5)] text-[#ffffff]",
          )}
        >
          {chip.text}
        </Badge>
      ))}
    </div>
  );
}
