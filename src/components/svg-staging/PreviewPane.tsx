import { useMemo } from 'react';
import StageCanvas, { type CanvasOverlay } from '@/components/StageCanvas';
import type { DesignState } from '@/App';
import type { HoopConfig } from '@/data';
import type { StagedDocument } from '@/lib/engine';
import { pointInPolygon } from '@/lib/engine';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  doc: StagedDocument;
  design: DesignState;
  hoop: HoopConfig;
  selectedIds: Set<string>;
  showDensity: boolean;
  showSkipped: boolean;
  showOverlay: boolean;
  hideJumps: boolean;
  onToggleDensity: () => void;
  onToggleSkipped: () => void;
  onToggleOverlay: () => void;
  onToggleJumps: () => void;
  onPickElement: (id: string | null) => void;
}

export default function PreviewPane({
  doc,
  design,
  hoop,
  selectedIds,
  showDensity,
  showSkipped,
  showOverlay,
  hideJumps,
  onToggleDensity,
  onToggleSkipped,
  onToggleOverlay,
  onToggleJumps,
  onPickElement,
}: Props) {
  const overlays = useMemo<CanvasOverlay[]>(() => {
    const out: CanvasOverlay[] = [];
    if (showOverlay) {
      for (const el of doc.elements) {
        if (el.rings.length) out.push({ rings: el.rings, kind: 'overlay' });
      }
    }
    if (showSkipped) {
      for (const el of doc.elements) {
        if ((!el.include || el.strategy.kind === 'skip') && el.rings.length)
          out.push({ rings: el.rings, kind: 'excluded' });
      }
    }
    for (const el of doc.elements) {
      if (selectedIds.has(el.id) && el.rings.length)
        out.push({ rings: el.rings, kind: 'highlight' });
    }
    return out;
  }, [doc.elements, selectedIds, showOverlay, showSkipped]);

  const handlePick = (mm: { x: number; y: number }) => {
    // topmost (latest in sew order) included element whose outer ring contains the point
    const hit = doc.elements
      .filter((e) => e.include && e.rings.length)
      .sort((a, b) => b.order - a.order)
      .find((e) => pointInPolygon([mm.x, mm.y], e.rings[0]));
    onPickElement(hit ? hit.id : null);
  };

  return (
    <div className="relative h-full w-full bg-canvas">
      <StageCanvas
        design={design}
        hoop={hoop}
        scrubPos={design.pts.length}
        showDensity={showDensity}
        hideJumps={hideJumps}
        showChalk={false}
        warningLoc={null}
        overlays={overlays}
        onPick={handlePick}
      />
      <Card className="absolute top-2 right-2 flex flex-row items-center gap-1 p-1">
        <ToggleBtn
          label="heatmap"
          pressed={showDensity}
          onPressed={onToggleDensity}
          tip="Stitch-density heatmap over the staged result"
        />
        <ToggleBtn
          label="skipped"
          pressed={showSkipped}
          onPressed={onToggleSkipped}
          tip="Show excluded elements as faint outlines"
        />
        <ToggleBtn
          label="source"
          pressed={showOverlay}
          onPressed={onToggleOverlay}
          tip="Superimpose the source artwork outlines"
        />
        <ToggleBtn
          label="jumps"
          pressed={!hideJumps}
          onPressed={onToggleJumps}
          tip="Show jump threads"
        />
      </Card>
    </div>
  );
}

function ToggleBtn({
  label,
  pressed,
  onPressed,
  tip,
}: {
  label: string;
  pressed: boolean;
  onPressed: () => void;
  tip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            pressed={pressed}
            onPressedChange={onPressed}
            size="sm"
            className="h-7 px-2 text-[10px] uppercase tracking-[0.1em]"
            aria-label={label}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
