/**
 * src/book/components/BookCanvas.tsx
 *
 * Simplified canvas wrapper for book interactive cells.
 * Accepts raw RunResult events (from the compiler) and renders them using
 * the same StageCanvas drawing logic as the playground, but with a minimal
 * prop surface: no drag-to-zoom, no warning overlay, no SVG staging overlays.
 */
import { useMemo } from 'react';
import type { StitchEvent, RunResult, DesignStats } from '../../lib/core/types.ts';
import { DEFAULT_MATERIAL_INTENT } from '../../lib/engine.ts';
import type { DesignState, DebugMark } from '../../App.tsx';
import StageCanvas from '../../components/StageCanvas.tsx';
import { DEFAULT_HOOP } from '../../data.ts';

interface Props {
  result: RunResult | null;
  stats: DesignStats | null;
  /** Stitch index to scrub to (0 = full design). */
  scrubPos?: number;
  /** Height of the canvas area in pixels. Default 280. */
  height?: number;
}

const EMPTY_DESIGN: DesignState = {
  events: [],
  pts: [],
  marks: [],
  density: null,
  stats: null,
  warnings: [],
  chalk: [],
  dataVars: [],
  referenceVars: [],
  colorTable: [],
  background: '#f5efe4',
  material: { ...DEFAULT_MATERIAL_INTENT },
  name: '',
  ok: false,
};

function buildDesign(result: RunResult, stats: DesignStats): DesignState {
  const pts: StitchEvent[] = [];
  const marks: DebugMark[] = [];
  for (const e of result.events) {
    if (e.t === 'stitch' || e.t === 'jump') {
      pts.push(e);
    } else if (e.t === 'mark') {
      marks.push({ x: e.x, y: e.y, at: pts.length });
    }
  }
  return {
    events: result.events,
    pts,
    marks,
    density: result.density ?? null,
    stats,
    warnings: result.warnings,
    name: '',
    ok: true,
    chalk: result.chalk ?? [],
    dataVars: result.dataVars ?? [],
    referenceVars: result.referenceVars ?? [],
    colorTable: result.colorTable,
    background: result.background,
    material: result.material,
  };
}

export default function BookCanvas({ result, stats, scrubPos = 0, height = 280 }: Props) {
  const design = useMemo<DesignState>(() => {
    if (!result || !stats) return EMPTY_DESIGN;
    return buildDesign(result, stats);
  }, [result, stats]);

  // scrubPos=0 means show the full design (all pts)
  const resolvedScrubPos = scrubPos === 0 ? design.pts.length : scrubPos;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'var(--bk-canvas-fabric, #efe8d8)',
        borderRadius: '0 0 4px 4px',
        overflow: 'hidden',
      }}
    >
      <StageCanvas
        design={design}
        hoop={DEFAULT_HOOP}
        scrubPos={resolvedScrubPos}
        showDensity={false}
        hideJumps={false}
        showChalk={true}
        warningLoc={null}
      />
    </div>
  );
}
