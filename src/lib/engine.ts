// ============================================================
// Needlescript core language engine
// Tokenizer, parser, stitch machine, fill engine, and interpreter.
// No DOM dependencies — usable as a standalone library.
//
// Units: millimetres. Heading: degrees, 0 = up/north, clockwise.
// ============================================================

// ---------- Types ----------

export type TokenType = 'num' | 'var' | 'qword' | 'word' | 'op' | '[' | ']' | '(' | ')';

export interface Token {
  t: TokenType;
  v?: string | number;
  line: number;
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
}

export interface RunResult {
  events: StitchEvent[];
  warnings: string[];
  printed: string[];
  locks: number;
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
  | { k: 'if'; cond: ExprNode; body: ASTNode[]; elseBody: ASTNode[] | null; line: number }
  | { k: 'make'; name: string; value: ExprNode; line: number }
  | { k: 'local'; name: string; value: ExprNode; line: number }
  | { k: 'output'; value: ExprNode | null; line: number } // value null = "exit"
  | { k: 'cmd'; name: string; args: ExprNode[]; line: number; label?: string }
  | { k: 'call'; name: string; args: ExprNode[]; line: number };

export type ExprNode =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string; line: number }
  | { k: 'neg'; val: ExprNode; line: number }
  | { k: 'bin'; op: string; left: ExprNode; right: ExprNode }
  | { k: 'func'; name: string; args: ExprNode[]; line: number }
  | { k: 'callexpr'; name: string; args: ExprNode[]; line: number };

// ---------- Error class ----------

export class NeedlescriptError extends Error {
  readonly slLine?: number;
  constructor(msg: string, line?: number) {
    super(line ? `${msg} (line ${line})` : msg);
    this.name = 'NeedlescriptError';
    this.slLine = line;
  }
}

// ---------- Seeded PRNG (mulberry32) ----------

