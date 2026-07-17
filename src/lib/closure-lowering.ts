import { NeedlescriptError } from './errors.ts';
import type { Token } from './types.ts';
import { COMPOUND_ASSIGN_OPS } from './tokenizer.ts';

interface Scope {
  kind: 'root' | 'named' | 'anonymous';
  parent: Scope | null;
  params: string[];
  locals: Set<string>;
  bodyStart: number;
  bodyEnd: number;
  defStart: number;
  defEnd: number;
  line: number;
  synthetic?: string;
  children: Scope[];
  captures: string[];
  captureFirst: Map<string, number>;
}

const isAssign = (token: Token | undefined): boolean =>
  !!token && token.t === 'op' && (token.v === '=' || COMPOUND_ASSIGN_OPS.has(token.v as string));

function matching(tokens: Token[], start: number, open: '(' | '[', close: ')' | ']'): number {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i].t === open) depth++;
    else if (tokens[i].t === close && --depth === 0) return i;
  }
  throw new NeedlescriptError(`Missing ${close}`, tokens[start]?.line);
}

function parameters(tokens: Token[], open: number, close: number, label: string): string[] {
  const out: string[] = [];
  for (let i = open + 1; i < close; i++) {
    const token = tokens[i];
    if (token.t === ',') continue;
    if (token.t !== 'word')
      throw new NeedlescriptError(`Expected a parameter name in ${label}( … )`, token.line);
    const name = token.v as string;
    if (out.includes(name))
      throw new NeedlescriptError(`Duplicate parameter "${name}"`, token.line);
    out.push(name);
  }
  return out;
}

function childAt(scope: Scope, index: number): Scope | undefined {
  return scope.children.find((child) => child.defStart === index);
}

function collectLocals(tokens: Token[], scope: Scope): void {
  for (let i = scope.bodyStart; i < scope.bodyEnd; i++) {
    const child = childAt(scope, i);
    if (child) {
      i = child.defEnd;
      continue;
    }
    const token = tokens[i];
    if (token.t !== 'word') continue;
    const next = tokens[i + 1];
    if (token.v === 'let') {
      if (next?.t === 'word') scope.locals.add(next.v as string);
      else if (next?.t === '[') {
        const end = matching(tokens, i + 1, '[', ']');
        for (let p = i + 2; p < end; p++)
          if (tokens[p].t === 'word') scope.locals.add(tokens[p].v as string);
      }
    } else if (token.v === 'local' && next?.t === 'qword') {
      scope.locals.add(next.v as string);
    } else if (token.v === 'for' && (next?.t === 'word' || next?.t === 'qword')) {
      scope.locals.add(next.v as string);
    }
  }
}

function discover(tokens: Token[]): Scope {
  const root: Scope = {
    kind: 'root',
    parent: null,
    params: [],
    locals: new Set(),
    bodyStart: 0,
    bodyEnd: tokens.length,
    defStart: 0,
    defEnd: tokens.length,
    line: 1,
    children: [],
    captures: [],
    captureFirst: new Map(),
  };
  let anonymousCount = 0;

  const scan = (scope: Scope): void => {
    for (let i = scope.bodyStart; i < scope.bodyEnd; i++) {
      const token = tokens[i];
      if (token.t !== 'word' || token.v !== 'def') continue;
      const next = tokens[i + 1];
      const anonymous = next?.t === '(';
      if (!anonymous && next?.t !== 'word') continue;
      if (!anonymous && scope.kind !== 'root')
        throw new NeedlescriptError(
          'named nested def is not supported; use an anonymous def expression',
          token.line,
        );
      const openParen = anonymous ? i + 1 : i + 2;
      if (tokens[openParen]?.t !== '(') continue;
      const closeParen = matching(tokens, openParen, '(', ')');
      const openBody = closeParen + 1;
      if (tokens[openBody]?.t !== '[')
        throw new NeedlescriptError('def needs a body in [ … ]', token.line);
      const closeBody = matching(tokens, openBody, '[', ']');
      const child: Scope = {
        kind: anonymous ? 'anonymous' : 'named',
        parent: scope,
        params: parameters(tokens, openParen, closeParen, anonymous ? 'def' : String(next.v)),
        locals: new Set(),
        bodyStart: openBody + 1,
        bodyEnd: closeBody,
        defStart: i,
        defEnd: closeBody,
        line: token.line,
        synthetic: anonymous ? `$anon:${token.line}:${++anonymousCount}` : undefined,
        children: [],
        captures: [],
        captureFirst: new Map(),
      };
      scope.children.push(child);
      scan(child);
      collectLocals(tokens, child);
      i = closeBody;
    }
  };

  scan(root);
  return root;
}

function bindingOwner(scope: Scope | null, name: string): Scope | null {
  for (let current = scope; current && current.kind !== 'root'; current = current.parent) {
    if (current.params.includes(name) || current.locals.has(name)) return current;
  }
  return null;
}

