import type { Plugin, ParserOptions } from 'prettier';
import { format } from 'prettier/standalone';
import { tokenize } from '../language/tokenizer.ts';

interface NeedleScriptProgram {
  type: 'NeedleScriptProgram';
  source: string;
}

interface SourceToken {
  raw: string;
  start: number;
  end: number;
  kind: 'word' | 'string' | 'operator' | 'punctuation';
  whitespaceBefore: boolean;
  whitespaceAfter: boolean;
}

const TWO_CHARACTER_OPERATORS = new Set(['<=', '>=', '!=', '==', '+=', '-=', '*=', '/=']);

function splitComment(line: string): { code: string; comment: string } {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === "'") inString = false;
      continue;
    }
    if (char === "'") {
      inString = true;
      continue;
    }
    if (char === ';' || char === '#' || (char === '/' && line[index + 1] === '/')) {
      return { code: line.slice(0, index), comment: line.slice(index).trimEnd() };
    }
  }

  return { code: line, comment: '' };
}

function scanCode(code: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  let index = 0;

  const push = (start: number, end: number, kind: SourceToken['kind']) => {
    tokens.push({
      raw: code.slice(start, end),
      start,
      end,
      kind,
      whitespaceBefore: start > 0 && /\s/.test(code[start - 1]),
      whitespaceAfter: end < code.length && /\s/.test(code[end]),
    });
    index = end;
  };

  while (index < code.length) {
    if (/\s/.test(code[index])) {
      index++;
      continue;
    }

    const start = index;
    const char = code[index];
    if (char === "'") {
      index++;
      let escaped = false;
      while (index < code.length) {
        const current = code[index++];
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === "'") break;
      }
      push(start, index, 'string');
      continue;
    }

    if (char === '"') {
      index++;
      while (index < code.length && /[A-Za-z0-9_.?]/.test(code[index])) index++;
      if (code[index] === '"') index++;
      push(start, index, 'string');
      continue;
    }

    if (char === ':' || char === '@') {
      index++;
      while (index < code.length && /[A-Za-z0-9_.?]/.test(code[index])) index++;
      push(start, index, 'word');
      continue;
    }

    if (/[A-Za-z0-9_.?]/.test(char)) {
      index++;
      while (index < code.length && /[A-Za-z0-9_.?]/.test(code[index])) index++;
      push(start, index, 'word');
      continue;
    }

    if ('+-*/<>=!%'.includes(char)) {
      const pair = code.slice(index, index + 2);
      push(start, index + (TWO_CHARACTER_OPERATORS.has(pair) ? 2 : 1), 'operator');
      continue;
    }

    push(start, index + 1, 'punctuation');
  }

  return tokens;
}

function isLogoNegativeLiteral(token: SourceToken): boolean {
  return token.raw === '-' && token.whitespaceBefore && !token.whitespaceAfter;
}

function isUnaryMinus(tokens: SourceToken[], index: number): boolean {
  const token = tokens[index];
  if (token.raw !== '-') return false;
  if (isLogoNegativeLiteral(token) || index === 0) return true;
  const previous = tokens[index - 1];
  return (
    previous.kind === 'operator' ||
    previous.raw === '(' ||
    previous.raw === '[' ||
    previous.raw === ','
  );
}

function separatorBetween(
  tokens: SourceToken[],
  previousIndex: number,
  currentIndex: number,
): string {
  const previous = tokens[previousIndex];
  const current = tokens[currentIndex];
  if (current.raw === ',' || current.raw === ')') return '';
  if (previous.raw === '(' || previous.raw === ',') return previous.raw === ',' ? ' ' : '';

  // Adjacency is syntax in NeedleScript: f(1) is a call while f (1) is a
  // grouped Logo argument, and xs[0] is indexing while xs [0] is not.
  if (current.raw === '(' || current.raw === '[') {
    return current.start === previous.end ? '' : ' ';
  }

  // Keep the author's inside-bracket spacing. Blocks commonly use `[ fd 10 ]`
  // on one line while list literals and indexes use `[1, 2]`.
  if (previous.raw === '[' || current.raw === ']') {
    return current.start === previous.end ? '' : ' ';
  }

  // `setxy 10 -20` contains two arguments. Adding a space after this minus
  // would instead turn it into subtraction, so preserve the glued sign.
  if (isUnaryMinus(tokens, currentIndex)) return ' ';
  if (isUnaryMinus(tokens, previousIndex)) return '';

  if (current.kind === 'operator' || previous.kind === 'operator') return ' ';
  return ' ';
}