export function makeRNG(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Seeded value noise ----------
// Smooth deterministic noise in [0, 1). Same seed → same field.

function hash2(seed: number, ix: number, iy: number): number {
  let h = (seed >>> 0) ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function makeNoise(seed: number): (x: number, y?: number) => number {
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y = 0) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const u = fade(x - ix), v = fade(y - iy);
    const a = hash2(seed, ix, iy), b = hash2(seed, ix + 1, iy);
    const c = hash2(seed, ix, iy + 1), d = hash2(seed, ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// ---------- Tokenizer ----------

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isWordChar = (c: string) => /[A-Za-z0-9_.?]/.test(c);

  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if ('[]()'.includes(c)) { tokens.push({ t: c as TokenType, line }); i++; continue; }
    if ('+-*/<>=!'.includes(c)) {
      const spBefore = i === 0 || /[\s[(]/.test(src[i - 1]);
      let op = c;
      if ((c === '<' || c === '>' || c === '!') && src[i + 1] === '=') op = c + '=';
      else if (c === '!')
        throw new NeedlescriptError('Unexpected character "!" — use != to compare', line);
      const after = i + op.length;
      const spAfter = after >= src.length || /\s/.test(src[after]);
      tokens.push({ t: 'op', v: op, line, spBefore, spAfter });
      i = after;
      continue;
    }
    if (isDigit(c) || (c === '.' && i + 1 < src.length && isDigit(src[i + 1]))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const v = parseFloat(src.slice(i, j));
      if (isNaN(v)) throw new NeedlescriptError(`Bad number "${src.slice(i, j)}"`, line);
      tokens.push({ t: 'num', v, line });
      i = j;
      continue;
    }
    if (c === ':') {
      let j = i + 1;
      while (j < src.length && isWordChar(src[j])) j++;
      if (j === i + 1) throw new NeedlescriptError('Expected a name after ":"', line);
      tokens.push({ t: 'var', v: src.slice(i + 1, j).toLowerCase(), line });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && isWordChar(src[j])) j++;
      if (j === i + 1) throw new NeedlescriptError('Expected a name after the quote (")', line);
      tokens.push({ t: 'qword', v: src.slice(i + 1, j).toLowerCase(), line });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && isWordChar(src[j])) j++;
      tokens.push({ t: 'word', v: src.slice(i, j).toLowerCase(), line });
      i = j;
      continue;
    }
    throw new NeedlescriptError(`Unexpected character "${c}"`, line);
  }
  return tokens;
}

// ---------- Command tables ----------

export const ALIASES: Record<string, string> = {
  forward: 'fd', back: 'bk', backward: 'bk', right: 'rt', left: 'lt',
  penup: 'up', pendown: 'down', pu: 'up', pd: 'down',
  setheading: 'seth', clearscreen: 'cs', clear: 'cs', stitchlength: 'stitchlen',
};

export const BUILTIN_ARITY: Record<string, number> = {
  fd: 1, bk: 1, rt: 1, lt: 1,
  up: 0, down: 0, home: 0, cs: 0,
  setxy: 2, setx: 1, sety: 1, seth: 1,
  arc: 2, push: 0, pop: 0,
  stitchlen: 1, satin: 1, density: 1,
  bean: 1, estitch: 1,
  beginfill: 0, endfill: 0, fillangle: 1, fillspacing: 1, filllen: 1,
  lock: 1,
  color: 1, stop: 0, trim: 0,
  seed: 1, print: 1, mark: 0, assert: 1,
};

export const FUNC_ARITY: Record<string, number> = {
  random: 1, sin: 1, cos: 1, sqrt: 1, abs: 1, round: 1, mod: 2,
  floor: 1, ceil: 1, min: 2, max: 2, pow: 2, atan: 2,
  noise: 1, noise2: 2, distance: 2, towards: 2,
  not: 1,
};

export const ZERO_FUNCS = new Set(['repcount', 'xcor', 'ycor', 'heading']);

/** Words with special meaning that user procedures must not shadow. */
export const RESERVED = new Set<string>([
  'to', 'end', 'repeat', 'if', 'else', 'make', 'local',
  'while', 'for', 'output', 'op', 'exit', 'and', 'or',
  ...Object.keys(ALIASES),
  ...Object.keys(BUILTIN_ARITY),
  ...Object.keys(FUNC_ARITY),
  ...ZERO_FUNCS,
]);

// ---------- "Did you mean?" suggestions ----------

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3; // early out — we only care up to 2
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export function suggest(name: string, candidates: Iterable<string>): string | null {
  const maxD = name.length <= 3 ? 1 : 2;
  let best: string | null = null;
  let bestD = maxD + 1;
  for (const c of candidates) {
    if (c === name) continue;
    const d = editDistance(name, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= maxD ? best : null;
}

function didYouMean(name: string, candidates: Iterable<string>): string {
  const s = suggest(name, candidates);
  return s ? ` — did you mean "${s}"?` : '';
}

// ---------- Parser ----------

export function parse(tokens: Token[]): ASTNode[] {
  // Pre-scan procedure signatures so call arity is known at parse time.
  const procArity: Record<string, number> = {};
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (tok.t === 'word' && tok.v === 'to') {
      const nameTok = tokens[k + 1];
      if (!nameTok || nameTok.t !== 'word')
        throw new NeedlescriptError('"to" must be followed by a procedure name', tok.line);
      let p = k + 2, n = 0;
      while (p < tokens.length && tokens[p].t === 'var') { n++; p++; }
      procArity[nameTok.v as string] = n;
    }
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const atEnd = () => pos >= tokens.length;
  const lineOf = (tok?: Token) =>
    tok ? tok.line : (tokens.length ? tokens[tokens.length - 1].line : 1);

  function parseProgram(): ASTNode[] {
    const stmts: ASTNode[] = [];
    while (!atEnd()) stmts.push(parseStatement());
    return stmts;
  }

  function parseBracketBlock(): ASTNode[] {
    const open = peek();
    if (!open || open.t !== '[')
      throw new NeedlescriptError('Expected [ to open a block', lineOf(open));
    next();
    const stmts: ASTNode[] = [];
    while (!atEnd() && peek().t !== ']') stmts.push(parseStatement());
    if (atEnd()) throw new NeedlescriptError('Missing ] to close a block opened', open.line);
    next(); // consume ]
    return stmts;
  }

  function parseStatement(): ASTNode {
    const tok = peek();
    if (!tok) throw new NeedlescriptError('Unexpected end of program');
    if (tok.t !== 'word')
      throw new NeedlescriptError(
        `Expected a command, got "${tok.v !== undefined ? tok.v : tok.t}"`,
        tok.line,
      );
    const name = tok.v as string;

    if (name === 'to') {
      next();
      const nameTok = next();
      if (!nameTok || nameTok.t !== 'word')
        throw new NeedlescriptError('"to" needs a procedure name', tok.line);
      if (RESERVED.has(nameTok.v as string))
        throw new NeedlescriptError(
          `"${nameTok.v}" is a built-in word and can't be redefined`,
          tok.line,
        );
      const params: string[] = [];
      while (!atEnd() && peek().t === 'var') params.push(next().v as string);
      const body: ASTNode[] = [];
      while (!atEnd() && !(peek().t === 'word' && peek().v === 'end'))
        body.push(parseStatement());
      if (atEnd())
        throw new NeedlescriptError(`Procedure "${nameTok.v}" is missing "end"`, tok.line);
      next(); // consume end
      return { k: 'to', name: nameTok.v as string, params, body, line: tok.line };
    }

    if (name === 'repeat') {
      next();
      const count = parseExpr();
      const body = parseBracketBlock();
      return { k: 'repeat', count, body, line: tok.line };
    }

    if (name === 'while') {
      next();
      const cond = parseExpr();
      const body = parseBracketBlock();
      return { k: 'while', cond, body, line: tok.line };
    }

    if (name === 'for') {
      next();
      const nm = next();
      if (!nm || nm.t !== 'qword')
        throw new NeedlescriptError(
          'for needs a quoted counter name, e.g.  for "i 0 10 1 [ … ]',
          tok.line,
        );
      const from = parseExpr();
      const to = parseExpr();
      const step = parseExpr();
      const body = parseBracketBlock();
      return { k: 'for', varName: nm.v as string, from, to, step, body, line: tok.line };
    }

    if (name === 'if') {
      next();
      const cond = parseExpr();
      const body = parseBracketBlock();
      let elseBody: ASTNode[] | null = null;
      if (!atEnd() && peek().t === 'word' && peek().v === 'else') {
        next();
        elseBody = parseBracketBlock();
      }
      return { k: 'if', cond, body, elseBody, line: tok.line };
    }

    if (name === 'make' || name === 'local') {
      next();
      const nm = next();
      if (!nm || nm.t !== 'qword')
        throw new NeedlescriptError(
          `${name} needs a quoted name, e.g.  ${name} "size 10`,
          tok.line,
        );
      const value = parseExpr();
      return { k: name as 'make' | 'local', name: nm.v as string, value, line: tok.line };
    }

    if (name === 'output' || name === 'op') {
      next();
      return { k: 'output', value: parseExpr(), line: tok.line };
    }

    if (name === 'exit') {
      next();
      return { k: 'output', value: null, line: tok.line };
    }

    const canonical = ALIASES[name] || name;
    if (canonical === 'print') {
      next();
      // Optional label:  print "radius :r
      let label: string | undefined;
      if (!atEnd() && peek().t === 'qword') label = next().v as string;
      return { k: 'cmd', name: 'print', args: [parseExpr()], line: tok.line, label };
    }
    if (BUILTIN_ARITY[canonical] !== undefined) {
      next();
      const args: ExprNode[] = [];
      for (let a = 0; a < BUILTIN_ARITY[canonical]; a++) args.push(parseExpr());
      return { k: 'cmd', name: canonical, args, line: tok.line };
    }

    if (procArity[name] !== undefined) {
      next();
      const args: ExprNode[] = [];
      for (let a = 0; a < procArity[name]; a++) args.push(parseExpr());
      return { k: 'call', name, args, line: tok.line };
    }

    throw new NeedlescriptError(
      `Unknown command "${name}"${didYouMean(name, [...RESERVED, ...Object.keys(procArity)])}`,
      tok.line,
    );
  }

  function parseExpr(): ExprNode { return parseOr(); }

  function parseOr(): ExprNode {
    let left = parseAnd();
    while (!atEnd() && peek().t === 'word' && peek().v === 'or') {
      next();
      left = { k: 'bin', op: 'or', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): ExprNode {
    let left = parseCompare();
    while (!atEnd() && peek().t === 'word' && peek().v === 'and') {
      next();
      left = { k: 'bin', op: 'and', left, right: parseCompare() };
    }
    return left;
  }

  function parseCompare(): ExprNode {
    let left = parseAdd();
    while (
      !atEnd() &&
      peek().t === 'op' &&
      ['<', '>', '=', '<=', '>=', '!='].includes(peek().v as string)
    ) {
      const op = next().v as string;
      left = { k: 'bin', op, left, right: parseAdd() };
    }
    return left;
  }

  function parseAdd(): ExprNode {
    let left = parseMul();
    while (!atEnd() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      // Logo convention: " -5" (space before, glued after) is a value, not subtraction.
      if (peek().v === '-' && peek().spBefore && !peek().spAfter) break;
      const op = next().v as string;
      left = { k: 'bin', op, left, right: parseMul() };
    }
    return left;
  }

  function parseMul(): ExprNode {
    let left = parseUnary();
    while (!atEnd() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v as string;
      left = { k: 'bin', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary(): ExprNode {
    if (!atEnd() && peek().t === 'op' && peek().v === '-') {
      const tok = next();
      return { k: 'neg', val: parseUnary(), line: tok.line };
    }
    return parsePrimary();
  }

  function parsePrimary(): ExprNode {
    const tok = peek();
    if (!tok) throw new NeedlescriptError('Expected a value but the program ended');
    if (tok.t === 'num') { next(); return { k: 'num', v: tok.v as number }; }
    if (tok.t === 'var') {
      next();
      return { k: 'var', name: tok.v as string, line: tok.line };
    }
    if (tok.t === '(') {
      next();
      const e = parseExpr();
      if (atEnd() || peek().t !== ')') throw new NeedlescriptError('Missing )', tok.line);
      next();
      return e;
    }
    if (tok.t === 'word') {
      const w = tok.v as string;
      if (FUNC_ARITY[w] !== undefined) {
        next();
        const args: ExprNode[] = [];
        for (let a = 0; a < FUNC_ARITY[w]; a++)
          args.push(FUNC_ARITY[w] > 1 ? parseExpr() : parseUnary());
        return { k: 'func', name: w, args, line: tok.line };
      }
      if (ZERO_FUNCS.has(w)) {
        next();
        return { k: 'func', name: w, args: [], line: tok.line };
      }
      // User procedure used as a reporter (must "output" a value)
      if (procArity[w] !== undefined) {
        next();
        const args: ExprNode[] = [];
        for (let a = 0; a < procArity[w]; a++) args.push(parseExpr());
        return { k: 'callexpr', name: w, args, line: tok.line };
      }
      throw new NeedlescriptError(
        `"${w}" is not a value${didYouMean(w, [
          ...Object.keys(FUNC_ARITY),
          ...ZERO_FUNCS,
          ...Object.keys(procArity),
        ])}`,
        tok.line,
      );
    }
    throw new NeedlescriptError(
      `Expected a value, got "${tok.v !== undefined ? tok.v : tok.t}"`,
      tok.line,
    );
  }

  return parseProgram();
}

// ---------- Engine limits ----------

export const LIMITS = {
  maxStitches: 60000,
  maxOps: 2000000,
  maxCallDepth: 200,
  minStitch: 0.4,
  maxStitch: 12.0,
};

// ---------- Stitch machine ----------

class Machine {
  x = 0; y = 0; heading = 0;
  penDown = true;
  stitchLen = 2.5;
  mode: 'run' | 'satin' | 'estitch' = 'run';
  satinWidth = 0;
  satinSpacing = 0.4;
  satinSide = 1;
  eWidth = 0;
  beanRepeats = 1;
  fillAngle = 0;
  fillSpacing = 0.4;
  fillLen: number | null = null;
  lockLen = 0.7;
  recording = false;
  rings: [number, number][][] = [];
  curRing: [number, number][] | null = null;
  lastEmit: { x: number; y: number } | null = null;
  colorIdx = 0;
  events: StitchEvent[] = [];
  warnings: string[] = [];
  started = false;
  tinyDropped = 0;
  currentLine: number | undefined = undefined; // source line being executed
  stateStack: { x: number; y: number; heading: number; penDown: boolean }[] = [];

  _push(t: EventType, x: number, y: number) {
    if (this.events.length >= LIMITS.maxStitches)
      throw new NeedlescriptError(
        `Design exceeds ${LIMITS.maxStitches.toLocaleString()} stitches — stopped. Reduce repeats, raise stitchlen, or raise fillspacing.`,
      );
    this.events.push({ t, x, y, c: this.colorIdx, line: this.currentLine });
    if (t === 'stitch' || t === 'jump') this.lastEmit = { x, y };
  }

  _ensureStart() {
    if (!this.started) {
      this.started = true;
      this._push('stitch', this.x, this.y);
    }
  }

  setXY(nx: number, ny: number) {
    const dx = nx - this.x, dy = ny - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) { this.x = nx; this.y = ny; return; }
    this.travel(nx, ny, d);
  }

  forward(dist: number) {
    if (!isFinite(dist)) throw new NeedlescriptError('fd/bk got a non-numeric distance');
    const rad = this.heading * Math.PI / 180;
    this.travel(this.x + Math.sin(rad) * dist, this.y + Math.cos(rad) * dist, Math.abs(dist));
  }

  /**
   * Sew an arc: turn `deg` degrees in total (positive = right/clockwise,
   * negative = left) while moving along a circle of the given radius.
   * Decomposed into half-turn / chord / half-turn steps so every stitch
   * mode (running, satin, bean, estitch) works on curves.
   */
  arc(deg: number, radius: number) {
    if (!isFinite(deg) || !isFinite(radius))
      throw new NeedlescriptError('arc got a non-numeric angle or radius');
    const r = Math.abs(radius);
    if (Math.abs(deg) < 1e-9 || r < 1e-9) return;
    const arcLen = Math.abs(deg) * Math.PI / 180 * r;
    const eff = Math.min(Math.max(this.stitchLen, LIMITS.minStitch), LIMITS.maxStitch);
    const steps = Math.max(1, Math.ceil(Math.max(arcLen / eff, Math.abs(deg) / 15)));
    const stepAng = deg / steps;
    const chord = 2 * r * Math.sin(Math.abs(stepAng) * Math.PI / 360);
    for (let s = 0; s < steps; s++) {
      this.heading = (this.heading + stepAng / 2) % 360;
      const rad = this.heading * Math.PI / 180;
      this.travel(this.x + Math.sin(rad) * chord, this.y + Math.cos(rad) * chord, chord);
      this.heading = (this.heading + stepAng / 2) % 360;
    }
  }

  pushState() {
    if (this.stateStack.length >= 500)
      throw new NeedlescriptError('push/pop stack is too deep (max 500 saved states)');
    this.stateStack.push({ x: this.x, y: this.y, heading: this.heading, penDown: this.penDown });
  }

  popState() {
    const s = this.stateStack.pop();
    if (!s) {
      this.warnings.push('pop ignored — nothing was saved with push');
      return;
    }
    this.penDown = false; // travel back as a jump, never sewing
    this.setXY(s.x, s.y);
    this.penDown = s.penDown;
    this.heading = s.heading;
  }

  markHere() {
    this._push('mark', this.x, this.y);
  }

  travel(nx: number, ny: number, dist: number) {
    const ox = this.x, oy = this.y;

    if (this.recording) {
      if (this.penDown) {
        if (!this.curRing) this.curRing = [[ox, oy]];
        this.curRing.push([nx, ny]);
      } else {
        this._closeRing();
      }
      this.x = nx; this.y = ny;
      return;
    }

    if (!this.penDown) {
      this._push('jump', nx, ny);
      this.x = nx; this.y = ny;
      return;
    }

    this._ensureStart();
    const dxT = nx - ox, dyT = ny - oy;
    const len = Math.hypot(dxT, dyT);

    if (this.mode === 'satin' && this.satinWidth > 0.05) {
      if (len < 1e-9) return;
      const px = -dyT / len, py = dxT / len;
      const half = this.satinWidth / 2;
      const steps = Math.max(1, Math.ceil(len / this.satinSpacing));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const cx = ox + dxT * t, cy = oy + dyT * t;
        this.satinSide = -this.satinSide;
        this._push('stitch', cx + px * half * this.satinSide, cy + py * half * this.satinSide);
      }
      this.x = nx; this.y = ny;
      return;
    }

    if (this.mode === 'estitch' && this.eWidth > 0.05) {
      if (len < 1e-9) return;
      const ux = dxT / len, uy = dyT / len;
      const px = -uy, py = ux;
      const spacing = Math.max(1, this.stitchLen);
      const steps = Math.max(1, Math.round(len / spacing));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const cx = ox + dxT * t, cy = oy + dyT * t;
        this._push('stitch', cx, cy);
        this._push('stitch', cx + px * this.eWidth, cy + py * this.eWidth);
        this._push('stitch', cx, cy);
      }
      this.x = nx; this.y = ny;
      return;
    }

    // Running stitch
    if (dist < LIMITS.minStitch * 0.5) {
      this.tinyDropped++;
      this.x = nx; this.y = ny;
      return;
    }
    const eff = Math.min(Math.max(this.stitchLen, LIMITS.minStitch), LIMITS.maxStitch);
    const steps = Math.max(1, Math.ceil(len / eff));
    let pxv = ox, pyv = oy;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const tx = ox + dxT * t, ty = oy + dyT * t;
      this._push('stitch', tx, ty);
      for (let r = 1; r < this.beanRepeats; r++) {
        this._push('stitch', r % 2 === 1 ? pxv : tx, r % 2 === 1 ? pyv : ty);
      }
      pxv = tx; pyv = ty;
    }
    this.x = nx; this.y = ny;
  }

  _closeRing() {
    if (this.curRing && this.curRing.length >= 3) this.rings.push(this.curRing);
    this.curRing = null;
  }

  beginFill() {
    if (this.recording)
      throw new NeedlescriptError(
        'beginfill while already recording a fill — close it with endfill first',
      );
    this.recording = true;
    this.rings = [];
    this.curRing = [[this.x, this.y]];
  }

  endFill() {
    if (!this.recording)
      throw new NeedlescriptError('endfill without a matching beginfill');
    this._closeRing();
    this.recording = false;
    if (!this.rings.length) {
      this.warnings.push('fill skipped — the boundary needs at least 3 pen-down points');
      return;
    }
    const effLen =
      this.fillLen !== null
        ? this.fillLen
        : Math.min(Math.max(this.stitchLen, 1), 7);
    const pts = generateFill(this.rings, {
      angle: this.fillAngle,
      spacing: this.fillSpacing,
      stitchLen: effLen,
      endNear: { x: this.x, y: this.y },
    });
    this.rings = [];
    if (!pts.length) {
      this.warnings.push('fill skipped — the area is too small to fill at this spacing');
      return;
    }
    const first = pts[0];
    if (!this.started) {
      this.started = true;
      this._push(
        Math.hypot(first.x, first.y) > 1 ? 'jump' : 'stitch',
        first.x,
        first.y,
      );
    } else {
      const le = this.lastEmit || { x: 0, y: 0 };
      const d0 = Math.hypot(first.x - le.x, first.y - le.y);
      if (d0 > Math.max(this.stitchLen * 1.5, 2)) this._push('jump', first.x, first.y);
      else if (d0 > 0.05) this._push('stitch', first.x, first.y);
    }
    for (let i = 1; i < pts.length; i++)
      this._push(pts[i].jump ? 'jump' : 'stitch', pts[i].x, pts[i].y);
    const back = Math.hypot(
      (this.lastEmit?.x ?? 0) - this.x,
      (this.lastEmit?.y ?? 0) - this.y,
    );
    if (back > 0.6) this._push('jump', this.x, this.y);
  }

  colorChange(n: number) {
    const idx = Math.max(0, Math.round(n));
    if (idx === this.colorIdx && this.started) return;
    if (this.started) this._push('color', this.x, this.y);
    this.colorIdx = idx;
  }

  trimThread() {
    if (this.started) this._push('trim', this.x, this.y);
  }
}

// ---------- Tatami fill ----------

function evenOddInside(rings: [number, number][][], px: number, py: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a[1] <= py && b[1] > py) || (b[1] <= py && a[1] > py)) {
        const xi = a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (xi > px) inside = !inside;
      }
    }
  }
  return inside;
}

