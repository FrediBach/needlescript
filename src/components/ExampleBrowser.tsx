import { useMemo, useState, type ComponentProps } from 'react';
import { ALL_EXAMPLES, EXAMPLE_CATEGORIES, START_HERE_EXAMPLES } from '../data.ts';
import type { Example } from '../data.ts';
import {
  EXAMPLE_KIND_LABELS,
  type ExampleCategoryId,
  type ExampleKind,
} from '../example-catalog.ts';
import { Badge } from '@/components/ui/badge.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { cn } from '@/utils.ts';
import { ImageIcon, SearchIcon, SparklesIcon, XIcon } from 'lucide-react';

type ExampleView = 'all' | 'start-here' | ExampleCategoryId;
type KindFilter = 'all' | ExampleKind;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExampleSelect: (id: string) => void;
}

const categoryById = new Map(EXAMPLE_CATEGORIES.map((category) => [category.id, category]));
const kindFilters: readonly KindFilter[] = ['all', 'recipe', 'sampler', 'design', 'validation'];
const examplePreviewRoot = `${import.meta.env.BASE_URL}example-previews`;

function normalizedSearchText(example: Example): string {
  return [
    example.id,
    example.title,
    example.summary,
    example.category,
    example.kind,
    ...example.tags,
    example.source,
  ]
    .join('\n')
    .toLocaleLowerCase();
}

function matchesQuery(searchText: string, query: string): boolean {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return terms.every((term) => searchText.includes(term));
}

export function ExampleBrowser({ open, onOpenChange, onExampleSelect }: Props) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ExampleView>('start-here');
  const [kind, setKind] = useState<KindFilter>('all');

  const indexedExamples = useMemo(
    () => ALL_EXAMPLES.map((example) => ({ example, searchText: normalizedSearchText(example) })),
    [],
  );

  const filteredExamples = useMemo(() => {
    const candidates =
      view === 'start-here'
        ? START_HERE_EXAMPLES
        : indexedExamples.reduce<Example[]>((matching, { example }) => {
            if (view === 'all' || example.category === view) matching.push(example);
            return matching;
          }, []);
    const searchTextById = new Map(
      indexedExamples.map(({ example, searchText }) => [example.id, searchText]),
    );

    return candidates.filter(
      (example) =>
        (kind === 'all' || example.kind === kind) &&
        matchesQuery(searchTextById.get(example.id) ?? '', query),
    );
  }, [indexedExamples, kind, query, view]);

  const selectExample = (id: string) => {
    onExampleSelect(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="border-b border-foreground/10 px-5 py-4 pr-14">
          <DialogTitle className="font-mono text-[15px]">Find an example</DialogTitle>
          <DialogDescription>
            Search by coding need, NeedleScript command, embroidery technique, or title.
          </DialogDescription>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close example browser</span>
          </button>
        </DialogHeader>

        <div className="space-y-3 border-b border-foreground/10 bg-muted/20 px-5 py-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “clipping”, “satinbetween”, “recursion”, or “fleece”…"
              aria-label="Search examples"
              className="h-10 bg-background pr-10 pl-9 font-mono"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear example search"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <FilterButton active={view === 'start-here'} onClick={() => setView('start-here')}>
              <SparklesIcon className="size-3" />
              Start here
            </FilterButton>
            <FilterButton active={view === 'all'} onClick={() => setView('all')}>
              All
            </FilterButton>
            {EXAMPLE_CATEGORIES.map((category) => (
              <FilterButton
                key={category.id}
                active={view === category.id}
                onClick={() => setView(category.id)}
              >
                {category.label}
              </FilterButton>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Kind
            </span>
            {kindFilters.map((candidate) => (
              <FilterButton
                key={candidate}
                active={kind === candidate}
                small
                onClick={() => setKind(candidate)}
              >
                {candidate === 'all' ? 'Any' : EXAMPLE_KIND_LABELS[candidate]}
              </FilterButton>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-foreground/10 px-5 py-2 font-mono text-[11px] text-muted-foreground">
          <span>
            {filteredExamples.length} {filteredExamples.length === 1 ? 'example' : 'examples'}
          </span>
          {view !== 'all' && view !== 'start-here' && (
            <span className="hidden sm:inline">{categoryById.get(view)?.description}</span>
          )}
        </div>

        <div className="max-h-[56vh] min-h-48 overflow-y-auto p-3 sm:p-4">
          {filteredExamples.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {filteredExamples.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => selectExample(example.id)}
                  className="group flex cursor-pointer gap-3 rounded-lg border border-foreground/10 bg-background p-2.5 text-left transition-colors hover:border-gold/45 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="relative size-[74px] shrink-0 overflow-hidden rounded-md border border-foreground/10 bg-muted/55">
                    <ImageIcon className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/35" />
                    <img
                      src={`${examplePreviewRoot}/${example.id}.svg`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 size-full object-cover"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-[13px] font-semibold text-foreground group-hover:text-gold">
                        {example.title}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 font-mono text-[9px] uppercase"
                      >
                        {EXAMPLE_KIND_LABELS[example.kind]}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {example.summary}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden">
                      <span className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-gold/80 uppercase">
                        {categoryById.get(example.category)?.label}
                      </span>
                      <span className="text-foreground/20">·</span>
                      <span className="truncate font-mono text-[9px] text-muted-foreground">
                        {example.tags.slice(0, 4).join(' · ')}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">
                        {example.lineCount} lines
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
              <SearchIcon className="mb-3 size-6 text-muted-foreground/50" />
              <p className="font-mono text-sm text-foreground">No matching examples</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try another term or broaden the topic and kind filters.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterButton({
  active,
  small = false,
  className,
  ...props
}: ComponentProps<'button'> & { active: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'flex shrink-0 cursor-pointer items-center rounded-full border font-mono transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        small ? 'h-6 px-2 text-[10px]' : 'h-7 px-2.5 text-[11px]',
        active
          ? 'border-gold/55 bg-warm-btn text-gold'
          : 'border-foreground/10 bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
