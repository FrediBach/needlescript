// Drives the staging preview: holds the staged document, debounces a full
// emit → compile (dedicated worker) on every change, and exposes the
// resulting DesignState plus element line-spans for canvas linking.
//
// Per the plan: full-program recompile (correctness first) — "what you
// preview is what you sew."

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesignState, DebugMark } from '@/App';
import type { StitchEvent } from '@/lib/engine';
import { emit } from '@/lib/engine';
import type { StagedDocument } from '@/lib/engine';
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
  colorTable: [],
  background: '#f5efe4',
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
  /** the code that would be inserted right now. */
  emitCode: () => string;
}

export function useStagedDesign(initial: StagedDocument): StagedPreview {
  const [doc, setDoc] = useState<StagedDocument>(initial);
  const [design, setDesign] = useState<DesignState>(EMPTY_DESIGN);
  const [sewSpans, setSewSpans] = useState<Record<string, { start: number; end: number }>>({});
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { compile } = useCompiler();

  const update = useCallback(
    (updater: (doc: StagedDocument) => StagedDocument) => setDoc(updater),
    [],
  );

  const emitCode = useCallback(() => emit(doc).code, [doc]);

  // Debounced full recompile on any document change.
  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    const handle = setTimeout(async () => {
      setCompiling(true);
      const { code, sewSpans: spans } = emit(doc);
      let response;
      try {
        response = await compile(code, doc.seed);
      } catch {
        response = null;
      }
      if (!liveRef.current) return;
      setCompiling(false);
      if (response === null) return; // superseded
      if (!response.ok) {
        setError(response.message);
        setDesign((d) => ({ ...d, ok: false }));
        return;
      }
      setError(null);
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
        colorTable: result.colorTable,
        background: result.background,
      });
      setSewSpans(spans);
    }, DEBOUNCE_MS);
    return () => {
      liveRef.current = false;
      clearTimeout(handle);
    };
  }, [doc, compile]);

  return { doc, update, design, sewSpans, compiling, error, emitCode };
}