interface FillOpts {
  angle: number;
  spacing: number;
  stitchLen: number;
  endNear?: { x: number; y: number };
}

interface FillPoint {
  x: number;
  y: number;
  jump: boolean;
}

function generateFill(rings: [number, number][][], opt: FillOpts): FillPoint[] {
  const angle = (opt.angle || 0) * (Math.PI / 180);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const rot = (p: [number, number]): [number, number] => [p[0] * ca + p[1] * sa, -p[0] * sa + p[1] * ca];
  const unrot = (p: [number, number]): [number, number] => [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca];
  const R = rings.map(r => r.map(rot));
  const spacing = Math.min(Math.max(opt.spacing || 0.4, 0.25), 5);
  const slen = Math.min(Math.max(opt.stitchLen || 3, 1), 7);

  let minY = Infinity, maxY = -Infinity;
  R.forEach(r => r.forEach(p => { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }));
  if (!(maxY - minY > spacing * 0.6)) return [];

  interface Seg { x0: number; x1: number; y: number; row: number }

  const rows: Seg[][] = [];
  let rowIdx = 0;
  for (let y = minY + spacing * 0.5; y < maxY; y += spacing, rowIdx++) {
    const xs: number[] = [];
    for (const ring of R) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
    }
    xs.sort((p, q) => p - q);
    const segs: Seg[] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] >= 0.5) segs.push({ x0: xs[i], x1: xs[i + 1], y, row: rowIdx });
    }
    if (segs.length) rows.push(segs);
  }
  if (!rows.length) return [];

  let order = rows;
  if (opt.endNear) {
    const en = rot([opt.endNear.x, opt.endNear.y]);
    const dFirst = Math.abs(en[1] - rows[0][0].y);
    const dLast = Math.abs(en[1] - rows[rows.length - 1][0].y);
    if (dFirst < dLast) order = rows.slice().reverse();
  }

  const out: { p: [number, number]; jump: boolean }[] = [];
  let cur: [number, number] | null = null;

  function push(x: number, y: number, jump: boolean) {
    out.push({ p: [x, y], jump });
    cur = [x, y];
  }

  function sewLine(to: [number, number]) {
    if (!cur) return;
    const dx = to[0] - cur[0], dy = to[1] - cur[1];
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return;
    const start: [number, number] = [cur[0], cur[1]];
    const steps = Math.max(1, Math.ceil(d / slen));
    for (let k = 1; k <= steps; k++) {
      push(start[0] + dx * k / steps, start[1] + dy * k / steps, false);
    }
  }

  function connect(to: [number, number]) {
    if (!cur) return;
    const d = Math.hypot(to[0] - cur[0], to[1] - cur[1]);
    if (d < 0.05) return;
    if (d <= spacing * 3 + 0.6) { sewLine(to); return; }
    let allIn = d <= 12;
    if (allIn) {
      const n = Math.max(2, Math.ceil(d / 1.5));
      for (let k = 1; k < n; k++) {
        const mx = cur[0] + (to[0] - cur[0]) * k / n;
        const my = cur[1] + (to[1] - cur[1]) * k / n;
        if (!evenOddInside(R, mx, my)) { allIn = false; break; }
      }
    }
    if (allIn) sewLine(to);
    else push(to[0], to[1], true);
  }

  function sewSegment(seg: Seg, reverse: boolean) {
    const from = reverse ? seg.x1 : seg.x0;
    const to = reverse ? seg.x0 : seg.x1;
    if (cur === null) push(from, seg.y, false);
    else connect([from, seg.y]);
    const phase = (seg.row % 3) * (slen / 3);
    const lo = Math.min(from, to) + 0.3, hi = Math.max(from, to) - 0.3;
    const grid: number[] = [];
    for (let g = Math.ceil((lo - phase) / slen) * slen + phase; g < hi; g += slen) grid.push(g);
    if (reverse) grid.reverse();
    for (const g of grid) sewLine([g, seg.y]);
    sewLine([to, seg.y]);
  }

  const all: Seg[] = [];
  for (const rowSegs of order) for (const seg of rowSegs) all.push(seg);

  while (all.length) {
    let bi = 0, brev = false, bd = Infinity;
    for (let i = 0; i < all.length; i++) {
      const sgm = all[i];
      const dS = cur ? Math.hypot(sgm.x0 - cur[0], sgm.y - cur[1]) : i;
      const dE = cur ? Math.hypot(sgm.x1 - cur[0], sgm.y - cur[1]) : i + 0.5;
      if (dS < bd) { bd = dS; bi = i; brev = false; }
      if (dE < bd) { bd = dE; bi = i; brev = true; }
    }
    sewSegment(all.splice(bi, 1)[0], brev);
  }

  return out.map(o => {
    const p = unrot(o.p);
    return { x: p[0], y: p[1], jump: o.jump };
  });
}

