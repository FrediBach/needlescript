// ---------- Tokenizer ----------

import type { Token, TokenType } from './types.ts';
import { NeedlescriptError } from './errors.ts';

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
