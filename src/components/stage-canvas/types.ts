import type { DesignState, LineStitchBounds } from '../../App.tsx';
import type { HoopConfig } from '../../data.ts';
import type { HoopInfo, PhysicsDiagnostic, WarningLocation } from '../../lib/engine.ts';
import type { PathParamDef, PointParamDef, XYRegion } from '../../lib/editor/parameters.ts';

export interface StageCanvasProps {
  design: DesignState;
  hoop: HoopConfig;
  /** Active hoop from the `hoop` language directive, if any. Overrides `hoop` dimensions when present. */
  activeHoop?: HoopInfo;
  scrubPos: number;
  showDensity: boolean;
  hideJumps: boolean;
  showChalk: boolean;
  hoveredDataVar?: string | null;
  pinnedDataVars?: Set<string>;
  warningLoc: WarningLocation | null;
  /** Current diagnostics available for stage overlays and semantic hit-testing. */
  physicsDiagnostics?: PhysicsDiagnostic[];
  selectedDiagnosticId?: string | null;
  hoveredDiagnosticId?: string | null;
  showSelectedDiagnostic?: boolean;
  dimBaseForDiagnostic?: boolean;
  onDiagnosticHover?: (diagnostic: PhysicsDiagnostic | null) => void;
  onDiagnosticSelect?: (diagnostic: PhysicsDiagnostic) => void;
  /** Bounding box of the source line currently hovered in the editor. */
  hoveredLineBounds?: LineStitchBounds | null;
  /** SVG-import staging overlays drawn above the stitches (optional). */
  overlays?: CanvasOverlay[];
  /** Click-to-pick handler in mm space, for canvas → row linking (optional). */
  onPick?: (mm: { x: number; y: number }) => void;
  /** Point parameters to render as draggable handles on the stage. */
  pointParams?: PointParamDef[];
  /** Path/curve controls used for segment hit-testing and structural edits. */
  pathParams?: PathParamDef[];
  /** Whether to show handles (can be toggled with the "handles" chip). */
  showHandles?: boolean;
  /** Name of the handle currently highlighted (from panel row hover / Locate). */
  highlightedHandle?: string | null;
  /** Names of locked params — locks render as gold-filled handles. */
  lockedHandles?: Set<string>;
  /** Fired while the user is dragging a handle (throttled by caller). */
  onHandleDrag?: (
    name: string,
    line: number,
    x: number,
    y: number,
    options?: { breakPair: boolean },
  ) => void;
  /** Fired on pointer-up (or Esc-cancel with restored start values). */
  onHandleCommit?: (
    name: string,
    line: number,
    x: number,
    y: number,
    options?: { breakPair: boolean },
  ) => void;
  onPathInsert?: (name: string, segment: number, t: number) => void;
  onPathDelete?: (name: string, anchor: number) => void;
  onCurveToggleSmooth?: (name: string, anchor: number) => void;
  onPathTranslate?: (name: string, dx: number, dy: number, commit: boolean) => void;
  /** Opens the shared machine/fabric context menu. */
  onMachineContextMenu?: (x: number, y: number) => void;
}

/** A set of rings drawn over the stitches for the staging workspace. */
export interface CanvasOverlay {
  rings: [number, number][][];
  /** excluded = faint excluded outline · overlay = source artwork · highlight = selection */
  kind: 'excluded' | 'overlay' | 'highlight';
}

/** Viewport in mm-space. When null the view auto-fits the hoop. */
export type Viewport = {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
};

/** Cached rendering transform so pointer handlers can convert CSS px → mm. */
export type RenderTransform = {
  scale: number;
  cx: number;
  cy: number;
  viewCX: number;
  viewCY: number;
};

export type DragState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export type SampleContextMenu = {
  clientX: number;
  clientY: number;
  mmX: number;
  mmY: number;
};

/** State for an in-progress handle drag. */
export type HandleDragState = {
  name: string;
  line: number;
  region: XYRegion;
  snap?: number;
  startMmX: number;
  startMmY: number;
  startPointerMmX: number;
  startPointerMmY: number;
  currentMmX: number;
  currentMmY: number;
  breakPair: boolean;
};

export type PathDragState = {
  name: string;
  startPointerMmX: number;
  startPointerMmY: number;
  currentDx: number;
  currentDy: number;
};