// ---------- Tie-in / tie-off locks ----------

interface LockResult {
  events: StitchEvent[];
  locks: number;
}

export function applyLocks(events: StitchEvent[], L: number): LockResult {
  const THRESH = 4;
  interface Part { run: boolean; ev: StitchEvent[]; cut?: boolean }
  const parts: Part[] = [];
  for (const e of events) {
    const isRun = e.t === 'stitch';
    if (!parts.length || parts[parts.length - 1].run !== isRun)
      parts.push({ run: isRun, ev: [] });
    parts[parts.length - 1].ev.push(e);
  }
  const out: StitchEvent[] = [];
  let locks = 0;
  let pos: StitchEvent | null = null;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  function gapCuts(part: Part, startPos: StitchEvent | null): boolean {
    let cut = false, jlen = 0, p: StitchEvent | null = startPos;
    for (const e of part.ev) {
      if (e.t === 'color' || e.t === 'trim') cut = true;
      if (e.t === 'jump') { if (p) jlen += dist(p, e); p = e; }
    }
    return cut || jlen >= THRESH;
  }

  function tie(at: StitchEvent | null, toward: StitchEvent | null, c: number) {
    if (!at || !toward) return;
    const d = dist(at, toward);
    if (d < 1e-6) return;
    const l = Math.min(L, d);
    if (l < 0.2) return;
    const ux = (toward.x - at.x) / d, uy = (toward.y - at.y) / d;
    for (let k = 0; k < 2; k++) {
      out.push({ t: 'stitch', x: at.x + ux * l, y: at.y + uy * l, c, line: at.line });
      out.push({ t: 'stitch', x: at.x, y: at.y, c, line: at.line });
    }
    locks++;
  }

  let firstRunSeen = false;
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    if (!part.run) {
      part.cut = gapCuts(part, pos);
      for (const e of part.ev) { out.push(e); if (e.t === 'jump') pos = e; }
      continue;
    }
    const ev = part.ev;
    const entry = pos;
    const needIn = !firstRunSeen || (pi > 0 && parts[pi - 1].cut);
    const nextGap = pi + 1 < parts.length ? parts[pi + 1] : null;
    const needOut = nextGap === null || gapCuts(nextGap, ev[ev.length - 1]);
    firstRunSeen = true;
    if (entry === null) {
      out.push(ev[0]); pos = ev[0];
      if (needIn) tie(ev[0], ev[1] || null, ev[0].c);
      for (let i = 1; i < ev.length; i++) { out.push(ev[i]); pos = ev[i]; }
    } else {
      if (needIn) tie(entry, ev[0], ev[0].c);
      for (const e of ev) { out.push(e); pos = e; }
    }
    if (needOut) {
      const last = ev[ev.length - 1];
      const back = ev.length >= 2 ? ev[ev.length - 2] : entry;
      tie(last, back, last.c);
    }
  }
  return { events: out, locks };
}

