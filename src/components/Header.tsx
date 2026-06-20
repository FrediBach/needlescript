import { useRef, useState } from 'react';
import { EXAMPLE_TIERS } from '../data.ts';
import type { HoopConfig } from '../data.ts';
import { HoopIcon } from './HoopDialog.tsx';
import styles from './Header.module.css';
import { buttonVariants } from '@/components/ui/button.tsx';
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
const hdrBtn = "h-[30px] text-ui font-mono cursor-pointer flex-shrink-0";

// Red primary style — Run and Export share this look
const redBtn = cn(
  hdrBtn, "px-3.5 relative rounded-[6px] border",
  "inline-flex items-center font-semibold select-none",
  "bg-run border-run-dark text-on-run",
  "hover:bg-run-hi",
  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring",
  "after:absolute after:inset-[3px] after:border after:border-dashed after:border-white/55 after:rounded-[3px] after:pointer-events-none",
  "disabled:pointer-events-none disabled:opacity-50",
);

// Warm secondary style — Hoop, Import SVG, Share
const blueBtn = cn(
  hdrBtn, "px-2.5 rounded-[6px] border",
  "inline-flex items-center gap-1.5",
  "bg-warm-btn border-warm-btn-edge text-gold",
  "hover:bg-warm-btn-hi hover:border-warm-btn-edge-hi hover:text-gold-light",
  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring",
  "disabled:pointer-events-none disabled:opacity-50",
);