function analyze(tokens: Token[], scope: Scope): void {
  for (const child of scope.children) analyze(tokens, child);
  if (scope.kind !== 'anonymous') return;

  const ancestorNames = new Set<string>();
  for (let current = scope.parent; current && current.kind !== 'root'; current = current.parent) {
    current.params.forEach((name) => ancestorNames.add(name));
    current.locals.forEach((name) => ancestorNames.add(name));
  }
  for (const name of [...scope.params, ...scope.locals]) {
    if (ancestorNames.has(name))
      throw new NeedlescriptError(
        `Variable "${name}" is already declared in an enclosing procedure — shadowing is not allowed`,
        scope.line,
      );
  }

  const noteCapture = (name: string, index: number): void => {
    if (!scope.captureFirst.has(name)) scope.captureFirst.set(name, index);
  };

  for (let i = scope.bodyStart; i < scope.bodyEnd; i++) {
    const child = childAt(scope, i);
    if (child) {
      for (const name of child.captures) {
        const owner = bindingOwner(scope, name);
        if (owner && owner !== scope) noteCapture(name, child.captureFirst.get(name) ?? i);
      }
      i = child.defEnd;
      continue;
    }
    const token = tokens[i];
    if (token.t !== 'word' && token.t !== 'var') continue;
    const name = token.v as string;
    const owner = bindingOwner(scope.parent, name);
    if (!owner || scope.params.includes(name) || scope.locals.has(name)) continue;
    if (token.t === 'word' && isAssign(tokens[i + 1]))
      throw new NeedlescriptError(
        `captured variable '${name}' is read-only inside a closure`,
        token.line,
      );
    noteCapture(name, i);
  }
  scope.captures = [...scope.captureFirst].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  if (scope.captures.length > 16)
    throw new NeedlescriptError(
      `a closure may capture at most 16 values; this one captures ${scope.captures.length}`,
      scope.line,
    );
}

function syntheticToken(t: Token['t'], line: number, start: number, v?: string): Token {
  return { t, ...(v === undefined ? {} : { v }), line, start, end: start + 1 };
}

/** Lower anonymous `def(args) [ … ]` expressions to lifted procedures plus
 * an internal `$bind` call before the ordinary pre-scan/parser run. */
export function lowerClosures(tokens: Token[]): Token[] {
  if (
    !tokens.some((token, i) => token.t === 'word' && token.v === 'def' && tokens[i + 1]?.t === '(')
  )
    return tokens;
  for (let i = 0; i < tokens.length; i++) {
    const previous = tokens[i - 1];
    const statementBoundary =
      !previous || previous.t === ']' || (previous.t === 'word' && previous.v === 'end');
    if (
      !statementBoundary ||
      tokens[i].t !== 'word' ||
      tokens[i].v !== 'to' ||
      tokens[i + 1]?.t !== 'word'
    )
      continue;
    for (let p = i + 2; p < tokens.length; p++) {
      if (tokens[p].t === 'word' && tokens[p].v === 'end') {
        i = p;
        break;
      }
      if (tokens[p].t === 'word' && tokens[p].v === 'def' && tokens[p + 1]?.t === '(')
        throw new NeedlescriptError(
          'anonymous def expressions are available only in modern def procedures; classic programs can use bind',
          tokens[p].line,
        );
    }
  }
  const root = discover(tokens);
  analyze(tokens, root);
  const lifted: Token[] = [];

  const transform = (scope: Scope): Token[] => {
    const out: Token[] = [];
    for (let i = scope.bodyStart; i < scope.bodyEnd; i++) {
      const child = childAt(scope, i);
      if (!child) {
        out.push(tokens[i]);
        continue;
      }
      if (child.kind === 'anonymous') {
        emitLifted(child);
        const start = tokens[i].start;
        out.push(syntheticToken('word', child.line, start, '$bind'));
        out.push(syntheticToken('(', child.line, start + 1));
        const reference = syntheticToken('pref', child.line, start + 2, child.synthetic);
        reference.captureNames = child.captures;
        out.push(reference);
        for (const capture of child.captures) {
          out.push(syntheticToken(',', child.line, start + 3));
          out.push(syntheticToken('word', child.line, start + 4, capture));
        }
        out.push(syntheticToken(')', child.line, start + 5));
      } else {
        out.push(...tokens.slice(child.defStart, child.bodyStart));
        out.push(...transform(child));
        out.push(tokens[child.bodyEnd]);
      }
      i = child.defEnd;
    }
    return out;
  };

  const emitLifted = (scope: Scope): void => {
    const body = transform(scope);
    const at = tokens[scope.defStart].start;
    lifted.push(syntheticToken('word', scope.line, at, 'def'));
    lifted.push(syntheticToken('word', scope.line, at + 1, scope.synthetic));
    lifted.push(syntheticToken('(', scope.line, at + 2));
    const params = [...scope.captures, ...scope.params];
    params.forEach((param, index) => {
      if (index > 0) lifted.push(syntheticToken(',', scope.line, at + 3 + index * 2));
      lifted.push(syntheticToken('word', scope.line, at + 4 + index * 2, param));
    });
    lifted.push(syntheticToken(')', scope.line, at + 5 + params.length * 2));
    lifted.push(syntheticToken('[', scope.line, at + 6 + params.length * 2));
    lifted.push(...body);
    lifted.push(syntheticToken(']', scope.line, at + 7 + params.length * 2));
  };

  const body = transform(root);
  return [...lifted, ...body];
}
