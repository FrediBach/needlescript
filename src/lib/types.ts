// ---------- Shared types ----------

export type TokenType = 'num' | 'var' | 'qword' | 'word' | 'op' | '[' | ']' | '(' | ')' | ',';

export interface Token {
  t: TokenType;
  v?: string | number;
  line: number;
  /** Start character offset in the source (inclusive). */
  start: number;
  /** End character offset in the source (exclusive). */
  end: number;
  spBefore?: boolean;
  spAfter?: boolean;
}

export type EventType = 'stitch' | 'jump' | 'color' | 'trim' | 'mark';

export interface StitchEvent {
  t: EventType;
  x: number;
  y: number;
  c: number; // color index
  line?: number; // source line that produced this event (debugging)
  u?: 1; // underlay stitch (drawn lighter in previews; identical in exports)
}

export interface RunResult {
  events: StitchEvent[];
  warnings: string[];
  printed: string[];
  locks: number;
  density: DensityResult;
}

export interface DesignStats {
  stitches: number;
  jumps: number;
  trims: number;
  colorChanges: number;
  colorsUsed: number;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  maxStitchLen: number;
  maxRadius: number;
}

// ---------- AST node types ----------

export type ASTNode =
  | { k: 'to'; name: string; params: string[]; body: ASTNode[]; line: number }
  | { k: 'repeat'; count: ExprNode; body: ASTNode[]; line: number }
  | { k: 'while'; cond: ExprNode; body: ASTNode[]; line: number }
  | { k: 'for'; varName: string; from: ExprNode; to: ExprNode; step: ExprNode; body: ASTNode[]; line: number }
  | { k: 'forin'; varName: string; list: ExprNode; body: ASTNode[]; line: number }
  | { k: 'if'; cond: ExprNode; body: ASTNode[]; elseBody: ASTNode[] | null; line: number }
  | { k: 'make'; name: string; value: ExprNode; line: number }
  | { k: 'local'; name: string; value: ExprNode; line: number }
  | { k: 'letlist'; names: string[]; value: ExprNode; line: number; isLocal: boolean }
  | { k: 'setindex'; name: string; indices: ExprNode[]; op: string; value: ExprNode; line: number }
  | { k: 'output'; value: ExprNode | null; line: number } // value null = "exit"
  | { k: 'break'; line: number }
  | { k: 'continue'; line: number }
  | { k: 'cmd'; name: string; args: ExprNode[]; line: number; label?: string; word?: string }
  | { k: 'listcmd'; name: string; args: ExprNode[]; line: number }
  | { k: 'call'; name: string; args: ExprNode[]; line: number };

export type ExprNode =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string; line: number; bare?: boolean }
  | { k: 'neg'; val: ExprNode; line: number }
  | { k: 'bin'; op: string; left: ExprNode; right: ExprNode }
  | { k: 'func'; name: string; args: ExprNode[]; line: number }
  | { k: 'listfunc'; name: string; args: ExprNode[]; line: number; word?: string }
  | { k: 'list'; items: ExprNode[]; line: number }
  | { k: 'index'; obj: ExprNode; idx: ExprNode; line: number }
  | { k: 'callval'; obj: ExprNode; args: ExprNode[]; line: number }
  | { k: 'callexpr'; name: string; args: ExprNode[]; line: number };

// ---------- Density analysis types ----------

export interface DensityCell { ix: number; iy: number; count: number; layers: number }

export interface DensityHotspot {
  x: number;
  y: number;
  value: number; // thread coverage in layers ('density') or hits in one hole ('stack')
  lines: number[];
  kind: 'density' | 'stack';
}

export interface DensityResult {
  cellMM: number;
  cells: DensityCell[];
  peak: number; // highest thread coverage, in layers
  hotspots: DensityHotspot[];
}

// ---------- Run options ----------

export interface RunOptions {
  seed?: number;
}
