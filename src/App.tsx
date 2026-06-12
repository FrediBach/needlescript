import { useReducer, useState, useCallback, useRef } from 'react';
import { run, designStats, NeedlescriptError } from './lib/engine.ts';
import type { StitchEvent, DesignStats, DensityResult } from './lib/engine.ts';
import { toDST } from './lib/dst.ts';
import { svgToCode } from './lib/svg-importer.ts';
import { THREADS, SAFE_R, EXAMPLES } from './data.ts';
import styles from './App.module.css';
import Header from './components/Header.tsx';
import EditorPane from './components/EditorPane.tsx';
import StagePane from './components/StagePane.tsx';
import ReferenceDialog from './components/ReferenceDialog.tsx';

export interface DebugMark {
  x: number;
  y: number;
  at: number; // index into pts after which the mark appears
}

export interface DesignState {
  events: StitchEvent[];
  pts: StitchEvent[];            // stitch + jump only
  marks: DebugMark[];            // debug pins from the `mark` command
  density: DensityResult | null; // local density analysis
  stats: DesignStats | null;
  warnings: string[];
  name: string;
  ok: boolean;
}

export interface ConsoleMessage {
  id: number;
  text: string;
  type: 'info' | 'ok' | 'err' | 'print';
}

const INITIAL_DESIGN: DesignState = {
  events: [], pts: [], marks: [], density: null, stats: null, warnings: [], name: 'bloom', ok: false,
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
  | { type: 'run/success'; design: DesignState; scrubPos: number }
  | { type: 'run/error' }
  | { type: 'scrub'; pos: number }
  | { type: 'msg/add'; text: string; msgType: ConsoleMessage['type'] };

function programReducer(state: ProgramState, action: ProgramAction): ProgramState {
  switch (action.type) {
    case 'run/success':
      return { ...state, design: action.design, scrubPos: action.scrubPos };
    case 'run/error':
      return { ...state, design: { ...state.design, ok: false, stats: null } };
    case 'scrub':
      return { ...state, scrubPos: action.pos };
    case 'msg/add': {
      const next = [...state.messages, { id: msgId++, text: action.text, type: action.msgType }];
      return { ...state, messages: next.length > 40 ? next.slice(next.length - 40) : next };
    }
  }
}

export default function App() {
  const firstKey = Object.keys(EXAMPLES)[0];
  const [source, setSource] = useState(EXAMPLES[firstKey]);
  const [fitMM, setFitMM] = useState(80);
  const [isDragging, setIsDragging] = useState(false);
  const [showDensity, setShowDensity] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [program, dispatch] = useReducer(programReducer, { design: INITIAL_DESIGN, messages: [], scrubPos: 0 });
  const { design, messages, scrubPos } = program;
  const svgFileRef = useRef<HTMLInputElement>(null);

  function addMsg(text: string, type: ConsoleMessage['type'] = 'info') {
    dispatch({ type: 'msg/add', text, msgType: type });
  }

  const runProgram = useCallback((src: string, designName: string) => {
    const t0 = performance.now();
    try {
      const result = run(src);
      const pts: StitchEvent[] = [];
      const marks: DebugMark[] = [];
      for (const e of result.events) {
        if (e.t === 'stitch' || e.t === 'jump') pts.push(e);
        else if (e.t === 'mark') marks.push({ x: e.x, y: e.y, at: pts.length });
      }
      const stats = designStats(result.events);
      const warnings: string[] = [...result.warnings];

      // hoop checks
      if (stats.maxRadius > SAFE_R)
        warnings.push(`design reaches ${(stats.maxRadius * 2).toFixed(0)} mm across — outside the 100 mm hoop`);
      const density = stats.stitches / Math.max(1, stats.width * stats.height);
      if (density > 4)
        warnings.push(`very dense (${density.toFixed(1)} st/mm² avg) — may pucker; raise stitchlen or shrink repeats`);

      const ms = Math.round(performance.now() - t0);
      result.printed.forEach(p => addMsg(p, 'print'));
      addMsg(
        `sewed ${stats.stitches.toLocaleString()} stitches in ${ms} ms` +
        (result.locks ? ` · secured ${result.locks} thread end${result.locks === 1 ? '' : 's'}` : ''),
        'ok',
      );

      const newDesign: DesignState = {
        events: result.events, pts, marks, density: result.density, stats, warnings, name: designName, ok: true,
      };
      dispatch({ type: 'run/success', design: newDesign, scrubPos: pts.length });
    } catch (err) {
      const msg = err instanceof NeedlescriptError || err instanceof Error
        ? err.message
        : String(err);
      addMsg(msg, 'err');
      dispatch({ type: 'run/error' });
    }
  }, []);

  const handleRun = useCallback(() => {
    runProgram(source, design.name);
  }, [source, design.name, runProgram]);

  const handleExampleSelect = useCallback((key: string) => {
    const src = EXAMPLES[key];
    const name = key.split(' ')[0];
    setSource(src);
    runProgram(src, name);
  }, [runProgram]);

  const handleDownloadDST = useCallback(() => {
    if (!design.ok || design.pts.length === 0) {
      addMsg('nothing to export — run a program with at least one stitch first', 'err');
      return;
    }
    try {
      const bytes = toDST(design.events, design.name);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = design.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() + '.dst';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      addMsg(`exported ${a.download} (${bytes.length.toLocaleString()} bytes)`, 'ok');
    } catch (e) {
      addMsg(`DST export failed: ${e instanceof Error ? e.message : e}`, 'err');
    }
  }, [design]);

  const importSVGText = useCallback((text: string, filename: string) => {
    try {
      const res = svgToCode(text, { fitMM, palette: THREADS, name: filename, maxSegments: 1400 });
      const name = filename.replace(/\.svg$/i, '') || 'import';
      setSource(res.code);
      const rep = res.report;
      addMsg(
        `imported ${filename} — ${rep.fills} fill${rep.fills === 1 ? '' : 's'}, ` +
        `${rep.outlines} outline${rep.outlines === 1 ? '' : 's'}, ` +
        `${rep.segments} segments (simplified to ${rep.tolerance} mm), ` +
        `${rep.colors} colour group${rep.colors === 1 ? '' : 's'}`,
        'ok',
      );
      const ig = Object.entries(rep.ignored || {});
      if (ig.length) {
        addMsg(
          'skipped unsupported elements: ' +
          ig.map(([k, v]) => `${v} <${k}>`).join(', '),
        );
      }
      runProgram(res.code, name);
    } catch (err) {
      addMsg(`SVG import failed: ${err instanceof Error ? err.message : err}`, 'err');
    }
  }, [fitMM, runProgram]);

  const handleSVGImport = useCallback(() => {
    svgFileRef.current?.click();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importSVGText(String(reader.result), file.name);
    reader.onerror = () => addMsg(`could not read ${file.name}`, 'err');
    reader.readAsText(file);
    e.target.value = '';
  }, [importSVGText]);

  // Drag-and-drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const handleDragLeave = useCallback(() => { setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (/\.svg$/i.test(f.name) || f.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => importSVGText(String(reader.result), f.name);
      reader.readAsText(f);
    } else {
      addMsg('only .svg files can be imported', 'err');
    }
  }, [importSVGText]);

  // Kick off initial render
  const initialised = useRef(false);
  if (!initialised.current) {
    initialised.current = true;
    // Run on first paint via a microtask so state is settled
    Promise.resolve().then(() => runProgram(EXAMPLES[firstKey], 'bloom'));
  }

  // Source line currently sewing (only meaningful while scrubbed back / playing)
  const activeLine =
    design.ok && scrubPos > 0 && scrubPos < design.pts.length
      ? design.pts[Math.min(scrubPos, design.pts.length) - 1].line ?? null
      : null;

  return (
    <div
      className={styles.app}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Header
        fitMM={fitMM}
        onFitMMChange={setFitMM}
        onSVGImport={handleSVGImport}
        onExampleSelect={handleExampleSelect}
        onRun={handleRun}
        onDownloadDST={handleDownloadDST}
        onOpenReference={() => setShowReference(true)}
      />

      <main className={styles.main}>
        <EditorPane
          source={source}
          onSourceChange={setSource}
          onRun={handleRun}
          messages={messages}
          isDragging={isDragging}
          activeLine={activeLine}
        />
        <StagePane
          design={design}
          scrubPos={scrubPos}
          onScrubChange={(pos) => dispatch({ type: 'scrub', pos })}
          activeLine={activeLine}
          showDensity={showDensity}
          onToggleDensity={() => setShowDensity(v => !v)}
        />
      </main>

      <ReferenceDialog open={showReference} onClose={() => setShowReference(false)} />

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
