import { useReducer, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { StitchEvent, DesignStats, DensityResult, WarningLocation } from './lib/engine.ts';
import { useCompiler } from './hooks/useCompiler.ts';
import { toDST } from './lib/dst.ts';
import { toPES } from './lib/pes.ts';
import { toEXP } from './lib/exp.ts';
import { toSVG } from './lib/svg.ts';
import { THREADS, EXAMPLES, DEFAULT_HOOP } from './data.ts';
import type { HoopConfig } from './data.ts';
import type { ExportFormat } from './components/Header.tsx';
import { usePanelSplit } from './hooks/usePanelSplit.ts';
import { useSvgImport } from './hooks/useSvgImport.ts';
import { useShare } from './hooks/useShare.ts';
import styles from './App.module.css';
import Header from './components/Header.tsx';
import EditorPane from './components/EditorPane.tsx';
import StagePane from './components/StagePane.tsx';
import Splitter from './components/Splitter.tsx';
import ReferenceDialog from './components/ReferenceDialog.tsx';
import HoopDialog from './components/HoopDialog.tsx';

export interface LineSegment {
  line: number;
  start: number; // 0-based index into pts[] where this line's stitches begin
}

export interface DebugMark {
  x: number;
  y: number;
  at: number; // index into pts after which the mark appears
}

export interface DesignState {
  events: StitchEvent[];
  pts: StitchEvent[]; // stitch + jump only
  marks: DebugMark[]; // debug pins from the `mark` command
  density: DensityResult | null; // local density analysis
  stats: DesignStats | null;
  warnings: string[];
  name: string;
  ok: boolean;
}

export interface ConsoleMessage {
  id: number;
  text: string;
  type: 'info' | 'ok' | 'err' | 'print' | 'warn' | 'time';
  loc?: WarningLocation; // present for hover-locatable hotspot warnings
}

const INITIAL_DESIGN: DesignState = {
  events: [],
  pts: [],
  marks: [],
  density: null,
  stats: null,
  warnings: [],
  name: 'bloom',
  ok: false,
};

let msgId = 0;

// Groups the three pieces of state that all change together when the
// program runs: the compiled design, the console messages, and the
// playback position.
interface ProgramState {
  design: DesignState;
  messages: ConsoleMessage[];
  scrubPos: number;
}

type ProgramAction =
  | { type: 'run/compiling' }
  | { type: 'run/success'; design: DesignState; scrubPos: number }
  | { type: 'run/error' }
  | { type: 'scrub'; pos: number }
  | { type: 'msg/add'; text: string; msgType: ConsoleMessage['type']; loc?: WarningLocation };

function programReducer(state: ProgramState, action: ProgramAction): ProgramState {
  switch (action.type) {
    case 'run/compiling':
      return state; // no visual state change yet; placeholder for a future spinner
    case 'run/success':
      return { ...state, design: action.design, scrubPos: action.scrubPos };
    case 'run/error':
      return { ...state, design: { ...state.design, ok: false, stats: null } };
    case 'scrub':
      return { ...state, scrubPos: action.pos };
    case 'msg/add': {
      // The 'time' separator marks the start of a new compile. Strip the
      // location off every earlier message so only the current compile's
      // warnings stay hoverable — stale markers would point into a design
      // that's no longer on screen.
      const prior =
        action.msgType === 'time'
          ? state.messages.map((m) => (m.loc ? { ...m, loc: undefined } : m))
          : state.messages;
      const next = [
        ...prior,
        { id: msgId++, text: action.text, type: action.msgType, loc: action.loc },
      ];
      return { ...state, messages: next.length > 40 ? next.slice(next.length - 40) : next };
    }
  }
}

export default function App() {
  const firstKey = Object.keys(EXAMPLES)[0];
  const [source, setSource] = useState(EXAMPLES[firstKey]);
  // Live ref that always holds the current source code.  Used by handleRun so
  // the Header's Run button never captures a stale closure value — same
  // principle as sourceRef in EditorPane.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const [selectedHoop, setSelectedHoop] = useState<HoopConfig>(DEFAULT_HOOP);
  const [showHoopDialog, setShowHoopDialog] = useState(false);
  const [showDensity, setShowDensity] = useState(false);
  const [hideJumps, setHideJumps] = useState(false);
  const [showReference, setShowReference] = useState(false);
  // Location of the warning currently hovered in the console — drives the
  // preview marker and playback-bar part highlight. null = nothing hovered.
  const [hoverWarn, setHoverWarn] = useState<WarningLocation | null>(null);
  const [program, dispatch] = useReducer(programReducer, {
    design: INITIAL_DESIGN,
    messages: [],
    scrubPos: 0,
  });
  const { design, messages, scrubPos } = program;

  // ── Panel split, SVG import, and share ───────────────────────────────────
  const { leftWidth, isMobile, mainRef, handleHorizDrag, handleHorizReset } = usePanelSplit();

  // SVG import size derived from current hoop (fits within the sewable area)
  const fitMM = Math.min(selectedHoop.widthMM, selectedHoop.heightMM) - 10;

  const addMsg = useCallback(
    (text: string, type: ConsoleMessage['type'] = 'info', loc?: WarningLocation) => {
      dispatch({ type: 'msg/add', text, msgType: type, loc });
    },
    [],
  );

  const { compile } = useCompiler();

  const runProgram = useCallback(
    async (src: string, designName: string) => {
      const t0 = performance.now();
      // A fresh compile invalidates any hovered warning marker.
      setHoverWarn(null);
      // Separator with a human-readable timestamp so consecutive compiles are
      // visually distinguishable in the console.
      addMsg(new Date().toLocaleTimeString(), 'time');
      dispatch({ type: 'run/compiling' });

      const response = await compile(src);

      // null means a newer compile superseded this one — discard silently.
      if (response === null) return;

      if (!response.ok) {
        addMsg(response.message, 'err');
        dispatch({ type: 'run/error' });
        return;
      }

      const { result, stats } = response;
      const pts: StitchEvent[] = [];
      const marks: DebugMark[] = [];
      for (const e of result.events) {
        if (e.t === 'stitch' || e.t === 'jump') pts.push(e);
        else if (e.t === 'mark') marks.push({ x: e.x, y: e.y, at: pts.length });
      }
      const warnings: string[] = [...result.warnings];
      // Map each engine warning to its location (hotspot warnings only). Indices
      // refer to result.warnings, so App-appended warnings below get no location.
      const locByIndex = new Map<number, WarningLocation>();
      for (const wl of result.warningLocations ?? []) locByIndex.set(wl.index, wl);

      // density check
      const density = stats.stitches / Math.max(1, stats.width * stats.height);
      if (density > 4)
        warnings.push(
          `very dense (${density.toFixed(1)} st/mm² avg) — may pucker; raise stitchlen or shrink repeats`,
        );

      const ms = Math.round(performance.now() - t0);
      result.printed.forEach((p) => addMsg(p, 'print'));
      addMsg(
        `sewed ${stats.stitches.toLocaleString()} stitches in ${ms} ms` +
          (result.locks
            ? ` · secured ${result.locks} thread end${result.locks === 1 ? '' : 's'}`
            : ''),
        'ok',
      );
      warnings.forEach((w, i) => addMsg(w, 'warn', locByIndex.get(i)));

      const newDesign: DesignState = {
        events: result.events,
        pts,
        marks,
        density: result.density,
        stats,
        warnings,
        name: designName,
        ok: true,
      };
      dispatch({ type: 'run/success', design: newDesign, scrubPos: pts.length });
    },
    [addMsg, compile],
  );

  const {
    isDragging,
    svgFileRef,
    handleSVGImport,
    handleFileInput,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useSvgImport({ fitMM, runProgram, setSource, addMsg });

  const { handleShare } = useShare({
    source,
    setSource,
    runProgram,
    addMsg,
    fallbackSrc: EXAMPLES[firstKey],
    fallbackName: 'bloom',
  });

  // Hoop-fit warning computed reactively so it updates when the hoop changes
  // without requring a re-run.
  const displayDesign = useMemo((): DesignState => {
    if (!design.stats) return design;
    const safeR = Math.min(selectedHoop.widthMM, selectedHoop.heightMM) / 2 - 3;
    if (design.stats.maxRadius > safeR) {
      const warning = `design reaches ${(design.stats.maxRadius * 2).toFixed(0)} mm — outside the ${selectedHoop.label}`;
      return { ...design, warnings: [...design.warnings, warning] };
    }
    return design;
  }, [design, selectedHoop]);

  // Push the hoop-fit warning into the console whenever it appears or changes
  // (e.g. user switches to a smaller hoop). Use a ref so we only dispatch when
  // the warning text actually changes, not on every render.
  const prevHoopWarningRef = useRef<string | null>(null);
  useEffect(() => {
    const hoopWarning =
      displayDesign.warnings.length > design.warnings.length
        ? displayDesign.warnings.at(-1)!
        : null;
    if (hoopWarning !== prevHoopWarningRef.current) {
      prevHoopWarningRef.current = hoopWarning;
      if (hoopWarning) {
        dispatch({ type: 'msg/add', text: hoopWarning, msgType: 'warn' });
      }
    }
  }, [displayDesign.warnings, design.warnings]);

  const handleRun = useCallback(
    (src?: string) => {
      runProgram(src ?? sourceRef.current, design.name);
    },
    [design.name, runProgram],
  );

  const handleExampleSelect = useCallback(
    (key: string) => {
      const src = EXAMPLES[key];
      const name = key.split(' ')[0];
      setSource(src);
      runProgram(src, name);
    },
    [runProgram],
  );

  const handleDownload = useCallback(
    (format: ExportFormat) => {
      if (!design.ok || design.pts.length === 0) {
        addMsg('nothing to export — run a program with at least one stitch first', 'err');
        return;
      }
      try {
        const slug = design.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();

        if (format === 'svg') {
          const svgStr = toSVG(design.events, design.name, THREADS);
          const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${slug}.svg`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          addMsg(`exported ${a.download} (${svgStr.length.toLocaleString()} bytes)`, 'ok');
          return;
        }

        let bytes: Uint8Array;
        if (format === 'pes') {
          bytes = toPES(design.events, design.name);
        } else if (format === 'exp') {
          bytes = toEXP(design.events, design.name);
        } else {
          bytes = toDST(design.events, design.name);
        }
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${slug}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        addMsg(`exported ${a.download} (${bytes.length.toLocaleString()} bytes)`, 'ok');
      } catch (e) {
        addMsg(
          `${format.toUpperCase()} export failed: ${e instanceof Error ? e.message : e}`,
          'err',
        );
      }
    },
    [design, addMsg],
  );

  // Kick off initial render
  const initialised = useRef(false);
  if (!initialised.current) {
    initialised.current = true;
    // Only run the default example if there's no ?share= param —
    // the share effect above handles that case.
    const hasShare = new URLSearchParams(window.location.search).has('share');
    if (!hasShare) {
      // Run on first paint via a microtask so state is settled
      Promise.resolve().then(() => runProgram(EXAMPLES[firstKey], 'bloom'));
    }
  }

  // Source line currently sewing (only meaningful while scrubbed back / playing)
  const activeLine =
    design.ok && scrubPos > 0 && scrubPos < design.pts.length
      ? (design.pts[Math.min(scrubPos, design.pts.length) - 1].line ?? null)
      : null;

  // Compact list of source-line runs: one entry per consecutive block of stitches
  // sharing the same line number. Recomputed only when the compiled design changes.
  const lineSegments = useMemo((): LineSegment[] => {
    const segs: LineSegment[] = [];
    let currentLine: number | undefined = undefined;
    for (let i = 0; i < design.pts.length; i++) {
      const ln = design.pts[i].line;
      if (ln !== currentLine) {
        segs.push({ line: ln ?? 0, start: i });
        currentLine = ln;
      }
    }
    return segs;
  }, [design.pts]);

  return (
    <div
      className={styles.app}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Header
        hoop={selectedHoop}
        onOpenHoopDialog={() => setShowHoopDialog(true)}
        onSVGImport={handleSVGImport}
        onExampleSelect={handleExampleSelect}
        onRun={handleRun}
        onDownload={handleDownload}
        onShare={handleShare}
        onOpenReference={() => setShowReference(true)}
      />

      <main className={styles.main} ref={mainRef}>
        <EditorPane
          source={source}
          onSourceChange={setSource}
          onRun={handleRun}
          messages={messages}
          isDragging={isDragging}
          activeLine={activeLine}
          onWarnHover={setHoverWarn}
          style={!isMobile ? { width: leftWidth, flexShrink: 0 } : undefined}
        />
        {!isMobile && (
          <Splitter orientation="horizontal" onDrag={handleHorizDrag} onReset={handleHorizReset} />
        )}
        <StagePane
          design={displayDesign}
          hoop={selectedHoop}
          scrubPos={scrubPos}
          onScrubChange={(pos) => dispatch({ type: 'scrub', pos })}
          activeLine={activeLine}
          lineSegments={lineSegments}
          warningLoc={hoverWarn}
          showDensity={showDensity}
          onToggleDensity={() => setShowDensity((v) => !v)}
          hideJumps={hideJumps}
          onToggleHideJumps={() => setHideJumps((v) => !v)}
        />
      </main>

      <ReferenceDialog open={showReference} onClose={() => setShowReference(false)} />

      <HoopDialog
        open={showHoopDialog}
        current={selectedHoop}
        onSelect={setSelectedHoop}
        onClose={() => setShowHoopDialog(false)}
      />

      <input
        ref={svgFileRef}
        type="file"
        accept=".svg,image/svg+xml"
        aria-label="Import SVG file"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
    </div>
  );
}
