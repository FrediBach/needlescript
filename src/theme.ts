/**
 * src/theme.ts
 *
 * Design token mirror for Monaco and Canvas contexts where CSS custom
 * properties are not accessible at runtime.
 *
 * ⚠️  KEEP IN SYNC with the `:root` block in src/index.css.
 *     Every value here must match its counterpart CSS custom property.
 */

// ── Surfaces — cool blue-gray IDE chrome ──────────────────────────────────
export const bgApp         = '#1B2030';   /* --bg-app */
export const bgPanel       = '#252B41';   /* --bg-panel */
export const bgPanelRaised = '#2D3450';   /* --bg-panel-raised */

// ── Surfaces — warm sepia ─────────────────────────────────────────────────
export const bgWarm        = '#2E2128';   /* --bg-warm */
export const bgWarmDeep    = '#1E1118';   /* --bg-warm-deep */

// ── Surfaces — stage / canvas ─────────────────────────────────────────────
export const bgCanvas      = '#FFFDF7';   /* --bg-canvas */
export const bgCanvasHover = '#F5EFE8';   /* --bg-canvas-hover */
export const fabric        = '#EFE8D8';   /* --fabric */
export const fabricDark    = '#E5DCC7';   /* --fabric-dark */

// ── Embroidery hoop ───────────────────────────────────────────────────────
export const hoopColor     = '#B98B4E';   /* --hoop-color */
export const hoopColorDark = '#7E5C2E';   /* --hoop-color-dark */

// ── Borders ───────────────────────────────────────────────────────────────
export const borderCool    = '#3A4163';   /* shadcn --border */
export const borderWarm    = '#5A3A30';   /* --border-warm */
export const borderWarmSub = '#4A3632';   /* --border-warm-sub */

// ── Text — cool surfaces ──────────────────────────────────────────────────
export const text          = '#EDE7DA';   /* --text */
export const textMuted     = '#9BA1BD';   /* --text-muted */
export const textFaint     = '#6E7494';   /* --text-faint */
export const textTag       = '#B0A090';   /* --text-tag */

// ── Text — warm surfaces ──────────────────────────────────────────────────
export const textWarm      = '#D0C5B2';   /* --text-warm */
export const textWarmMuted = '#7A6E68';   /* --text-warm-muted */
export const textWarmFaint = '#56433F';   /* --text-warm-faint */

// ── Text — canvas / fabric ────────────────────────────────────────────────
export const textOnCanvas    = '#4A3F2C';   /* --text-on-canvas */
export const textOnCanvasDim = '#5A4D35';   /* --text-on-canvas-dim */
export const textOnRun       = '#FFF4EA';   /* --text-on-run */

// ── Accent — brand gold ───────────────────────────────────────────────────
export const gold       = '#CBA16D';   /* --gold */
export const goldHi     = '#DBB17D';   /* --gold-hi */
export const goldLight  = '#EBC18D';   /* --gold-light */

// ── Actions — run (primary / red) ─────────────────────────────────────────
export const run      = '#C8472F';   /* --run */
export const runHi    = '#D55036';   /* --run-hi */
export const runDark  = '#A33823';   /* --run-dark */

// ── Actions — warm secondary buttons ──────────────────────────────────────
export const warmBtnBg          = '#3F2820';   /* --warm-btn-bg */
export const warmBtnBorder      = '#7A4E3C';   /* --warm-btn-border */
export const warmBtnHoverBg     = '#502E24';   /* --warm-btn-hover-bg */
export const warmBtnHoverBorder = '#9A6450';   /* --warm-btn-hover-border */

// ── Status ────────────────────────────────────────────────────────────────
export const consoleOk  = '#9DC08B';   /* --console-ok */
export const consoleErr = '#E98A77';   /* --console-err */

export const shareOkBg     = '#1E4030';   /* --share-ok-bg */
export const shareOkBorder = '#2E6048';   /* --share-ok-border */
export const shareOkText   = '#7DDAAB';   /* --share-ok-text */
export const shareErrBg    = '#3D1E1E';   /* --share-err-bg */
export const shareErrBorder = '#6A2A2A';  /* --share-err-border */
export const shareErrText  = '#F08080';   /* --share-err-text */

// ── Typography ────────────────────────────────────────────────────────────
export const fontMono  = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const fontSerif = '"Fraunces", Georgia, "Times New Roman", serif';

/** Font sizes in px — match the --fs-* CSS custom properties in index.css */
export const fsBadge    =  9;
export const fsLabel    = 10;
export const fsSub      = 11;
export const fsParam    = 11.5;
export const fsCode     = 12;
export const fsUi       = 12.5;
export const fsBase     = 13;
export const fsLg       = 14;
export const fsWordmark = 19;
export const fsDisplay  = 22;

/** Editor line height derived from base font size (1.55 ratio). */
export const editorLineHeight = Math.round(fsBase * 1.55); // 20px

// ── Monaco helper ─────────────────────────────────────────────────────────
/**
 * Strip the leading `#` from a hex color for Monaco token rule `foreground`
 * fields (which require bare 6-digit hex without the hash).
 *
 * Usage:  { token: 'ns-keyword', foreground: m(gold) }
 */
export const m = (hex: string): string => hex.replace('#', '');

// ── Syntax highlighting — Monaco token colors ─────────────────────────────
export const synComment  = '#6E7595';   // muted slate, italic
export const synKeyword  = gold;        // brand gold, bold
export const synMovement = '#62C4D4';   // sky teal
export const synStitch   = '#C87C3C';   // warm amber
export const synMath     = '#9888CC';   // soft lavender
export const synLib      = '#6AB898';   // mint green
export const synNumber   = '#D4B04A';
export const synString   = '#80B864';
export const synVariable = '#A8C4E0';   // steel blue, italic
export const synOperator = textMuted;   // = '#9BA1BD'
export const synBracket  = '#7A80A0';

// ── Monaco editor chrome colors ───────────────────────────────────────────
/** Gutter background — slightly darker than bgPanel. */
export const monacoGutter            = '#1F253A';
export const monacoLineNumber        = '#454C6E';
export const monacoLineNumberActive  = textMuted;    // '#9BA1BD'
/** Cursor-line highlight (not the playback line). */
export const monacoLineHighlight     = '#2D3454';
export const monacoIndentGuide       = '#3A416333';
export const monacoIndentGuideActive = '#5A618388';

// ── Canvas drawing colors (for StageCanvas ctx calls) ────────────────────
export const canvasJumpThread        = 'rgba(90,80,60,0.5)';
export const canvasNeedlePoint       = 'rgba(40,30,20,0.45)';
export const canvasHoopOverlay       = 'rgba(8,6,4,0.1)';
export const canvasHoopBoundary      = 'rgba(90,75,55,0.55)';
export const canvasNeedleMarker      = bgApp;           // '#1B2030'
export const canvasDebugPinFill      = 'rgba(255,253,247,0.92)';
export const canvasDebugPinStroke    = run;             // '#C8472F'
export const canvasDragRectBorder    = 'rgba(255,255,255,0.80)';
export const canvasDragRectFill      = 'rgba(255,255,255,0.07)';
export const canvasZoomBadgeBg       = 'rgba(20,15,10,0.55)';
export const canvasZoomBadgeText     = 'rgba(255,245,230,0.90)';
export const canvasDensityHot        = (alpha: number) => `rgba(200,38,24,${alpha})`;
export const canvasDensityWarm       = (alpha: number) => `rgba(228,138,32,${alpha})`;
