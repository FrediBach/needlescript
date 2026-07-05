// ---------- Tokenizer ----------

import type { Token, TokenType } from './types.ts';
import { NeedlescriptError } from './errors.ts';

/** Compound assignment operators (statement position only — see parser). */
export const COMPOUND_ASSIGN_OPS = new Set(['+=', '-=', '*=', '/=']);

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isWordChar = (c: string) => /[A-Za-z0-9_.?]/.test(c);

  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    // Comments: ";" and "#" to end of line, plus "//" (two adjacent slashes —
    // a lone "/" is still division).
    if (c === ';' || c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ('[]()'.includes(c)) {
      tokens.push({ t: c as TokenType, line, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ t: ',', line, start: i, end: i + 1 });
      i++;
      continue;
    }
    // ".." is reserved for future syntax (a lone "." already errors below).
    if (c === '.' && src[i + 1] === '.') {
      throw new NeedlescriptError('".." is reserved for future syntax', line);
    }
    // String literals: single-quoted, must close on the same source line.
    // Four escape sequences are recognised: \' \\ \n \t — all others are
    // hard errors (loud over convenient, per the language design rule).
    if (c === "'") {
      const startLine = line;
      const startI = i;
      i++; // consume opening quote
      let str = '';
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\n') {
          throw new NeedlescriptError(`Unterminated string starting at line ${startLine}`);
        }
        if (src[i] === '\\') {
          i++;
          if (i >= src.length || src[i] === '\n') {
            throw new NeedlescriptError(`Unterminated string starting at line ${startLine}`);
          }
          const esc = src[i];
          if (esc === "'") str += "'";
          else if (esc === '\\') str += '\\';
          else if (esc === 'n') str += '\n';
          else if (esc === 't') str += '\t';
          else
            throw new NeedlescriptError(
              `Unknown escape "\\${esc}" in string — valid escapes are \\' \\\\ \\n \\t`,
              line,
            );
          i++;
        } else {
          str += src[i];
          i++;
        }
      }
      if (i >= src.length) {
        throw new NeedlescriptError(`Unterminated string starting at line ${startLine}`);
      }
      i++; // consume closing quote
      tokens.push({ t: 'string', v: str, line: startLine, start: startI, end: i });
      continue;
    }
    if ('+-*/<>=!%'.includes(c)) {
      const spBefore = i === 0 || /[\s[(]/.test(src[i - 1]);
      let op = c;
      if ((c === '<' || c === '>' || c === '!') && src[i + 1] === '=') op = c + '=';
      else if (c === '=' && src[i + 1] === '=')
        op = '=='; // == is the same comparison as =
      else if ('+-*/'.includes(c) && src[i + 1] === '=') op = c + '='; // compound assignment
      const after = i + op.length;
      if (c === '!' && op === '!') {
        // Prefix "!" is the same token as "not" (maximal munch: != was caught above).
        tokens.push({ t: 'word', v: 'not', line, start: i, end: i + 1 });
        i++;
        continue;
      }
      const spAfter = after >= src.length || /\s/.test(src[after]);
      tokens.push({
        t: 'op',
        v: op === '==' ? '=' : op,
        line,
        start: i,
        end: after,
        spBefore,
        spAfter,
      });
      i = after;
      continue;
    }
    if (isDigit(c) || (c === '.' && i + 1 < src.length && isDigit(src[i + 1]))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const v = parseFloat(src.slice(i, j));
      if (isNaN(v)) throw new NeedlescriptError(`Bad number "${src.slice(i, j)}"`, line);
      tokens.push({ t: 'num', v, line, start: i, end: j });
      i = j;
      continue;
    }
    if (c === ':') {
      let j = i + 1;
      while (j < src.length && isWordChar(src[j])) j++;
      if (j === i + 1) throw new NeedlescriptError('Expected a name after ":"', line);
      tokens.push({ t: 'var', v: src.slice(i + 1, j).toLowerCase(), line, start: i, end: j });
      i = j;
      continue;
    }
    // "@name" — a procedure reference (a value), consumed only by warp/warppath
    // and friends. One new token, one new value kind; out of the way of every
    // existing program (RFC effects §1).
    if (c === '@') {
      let j = i + 1;
      while (j < src.length && isWordChar(src[j])) j++;
      if (j === i + 1) throw new NeedlescriptError('Expected a procedure name after "@"', line);
      tokens.push({ t: 'pref', v: src.slice(i + 1, j).toLowerCase(), line, start: i, end: j });
      i = j;
      continue;
    }
    if (c === '"') {
      // Word-string rule: consume the maximal run of word characters. If the
      // immediately following character is another quote, consume it too —
      // "knit" and "knit produce the same token. The check is local and O(1),
      // so two legacy qwords on one line ( make "x 5 print "y 6 ) still lex
      // as two separate words.
      let j = i + 1;
      while (j < src.length && isWordChar(src[j])) j++;
      if (j === i + 1) {
        if (src[j] === '"') throw new NeedlescriptError('Empty string ""', line);
        throw new NeedlescriptError('Expected a name after the quote (")', line);
      }
      const v = src.slice(i + 1, j).toLowerCase();
      if (src[j] === '"') j++; // closing quote (optional, modern style)
      tokens.push({ t: 'qword', v, line, start: i, end: j });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && isWordChar(src[j])) j++;
      const w = src.slice(i, j).toLowerCase();
      // true/false are constant-folded to 1/0 — they are numbers, not names.
      if (w === 'true' || w === 'false') {
        tokens.push({ t: 'num', v: w === 'true' ? 1 : 0, line, start: i, end: j });
      } else {
        tokens.push({ t: 'word', v: w, line, start: i, end: j });
      }
      i = j;
      continue;
    }
    throw new NeedlescriptError(`Unexpected character "${c}"`, line);
  }
  return tokens;
}
