import { useState, useCallback, useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { svgToCode } from '../svg-import/import-policy.ts';
import { parseSvgToModel } from '../svg-import/parse-svg-dom.ts';
import type { ImportField, StagedDocument } from '../lib/engine.ts';
import { THREADS } from '../data.ts';

type AddMsg = (text: string, type?: 'info' | 'ok' | 'err' | 'print' | 'warn' | 'time') => void;
type ImportMode = 'quick' | 'options';

const PREF_KEY = 'ns-svg-import-pref';

interface UseSvgImportOptions {
  /** Max dimension (mm) to fit imported SVG into the current hoop. */
  fitMM: number;
  field: ImportField;
  runProgram: (src: string, name: string) => void;
  setSource: (src: string) => void;
  addMsg: AddMsg;
  onBitmapFile: (file: File) => void;
}

/**
 * Handles all SVG-import concerns: the two-speed chooser (Quick import vs.
 * Import with options…), file-picker, drag-and-drop, and opening the staging
 * workspace. Quick import is unchanged from the original one-shot path.
 */
export function useSvgImport({
  fitMM,
  field,
  runProgram,
  setSource,
  addMsg,
  onBitmapFile,
}: UseSvgImportOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const svgFileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<ImportMode>('quick');

  // chooser (shown for drag-drop, or when no preference is pinned)
  const [pending, setPending] = useState<{ text: string; filename: string } | null>(null);
  // staging workspace
  const [stagingDoc, setStagingDoc] = useState<StagedDocument | null>(null);

  const quickImport = useCallback(
    (text: string, filename: string) => {
      try {
        const res = svgToCode(text, {
          fitMM,
          field,
          palette: THREADS,
          name: filename,
          maxSegments: 1400,
        });
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
          addMsg('skipped unsupported elements: ' + ig.map(([k, v]) => `${v} <${k}>`).join(', '));
        }
        runProgram(res.code, name);
      } catch (err) {
        addMsg(`SVG import failed: ${err instanceof Error ? err.message : err}`, 'err');
      }
    },
    [fitMM, field, runProgram, setSource, addMsg],
  );

  const openStaging = useCallback(
    (text: string, filename: string) => {
      try {
        const { doc } = parseSvgToModel(text, {
          palette: THREADS,
          name: filename,
          fitMM,
          field,
        });
        setStagingDoc(doc);
      } catch (err) {
        addMsg(`SVG import failed: ${err instanceof Error ? err.message : err}`, 'err');
      }
    },
    [fitMM, field, addMsg],
  );

  const process = useCallback(
    (text: string, filename: string, mode: ImportMode) => {
      if (mode === 'quick') quickImport(text, filename);
      else openStaging(text, filename);
    },
    [quickImport, openStaging],
  );

  // Header dropdown items call this with the chosen mode, then open the picker.
  const requestImport = useCallback((mode: ImportMode) => {
    modeRef.current = mode;
    svgFileRef.current?.click();
  }, []);

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => process(String(reader.result), file.name, modeRef.current);
      reader.onerror = () => addMsg(`could not read ${file.name}`, 'err');
      reader.readAsText(file);
      e.target.value = '';
    },
    [process, addMsg],
  );

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);
  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (!/\.svg$/i.test(f.name) && f.type !== 'image/svg+xml') {
        if (f.type.startsWith('image/')) onBitmapFile(f);
        else addMsg('drop an SVG or bitmap image to import', 'err');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result);
        const pref = localStorage.getItem(PREF_KEY) as ImportMode | null;
        // A stray drop never silently rewrites the program: show the chooser
        // unless the user pinned a preference.
        if (pref === 'quick' || pref === 'options') process(text, f.name, pref);
        else setPending({ text, filename: f.name });
      };
      reader.readAsText(f);
    },
    [process, addMsg, onBitmapFile],
  );

  // chooser resolution
  const chooseImport = useCallback(
    (mode: ImportMode, remember: boolean) => {
      if (remember) localStorage.setItem(PREF_KEY, mode);
      if (pending) process(pending.text, pending.filename, mode);
      setPending(null);
    },
    [pending, process],
  );

  const cancelChooser = useCallback(() => setPending(null), []);
  const closeStaging = useCallback(() => setStagingDoc(null), []);

  return {
    isDragging,
    svgFileRef,
    handleFileInput,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    // two-speed chooser + staging
    requestImport,
    pending,
    chooseImport,
    cancelChooser,
    stagingDoc,
    closeStaging,
  };
}
