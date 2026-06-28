import { useCallback, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { HoopConfig } from '@/data';
import type { StagedDocument, StrategyKind } from '@/lib/engine';
import { STRATEGY_ORDER } from '@/lib/engine';
import { useStagedDesign } from './useStagedDesign';
import ElementList from './ElementList';
import PreviewPane from './PreviewPane';
import Inspector from './Inspector';
import GlobalToolbar from './GlobalToolbar';
import ValidationSummary from './ValidationSummary';
import { setElementStrategy, setInclude } from './staging-actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDoc: StagedDocument;
  hoop: HoopConfig;
  /** `@`-referenceable reporters defined in the current editor program. */
  reporters: string[];
  onCommit: (code: string, mode: 'replace' | 'append') => void;
}

export default function StagingDialog({
  open,
  onOpenChange,
  initialDoc,
  hoop,
  reporters,
  onCommit,
}: Props) {
  const { doc, update, design, compiling, emitCode } = useStagedDesign(initialDoc);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');

  const [showDensity, setShowDensity] = useState(false);
  const [showSkipped, setShowSkipped] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [hideJumps, setHideJumps] = useState(true);

  const ordered = useMemo(
    () => doc.elements.slice().sort((a, b) => a.order - b.order),
    [doc.elements],
  );

  const select = useCallback((id: string, additive: boolean) => {
    setFocusedId(id);
    setSelectedIds((prev) => {
      if (!additive) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectMany = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
    setFocusedId(ids[0] ?? null);
  }, []);

  const pickElement = useCallback((id: string | null) => {
    if (id) {
      setSelectedIds(new Set([id]));
      setFocusedId(id);
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  const commit = useCallback(() => {
    onCommit(emitCode(), mode);
    onOpenChange(false);
  }, [emitCode, mode, onCommit, onOpenChange]);

  // keyboard shortcuts (spec §15)
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        commit();
        return;
      }
      if (typing) return;
      const idx = focusedId ? ordered.findIndex((el) => el.id === focusedId) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = ordered[Math.min(ordered.length - 1, idx + 1)];
        if (next) select(next.id, false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = ordered[Math.max(0, idx - 1)];
        if (prev) select(prev.id, false);
      } else if (e.key === ' ' && focusedId) {
        e.preventDefault();
        const el = doc.elements.find((x) => x.id === focusedId);
        if (el) update((d) => setInclude(d, focusedId, !el.include));
      } else if (/^[1-6]$/.test(e.key) && selectedIds.size > 0) {
        const kind: StrategyKind = STRATEGY_ORDER[Number(e.key) - 1];
        update((d) => setElementStrategy(d, selectedIds, kind));
      }
    },
    [commit, doc.elements, focusedId, ordered, select, selectedIds, update],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[95vh] w-[95vw] max-w-[95vw] flex-col gap-0 p-0"
        onKeyDown={onKeyDown}
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-4 border-b border-foreground/10 p-3">
          <DialogTitle className="shrink-0 font-mono text-[13px]">
            SVG import — {doc.name}.svg
            {compiling && <span className="ml-2 text-muted-foreground">compiling…</span>}
          </DialogTitle>
          <GlobalToolbar doc={doc} update={update} />
        </DialogHeader>

        <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
          <ResizablePanel defaultSize={25} minSize={15}>
            <ElementList
              doc={doc}
              selectedIds={selectedIds}
              focusedId={focusedId}
              filter={filter}
              onFilterChange={setFilter}
              onSelect={select}
              onSelectMany={selectMany}
              update={update}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={30}>
            <PreviewPane
              doc={doc}
              design={design}
              hoop={hoop}
              selectedIds={selectedIds}
              showDensity={showDensity}
              showSkipped={showSkipped}
              showOverlay={showOverlay}
              hideJumps={hideJumps}
              onToggleDensity={() => setShowDensity((v) => !v)}
              onToggleSkipped={() => setShowSkipped((v) => !v)}
              onToggleOverlay={() => setShowOverlay((v) => !v)}
              onToggleJumps={() => setHideJumps((v) => !v)}
              onPickElement={pickElement}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={25} minSize={15}>
            <div className="h-full overflow-auto">
              <Inspector
                doc={doc}
                selectedIds={selectedIds}
                reporters={reporters}
                update={update}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        <DialogFooter className="flex flex-row items-center justify-between gap-4 border-t border-foreground/10 p-3">
          <ValidationSummary doc={doc} design={design} onSelect={(id) => pickElement(id)} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox
                checked={mode === 'append'}
                onCheckedChange={(c: boolean) => setMode(c ? 'append' : 'replace')}
                aria-label="append to program"
              />
              <Label className="text-[11px]">Append (don’t replace)</Label>
            </label>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={commit}>
              Insert as code
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
