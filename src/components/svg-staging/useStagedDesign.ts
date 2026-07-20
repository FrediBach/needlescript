// Drives the staging preview: holds the staged document, debounces a full
// emit → compile (dedicated worker) on every change, and exposes the
// resulting DesignState plus element line-spans for canvas linking.
//
// Per the plan: full-program recompile (correctness first) — "what you
// preview is what you sew."

import { useCallback, useEffect, useState } from 'react';
import type { DesignState, DebugMark } from '@/App';
import type { StitchEvent } from '@/lib/engine';
import { DEFAULT_MATERIAL_INTENT, emit, emitAppend } from '@/lib/engine';
import type { EmitResult, StagedDocument } from '@/lib/engine';
import { useCompiler } from '@/hooks/useCompiler';

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
  name: 'import',
  ok: false,
};

const DEBOUNCE_MS = 150;

export interface StagedPreview {
  doc: StagedDocument;
  update: (updater: (doc: StagedDocument) => StagedDocument) => void;
  design: DesignState;
  /** element id → 1-based sew-block line range (for canvas ↔ row linking). */
  sewSpans: Record<string, { start: number; end: number }>;
  compiling: boolean;
  error: string | null;
  /** true only when the current document/mode has compiled successfully. */
  ready: boolean;
  /** the code that would be inserted right now. */
  emitCode: () => string;
}

export function useStagedDesign(
  initial: StagedDocument,
  baseSource: string,
  mode: 'replace' | 'append',
): StagedPreview {
  const [doc, setDoc] = useState<StagedDocument>(initial);
  const [design, setDesign] = useState<DesignState>(EMPTY_DESIGN);
  const [sewSpans, setSewSpans] = useState<Record<string, { start: number; end: number }>>({});
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committable, setCommittable] = useState<{
    code: string;
    doc: StagedDocument;
    baseSource: string;
    mode: 'replace' | 'append';
  } | null>(null);
  const { compile } = useCompiler();

  const update = useCallback(
    (updater: (doc: StagedDocument) => StagedDocument) => setDoc(updater),
    [],
  );

  const render = useCallback(
    (current: StagedDocument): EmitResult =>
      mode === 'append' ? emitAppend(current, baseSource) : emit(current, { mode: 'replace' }),
    [baseSource, mode],
  );
  const ready =
    committable?.doc === doc && committable.baseSource === baseSource && committable.mode === mode;
  const emitCode = useCallback(() => {
    if (!ready || committable === null)
      throw new Error('The staged preview is not ready to commit.');
    return committable.code;
  }, [committable, ready]);

  // Debounced full recompile on any document change.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setCompiling(true);
      let response;
      let spans: Record<string, { start: number; end: number }>;
      let code: string;
      try {
        const emitted = render(doc);
        code = emitted.code;
        spans = emitted.sewSpans;
        response = await compile(code);
      } catch (caught) {
        if (cancelled) return;
        setCompiling(false);
        setError(caught instanceof Error ? caught.message : String(caught));
        setCommittable(null);
        setDesign((current) => ({ ...current, ok: false }));
        setSewSpans({});
        return;
      }
      if (cancelled) return;
      setCompiling(false);
      if (response === null) return; // superseded
      if (!response.ok) {
        setError(response.message);
        setCommittable(null);
        setDesign((current) => ({ ...current, ok: false }));
        setSewSpans({});
        return;
      }
      setError(null);
      setCommittable({ code, doc, baseSource, mode });
      const { result, stats } = response;
      const pts: StitchEvent[] = [];
      const marks: DebugMark[] = [];
      for (const e of result.events) {
        if (e.t === 'stitch' || e.t === 'jump') pts.push(e);
        else if (e.t === 'mark') marks.push({ x: e.x, y: e.y, at: pts.length });
      }
      setDesign({
        events: result.events,
        pts,
        marks,
        density: result.density,
        stats,
        warnings: [...result.warnings],
        name: doc.name,
        ok: true,
        chalk: result.chalk ?? [],
        dataVars: result.dataVars ?? [],
        referenceVars: result.referenceVars ?? [],
        colorTable: result.colorTable,
        background: result.background,
        material: result.material,
      });
      setSewSpans(spans);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [baseSource, compile, doc, mode, render]);

  return { doc, update, design, sewSpans, compiling, error, ready, emitCode };
}
