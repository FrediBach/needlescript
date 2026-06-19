import { useRef, useState } from 'react';
import { EXAMPLE_TIERS } from '../data.ts';
import type { HoopConfig } from '../data.ts';
import { HoopIcon } from './HoopDialog.tsx';
import styles from './Header.module.css';
import { Button, buttonVariants } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu.tsx';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select.tsx';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import {
  MenuIcon,
  ChevronDownIcon,
  DownloadIcon,
  Share2Icon,
  UploadIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils.ts';

export type ExportFormat = 'dst' | 'pes' | 'exp';

interface Props {
  hoop: HoopConfig;
  onOpenHoopDialog: () => void;
  onSVGImport: () => void;
  onExampleSelect: (key: string) => void;
  onRun: () => void;
  onDownload: (format: ExportFormat) => void;
  onShare: () => Promise<void>;
  onOpenReference: () => void;
}

// ── Inline logo SVG ────────────────────────────────────────────────────────────
// Background removed (transparent), fills set to currentColor so it inherits
// the wordmark text colour.
function LogoIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 692 692" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#clip0_9_26)">
        <rect x="123" y="520.009" width="578" height="77" rx="38.5" transform="rotate(-45 123 520.009)" fill="currentColor"/>
        <path d="M557.932 493.786C572.966 508.821 572.967 533.198 557.932 548.233C542.897 563.268 518.52 563.268 503.484 548.233L370.503 415.252L424.95 360.805L557.932 493.786ZM149.224 139.525C164.259 124.49 188.636 124.49 203.671 139.525L337.269 273.123L282.821 327.57L149.224 193.973C134.188 178.938 134.188 154.561 149.224 139.525Z" fill="currentColor"/>
        <path d="M92 208C33.6349 129.275 130.431 30.0039 213.5 82" stroke="currentColor" strokeWidth="48" strokeLinecap="round"/>
        <path d="M614 208C672.365 129.275 575.569 30.0039 492.5 82" stroke="currentColor" strokeWidth="48" strokeLinecap="round"/>
        <path d="M92 473C33.6349 551.725 130.431 650.996 213.5 599" stroke="currentColor" strokeWidth="48" strokeLinecap="round"/>
        <path d="M614 473C672.365 551.725 575.569 650.996 492.5 599" stroke="currentColor" strokeWidth="48" strokeLinecap="round"/>
      </g>
      <defs>
        <clipPath id="clip0_9_26">
          <rect width="692" height="692" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  );
}

// Shared sizing token for all header buttons
const hdrBtn = "h-[30px] text-[12.5px] font-mono cursor-pointer flex-shrink-0";

// ── Thin vertical group separator ─────────────────────────────────────────────
// No height override — the base-ui Separator's data-vertical:self-stretch lets
// it fill the container height naturally (matches the 48px header row).
// opacity-50 keeps it subtle against the dark background.
function VSep({ className }: { className?: string }) {
  return (
    <Separator
      orientation="vertical"
      className={cn("flex-shrink-0 mx-1.5 opacity-50", className)}
    />
  );
}

