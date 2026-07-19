import type { DesignState } from '../App.tsx';
import { SEW_TIME_COLOR_CHANGE_PENALTY_SECONDS, SEW_TIME_TRIM_PENALTY_SECONDS } from '../data.ts';
import type { MachinePreset } from '../data.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { cn } from '@/utils.ts';
import styles from './StatsChips.module.css';
import { colorDist } from '../lib/core/colormath.ts';

interface Props {
  design: DesignState;
  machine?: MachinePreset | null;
}

function formatHoopChip(design: DesignState): string | null {
  const h = design.activeHoop;
  if (!h) return null;
  const hoopStr = h.shape === 'circle' ? `hoop ⌀${h.widthMM}` : `hoop ${h.widthMM}×${h.heightMM}`;
  const fieldStr =
    h.shape === 'circle'
      ? `field ⌀${h.fieldWidthMM}`
      : `field ${h.fieldWidthMM}×${h.fieldHeightMM}`;
  return `${hoopStr} · ${fieldStr} mm`;
}

export default function StatsChips({ design, machine }: Props) {
  if (!design.stats) return null;

  const s = design.stats;
  const darkGround = colorDist(design.background, '#000000') < 0.5;
  const chips: { text: string; type?: 'warn' | 'err'; title?: string }[] = [];

  if (!design.ok) {
    chips.push({ text: 'program error — see console', type: 'err' });
  } else if (s) {
    chips.push({ text: `${s.stitches.toLocaleString()} stitches` });
    const yarnM = s.yarnLength / 1000;
    chips.push({
      text: yarnM >= 1 ? `${yarnM.toFixed(1)} m yarn` : `${Math.round(s.yarnLength)} mm yarn`,
    });
    if (s.jumps) chips.push({ text: `${s.jumps} jump${s.jumps > 1 ? 's' : ''}` });
    if (
      s.planMode &&
      s.travelBeforeMm !== undefined &&
      s.travelAfterMm !== undefined &&
      s.travelBeforeMm > 0
    ) {
      const saved = Math.max(0, s.travelBeforeMm - s.travelAfterMm);
      chips.push({
        text: `plan saved ${saved.toFixed(1)} mm travel`,
        title: `${s.planMode}: ${s.travelBeforeMm.toFixed(1)} → ${s.travelAfterMm.toFixed(1)} mm`,
      });
    }
    if (machine?.maxSpm) {
      const seconds =
        (s.stitches / machine.maxSpm) * 60 +
        s.trims * SEW_TIME_TRIM_PENALTY_SECONDS +
        s.colorChanges * SEW_TIME_COLOR_CHANGE_PENALTY_SECONDS;
      chips.push({
        text: `≈ ${Math.max(1, Math.round(seconds / 60))} min @ ${machine.maxSpm} spm`,
      });
    }
    chips.push({ text: `${s.colorsUsed} colour${s.colorsUsed > 1 ? 's' : ''}` });
    chips.push({ text: `${s.width.toFixed(1)} × ${s.height.toFixed(1)} mm` });
    if (design.density && design.density.peak > 0.5)
      chips.push({ text: `peak ${design.density.peak.toFixed(1)} layers` });

    // Hoop chip: shown when a `hoop` directive is active
    const hoopChip = formatHoopChip(design);
    if (hoopChip) chips.push({ text: hoopChip });

    // Limits chip: shown when any override *raises* a limit above stock
    if (design.activeOverrides) {
      const raised = Object.entries(design.activeOverrides).filter(([, v]) => v !== undefined);
      if (raised.length > 0) {
        const title = raised.map(([k, v]) => `${k}: ${(v as number).toLocaleString()}`).join(', ');
        chips.push({ text: 'limits ⚠', type: 'warn', title });
      }
    }
    if (machine && machine.trimmer !== 'jump' && s.trims > 12) {
      const action = machine.trimmer === 'none' ? 'manual snips' : 'limited trimming';
      chips.push({
        text: `${machine.model}: ${s.trims} trims → ${action}`,
        type: 'warn',
        title: 'Sorting motif order usually reduces travel trims.',
      });
    }
  }

  return (
    <div className={styles.stats}>
      <div
        className={styles.slotStrip}
        aria-label="Fabric and thread colors"
        style={{ background: darkGround ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }}
      >
        <span
          className={styles.swatch}
          style={{ backgroundColor: design.background }}
          title={`Fabric ${design.background}`}
        />
        {design.colorTable
          .filter((slot) => slot.stitchCount > 0)
          .map((slot) => (
            <span
              key={slot.slot}
              className={styles.swatch}
              style={{ backgroundColor: slot.hex }}
              title={`Slot ${slot.slot} · ${slot.hex} · ${slot.stitchCount.toLocaleString()} stitches · contrast ${colorDist(slot.hex, design.background).toFixed(3)}`}
            />
          ))}
      </div>
      {chips.map((chip) => (
        <Badge
          key={chip.text}
          variant={chip.type === 'err' ? 'destructive' : 'outline'}
          className={cn(
            'font-mono text-[10.5px] h-auto py-[3px] px-[8px] rounded-[5px]',
            darkGround
              ? 'bg-[rgba(255,255,255,0.09)] border-[rgba(255,255,255,0.16)] text-[rgba(255,255,255,0.72)]'
              : 'bg-[rgba(0,0,0,0.05)] border-[rgba(0,0,0,0.1)] text-[rgba(0,0,0,0.4)]',
            chip.type === 'warn' && 'border-[var(--gold-60)] text-gold',
            chip.type === 'err' && 'bg-[var(--run-25)] border-[var(--run-50)] text-white',
          )}
          title={chip.title}
        >
          {chip.text}
        </Badge>
      ))}
    </div>
  );
}