function formatCode(code: string): {
  text: string;
  opens: number;
  closes: number;
  leadingCloses: number;
  opensClassicProcedure: boolean;
  closesClassicProcedure: boolean;
} {
  const tokens = scanCode(code);
  let text = '';
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (index > 0) text += separatorBetween(tokens, index - 1, index);
    text += token.raw;
  }

  let leadingCloses = 0;
  while (tokens[leadingCloses]?.raw === ']') leadingCloses++;
  return {
    text,
    opens: tokens.filter((token) => token.raw === '[').length,
    closes: tokens.filter((token) => token.raw === ']').length,
    leadingCloses,
    opensClassicProcedure: tokens[0]?.raw.toLowerCase() === 'to',
    closesClassicProcedure: tokens[0]?.raw.toLowerCase() === 'end',
  };
}

function indentation(level: number, tabWidth: number, useTabs: boolean): string {
  return useTabs ? '\t'.repeat(level) : ' '.repeat(level * tabWidth);
}

export function formatNeedleScriptSource(
  source: string,
  options: { tabWidth?: number; useTabs?: boolean } = {},
): string {
  const tabWidth = options.tabWidth ?? 2;
  const useTabs = options.useTabs ?? false;
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let level = 0;
  let previousWasBlank = false;

  for (const line of lines) {
    const { code, comment } = splitComment(line);
    const formatted = formatCode(code);
    const hasContent = formatted.text.length > 0 || comment.length > 0;
    if (!hasContent) {
      if (!previousWasBlank && output.length > 0) output.push('');
      previousWasBlank = true;
      continue;
    }

    const lineLevel = Math.max(
      0,
      level - formatted.leadingCloses - (formatted.closesClassicProcedure ? 1 : 0),
    );
    const content = formatted.text ? `${formatted.text}${comment ? ` ${comment}` : ''}` : comment;
    output.push(`${indentation(lineLevel, tabWidth, useTabs)}${content}`);
    level = Math.max(
      0,
      level +
        formatted.opens -
        formatted.closes +
        (formatted.opensClassicProcedure ? 1 : 0) -
        (formatted.closesClassicProcedure ? 1 : 0),
    );
    previousWasBlank = false;
  }

  while (output.at(-1) === '') output.pop();
  return output.length > 0 ? `${output.join('\n')}\n` : '';
}

const needleScriptPlugin: Plugin<NeedleScriptProgram> = {
  languages: [
    {
      name: 'NeedleScript',
      parsers: ['needlescript'],
      extensions: ['.ns'],
      vscodeLanguageIds: ['needlescript'],
    },
  ],
  parsers: {
    needlescript: {
      astFormat: 'needlescript-ast',
      parse(source) {
        // Validate lexical structure before formatting. This catches malformed
        // strings and unsupported characters without rejecting an in-progress
        // editor buffer solely because a statement is incomplete.
        tokenize(source);
        return { type: 'NeedleScriptProgram', source };
      },
      locStart: () => 0,
      locEnd: (node) => node.source.length,
    },
  },
  printers: {
    'needlescript-ast': {
      print(path, options: ParserOptions<NeedleScriptProgram>) {
        return formatNeedleScriptSource(path.node.source, {
          tabWidth: options.tabWidth,
          useTabs: options.useTabs,
        });
      },
    },
  },
};

export async function formatNeedleScript(
  source: string,
  options: { tabWidth?: number; useTabs?: boolean } = {},
): Promise<string> {
  return format(source, {
    parser: 'needlescript',
    plugins: [needleScriptPlugin],
    tabWidth: options.tabWidth ?? 2,
    useTabs: options.useTabs ?? false,
  });
}

export { needleScriptPlugin };