// ── Examples select — reused in header ────────────────────────────────────────
function ExamplesSelect({ onExampleSelect }: { onExampleSelect: (key: string) => void }) {
  return (
    <Select onValueChange={(val: string | null) => { if (val) onExampleSelect(val); }}>
      <SelectTrigger
        aria-label="Example programs"
        className={cn(hdrBtn, "w-[240px] bg-secondary gap-1 pr-1.5")}
      >
        <SelectValue placeholder="examples" />
      </SelectTrigger>
      <SelectContent className="font-mono text-[12.5px]">
        {EXAMPLE_TIERS.map((tier, i) => (
          <>
            {i > 0 && <SelectSeparator key={`sep-${tier.label}`} />}
            <SelectGroup key={tier.label}>
              <SelectLabel className="text-[10px] tracking-[0.13em] uppercase text-[#6E7494]">
                {tier.label}
              </SelectLabel>
              {tier.keys.map(k => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectGroup>
          </>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Export dropdown (visible at lg+, also in hamburger) ───────────────────────
function ExportDropdown({ onDownload }: { onDownload: (fmt: ExportFormat) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'default' }),
          hdrBtn, "px-3.5 gap-1 relative",
          "after:absolute after:inset-[3px] after:border after:border-dashed after:border-white/55 after:rounded-sm after:pointer-events-none",
        )}
        aria-label="Export embroidery file"
      >
        Export <ChevronDownIcon className="size-[11px] opacity-75 -ml-0.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[156px] font-mono text-[12.5px]">
        {(['dst', 'pes', 'exp'] as ExportFormat[]).map(fmt => (
          <DropdownMenuItem key={fmt} onClick={() => onDownload(fmt)}>
            <DownloadIcon className="size-3.5 opacity-55" />
            {fmt === 'dst' ? '.DST · Tajima' : fmt === 'pes' ? '.PES · Brother' : '.EXP · Melco'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Share button (visible at lg+, also in hamburger) ──────────────────────────
function ShareButton({ onShare }: { onShare: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'pending' | 'copied' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleClick() {
    if (state === 'pending') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('pending');
    try {
      await onShare();
      setState('copied');
    } catch {
      setState('error');
    }
    timerRef.current = setTimeout(() => setState('idle'), 2000);
  }

  const label = state === 'pending' ? '…'
    : state === 'copied' ? 'Copied!'
    : state === 'error'  ? 'Failed'
    : 'Share';

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={state === 'pending'}
      aria-label="Copy shareable link to clipboard"
      className={cn(
        hdrBtn, "w-[72px] justify-center",
        state === 'copied' && "bg-[#1e4030] border-[#2e6048] text-[#7ddaab] hover:bg-[#1e4030] hover:border-[#2e6048]",
        state === 'error'  && "bg-[#3d1e1e] border-[#6a2a2a] text-[#f08080] hover:bg-[#3d1e1e] hover:border-[#6a2a2a]",
      )}
    >
      {label}
    </Button>
  );
}

// ── Hamburger menu ─────────────────────────────────────────────────────────────
// Visible on all screens below lg (< 1024px). Its internal items are
// conditionally hidden via Tailwind responsive classes so each item only
// appears when the corresponding header control is NOT visible.
//
// Breakpoint collapse map:
//   xs (<640px)  — Hoop, Examples, Import SVG, Export, Share, Help
//   sm (640-767px) — Hoop, Examples, Import SVG, Export, Share  [Help in header]
//   md (768-1023px) — Import SVG, Export, Share  [Hoop+Examples in header]
//   lg+ (≥1024px): hamburger hidden entirely
//
interface HamburgerProps {
  hoop: HoopConfig;
  onOpenHoopDialog: () => void;
  onExampleSelect: (key: string) => void;
  onSVGImport: () => void;
  onDownload: (fmt: ExportFormat) => void;
  onShare: () => Promise<void>;
}

function HamburgerMenu({
  hoop, onOpenHoopDialog, onExampleSelect, onSVGImport,
  onDownload, onShare,
}: HamburgerProps) {
  return (
    <DropdownMenu>
      {/* Trigger — stays in DOM at all sizes; CSS hides it at lg+ */}
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'outline' }),
          // tailwind-merge removes the inline-flex from buttonVariants and keeps flex
          "flex lg:hidden size-[30px] p-0 flex-shrink-0",
        )}
        aria-label="More options"
      >
        <MenuIcon className="size-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52 font-mono text-[12.5px]">

        {/* ── Design group: shown when < md (Hoop + Examples not in header) ── */}
        <DropdownMenuGroup className="md:hidden">
          <DropdownMenuLabel className="text-[10px] tracking-[0.13em] uppercase text-[#6E7494] px-2 py-1">
            Design
          </DropdownMenuLabel>

          {/* Hoop — opens HoopDialog */}
          <DropdownMenuItem onClick={onOpenHoopDialog}>
            <span className="flex-shrink-0">
              <HoopIcon hoop={hoop} size={13} />
            </span>
            <span>Hoop</span>
            <span className="ml-auto text-[10.5px] text-muted-foreground">{hoop.label}</span>
          </DropdownMenuItem>

          {/* Examples — sub-menu with all examples grouped by tier */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Examples</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[172px] max-h-[320px] overflow-y-auto font-mono text-[12.5px]">
              {EXAMPLE_TIERS.map((tier, i) => (
                <>
                  {i > 0 && <DropdownMenuSeparator key={`sep-${tier.label}`} />}
                  <DropdownMenuLabel key={`lbl-${tier.label}`} className="text-[10px] tracking-[0.13em] uppercase text-[#6E7494]">
                    {tier.label}
                  </DropdownMenuLabel>
                  {tier.keys.map(k => (
                    <DropdownMenuItem key={k} onClick={() => onExampleSelect(k)}>
                      {k}
                    </DropdownMenuItem>
                  ))}
                </>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="md:hidden" />

        {/* ── Tools group: shown when < lg (Import SVG not in header) ── */}
        <DropdownMenuGroup className="lg:hidden">
          <DropdownMenuLabel className="text-[10px] tracking-[0.13em] uppercase text-[#6E7494] px-2 py-1">
            Import
          </DropdownMenuLabel>
          <DropdownMenuItem className="lg:hidden" onClick={onSVGImport}>
            <UploadIcon className="size-3.5 opacity-55" />
            Import SVG
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="lg:hidden" />

        {/* ── Output group: shown when < lg (Export + Share not in header) ── */}
        <DropdownMenuGroup className="lg:hidden">
          <DropdownMenuLabel className="text-[10px] tracking-[0.13em] uppercase text-[#6E7494] px-2 py-1">
            Export &amp; Share
          </DropdownMenuLabel>
          {(['dst', 'pes', 'exp'] as ExportFormat[]).map(fmt => (
            <DropdownMenuItem key={fmt} onClick={() => onDownload(fmt)}>
              <DownloadIcon className="size-3.5 opacity-55" />
              {fmt === 'dst' ? '.DST · Tajima' : fmt === 'pes' ? '.PES · Brother' : '.EXP · Melco'}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { void onShare(); }}>
            <Share2Icon className="size-3.5 opacity-55" />
            Copy share link
          </DropdownMenuItem>
        </DropdownMenuGroup>

      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Main header ────────────────────────────────────────────────────────────────
export default function Header({
  hoop, onOpenHoopDialog, onSVGImport, onExampleSelect, onRun, onDownload, onShare, onOpenReference,
}: Props) {
  return (
    <header className={styles.header}>

      {/* ══ BRAND (always visible) ══════════════════════════════════════════ */}
      {/* At xl+, add extra right margin after the slogan for visual breathing room */}
      <div className={cn(styles.brand, "xl:mr-4")}>
        <LogoIcon size={22} />
        {/* Wordmark always visible — it's the app identity */}
        <h1 className={styles.wordmarkText}>NeedleScript</h1>
        {/* Subtitle only at very wide screens */}
        <span className={cn(styles.tag, "hidden xl:block")}>
          Logo inspired programming language for generative embroidery
        </span>
      </div>

      {/* ══ DESIGN GROUP (Hoop + Examples visible at md+) ═══════════════════ */}
      {/* Group separator — only when the group is visible */}
      <VSep className="hidden md:flex" />

      <div className="hidden md:flex items-center gap-1.5">
        {/* Hoop selector */}
        <Tooltip>
          <TooltipTrigger
            onClick={onOpenHoopDialog}
            aria-label={`Hoop: ${hoop.label}`}
            className={cn(buttonVariants({ variant: 'outline' }), hdrBtn, "gap-1.5 px-2.5")}
          >
            <HoopIcon hoop={hoop} size={14} />
            {/* Hoop label visible only at lg+ to save space at md */}
            <span className="hidden lg:inline">{hoop.label}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Change hoop size and shape</TooltipContent>
        </Tooltip>

        {/* Examples picker */}
        <ExamplesSelect onExampleSelect={onExampleSelect} />
      </div>

      {/* ══ IMPORT SVG (lg+ only — less frequently used) ════════════════════ */}
      <div className="hidden lg:flex items-center gap-1.5">
        <VSep />
        <Tooltip>
          <TooltipTrigger
            onClick={onSVGImport}
            className={cn(buttonVariants({ variant: 'outline' }), hdrBtn, "gap-1.5 px-2.5")}
            aria-label="Import an SVG file"
          >
            <UploadIcon className="size-3.5 opacity-65" />
            Import SVG
          </TooltipTrigger>
          <TooltipContent side="bottom">Convert an SVG file to NeedleScript code</TooltipContent>
        </Tooltip>
      </div>

      {/* ══ FLEX SPACER — pushes action group to the right ═════════════════ */}
      <div className="flex-1" />

      {/* ══ ACTION GROUP ════════════════════════════════════════════════════ */}
      {/* Run — primary action, always visible */}
      <button
        type="button"
        onClick={onRun}
        className={cn(
          "inline-flex items-center gap-1.5 flex-shrink-0 cursor-pointer select-none",
          "font-mono font-semibold",
          hdrBtn, "px-3.5 relative rounded-[6px]",
          "bg-[var(--red)] border border-[var(--red-d)] text-[#FFF4EA]",
          "hover:bg-[#D55036]",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring",
          // Dashed inner border — the signature visual of the primary action
          "after:absolute after:inset-[3px] after:border after:border-dashed after:border-white/55 after:rounded-[3px] after:pointer-events-none",
        )}
      >
        Run&nbsp;⌘&nbsp;↵
      </button>

      {/* Export + Share — secondary output actions visible at lg+ */}
      <div className="hidden lg:flex items-center gap-1.5">
        <ExportDropdown onDownload={onDownload} />
        <ShareButton onShare={onShare} />
      </div>

      {/* ══ META GROUP (Help + Hamburger) ═══════════════════════════════════ */}
      <VSep />

      {/* Help — always visible */}
      <Tooltip>
        <TooltipTrigger
          onClick={onOpenReference}
          aria-label="Language reference"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            "flex size-[30px] rounded-full p-0 flex-shrink-0",
            "text-[13.5px] font-semibold font-mono text-muted-foreground hover:text-foreground",
          )}
        >
          ?
        </TooltipTrigger>
        <TooltipContent side="bottom">Language reference</TooltipContent>
      </Tooltip>

      {/* Hamburger — visible at < lg; content adapts per breakpoint */}
      <HamburgerMenu
        hoop={hoop}
        onOpenHoopDialog={onOpenHoopDialog}
        onExampleSelect={onExampleSelect}
        onSVGImport={onSVGImport}
        onDownload={onDownload}
        onShare={onShare}
      />

    </header>
  );
}
