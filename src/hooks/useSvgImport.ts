import { useState, useCallback, useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { svgToCode } from '../lib/svg-importer.ts';
import { THREADS } from '../data.ts';

type AddMsg = (text: string, type?: 'info' | 'ok' | 'err' | 'print' | 'warn' | 'time') => void;

interface UseSvgImportOptions {
  /** Max dimension (mm) to fit imported SVG into the current hoop. */
  fitMM: number;
  runProgram: (src: string, name: string) => void;
  setSource: (src: string) => void;
  addMsg: AddMsg;
}

/**
 * Handles all SVG-import concerns: file-picker click, <input> onChange,
 * and the drag-enter / drag-over / drag-leave / drop events on the app root.
 */
export function useSvgImport({ fitMM, runProgram, setSource, addMsg }: UseSvgImportOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const svgFileRef = useRef<HTMLInputElement>(null);

  const importSVGText = useCallback(
    (text: string, filename: string) => {
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
          addMsg('skipped unsupported elements: ' + ig.map(([k, v]) => `${v} <${k}>`).join(', '));
        }
        runProgram(res.code, name);
      } catch (err) {
        addMsg(`SVG import failed: ${err instanceof Error ? err.message : err}`, 'err');
      }
    },
    [fitMM, runProgram, setSource, addMsg],
  );

  const handleSVGImport = useCallback(() => {
    svgFileRef.current?.click();
  }, []);

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importSVGText(String(reader.result), file.name);
      reader.onerror = () => addMsg(`could not read ${file.name}`, 'err');
      reader.readAsText(file);
      e.target.value = '';
    },
    [importSVGText, addMsg],
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
      if (/\.svg$/i.test(f.name) || f.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = () => importSVGText(String(reader.result), f.name);
        reader.readAsText(f);
      } else {
        addMsg('only .svg files can be imported', 'err');
      }
    },
    [importSVGText, addMsg],
  );

  return {
    isDragging,
    svgFileRef,
    handleSVGImport,
    handleFileInput,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