// ---------- Design stats ----------

export function designStats(events: StitchEvent[]): DesignStats {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let stitches = 0, jumps = 0, colors = 0, trims = 0;
  let maxLen = 0, maxR = 0;
  let px: number | null = null, py: number | null = null;
  const colorSet = new Set<number>();
  for (const e of events) {
    if (e.t === 'mark') continue; // debug pins are render-only
    if (e.t === 'color') { colors++; px = e.x; py = e.y; continue; }
    if (e.t === 'trim') { trims++; continue; }
    if (e.x < minX) minX = e.x; if (e.x > maxX) maxX = e.x;
    if (e.y < minY) minY = e.y; if (e.y > maxY) maxY = e.y;
    const rr = Math.hypot(e.x, e.y); if (rr > maxR) maxR = rr;
    if (e.t === 'stitch') {
      stitches++;
      colorSet.add(e.c);
      if (px !== null && py !== null)
        maxLen = Math.max(maxLen, Math.hypot(e.x - px, e.y - py));
    } else {
      jumps++;
    }
    px = e.x; py = e.y;
  }
  if (!isFinite(minX)) { minX = maxX = minY = maxY = 0; }
  return {
    stitches, jumps, trims,
    colorChanges: colors,
    colorsUsed: Math.max(1, colorSet.size),
    width: maxX - minX, height: maxY - minY,
    minX, maxX, minY, maxY, maxStitchLen: maxLen, maxRadius: maxR,
  };
}