// ── Examples select — reused in header ────────────────────────────────────────
function ExamplesSelect({ onExampleSelect }: { onExampleSelect: (key: string) => void }) {
  return (
    <Select onValueChange={(val: string | null) => { if (val) onExampleSelect(val); }}>
      <SelectTrigger
        aria-label="Example programs"
        className={cn(hdrBtn, "w-[180px] bg-warm-btn border-warm-btn-edge text-gold hover:border-warm-btn-edge-hi hover:text-gold-light gap-1")}
      >
        <SelectValue placeholder="examples" />
      </SelectTrigger>
      <SelectContent className="font-mono text-ui">
        {EXAMPLE_TIERS.map((tier, i) => (
          <>
            {i > 0 && <SelectSeparator key={`sep-${tier.label}`} />}
            <SelectGroup key={tier.label}>
              <SelectLabel className="text-label tracking-[0.13em] uppercase text-faint">
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
        className={cn(redBtn, "gap-1")}
        aria-label="Export embroidery file"
      >
        Export <ChevronDownIcon className="size-[11px] opacity-75 -ml-0.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[176px] font-mono text-ui">
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
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'pending'}
      aria-label="Copy shareable link to clipboard"
      className={cn(
        blueBtn, "w-[72px] justify-center",
        state === 'copied' && "bg-[var(--share-ok-bg)] border-[var(--share-ok-border)] text-[var(--share-ok-text)] hover:bg-[var(--share-ok-bg)] hover:border-[var(--share-ok-border)]",
        state === 'error'  && "bg-[var(--share-err-bg)] border-[var(--share-err-border)] text-[var(--share-err-text)] hover:bg-[var(--share-err-bg)] hover:border-[var(--share-err-border)]",
      )}
    >
      {label}
    </button>
  );
}

// ── Hamburger menu ─────────────────────────────────────────────────────────────
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
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'outline' }),
          "flex lg:hidden size-[30px] p-0 flex-shrink-0",
          "bg-warm-btn border-warm-btn-edge text-gold",
          "hover:bg-warm-btn-hi hover:border-warm-btn-edge-hi hover:text-gold-light",
        )}
        aria-label="More options"
      >
        <MenuIcon className="size-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52 font-mono text-ui">

        {/* ── Design group: shown when < md ── */}
        <DropdownMenuGroup className="md:hidden">
          <DropdownMenuLabel className="text-label tracking-[0.13em] uppercase text-faint px-2 py-1">
            Design
          </DropdownMenuLabel>

          <DropdownMenuItem onClick={onOpenHoopDialog}>
            <span className="flex-shrink-0">
              <HoopIcon hoop={hoop} size={13} />
            </span>
            <span>Hoop</span>
            <span className="ml-auto text-[10.5px] text-muted-foreground">{hoop.label}</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Examples</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[172px] max-h-[320px] overflow-y-auto font-mono text-ui">
              {EXAMPLE_TIERS.map((tier, i) => (
                <>
                  {i > 0 && <DropdownMenuSeparator key={`sep-${tier.label}`} />}
                  <DropdownMenuLabel key={`lbl-${tier.label}`} className="text-label tracking-[0.13em] uppercase text-faint">
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

        {/* ── Tools group: shown when < lg ── */}
        <DropdownMenuGroup className="lg:hidden">
          <DropdownMenuLabel className="text-label tracking-[0.13em] uppercase text-faint px-2 py-1">
            Import
          </DropdownMenuLabel>
          <DropdownMenuItem className="lg:hidden" onClick={onSVGImport}>
            <UploadIcon className="size-3.5 opacity-55" />
            Import SVG
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="lg:hidden" />

        {/* ── Output group: shown when < lg ── */}
        <DropdownMenuGroup className="lg:hidden">
          <DropdownMenuLabel className="text-label tracking-[0.13em] uppercase text-faint px-2 py-1">
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

      {/* ══ BRAND ════════════════════════════════════════════════════════════ */}
      <div className={cn(styles.brand, "xl:mr-4")}>
        <LogoIcon size={22} />
        <h1 className={styles.wordmarkText}>NeedleScript</h1>
        <span className={cn(styles.tag, "hidden xl:block")}>
          Logo inspired programming language for generative embroidery
        </span>
        <span>&nbsp;</span>
      </div>

      {/* ══ DESIGN GROUP (Hoop + Examples at md+) ════════════════════════════ */}
      <div className="hidden md:flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            onClick={onOpenHoopDialog}
            aria-label={`Hoop: ${hoop.label}`}
            className={blueBtn}
          >
            <HoopIcon hoop={hoop} size={14} />
            <span className="hidden lg:inline">{hoop.label}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Change hoop size and shape</TooltipContent>
        </Tooltip>

        <ExamplesSelect onExampleSelect={onExampleSelect} />
      </div>

      {/* ══ IMPORT SVG (lg+ only) ═════════════════════════════════════════════ */}
      <div className="hidden lg:flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            onClick={onSVGImport}
            className={blueBtn}
            aria-label="Import an SVG file"
          >
            <UploadIcon className="size-3.5 opacity-65" />
            Import SVG
          </TooltipTrigger>
          <TooltipContent side="bottom">Convert an SVG file to NeedleScript code</TooltipContent>
        </Tooltip>
      </div>

      {/* ══ FLEX SPACER ══════════════════════════════════════════════════════ */}
      <div className="flex-1" />

      {/* ══ ACTION GROUP ═════════════════════════════════════════════════════ */}
      <button
        type="button"
        onClick={onRun}
        className={cn(redBtn, "gap-1.5")}
      >
        Run [cmd+enter]
      </button>

      <div className="hidden lg:flex items-center gap-1.5">
        <ExportDropdown onDownload={onDownload} />
        <ShareButton onShare={onShare} />
      </div>

      {/* ══ META GROUP (Help + Hamburger) ════════════════════════════════════ */}
      <Tooltip>
        <TooltipTrigger
          onClick={onOpenReference}
          aria-label="Language reference"
          className={cn(
            "flex items-center justify-center size-[30px] rounded-full p-0 flex-shrink-0 relative",
            "cursor-pointer select-none font-mono font-semibold text-body",
            "bg-transparent border border-warm-btn-edge text-gold",
            "hover:bg-warm-btn hover:border-warm-btn-edge-hi hover:text-gold-light",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            "after:absolute after:inset-[3px] after:border after:border-dashed after:border-gold/50 after:rounded-full after:pointer-events-none",
            styles.helpBtn,
          )}
        >
          ?
        </TooltipTrigger>
        <TooltipContent side="bottom">Language reference</TooltipContent>
      </Tooltip>

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
