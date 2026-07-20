import { useEffect, useRef, useState } from 'react';
import tutorial from '../../docs/needlescript-tutorial.md?raw';
import { AboutContent } from './reference-dialog/AboutContent';
import { GlossaryContent } from './reference-dialog/GlossaryContent';
import { LanguageReferenceContent } from './reference-dialog/LanguageReferenceContent';
import { MarkdownContent } from './reference-dialog/MarkdownContent';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { cn } from '@/utils.ts';

type TabId = 'reference' | 'glossary' | 'tutorial' | 'about';

const TAB_LABELS: Record<TabId, string> = {
  reference: 'Language Reference',
  glossary: 'Glossary',
  tutorial: 'Tutorial',
  about: 'About',
};

interface ReferenceDialogProps {
  open: boolean;
  onClose: () => void;
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function ReferenceDialog({ open, onClose }: ReferenceDialogProps) {
  const [tab, setTab] = useState<TabId>('reference');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const searchable = tab === 'reference' || tab === 'glossary';

  useEffect(() => {
    if (open && searchable) {
      const timeout = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(timeout);
    }
  }, [open, searchable]);

  const triggerClassName = cn(
    'font-mono text-[11px] tracking-[0.07em] px-2.5 py-1.5 h-auto whitespace-nowrap',
    'rounded-[5px] border-transparent shadow-none bg-transparent',
    'text-muted-foreground hover:text-foreground transition-colors',
    'data-active:bg-[var(--gold-10)] data-active:text-gold',
    'data-active:border-transparent data-active:shadow-none after:hidden',
    'focus-visible:ring-2 focus-visible:ring-ring/50',
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setQuery('');
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          'w-full max-w-[min(900px,calc(100%-1.5rem))] h-[min(820px,calc(100dvh-2rem))]',
          'p-0 gap-0 flex flex-col rounded-xl overflow-hidden bg-card border border-border',
        )}
        aria-label="NeedleScript help"
      >
        <div className="flex items-center justify-between px-3.5 sm:px-4 h-10 flex-shrink-0 border-b border-dashed border-border">
          <span className="text-[11px] tracking-[0.16em] uppercase text-gold select-none whitespace-nowrap">
            ✣ NeedleScript
          </span>
          <div className="flex items-center gap-1">
            <a
              href="https://github.com/FrediBach/needlescript"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View NeedleScript on GitHub"
              title="View NeedleScript on GitHub"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-[6px] py-[3px] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <GithubIcon className="w-[15px] h-[15px]" />
            </a>
            <DialogClose className="text-[14px] font-mono text-muted-foreground bg-transparent border-none cursor-pointer px-[6px] py-[3px] rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              ✕
            </DialogClose>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(value: string | null) => value && setTab(value as TabId)}
          className="flex-1 min-h-0 gap-0 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3.5 sm:px-4 py-2 flex-shrink-0 border-b border-dashed border-border flex-wrap sm:flex-nowrap">
            <TabsList className="bg-transparent p-0 h-auto gap-0.5 flex-shrink-0">
              {(Object.keys(TAB_LABELS) as TabId[]).map((tabId) => (
                <TabsTrigger key={tabId} value={tabId} className={triggerClassName}>
                  {TAB_LABELS[tabId]}
                </TabsTrigger>
              ))}
            </TabsList>
            {searchable && (
              <Input
                ref={inputRef}
                type="text"
                placeholder={
                  tab === 'glossary'
                    ? 'filter terms…'
                    : 'search… tag:seeded, category:movement, module:std.shapes'
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                spellCheck={false}
                aria-label={tab === 'glossary' ? 'Filter glossary' : 'Search language reference'}
                className="h-7 text-[12.5px] font-mono flex-1 min-w-[120px] w-full sm:w-auto bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            )}
          </div>

          <TabsContent value="reference" className="flex flex-col min-h-0 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <LanguageReferenceContent query={query} />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="glossary" className="flex flex-col min-h-0 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <GlossaryContent query={query} />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="tutorial" className="flex flex-col min-h-0 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <MarkdownContent markdown={tutorial} idPrefix="tutorial" />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="about" className="flex flex-col min-h-0 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <AboutContent />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