// ---------- Interpreter ----------

function formatNum(v: number): string {
  return Math.abs(v - Math.round(v)) < 1e-9
    ? String(Math.round(v))
    : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export interface RunOptions {
  seed?: number;
}

/** Thrown by `output` / `exit` to unwind to the enclosing procedure call. */
class ReturnSignal {
  readonly value: number | undefined;
  constructor(value: number | undefined) {
    this.value = value;
  }
}

export function run(source: string, opts: RunOptions = {}): RunResult {
  const tokens = tokenize(source);
  const program = parse(tokens);
  const m = new Machine();
  const globals: Record<string, number> = Object.create(null);
  const procs: Record<string, ASTNode & { k: 'to' }> = Object.create(null);
  const seed0 = opts.seed !== undefined ? opts.seed : 42;
  let rng = makeRNG(seed0);
  let noise = makeNoise(seed0);
  let ops = 0;
  const printed: string[] = [];

  function tick(line?: number) {
    if (++ops > LIMITS.maxOps)
      throw new NeedlescriptError(
        'Program ran too long (possible infinite loop) — stopped',
        line,
      );
  }

  function evalExpr(
    node: ExprNode,
    env: Record<string, number> | null,
    repcount: number,
    depth: number,
  ): number {
    tick((node as { line?: number }).line);
    switch (node.k) {
      case 'num': return node.v;
      case 'var': {
        if (env && node.name in env) return env[node.name];
        if (node.name in globals) return globals[node.name];
        throw new NeedlescriptError(
          `Unknown variable :${node.name}${didYouMean(node.name, [
            ...(env ? Object.keys(env) : []),
            ...Object.keys(globals),
          ])}`,
          node.line,
        );
      }
      case 'neg': return -evalExpr(node.val, env, repcount, depth);
      case 'bin': {
        // and / or short-circuit so guards like  :i > 0 and 10 / :i > 2  are safe
        if (node.op === 'and')
          return evalExpr(node.left, env, repcount, depth) !== 0 &&
            evalExpr(node.right, env, repcount, depth) !== 0 ? 1 : 0;
        if (node.op === 'or')
          return evalExpr(node.left, env, repcount, depth) !== 0 ||
            evalExpr(node.right, env, repcount, depth) !== 0 ? 1 : 0;
        const a = evalExpr(node.left, env, repcount, depth);
        const b = evalExpr(node.right, env, repcount, depth);
        switch (node.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': if (b === 0) throw new NeedlescriptError('Division by zero'); return a / b;
          case '<': return a < b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          case '>=': return a >= b ? 1 : 0;
          case '=': return Math.abs(a - b) < 1e-9 ? 1 : 0;
          case '!=': return Math.abs(a - b) < 1e-9 ? 0 : 1;
        }
        throw new NeedlescriptError('Unknown operator');
      }
      case 'func': {
        const args = node.args.map(a => evalExpr(a, env, repcount, depth));
        switch (node.name) {
          case 'random': return rng() * args[0];
          case 'sin': return Math.sin(args[0] * Math.PI / 180);
          case 'cos': return Math.cos(args[0] * Math.PI / 180);
          case 'sqrt':
            if (args[0] < 0) throw new NeedlescriptError('sqrt of a negative number', node.line);
            return Math.sqrt(args[0]);
          case 'abs': return Math.abs(args[0]);
          case 'round': return Math.round(args[0]);
          case 'floor': return Math.floor(args[0]);
          case 'ceil': return Math.ceil(args[0]);
          case 'min': return Math.min(args[0], args[1]);
          case 'max': return Math.max(args[0], args[1]);
          case 'pow': {
            const v = Math.pow(args[0], args[1]);
            if (!isFinite(v))
              throw new NeedlescriptError(
                `pow ${formatNum(args[0])} ${formatNum(args[1])} is not a finite number`,
                node.line,
              );
            return v;
          }
          case 'mod': return ((args[0] % args[1]) + args[1]) % args[1];
          case 'not': return args[0] === 0 ? 1 : 0;
          // heading-convention angle of the vector (x, y): 0 = up/north, clockwise
          case 'atan': return (Math.atan2(args[0], args[1]) * 180 / Math.PI + 360) % 360;
          case 'noise': return noise(args[0]);
          case 'noise2': return noise(args[0], args[1]);
          case 'distance': return Math.hypot(args[0] - m.x, args[1] - m.y);
          case 'towards':
            return (Math.atan2(args[0] - m.x, args[1] - m.y) * 180 / Math.PI + 360) % 360;
          case 'repcount': return repcount;
          case 'xcor': return m.x;
          case 'ycor': return m.y;
          case 'heading': return m.heading;
        }
        throw new NeedlescriptError(`Unknown function ${node.name}`, node.line);
      }
      case 'callexpr': {
        const v = callProc(node.name, node.args, env, repcount, depth, node.line);
        if (v === undefined)
          throw new NeedlescriptError(
            `"${node.name}" was used as a value but it never reached "output"`,
            node.line,
          );
        return v;
      }
    }
  }

  function callProc(
    name: string,
    argNodes: ExprNode[],
    env: Record<string, number> | null,
    repcount: number,
    depth: number,
    line?: number,
  ): number | undefined {
    const proc = procs[name];
    if (!proc)
      throw new NeedlescriptError(`Procedure "${name}" is used before it is defined`, line);
    if (depth >= LIMITS.maxCallDepth)
      throw new NeedlescriptError(`Too much recursion in "${name}"`, line);
    const newEnv: Record<string, number> = Object.create(null);
    proc.params.forEach((p, i) => { newEnv[p] = evalExpr(argNodes[i], env, repcount, depth); });
    try {
      execBlock(proc.body, newEnv, repcount, depth + 1);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return undefined;
  }

  function execBlock(
    stmts: ASTNode[],
    env: Record<string, number> | null,
    repcount: number,
    depth: number,
  ) {
    for (const st of stmts) execStmt(st, env, repcount, depth);
  }

  function execStmt(
    st: ASTNode,
    env: Record<string, number> | null,
    repcount: number,
    depth: number,
  ) {
    tick(st.line);
    switch (st.k) {
      case 'to': procs[st.name] = st; return;
      case 'make': {
        const v = evalExpr(st.value, env, repcount, depth);
        // Prefer an existing local (procedure parameter or "local") over a global.
        if (env && st.name in env) env[st.name] = v;
        else globals[st.name] = v;
        return;
      }
      case 'local': {
        if (!env)
          throw new NeedlescriptError(
            'local can only be used inside a procedure — use make at the top level',
            st.line,
          );
        env[st.name] = evalExpr(st.value, env, repcount, depth);
        return;
      }
      case 'repeat': {
        const n = Math.floor(evalExpr(st.count, env, repcount, depth));
        if (n > 200000) throw new NeedlescriptError(`repeat count too large (${n})`, st.line);
        for (let i = 1; i <= n; i++) execBlock(st.body, env, i, depth);
        return;
      }
      case 'while': {
        while (evalExpr(st.cond, env, repcount, depth) !== 0) {
          tick(st.line); // ops budget catches endless loops
          execBlock(st.body, env, repcount, depth);
        }
        return;
      }
      case 'for': {
        const from = evalExpr(st.from, env, repcount, depth);
        const to = evalExpr(st.to, env, repcount, depth);
        const step = evalExpr(st.step, env, repcount, depth);
        if (step === 0) throw new NeedlescriptError('for step can\u2019t be 0', st.line);
        if ((to - from) / step > 200000)
          throw new NeedlescriptError('for runs too many times (over 200,000)', st.line);
        const scope = env ?? globals;
        const had = st.varName in scope;
        const prev = scope[st.varName];
        for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) {
          tick(st.line);
          scope[st.varName] = v;
          execBlock(st.body, env, repcount, depth);
        }
        if (had) scope[st.varName] = prev;
        else delete scope[st.varName];
        return;
      }
      case 'if': {
        if (evalExpr(st.cond, env, repcount, depth) !== 0) execBlock(st.body, env, repcount, depth);
        else if (st.elseBody) execBlock(st.elseBody, env, repcount, depth);
        return;
      }
      case 'output': {
        if (depth === 0)
          throw new NeedlescriptError(
            `"${st.value ? 'output' : 'exit'}" can only be used inside a procedure`,
            st.line,
          );
        throw new ReturnSignal(
          st.value ? evalExpr(st.value, env, repcount, depth) : undefined,
        );
      }
      case 'call': {
        callProc(st.name, st.args, env, repcount, depth, st.line);
        return;
      }
      case 'cmd': {
        m.currentLine = st.line;
        const a = st.args.map(x => evalExpr(x, env, repcount, depth));
        switch (st.name) {
          case 'fd': m.forward(a[0]); return;
          case 'bk': m.forward(-a[0]); return;
          case 'rt': m.heading = (m.heading + a[0]) % 360; return;
          case 'lt': m.heading = (m.heading - a[0]) % 360; return;
          case 'up': m.penDown = false; return;
          case 'down': m.penDown = true; return;
          case 'home': m.setXY(0, 0); m.heading = 0; return;
          case 'cs': return;
          case 'setxy': m.setXY(a[0], a[1]); return;
          case 'setx': m.setXY(a[0], m.y); return;
          case 'sety': m.setXY(m.x, a[0]); return;
          case 'seth': m.heading = a[0] % 360; return;
          case 'arc': m.arc(a[0], a[1]); return;
          case 'push': m.pushState(); return;
          case 'pop': m.popState(); return;
          case 'stitchlen': {
            const v = a[0];
            if (v < LIMITS.minStitch || v > LIMITS.maxStitch)
              m.warnings.push(
                `stitchlen ${v} clamped to ${Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch)} mm (machine-safe range is ${LIMITS.minStitch}–${LIMITS.maxStitch})`,
              );
            m.stitchLen = Math.min(Math.max(v, LIMITS.minStitch), LIMITS.maxStitch);
            return;
          }
          case 'satin': {
            const v = Math.max(0, a[0]);
            if (v > 10)
              m.warnings.push(
                `satin ${v} mm is very wide — columns over ~8 mm tend to snag; consider splitting`,
              );
            m.satinWidth = v;
            m.mode = v > 0.05 ? 'satin' : 'run';
            return;
          }
          case 'estitch': {
            const v = Math.max(0, a[0]);
            if (v > 10)
              m.warnings.push(`estitch ${v} mm is very wide — prongs over ~8 mm tend to snag`);
            m.eWidth = v;
            m.mode = v > 0.05 ? 'estitch' : 'run';
            return;
          }
          case 'bean': {
            let n = Math.round(a[0]);
            if (n <= 1) { m.beanRepeats = 1; return; }
            if (n % 2 === 0) { n += 1; m.warnings.push(`bean must be odd to keep advancing — using ${n}`); }
            if (n > 9) { n = 9; m.warnings.push('bean clamped to 9 passes'); }
            m.beanRepeats = n;
            return;
          }
          case 'lock': {
            if (a[0] <= 0) { m.lockLen = 0; return; }
            const v = Math.min(Math.max(a[0], 0.3), 1.5);
            if (v !== a[0]) m.warnings.push(`lock ${a[0]} clamped to ${v} mm (safe range 0.3–1.5)`);
            m.lockLen = v;
            return;
          }
          case 'beginfill': m.beginFill(); return;
          case 'endfill': m.endFill(); return;
          case 'fillangle': m.fillAngle = a[0]; return;
          case 'fillspacing': {
            const v = Math.min(Math.max(a[0], 0.25), 5);
            if (v !== a[0]) m.warnings.push(`fillspacing ${a[0]} clamped to ${v} mm (safe range 0.25–5)`);
            m.fillSpacing = v;
            return;
          }
          case 'filllen': {
            if (a[0] <= 0) { m.fillLen = null; return; }
            const v = Math.min(Math.max(a[0], 1), 7);
            if (v !== a[0]) m.warnings.push(`filllen ${a[0]} clamped to ${v} mm (safe range 1–7)`);
            m.fillLen = v;
            return;
          }
          case 'density': m.satinSpacing = Math.min(Math.max(a[0], 0.25), 5); return;
          case 'color': m.colorChange(a[0]); return;
          case 'stop': m.colorChange(m.colorIdx + 1); return;
          case 'trim': m.trimThread(); return;
          case 'seed': {
            const s = Math.floor(a[0]);
            rng = makeRNG(s);
            noise = makeNoise(s);
            return;
          }
          case 'print':
            printed.push((st.label ? st.label + ': ' : '') + formatNum(a[0]));
            return;
          case 'mark': m.markHere(); return;
          case 'assert':
            if (a[0] === 0)
              throw new NeedlescriptError('assert failed — the condition is 0 (false)', st.line);
            return;
        }
        throw new NeedlescriptError(`Unhandled command ${st.name}`, st.line);
      }
    }
  }

  execBlock(program, null, 0, 0);

  if (m.recording) {
    m.warnings.push('beginfill was never closed — endfill added at the end of the program');
    m.endFill();
  }
  if (m.tinyDropped > 0)
    m.warnings.push(
      `${m.tinyDropped} sub-${LIMITS.minStitch} mm moves merged into neighbours (too short to sew safely)`,
    );

  let locks = 0;
  if (m.lockLen > 0) {
    const secured = applyLocks(m.events, m.lockLen);
    m.events = secured.events;
    locks = secured.locks;
  }

  return { events: m.events, warnings: m.warnings, printed, locks };
}
